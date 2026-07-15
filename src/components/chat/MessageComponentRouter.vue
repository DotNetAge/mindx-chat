<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { isTaskTool } from '../../stores/chatStore'
import { useChatStore } from '../../stores/chatStore'
import ThinkingView from './ThinkingView.vue'
import ToolExecView from './ToolExecView.vue'
import ChoicesPanel from './ChoicesPanel.vue'
import PermissionBar from './PermissionBar.vue'
import OutputView from './OutputView.vue'
import ErrorView from './ErrorView.vue'
import SubtaskView from './SubtaskView.vue'
import CompactionView from './CompactionView.vue'
import MaxTurnsView from './MaxTurnsView.vue'
import FormView from './FormView.vue'
import AskUserView from './AskUserView.vue'
import DiffView from './DiffView.vue'
import FormattedContent from './FormattedContent.vue'

const { t } = useI18n()
const chatStore = useChatStore()

const props = defineProps({
  message: {
    type: Object as () => any,
    required: true
  },
  index: {
    type: Number,
    default: -1
  },
  sessionId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits<{
  (e: 'undo-round', messageId: number): void
  (e: 'permission-grant', data: any): void
  (e: 'permission-deny', reason: string): void
  (e: 'retry'): void
  (e: 'dismiss'): void
  (e: 'form-submit', data: any): void
}>()

const componentType = computed(() => {
  const et = props.message.eventType

  if (et === 'thinking_delta' || et === 'thinking_done') return 'thinking'
  if (et === 'content_delta' || et === 'markdown') return 'output'
  if (et === 'tool_use_delta') return 'output'
  if (et === 'tool_exec' || et === 'tool_exec_start' || et === 'tool_exec_end') {
    // TaskXXX 工具：不占消息流（由 ChatArea 的 pinned TaskListView 独立渲染）
    const toolName = props.message.eventTitle || props.message.eventData?.start?.tool_name || ''
    if (isTaskTool(toolName)) return 'hidden'
    return 'action'
  }
  if (et === 'subtask_spawned' || et === 'subtask_completed') return 'subtask'
  if (et === 'final_answer' || et === 'task_summary') return 'output'
  if (et === 'permission_request') return 'permission'
  if (et === 'form') return 'ask_user'
  if (et === 'clarify_needed') return 'form'
  if (et === 'error' || et === 'permission_denied') return 'error'
  if (et === 'compaction') return 'compaction'
  if (et === 'max_turns_reached') return 'max_turns'
  if (et === 'cycle_end' || et === 'execution_summary') return 'system_event'
  if (et === 'file_modified') return 'diff_view'

  const role = props.message.role
  if (role === 'user') return 'user'
  if (role === 'assistant') return 'output'
  return 'default'
})

/**
 * Compute turn-level token usage for the current output message.
 * A turn spans from the nearest preceding user message up to this message.
 * Walks the full messages array (not filtered) by message.id to handle
 * filtered indices correctly.
 */
const turnUsage = computed(() => {
  if (componentType.value !== 'output') return null
  const allMessages = chatStore.currentMessages
  const currentId = props.message.id
  const currentIdx = allMessages.findIndex(m => m.id === currentId)
  if (currentIdx < 0) return null

  // Walk backward from currentIdx to find the last user message (turn boundary)
  let turnStart = 0
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (allMessages[i].role === 'user') {
      turnStart = i + 1
      break
    }
  }

  // Sum tokenUsage across all messages in the turn
  let pt = 0, ct = 0, ca = 0, tc = 0
  for (let i = turnStart; i <= currentIdx; i++) {
    const u = allMessages[i].tokenUsage
    if (u) {
      pt += u.prompt_tokens || 0
      ct += u.completion_tokens || 0
      ca += u.cached_tokens || 0
    }
    tc += allMessages[i].cost || 0
  }

  // Only return if there's actual data
  if (pt === 0 && ct === 0) return null
  const rawTotal = pt + ct
  const actualTokens = Math.max(0, rawTotal - ca)
  return {
    prompt_tokens: pt,
    completion_tokens: ct,
    // total_tokens matches the backend raw API语义: prompt + completion
    total_tokens: rawTotal,
    cached_tokens: ca,
    // actual_tokens is the billing口径: prompt + completion - cached
    actual_tokens: actualTokens,
    cost: tc,
  }
})

const isDeleting = ref(false)

const canUndo = computed(() => {
  const ts = props.message?.metadata?.backendTimestamp
  return typeof ts === 'number' && ts > 0
})

async function handleUndoRound() {
  const ts = props.message?.metadata?.backendTimestamp
  if (isDeleting.value || typeof ts !== 'number' || ts <= 0) return
  isDeleting.value = true
  try {
    emit('undo-round', ts)
  } catch (e) {
    console.error('undo round failed:', e)
  } finally {
    isDeleting.value = false
  }
}

const thinkingData = computed(() => ({
  content: props.message.eventType === 'thinking_done' ? props.message.content : '',
  pending: props.message.eventType === 'thinking_delta' ? props.message.content : '',
  isActive: props.message.eventType === 'thinking_delta',
  isComplete: props.message.eventType === 'thinking_done',
  durationMs: props.message.metadata?.duration_ms || 0
}))

const actionData = computed(() => {
  const et = props.message.eventType
  const ed = props.message.eventData || {}

  // goharness tool_exec 事件 — 原样透传，不包装
  if (et === 'tool_exec' || et === 'tool_exec_start' || et === 'tool_exec_end') {
    return {
      start: ed.start || null,       // ToolExecStartData | null
      end:   ed.end || null,         // ToolExecEndData | null
      status: ed.status || 'executing',
      title: props.message.eventTitle || ''
    }
  }

  return { start: null, end: null, status: 'executing', title: '' }
})

const permissionData = computed(() => ({
  toolName: props.message.eventData?.tool_name || props.message.eventData?.toolName || '',
  params: props.message.eventData?.params || props.message.eventData?.Params || {},
  reason: props.message.eventData?.reason || props.message.eventData?.Reason || '',
  securityLevel: String(props.message.eventData?.security_level || props.message.eventData?.SecurityLevel || 'medium')
}))

const subtaskData = computed(() => {
  const et = props.message.eventType
  const c = props.message.content || ''
  const d = props.message.eventData || {}

  // 处理 tool_exec 消息中嵌入的 subtask 分发事件
  // 格式: "分发工作<agentName>, <description>"
  if (et === 'tool_exec' && c.startsWith('分发工作')) {
    const commaIdx = c.indexOf(',')
    const agentName = commaIdx > 10 ? c.substring(4, commaIdx).trim() : ''
    const description = commaIdx > 0 ? c.substring(commaIdx + 1).trim() : c.substring(4).trim()
    return {
      isSpawned: true,
      taskID: agentName,
      agentName,
      description,
      timeout: '',
      success: undefined,
      answer: '',
      error: ''
    }
  }

  return {
    isSpawned: et === 'subtask_spawned',
    taskID: d.session_id || '',
    agentName: d.agent_name || d.AgentName || '',
    description: d.description || d.Description || '',
    timeout: d.timeout || d.Timeout || '',
    success: d.success ?? d.Success,
    answer: d.answer || d.Answer || '',
    error: d.error || d.Error || ''
  }
})

const agentTalkData = computed(() => {
  const d = props.message.eventData || {}
  return {
    isStart: props.message.eventType === 'agent_talk_start',
    to: d.to || d.To || '',
    message: d.message || d.Message || '',
    reply: d.reply || d.Reply || '',
    error: d.error || d.Error || ''
  }
})

const compactionData = computed(() => {
  const d = props.message.eventData || {}
  return {
    sessionID: d.session_id || d.SessionID || '',
    messagesSlid: d.messages_slid ?? d.MessagesSlid ?? 0,
    remainingAfter: d.remaining_after ?? d.RemainingAfter ?? 0,
    windowSize: d.window_size ?? d.WindowSize ?? 0
  }
})

const maxTurnsData = computed(() => {
  const d = props.message.eventData || {}
  return {
    turnsCompleted: d.turns_completed ?? d.TurnsCompleted ?? 0,
    maxTurns: d.max_turns ?? d.MaxTurns ?? 0,
    suggestion: d.suggestion || d.Suggestion || ''
  }
})

const formData = computed(() => props.message.eventData || {})

function formatContent(content: string): string {
  if (!content) return ''
  
  return content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}
</script>

<template>
  <div class="message-component-router">
    <!-- User Message -->
    <template v-if="componentType === 'user' && message.content">
      <div class="user-message">
        <span class="user-indicator"></span>
        <p class="user-content">
          <span class="user-text"><FormattedContent :content="message.content" /></span>
          <el-popconfirm
            v-if="canUndo"
            :title="t('message.undoRoundConfirm')"
            confirm-button-text="确认回收"
            cancel-button-text="取消"
            @confirm="handleUndoRound"
            placement="left"
            :hide-after="0"
            popper-class="undo-round-popover"
          >
            <template #reference>
              <span
                class="undo-round-btn"
                :title="t('message.undoRound')"
              >回收</span>
            </template>
          </el-popconfirm>
        </p>
      </div>
    </template>

    <!-- Thinking Component -->
    <ThinkingView 
      v-else-if="componentType === 'thinking'"
      v-bind="thinkingData"
    />

    <!-- TaskXXX 工具调用：不占消息流（由 ChatArea 的 pinned TaskListView 独立渲染） -->
    <template v-else-if="componentType === 'hidden'" />

    <!-- ToolExec Component (goharness tool_exec event) -->
    <ToolExecView
      v-else-if="componentType === 'action'"
      v-bind="actionData"
    />

    <!-- Output/Final Answer Component -->
    <OutputView 
      v-else-if="componentType === 'output' && message.content"
      :content="message.content"
      :title="message.eventTitle || '最终输出'"
      :format="'markdown'"
      :turnUsage="turnUsage"
    />

    <!-- Permission Request Component -->
    <PermissionBar 
      v-else-if="componentType === 'permission'"
      v-bind="permissionData"
      @grant="(data) => $emit('permission-grant', data)"
      @deny="(reason) => $emit('permission-deny', reason)"
    />

    <!-- Error Component -->
    <ErrorView
      v-else-if="componentType === 'error'"
      :message="message.content || message.eventTitle || t('message.error')"
      :code="message.eventData?.code || ''"
      :details="typeof message.eventData === 'string' ? message.eventData : JSON.stringify(message.eventData, null, 2)"
      :isRecoverable="true"
      @retry="$emit('retry')"
      @dismiss="$emit('dismiss')"
    />

    <!-- Subtask Component -->
    <SubtaskView
      v-else-if="componentType === 'subtask'"
      v-bind="subtaskData"
    />

    <!-- Compaction Component -->
    <CompactionView
      v-else-if="componentType === 'compaction'"
      v-bind="compactionData"
    />

    <!-- Max Turns Reached Component -->
    <MaxTurnsView
      v-else-if="componentType === 'max_turns'"
      v-bind="maxTurnsData"
    />

    <!-- AskUser Component (非阻塞设计：提交时直接发送用户消息，不再 emit submit） -->
    <AskUserView
      v-else-if="componentType === 'ask_user'"
      :formData="formData"
    />

    <!-- Form / Clarify Component -->
    <FormView
      v-else-if="componentType === 'form'"
      v-bind="formData"
      @submit="(data) => $emit('form-submit', data)"
    />

    <!-- File Modified Diff Component -->
    <DiffView
      v-else-if="componentType === 'diff_view'"
      :filePath="message.eventTitle || ''"
      :diff="message.eventData?.diff || ''"
      :additions="message.eventData?.additions || 0"
      :deletions="message.eventData?.deletions || 0"
      :isNew="message.eventData?.isNew || false"
    />

    <!-- System Event (cycle_end, execution_summary) - now hidden -->
    <template v-else-if="componentType === 'system_event'">
      <!-- Internal events, not displayed -->
    </template>

    <!-- Default / System Message -->
    <template v-else>
      <div class="system-message">
        <div class="body">
          <h5 v-if="message.eventTitle" class="title">{{ message.eventTitle }}</h5>
          <div class="content" v-html="formatContent(message.content)"></div>        
          <div class="event-data" v-if="message.eventData && Object.keys(message.eventData).length > 0">
            <pre><code>{{ JSON.stringify(message.eventData, null, 2) }}</code></pre>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.message-component-router {
  width: 100%;
}

.user-message {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 0;
}

.user-indicator {
  width: 3px;
  min-height: 100%;
  border-radius: 2px;
  background: linear-gradient(180deg, #8b5cf6, #a78bfa);
  align-self: stretch;
  flex-shrink: 0;
}

.user-content {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-primary);
  padding: 12px 18px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.08));
  border-radius: 0 12px 12px 0;
  margin: 0;
  word-wrap: break-word;
}

