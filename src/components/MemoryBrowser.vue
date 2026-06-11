<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Refresh, Search } from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'

const connectionStore = useConnectionStore()
const { t } = useI18n()

// ---------- 生命周期控制 ----------
const visible = ref(false)
async function open() {
  visible.value = true
  await loadStats()
  await loadBrowsePage(1)
}
function close() { visible.value = false }
defineExpose({ visible, open, close })

// ---------- 统计卡片 ----------
const stats = ref({
  total_files: 0,
  indexed_files: 0,
  total_chunks: 0
})
const statsLoading = ref(false)

const progressPercent = computed(() => {
  if (stats.value.total_files === 0) return 0
  return Math.round((stats.value.indexed_files / stats.value.total_files) * 100)
})

async function loadStats() {
  statsLoading.value = true
  try {
    const data = await connectionStore.fetchMemoryStats('')
    stats.value = data
  } catch {
    try {
      const { count } = await connectionStore.fetchMemoryCount()
      stats.value = { total_files: 0, indexed_files: 0, total_chunks: count }
    } catch { /* silent */ }
  } finally {
    statsLoading.value = false
  }
}

// ---------- 浏览模式（分页列表） ----------
type ChunkItem = {
  id: string
  content: string
  doc_id?: string
  parent_id?: string
  mime_type?: string
  metadata?: Record<string, any>
  chunk_meta?: { index: number }
}

const browseChunks = ref<ChunkItem[]>([])
const browsePage = ref(1)
const browseTotal = ref(0)
const browsePageSize = 10
const browseLoading = ref(false)
const isBrowseMode = ref(true) // true = 浏览模式, false = 搜索结果模式

// Helper to safely access chunk_meta properties (Vue template type narrowing issue)
function cm(item: any, key: string): any {
  return item?.chunk_meta?.[key]
}

const totalPages = computed(() => {
  if (browseTotal.value === 0) return 0
  return Math.ceil(browseTotal.value / browsePageSize)
})

async function loadBrowsePage(page: number) {
  browseLoading.value = true
  isBrowseMode.value = true
  browsePage.value = page
  try {
    const result = await connectionStore.fetchMemoryChunks(page, browsePageSize)
    browseChunks.value = result.chunks
    // Use the exact total from Count if available, otherwise estimate
    if (result.total > 0) {
      browseTotal.value = result.total
    } else {
      browseTotal.value = stats.value.total_chunks
    }
    // Print raw chunks data to console for inspection
    console.log(`[MemoryBrowser] browse page=${page} total=${result.total} chunks=`, JSON.parse(JSON.stringify(result.chunks)))
  } catch {
    browseChunks.value = []
  } finally {
    browseLoading.value = false
  }
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  loadBrowsePage(page)
}

// For paginator display — which page numbers to show
const visiblePages = computed(() => {
  const total = totalPages.value
  const current = browsePage.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = []
  pages.push(1)
  if (current > 3) pages.push('...')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
})

// ---------- 查询 ----------
const queryText = ref('')
const searching = ref(false)
const searchResults = ref<Array<{ id: string; content: string; score: number; created_at: string }>>([])
const errorText = ref('')
const expandedIds = ref<Set<string>>(new Set())

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}

