<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useConnectionStore } from '../../stores/connectionStore'
import ThinkingView from './ThinkingView.vue'
import ToolExecView from './ToolExecView.vue'
import OutputView from './OutputView.vue'
import ErrorView from './ErrorView.vue'
import PermissionBar from './PermissionBar.vue'
import DiffView from './DiffView.vue'
import FormView from './FormView.vue'
import AskUserView from './AskUserView.vue'

const { t, locale } = useI18n()
const chatStore = useChatStore()
const sessionStore = useSessionStore()
const connStore = useConnectionStore()

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

// Auto-expand when spawned (thinking), auto-collapse when completed
watch(() => props.isSpawned, (spawned) => {
  isCollapsed.value = !spawned
}, { immediate: true })

// ===== Sub-message (sub-agent conversation flow) =====

// Raw sub-messages from store, reactive via Pinia
const rawSubMessages = computed(() => {
  const sid = sessionStore.activeSessionId
  const tid = props.taskID
  if (!sid || !tid) return []
  return chatStore.subtaskMessagesBySession[sid]?.[tid] || []
})

/** 只看答案模式过滤：与主 ChatArea 的 shouldShowMessage 一致 */
const shouldShowBlock = (type: string): boolean => {
  if (!chatStore.showAnswerOnly) return true
  if (type === 'thinking_delta' || type === 'thinking_done') return false
  if (type === 'tool_exec') return false
  return true
}

// Process raw messages into display blocks:
//   - Consecutive thinking_delta + following thinking_done → merged into one thinking block
//   - Consecutive content_delta / markdown → merged into one output block
//   - tool_use_delta → filtered out (params already merged into tool_exec, same as main flow)
//   - tool_exec, final_answer, error, permission_request, file_modified, form → passed through
const displayBlocks = computed(() => {
  const raw = rawSubMessages.value
  const blocks: Array<{ type: string; data: any }> = []
  let thinkingAccum = ''
  let contentAccum = ''

  function flushContent() {
    if (contentAccum) {
      blocks.push({ type: 'content_delta', data: { content: contentAccum } })
      contentAccum = ''
    }
  }

  for (const msg of raw) {
    // tool_use_delta: 不独立渲染，参数已合并到 tool_exec（与主对话流一致）
    if (msg.eventType === 'tool_use_delta') {
      continue
    }
    if (msg.eventType === 'thinking_delta') {
      flushContent()
      thinkingAccum += msg.content || ''
    } else if (msg.eventType === 'thinking_done') {
      flushContent()
      // Merge accumulated delta with final content (prefer the larger one)
      const finalC = msg.content || ''
      const merged = (thinkingAccum.length > finalC.length) ? thinkingAccum : finalC
      blocks.push({ type: 'thinking_done', data: { content: merged } })
      thinkingAccum = ''
    } else if (msg.eventType === 'content_delta' || msg.eventType === 'markdown') {
      // Flush any pending thinking before starting content accumulation
      if (thinkingAccum) {
        blocks.push({ type: 'thinking_delta', data: { content: thinkingAccum } })
        thinkingAccum = ''
      }
      contentAccum += msg.content || ''
    } else {
      // Flush any pending thinking and content
      if (thinkingAccum) {
        blocks.push({ type: 'thinking_delta', data: { content: thinkingAccum } })
        thinkingAccum = ''
      }
      flushContent()
      blocks.push({ type: msg.eventType, data: msg })
    }
  }
  // Flush remaining
  if (thinkingAccum) {
    blocks.push({ type: 'thinking_delta', data: { content: thinkingAccum } })
  }
  flushContent()

  return blocks
})

const truncatedAnswer = computed(() => {
  if (!props.answer) return ''
  return props.answer.length > 300 ? props.answer.slice(0, 300) + '...' : props.answer
})

