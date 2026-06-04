import { defineStore } from 'pinia'
import { getMindXClient, createMindXClient } from '../services/websocket'
import { useChatStore } from './chatStore'
import { useSessionStore } from './sessionStore'
import type { AgentConfig, ModelConfig, SkillInfo, ServerSessionInfo, FSEntry, TokenUsageOverview, MonthlyUsageStats, ModelUsageSummary, ProviderInfo, ProviderCreateParams, ProviderUpdateParams, ModelCreateParams, ModelUpdateParams } from '../types/websocket'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface AgentInfo {
  name: string
  role: string
  description: string
  model: string
  skills?: string[]
  introduction?: string
  active?: boolean
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
    rawProviders: [] as ProviderInfo[]
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
        disconnected: '未连接',
        connecting: '连接中...',
        connected: '已连接',
        reconnecting: '重连中...',
        error: '连接错误'
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
      this.agents = agents
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

    async fetchFSList(dirPath?: string): Promise<FSEntry[]> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      const params = dirPath ? { path: dirPath } : {}
      const result = await client.call<FSEntry[]>('fs.list', params)
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
        console.log('%c数据来源: ~/.mindx/mindh.json', 'color: #64748b; font-size: 11px;')
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
        if (targetSessionId) {
          chatStore.handleThinkingDelta(envelope.data, targetSessionId)
        } else {
          chatStore.handleThinkingDelta(envelope.data)
        }
      })

      client.on('thinking_done', (envelope) => {
        chatStore.handleThinkingDone(envelope.data)
      })

      client.on('markdown', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleContentDelta(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title,
          meta: envelope.meta
        })
      })

      client.on('content_delta', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleContentDelta(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      // GoReact ToolUseDelta: LLM 流式输出工具调用参数
      client.on('tool_use_delta', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleToolUseDelta(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      // GoReact ToolExecStart: 工具即将开始执行
      client.on('tool_exec_start', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleToolExecStart(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      // GoReact ToolExecEnd: 工具执行结束（成功或失败）
      client.on('tool_exec_end', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleToolExecEnd(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('subtask_spawned', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleSubtaskSpawned(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('subtask_completed', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleSubtaskCompleted(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('final_answer', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleFinalAnswer(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('permission_request', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handlePermissionRequest(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('permission_denied', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handlePermissionDenied(envelope.data, {
          session_id: targetSessionId
        })
      })

      client.on('form', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleAskUserRequest(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('execution_summary', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
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
        chatStore.handleTokenUsageRecorded(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title,
          meta: envelope.meta
        })
      })

      // cycle_end: 内部系统事件，不需要处理（chatStore 中直接 break）

      client.on('task_summary', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
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
        chatStore.handleError(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('agent_talk_start', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleAgentTalkStart(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      client.on('agent_talk_end', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleAgentTalkEnd(envelope.data, {
          session_id: targetSessionId
        })
      })

      client.on('compaction', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleCompaction(envelope.data, {
          session_id: targetSessionId
        })
      })

      client.on('max_turns_reached', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleMaxTurnsReached(envelope.data, {
          session_id: targetSessionId
        })
      })

      client.on('file_modified', (envelope) => {
        const targetSessionId = envelope.session_id || sessionStore.activeSessionId
        chatStore.handleFileModified(envelope.data, {
          session_id: targetSessionId,
          title: envelope.title
        })
      })

      console.log('[MindX] Event handlers registered')
    },

    setLastAgent(agentName: string) {
      this.lastAgentName = agentName
    },

    setLastSession(sessionId: string) {
      this.lastSessionId = sessionId
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
      return result || this.emptyMonthlyStats(year, month)
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

    async fetchLogs(offset = 0, limit = 10): Promise<{
      lines: string[]; total: number; returned: number; offset: number; has_more: boolean; path: string
    }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('log.read', { offset, limit })
    },

    async clearLogs(confirmed = false): Promise<{ status: string; path: string }> {
      const client = getMindXClient()
      if (!client) throw new Error('WebSocket client not initialized')
      return client.call('log.clear', { confirmed })
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
    }
  }
})
