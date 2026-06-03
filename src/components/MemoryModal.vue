<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConnectionStore } from '../stores/connectionStore'

const connectionStore = useConnectionStore()

const visible = ref(false)
const queryText = ref('')
const searching = ref(false)
const results = ref<Array<{ id: string; content: string; score: number; created_at: string }>>([])
const error = ref('')

// 每个结果的展开状态
const expandedIds = ref<Set<string>>(new Set())

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id)
}

async function doSearch() {
  const q = queryText.value.trim()
  if (!q) { results.value = []; return }
  searching.value = true; error.value = ''
  try {
    results.value = await connectionStore.queryMemory(q, 5)
  } catch (e: any) {
    error.value = e.message || String(e)
    results.value = []
  } finally {
    searching.value = false
  }
}

// 回车提交
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') doSearch()
}

watch(visible, (v) => {
  if (!v) { queryText.value = ''; results.value = []; error.value = '' }
})

function open() { visible.value = true }
function close() { visible.value = false }

defineExpose({ visible, open, close })
</script>

<template>
  <!-- 触发按钮由 ChatArea Header 控制 -->
  <Teleport to="body">
    <transition name="modal">
      <div v-if="visible" class="memory-modal-overlay" @click.self="visible = false">
        <div class="memory-modal">
          <!-- 头部 -->
          <div class="mm-header">
            <h3>🧠 长期记忆查询</h3>
            <button class="mm-close" @click="visible = false">&times;</button>
          </div>

          <!-- 搜索栏 -->
          <div class="mm-search">
            <input
              v-model="queryText"
              type="text"
              placeholder="输入关键词搜索记忆..."
              class="mm-input"
              @keydown="onKeydown"
              autofocus
            />
            <button class="mm-search-btn" @click="doSearch" :disabled="searching || !queryText.trim()">
              {{ searching ? '...' : '搜索' }}
            </button>
          </div>

          <!-- 结果列表 -->
          <div class="mm-results">
            <!-- 加载中 -->
            <div v-if="searching" class="mm-empty">搜索中...</div>

            <!-- 错误 -->
            <div v-else-if="error" class="mm-error">{{ error }}</div>

            <!-- 空状态 -->
            <div v-else-if="!results.length && queryText.trim()" class="mm-empty">
              未找到匹配的记忆条目
            </div>
            <div v-else-if="!results.length && !queryText.trim()" class="mm-hint">
              输入关键词后按回车或点击搜索
            </div>

            <!-- 结果项 -->
            <template v-else>
              <div
                v-for="(item, idx) in results"
                :key="item.id"
                class="mm-item"
              >
                <div class="mm-item-header" @click="toggleExpand(item.id)">
                  <span class="mm-idx">#{{ idx + 1 }}</span>
                  <span class="mm-score" :class="{ high: item.score > 0.8, mid: item.score > 0.5 }">
                    匹配度 {{ (item.score * 100).toFixed(1) }}%
                  </span>
                  <span class="mm-time">{{ new Date(item.created_at).toLocaleString() }}</span>
                  <span class="mm-toggle">{{ isExpanded(item.id) ? '▲' : '▼' }}</span>
                </div>
                <transition name="expand">
                  <div v-show="isExpanded(item.id)" class="mm-item-body">
                    <pre class="mm-content">{{ item.content }}</pre>
                  </div>
                </transition>
              </div>
            </template>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* 遮罩 + 对话框 */
.memory-modal-overlay {
  position: fixed; inset: 0; z-index: 9000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
}
.memory-modal {
  width: min(680px, 92vw);
  max-height: 78vh;
  display: flex; flex-direction: column;
  background: var(--bg-card,#1a1b2e);
  border: 1px solid var(--border-color,rgba(255,255,255,.1));
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.4);
  overflow: hidden;
}

/* 头部 */
.mm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-color,rgba(255,255,255,.08));
  flex-shrink: 0;
}
.mm-header h3 { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary,#e2e8f0); }
.mm-close {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: #94a3b8;
  background: none; border: none; border-radius: 6px; cursor: pointer;
}
.mm-close:hover { background: rgba(255,255,255,.08); color: #e2e8f0; }

/* 搜索栏 */
.mm-search {
  display: flex; gap: 8px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-color,rgba(255,255,255,.06));
  flex-shrink: 0;
}
.mm-input {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary,#e2e8f0);
  background: rgba(255,255,255,.04);
  border: 1px solid var(--border-color,rgba(255,255,255,.12));
  border-radius: 7px;
  outline: none;
  transition: border-color .15s;
}
.mm-input:focus { border-color: #8b5cf6; }
.mm-input::placeholder { color: #64748b; }
.mm-search-btn {
  padding: 8px 18px;
  font-size: 13px; font-weight: 500;
  color: #fff; background: #8b5cf6;
  border: none; border-radius: 7px; cursor: pointer;
  transition: background .15s;
  white-space: nowrap;
}
.mm-search-btn:hover:not(:disabled) { background: #7c3aed; }
.mm-search-btn:disabled { opacity: .5; cursor: not-allowed; }

/* 结果区域 */
.mm-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 20px 20px;
}

.mm-empty, .mm-error, .mm-hint {
  text-align: center; padding: 40px 0;
  font-size: 13px; color: #64748b;
}
.mm-error { color: #ef4444; }

/* 结果项 */
.mm-item {
  border: 1px solid var(--border-color,rgba(255,255,255,.08));
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
}
.mm-item-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background .12s;
}
.mm-item-header:hover { background: rgba(139,92,246,.05); }
.mm-idx {
  font-size: 11px; font-weight: 700; color: #8b5cf6;
  font-family: 'JetBrains Mono', monospace;
}
.mm-score {
  font-size: 11.5px; font-weight: 500; font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
  padding: 1px 6px; border-radius: 4px; background: rgba(148,163,184,.08);
}
.mm-score.high { color: #10b981; background: rgba(16,185,129,.12); }
.mm-score.mid { color: #f59e0b; background: rgba(245,158,11,.12); }
.mm-time {
  font-size: 11px; color: #64748b; margin-left: auto;
}
.mm-toggle {
  font-size: 10px; color: #8b5cf6; transition: transform .15s;
}

.mm-item-body {
  padding: 0 14px 12px;
}
.mm-content {
  margin: 0; padding: 10px 12px;
  font-size: 12px; line-height: 1.6;
  color: var(--text-secondary,#94a3b8);
  white-space: pre-wrap; word-break: break-word;
  background: rgba(255,255,255,.02);
  border: 1px solid rgba(255,255,255,.05);
  border-radius: 6px;
  max-height: 200px; overflow-y: auto;
}

/* 动画 */
.modal-enter-active { transition: opacity .2s ease-out; }
.modal-enter-active .memory-modal { transition: transform .2s ease-out, opacity .2s ease-out; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .memory-modal { transform: scale(.96); opacity: 0; }
.modal-leave-active { transition: opacity .15s ease-in; }
.modal-leave-to { opacity: 0; }

.expand-enter-active, .expand-leave-active { transition: all .2s ease; overflow: hidden; }
.expand-enter-from, .expand-leave-to { opacity: 0; max-height: 0; }
</style>
