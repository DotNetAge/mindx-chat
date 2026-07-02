<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore, type TaskItem } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'

/**
 * TaskListView — TaskXXX 工具系列的持久 Todo List 视图
 *
 * 数据来源：chatStore.tasksBySession[sessionId]，由 TaskCreate/TaskUpdate/TaskList
 * 工具事件自动 ingest 维护。整个会话只渲染一个持久块（由 MessageComponentRouter
 * 根据第一条 TaskXXX 消息锚定），后续 TaskXXX 调用只更新本视图，不再生成独立块。
 *
 * 设计目标：直观展示"当前正在处理哪一项"，in_progress 项置顶高亮。
 */
const { t } = useI18n()
const chatStore = useChatStore()
const sessionStore = useSessionStore()

const isCollapsed = ref(false)

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

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="task-list-view" :class="{ 'has-active': stats.inProgress > 0 }">
    <div class="tl-header" @click="toggleCollapse">
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
        <button class="tl-collapse-btn" @click.stop="toggleCollapse">
          <el-icon :size="14"><ArrowUp v-if="!isCollapsed" /><ArrowDown v-else /></el-icon>
        </button>
      </div>
    </div>

    <transition name="tl-collapse">
      <div class="tl-body" v-show="!isCollapsed">
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
    </transition>
  </div>
</template>

<style scoped>
.task-list-view {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.06), rgba(139, 92, 246, 0.04));
  border: 1px solid rgba(99, 102, 241, 0.22);
  transition: all 0.3s ease;
}

.task-list-view.has-active {
  border-color: rgba(59, 130, 246, 0.35);
  box-shadow: 0 0 24px rgba(59, 130, 246, 0.08);
}

.tl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
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

.tl-collapse-btn {
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

.tl-collapse-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
}

.tl-body {
  padding: 4px 16px 16px;
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

/* 折叠动画 */
.tl-collapse-enter-active,
.tl-collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.tl-collapse-enter-from,
.tl-collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
