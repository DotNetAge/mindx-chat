import { defineStore } from 'pinia'

export interface Session {
  session_id: string
  agent_name?: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
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
    }
  },

  persist: {
    key: 'mindx-sessions',
    storage: localStorage,
    paths: ['sessions', 'activeSessionId']
  }
})