async function doSearch() {
  const q = queryText.value.trim()
  if (!q) return
  searching.value = true
  errorText.value = ''
  isBrowseMode.value = false
  try {
    searchResults.value = await connectionStore.queryMemory(q, 10)
  } catch (e: any) {
    errorText.value = e.message || String(e)
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

function clearSearch() {
  queryText.value = ''
  expandedIds.value.clear()
  // Reload browse view
  loadBrowsePage(1)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') doSearch()
}

// ---------- 过滤（仅搜索结果） ----------
const filterText = ref('')
const filteredResults = computed(() => {
  const f = filterText.value.trim().toLowerCase()
  if (!f) return searchResults.value
  return searchResults.value.filter(r =>
    r.content.toLowerCase().includes(f) ||
    r.id.toLowerCase().includes(f)
  )
})

// ---------- 重置 ----------
watch(visible, (v) => {
  if (!v) {
    queryText.value = ''
    searchResults.value = []
    errorText.value = ''
    filterText.value = ''
    expandedIds.value.clear()
    browseChunks.value = []
    browseTotal.value = 0
    browsePage.value = 1
    isBrowseMode.value = true
  }
})

// Auto-refresh interval
let refreshTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  refreshTimer = setInterval(() => {
    if (visible.value) loadStats()
  }, 30_000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <Teleport to="body">
    <transition name="fade-scale">
      <div v-if="visible" class="mb-overlay">
        <!-- Header bar (匹配 GraphViewer 风格) -->
        <header class="mb-header">
          <div class="mb-header-left">
            <button class="back-btn" @click="close">
              <el-icon><ArrowLeft /></el-icon>
              {{ t('memoryBrowser.back') }}
            </button>
            <h1 class="mb-title">{{ t('memoryBrowser.title') }}</h1>
          </div>
          <div class="mb-header-right">
            <button class="header-action-btn" @click="loadStats" :title="t('memoryBrowser.refresh')">
              <el-icon><Refresh /></el-icon>
            </button>
            <button class="header-close-btn" @click="close">&times;</button>
          </div>
        </header>

        <!-- Body: 垂直三部分 -->
        <div class="mb-body">
          <!-- ==================== Part 1: 统计卡片区 ==================== -->
          <section class="mb-stats-section">
            <div class="stats-card-row">
              <!-- 待索引文件 -->
              <div class="stat-card">
                <span class="stat-label">{{ t('memoryBrowser.statsPending') }}</span>
                <span class="stat-value pending-value">
                  {{ statsLoading ? '...' : Math.max(0, stats.total_files - stats.indexed_files) }}
                </span>
              </div>
              <!-- 已索引文件 -->
              <div class="stat-card">
                <span class="stat-label">{{ t('memoryBrowser.statsIndexed') }}</span>
                <span class="stat-value indexed-value">
                  {{ statsLoading ? '...' : stats.indexed_files }}
                </span>
              </div>
              <!-- 记忆条目总数 -->
              <div class="stat-card">
                <span class="stat-label">{{ t('memoryBrowser.statsTotalChunks') }}</span>
                <span class="stat-value chunks-value">
                  {{ statsLoading ? '...' : stats.total_chunks }}
                </span>
              </div>
            </div>
            <!-- 进度条 -->
            <div class="progress-area" v-if="stats.total_files > 0">
              <div class="progress-header">
                <span class="progress-label">{{ t('memoryBrowser.statsProgress') }}</span>
                <span class="progress-pct">{{ progressPercent }}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
              </div>
            </div>
          </section>

          <!-- ==================== Part 2: 查询输入区 ==================== -->
          <section class="mb-search-section">
            <div class="search-row">
              <input
                v-model="queryText"
                type="text"
                :placeholder="t('memoryBrowser.searchPlaceholder')"
                class="mb-search-input"
                @keydown="onKeydown"
                autofocus
              />
              <button class="mb-search-btn" @click="doSearch" :disabled="searching || !queryText.trim()">
                <el-icon><Search /></el-icon>
                <span>{{ searching ? t('memoryBrowser.loading') : t('memoryBrowser.searchBtn') }}</span>
              </button>
              <!-- Clear search button (only visible in search mode) -->
              <button v-if="!isBrowseMode" class="mb-clear-btn" @click="clearSearch" :title="t('memoryBrowser.backToBrowse')">
                {{ t('memoryBrowser.clear') }}
              </button>
            </div>
            <!-- 过滤输入（仅搜索结果模式显示） -->
            <input
              v-model="filterText"
              type="text"
              :placeholder="t('memoryBrowser.filterPlaceholder')"
              class="mb-filter-input"
              v-if="!isBrowseMode && searchResults.length > 0"
            />
          </section>

          <!-- ==================== Part 3: 结果列表 ==================== -->
          <section class="mb-results-section">
            <!-- 浏览模式：加载中 -->
            <div v-if="isBrowseMode && browseLoading" class="mb-empty-state">
              <div class="spinner"></div>
              <p>{{ t('memoryBrowser.loading') }}</p>
            </div>

            <!-- 浏览模式：无数据 -->
            <div v-else-if="isBrowseMode && browseChunks.length === 0 && !browseLoading" class="mb-empty-state">
              <p class="mb-hint">{{ t('memoryBrowser.noMemories') }}</p>
            </div>

            <!-- 搜索模式：加载中 -->
            <div v-else-if="searching" class="mb-empty-state">
              <div class="spinner"></div>
              <p>{{ t('memoryBrowser.loading') }}</p>
            </div>

            <!-- 搜索模式：错误 -->
            <div v-else-if="!isBrowseMode && errorText" class="mb-error-state">
              <p class="mb-error-text">{{ t('memoryBrowser.error') }}: {{ errorText }}</p>
            </div>

            <!-- 搜索模式：无结果 -->
            <div v-else-if="!isBrowseMode && searchResults.length > 0 && filteredResults.length === 0" class="mb-empty-state">
              <p>{{ t('memoryBrowser.noResults') }}</p>
            </div>

            <!-- 搜索模式：初始提示（未搜索且无浏览数据） -->
            <div v-else-if="!isBrowseMode && searchResults.length === 0 && !errorText" class="mb-empty-state">
              <p class="mb-hint">{{ t('memoryBrowser.searchHint') }}</p>
            </div>

            <!-- 浏览模式：结果列表（带分页） -->
            <div v-else-if="isBrowseMode && browseChunks.length > 0" class="mb-results-list">
              <div
                v-for="(item, idx) in browseChunks"
                :key="item.id"
                class="mb-result-item"
              >
                <div class="mb-item-header" @click="toggleExpand(item.id)">
                  <div class="mb-item-summary">
                    <span class="mb-idx">#{{ (browsePage - 1) * browsePageSize + idx + 1 }}</span>
                    <span class="mb-doc-id" :title="item.doc_id || ''">
                      {{ item.doc_id ? item.doc_id.split('/').pop() || item.doc_id : '(no doc)' }}
                    </span>
                    <span class="mb-badge">mime={{ item.mime_type || '?' }}</span>
                    <span v-if="item.chunk_meta" class="mb-badge">chunk[{{ item.chunk_meta.index }}]</span>
                    <span v-if="item.chunk_meta" class="mb-badge">pos={{ cm(item,'start_pos') }}-{{ cm(item,'end_pos') }}</span>
                    <span v-if="cm(item,'heading_level') > 0" class="mb-badge">
                      h{{ cm(item,'heading_level') }}:{{ (cm(item,'heading_path') || []).join('/') }}
                    </span>
                    <span class="mb-id-trunc" :title="item.id">{{ item.id.slice(0, 16) }}…</span>
                    <span class="mb-toggle">{{ expandedIds.has(item.id) ? '▲' : '▼' }}</span>
                  </div>
                  <div v-if="item.parent_id" class="mb-item-meta-line">
                    parent: {{ item.parent_id }}
                  </div>
                </div>
                <transition name="expand">
                  <div v-show="expandedIds.has(item.id)" class="mb-item-body">
                    <div class="mb-raw-meta">
                      <strong>metadata:</strong>
                      <pre>{{ JSON.stringify(item.metadata || {}, null, 2) }}</pre>
                    </div>
                    <pre class="mb-content">{{ item.content }}</pre>
                  </div>
                </transition>
              </div>

              <!-- === 分页器 === -->
              <div v-if="totalPages > 1" class="mb-paginator">
                <button
                  class="page-btn"
                  :disabled="browsePage <= 1"
                  @click="goToPage(browsePage - 1)"
                >&laquo;</button>
                <div v-for="p in visiblePages" :key="typeof p === 'string' ? 'e' + p : p" class="page-wrapper">
                  <span v-if="typeof p === 'string'" class="page-ellipsis">...</span>
                  <button
                    v-else
                    class="page-btn"
                    :class="{ active: p === browsePage }"
                    @click="goToPage(p)"
                  >{{ p }}</button>
                </div>
                <button
                  class="page-btn"
                  :disabled="browsePage >= totalPages"
                  @click="goToPage(browsePage + 1)"
                >&raquo;</button>
              </div>
            </div>

            <!-- 搜索模式：搜索结果列表 -->
            <div v-else-if="!isBrowseMode && filteredResults.length > 0" class="mb-results-list">
              <div
                v-for="(item, idx) in filteredResults"
                :key="item.id"
                class="mb-result-item"
              >
                <div class="mb-item-header" @click="toggleExpand(item.id)">
                  <span class="mb-idx">#{{ idx + 1 }}</span>
                  <span class="mb-score" :class="{ high: item.score > 0.8, mid: item.score > 0.5 }">
                    {{ t('memoryBrowser.matchScore') }}: {{ (item.score * 100).toFixed(1) }}%
                  </span>
                  <span class="mb-time">{{ new Date(item.created_at).toLocaleString() }}</span>
                  <span class="mb-toggle">{{ expandedIds.has(item.id) ? '▲' : '▼' }}</span>
                </div>
                <transition name="expand">
                  <div v-show="expandedIds.has(item.id)" class="mb-item-body">
                    <pre class="mb-content">{{ item.content }}</pre>
                  </div>
                </transition>
              </div>
            </div>
          </section>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* ── Overlay (全屏, 匹配 GraphViewer 风格) ── */
.mb-overlay {
  position: fixed; inset: 0; z-index: 8000;
  display: flex; flex-direction: column;
  background: var(--bg-primary);
}

/* ── Header ── */
.mb-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 20px;
  min-height: 48px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.mb-header-left {
  display: flex; align-items: center; gap: 12px;
}
.back-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 7px; cursor: pointer;
  transition: all .15s;
}
.back-btn:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,.08);
  border-color: rgba(255,255,255,.18);
}
.mb-title {
  font-size: 16px; font-weight: 700; color: var(--text-primary);
  margin: 0;
}
.mb-header-right {
  display: flex; align-items: center; gap: 6px;
}
.header-action-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 16px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 7px; cursor: pointer;
  transition: all .15s;
}
.header-action-btn:hover {
  color: var(--accent-cyan);
  background: rgba(6,182,212,.08);
  border-color: rgba(6,182,212,.2);
}
.header-close-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: var(--text-muted);
  background: none; border: none; border-radius: 6px; cursor: pointer;
}
.header-close-btn:hover { background: rgba(255,255,255,.08); color: var(--text-primary); }

