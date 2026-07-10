<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore, type TaskItem } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'

/**
 * TaskListView — TaskXXX 工具系列的持久 Todo List 视图，右侧浮窗内渲染。
 * 头部可拖动让用户自由停靠面板。
 */
const { t } = useI18n()
const chatStore = useChatStore()
const sessionStore = useSessionStore()

const rootEl = ref<HTMLElement | null>(null)

// ── 拖拽 ──
const dragging = ref(false)
let dragPanel: HTMLElement | null = null
let dragStartX = 0, dragStartY = 0
let panelStartLeft = 0, panelStartTop = 0

function onHeaderPointerDown(e: PointerEvent) {
  const target = e.target as HTMLElement
  if (target.closest('button')) return

  const panel = rootEl.value?.parentElement as HTMLElement | null
  if (!panel) return

  dragging.value = true
  dragPanel = panel
  dragStartX = e.clientX
  dragStartY = e.clientY

  // 当前面板相对 .chat-area 的位置
  const container = panel.offsetParent as HTMLElement
  const panelRect = panel.getBoundingClientRect()
  const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 }
  panelStartLeft = panelRect.left - containerRect.left
  panelStartTop = panelRect.top - containerRect.top

  panel.style.transition = 'none'
  panel.style.right = 'auto'

  document.addEventListener('pointermove', onDocPointerMove)
  document.addEventListener('pointerup', onDocPointerUp)
  e.preventDefault()
}

function onDocPointerMove(e: PointerEvent) {
  if (!dragPanel) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  dragPanel.style.left = `${panelStartLeft + dx}px`
  dragPanel.style.top = `${panelStartTop + dy}px`
}

function onDocPointerUp() {
  if (!dragPanel) return
  dragPanel.style.transition = ''
  dragPanel = null
  dragging.value = false
  document.removeEventListener('pointermove', onDocPointerMove)
  document.removeEventListener('pointerup', onDocPointerUp)
}

onBeforeUnmount(() => {
  if (autoDismissTimer) clearTimeout(autoDismissTimer)
  if (dragPanel) {
    document.removeEventListener('pointermove', onDocPointerMove)
    document.removeEventListener('pointerup', onDocPointerUp)
  }
})

const tasks = computed<TaskItem[]>(() => {
  const sid = sessionStore.activeSessionId
  const map = chatStore.tasksBySession[sid]
  if (!map) return []
  return Object.values(map)
})

const stats = computed(() => {
  const list = tasks.value
  return {
    total: list.length,
    pending: list.filter(x => x.status === 'pending').length,
    inProgress: list.filter(x => x.status === 'in_progress').length,
    completed: list.filter(x => x.status === 'completed').length,
    cancelled: list.filter(x => x.status === 'cancelled').length,
  }
})

// 进度百分比：cancelled 不计入有效总数
const progressPct = computed(() => {
  const s = stats.value
  if (s.total === 0) return 0
  const effective = s.total - s.cancelled
  if (effective === 0) return 100
  return Math.round((s.completed / effective) * 100)
})

// 任务是否全部完成（含 cancelled）——用于决定是否取消 sticky Pin
const isAllDone = computed(() => stats.value.total > 0 && progressPct.value === 100)

// 排序：in_progress 置顶 → pending → completed → cancelled；组内按 createdAt
const sortedTasks = computed(() => {
  const rank = (s: string) =>
    s === 'in_progress' ? 0 : s === 'pending' ? 1 : s === 'completed' ? 2 : 3
  return [...tasks.value].sort((a, b) => {
    const r = rank(a.status) - rank(b.status)
    if (r !== 0) return r
    return (a.createdAt || '').localeCompare(b.createdAt || '')
  })
})

/** 手动关闭：标记并记住关闭状态（同标签页刷新不恢复） */
function dismiss() {
  const sid = sessionStore.activeSessionId
  if (!sid) return
  // 标记所有未完成/已取消任务为 cancelled（保留给历史查看）
  const map = chatStore.tasksBySession[sid]
  if (map) {
    for (const task of Object.values(map)) {
      if (task.status !== 'completed' && task.status !== 'cancelled') {
        chatStore.tasksBySession[sid][task.id] = { ...task, status: 'cancelled' }
      }
    }
  }
  // 记录关闭状态，刷新后不再恢复
  sessionStorage.setItem(`task-list-dismissed:${sid}`, '1')
}

// ── 全部完成时 2 秒后自动关闭 ──
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null

watch(progressPct, (pct) => {
  if (pct === 100 && stats.value.total > 0) {
    if (!autoDismissTimer) {
      autoDismissTimer = setTimeout(() => {
        const sid = sessionStore.activeSessionId
        if (sid) delete chatStore.tasksBySession[sid]
        autoDismissTimer = null
      }, 2000)
    }
  } else {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer)
      autoDismissTimer = null
    }
  }
})
</script>

