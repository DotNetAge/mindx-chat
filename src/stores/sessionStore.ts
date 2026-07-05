import { defineStore } from 'pinia'
import { useConnectionStore } from './connectionStore'

export interface Session {
  session_id: string
  agent_name?: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  project_dir?: string
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    sessions: [] as Session[],
    activeSessionId: '' as string,
    isLoadedFromServer: false as boolean
  }),

  getters: {
    activeSession: (state): Session | undefined => {
      return state.sessions.find(s => s.session_id === state.activeSessionId)
    },

    sortedSessions: (state): Session[] => {
      return [...state.sessions].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
    }
  },

  actions: {
    updateSession(sessionId: string, updates: Partial<Session>) {
      const index = this.sessions.findIndex(s => s.session_id === sessionId)
      if (index !== -1) {
        this.sessions[index] = { ...this.sessions[index], ...updates }
      }
    },

    deleteSession(sessionId: string) {
      this.sessions = this.sessions.filter(s => s.session_id !== sessionId)

      if (this.activeSessionId === sessionId) {
        this.activeSessionId = this.sessions[0]?.session_id || ''
      }
    },

    setActiveSession(sessionId: string) {
      this.activeSessionId = sessionId
      // 同步更新当前工作目录，确保保存文件等功能可用
      const session = this.sessions.find(s => s.session_id === sessionId)
      if (session?.project_dir) {
        useConnectionStore().currentProjectDir = session.project_dir
      }
    },

    syncServerSessions(serverSessions: Session[], replace = false) {
      if (replace) {
        this.sessions = serverSessions
        this.isLoadedFromServer = true
        return
      }

      const existingIds = new Set(this.sessions.map(s => s.session_id))

      serverSessions.forEach(serverSession => {
        if (!existingIds.has(serverSession.session_id)) {
          this.sessions.push(serverSession)
        } else {
          const index = this.sessions.findIndex(s => s.session_id === serverSession.session_id)
          if (index !== -1) {
            this.sessions[index] = serverSession
          }
        }
      })

      this.isLoadedFromServer = true
    },

    addSession(session: Session) {
      const existing = this.sessions.find(s => s.session_id === session.session_id)
      if (existing) {
        Object.assign(existing, session)
        return
      }
      this.sessions.unshift(session)
    },

    incrementMessageCount(sessionId: string) {
      const session = this.sessions.find(s => s.session_id === sessionId)
      if (session) {
        session.message_count++
        session.updated_at = new Date().toISOString()
      }
    },

    clearAll() {
      this.sessions = []
      this.activeSessionId = ''
      this.isLoadedFromServer = false
    },

    /**
     * 切换到指定会话：设置活跃会话、加载消息历史
     */
    async switchToSession(sessionId: string) {
      const chatStore = (await import('./chatStore')).useChatStore()
      const connectionStore = useConnectionStore()

      chatStore.isRestoringSession = true
      this.setActiveSession(sessionId)
      connectionStore.setLastSession(sessionId)

      // 清空上一会话的 TokenUsage 明细记录
      chatStore.tokenUsageRecords = []

      // 从服务端同步当前 session 的 token 用量统计
      await chatStore.syncSessionTokenStats(sessionId)

      try {
        const detail = await connectionStore.fetchSessionDetail(sessionId)
        if (detail?.messages && detail.messages.length > 0) {
          chatStore.restoreSessionMessages(sessionId, detail.messages)
          chatStore.sessionRevealPending = true
          // 异步加载子Agent 会话（不阻塞主界面渲染）
          chatStore.loadSubtaskSessions(sessionId).catch(err => console.warn('Failed to load subtask sessions:', err))
        } else {
          chatStore.clearSessionMessages(sessionId)
          chatStore.isRestoringSession = false
        }
      } catch (err) {
        console.error('Failed to load session messages:', err)
        chatStore.clearSessionMessages(sessionId)
        chatStore.isRestoringSession = false
      }
    }
  }
})