const displayAgentName = computed(() => {
  if (!props.agentName) return ''
  const agent = connStore.agents.find(a => a.name === props.agentName)
  if (!agent?.meta) return props.agentName

  const currentLocale = locale.value
  if (currentLocale === 'zh' && agent.meta.name_zh) return agent.meta.name_zh
  if (currentLocale === 'zh-TW' && agent.meta.name_tw) return agent.meta.name_tw
  if (currentLocale === 'en' && agent.meta.name_en) return agent.meta.name_en
  return props.agentName
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

async function handlePermissionGrant(data: Record<string, any>) {
  const toolName = chatStore.pendingPermissionToolName
  if (!toolName) return
  const sessionId = sessionStore.activeSessionId
  if (!sessionId) return
  const remember = data?.remember === true
  try {
    await connStore.resumeExecution(sessionId, toolName)
    chatStore.pendingPermissionToolName = ''
    const { getMindXClient } = await import('../../services/websocket')
    const client = getMindXClient()
    if (client) {
      const magicWord = remember ? 'PermissionAllowSession' : 'PermissionAllow'
      client.sendMessage(magicWord, sessionId)
      chatStore.isProcessing = true
    }
  } catch (err) {
    console.error('[SubtaskView] Failed to grant permission:', err)
  }
}

function handlePermissionDeny() {
  chatStore.pendingPermissionToolName = ''
}
</script>

<template>
  <div class="subtask-view" :class="{ spawned: isSpawned, completed: !isSpawned, success: !isSpawned && success === true, failed: !isSpawned && success === false }">
    <div class="subtask-header" @click="toggleCollapse">
      <div class="header-left">
        <div class="subtask-icon" :class="{ 'icon-spawned': isSpawned, 'icon-success': !isSpawned && success === true, 'icon-failed': !isSpawned && success === false }">
          <template v-if="isSpawned">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </template>
          <template v-else-if="!isSpawned && success === true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
            </svg>
          </template>
          <template v-else>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59z" fill="currentColor"/>
            </svg>
          </template>
        </div>

        <div class="title-section">
          <h3 class="subtask-title">
            <template v-if="isSpawned">已安排</template>
            <template v-else-if="success === true">已完成</template>
            <template v-else>失败</template>
            <span class="tag agent-tag">{{ displayAgentName }}</span>
            <span v-if="isSpawned && taskID" class="tag task-id-tag">{{ taskID }}</span>
            <span v-if="timeout && isSpawned" class="tag timeout-tag">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
                <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              {{ timeout }}
            </span>
          </h3>
        </div>
      </div>

      <div class="header-right">
        <span v-if="isSpawned && displayBlocks.length > 0" class="msg-count-badge">{{ displayBlocks.length }}</span>
        <button class="collapse-btn">
          <el-icon :size="14"><ArrowUp v-if="!isCollapsed" /><ArrowDown v-else /></el-icon>
        </button>
      </div>
    </div>

    <transition name="collapse">
      <div class="subtask-body" v-show="!isCollapsed">
        <!-- Task description (shown during spawning phase) -->
        <template v-if="isSpawned">
          <div class="body-section" v-if="description">
            <div class="section-label">{{ t('subtask.description') }}</div>
            <div class="section-content description-text">{{ description }}</div>
          </div>
        </template>

        <!-- Result/Error summary (shown on completion) -->
        <template v-else>
          <div class="body-section" v-if="success === true && answer">
            <div class="section-label section-label-success">{{ t('subtask.result') }}</div>
            <pre class="result-code"><code>{{ truncatedAnswer }}</code></pre>
            <span v-if="answer.length > 300" class="truncated-hint">{{ t('subtask.truncated') }}</span>
          </div>

          <div class="body-section" v-if="success === false && error">
            <div class="section-label section-label-error">{{ t('subtask.errorMsg') }}</div>
            <pre class="error-code"><code>{{ error }}</code></pre>
          </div>
        </template>

        <!-- ===== Sub-agent Conversation Flow（仅在已安排/执行中展示） ===== -->
        <div v-if="isSpawned && displayBlocks.length > 0" class="subtask-conversation">
          <div class="section-label conversation-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="label-icon">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="currentColor" opacity="0.6"/>
            </svg>
            {{ t('subtask.conversationFlow') }}
          </div>

          <div class="conversation-messages">
            <template v-for="(block, idx) in displayBlocks.filter(b => shouldShowBlock(b.type))" :key="idx">
              <!-- Thinking (streaming) -->
              <div v-if="block.type === 'thinking_delta'" class="conv-msg msg-thinking">
                <ThinkingView
                  :content="''"
                  :pending="block.data.content"
                  :isActive="true"
                  :isComplete="false"
                  :durationMs="0"
                />
              </div>

              <!-- Thinking (complete) -->
              <div v-else-if="block.type === 'thinking_done'" class="conv-msg msg-thinking">
                <ThinkingView
                  :content="block.data.content"
                  :pending="''"
                  :isActive="false"
                  :isComplete="true"
                  :durationMs="0"
                />
              </div>

              <!-- Tool Execution -->
              <div v-else-if="block.type === 'tool_exec'" class="conv-msg msg-tool">
                <ToolExecView
                  :start="block.data.eventData?.start"
                  :end="block.data.eventData?.end"
                  :status="block.data.eventData?.status || 'executing'"
                  :title="block.data.eventTitle"
                />
              </div>

              <!-- Markdown / Content Delta output -->
              <div v-else-if="block.type === 'markdown' || block.type === 'content_delta'" class="conv-msg msg-output">
                <OutputView
                  :content="block.data.content"
                  format="markdown"
                  title=""
                />
              </div>

              <!-- Final Answer -->
              <div v-else-if="block.type === 'final_answer'" class="conv-msg msg-output">
                <OutputView
                  :content="block.data.content"
                  :title="block.data.eventTitle"
                  format="markdown"
                />
              </div>

              <!-- Error -->
              <div v-else-if="block.type === 'error'" class="conv-msg msg-error-block">
                <ErrorView
                  :message="block.data.content || t('message.error')"
                  :code="block.data.eventData?.code || ''"
                  :details="typeof block.data.eventData === 'string' ? block.data.eventData : JSON.stringify(block.data.eventData, null, 2)"
                  :isRecoverable="false"
                />
              </div>

              <!-- Permission Request -->
              <div v-else-if="block.type === 'permission_request'" class="conv-msg msg-permission">
                <PermissionBar
                  :toolName="block.data.eventData?.tool_name || block.data.eventData?.toolName || ''"
                  :params="block.data.eventData?.params || block.data.eventData?.Params || {}"
                  :reason="block.data.eventData?.reason || block.data.eventData?.Reason || ''"
                  :securityLevel="String(block.data.eventData?.security_level || block.data.eventData?.SecurityLevel || 'medium')"
                  @grant="handlePermissionGrant"
                  @deny="handlePermissionDeny"
                />
              </div>

              <!-- File Modified Diff -->
              <div v-else-if="block.type === 'file_modified'" class="conv-msg msg-diff">
                <DiffView
                  :filePath="block.data.eventTitle || ''"
                  :diff="block.data.eventData?.diff || ''"
                  :additions="block.data.eventData?.additions || 0"
                  :deletions="block.data.eventData?.deletions || 0"
                  :isNew="block.data.eventData?.isNew || false"
                />
              </div>

              <!-- Form / AskUser -->
              <div v-else-if="block.type === 'form'" class="conv-msg msg-form">
                <AskUserView :formData="block.data.eventData || {}" />
              </div>

              <div v-else-if="block.type === 'clarify_needed'" class="conv-msg msg-form">
                <FormView v-bind="block.data.eventData || {}" />
              </div>

              <!-- Fallback -->
              <div v-else class="conv-msg msg-raw">
                <div class="msg-header">
                  <span class="msg-dot"></span>
                  <span class="msg-type-label">{{ block.data.eventType || block.type }}</span>
                </div>
                <div class="raw-content">{{ block.data.content || JSON.stringify(block.data) }}</div>
              </div>
            </template>
          </div>
        </div>
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
  width: 20px;
  height: 20px;
  border-radius: 4px;
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

.title-section {
  min-width: 0;
}

.subtask-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.3px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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
  background: none;
  color: #818cf8;
  border: 1px solid #312e81;
  font-weight: 600;
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

.msg-count-badge {
  font-size: 10px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.2);
}

.subtask-view.completed.success .msg-count-badge {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.2);
}

