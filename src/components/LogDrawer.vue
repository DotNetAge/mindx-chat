<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useConnectionStore } from '../stores/connectionStore'

const connectionStore = useConnectionStore()

const visible = ref(false)
const fullscreen = ref(false)

// 逆向分页状态：lines[0] 是最新，向上滚动加载更旧的
const lines = ref<string[]>([])
const totalLines = ref(0)
const currentOffset = ref(0) // 已从末尾跳过的行数
const currentPageIndex = ref(0) // 当前所在页码（从0开始）
const hasMore = ref(true)
const loading = ref(false)
const loadingMore = ref(false) // 向上滚动加载更多
const error = ref('')

const logContainer = ref<HTMLElement | null>(null)
let savedScrollTop = 0

let refreshTimer: ReturnType<typeof setInterval> | null = null

const PAGE_SIZE = 100

// 日志流切换：main = mindx.log, error = error.log
type LogStream = 'main' | 'error'
const currentStream = ref<LogStream>('main')
const STREAM_OPTIONS: { value: LogStream; label: string; title: string }[] = [
  { value: 'main', label: '主日志', title: '~/.mindx/logs/mindx.log' },
  { value: 'error', label: '错误日志', title: '~/.mindx/logs/error.log' }
]

// 各流的行数（用于标签徽章）
const counts = ref<Record<LogStream, { lines: number; bytes: number; exists: 0 | 1 }>>({
  main: { lines: 0, bytes: 0, exists: 0 },
  error: { lines: 0, bytes: 0, exists: 0 }
})
let countTimer: ReturnType<typeof setInterval> | null = null
const COUNT_REFRESH_MS = 15000 // 15 秒

// 关键字过滤（客户端，仅过滤已加载的 lines）
const filter = ref('')
function applyFilter(): string[] {
  const q = filter.value.trim().toLowerCase()
  if (!q) return lines.value
  return lines.value.filter((l) => l.toLowerCase().includes(q))
}
function clearFilter() { filter.value = '' }

async function loadPage(offset: number): Promise<{ lines: string[]; total: number; returned: number; offset: number; has_more: boolean; path: string; stream: LogStream }> {
  console.log(`[LogDrawer] 📥 loadPage(offset=${offset}, limit=${PAGE_SIZE}, stream=${currentStream.value})`)
  const res = await connectionStore.fetchLogs(offset, PAGE_SIZE, currentStream.value)
  console.log(`[LogDrawer] 📥 loadPage response:`, JSON.parse(JSON.stringify(res)))
  return res
}

// 首次加载（最新 N 行）
async function loadLatest() {
  loading.value = true
  error.value = ''
  try {
    const res = await loadPage(0)
    // 过滤掉末尾空行（Split 会产出多余空串）
    const clean = res.lines.filter((l: string) => l !== '')
    lines.value = clean.reverse() // 最新在前（数组头部）
    totalLines.value = res.total
    currentOffset.value = res.returned
    currentPageIndex.value = 0
    hasMore.value = res.has_more
    console.log(`[LogDrawer] ✅ loadLatest done: total=${totalLines.value}, loaded=${lines.value.length}, offset=${currentOffset.value}, hasMore=${hasMore.value}`)
    await nextTick()
    scrollToBottom()
  } catch (e: any) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}

// 向上滚动 → 加载更早的日志（prepend 到数组头部）
async function loadOlder() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  console.log(`[LogDrawer] ⬆ loadOlder start: offset=${currentOffset.value}, pageIndex=${currentPageIndex.value}, currentLines=${lines.value.length}`)
  try {
    const res = await loadPage(currentOffset.value)
    if (res.returned > 0) {
      const container = logContainer.value
      const prevScrollHeight = container ? container.scrollHeight : 0

      const olderLines = res.lines.reverse()
      lines.value = [...olderLines, ...lines.value]

      currentOffset.value += res.returned
      currentPageIndex.value++
      hasMore.value = res.has_more

      console.log(`[LogDrawer] ⬆ loadOlder done: added=${res.returned}, totalLines=${lines.value.length}, newOffset=${currentOffset.value}, newPageIndex=${currentPageIndex.value}, hasMore=${hasMore.value}`)

      await nextTick()
      if (container) {
        container.scrollTop = container.scrollHeight - prevScrollHeight
      }
    } else {
      console.log(`[LogDrawer] ⬆ loadOlder: no more data (returned=0)`)
    }
  } catch (e: any) {
    console.error('[LogDrawer] loadOlder error:', e)
  } finally {
    loadingMore.value = false
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (!logContainer.value) return
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  })
}