.user-text {
  flex: 1;
  min-width: 0;
}

.system-message {
  display: flex;
  gap: 12px;
}

.icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.body {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.system-message .content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.system-message .content :deep(.inline-code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  background: rgba(6, 182, 212, 0.12);
  color: var(--accent-cyan);
  padding: 2px 5px;
  border-radius: 3px;
}

.system-message .content :deep(.code-block) {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--accent-cyan);
}

.event-data {
  margin-top: 10px;
}

.event-data pre {
  margin: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 1.5;
  color: var(--accent-cyan);
}

.system-event-card {
  display: flex;
  gap: 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(99, 102, 241, 0.03));
  border: 1px solid rgba(59, 130, 246, 0.18);
  border-radius: 12px;
  padding: 14px 16px;
  animation: slideInUp 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.event-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(99, 102, 241, 0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.event-body {
  flex: 1;
  min-width: 0;
}

.event-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.event-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.event-content :deep(.inline-code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
  padding: 2px 5px;
  border-radius: 3px;
}

.event-data-preview {
  margin-top: 10px;
}

.event-data-preview pre {
  margin: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px;
  max-height: 180px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 1.5;
  color: #60a5fa;
}

.undo-round-btn {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-tertiary, #999);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
  user-select: none;
  opacity: 0;
  white-space: nowrap;
}

.user-content:hover .undo-round-btn {
  opacity: 1;
}

:global(.undo-round-popover) {
  min-width: 200px;
}

.undo-round-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}
</style>
