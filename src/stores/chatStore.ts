import { defineStore } from 'pinia'
import { useConnectionStore } from './connectionStore'
import { useSessionStore } from './sessionStore'
import { getMindXClient } from '../services/websocket'
import type { SessionMessage } from '../types/websocket'

export type MessageRole = 'user' | 'assistant' | 'system' | 'thinking' | 'action'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: string
  eventType?: string
  eventTitle?: string
  eventData?: any
  metadata?: Record<string, any>
  sessionId: string
}

export interface ExecutionStats {
  totalIterations: number
  toolCalls: number
  toolsUsed: string[]
  duration: string
  tokensUsed: number
  inputTokens: number
  outputTokens: number
}

interface OfflineMessageQueueItem {
  text: string
  timestamp: string
  sessionId: string
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    messagesBySession: {} as Record<string, ChatMessage[]>,
    isProcessing: false as boolean,
    currentThinking: '' as string,
    currentAction: null as string | null,
    actionProgress: null as { completed: number; total: number; status: string } | null,
    executionStats: null as ExecutionStats | null,
    lastError: null as string | null,
    processingTimer: null as ReturnType<typeof setTimeout> | null,
    offlineMessageQueue: [] as OfflineMessageQueueItem[],
    isOfflineMode: true as boolean,

    totalTokensUsed: 0 as number,
    totalCost: 0 as number,
    totalConversations: 0 as number,
    sessionTokensUsed: 0 as number,
    sessionCost: 0 as number,
    tokenPricePerMillion: 1 as number,

