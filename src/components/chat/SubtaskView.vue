<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps({
  isSpawned: {
    type: Boolean,
    default: true
  },
  taskID: {
    type: String,
    default: ''
  },
  agentName: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  timeout: {
    type: String,
    default: ''
  },
  success: {
    type: Boolean as () => boolean | undefined,
    default: undefined
  },
  answer: {
    type: String,
    default: ''
  },
  error: {
    type: String,
    default: ''
  }
})

const isCollapsed = ref(true)

const truncatedAnswer = computed(() => {
  if (!props.answer) return ''
  return props.answer.length > 300 ? props.answer.slice(0, 300) + '...' : props.answer
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="subtask-view" :class="{ spawned: isSpawned, completed: !isSpawned, success: !isSpawned && success === true, failed: !isSpawned && success === false }">
    <div class="subtask-header" @click="toggleCollapse">
      <div class="header-left">
        <div class="subtask-icon" :class="{ 'icon-spawned': isSpawned, 'icon-success': !isSpawned && success === true, 'icon-failed': !isSpawned && success === false }">
          <template v-if="isSpawned">
            <span class="spawn-pulse"></span>
            <span class="icon-emoji">🌿</span>
          </template>
          <template v-else-if="!isSpawned && success === true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
            </svg>
          </template>
          <template v-else>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59z" fill="currentColor"/>
            </svg>
          </template>
        </div>

        <div class="title-section">
          <h3 class="subtask-title">
            <template v-if="isSpawned">{{ t('subtask.spawned') }}</template>
            <template v-else-if="!isSpawned && success === true">{{ t('subtask.completed') }}</template>
            <template v-else>{{ t('subtask.failed') }}</template>
          </h3>

          <div class="header-tags">
            <span class="tag task-id-tag">{{ taskID }}</span>
            <span v-if="agentName" class="tag agent-tag">{{ agentName }}</span>
            <span v-if="timeout && isSpawned" class="tag timeout-tag">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
                <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              {{ timeout }}
            </span>
          </div>
        </div>
      </div>

      <div class="header-right">
        <button class="collapse-btn">
          <el-icon :size="14"><ArrowUp v-if="!isCollapsed" /><ArrowDown v-else /></el-icon>
        </button>
      </div>
    </div>

    <transition name="collapse">
      <div class="subtask-body" v-show="!isCollapsed">
        <template v-if="isSpawned">
          <div class="body-section" v-if="description">
            <div class="section-label">任务描述</div>
            <div class="section-content description-text">{{ description }}</div>
          </div>
        </template>

        <template v-else>
          <div class="body-section" v-if="success === true && answer">
            <div class="section-label section-label-success">{{ t('subtask.result') }}</div>
            <pre class="result-code"><code>{{ truncatedAnswer }}</code></pre>
            <span v-if="answer.length > 300" class="truncated-hint">内容已截断至 300 字符</span>
          </div>

          <div class="body-section" v-if="success === false && error">
            <div class="section-label section-label-error">{{ t('subtask.errorMsg') }}</div>
            <pre class="error-code"><code>{{ error }}</code></pre>
          </div>
        </template>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.subtask-view {
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.subtask-view.spawned {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.06), rgba(20, 184, 166, 0.04));
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.subtask-view.spawned:hover {
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.08);
}

.subtask-view.completed.success {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.06), rgba(5, 150, 105, 0.04));
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.subtask-view.completed.failed {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(220, 38, 38, 0.04));
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.subtask-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
}

.subtask-view.spawned .subtask-header {
  border-bottom: 1px solid rgba(6, 182, 212, 0.1);
}

.subtask-view.spawned .subtask-header:hover {
  background: rgba(6, 182, 212, 0.04);
}

.subtask-view.completed.success .subtask-header {
  border-bottom: 1px solid rgba(16, 185, 129, 0.1);
}

.subtask-view.completed.success .subtask-header:hover {
  background: rgba(16, 185, 129, 0.04);
}

.subtask-view.completed.failed .subtask-header {
  border-bottom: 1px solid rgba(239, 68, 68, 0.1);
}

.subtask-view.completed.failed .subtask-header:hover {
  background: rgba(239, 68, 68, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.subtask-icon {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.icon-spawned {
  background: linear-gradient(135deg, #06b6d4, #14b8a6);
}

.icon-success {
  background: linear-gradient(135deg, #10b981, #059669);
}

.icon-failed {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.icon-emoji {
  position: relative;
  z-index: 1;
  font-size: 15px;
}

.spawn-pulse {
  position: absolute;
  inset: -4px;
  border: 2px solid rgba(6, 182, 212, 0.4);
  border-radius: 12px;
  animation: pulse-expand 2s ease-out infinite;
}

@keyframes pulse-expand {
  0% { transform: scale(0.9); opacity: 1; }
  100% { transform: scale(1.3); opacity: 0; }
}

.title-section {
  min-width: 0;
}

.subtask-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.3px;
  margin-bottom: 4px;
}

.subtask-view.spawned .subtask-title {
  background: linear-gradient(90deg, #22d3ee, #5eead4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtask-view.completed.success .subtask-title {
  background: linear-gradient(90deg, #34d399, #6ee7b7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtask-view.completed.failed .subtask-title {
  background: linear-gradient(90deg, #f87171, #fca5a5);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}

.task-id-tag {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.agent-tag {
  background: rgba(99, 102, 241, 0.12);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.timeout-tag {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.collapse-btn {
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

.subtask-view.spawned .collapse-btn:hover {
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
}

.subtask-view.completed.success .collapse-btn:hover {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.subtask-view.completed.failed .collapse-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.subtask-body {
  padding: 16px;
}

.body-section {
  margin-bottom: 12px;
}

.body-section:last-child {
  margin-bottom: 0;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.section-label-success {
  color: #6ee7b7;
}

.section-label-error {
  color: #fca5a5;
}

.description-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.result-code {
  background: var(--bg-secondary);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  padding: 12px;
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.65;
  color: #6ee7b7;
  max-height: 240px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.error-code {
  background: var(--bg-secondary);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  padding: 12px;
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.65;
  color: #fca5a5;
  max-height: 240px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.truncated-hint {
  display: inline-block;
  margin-top: 6px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
