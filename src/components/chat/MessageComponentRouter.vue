<script setup lang="ts">
import { computed } from 'vue'
import ThinkingView from './ThinkingView.vue'
import ActionView from './ActionView.vue'
import ChoicesPanel from './ChoicesPanel.vue'
import PermissionBar from './PermissionBar.vue'
import OutputView from './OutputView.vue'
import ErrorView from './ErrorView.vue'
import SubtaskView from './SubtaskView.vue'
import AgentTalkView from './AgentTalkView.vue'
import CompactionView from './CompactionView.vue'
import MaxTurnsView from './MaxTurnsView.vue'
import FormView from './FormView.vue'

const props = defineProps({
  message: {
    type: Object as () => any,
    required: true
  }
})

const componentType = computed(() => {
  const eventType = props.message.eventType
  const role = props.message.role

  switch (eventType) {
    case 'thinking_delta':
    case 'thinking_done':
      return 'thinking'

    case 'content_delta':
    case 'markdown':
      return 'output'

    case 'tool_use_delta':
    case 'action_start':
    case 'action_progress':
    case 'action_result':
    case 'action_end':
      return 'action'

    case 'subtask_spawned':
    case 'subtask_completed':
      return 'subtask'

    case 'final_answer':
    case 'task_summary':
      return 'output'

    case 'permission_request':
      return 'permission'

    case 'form':
    case 'clarify_needed':
      return 'form'

    case 'error':
    case 'permission_denied':
      return 'error'

    case 'agent_talk_start':
    case 'agent_talk_end':
      return 'agent_talk'

    case 'compaction':
      return 'compaction'

    case 'max_turns_reached':
      return 'max_turns'

    case 'cycle_end':
    case 'execution_summary':
      return 'system_event'

    default:
      if (role === 'user') return 'user'
      if (role === 'assistant') return 'output'
      return 'default'
  }
})

const thinkingData = computed(() => ({
  content: props.message.eventType === 'thinking_done' ? props.message.content : '',
  pending: props.message.eventType === 'thinking_delta' ? props.message.content : '',
  isActive: props.message.eventType === 'thinking_delta',
  isComplete: props.message.eventType === 'thinking_done',
  tokensIn: props.message.meta?.inputTokens || 0,
  tokensOut: props.message.meta?.outputTokens || 0,
  reasoning: props.message.eventData?.reasoning || '',
  duration: props.message.eventData?.duration || 0
}))

const actionData = computed(() => {
  const data = props.message.eventData || {}

  if (props.message.eventType === 'action_start') {
    return {
      toolCount: data.tool_count || 0,
      toolNames: data.tool_names || [],
      totalPredictedTokens: data.total_predicted_tokens || 0,
      isCompleted: false,
      steps: [{
        toolName: data.tool_name || data.toolName || props.message.eventTitle || '执行操作',
        status: 'executing' as const,
        params: data.params || data.arguments || data.args || null,
        collapsed: false
      }]
    }
  }

  if (props.message.eventType === 'action_end') {
    return {
      isCompleted: true,
      successCount: data.success_count || 0,
      failedCount: data.failed_count || 0,
      totalDuration: data.duration || 0,
      steps: []
    }
  }

  if (props.message.eventType === 'action_result') {
    return {
      steps: [{
        toolName: data.tool_name || 'Unknown',
        status: data.success ? 'done' : 'failed',
        estimatedTok: data.predicted_tokens || 0,
        duration: data.duration_ms || 0,
        params: data.params || {},
        resultText: data.result || data.error || ''
      }]
    }
  }

  return { steps: [] }
})

const permissionData = computed(() => ({
  toolName: props.message.eventData?.tool_name || props.message.eventData?.toolName || '',
  params: props.message.eventData?.params || props.message.eventData?.Params || {},
  reason: props.message.eventData?.reason || props.message.eventData?.Reason || '',
  securityLevel: String(props.message.eventData?.security_level || props.message.eventData?.SecurityLevel || 'medium')
}))

const subtaskData = computed(() => {
  const d = props.message.eventData || {}
  return {
    isSpawned: props.message.eventType === 'subtask_spawned',
    taskID: d.task_id || d.TaskID || '',
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
        <p class="user-content">{{ message.content }}</p>
      </div>
    </template>

    <!-- Thinking Component -->
    <ThinkingView 
      v-else-if="componentType === 'thinking'"
      v-bind="thinkingData"
    />

    <!-- Action Component -->
    <ActionView 
      v-else-if="componentType === 'action'"
      v-bind="actionData"
    />

    <!-- Output/Final Answer Component -->
    <OutputView 
      v-else-if="componentType === 'output' && message.content"
      :content="message.content"
      :title="message.eventTitle || '最终输出'"
      :format="'markdown'"
      :tokensIn="message.meta?.inputTokens || 0"
      :tokensOut="message.meta?.outputTokens || 0"
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
      :message="message.content || message.eventTitle || '发生错误'"
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

    <!-- Agent Talk Component -->
    <AgentTalkView
      v-else-if="componentType === 'agent_talk'"
      v-bind="agentTalkData"
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

    <!-- Form / Clarify Component -->
    <FormView
      v-else-if="componentType === 'form'"
      v-bind="formData"
      @submit="(data) => $emit('form-submit', data)"
    />

    <!-- System Event (cycle_end, execution_summary) - now hidden -->
    <template v-else-if="componentType === 'system_event'">
      <!-- Internal events, not displayed -->
    </template>

    <!-- Default / System Message -->
    <template v-else>
      <div class="system-message">
        <div class="icon">{{ message.eventTitle || '📝' }}</div>
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
}

.user-content {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-primary);
  padding: 12px 18px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.08));
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 12px;
  margin: 0;
  word-wrap: break-word;
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
</style>