    pendingCorrelationId: null as string | null,
    pendingContentBySession: {} as Record<string, string>,
  }),

  getters: {
    currentMessages(state): ChatMessage[] {
      const sessionStore = useSessionStore()
      return state.messagesBySession[sessionStore.activeSessionId] || []
    },

    hasMessages(): boolean {
      const sessionStore = useSessionStore()
      return (this.messagesBySession[sessionStore.activeSessionId] || []).length > 0
    },

    userMessages(): ChatMessage[] {
      return this.currentMessages.filter(m => m.role === 'user')
    },

    assistantMessages(): ChatMessage[] {
      return this.currentMessages.filter(m => m.role === 'assistant')
    },

    thinkingMessages(): ChatMessage[] {
      return this.currentMessages.filter(m => m.role === 'thinking')
    },

    actionMessages(): ChatMessage[] {
      return this.currentMessages.filter(m => m.role === 'action')
    }
  },

  actions: {
    addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp' | 'sessionId'>): ChatMessage {
      if (!this.messagesBySession[sessionId]) {
        this.messagesBySession[sessionId] = []
      }

      const newMessage: ChatMessage = {
        ...message,
        id: `${message.role}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        sessionId
      }

      this.messagesBySession[sessionId].push(newMessage)

      const sessionStore = useSessionStore()
      sessionStore.incrementMessageCount(sessionId)

      return newMessage
    },

    addUserMessage(sessionId: string, text: string): ChatMessage {
      const sessionStore = useSessionStore()
      const messages = this.messagesBySession[sessionId] || []
      const isFirstUserMessage = !messages.some(m => m.role === 'user')

      if (isFirstUserMessage) {
        const truncatedTitle = text.replace(/\n/g, ' ').trim().substring(0, 40)
        sessionStore.updateSession(sessionId, {
          title: truncatedTitle.length < text.length ? truncatedTitle + '...' : truncatedTitle
        })
      }

      return this.addMessage(sessionId, {
        role: 'user',
        content: text
      })
    },

    clearSessionMessages(sessionId: string) {
      this.messagesBySession[sessionId] = []
      this.resetProcessingState()
    },

    restoreSessionMessages(sessionId: string, serverMessages: SessionMessage[]) {
      if (!this.messagesBySession[sessionId]) {
        this.messagesBySession[sessionId] = []
      }

      const restored: ChatMessage[] = serverMessages.map((msg, idx) => {
        let role: MessageRole = 'system'
        switch (msg.role) {
          case 'user': role = 'user'; break
          case 'assistant': role = 'assistant'; break
          case 'tool': role = 'action'; break
          default: role = 'system'; break
        }

        return {
          id: `restored_${idx}_${msg.timestamp}`,
          role,
          content: msg.content || '',
          timestamp: new Date(msg.timestamp).toISOString(),
          sessionId,
          metadata: msg.tool_calls ? { tool_calls: msg.tool_calls, tool_call_id: msg.tool_call_id } : undefined
        }
      })

      this.messagesBySession[sessionId] = restored
    },

    clearCurrentSession() {
      const sessionStore = useSessionStore()
      this.clearSessionMessages(sessionStore.activeSessionId)
    },

    clearAll() {
      this.messagesBySession = {}
      this.offlineMessageQueue = []
      this.resetProcessingState()
    },

    resetProcessingState() {
      if (this.processingTimer) {
        clearTimeout(this.processingTimer)
        this.processingTimer = null
      }
      this.isProcessing = false
      this.currentThinking = ''
      this.currentAction = null
      this.actionProgress = null
      this.executionStats = null
    },

    sendMessage(text: string) {
      const connectionStore = useConnectionStore()
      const sessionStore = useSessionStore()

      const targetSessionId = sessionStore.activeSessionId

      if (!targetSessionId) {
        console.warn('[MindX] No active session, cannot send message')
        return { sent: false, queued: false }
      }

      this.addUserMessage(targetSessionId, text)

      if (connectionStore.canSendMessage) {
        const client = getMindXClient()
        if (client) {
          console.log('[MindX Chat] Sending message via WebSocket...')
          client.sendMessage(text, targetSessionId)
        }
        this.isProcessing = true
        this.isOfflineMode = false

        if (this.processingTimer) {
          clearTimeout(this.processingTimer)
        }
        this.processingTimer = setTimeout(() => {
          console.warn('[MindX Chat] ⏰ Processing timeout - no response received, resetting state')
          this.resetProcessingState()
          this.lastError = '处理超时，未收到服务器响应'
        }, 60000)

        return { sent: true, queued: false }
      } else {
        this.offlineMessageQueue.push({
          text,
          timestamp: new Date().toISOString(),
          sessionId: targetSessionId
        })

        this.lastError = '当前处于离线模式，消息将在重新连接后发送'
        this.isOfflineMode = true

        return { sent: false, queued: true }
      }
    },

    processOfflineQueue() {
      const connectionStore = useConnectionStore()

      while (this.offlineMessageQueue.length > 0 && connectionStore.canSendMessage) {
        const item = this.offlineMessageQueue.shift()
        if (item) {
          this.addUserMessage(item.sessionId, item.text)
          this.isProcessing = true
        }
      }

      if (this.offlineMessageQueue.length === 0) {
        this.isOfflineMode = false
      }
    },

    handleAgentEvent(eventType: string, data: any, envelope?: any) {
      switch (eventType) {
        case 'thinking_delta':
          this.handleThinkingDelta(data)
          break
        case 'thinking_done':
          this.handleThinkingDone(data)
          break
        case 'content_delta':
        case 'markdown':
          this.handleContentDelta(data)
          break
        case 'tool_use_delta':
        case 'text':
          this.handleToolUseDelta(data, envelope?.title)
          break
        case 'action_start':
          this.handleActionStart(data, envelope?.title)
          break
        case 'action_progress':
          this.handleActionProgress(data)
          break
        case 'action_result':
          this.handleActionResult(data)
          break
        case 'action_end':
          this.handleActionEnd(data)
          break
        case 'subtask_spawned':
          this.handleSubtaskSpawned(data)
          break
        case 'subtask_completed':
          this.handleSubtaskCompleted(data)
          break
        case 'final_answer':
          this.handleFinalAnswer(data, envelope?.title)
          break
        case 'permission_request':
          this.handlePermissionRequest(data)
          break
        case 'form':
        case 'clarify_needed':
          this.handleAskUserRequest(data)
          break
        case 'permission_denied':
          this.handlePermissionDenied(data)
          break
        case 'execution_summary':
          this.handleExecutionSummary(data)
          break
        case 'cycle_end':
          // Internal system event, do not display in message history
          break
        case 'task_summary':
          this.handleTaskSummary(data, envelope)
          break
        case 'agent_talk_start':
          this.handleAgentTalkStart(data)
          break
        case 'agent_talk_end':
          this.handleAgentTalkEnd(data)
          break
        case 'compaction':
          this.handleCompaction(data)
          break
        case 'max_turns_reached':
          this.handleMaxTurnsReached(data)
          break
        case 'error':
          this.handleError(data, envelope?.title)
          break
        default:
          this.handleGenericEvent(eventType, data, envelope?.title)
      }
    },

    handleThinkingDelta(data: any, sessionId?: string) {
      console.log('[MindX Chat] 📝 handleThinkingDelta called:', { data: String(data).substring(0, 100), sessionId })
      this.currentThinking += data || ''

      const sessionStore = useSessionStore()
      const targetSessionId = sessionId || sessionStore.activeSessionId
      console.log('[MindX Chat] targetSessionId:', targetSessionId)
      const messages = this.messagesBySession[targetSessionId]

      let thinkingMsg = messages?.find(m =>
        m.role === 'thinking' && !m.metadata?.complete
      )

      if (!thinkingMsg && targetSessionId) {
        thinkingMsg = this.addMessage(targetSessionId, {
          role: 'thinking',
          content: '',
          eventType: 'thinking_delta',
          eventTitle: '思考中...',
          metadata: { complete: false }
        })
      }

      if (thinkingMsg) {
        thinkingMsg.content = this.currentThinking
      }
    },

    handleThinkingDone(data: any) {
      const sessionStore = useSessionStore()
      const messages = this.messagesBySession[sessionStore.activeSessionId]

      const lastThinkingMsg = messages?.findLast(m =>
        m.role === 'thinking' && !m.metadata?.complete
      )

      if (lastThinkingMsg) {
        lastThinkingMsg.content = data || lastThinkingMsg.content
        lastThinkingMsg.metadata = { ...lastThinkingMsg.metadata, complete: true }
      }

      this.currentThinking = ''
    },

    handleMarkdownContent(data: any, envelope?: { session_id?: string; title?: string; meta?: any }) {
      console.log('[MindX Chat] 📝 handleMarkdownContent called:', { data: String(data).substring(0, 100), envelope })
      const sessionStore = useSessionStore()
      const targetSessionId = envelope?.session_id || sessionStore.activeSessionId
      console.log('[MindX Chat] targetSessionId:', targetSessionId)
      this.handleContentDelta(data, { session_id: targetSessionId, title: envelope?.title })
    },

    handleContentDelta(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      // 缓冲内容，不立即创建消息显示
      if (!this.pendingContentBySession[targetSessionId]) {
        this.pendingContentBySession[targetSessionId] = ''
      }
      this.pendingContentBySession[targetSessionId] += data || ''
    },

    handleToolArguments(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'action',
        content: '',
        eventType: 'tool_use_delta',
        eventTitle: opts?.title || '工具参数',
        eventData: data,
        metadata: { phase: 'tool_args' }
      })
    },

    handleActionStart(data: any, opts?: { session_id?: string; title?: string }) {
      console.log('[MindX Chat] ❗❗❗ handleActionStart called!', { data, opts })
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.currentAction = opts?.title || '执行中...'
      this.isProcessing = true
      console.log('[MindX Chat] isProcessing set to TRUE by handleActionStart')

      this.addMessage(targetSessionId, {
        role: 'action',
        content: '',
        eventType: 'action_start',
        eventTitle: opts?.title || '开始操作',
        eventData: data,
        metadata: { phase: 'start' }
      })
    },

    handleActionProgress(data: any) {
      if (data) {
        this.actionProgress = {
          completed: data.completed || 0,
          total: data.total || 0,
          status: data.status || ''
        }
      }
    },

    handleActionResult(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'action',
        content: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        eventType: 'action_result',
        eventTitle: `${data?.tool_name || '工具'} ${data?.success ? '成功' : '失败'}`,
        eventData: data,
        metadata: { phase: 'result', success: data?.success }
      })
    },

    handleActionEnd(data: any, opts?: { session_id?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.currentAction = null
      this.actionProgress = null

      this.addMessage(targetSessionId, {
        role: 'system',
        content: data?.summary || `操作完成: ${data?.success || 0}/${data?.total || 0} 成功`,
        eventType: 'action_end',
        eventTitle: '操作完成',
        eventData: data
      })
    },

    handleFinalAnswer(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      // 使用缓冲的完整内容（如果有）
      const finalContent = this.pendingContentBySession[targetSessionId] || data || ''
      // 清除缓冲
      delete this.pendingContentBySession[targetSessionId]

      this.addMessage(targetSessionId, {
        role: 'assistant',
        content: finalContent,
        eventType: 'final_answer',
        eventTitle: opts?.title || '最终答案'
      })

      this.isProcessing = false
    },

    handleExecutionSummary(data: any, envelope?: { session_id?: string; title?: string; meta?: any }) {
      const sessionStore = useSessionStore()
      const targetSessionId = envelope?.session_id || sessionStore.activeSessionId

      if (data && typeof data === 'object') {
        this.executionStats = {
          totalIterations: data.iterations || 0,
          toolCalls: data.tool_calls || 0,
          toolsUsed: data.tools_used || [],
          duration: data.duration || '',
          tokensUsed: data.tokens_used?.total_tokens || data.tokens_used || 0,
          inputTokens: data.tokens_used?.input_tokens || 0,
          outputTokens: data.tokens_used?.output_tokens || 0
        }

        const tokensUsed = this.executionStats.tokensUsed
        const cost = (tokensUsed / 1_000_000) * this.tokenPricePerMillion

        this.sessionTokensUsed += tokensUsed
        this.sessionCost += cost
        this.totalTokensUsed += tokensUsed
        this.totalCost += cost
        this.totalConversations += 1

        this.saveTokenStats()
        console.log('[MindX] Token stats updated:', { tokensUsed, cost, total: this.totalTokensUsed })
      }

      // 内部系统事件，不显示在消息历史中
    },

    handleError(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const errorContent = data || opts?.title || '发生错误'
      this.addMessage(targetSessionId, {
        role: 'system',
        content: errorContent,
        eventType: 'error',
        eventTitle: opts?.title || '❌ 错误',
        eventData: data
      })

      this.lastError = errorContent
      this.isProcessing = false
    },

    handleSubtaskSpawned(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'system',
        content: typeof data === 'string' ? data : '',
        eventType: 'subtask_spawned',
        eventTitle: opts?.title || '🌿 子任务生成',
        eventData: data,
        metadata: { phase: 'subtask_spawned' }
      })
    },

    handleSubtaskCompleted(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const content = typeof data === 'string' ? data : (data?.answer || data?.error || '')
      this.addMessage(targetSessionId, {
        role: 'system',
        content,
        eventType: 'subtask_completed',
        eventTitle: data?.success ? '✅ 子任务完成' : '❌ 子任务失败',
        eventData: data,
        metadata: { phase: 'subtask_completed', success: data?.success }
      })
    },

    handlePermissionRequest(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      const correlationId = data?.correlation_id || data?.correlationId || null
      if (correlationId) {
        this.pendingCorrelationId = correlationId
      }

      this.addMessage(targetSessionId, {
        role: 'system',
        content: '',
        eventType: 'permission_request',
        eventTitle: opts?.title || '🔒 权限请求',
        eventData: data,
        metadata: { phase: 'permission', correlationId }
      })
    },

    handleAskUserRequest(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      const correlationId = data?.correlation_id || data?.correlationId || null
      if (correlationId) {
        this.pendingCorrelationId = correlationId
      }

      this.addMessage(targetSessionId, {
        role: 'system',
        content: '',
        eventType: 'form',
        eventTitle: opts?.title || '💬 需要澄清',
        eventData: data,
        metadata: { phase: 'clarify', correlationId }
      })
    },

    handlePermissionDenied(data: any, opts?: { session_id?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'system',
        content: data || '权限被拒绝',
        eventType: 'permission_denied',
        eventTitle: '🚫 权限拒绝',
        eventData: data,
        metadata: { phase: 'denied' }
      })
    },

    handleCycleEnd(data: any, opts?: { session_id?: string }) {
      // 内部系统事件，不创建消息显示
    },

    handleTaskSummary(data: any, opts?: { session_id?: string; title?: string; meta?: any }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const summaryText = typeof data === 'string' ? data : (data?.summary || data || '')

      const inputTokens = opts?.meta?.input_tokens || data?.token_usage?.input_tokens || data?.input_tokens || 0
      const outputTokens = opts?.meta?.output_tokens || data?.token_usage?.output_tokens || data?.output_tokens || 0
      const totalTokens = typeof data === 'object' ? (data.token_usage?.total_tokens || data.total_tokens || inputTokens + outputTokens) : inputTokens + outputTokens

      if (totalTokens > 0) {
        const cost = (totalTokens / 1_000_000) * this.tokenPricePerMillion

        this.sessionTokensUsed += totalTokens
        this.sessionCost += cost
        this.totalTokensUsed += totalTokens
        this.totalCost += cost
        this.totalConversations += 1

        this.saveTokenStats()
        console.log('[MindX] Token stats updated from TaskSummary:', { totalTokens, cost })
      }

      this.addMessage(targetSessionId, {
        role: 'assistant',
        content: this.pendingContentBySession[targetSessionId] || summaryText,
        eventType: 'task_summary',
        eventTitle: opts?.title || '📋 任务总结',
        eventData: data,
        metadata: {
          phase: 'summary',
          inputTokens,
          outputTokens,
          totalTokens
        }
      })

      delete this.pendingContentBySession[targetSessionId]

      this.isProcessing = false
    },

    handleAgentTalkStart(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'system',
        content: typeof data === 'string' ? data : (data?.message || ''),
        eventType: 'agent_talk_start',
        eventTitle: opts?.title || '🤖 Agent 对话开始',
        eventData: data,
        metadata: { phase: 'agent_talk_start', to: data?.to }
      })
    },

    handleAgentTalkEnd(data: any, opts?: { session_id?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const content = typeof data === 'string' ? data : (data?.reply || data?.error || '')
      this.addMessage(targetSessionId, {
        role: 'system',
        content,
        eventType: 'agent_talk_end',
        eventTitle: '🤖 Agent 对话结束',
        eventData: data,
        metadata: { phase: 'agent_talk_end', to: data?.to, hasError: !!data?.error }
      })
    },

    handleCompaction(data: any, opts?: { session_id?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'system',
        content: '',
        eventType: 'compaction',
        eventTitle: '📦 上下文压缩',
        eventData: data,
        metadata: { phase: 'compaction' }
      })
    },

    handleMaxTurnsReached(data: any, opts?: { session_id?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'system',
        content: data?.suggestion || `已达到最大轮次 ${data?.turns_completed || '?'}/${data?.max_turns || '?'}`,
        eventType: 'max_turns_reached',
        eventTitle: '⚠️ 达到最大轮次',
        eventData: data,
        metadata: { phase: 'max_turns' }
      })

      this.isProcessing = false
    },

    handleGenericEvent(eventType: string, data: any, title?: string) {
      const sessionStore = useSessionStore()
      this.addMessage(sessionStore.activeSessionId, {
        role: 'system',
        content: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        eventType,
        eventTitle: title || eventType,
        eventData: data
      })
    },

    formatExecutionSummary(data: any): string {
      if (!data) return ''

      let md = '### 📊 执行摘要\n\n'

      if (data.rows && Array.isArray(data.rows)) {
        data.rows.forEach((row: Record<string, string>) => {
          const label = Object.keys(row)[0]
          const value = Object.values(row)[0]
          md += `- **${label}**: ${value}\n`
        })
      }

      return md
    },

    loadTokenStats() {
      try {
        const stats = localStorage.getItem('mindx_token_stats')
        if (stats) {
          const data = JSON.parse(stats)
          this.totalTokensUsed = data.totalTokensUsed || 0
          this.totalCost = data.totalCost || 0
          this.totalConversations = data.totalConversations || 0
          this.tokenPricePerMillion = data.tokenPricePerMillion || 1
        }
      } catch (e) {
        console.error('[MindX] Failed to load token stats:', e)
      }
    },

    saveTokenStats() {
      try {
        localStorage.setItem('mindx_token_stats', JSON.stringify({
          totalTokensUsed: this.totalTokensUsed,
          totalCost: this.totalCost,
          totalConversations: this.totalConversations,
          tokenPricePerMillion: this.tokenPricePerMillion
        }))
      } catch (e) {
        console.error('[MindX] Failed to save token stats:', e)
      }
    },

    resetSessionStats() {
      this.sessionTokensUsed = 0
      this.sessionCost = 0
    }
  },

  persist: {
    key: 'mindx-chat-messages',
    storage: localStorage,
    paths: ['messagesBySession']
  }
})