// 滚动事件：接近顶部时加载更多
function onScroll(e: Event) {
  const el = e.target as HTMLElement
  console.log(`[LogDrawer] 📜 onScroll: scrollTop=${el.scrollTop}, scrollHeight=${el.scrollHeight}, clientHeight=${el.clientHeight}, loadingMore=${loadingMore.value}, hasMore=${hasMore.value}`)
  if (el.scrollTop < 100 && !loadingMore.value && hasMore.value) {
    loadOlder()
  }
}

// 切换日志流 → 重置状态并重新加载
async function switchStream(stream: LogStream) {
  if (currentStream.value === stream || !visible.value) return
  console.log(`[LogDrawer] 🔀 switchStream: ${currentStream.value} → ${stream}`)
  currentStream.value = stream
  lines.value = []
  totalLines.value = 0
  currentOffset.value = 0
  currentPageIndex.value = 0
  hasMore.value = true
  await loadLatest()
}

// 拉取各日志流的最新行数（用于徽章）
async function refreshCounts() {
  if (!visible.value) return
  try {
    const res = await connectionStore.fetchLogCounts()
    if (res && res.counts) {
      const next = { ...counts.value }
      if (res.counts.main) next.main = res.counts.main
      if (res.counts.error) next.error = res.counts.error
      counts.value = next
      console.log(`[LogDrawer] 🔢 refreshCounts: main=${next.main.lines} error=${next.error.lines}`)
    }
  } catch (e) {
    console.warn('[LogDrawer] refreshCounts failed:', e)
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`
}

// 打开/关闭 → 启动/停止定时器
watch(visible, async (v) => {
  if (v) {
    lines.value = []
    currentOffset.value = 0
    currentPageIndex.value = 0
    hasMore.value = true
    await loadLatest()
    await refreshCounts()
    // 每10秒自动刷新 — 只追加新行到头部，不丢弃已加载的分页数据
    refreshTimer = setInterval(async () => {
      if (!visible.value || loading.value) return

      try {
        const res = await loadPage(0)
        const newLines = res.lines.filter((l: string) => l !== '').reverse()

        if (newLines.length > 0 && lines.value.length > 0 && newLines[0] !== lines.value[0]) {
          // 找出真正新增的行数（从头部开始对比）
          let newCount = 0
          for (let i = 0; i < newLines.length; i++) {
            if (i >= lines.value.length || newLines[i] !== lines.value[i]) {
              newCount = newLines.length - i
              break
            }
          }

          if (newCount > 0) {
            const trulyNew = newLines.slice(0, newCount)
            lines.value = [...trulyNew, ...lines.value]
            currentOffset.value += newCount
            currentPageIndex.value = 0
            hasMore.value = res.has_more
            totalLines.value = res.total

            console.log(`[LogDrawer] 🔄 auto-refresh: appended ${newCount} new lines at top, total=${lines.value.length}, offset=${currentOffset.value}`)
          } else {
            console.log(`[LogDrawer] 🔄 auto-refresh: new data but 0 new lines (unexpected)`)
          }
        }
      } catch (_) { /* ignore refresh errors */ }
    }, 10000)
    // 行数徽章定时刷新
    countTimer = setInterval(refreshCounts, COUNT_REFRESH_MS)
  } else {
    fullscreen.value = false
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    if (countTimer) {
      clearInterval(countTimer)
      countTimer = null
    }
  }
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (countTimer) {
    clearInterval(countTimer)
    countTimer = null
  }
})

// 下载当前日志
function downloadCurrent() {
  console.log(`[LogDrawer] ⬇ download: stream=${currentStream.value}`)
  connectionStore.triggerLogDownload(currentStream.value)
}

// 清空日志
const showConfirmClear = ref(false)
async function confirmClear() {
  showConfirmClear.value = false
  try {
    await connectionStore.clearLogs(true)
    lines.value = []
    totalLines.value = 0
    currentOffset.value = 0
    currentPageIndex.value = 0
    hasMore.value = false
  } catch (e: any) {
    error.value = e.message || String(e)
  }
}

function open() { visible.value = true }
function close() { visible.value = false }

defineExpose({ visible, open, close })
</script>

<template>
  <Teleport to="body">
    <!-- 底部抽屉 -->
    <transition name="drawer">
      <div v-if="visible" class="log-drawer" :class="{ fullscreen }">
        <!-- 工具栏 -->
        <div class="drawer-toolbar">
          <span class="toolbar-title">📋 日志终端</span>

          <!-- 日志流切换器 -->
          <div class="stream-switcher" role="tablist" aria-label="日志流">
            <button
              v-for="opt in STREAM_OPTIONS"
              :key="opt.value"
              class="stream-tab"
              :class="{ active: currentStream === opt.value }"
              :title="opt.title"
              role="tab"
              :aria-selected="currentStream === opt.value"
              @click="switchStream(opt.value)"
            >
              {{ opt.label }}
              <span
                v-if="counts[opt.value] && counts[opt.value].lines > 0"
                class="tab-badge"
                :class="{ error: opt.value === 'error' }"
                :title="`${counts[opt.value].lines} 行 / ${formatBytes(counts[opt.value].bytes)}`"
              >
                {{ counts[opt.value].lines }}
              </span>
            </button>
          </div>

          <span class="toolbar-info" v-if="totalLines">{{ totalLines }} 行</span>
          <span class="toolbar-info" v-if="currentOffset > 0">第{{ currentPageIndex }}页</span>

          <!-- 关键字过滤 -->
          <div class="filter-box">
            <input
              v-model="filter"
              type="text"
              class="filter-input"
              placeholder="🔍 过滤当前已加载的日志…"
              spellcheck="false"
            />
            <button
              v-if="filter"
              class="filter-clear"
              @click="clearFilter"
              title="清除过滤"
            >✕</button>
            <span v-if="filter" class="filter-info">
              {{ applyFilter().length }} / {{ lines.length }}
            </span>
          </div>

          <div class="toolbar-actions">
            <button class="toolbar-btn" @click="loadOlder" :disabled="!hasMore || loadingMore" title="加载上一页">
              ◀ 上一页
            </button>
            <button class="toolbar-btn" @click="downloadCurrent" :title="`下载 ${currentStream === 'error' ? 'error.log' : 'mindx.log'}`">
              ⬇
            </button>
            <button class="toolbar-btn" @click="fullscreen = !fullscreen" :title="fullscreen ? '退出全屏' : '全屏'">
              {{ fullscreen ? '⤓' : '⤢' }}
            </button>
            <button class="toolbar-btn danger" @click="showConfirmClear = true" title="清空日志">🗑</button>
            <button class="toolbar-btn close" @click="visible = false" title="关闭">✕</button>
          </div>
        </div>

        <!-- 终端内容区 -->
        <div class="terminal-body" ref="logContainer" @scroll="onScroll">
          <!-- 加载更多指示器（顶部） -->
          <div v-if="loadingMore" class="load-more-top">⏳ 加载更早日志...</div>
          <div v-else-if="!hasMore && lines.length >= totalLines && totalLines > 0" class="load-more-top done">— 已到最早 —</div>

          <!-- 加载中 -->
          <div v-if="loading && !lines.length" class="terminal-loading">加载中...</div>
          <pre v-else-if="!error" class="terminal-content"><template v-for="(line, idx) in lines" :key="idx">{{ line }}
</template></pre>
          <div v-else class="terminal-error">{{ error }}</div>
        </div>
      </div>
    </transition>

    <!-- 清空确认对话框 -->
    <transition name="modal-fade">
      <div v-if="showConfirmClear" class="confirm-overlay" @click.self="showConfirmClear = false">
        <div class="confirm-dialog">
          <h4>⚠️ 确认清空日志</h4>
          <p>此操作将永久删除 <code>~/.mindx/logs/mindx.log</code> 的全部内容，且不可恢复。</p>
          <p>确定要继续吗？</p>
          <div class="confirm-actions">
            <button class="btn-cancel" @click="showConfirmClear = false">取消</button>
            <button class="btn-danger" @click="confirmClear">确认清空</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* ===== 抽屉 ===== */
.log-drawer {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 55vh;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  background: #0d1117;
  border-top: 1px solid #30363d;
  box-shadow: 0 -8px 32px rgba(0,0,0,.5);
}
.log-drawer.fullscreen { top: 0; height: 100vh; }

/* 工具栏 */
.drawer-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
}
.toolbar-title { font-size: 13px; font-weight: 600; color: #c9d1d9; }
.toolbar-info { font-size: 11px; color: #6e7681; font-family: monospace; }
.toolbar-actions { margin-left: auto; display: flex; gap: 4px; }

/* 日志流切换器 */
.stream-switcher {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
}
.stream-tab {
  padding: 3px 10px;
  font-size: 11.5px;
  font-weight: 500;
  color: #8b949e;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.stream-tab:hover { color: #c9d1d9; }
.stream-tab.active {
  background: #21262d;
  color: #c9d1d9;
  box-shadow: 0 0 0 1px #30363d;
}
.tab-badge {
  display: inline-block;
  margin-left: 6px;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  color: #c9d1d9;
  background: #30363d;
  border-radius: 8px;
}
.tab-badge.error {
  color: #f85149;
  background: rgba(248, 81, 73, 0.15);
}

/* 关键字过滤 */
.filter-box {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  max-width: 320px;
  position: relative;
}
.filter-input {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
  color: #c9d1d9;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 5px;
  outline: none;
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  transition: border-color .15s;
}
.filter-input:focus { border-color: #58a6ff; }
.filter-input::placeholder { color: #484f58; }
.filter-clear {
  position: absolute;
  right: 56px;
  height: 18px;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #8b949e;
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}
.filter-clear:hover { color: #c9d1d9; background: #21262d; }
.filter-info {
  font-size: 10.5px;
  color: #6e7681;
  font-family: monospace;
  white-space: nowrap;
}
.toolbar-btn {
  height: 28px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: #8b949e;
  background: none; border: 1px solid #30363d; border-radius: 5px;
  cursor: pointer; transition: all .15s; white-space: nowrap;
  padding: 0 10px;
}
.toolbar-btn:hover { background: #21262d; color: #c9d1d9; }
.toolbar-btn:disabled { opacity: .4; cursor: default; }
.toolbar-btn.danger:hover { background: rgba(248,81,73,.15); color: #f85149; border-color: #f85149; }
.toolbar-btn.close:hover { background: rgba(248,81,73,.2); color: #fff; }

/* 终端内容 */
.terminal-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 10px 16px;
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  font-size: 12px; line-height: 1.55;
  color: #c9d1d9;
  background: #0d1117;
}
.terminal-content {
  margin: 0; white-space: pre-wrap; word-break: break-all;
}

/* 加载指示器 */
.load-more-top {
  text-align: center; padding: 8px 0;
  font-size: 11.5px; color: #6e7681;
}
.load-more-top.done { color: #484f58; }

.terminal-loading, .terminal-error { color: #6e7681; padding: 20px; }
.terminal-error { color: #f85149; }

/* ===== 动画 ===== */
.drawer-enter-active { transition: transform .3s ease-out, opacity .25s ease-out; }
.drawer-leave-active { transition: transform .2s ease-in, opacity .18s ease-in; }
.drawer-enter-from { transform: translateY(100%); opacity: 0; }
.drawer-leave-to { transform: translateY(100%); opacity: 0; }

/* 确认对话框 */
.confirm-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
}
.confirm-dialog {
  width: 400px; max-width: 90vw;
  padding: 20px 24px;
  background: var(--bg-card,#1a1b2e);
  border: 1px solid var(--border-color,rgba(255,255,255,.1));
  border-radius: 10px; box-shadow: 0 16px 48px rgba(0,0,0,.4);
}
.confirm-dialog h4 { margin: 0 0 10px; color: #f85149; font-size: 14px; }
.confirm-dialog p { margin: 6px 0; font-size: 13px; color: var(--text-secondary,#94a3b8); line-height: 1.5; }
.confirm-dialog code { background: rgba(248,81,73,.12); color: #f85149; padding: 1px 5px; border-radius: 3px; font-size: 11.5px; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.btn-cancel {
  padding: 5px 14px; font-size: 12px; color: var(--text-secondary);
  background: transparent; border: 1px solid var(--border-color,rgba(255,255,255,.15));
  border-radius: 5px; cursor: pointer;
}
.btn-cancel:hover { background: rgba(255,255,255,.06); }
.btn-danger {
  padding: 5px 14px; font-size: 12px; color: #fff;
  background: #da3633; border: none; border-radius: 5px; cursor: pointer;
}
.btn-danger:hover { background: #b62324; }

.modal-fade-enter-active { transition: opacity .2s ease-out; }
.modal-fade-leave-active { transition: opacity .15s ease-in; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
