import { defineStore } from 'pinia'
import { useConnectionStore } from './connectionStore'
import { useSessionStore } from './sessionStore'
import { getMindXClient } from '../services/websocket'
import type { SessionMessage } from '../types/websocket'
import i18n from '../i18n'

const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params)

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
  agentName?: string
}

/** TaskXXX 工具系列维护的任务项，与会话绑定 */
export interface TaskItem {
  id: string
  subject: string
  description?: string
  status: string // 'pending' | 'in_progress' | 'completed' | 'cancelled'
  owner?: string
  activeForm?: string
  blockedBy?: string[]
  blocks?: string[]
  metadata?: Record<string, any>
  createdAt?: string
}

const TASK_TOOL_NAMES = new Set(['TaskCreate', 'TaskUpdate', 'TaskList'])

/** 判断工具名是否属于 TaskXXX 系列（用于持久 Todo List 视图） */
export function isTaskTool(name: string): boolean {
  return TASK_TOOL_NAMES.has(name)
}

export interface ExecutionStats {
  totalIterations: number
  toolCalls: number
  toolsUsed: string[]
  duration: string
  tokensUsed: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
}

/** 单次 token_usage_recorded 事件的明细记录 */
export interface TokenUsageRecord {
  timestamp: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
  cost: number
  sessionId: string
  title?: string
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

    // 按 session 缓存的最后一条消息 token 数据，刷新后恢复用
    sessionMessageTokens: {} as Record<string, { inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number } | null>,

    // 当前会话的 TokenUsage 实时明细记录
    tokenUsageRecords: [] as TokenUsageRecord[],

    // 切换会话时正在恢复历史消息（骨架屏用）
    isRestoringSession: false as boolean,
    isCompacting: false as boolean,
    // 消息已加载完毕待揭晓（ChatArea 先滚动底部再移除骨架屏）
    sessionRevealPending: false as boolean,

    // 只看答案模式 — 隐藏执行过程，只显示用户问题和 LLM 最终回答
    showAnswerOnly: false as boolean,

    pendingCorrelationId: null as string | null,
    pendingPermissionToolName: '' as string,
    pendingContentBySession: {} as Record<string, string>,
    // goharness 发送顺序: tool_use_delta → tool_exec_start → tool_exec_end
    // 此缓存用于在 start 到达前暂存 delta 数据，不做任何协议转换
    pendingToolUseDelta: null as { index: number; id: string; name: string; arguments: string } | null,

    // 从其他组件（如 AgentSelectorDialog）填入主输入框的文本
    pendingInputText: '' as string,

    // 追踪每个 session 当前正在产生事件的 agent，用于标记消息来源
    sessionCurrentAgentName: {} as Record<string, string>,

    // 子Agent 对话流 — 按 sessionId → subSessionId → ChatMessage[] 存储
    subtaskMessagesBySession: {} as Record<string, Record<string, ChatMessage[]>>,
    // 活跃子任务索引 — 按 sessionId → [{session_id, agent_name}]
    activeSubtasksBySession: {} as Record<string, Array<{ session_id: string; agent_name: string }>>,

    // TaskXXX 工具系列 — 会话级 task map（taskId → TaskItem），由 TaskCreate/Update/List 工具事件驱动
    tasksBySession: {} as Record<string, Record<string, TaskItem>>,
    // 会话级最后一次 TaskCreate 时间戳（ms），用于判断新一轮
    _lastTaskCreateTs: {} as Record<string, number>,
    // 每个会话第一条 TaskXXX 工具消息 id，作为持久 Todo List 块的渲染锚点
    firstTaskToolMessageIdBySession: {} as Record<string, string>,

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

