import { defineStore } from 'pinia'
import { getMindXClient, createMindXClient } from '../services/websocket'
import { useChatStore } from './chatStore'
import { useSessionStore } from './sessionStore'
import type { AgentConfig, ModelConfig, SkillInfo, ServerSessionInfo, FSEntry, TokenUsageOverview, MonthlyUsageStats, ModelUsageSummary, TotalTokenUsage, SessionTokenUsage, SessionTokenDetailResponse, ProviderInfo, ProviderCreateParams, ProviderUpdateParams, ModelCreateParams, ModelUpdateParams } from '../types/websocket'
import i18n from '../i18n'
import { ElNotification, ElButton } from 'element-plus'
import { h } from 'vue'

const t = (key: string) => i18n.global.t(key)

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface AgentInfo {
  name: string
  role: string
  description: string
  model: string
  skills?: string[]
  exclude_tools?: string[]
  introduction?: string
  active?: boolean
  meta?: Record<string, any>
}

export interface ModelInfo {
  name: string
  title?: string
  description: string
  provider: string
  enabled?: boolean
}

export const useConnectionStore = defineStore('connection', {
  state: () => ({
    state: 'disconnected' as ConnectionState,
    lastError: null as string | null,
    serverUrl: '' as string,
    clientId: '' as string,
    agents: [] as AgentInfo[],
    models: [] as ModelInfo[],
    skills: [] as SkillInfo[],
    currentAgentName: '' as string,
    currentModelName: '' as string,
    currentProjectDir: '' as string,
    reconnectAttempts: 0 as number,
    maxReconnectAttempts: 10 as number,
    lastAgentName: '' as string,
    lastSessionId: '' as string,
    providerTitleMap: {} as Record<string, string>,
    rawProviders: [] as ProviderInfo[],
    serverVersion: '' as string,
    pendingShowAbout: false as boolean,
    showConnectionDialog: false as boolean,
    showTokenReport: false as boolean,
    showFileBrowser: false as boolean,
    updateState: '' as '' | 'downloading' | 'restart_needed',
    showTerminalDrawer: false as boolean,
    pendingTerminalCommand: null as string | null,
    indexingState: { active: false, fileName: '', message: '' } as {
      active: boolean
      fileName: string
      message: string
    },
    /** Monotonic counter incremented on file_indexing events that affect manifest.
     *  Components watch this to know when to refresh their manifest cache. */
    manifestVersion: 0
  }),

  getters: {
    isConnected: (state): boolean => {
      return state.state === 'connected'
    },

    isOfflineMode: (state): boolean => {
      return !['connected', 'connecting', 'reconnecting'].includes(state.state)
    },

    canSendMessage: (state): boolean => {
      return state.state === 'connected'
    },

    primaryAgent: (state): AgentInfo | undefined => {
      return state.agents.find(a => a.active) || state.agents[0]
    },

    currentAgent: (state): AgentInfo | undefined => {
      if (!state.currentAgentName) return state.agents[0]
      return state.agents.find(a => a.name === state.currentAgentName) || state.agents[0]
    },

    currentModel: (state): ModelInfo | undefined => {
      if (!state.currentModelName && state.models.length > 0) return state.models[0]
      if (!state.currentModelName) return undefined
      return state.models.find(m => m.name === state.currentModelName)
    },

    providers: (state): { name: string; models: ModelInfo[] }[] => {
      const map = new Map<string, ModelInfo[]>()
      state.models.forEach(m => {
        const list = map.get(m.provider) || []
        list.push(m)
        map.set(m.provider, list)
      })
      return Array.from(map.entries()).map(([name, models]) => ({ name, models }))
    },

    statusLabel: (state): string => {
      const labels: Record<ConnectionState, string> = {
        disconnected: t('sidebar.status.disconnected'),
        connecting: t('sidebar.status.connecting'),
        connected: t('sidebar.status.connected'),
        reconnecting: t('sidebar.status.reconnecting'),
        error: t('sidebar.status.error')
      }
      return labels[state.state]
    },

    statusColor: (state): string => {
      const colors: Record<ConnectionState, string> = {
        disconnected: '#64748b',
        connecting: '#f59e0b',
        connected: '#10b981',
        reconnecting: '#f59e0b',
        error: '#ef4444'
      }
      return colors[state.state]
    },
  },

  actions: {
    async deleteSession(sessionId: string): Promise<{ session_id: string; deleted: boolean }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ session_id: string; deleted: boolean }>('session.delete', {
        session_id: sessionId
      })
      return result
    },

    setConnectionState(newState: ConnectionState) {
      this.state = newState

      if (newState === 'connected') {
        this.reconnectAttempts = 0
        this.lastError = null
        this.updateState = ''
      }
    },

    setServerError(error: string) {
      this.lastError = error
      this.state = 'error'
    },

    setServerUrl(url: string) {
      this.serverUrl = url
    },

    setClientId(id: string) {
      this.clientId = id
    },

    generateClientId(): string {
      this.clientId = `web_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      return this.clientId
    },

    setAgents(agents: AgentInfo[]) {
      this.agents = agents.map(a => ({
        ...a,
        meta: { ratings: 0, ...(a.meta || {}) }
      }))
    },

    setModels(models: ModelInfo[]) {
      this.models = models
    },

    setSkills(skills: SkillInfo[]) {
      this.skills = skills
    },

    setCurrentAgent(agentName: string) {
      this.currentAgentName = agentName
      const agent = this.agents.find(a => a.name === agentName)
      if (agent?.model && !this.currentModelName) {
        this.currentModelName = agent.model
      }
    },

    setCurrentModel(modelName: string) {
      this.currentModelName = modelName
    },

    async fetchAgents(): Promise<AgentConfig[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<AgentConfig[]>('agent.list', {})
      return Array.isArray(result) ? result : []
    },

    async fetchSessions(agentName?: string): Promise<ServerSessionInfo[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const params = agentName ? { agent: agentName } : {}
      const result = await client.call<ServerSessionInfo[]>('session.list', params)
      console.log(`[MindX] 🔍 fetchSessions(agentName=${agentName}) raw result:`, JSON.parse(JSON.stringify(result)))
      return Array.isArray(result) ? result : []
    },

    async fetchSessionDetail(sessionId: string): Promise<{ session_id: string; messages: SessionMessage[]; meta?: any }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ session_id: string; messages: SessionMessage[]; meta?: any }>('session.get', { session_id: sessionId })
      return result || { session_id: sessionId, messages: [] }
    },

    async fetchModels(): Promise<ModelConfig[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<ModelConfig[]>('model.list', {})
      return Array.isArray(result) ? result : []
    },

    async fetchSkills(): Promise<SkillInfo[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<SkillInfo[]>('skill.list', {})
      return Array.isArray(result) ? result : []
    },

    async fetchFSHome(): Promise<string> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ path: string }>('fs.home', {})
      return result?.path || ''
    },

    async fetchUserConfig(): Promise<{
      default_model?: string
      default_provider?: string
      last_model?: string
      [key: string]: any
    }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      try {
        const result = await client.call<any>('user.config', {})

        console.group('📋 [MindX] User Config (user.config)')
        console.log('%c✅ 成功获取用户配置', 'color: #10b981; font-weight: bold;')
        console.log('%c数据来源: ~/.mindx/mindx.json', 'color: #64748b; font-size: 11px;')
        console.log('─────────────────────────────────────')
        console.table(result)
        console.log('%c完整 JSON:', 'color: #8b5cf6; font-weight: bold;')
        console.dir(result, { depth: null, colors: true })
        console.log('%cJSON 字符串:', 'color: #f59e0b; font-weight: bold;')
        console.log(JSON.stringify(result, null, 2))
        console.groupEnd()

        return result || {}
      } catch (err) {
        console.warn('[MindX] ⚠️ Failed to fetch user config:', err)
        return {}
      }
    },

    async fetchServerVersion(): Promise<void> {
      const client = getMindXClient()
      if (!client) return
      try {
        const result = await client.call<any>('server.version', {})
        console.log(`[MindX] server.version response:`, result)
        if (result?.version) {
          this.serverVersion = result.version
          document.title = `MindX v${result.version}`
          console.log(`[MindX] ✅ serverVersion set to: "${this.serverVersion}"`)
        }
      } catch (err) {
        console.warn('[MindX] ⚠️ Failed to fetch server version:', err)
      }
    },

    incrementReconnectAttempt() {
      this.reconnectAttempts++
    },

    resetReconnectAttempts() {
      this.reconnectAttempts = 0
    },

    async autoConnect(timeoutMs: number = 5000): Promise<boolean> {
      const url = this.serverUrl || 'ws://localhost:1314/ws'
      console.log('[MindX] 🚀 autoConnect starting with URL:', url)
      this.setServerUrl(url)

      if (!this.clientId) {
        this.generateClientId()
      }

      return new Promise((resolve) => {
        let settled = false
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true
            console.log('[MindX] ❌ Auto-connect TIMED OUT after', timeoutMs, 'ms, state:', this.state)
            this.state = 'disconnected'
            resolve(false)
          }
        }, timeoutMs)

        const onStateChange = (oldState: ConnectionState, newState: ConnectionState) => {
          console.log('[MindX] 🔄 State changed:', oldState, '→', newState)
          this.setConnectionState(newState)

          if (newState === 'connected') {
            if (!settled) {
              settled = true
              clearTimeout(timer)
              console.log('[MindX] ✅ Auto-connect SUCCEEDED')
              resolve(true)
            }
          } else if (newState === 'error' || newState === 'disconnected') {
            if (!settled && (oldState === 'connecting' || oldState === 'reconnecting')) {
              settled = true
              clearTimeout(timer)
              console.log('[MindX] ❌ Auto-connect FAILED with state:', newState)
              resolve(false)
            }
          }
        }

        try {
          console.log('[MindX] 🔧 Creating WebSocket client...')
          createMindXClient(url, onStateChange)
          this.setConnectionState('connecting')
          console.log('[MindX] 🔧 Registering event handlers...')
          this.registerEventHandlers()
        } catch (err) {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            console.log('[MindX] ❌ Auto-connect EXCEPTION:', err)
            this.setServerError(String(err))
            resolve(false)
          }
        }
      })
    },

    disconnect() {
      this.state = 'disconnected'
      this.reconnectAttempts = this.maxReconnectAttempts
      this.agents = []
      this.models = []
      this.skills = []
      this.currentAgentName = ''
      this.currentModelName = ''
    },

    reset() {
      this.state = 'disconnected'
      this.lastError = null
      this.serverUrl = ''
      this.clientId = ''
      this.agents = []
      this.models = []
      this.skills = []
      this.currentAgentName = ''
      this.currentModelName = ''
      this.reconnectAttempts = 0
    },

    registerEventHandlers() {
      console.log('[MindX] 🚀 registerEventHandlers called')
      const client = getMindXClient()
      if (!client) {
        console.error('[MindX] ❌ Client is null!')
        return
      }
      console.log('[MindX] ✅ Client found:', !!client)

      const chatStore = useChatStore()
      const sessionStore = useSessionStore()

      client.on('thinking_delta', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        // 子Agent thinking → 路由到 subtask
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'system',
            content: envelope.data || '',
            eventType: 'thinking_delta',
            eventTitle: '💭 ' + t('chat.thinking'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { phase: 'thinking_delta' }
          })
          return
        }
        if (targetSessionId) {
          chatStore.handleThinkingDelta(envelope.data, targetSessionId)
        } else {
          chatStore.handleThinkingDelta(envelope.data)
        }
      })

      client.on('thinking_done', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          const content = typeof envelope.data === 'string' ? envelope.data : (envelope.data?.reasoning_content || envelope.data?.content || '')
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'system',
            content,
            eventType: 'thinking_done',
            eventTitle: '💭 ' + t('message.thinking'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { complete: true, phase: 'thinking_done' }
          })
          return
        }
        chatStore.handleThinkingDone(envelope.data)
      })

      client.on('markdown', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'assistant',
            content: envelope.data || '',
            eventType: 'markdown',
            eventTitle: envelope.title || '📝 ' + t('chat.output'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { phase: 'output' }
          })
          return
        }
        chatStore.handleContentDelta(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title,
          meta: envelope.meta
        })
      })

      client.on('content_delta', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'assistant',
            content: envelope.data || '',
            eventType: 'content_delta',
            eventTitle: envelope.title || '📝 ' + t('chat.output'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { phase: 'output' }
          })
          return
        }
        chatStore.handleContentDelta(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      // goharness ToolUseDelta: LLM 流式输出工具调用参数
      client.on('tool_use_delta', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          chatStore.appendSubtaskToolUseDelta(targetSessionId, subtaskId, {
            ...envelope.data,
            agent_name: envelope.agent_name
          })
          return
        }
        chatStore.handleToolUseDelta(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      // goharness ToolExecStart: 工具即将开始执行
      client.on('tool_exec_start', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)

        // 子 Agent 的 tool_exec_start 经常不带 tool_name，回退到同子任务最近一条 tool_use_delta 的名称
        const subtaskMsgs = subtaskId ? chatStore.subtaskMessagesBySession[targetSessionId]?.[subtaskId] : null
        const lastDelta = subtaskMsgs
          ? [...subtaskMsgs].reverse().find(m => m.eventType === 'tool_use_delta')
          : null
        const deltaName = lastDelta?.eventData?.name || lastDelta?.eventData?.tool_name
        const toolName = envelope.data?.tool_name || deltaName || envelope.title || '🔧 ' + t('message.toolUse')

        // AskUser 工具有专用视图，跳过 tool_exec 避免重复显示
        if (toolName === 'AskUser') return

        if (subtaskId && targetSessionId) {
          const startData = { ...envelope.data }
          if (!startData.tool_name && toolName !== '🔧 ' + t('message.toolUse')) {
            startData.tool_name = toolName
          }
          if (!startData.params && lastDelta?.eventData?.arguments) {
            try {
              startData.params = JSON.parse(lastDelta.eventData.arguments)
            } catch {
              startData.params = { arguments: lastDelta.eventData.arguments }
            }
          }
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'tool',
            content: '',
            eventType: 'tool_exec',
            eventTitle: toolName,
            eventData: {
              start: startData,
              end: null,
              status: 'executing'
            },
            agentName: envelope.agent_name,
            metadata: { phase: 'active' }
          })
          return
        }
        chatStore.handleToolExecStart(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      // goharness ToolExecEnd: 工具执行结束（成功或失败）
      client.on('tool_exec_end', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          // 更新 subtask 中最后一条 tool_exec 消息的状态为完成
          const msgs = chatStore.getSubtaskMessages(targetSessionId, subtaskId)
          const toolMsg = msgs?.findLast(m => m.eventType === 'tool_exec' && m.eventData?.status === 'executing')
          if (toolMsg && toolMsg.eventData) {
            toolMsg.eventData.end = envelope.data
            // 失败判定：后端显式返回 success=false，或 error 字段非空
            const failed = envelope.data?.success === false || !!envelope.data?.error
            toolMsg.eventData.status = failed ? 'failed' : 'done'
          }
          return
        }
        chatStore.handleToolExecEnd(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('subtask_spawned', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        chatStore.handleSubtaskSpawned(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('subtask_completed', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        chatStore.handleSubtaskCompleted(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('final_answer', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'assistant',
            content: envelope.data || '',
            eventType: 'final_answer',
            eventTitle: envelope.title || '📋 ' + t('message.finalAnswer'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { phase: 'final_answer' }
          })
          return
        }
        chatStore.handleFinalAnswer(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('permission_request', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          // 设置 pendingPermissionToolName 供 grant/deny 使用
          const toolName = envelope.data?.tool_name || envelope.data?.toolName || ''
          if (toolName) {
            chatStore.pendingPermissionToolName = toolName
          }
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'system',
            content: '',
            eventType: 'permission_request',
            eventTitle: envelope.title || '🔒 ' + t('message.permissionRequest'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { phase: 'permission' }
          })
          return
        }
        chatStore.handlePermissionRequest(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('permission_denied', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'system',
            content: envelope.data || t('message.permissionDenied'),
            eventType: 'permission_denied',
            eventTitle: t('message.permissionDenied'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { phase: 'permission_denied' }
          })
          return
        }
        chatStore.handlePermissionDenied(envelope.data, {
          session_id: targetSessionId
        })
      })

      client.on('form', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'system',
            content: '',
            eventType: 'form',
            eventTitle: envelope.title || '💬 ' + t('message.clarification'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { phase: 'clarify' }
          })
          return
        }
        chatStore.handleAskUserRequest(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('execution_summary', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        chatStore.handleExecutionSummary(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title,
          meta: envelope.meta
        })
        if (targetSessionId) {
          sessionStore.incrementMessageCount(targetSessionId)
        }
      })

      client.on('token_usage_recorded', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        chatStore.handleTokenUsageRecorded(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title,
          meta: envelope.meta
        })
      })

      // cycle_end: 内部系统事件，不需要处理（chatStore 中直接 break）

      client.on('task_summary', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        chatStore.handleTaskSummary(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title,
          meta: envelope.meta
        })
        if (targetSessionId) {
          sessionStore.incrementMessageCount(targetSessionId)
        }
      })

      client.on('error', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          chatStore.addSubtaskMessage(targetSessionId, subtaskId, {
            role: 'system',
            content: envelope.data || envelope.title || '❌ ' + t('common.error'),
            eventType: 'error',
            eventTitle: '❌ ' + t('common.error'),
            eventData: envelope.data,
            agentName: envelope.agent_name,
            metadata: { phase: 'error' }
          })
          return
        }
        chatStore.handleError(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('compaction', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        chatStore.handleCompaction(envelope.data, {
          session_id: targetSessionId
        })
      })

      client.on('max_turns_reached', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        chatStore.handleMaxTurnsReached(envelope.data, {
          session_id: targetSessionId
        })
      })

      client.on('file_modified', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.setSessionCurrentAgent(targetSessionId, envelope.agent_name)
        const rawFiles: any[] = envelope.data?.files || []
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
        const subtaskId = chatStore.getActiveSubtaskForAgent(targetSessionId, envelope.agent_name)
        if (subtaskId && targetSessionId) {
          for (const file of files) {
            chatStore.upsertSubtaskFileModified(targetSessionId, subtaskId, file, envelope.agent_name)
          }
          return
        }
        chatStore.handleFileModified(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('update_started', () => {
        this.updateState = 'downloading'
      })

      client.on('update_installed', () => {
        this.updateState = 'restart_needed'
        const notif = ElNotification({
          title: t('sidebar.update.title'),
          message: h('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
            h('span', null, t('sidebar.update.message')),
            h(ElButton, {
              size: 'small',
              type: 'primary',
              onClick: () => {
                this.pendingShowAbout = true
                notif.close()
              }
            }, { default: () => t('sidebar.update.viewDetails') })
          ]),
          duration: 0,
          showClose: true
        })
      })

      client.on('file_indexing', (envelope: any) => {
        const data = envelope?.data || envelope
        const state = data?.state || ''
        const fileName = data?.file || ''
        console.log('[MindX] file_indexing event:', JSON.stringify({ state, fileName, data }))
        // Notify manifest cache watchers of state changes
        if (['added', 'removed', 'enqueued', 'indexing', 'indexed', 'error'].includes(state)) {
          this.manifestVersion++
        }
        if (state === 'indexing') {
          this.indexingState = { active: true, fileName, message: t('sidebar.indexing.inProgress', { file: fileName }) }
        } else if (state === 'indexed') {
          this.indexingState = { active: true, fileName, message: t('sidebar.indexing.completed', { file: fileName }) }
          setTimeout(() => {
            if (this.indexingState.fileName === fileName) {
              this.indexingState = { active: false, fileName: '', message: '' }
            }
          }, 4000)
        } else if (state === 'error') {
          this.indexingState = { active: true, fileName, message: t('sidebar.indexing.error', { file: fileName }) }
          setTimeout(() => {
            if (this.indexingState.fileName === fileName) {
              this.indexingState = { active: false, fileName: '', message: '' }
            }
          }, 4000)
        }
      })

      console.log('[MindX] Event handlers registered')
    },

    setLastAgent(agentName: string) {
      this.lastAgentName = agentName
      localStorage.setItem('mindx-last-agent', agentName)
      this.saveUserConfig({ last_agent: agentName })
    },

    setLastSession(sessionId: string) {
      this.lastSessionId = sessionId
      this.saveUserConfig({ last_session_id: sessionId })
    },

    /** 通用方法：将任意配置字段持久化到服务端 ~/.mindx/mindx.json */
    async saveUserConfig(partial: Record<string, any>) {
      const client = getMindXClient()
      if (!client || !client.isConnected()) return
      try {
        await client.call('user.config', partial)
      } catch (err) {
        console.warn('[MindX] Failed to persist user config to server:', err)
      }
    },

    setPendingTerminalCommand(cmd: string | null) {
      this.pendingTerminalCommand = cmd
      if (cmd) {
        this.showTerminalDrawer = true
      }
    },

    async createSession(agentName: string, projectDir: string): Promise<{ session_id: string; agent_name?: string; created_at?: string }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ session_id: string; agent_name?: string; created_at?: string }>('session.create', {
        agent: agentName,
        project_dir: projectDir
      })
      return result
    },

    async switchModel(modelName: string, provider?: string): Promise<{ name: string; provider: string; message: string }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ name: string; provider: string; message: string }>('model.switch', {
        name: modelName,
        provider: provider
      })
      this.currentModelName = modelName
      return result
    },

    async respondToAskUser(correlationId: string, answers: Record<string, string>): Promise<void> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      await client.call<{ status: string }>('ask_user.reply', {
        correlation_id: correlationId,
        answers
      })
    },

    /**
     * 非阻塞权限：用户同意后调用 execution.resume 将授权存入缓存，
     * 前端随后静默重发最后用户消息，LLM 重新进入循环时 PermissionHook
     * 检查缓存发现已授权，工具正常执行。
     */
    async resumeExecution(sessionId: string, toolName: string): Promise<void> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      await client.call<{ status: string }>('execution.resume', {
        session_id: sessionId,
        tool_name: toolName
      })
    },

    /**
     * @deprecated 旧版阻塞式权限回复 RPC，已由 execution.resume 替代。
     */
    async respondToPermission(correlationId: string, action: string, extra?: { params?: Record<string, any>; reason?: string }): Promise<void> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      await client.call<{ status: string }>('permission.reply', {
        correlation_id: correlationId,
        action,
        ...extra
      })
    },

    async fetchFSList(path: string): Promise<FSEntry[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<any>('fs.list', { path })
      if (Array.isArray(result)) return result
      if (result && Array.isArray(result.entries)) return result.entries
      return []
    },

    async readFile(path: string): Promise<string> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ content: string }>('fs.read', { path })
      return result.content || ''
    },

    async writeFile(path: string, content: string): Promise<void> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      await client.call('fs.write', { path, content })
    },

    async fetchFSMkdir(path: string): Promise<void> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      await client.call('fs.mkdir', { path })
    },

    async fetchFSRemove(path: string): Promise<void> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      await client.call('fs.rm', { path })
    },

    async fetchFSMove(source: string, target: string): Promise<void> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      await client.call('fs.mv', { src: source, dst: target })
    },

    async fetchFSReveal(path: string): Promise<void> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      await client.call('fs.reveal', { path })
    },

    async fetchFSStat(path: string): Promise<{ name: string; path: string; size: number; is_dir: boolean } | null> {
      const client = getMindXClient()
      if (!client) return null
      try {
        return await client.call<{ name: string; path: string; size: number; is_dir: boolean }>('fs.stat', { path })
      } catch {
        return null
      }
    },

    async confirmFiles(sessionId: string, files?: string[]): Promise<string[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ confirmed: string[] }>('session.confirm_files', {
        session_id: sessionId,
        ...(files && files.length > 0 && { files })
      })
      return result.confirmed || []
    },

    async rollbackFiles(sessionId: string, files?: string[]): Promise<string[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ rolled_back: string[] }>('session.rollback_files', {
        session_id: sessionId,
        ...(files && files.length > 0 && { files })
      })
      return result.rolled_back || []
    },

    async fetchProviders(): Promise<void> {
      const client = getMindXClient()
      if (!client) return
      try {
        const result = await client.call<ProviderInfo[]>('provider.list', {})
        if (Array.isArray(result)) {
          this.rawProviders = result
          // console.log('[ConnectionStore] Fetched providers:', result)
          const map: Record<string, string> = {}
          for (const p of result) {
            if (p.title && p.name) {
              map[p.name] = p.title
            }
          }
          this.providerTitleMap = map
        }
      } catch {
        console.warn('[ConnectionStore] Failed to fetch providers, using fallback')
      }
    },

    formatProviderTitle(provider: string): string {
      if (this.providerTitleMap[provider]) return this.providerTitleMap[provider]
      return provider.charAt(0).toUpperCase() + provider.slice(1)
    },

    // --- Provider CRUD ---

    async createProvider(params: ProviderCreateParams): Promise<ProviderInfo> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<ProviderInfo>('provider.create', params)
      if (result) {
        this.providerTitleMap[result.name] = result.title
        await this.fetchProviders()
      }
      return result
    },

    async updateProvider(params: ProviderUpdateParams): Promise<ProviderInfo> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<ProviderInfo>('provider.update', params)
      if (result) {
        await this.fetchProviders()
      }
      return result
    },

    async deleteProvider(name: string): Promise<{ message: string }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<{ message: string }>('provider.delete', { name })
      delete this.providerTitleMap[name]
      return result
    },

    // --- Model CRUD ---

    async createModel(params: ModelCreateParams): Promise<ModelConfig> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call<ModelConfig>('model.create', params)
    },

    async updateModel(params: ModelUpdateParams): Promise<ModelConfig> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call<ModelConfig>('model.update', params)
    },

    async deleteModel(name: string): Promise<{ message: string }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call<{ message: string }>('model.delete', { name })
    },

    async fetchTokenUsageOverview(): Promise<TokenUsageOverview> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<TokenUsageOverview>('token.usage.overview', {})
      return result || { current_month: this.emptyMonthlyStats(), available_models: [] }
    },

    async fetchTokenUsageMonthly(year: number, month: number): Promise<MonthlyUsageStats> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<MonthlyUsageStats>('token.usage.monthly', { year, month })
      const final = result || this.emptyMonthlyStats(year, month)
      return final
    },

    async fetchTokenUsageByModel(model: string, year?: number, month?: number): Promise<ModelUsageSummary[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const params: { model: string; year?: number; month?: number } = { model }
      if (year) params.year = year
      if (month) params.month = month
      const result = await client.call<ModelUsageSummary[]>('token.usage.by_model', params)
      return Array.isArray(result) ? result : []
    },

    async fetchTokenUsageTotal(): Promise<TotalTokenUsage> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<TotalTokenUsage>('token.usage.total', {})
      return result || { total_tokens: 0, total_cost: 0, total_conversations: 0 }
    },

    async fetchSessionTokenUsage(sessionId: string): Promise<SessionTokenUsage> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<SessionTokenUsage>('token.usage.session', { session_id: sessionId })
      return result || { tokens_used: 0, cost: 0 }
    },

    async fetchSessionTokenDetail(sessionId: string): Promise<SessionTokenDetailResponse> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const result = await client.call<SessionTokenDetailResponse>('token.usage.session.detail', { session_id: sessionId })
      return result || { session_id: sessionId, records: [] }
    },

    emptyMonthlyStats(year?: number, month?: number): MonthlyUsageStats {
      const now = new Date()
      return {
        year: year || now.getFullYear(),
        month: month || now.getMonth() + 1,
        total_cost: 0,
        total_tokens: 0,
        total_requests: 0,
        daily_usage: [],
        model_breakdown: []
      }
    },

    // --- Log RPC ---

    async fetchLogs(offset = 0, limit = 10, stream: 'main' | 'error' = 'main'): Promise<{
      lines: string[]; total: number; returned: number; offset: number; has_more: boolean; path: string; stream: 'main' | 'error'
    }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('log.read', { offset, limit, stream })
    },

    async clearLogs(confirmed = false): Promise<{ status: string; cleared?: string[] }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('log.clear', { confirmed })
    },

    async fetchLogCounts(): Promise<{
      counts: Record<'main' | 'error', { lines: number; bytes: number; exists: 0 | 1 }>
    }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('log.count', {})
    },

    // 推导 HTTP base URL：mindx WebServer 默认在 1313，WebSocket 在 1314
    // ws://host:1314/ws → http://host:1313
    httpBaseUrl(): string {
      const wsUrl = this.serverUrl || 'ws://localhost:1314/ws'
      try {
        const u = new URL(wsUrl)
        const httpScheme = u.protocol === 'wss:' ? 'https:' : 'http:'
        // WebServer 默认端口 1313 — 如果未来支持配置，再改成从握手响应取
        return `${httpScheme}//${u.hostname}:1313`
      } catch {
        return 'http://localhost:1313'
      }
    },

    downloadLogUrl(stream: 'main' | 'error' = 'main'): string {
      return `${this.httpBaseUrl()}/api/log/download?stream=${stream}`
    },

    triggerLogDownload(stream: 'main' | 'error' = 'main'): void {
      const url = this.downloadLogUrl(stream)
      const a = document.createElement('a')
      a.href = url
      a.download = stream === 'error' ? 'error.log' : 'mindx.log'
      a.style.display = 'none'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => a.remove(), 100)
    },

    // --- Memory RPC ---

    async queryMemory(query: string, topK = 5): Promise<Array<{
      id: string
      content: string
      score: number
      created_at: string
    }>> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('memory.query', { query, top_k: topK })
    },

    async fetchMemoryChunks(page = 1, pageSize = 10): Promise<{
      chunks: Array<{
        id: string
        content: string
        doc_id?: string
        parent_id?: string
        mime_type?: string
        metadata?: Record<string, any>
        chunk_meta?: { index: number; start_pos?: number; end_pos?: number; heading_level?: number; heading_path?: string[] }
      }>
      page: number
      page_size: number
      total: number
      has_more: boolean
    }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('memory.chunks', { page, page_size: pageSize })
    },

    async fetchMemoryCount(): Promise<{ count: number }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('memory.count', {})
    },

    async fetchKBStats(projectDir: string): Promise<{
      total_files: number
      indexed_files: number
      total_chunks: number
    }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('kb.stats', { project_dir: projectDir })
    },

    // ── Index Queue RPC ──

    async getIndexQueue(projectDir: string): Promise<any> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('kb.index.list', { project_dir: projectDir })
    },

    async addToIndexQueue(projectDir: string, files: string[]): Promise<any> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('kb.index.add', { project_dir: projectDir, files })
    },

    async removeFromIndexQueue(projectDir: string, files: string[]): Promise<any> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('kb.index.remove', { project_dir: projectDir, files })
    },

    async enqueueAll(projectDir: string): Promise<any> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('kb.index.enqueue', { project_dir: projectDir })
    },

    async enqueueFiles(projectDir: string, files: string[]): Promise<any> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('kb.index.enqueue', { project_dir: projectDir, files })
    },

    async indexSingleFile(projectDir: string, path: string, force = false): Promise<any> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      if (force) {
        await client.call('kb.index.remove', { project_dir: projectDir, files: [path] })
      }
      await client.call('kb.index.add', { project_dir: projectDir, files: [path] })
      return client.call('kb.index.enqueue', { project_dir: projectDir, files: [path] })
    },

    // ── Region Health RPC ──

    async checkRegionHealth(projectDir: string): Promise<{ health: 'no_data' | 'healthy' | 'needs_repair' }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('kb.check_region_health', { project_dir: projectDir })
    },

    async repairRegion(projectDir: string): Promise<{ status: string; chunks?: number; region_file?: string }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('kb.repair_region', { project_dir: projectDir })
    },
  }
})
