import { defineStore } from 'pinia'
import { useConnectionStore } from './connectionStore'
import { useSessionStore } from './sessionStore'
import { getMindXClient } from '../services/websocket'
import type { SessionMessage } from '../types/websocket'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

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

    // 按 session 持久化的用量统计 (sessionId → { tokensUsed, cost })
    sessionTokenStats: {} as Record<string, { tokensUsed: number; cost: number }>,

    pendingCorrelationId: null as string | null,
    pendingContentBySession: {} as Record<string, string>,
    // GoReact 发送顺序: tool_use_delta → tool_exec_start → tool_exec_end
    // 此缓存用于在 start 到达前暂存 delta 数据，不做任何协议转换
    pendingToolUseDelta: null as { index: number; id: string; name: string; arguments: string } | null,

    // File modification tracking
    pendingFileModifications: [] as Array<{
      path: string
      diff: string
      additions: number
      deletions: number
      isNew: boolean
    }>,
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
      return this.currentMessages.filter(m => m.eventType === 'thinking_delta' || m.eventType === 'thinking_done')
    },

    actionMessages(): ChatMessage[] {
      return this.currentMessages.filter(m => m.eventType === 'tool_exec' || m.eventType === 'tool_exec_start' || m.eventType === 'tool_exec_end')
    },

    hasPendingFiles(): boolean {
      return this.pendingFileModifications.length > 0
    },
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
      if (!serverMessages || serverMessages.length === 0) {
        console.log('[MindX Chat] restoreSessionMessages: 服务器无消息数据', { sessionId })
        return
      }

      const restored: ChatMessage[] = []
      // 按 tool_call_id 索引待匹配的工具调用，支持一个 assistant 消息包含多个 tool_calls
      const pendingToolCalls = new Map<string, { name: string; args: any }>()
      // 记录每个 tool_call 发出时的 timestamp（秒），用于估算执行时长
      const toolCallStartTimestamps = new Map<string, number>()
      // 前一条消息的 timestamp，用于估算思考时长
      let prevTimestamp = 0

      for (let idx = 0; idx < serverMessages.length; idx++) {
        const msg = serverMessages[idx]
        const msgTimestamp = typeof msg.timestamp === 'number' ? msg.timestamp : 0

        // 先收集所有 tool_calls（一个 assistant 可能并发调用多个工具）
        const toolCalls = msg.tool_calls
        if (msg.role === 'assistant' && toolCalls && toolCalls.length > 0) {
          // 同一消息可能同时有 reasoning_content 和 tool_calls，先恢复思想流
          if (msg.reasoning_content && msg.reasoning_content.trim()) {
            const thinkDurationMs = prevTimestamp > 0 ? Math.round((msgTimestamp - prevTimestamp) * 1000) : 0
            restored.push({
              id: `restored_thinking_${idx}_${msg.timestamp}`,
              role: 'assistant',
              content: msg.reasoning_content,
              eventType: 'thinking_done',
              eventTitle: '💭 思考过程',
              metadata: { complete: true, duration_ms: thinkDurationMs },
              timestamp: new Date(msg.timestamp).toISOString(),
              sessionId
            })
          }
          for (const tc of toolCalls) {
            // GoReact 扁平格式 { id, name, arguments }
            pendingToolCalls.set(tc.id, {
              name: tc.name || '工具',
              args: tc.arguments ? (() => { try { return JSON.parse(tc.arguments) } catch { return tc.arguments } })() : null
            })
            toolCallStartTimestamps.set(tc.id, msgTimestamp)
          }
          prevTimestamp = msgTimestamp
          continue
        }

        // 通过 tool_call_id 精确匹配对应的工具调用
        if (msg.role === 'tool') {
          const match = pendingToolCalls.get(msg.tool_call_id || '')
          const toolName = match?.name || '工具'
          const toolArgs = match?.args || null
          const startTs = toolCallStartTimestamps.get(msg.tool_call_id || '')
          const durationMs = startTs ? Math.round((msgTimestamp - startTs) * 1000) : 0
          restored.push({
            id: `restored_tool_${idx}_${msg.timestamp}`,
            role: 'tool',
            content: msg.content || '',
            eventType: 'tool_exec',
            eventTitle: `${toolName}`,
            eventData: {
              start: { tool_name: toolName, params: toolArgs },
              end: { tool_name: toolName, success: true, result: msg.content || '', duration_ms: durationMs },
              status: 'done'
            },
            metadata: { phase: 'complete', success: true, tool_call_id: msg.tool_call_id },
            timestamp: new Date(msg.timestamp).toISOString(),
            sessionId
          })
          pendingToolCalls.delete(msg.tool_call_id || '')
          prevTimestamp = msgTimestamp
          continue
        }

        let role: MessageRole = 'system'
        let eventType: string | undefined
        let eventTitle = ''
        let eventData: any | undefined
        let metadata: any | undefined

        switch (msg.role) {
          case 'user':
            role = 'user'
            break
          case 'assistant': {
            // 先恢复思想流（reasoning_content 是 assistant 消息内嵌字段，非独立 role）
            if (msg.reasoning_content && msg.reasoning_content.trim()) {
              const thinkDurationMs = prevTimestamp > 0 ? Math.round((msgTimestamp - prevTimestamp) * 1000) : 0
              restored.push({
                id: `restored_thinking_${idx}_${msg.timestamp}`,
                role: 'assistant',       // 保持原始 role，不造 thinking
                content: msg.reasoning_content,
                eventType: 'thinking_done',
                eventTitle: '💭 思考过程',
                metadata: { complete: true, duration_ms: thinkDurationMs },
                timestamp: new Date(msg.timestamp).toISOString(),
                sessionId
              })
            }
            // 再恢复正文
            role = 'assistant'
            break
          }
          default:
            role = 'system'
            break
        }

        restored.push({
          id: `restored_${idx}_${msg.timestamp}`,
          role,
          content: msg.content || '',
          eventType,
          eventTitle,
          eventData,
          metadata,
          timestamp: new Date(msg.timestamp).toISOString(),
          sessionId
        })
        prevTimestamp = msgTimestamp
      }

      console.log('[MindX Chat] restoreSessionMessages:', {
        sessionId,
        totalServer: serverMessages.length,
        totalRestored: restored.length,
        actionCount: restored.filter(m => m.eventType === 'tool_exec' || m.eventType === 'tool_exec_start' || m.eventType === 'tool_exec_end').length
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
      this.executionStats = null
      this.pendingFileModifications = []
    },

    cancelProcessing() {
      // 1. 发送停止信号到后端
      const client = getMindXClient()
      if (client) {
        client.call('message.cancel', {}).catch((err: any) => {
          console.warn('[MindX] Cancel execution error:', err)
        })
      }

      // 2. 将所有正在执行的工具标记为"已取消"
      for (const sessionId in this.messagesBySession) {
        const messages = this.messagesBySession[sessionId]
        for (const msg of messages) {
          if (msg.eventType === 'tool_exec' && msg.eventData?.status === 'executing') {
            msg.eventData.status = 'failed'
            msg.eventData.end = {
              success: false,
              error: '用户取消了操作',
              tool_name: msg.eventTitle || ''
            }
          }
        }
      }

      // 3. 重置本地处理状态
      this.resetProcessingState()
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
        // GoReact 工具执行事件（严格对齐）
        case 'tool_use_delta':
          this.handleToolUseDelta(data, envelope?.title)
          break
        case 'tool_exec_start':
          this.handleToolExecStart(data, envelope?.title)
          break
        case 'tool_exec_end':
          this.handleToolExecEnd(data, envelope?.title)
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
        case 'file_modified':
          this.handleFileModified(data)
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
      this.currentThinking += data || ''

      const sessionStore = useSessionStore()
      const targetSessionId = sessionId || sessionStore.activeSessionId
      const messages = this.messagesBySession[targetSessionId]

      let thinkingMsg = messages?.find(m =>
        m.eventType === 'thinking_delta' || (m.eventType === 'thinking_done' && !m.metadata?.complete)
      )

      if (!thinkingMsg && targetSessionId) {
        thinkingMsg = this.addMessage(targetSessionId, {
          role: 'assistant',
          content: '',
          eventType: 'thinking_delta',
          eventTitle: '💭 思考中',
          metadata: { complete: false }
        })
      }

      if (thinkingMsg) {
        thinkingMsg.content = this.currentThinking
        thinkingMsg.eventType = 'thinking_delta'
      }
    },

    handleThinkingDone(data: any) {
      const sessionStore = useSessionStore()
      const targetSessionId = sessionStore.activeSessionId
      const messages = this.messagesBySession[targetSessionId]

      const content = typeof data === 'string' ? data : (data?.reasoning_content || data?.content || data?.text || '')

      let thinkingMsg = messages?.findLast(m =>
        m.eventType === 'thinking_delta' || (m.eventType === 'thinking_done' && !m.metadata?.complete)
      )

      if (thinkingMsg) {
        thinkingMsg.eventType = 'thinking_done'
        if (!thinkingMsg.content && content) {
          thinkingMsg.content = content
        }
        thinkingMsg.metadata = { ...thinkingMsg.metadata, complete: true }
      } else if (targetSessionId && content) {
        // 仅有 thinking_done 无 thinking_delta 时直接创建消息
        thinkingMsg = this.addMessage(targetSessionId, {
          role: 'assistant',
          content,
          eventType: 'thinking_done',
          eventTitle: '💭 思考过程',
          metadata: { complete: true }
        })
      }

      this.currentThinking = ''
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

    // --- GoReact ToolUseDelta ---
    // 来源: goreact/events/tool_use_delta.go → ToolUseDeltaData {index, id, name, arguments}
    // 触发时机: 在 tool_exec_start 之前到达（GoReact 流式循环先于 executeTools）
    handleToolUseDelta(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const messages = this.messagesBySession[targetSessionId]
      const toolMsg = messages?.findLast(m => m.eventType === 'tool_exec' && m.eventData?.status === 'executing')
      if (toolMsg && toolMsg.eventData?.start) {
        // 已有活跃工具执行 → 累积参数到 start.params
        if (!toolMsg.eventData.start.params) toolMsg.eventData.start.params = {}
        if (data?.arguments) {
          const existing = toolMsg.eventData.start.params['arguments'] || ''
          toolMsg.eventData.start.params['arguments'] = existing + data.arguments
        }
        if (data?.name) toolMsg.eventData.start.params['name'] = data.name
        if (data?.id) toolMsg.eventData.start.params['id'] = data.id
      } else {
        // 还没有 tool_exec_start → 暂存（GoReact 时序保证：delta 先于 start）
        this.pendingToolUseDelta = {
          index: data?.index ?? 0,
          id: data?.id || '',
          name: data?.name || '',
          arguments: data?.arguments || ''
        }
      }
    },

    // --- GoReact ToolExecStart ---
    // 来源: goreact/events/tool_exec.go → ToolExecStartData {tool_name, params, predicted_tokens}
    // 触发时机: goreact/agents/runtime.go executeSingleTool() L1370 emit
    handleToolExecStart(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      // tool_name 优先级: data.tool_name > pendingToolUseDelta.name > opts.title > '工具'
      const toolName = data?.tool_name || this.pendingToolUseDelta?.name || opts?.title || '工具'
      this.currentAction = toolName
      this.isProcessing = true

      // 直接透传 GoReact 原始数据，如有缓存的 delta 则合并 arguments 到 params
      const startData = { ...data }
      // 如果 GoReact 没传 tool_name（旧版兼容），用我们确定的名称回填
      if (!startData.tool_name && toolName !== '工具') {
        startData.tool_name = toolName
      }
      if (this.pendingToolUseDelta && !startData.params) {
        try {
          startData.params = JSON.parse(this.pendingToolUseDelta.arguments)
        } catch {
          startData.params = { arguments: this.pendingToolUseDelta.arguments }
        }
        this.pendingToolUseDelta = null
      }

      this.addMessage(targetSessionId, {
        role: 'tool',
        content: '',
        eventType: 'tool_exec',
        eventTitle: toolName,
        eventData: {
          start: startData,
          end: null,
          status: 'executing'
        },
        metadata: { phase: 'active' }
      })
    },

    // --- GoReact ToolExecEnd ---
    // 来源: goreact/events/tool_exec.go → ToolExecEndData {tool_name, tool_call_id, success, result, error, duration_ms}
    // 触发时机: goreact/agents/runtime.go executeSingleTool() L1393 emit
    handleToolExecEnd(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const messages = this.messagesBySession[targetSessionId]

      const toolMsg = messages?.findLast(m => m.eventType === 'tool_exec' && m.eventData?.status === 'executing')
      if (toolMsg && toolMsg.eventData) {
        toolMsg.eventData.end = data
        toolMsg.eventData.status = data?.success !== false ? 'done' : 'failed'

        this.currentAction = null
      }
    },

    // --- FileModified: 工具执行后文件变更通知 ---
    // 注意：后端 RespFileModified 发射的是 {files: []string}（纯文件路径数组）
    // 此函数将路径数组转为前端需要的对象格式
    handleFileModified(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const rawFiles: any[] = data?.files || []

      // 兼容：后端发射 []string，前端需要 Array<{path, diff, additions, deletions, isNew}>
      const files = rawFiles.map((f: any) =>
        typeof f === 'string'
          ? { path: f, diff: '', additions: 0, deletions: 0, isNew: false }
          : {
              path: f.path || '',
              diff: f.diff || '',
              additions: f.additions || 0,
              deletions: f.deletions || 0,
              isNew: f.isNew || false
            }
      )

      this.pendingFileModifications = files

      for (const file of files) {
        this.addMessage(targetSessionId, {
          role: 'system',
          content: '',
          eventType: 'file_modified',
          eventTitle: file.path,
          eventData: file,
          metadata: { phase: 'modified' }
        })
      }
    },

    handleFinalAnswer(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      const finalContent = this.pendingContentBySession[targetSessionId] || data || ''
      delete this.pendingContentBySession[targetSessionId]

      this.addMessage(targetSessionId, {
        role: 'assistant',
        content: finalContent,
        eventType: 'final_answer',
        eventTitle: opts?.title || '最终答案'
      })

      this.isProcessing = false
    },

    handleTokenUsageRecorded(data: any, envelope?: { session_id?: string; title?: string; meta?: any }) {
      if (data && typeof data === 'object') {
        const tokensUsed = data.total_tokens || 0
        const inputTokens = data.prompt_tokens || 0
        const outputTokens = data.completion_tokens || 0
        const cost = (tokensUsed / 1_000_000) * this.tokenPricePerMillion

        this.sessionTokensUsed += tokensUsed
        this.sessionCost += cost
        this.totalTokensUsed += tokensUsed
        this.totalCost += cost

        this.saveTokenStats()
        console.log('[MindX] Token usage recorded:', { inputTokens, outputTokens, tokensUsed, cost, total: this.totalTokensUsed })
      }
    },

    handleExecutionSummary(data: any, envelope?: { session_id?: string; title?: string; meta?: any }) {
      const sessionStore = useSessionStore()
      const targetSessionId = envelope?.session_id || sessionStore.activeSessionId

      if (data && typeof data === 'object') {
        // 优先从 meta 读取结构化 token 数据（后端 WithResponseMeta 提供）
        const metaTokens = envelope?.meta?.tokens_used
        const dataTokens = data.tokens_used
        const tokensUsed = metaTokens?.total_tokens || dataTokens?.total_tokens || dataTokens || 0

        this.executionStats = {
          totalIterations: envelope?.meta?.iterations || data.iterations || 0,
          toolCalls: envelope?.meta?.tool_calls || data.tool_calls || 0,
          toolsUsed: data.tools_used || [],
          duration: envelope?.meta?.duration || data.duration || '',
          tokensUsed,
          inputTokens: metaTokens?.input_tokens || dataTokens?.input_tokens || 0,
          outputTokens: metaTokens?.output_tokens || dataTokens?.output_tokens || 0
        }

        const cost = (tokensUsed / 1_000_000) * this.tokenPricePerMillion

        this.sessionTokensUsed += tokensUsed
        this.sessionCost += cost
        this.totalTokensUsed += tokensUsed
        this.totalCost += cost
        this.totalConversations += 1

        this.saveTokenStats()
        console.log('[MindX] Token stats updated from ExecutionSummary:', { tokensUsed, cost, total: this.totalTokensUsed })
      }
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

    handleTaskSummary(data: any, opts?: { session_id?: string; title?: string; meta?: any }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const summaryText = typeof data === 'string' ? data : (data?.summary || data || '')

      // 注意：token 统一由 ExecutionSummary（权威来源）和 token_usage_recorded（实时）更新
      // TaskSummary 不再重复更新 token 计数，避免与 ExecutionSummary 重复计算
      const inputTokens = opts?.meta?.input_tokens || data?.token_usage?.input_tokens || data?.input_tokens || 0
      const outputTokens = opts?.meta?.output_tokens || data?.token_usage?.output_tokens || data?.output_tokens || 0
      const totalTokens = typeof data === 'object' ? (data.token_usage?.total_tokens || data.total_tokens || inputTokens + outputTokens) : inputTokens + outputTokens

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
      const sessionStore = useSessionStore()
      try {
        localStorage.setItem('mindx_token_stats', JSON.stringify({
          totalTokensUsed: this.totalTokensUsed,
          totalCost: this.totalCost,
          totalConversations: this.totalConversations,
          tokenPricePerMillion: this.tokenPricePerMillion
        }))

        // 同时持久化当前 session 的用量
        if (sessionStore.activeSessionId) {
          this.sessionTokenStats[sessionStore.activeSessionId] = {
            tokensUsed: this.sessionTokensUsed,
            cost: this.sessionCost
          }
          localStorage.setItem('mindx_session_token_stats', JSON.stringify(this.sessionTokenStats))
        }
      } catch (e) {
        console.error('[MindX] Failed to save token stats:', e)
      }
    },

    loadSessionTokenStats(sessionId: string) {
      try {
        const raw = localStorage.getItem('mindx_session_token_stats')
        if (raw) {
          const allStats = JSON.parse(raw)
          const stats = allStats[sessionId]
          if (stats && typeof stats.tokensUsed === 'number') {
            this.sessionTokensUsed = stats.tokensUsed
            this.sessionCost = stats.cost
            this.sessionTokenStats = allStats
            console.log(`[MindX] Restored session token stats for ${sessionId}:`, stats)
            return
          }
        }
      } catch (e) {
        console.error('[MindX] Failed to load session token stats:', e)
      }
      this.sessionTokensUsed = 0
      this.sessionCost = 0
    },

    resetSessionStats() {
      this.sessionTokensUsed = 0
      this.sessionCost = 0
    }
  }
})