    /** 当前会话是否有活跃任务（未完成的任务列表） */
    hasActiveTaskList(): boolean {
      const sessionStore = useSessionStore()
      const sid = sessionStore.activeSessionId
      // 用户手动关闭后，sessionStorage 记录防止刷新恢复
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(`task-list-dismissed:${sid}`)) return false
      const map = this.tasksBySession[sid]
      if (!map) return false
      return Object.values(map).some(t => t.status !== 'completed' && t.status !== 'cancelled')
    },
  },

  actions: {
    setSessionCurrentAgent(sessionId: string, agentName?: string) {
      if (agentName) {
        this.sessionCurrentAgentName[sessionId] = agentName
      }
    },

    addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp' | 'sessionId'>): ChatMessage {
      if (!this.messagesBySession[sessionId]) {
        this.messagesBySession[sessionId] = []
      }

      const newMessage: ChatMessage = {
        ...message,
        agentName: message.agentName || this.sessionCurrentAgentName[sessionId],
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
      delete this.tasksBySession[sessionId]
      delete this.firstTaskToolMessageIdBySession[sessionId]
      this.resetProcessingState()
    },

    async retryFromError(errorMessageId: string) {
      const targetSessionId = useSessionStore().activeSessionId
      const msgs = this.messagesBySession[targetSessionId]
      if (!msgs || msgs.length === 0) return

      const errIdx = msgs.findIndex(m => m.id === errorMessageId)
      if (errIdx < 0) return

      // walk backwards from the error to find the last user message before it
      let userIdx = -1
      for (let i = errIdx - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          userIdx = i
          break
        }
      }
      if (userIdx < 0) return

      const lastUserContent = msgs[userIdx].content

      // step 1: truncate server-side session so the daemon does not see
      // the failed exchange when we resend
      try {
        const client = getMindXClient()
        if (client) {
          await client.call('session.truncate', { session_id: targetSessionId })
        }
      } catch (e) {
        console.warn('[ChatStore] session.truncate failed, retrying anyway:', e)
      }

      // step 2: remove everything from the last user message onwards locally
      // (old user message + assistant responses + error)
      this.messagesBySession[targetSessionId] = msgs.slice(0, userIdx)
      this.resetProcessingState()

      // step 3: resend via sendMessage which will addUserMessage + send via WebSocket
      this.sendMessage(lastUserContent)
    },

    restoreSessionMessages(sessionId: string, serverMessages: SessionMessage[]) {
      if (!serverMessages || serverMessages.length === 0) {
        return
      }

      const restored: ChatMessage[] = []
      // 按 tool_call_id 索引待匹配的工具调用，支持一个 assistant 消息包含多个 tool_calls
      const pendingToolCalls = new Map<string, { name: string; args: any }>()
      // 记录每个 tool_call 发出时的 timestamp（秒），用于估算执行时长
      const toolCallStartTimestamps = new Map<string, number>()
      // 前一条消息的 timestamp，用于估算思考时长
      let prevTimestamp = 0
      // subSessionID → {agent_name, description} 映射，用于 subtask_completed 恢复
      const subSessionInfoMap: Record<string, { agent_name: string; description: string }> = {}

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
              eventTitle: '💭 ' + t('message.thinking'),
              metadata: { complete: true, duration_ms: thinkDurationMs },
              timestamp: new Date(msg.timestamp).toISOString(),
              sessionId
            })
          }
          for (const tc of toolCalls) {
            // goharness 扁平格式 { id, name, arguments }
            pendingToolCalls.set(tc.id, {
              name: tc.name || t('message.toolUse'),
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
          const toolName = match?.name || 'tool'
          const toolArgs = match?.args || null
          const startTs = toolCallStartTimestamps.get(msg.tool_call_id || '')
          const durationMs = startTs ? Math.round((msgTimestamp - startTs) * 1000) : 0
          const content = msg.content || ''

          // 检测 SubAgent 工具调用（按工具名称匹配）
          // SubAgent 工具的结果以 JSON 格式存储在 session 中:
          //   {"status":"running","agent_name":"<agentName>","session_id":"<ULID>"}
          // 注意：task 描述不会保存在 tool 结果里，只在实时 WebSocket 的 subtask_spawned 事件中有
          if (toolName === 'SubAgent') {
            let agentName = ''
            let sessionID = ''
            try {
              const parsed = JSON.parse(content)
              agentName = parsed.agent_name || ''
              sessionID = parsed.session_id || ''
            } catch (e) {

            }

            if (sessionID) subSessionInfoMap[sessionID] = { agent_name: agentName, description: toolArgs?.task || '' }
            restored.push({
              id: `restored_tool_${idx}_${msg.timestamp}`,
              role: 'system',
              content,
              eventType: 'subtask_spawned',
              eventTitle: t('message.subtaskSpawned'),
              eventData: { session_id: sessionID, agent_name: agentName, description: '' },
              metadata: { phase: 'subtask_spawned' },
              timestamp: new Date(msg.timestamp).toISOString(),
              sessionId
            })
          } else if (toolName === 'CollectResults') {
            // CollectResults 工具返回子任务完成结果，格式（JSON 数组）：
            //   [{"session_id":"<ULID>","agent_name":"<agentName>","status":"completed","result":"<answer>"}, ...]
            // 兼容旧格式（文本）：
            //   "[subagent-N] completed (session:abc123):\n<answer>"
            console.log('[MindX Chat] restoreSessionMessages: CollectResults raw content:', content)
            let matchedAny = false

            // 尝试 JSON 格式解析
            let jsonEntries: Array<{ session_id: string; status: string; result?: string; error?: string; agent_name?: string }> | null = null
            try {
              const parsed = JSON.parse(content)
              if (Array.isArray(parsed) && parsed.length > 0) {
                jsonEntries = parsed
                console.log('[MindX Chat] restoreSessionMessages: JSON.parse success', { count: parsed.length })
              } else {
                console.log('[MindX Chat] restoreSessionMessages: JSON.parse failed (not an array or empty)', { type: typeof parsed, isArray: Array.isArray(parsed), length: parsed?.length })
              }
            } catch (e) {
              console.log('[MindX Chat] restoreSessionMessages: JSON.parse failed, falling back to text regex', { error: (e as Error)?.message })
            }

            if (jsonEntries) {
              for (const entry of jsonEntries) {
                matchedAny = true
                const subSessionID = entry.session_id || ''
                const isSuccess = entry.status === 'completed'
                const agentName = entry.agent_name || subSessionInfoMap[subSessionID]?.agent_name || ''
                const answer = isSuccess ? (entry.result || '') : ''
                const errorMsg = isSuccess ? '' : (entry.error || '')
                restored.push({
                  id: `restored_tool_${idx}_${msg.timestamp}_${subSessionID}`,
                  role: 'system',
                  content: JSON.stringify(entry),
                  eventType: 'subtask_completed',
                  eventTitle: isSuccess ? t('message.subtaskCompleted') : t('message.subtaskFailed'),
                  eventData: {
                    session_id: subSessionID,
                    agent_name: agentName,
                    description: subSessionInfoMap[subSessionID]?.description || '',
                    success: isSuccess,
                    answer,
                    error: errorMsg
                  },
                  metadata: { phase: 'subtask_completed', success: isSuccess },
                  timestamp: new Date(msg.timestamp).toISOString(),
                  sessionId
                })
              }
            } else {
              // 兼容旧格式：文本解析
              const subtaskCompletedPattern = /\[([^\]]+)\]\s+(completed|failed)\s*(?:\(session:([^)]+)\))?:\s*(.*)/s
              const lines = content.split('\n---\n')
              for (const line of lines) {
                const m = line.match(subtaskCompletedPattern)
                if (m) {
                  matchedAny = true
                  const sessionIDFromText = m[3] || ''
                  const isSuccess = m[2] === 'completed'
                  const agentNameFromText = m[1]
                  const rest = m[4].trim()
                  console.log('[MindX Chat] restoreSessionMessages: detected CollectResults (legacy text)', { sessionID: sessionIDFromText, isSuccess })
                  restored.push({
                    id: `restored_tool_${idx}_${msg.timestamp}_${sessionIDFromText}`,
                    role: 'system',
                    content: line,
                    eventType: 'subtask_completed',
                    eventTitle: isSuccess ? t('message.subtaskCompleted') : t('message.subtaskFailed'),
                    eventData: {
                      session_id: sessionIDFromText,
                      agent_name: subSessionInfoMap[sessionIDFromText]?.agent_name || agentNameFromText || '',
                      description: subSessionInfoMap[sessionIDFromText]?.description || '',
                      success: isSuccess,
                      answer: isSuccess ? rest : '',
                      error: isSuccess ? '' : rest
                    },
                    metadata: { phase: 'subtask_completed', success: isSuccess },
                    timestamp: new Date(msg.timestamp).toISOString(),
                    sessionId
                  })
                }
              }
            }
            // 未匹配到任何子任务结果时，降级为普通 tool 事件
            if (!matchedAny) {
              restored.push({
                id: `restored_tool_${idx}_${msg.timestamp}`,
                role: 'tool',
                content,
                eventType: 'tool_exec',
                eventTitle: `${toolName}`,
                eventData: {
                  start: { tool_name: toolName, params: toolArgs },
                  end: { tool_name: toolName, success: true, result: content, duration_ms: durationMs },
                  status: 'done'
                },
                metadata: { phase: 'complete', success: true, tool_call_id: msg.tool_call_id },
                timestamp: new Date(msg.timestamp).toISOString(),
                sessionId
              })
            }
          } else if (toolName === 'AskUser') {
            // AskUser 工具从 tool_call 参数重建 form 事件，显示问题表单
            const formData: Record<string, any> = {}
            if (toolArgs) {
              formData.correlation_id = `restored_${msg.timestamp}`
              const questions: any[] = []
              // AskUser 参数格式：{ question: "...", options: [...], multiSelect: bool }
              if (toolArgs.question) {
                questions.push({
                  question: toolArgs.question,
                  options: Array.isArray(toolArgs.options) ? toolArgs.options : [],
                  multi_select: !!toolArgs.multiSelect
                })
              }
              if (questions.length > 0) {
                formData.questions = questions
              }
            }
            restored.push({
              id: `restored_form_${idx}_${msg.timestamp}`,
              role: 'system',
              content: '',
              eventType: 'form',
              eventTitle: t('message.clarification'),
              eventData: formData,
              metadata: { phase: 'clarify' },
              timestamp: new Date(msg.timestamp).toISOString(),
              sessionId
            })
          } else {
            restored.push({
              id: `restored_tool_${idx}_${msg.timestamp}`,
              role: 'tool',
              content,
              eventType: 'tool_exec',
              eventTitle: `${toolName}`,
              eventData: {
                start: { tool_name: toolName, params: toolArgs },
                end: { tool_name: toolName, success: true, result: content, duration_ms: durationMs },
                status: 'done'
              },
              metadata: { phase: 'complete', success: true, tool_call_id: msg.tool_call_id },
              timestamp: new Date(msg.timestamp).toISOString(),
              sessionId
            })
          }
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
                eventTitle: '💭 ' + t('message.thinking'),
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
            // 检测 subtask 历史消息（后端存的是 markdown 文本格式，仅兼容旧数据）
            if (msg.content) {
              const c = msg.content
              const subtaskMatch = c.match(/^### .+: `([^`]+)`/m)
              if (subtaskMatch) {
                const extractField = (pattern: RegExp) => {
                  const m = c.match(pattern)
                  return m ? m[1].trim() : ''
                }
                if (c.indexOf('**Agent**:') >= 0) {
                  // subtask_spawned
                  eventType = 'subtask_spawned'
                  eventData = {
                    session_id: '',
                    agent_name: extractField(/\*\*Agent\*\*: (.+)/),
                    description: extractField(/\*\*(?:描述|Description)\*\*: (.+)/m)
                  }
                  eventTitle = t('message.subtaskSpawned')
                } else if (c.indexOf('**结果**:') >= 0 || c.indexOf('**Answer**:') >= 0) {
                  // subtask_completed success
                  eventType = 'subtask_completed'
                  eventData = {
                    session_id: '',
                    agent_name: extractField(/\*\*Agent\*\*: (.+)/) || '',
                    description: '',
                    success: true,
                    answer: extractField(/\*\*(?:结果|Answer)\*\*:\s*(.+)/m)
                  }
                  eventTitle = t('message.subtaskCompleted')
                } else if (c.indexOf('**错误**:') >= 0 || c.indexOf('**Error**:') >= 0) {
                  // subtask_completed failed
                  eventType = 'subtask_completed'
                  eventData = {
                    session_id: '',
                    agent_name: extractField(/\*\*Agent\*\*: (.+)/) || '',
                    description: '',
                    success: false,
                    error: extractField(/\*\*(?:错误|Error)\*\*:\s*(.+)/m)
                  }
                  eventTitle = t('message.subtaskFailed')
                }
              }
            }
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



      // 从 localStorage 恢复 token 数据
      const cachedTokens = localStorage.getItem('mindx_chat_message_tokens')
      const tokenCache: Record<string, any> = cachedTokens ? JSON.parse(cachedTokens) : {}
      const sessionTokens = tokenCache[sessionId]
      if (sessionTokens) {
        this.sessionMessageTokens[sessionId] = sessionTokens
        // 找到最后一条 task_summary，注入 token 数据
        for (let i = restored.length - 1; i >= 0; i--) {
          if (restored[i].eventType === 'task_summary') {
            restored[i].metadata = {
              ...restored[i].metadata,
              inputTokens: sessionTokens.inputTokens,
              outputTokens: sessionTokens.outputTokens,
              cacheTokens: sessionTokens.cacheTokens,
              totalTokens: sessionTokens.totalTokens
            }
            break
          }
        }
      }

      this.messagesBySession[sessionId] = restored

      // 恢复 TaskXXX 工具事件到会话级 task map，并注册持久 Todo List 块锚点
      for (const m of restored) {
        if (m.eventType === 'tool_exec' && m.eventTitle && isTaskTool(m.eventTitle)) {
          if (!this.firstTaskToolMessageIdBySession[sessionId]) {
            this.firstTaskToolMessageIdBySession[sessionId] = m.id
          }
          const end = m.eventData?.end
          if (end) {
            this.ingestTaskToolEnd(
              sessionId,
              m.eventTitle,
              m.eventData?.start?.params,
              end.result,
              end.success !== false
            )
          }
        }
      }
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
              error: t('message.userCancelled'),
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
          this.lastError = t('message.timeout', { msg: t('chat.store.timeout.serverNoResponse') })
        }, 60000)

        return { sent: true, queued: false }
      } else {
        this.offlineMessageQueue.push({
          text,
          timestamp: new Date().toISOString(),
          sessionId: targetSessionId
        })

        this.lastError = t('chat.offlineMode')
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
        // goharness 工具执行事件（严格对齐）
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
          eventTitle: '💭 ' + t('chat.thinking'),
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
          eventTitle: '💭 ' + t('message.thinking'),
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

    // --- goharness ToolUseDelta ---
    // 来源: goharness/events/tool_use_delta.go → ToolUseDeltaData {index, id, name, arguments}
    // 触发时机: 在 tool_exec_start 之前到达（goharness 流式循环先于 executeTools）
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
        // 还没有 tool_exec_start → 暂存（goharness 时序保证：delta 先于 start）
        this.pendingToolUseDelta = {
          index: data?.index ?? 0,
          id: data?.id || '',
          name: data?.name || '',
          arguments: data?.arguments || ''
        }
      }
    },

    // --- goharness ToolExecStart ---
    // 来源: goharness/events/tool_exec.go → ToolExecStartData {tool_name, params, predicted_tokens}
    // 触发时机: goharness/agents/runtime.go executeSingleTool() L1370 emit
    handleToolExecStart(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      // tool_name 优先级: data.tool_name > pendingToolUseDelta.name > opts.title > '工具'
      const toolName = data?.tool_name || this.pendingToolUseDelta?.name || opts?.title || t('message.toolUse')
      // AskUser 工具有专用视图 AskUserView，跳过 tool_exec 避免重复显示
      if (toolName === 'AskUser') return
      this.currentAction = toolName
      this.isProcessing = true

      // 直接透传 goharness 原始数据，如有缓存的 delta 则合并 arguments 到 params
      const startData = { ...data }
      // 如果 goharness 没传 tool_name（旧版兼容），用我们确定的名称回填
      if (!startData.tool_name && toolName !== t('message.toolUse')) {
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

      const msg = this.addMessage(targetSessionId, {
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

      // TaskXXX 工具：注册持久 Todo List 块的渲染锚点（仅该会话首次）
      if (isTaskTool(toolName) && !this.firstTaskToolMessageIdBySession[targetSessionId]) {
        this.firstTaskToolMessageIdBySession[targetSessionId] = msg.id
      }
    },

    // --- goharness ToolExecEnd ---
    // 来源: goharness/events/tool_exec.go → ToolExecEndData {tool_name, tool_call_id, success, result, error, duration_ms}
    // 触发时机: goharness/agents/runtime.go executeSingleTool() L1393 emit
    handleToolExecEnd(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const messages = this.messagesBySession[targetSessionId]

      const toolMsg = messages?.findLast(m => m.eventType === 'tool_exec' && m.eventData?.status === 'executing')
      if (toolMsg && toolMsg.eventData) {
        toolMsg.eventData.end = data
        // 失败判定：后端显式返回 success=false，或 error 字段非空
        const failed = data?.success === false || !!data?.error
        toolMsg.eventData.status = failed ? 'failed' : 'done'

        // TaskXXX 工具：将结果 ingest 到会话级 task map
        const endToolName = data?.tool_name || toolMsg.eventTitle || ''
        if (isTaskTool(endToolName)) {
          this.ingestTaskToolEnd(
            targetSessionId,
            endToolName,
            toolMsg.eventData.start?.params,
            data?.result,
            !failed
          )
        }

        this.currentAction = null
      }
    },

    /**
     * 将 TaskXXX 工具的执行结果 ingest 到会话级 task map。
     * - TaskCreate: 新增一个 task（默认 pending）
     * - TaskUpdate: 按 task_id 更新 status / subject / owner / active_form / 依赖等
     * - TaskList:   用返回的快照整体刷新 task map（最权威来源）
     * 失败的工具调用不更新 map。
     */
    ingestTaskToolEnd(sessionId: string, toolName: string, startParams: any, endResult: string, success: boolean) {
      if (!success) return
      if (!this.tasksBySession[sessionId]) this.tasksBySession[sessionId] = {}

      let parsed: any = null
      if (endResult) {
        try {
          parsed = JSON.parse(endResult)
        } catch {
          parsed = null
        }
      }
      if (!parsed || typeof parsed !== 'object') return

      const map = this.tasksBySession[sessionId]

      if (toolName === 'TaskCreate') {
        const id = parsed.task_id
        if (!id) return

        // 距上次 TaskCreate 超过 3 秒 → 新一轮，清空旧列表
        const now = Date.now()
        const lastTs = this._lastTaskCreateTs[sessionId] || 0
        if (lastTs > 0 && now - lastTs > 3000) {
          this.tasksBySession[sessionId] = {}
        }
        this._lastTaskCreateTs[sessionId] = now

        this.tasksBySession[sessionId][id] = {
          id,
          subject: parsed.subject || startParams?.subject || '',
          description: parsed.description || startParams?.description || '',
          status: parsed.status || 'pending',
          activeForm: parsed.active_form || startParams?.active_form || '',
          metadata: parsed.metadata || {},
        }
      } else if (toolName === 'TaskUpdate') {
        const id = parsed.task_id || startParams?.task_id
        if (!id) return
        const prev = map[id] || { id, subject: '', status: 'pending' }
        const patch: TaskItem = { ...prev }
        if (parsed.status) patch.status = parsed.status
        if (startParams) {
          if (startParams.subject) patch.subject = startParams.subject
          if (startParams.description) patch.description = startParams.description
          if (startParams.owner) patch.owner = startParams.owner
          if (startParams.active_form) patch.activeForm = startParams.active_form
          if (Array.isArray(startParams.addBlocks)) {
            patch.blocks = Array.from(new Set([...(prev.blocks || []), ...startParams.addBlocks]))
          }
          if (Array.isArray(startParams.addBlockedBy)) {
            patch.blockedBy = Array.from(new Set([...(prev.blockedBy || []), ...startParams.addBlockedBy]))
          }
          if (startParams.metadata && typeof startParams.metadata === 'object') {
            const merged = { ...(prev.metadata || {}) }
            for (const [k, v] of Object.entries(startParams.metadata)) {
              if (v === null) delete merged[k]
              else merged[k] = v
            }
            patch.metadata = merged
          }
        }
        map[id] = patch
      } else if (toolName === 'TaskList') {
        const tasks = parsed.tasks
        if (Array.isArray(tasks)) {
          const fresh: Record<string, TaskItem> = {}
          for (const tk of tasks) {
            if (tk && tk.task_id) {
              fresh[tk.task_id] = {
                id: tk.task_id,
                subject: tk.subject || '',
                status: tk.status || 'pending',
                owner: tk.owner,
                activeForm: tk.active_form,
                blockedBy: Array.isArray(tk.blocked_by) ? tk.blocked_by : undefined,
                metadata: tk.metadata,
                createdAt: tk.created_at,
              }
            }
          }
          this.tasksBySession[sessionId] = fresh
        }
      }
    },

    clearTaskList(sessionId: string) {
      delete this.tasksBySession[sessionId]
      delete this.firstTaskToolMessageIdBySession[sessionId]
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

      const sessionMessages = this.messagesBySession[targetSessionId] || []
      for (const file of files) {
        // Deduplicate: if a file_modified message for this path already exists,
        // update it in place instead of appending another DiffView.
        const existingIdx = sessionMessages.findIndex(
          m => m.eventType === 'file_modified' && (m.eventTitle || m.eventData?.path) === file.path
        )
        if (existingIdx >= 0) {
          sessionMessages[existingIdx].eventTitle = file.path
          sessionMessages[existingIdx].eventData = file
          continue
        }
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

      // final_answer 之后必定紧跟 task_summary（同一同步块内连续发射），
      // task_summary 携带相同内容 + token 元数据。
      // 此处只做状态清理，不添加消息，由 handleTaskSummary 渲染最终显示。
      this.isProcessing = false
    },

    handleTokenUsageRecorded(data: any, envelope?: { session_id?: string; title?: string; meta?: any }) {
      if (data && typeof data === 'object') {
        // total_tokens = prompt_tokens + completion_tokens (raw sum)
        // cached_tokens 是 prompt 中被缓存命中的部分，不计入计费消耗
        // 有效消耗 = total_tokens - cached_tokens
        const cachedTokens = data.prompt_tokens_details?.cached_tokens || 0
        const tokensUsed = (data.total_tokens || 0) - cachedTokens
        const inputTokens = data.prompt_tokens || 0
        const outputTokens = data.completion_tokens || 0

        // 优先使用服务端提供的 cost（精确按模型实际定价计算）
        // 否则用本地固定单价估算
        let cost: number
        if (typeof data.cost === 'number' && !isNaN(data.cost)) {
          cost = data.cost
        } else {
          cost = (tokensUsed / 1_000_000) * this.tokenPricePerMillion
        }

        this.sessionTokensUsed += tokensUsed
        this.sessionCost += cost
        this.totalTokensUsed += tokensUsed
        this.totalCost += cost

        // 记录明细
        this.tokenUsageRecords.push({
          timestamp: new Date().toISOString(),
          inputTokens,
          outputTokens,
          cachedTokens,
          totalTokens: data.total_tokens || 0,
          cost,
          sessionId: envelope?.session_id || '',
          title: envelope?.title
        })


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
          outputTokens: metaTokens?.output_tokens || dataTokens?.output_tokens || 0,
          cacheTokens: metaTokens?.cache_tokens || dataTokens?.cache_tokens || 0
        }

        // 只累计轮数，不累加 token/cost（避免与 token_usage_recorded 双重计数）
        this.totalConversations += 1

        // 轮结束从服务端同步权威数据，修复实时统计的漂移
        this.syncTotalTokenStats()
        this.syncSessionTokenStats(targetSessionId)

        console.log('[MindX] ExecutionSummary processed, synced from server')
      }
    },

    handleError(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const errorContent = data || opts?.title || t('message.error')

      // deduplicate: skip if the last message is already an identical error
      const msgs = this.messagesBySession[targetSessionId]
      const lastMsg = msgs?.[msgs.length - 1]
      if (lastMsg?.eventType === 'error' && lastMsg?.content === errorContent) {
        this.isProcessing = false
        return
      }

      this.addMessage(targetSessionId, {
        role: 'system',
        content: errorContent,
        eventType: 'error',
        eventTitle: opts?.title || '❌ ' + t('common.error'),
        eventData: data
      })

      this.lastError = errorContent
      this.isProcessing = false
    },

    // 根据 agent_name 查找当前 session 中匹配的活跃 subtask
    getActiveSubtaskForAgent(sessionId: string, agentName?: string): string | null {
      if (!sessionId || !agentName) return null
      const subtasks = this.activeSubtasksBySession[sessionId]
      if (!subtasks || subtasks.length === 0) return null
      const found = subtasks.find(s => s.agent_name === agentName)
      return found ? found.session_id : null
    },

    // 添加一条消息到 subtask 子消息列表
    // 累积 tool_use_delta 参数到同 id 的最后一条 subtask 消息
    appendSubtaskToolUseDelta(sessionId: string, subSessionId: string, data: any): void {
      const msgs = this.subtaskMessagesBySession[sessionId]?.[subSessionId]
      if (!msgs) {
        // 子任务第一条 delta 到达时数组可能还不存在，直接创建，便于 tool_exec_start 回填 tool_name
        this.addSubtaskMessage(sessionId, subSessionId, {
          role: 'tool',
          content: data?.arguments || '',
          eventType: 'tool_use_delta',
          eventTitle: '',
          eventData: data,
          agentName: '',
          metadata: { phase: 'tool_use_delta' }
        })
        return
      }
      const lastDelta = [...msgs].reverse().find(m => m.eventType === 'tool_use_delta' && m.eventData?.id === data?.id)
      if (lastDelta) {
        if (data?.arguments) {
          lastDelta.content += data.arguments
          lastDelta.eventData = { ...lastDelta.eventData, ...data }
        }
      } else {
        this.addSubtaskMessage(sessionId, subSessionId, {
          role: 'tool',
          content: data?.arguments || '',
          eventType: 'tool_use_delta',
          eventTitle: '',
          eventData: data,
          agentName: '',
          metadata: { phase: 'tool_use_delta' }
        })
      }
    },

    addSubtaskMessage(sessionId: string, subSessionId: string, msg: Omit<ChatMessage, 'id' | 'timestamp' | 'sessionId'>): ChatMessage {
      if (!this.subtaskMessagesBySession[sessionId]) {
        this.subtaskMessagesBySession[sessionId] = {}
      }
      if (!this.subtaskMessagesBySession[sessionId][subSessionId]) {
        this.subtaskMessagesBySession[sessionId][subSessionId] = []
      }
      const newMsg: ChatMessage = {
        ...msg,
        id: `subtask_${subSessionId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        sessionId
      }
      this.subtaskMessagesBySession[sessionId][subSessionId].push(newMsg)
      return newMsg
    },

    // Upsert a file_modified message inside a subtask, deduplicating by file path.
    upsertSubtaskFileModified(
      sessionId: string,
      subSessionId: string,
      file: { path: string; diff: string; additions: number; deletions: number; isNew: boolean },
      agentName: string
    ): void {
      if (!this.subtaskMessagesBySession[sessionId]) {
        this.subtaskMessagesBySession[sessionId] = {}
      }
      if (!this.subtaskMessagesBySession[sessionId][subSessionId]) {
        this.subtaskMessagesBySession[sessionId][subSessionId] = []
      }
      const msgs = this.subtaskMessagesBySession[sessionId][subSessionId]
      const existingIdx = msgs.findIndex(
        m => m.eventType === 'file_modified' && (m.eventTitle || m.eventData?.path) === file.path
      )
      if (existingIdx >= 0) {
        msgs[existingIdx].eventTitle = file.path
        msgs[existingIdx].eventData = file
        return
      }
      const newMsg: ChatMessage = {
        role: 'system',
        content: '',
        eventType: 'file_modified',
        eventTitle: file.path,
        eventData: file,
        agentName,
        metadata: { phase: 'file_modified' },
        id: `subtask_${subSessionId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        sessionId
      }
      msgs.push(newMsg)
    },

    // 获取某个 subtask 的子消息
    getSubtaskMessages(sessionId: string, subSessionId: string): ChatMessage[] {
      return this.subtaskMessagesBySession[sessionId]?.[subSessionId] || []
    },

    handleSubtaskSpawned(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const sessionId = data?.session_id || ''
      const agentName = data?.agent_name || ''

      // 注册为活跃 subtask
      if (targetSessionId && sessionId && agentName) {
        if (!this.activeSubtasksBySession[targetSessionId]) {
          this.activeSubtasksBySession[targetSessionId] = []
        }
        // 避免重复注册
        if (!this.activeSubtasksBySession[targetSessionId].find(s => s.session_id === sessionId)) {
          this.activeSubtasksBySession[targetSessionId].push({ session_id: sessionId, agent_name: agentName })
        }
        // 初始化子消息数组
        if (!this.subtaskMessagesBySession[targetSessionId]) {
          this.subtaskMessagesBySession[targetSessionId] = {}
        }
        if (!this.subtaskMessagesBySession[targetSessionId][sessionId]) {
          this.subtaskMessagesBySession[targetSessionId][sessionId] = []
        }
      }

      const msg = this.addMessage(targetSessionId, {
        role: 'system',
        content: typeof data === 'string' ? data : '',
        eventType: 'subtask_spawned',
        eventTitle: opts?.title || '🌿 ' + t('message.subtaskSpawned'),
        eventData: data,
        metadata: { phase: 'subtask_spawned' }
      })

    },

    handleSubtaskCompleted(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      const content = typeof data === 'string' ? data : (data?.answer || data?.error || '')
      const sessionId = data?.session_id || ''

      // 从活跃 subtask 列表中移除
      if (targetSessionId && sessionId && this.activeSubtasksBySession[targetSessionId]) {
        this.activeSubtasksBySession[targetSessionId] =
          this.activeSubtasksBySession[targetSessionId].filter(s => s.session_id !== sessionId)
      }

      const msg = this.addMessage(targetSessionId, {
        role: 'system',
        content,
        eventType: 'subtask_completed',
        eventTitle: data?.success ? '✅ ' + t('message.subtaskCompleted') : '❌ ' + t('message.subtaskFailed'),
        eventData: data,
        metadata: { phase: 'subtask_completed', success: data?.success }
      })

    },

    /**
     * 异步加载主会话中所有子Agent 的子会话消息。
     * 从已恢复的 subtask_completed 事件中提取 session_id，
     * 通过 session.get RPC 加载子会话，填充 subtaskMessagesBySession。
     */
    async loadSubtaskSessions(sessionId: string): Promise<void> {
      const msgs = this.messagesBySession[sessionId] || []
      // 从事件数据中收集所有子会话的 session_id
      const subSessionIds = new Set<string>()
      for (const msg of msgs) {
        if (msg.eventData?.session_id) {
          subSessionIds.add(msg.eventData.session_id)
        }
      }
      if (subSessionIds.size === 0) return

      const connStore = useConnectionStore()
      console.log(`[MindX Chat] loadSubtaskSessions: loading ${subSessionIds.size} sub-agent session(s)`, { sessionId })

      await Promise.all([...subSessionIds].map(async (subSessionID) => {
        try {
          const detail = await connStore.fetchSessionDetail(subSessionID)
          if (!detail?.messages?.length) return

          // 初始化 subtask 消息数组
          if (!this.subtaskMessagesBySession[sessionId]) {
            this.subtaskMessagesBySession[sessionId] = {}
          }
          if (!this.subtaskMessagesBySession[sessionId][subSessionID]) {
            this.subtaskMessagesBySession[sessionId][subSessionID] = []
          }

          // 转换子会话消息 → ChatMessage 列表
          // 通过 tool_call_id 把 assistant 的 tool_calls 和 tool 结果配对，
          // 让结果块能正确显示工具名和参数预览（和实时流保持一致）
          const subMsgs: ChatMessage[] = []
          const toolCallMap = new Map<string, { name: string; arguments: string }>()
          const renderedToolCallIds = new Set<string>()
          for (const sm of detail.messages) {
            if (sm.role === 'user') {
              subMsgs.push({
                id: `subtask_restored_${subSessionID}_${sm.timestamp}`,
                role: 'user',
                content: sm.content,
                eventType: 'user',
                timestamp: new Date(sm.timestamp).toISOString(),
                sessionId
              })
            } else if (sm.role === 'assistant') {
              // reasoning_content → thinking_done
              if (sm.reasoning_content?.trim()) {
                subMsgs.push({
                  id: `subtask_restored_${subSessionID}_${sm.timestamp}_think`,
                  role: 'assistant',
                  content: sm.reasoning_content,
                  eventType: 'thinking_done',
                  eventTitle: t('message.thinking'),
                  metadata: { complete: true },
                  timestamp: new Date(sm.timestamp).toISOString(),
                  sessionId
                })
              }
              // 正文
              if (sm.content?.trim()) {
                subMsgs.push({
                  id: `subtask_restored_${subSessionID}_${sm.timestamp}_msg`,
                  role: 'assistant',
                  content: sm.content,
                  eventType: 'markdown',
                  timestamp: new Date(sm.timestamp).toISOString(),
                  sessionId
                })
              }
              // tool_calls 不单独显示，只缓存给 tool 结果回填
              if (sm.tool_calls?.length) {
                for (const tc of sm.tool_calls) {
                  toolCallMap.set(tc.id, { name: tc.name || '', arguments: tc.arguments || '' })
                }
              }
            } else if (sm.role === 'tool') {
              const tc = toolCallMap.get(sm.tool_call_id)
              if (sm.tool_call_id) renderedToolCallIds.add(sm.tool_call_id)
              let params: Record<string, any> | undefined
              if (tc?.arguments) {
                try {
                  params = JSON.parse(tc.arguments)
                } catch {
                  params = { arguments: tc.arguments }
                }
              }
              // 后端持久化失败结果格式：[<tool_name>] error: <msg> / [<tool_name>] skipped: <msg>
              const content = sm.content || ''
              const isFailed = /^\[[^\]]+\]\s+(error|skipped):/i.test(content)
              subMsgs.push({
                id: `subtask_restored_${subSessionID}_${sm.timestamp}_tool`,
                role: 'tool',
                content,
                eventType: 'tool_exec',
                eventTitle: tc?.name || '',
                eventData: {
                  start: {
                    tool_name: tc?.name,
                    params,
                    tool_call_id: sm.tool_call_id
                  },
                  end: {
                    tool_call_id: sm.tool_call_id,
                    success: !isFailed,
                    result: isFailed ? '' : content,
                    error: isFailed ? content : ''
                  },
                  status: isFailed ? 'failed' : 'done'
                },
                timestamp: new Date(sm.timestamp).toISOString(),
                sessionId
              })
            }
          }

          // 如果某些 tool_call 没有对应的 tool 结果（例如子任务中断），保留原始显示避免数据丢失
          for (const [callId, tc] of toolCallMap.entries()) {
            if (!renderedToolCallIds.has(callId)) {
              subMsgs.push({
                id: `subtask_restored_${subSessionID}_unpaired_${callId}`,
                role: 'assistant',
                content: tc.arguments,
                eventType: 'tool_use',
                eventTitle: tc.name,
                eventData: { tool_name: tc.name, arguments: tc.arguments, id: callId },
                timestamp: new Date().toISOString(),
                sessionId
              })
            }
          }

          this.subtaskMessagesBySession[sessionId][subSessionID] = subMsgs
          console.log(`[MindX Chat] loadSubtaskSessions: loaded ${subMsgs.length} msgs for session ${subSessionID}`)
        } catch (err) {
          console.warn(`[MindX Chat] loadSubtaskSessions: failed to load session ${subSessionID}:`, err)
        }
      }))
    },

    handlePermissionRequest(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      // 非阻塞权限：存储 tool_name 供 execution.resume 使用
      const toolName = data?.tool_name || data?.toolName || ''
      if (toolName) {
        this.pendingPermissionToolName = toolName
      }

      this.addMessage(targetSessionId, {
        role: 'system',
        content: '',
        eventType: 'permission_request',
        eventTitle: opts?.title || '🔒 ' + t('message.permissionRequest'),
        eventData: data,
        metadata: { phase: 'permission' }
      })
    },

    handleAskUserRequest(data: any, opts?: { session_id?: string; title?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId

      this.addMessage(targetSessionId, {
        role: 'system',
        content: '',
        eventType: 'form',
        eventTitle: opts?.title || '💬 ' + t('message.clarification'),
        eventData: data,
        metadata: { phase: 'clarify' }
      })
    },

    handlePermissionDenied(data: any, opts?: { session_id?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'system',
        content: data || t('message.permissionDenied'),
        eventType: 'permission_denied',
        eventTitle: '🚫 ' + t('message.permissionDenied'),
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
      const cacheTokens = opts?.meta?.cache_tokens || data?.token_usage?.cache_tokens || data?.cache_tokens || 0
      const totalTokens = Math.max(0, inputTokens + outputTokens - cacheTokens)

      this.addMessage(targetSessionId, {
        role: 'assistant',
        content: this.pendingContentBySession[targetSessionId] || summaryText,
        eventType: 'task_summary',
        eventTitle: opts?.title || '📋 ' + t('message.taskSummary'),
        eventData: data,
        metadata: {
          phase: 'summary',
          inputTokens,
          outputTokens,
          cacheTokens,
          totalTokens
        }
      })

      // 缓存 token 数据用于刷新后恢复
      this.sessionMessageTokens[targetSessionId] = { inputTokens, outputTokens, cacheTokens, totalTokens }
      localStorage.setItem('mindx_chat_message_tokens', JSON.stringify(this.sessionMessageTokens))

      delete this.pendingContentBySession[targetSessionId]

      this.isProcessing = false
    },

    handleCompaction(data: any, opts?: { session_id?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'system',
        content: '',
        eventType: 'compaction',
        eventTitle: '📦 ' + t('message.compaction'),
        eventData: data,
        metadata: { phase: 'compaction' }
      })
    },

    handleMaxTurnsReached(data: any, opts?: { session_id?: string }) {
      const sessionStore = useSessionStore()
      const targetSessionId = opts?.session_id || sessionStore.activeSessionId
      this.addMessage(targetSessionId, {
        role: 'system',
        content: data?.suggestion || `${t('message.maxTurnsReached')} ${data?.turns_completed || '?'}/${data?.max_turns || '?'}`,
        eventType: 'max_turns_reached',
        eventTitle: '⚠️ ' + t('message.maxTurnsReached'),
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

      let md = '### 📊 ' + t('message.executionSummary') + '\n\n'

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
      // 已废弃：改用 syncTotalTokenStats() 从服务端同步
      // 保留此方法作为离线回退
    },

    /**
     * 从服务端同步全量累计统计（total_tokens, total_cost, total_conversations）
     * 替代旧的 localStorage 方案，确保与后端一致
     */
    async syncTotalTokenStats() {
      const connStore = useConnectionStore()
      if (!connStore.isConnected) return
      try {
        const data = await connStore.fetchTokenUsageTotal()
        this.totalTokensUsed = data.total_tokens
        this.totalCost = data.total_cost
        this.totalConversations = data.total_conversations
      } catch (e) {
        console.warn('[MindX] Failed to sync total token stats from server:', e)
      }
    },

    /**
     * 从服务端同步指定会话的消耗统计
     * 替代旧的 loadSessionTokenStats localStorage 方案
     */
    async syncSessionTokenStats(sessionId: string) {
      const connStore = useConnectionStore()
      if (!connStore.isConnected) {
        this.sessionTokensUsed = 0
        this.sessionCost = 0
        return
      }
      try {
        const data = await connStore.fetchSessionTokenUsage(sessionId)
        this.sessionTokensUsed = data.tokens_used
        this.sessionCost = data.cost
      } catch (e) {
        console.warn('[MindX] Failed to sync session token stats from server:', e)
        this.sessionTokensUsed = 0
        this.sessionCost = 0
      }
    },

    saveTokenStats() {
      // 已废弃：服务端负责持久化，前端不再写入 localStorage
      // 保留空方法避免调用处报错
    },

    loadSessionTokenStats(_sessionId: string) {
      // 已废弃：改用 syncSessionTokenStats(sessionId) 从服务端同步
      this.sessionTokensUsed = 0
      this.sessionCost = 0
    },

    resetSessionStats() {
      this.sessionTokensUsed = 0
      this.sessionCost = 0
    }
  }
})