/* ── Body ── */
.mb-body {
  flex: 1;
  display: flex; flex-direction: column;
  overflow: hidden;
  padding: 20px 28px;
  gap: 20px;
}

/* ==================== Part 1: Stats Cards ==================== */
.mb-stats-section {
  flex-shrink: 0;
  display: flex; flex-direction: column;
  gap: 12px;
}
.stats-card-row {
  display: flex; gap: 12px;
}
.stat-card {
  flex: 1;
  display: flex; flex-direction: column;
  gap: 6px;
  padding: 14px 18px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  min-width: 0;
}
.stat-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--text-muted);
}
.stat-value {
  font-size: 28px; font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
  line-height: 1.1;
}
.pending-value { color: #f59e0b; }
.indexed-value { color: #10b981; }
.chunks-value { color: #8b5cf6; }

.progress-area {
  display: flex; flex-direction: column;
  gap: 6px;
  padding: 12px 18px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}
.progress-header {
  display: flex; justify-content: space-between; align-items: center;
}
.progress-label {
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
}
.progress-pct {
  font-size: 12px; font-weight: 700; color: #8b5cf6;
  font-family: 'JetBrains Mono', monospace;
}
.progress-track {
  width: 100%; height: 8px;
  background: rgba(255,255,255,.06);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #8b5cf6, #06b6d4);
  transition: width .5s ease;
}

/* ==================== Part 2: Search ==================== */
.mb-search-section {
  flex-shrink: 0;
  display: flex; flex-direction: column;
  gap: 8px;
}
.search-row {
  display: flex; gap: 8px;
}
.mb-search-input {
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text-primary);
  background: rgba(255,255,255,.04);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  transition: border-color .15s;
}
.mb-search-input:focus { border-color: #8b5cf6; }
.mb-search-input::placeholder { color: #64748b; }
.mb-search-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 20px;
  font-size: 13px; font-weight: 600;
  color: #fff; background: #8b5cf6;
  border: none; border-radius: 8px; cursor: pointer;
  transition: background .15s;
  white-space: nowrap;
}
.mb-search-btn:hover:not(:disabled) { background: #7c3aed; }
.mb-search-btn:disabled { opacity: .5; cursor: not-allowed; }

.mb-clear-btn {
  padding: 10px 16px;
  font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  background: rgba(255,255,255,.04);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.mb-clear-btn:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,.08);
}

.mb-filter-input {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  background: rgba(255,255,255,.03);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  outline: none;
  transition: border-color .15s;
}
.mb-filter-input:focus { border-color: #8b5cf6; }
.mb-filter-input::placeholder { color: #64748b; }

/* ==================== Part 3: Results ==================== */
.mb-results-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.mb-empty-state {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
  gap: 12px;
}
.mb-hint { color: #64748b; font-size: 13px; }
.mb-error-state {
  display: flex; align-items: center; justify-content: center;
  height: 100%;
}
.mb-error-text { color: #ef4444; font-size: 13px; }

.spinner {
  width: 24px; height: 24px;
  border: 2px solid rgba(139,92,246,.2);
  border-top-color: #8b5cf6;
  border-radius: 50%;
  animation: spin .6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Result Items ── */
.mb-results-list {
  display: flex; flex-direction: column;
  gap: 8px;
}
.mb-result-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.mb-item-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background .12s;
}
.mb-item-header:hover { background: rgba(139,92,246,.05); }
.mb-idx {
  font-size: 11px; font-weight: 700; color: #8b5cf6;
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}
.mb-score {
  font-size: 11.5px; font-weight: 500; font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
  padding: 1px 6px; border-radius: 4px; background: rgba(148,163,184,.08);
}
.mb-score.high { color: #10b981; background: rgba(16,185,129,.12); }
.mb-score.mid { color: #f59e0b; background: rgba(245,158,11,.12); }
.mb-time {
  font-size: 11px; color: #64748b; margin-left: auto;
}
.mb-doc-id {
  font-size: 11px; color: #06b6d4;
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 180px; flex-shrink: 0;
}
.mb-badge {
  flex-shrink: 0;
  font-size: 10px; padding: 1px 6px; font-weight: 600;
  border-radius: 3px;
  background: rgba(100,116,139,.12);
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
}
.mb-id-trunc {
  flex-shrink: 0;
  font-size: 10px; color: #64748b;
  font-family: 'JetBrains Mono', monospace;
}
.mb-item-summary {
  display: flex; align-items: center; gap: 8px;
  flex-wrap: wrap;
}
.mb-item-meta-line {
  margin-top: 4px;
  font-size: 11px; color: #64748b; font-family: monospace;
}
.mb-raw-meta {
  margin-bottom: 8px; padding: 8px; border-radius: 4px;
  background: rgba(0,0,0,.15);
  font-size: 11px; color: var(--text-secondary);
  max-height: 200px; overflow: auto;
}
.mb-raw-meta pre { margin: 4px 0 0; white-space: pre-wrap; word-break: break-all; font-size: 11px; }
.mb-toggle {
  font-size: 10px; color: #8b5cf6; transition: transform .15s;
  margin-left: auto;
  flex-shrink: 0;
}

.mb-item-body {
  padding: 0 14px 12px;
}
.mb-content {
  margin: 0; padding: 10px 12px;
  font-size: 12px; line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap; word-break: break-word;
  background: rgba(255,255,255,.02);
  border: 1px solid rgba(255,255,255,.05);
  border-radius: 6px;
  max-height: 240px; overflow-y: auto;
}

/* ==================== Paginator ==================== */
.mb-paginator {
  display: flex; align-items: center; justify-content: center;
  gap: 4px;
  padding: 12px 0 4px;
  flex-shrink: 0;
}
.page-btn {
  min-width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  padding: 0 8px;
  font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  background: rgba(255,255,255,.03);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all .12s;
}
.page-btn:hover:not(:disabled):not(.active) {
  color: var(--text-primary);
  background: rgba(255,255,255,.07);
  border-color: rgba(255,255,255,.15);
}
.page-btn.active {
  color: #fff;
  background: #8b5cf6;
  border-color: #8b5cf6;
}
.page-btn:disabled {
  opacity: .3;
  cursor: not-allowed;
}
.page-wrapper {
  display: inline-flex;
}
.page-ellipsis {
  width: 24px; text-align: center;
  color: var(--text-muted); font-size: 13px;
  align-self: center;
}

/* ── Transitions ── */
.fade-scale-enter-active { transition: opacity .2s ease, transform .2s ease; }
.fade-scale-leave-active { transition: opacity .15s ease, transform .15s ease; }
.fade-scale-enter-from { opacity: 0; transform: scale(.97); }
.fade-scale-leave-to { opacity: 0; transform: scale(.97); }

.expand-enter-active, .expand-leave-active { transition: all .2s ease; overflow: hidden; }
.expand-enter-from, .expand-leave-to { opacity: 0; max-height: 0; }
</style>