.subtask-view.completed.failed .msg-count-badge {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.2);
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

/* ===== Sub-agent Conversation Flow ===== */

.subtask-conversation {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(6, 182, 212, 0.12);
}

.subtask-view.completed.success .subtask-conversation {
  border-top-color: rgba(16, 185, 129, 0.12);
}

.subtask-view.completed.failed .subtask-conversation {
  border-top-color: rgba(239, 68, 68, 0.12);
}

.conversation-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  margin-bottom: 12px;
}

.label-icon {
  flex-shrink: 0;
}

.conversation-messages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conv-msg {
  border-radius: 10px;
  overflow: hidden;
}

.conv-msg + .conv-msg {
  margin-top: 2px;
}

/* ===== Message Header (Fallback only) ===== */

.msg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.msg-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.msg-type-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.2px;
}

/* ===== Thinking Messages ===== */

.msg-thinking {
  padding: 0;
  border: none;
  background: transparent;
}

/* ===== Tool Execution ===== */

.msg-tool {
  padding: 0;
  border: none;
  background: transparent;
}

:deep(.msg-tool .tool-exec-view) {
  border-radius: 10px;
}

/* ===== Output Messages ===== */

.msg-output {
  padding: 0;
  border: none;
  background: transparent;
}

/* ===== Error Block ===== */

.msg-error-block {
  padding: 0;
  border: none;
  background: transparent;
}

/* ===== Permission Block ===== */

.msg-permission {
  padding: 0;
  border: none;
  background: transparent;
}

/* ===== Diff Block ===== */

.msg-diff {
  padding: 0;
  border: none;
  background: transparent;
}

/* ===== Form Block ===== */

.msg-form {
  padding: 0;
  border: none;
  background: transparent;
}

/* ===== Fallback Raw ===== */

.msg-raw {
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.raw-content {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ===== Collapse Transition ===== */

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