<template>
  <div ref="rootEl" class="task-list-view" :class="{ 'has-active': stats.inProgress > 0 }">
    <div
      class="tl-header"
      :class="{ dragging }"
      @pointerdown="onHeaderPointerDown"
    >
      <div class="tl-header-left">
        <div class="tl-icon" :class="{ active: stats.inProgress > 0, done: stats.total > 0 && stats.completed === stats.total }">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <div class="tl-title-section">
          <h3 class="tl-title">
            {{ t('taskList.title') }}
            <span class="tl-progress-text">{{ stats.completed }}/{{ stats.total }}</span>
          </h3>
          <div class="tl-subtitle" v-if="stats.inProgress > 0">
            {{ t('taskList.currentlyWorking', { n: stats.inProgress }) }}
          </div>
          <div class="tl-subtitle muted" v-else-if="stats.total > 0 && stats.completed === stats.total">
            {{ t('taskList.allDone') }}
          </div>
        </div>
      </div>
      <div class="tl-header-right">
        <span class="tl-progress-pill" v-if="stats.total > 0">{{ progressPct }}%</span>
        <button class="tl-dismiss-btn" @click="dismiss" :title="t('common.close')">
          <el-icon :size="14"><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="tl-body">
      <!-- 进度条 -->
      <div class="tl-progress-bar" v-if="stats.total > 0">
        <div class="tl-progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>

      <!-- 空状态 -->
      <div v-if="stats.total === 0" class="tl-empty">
        {{ t('taskList.empty') }}
      </div>

        <!-- 任务列表 -->
        <ul v-else class="tl-items">
          <li
            v-for="task in sortedTasks"
            :key="task.id"
            class="tl-item"
            :class="['status-' + task.status, { 'is-active': task.status === 'in_progress' }]"
          >
            <span class="tl-status-icon" :class="'icon-' + task.status">
              <!-- pending: 空心圆 -->
              <svg v-if="task.status === 'pending'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="9" />
              </svg>
              <!-- in_progress: 旋转的半圆 -->
              <svg v-else-if="task.status === 'in_progress'" class="tl-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
              <!-- completed: 勾 -->
              <svg v-else-if="task.status === 'completed'" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
              </svg>
              <!-- cancelled: 叉 -->
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59z" fill="currentColor" />
              </svg>
            </span>

            <div class="tl-item-main">
              <div class="tl-item-subject" :title="task.subject">{{ task.subject }}</div>
              <div class="tl-item-meta" v-if="(task.status === 'in_progress' && task.activeForm) || task.owner || (task.blockedBy && task.blockedBy.length)">
                <span v-if="task.status === 'in_progress' && task.activeForm" class="tl-active-form">
                  <span class="tl-dot-pulse"></span>{{ task.activeForm }}
                </span>
                <span v-if="task.owner" class="tl-tag tl-owner-tag">@{{ task.owner }}</span>
                <span v-if="task.blockedBy && task.blockedBy.length" class="tl-tag tl-blocked-tag">
                  ⛔ {{ t('taskList.blockedBy', { n: task.blockedBy.length }) }}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </div>
  </div>
</template>

<style scoped>
.task-list-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: 0;
  background: transparent;
  border: none;
  transition: none;
}

.task-list-view.has-active {
  border-color: transparent;
  box-shadow: none;
}

.tl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: grab;
  user-select: none;
  transition: background 0.2s ease;
}

.tl-header.dragging {
  cursor: grabbing;
}

.tl-header:hover {
  background: rgba(99, 102, 241, 0.04);
}

.tl-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.tl-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.14);
  border: 1px solid rgba(99, 102, 241, 0.25);
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.tl-icon.active {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.4);
  animation: tl-icon-pulse 2s ease-in-out infinite;
}

.tl-icon.done {
  color: #34d399;
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.4);
}

@keyframes tl-icon-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
}

.tl-title-section {
  min-width: 0;
}

.tl-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.3px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  margin: 0;
}

.tl-progress-text {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  padding: 1px 7px;
  border-radius: 999px;
}

.tl-subtitle {
  font-size: 11.5px;
  color: #60a5fa;
  margin-top: 3px;
  font-weight: 500;
}

.tl-subtitle.muted {
  color: #34d399;
}

.tl-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tl-progress-pill {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.22);
  padding: 2px 9px;
  border-radius: 999px;
}

.tl-dismiss-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.tl-dismiss-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.tl-body {
  padding: 4px 16px 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* 进度条 */
.tl-progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(148, 163, 184, 0.12);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 12px;
}

.tl-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6);
  border-radius: 2px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12.5px;
  font-style: italic;
}

/* 任务列表 */
.tl-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tl-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: background 0.15s ease;
  position: relative;
}

.tl-item:hover {
  background: rgba(148, 163, 184, 0.05);
}

/* in_progress 项：左侧色条 + 微高亮背景 */
.tl-item.is-active {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.02));
  padding-left: 12px;
}

.tl-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 2px;
  background: linear-gradient(180deg, #60a5fa, #3b82f6);
}

.tl-status-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.tl-status-icon.icon-pending { color: #64748b; }
.tl-status-icon.icon-in_progress { color: #60a5fa; }
.tl-status-icon.icon-completed { color: #34d399; }
.tl-status-icon.icon-cancelled { color: #64748b; }

.tl-spin {
  animation: tl-spin 1.2s linear infinite;
}

@keyframes tl-spin {
  to { transform: rotate(360deg); }
}

.tl-item-main {
  flex: 1;
  min-width: 0;
}

.tl-item-subject {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  word-break: break-word;
}

.tl-item.status-completed .tl-item-subject {
  color: var(--text-muted);
  text-decoration: line-through;
  text-decoration-color: rgba(52, 211, 153, 0.5);
}

.tl-item.status-cancelled .tl-item-subject {
  color: var(--text-muted);
  text-decoration: line-through;
  opacity: 0.6;
}

.tl-item.is-active .tl-item-subject {
  color: var(--text-primary);
  font-weight: 600;
}

.tl-item-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.tl-active-form {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: #60a5fa;
  font-style: italic;
}

.tl-dot-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #60a5fa;
  animation: tl-dot-pulse 1.4s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes tl-dot-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

.tl-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.tl-owner-tag {
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.22);
}

.tl-blocked-tag {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.25);
}
</style>
