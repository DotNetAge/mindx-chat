<script setup>
import { ref, onMounted, watch } from 'vue'
import ChatLayout from './components/ChatLayout.vue'
import { useConnectionStore } from './stores/connectionStore'
import { useSessionStore } from './stores/sessionStore'
import { useChatStore } from './stores/chatStore'
import { ElConfigProvider } from 'element-plus'

const connectionStore = useConnectionStore()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

const showSetupDialog = ref(false)
const setupAgentName = ref('')
const selectedDirectory = ref('')
const pendingSetup = ref(false)

async function initializeAfterConnect() {
  if (!connectionStore.isConnected) return

  try {
    const agents = await connectionStore.fetchAgents()
    if (agents.length === 0) return

    connectionStore.loadUserPreferences()

    const lastAgentName = connectionStore.lastAgentName
    let targetAgentName = lastAgentName

    if (!targetAgentName || !agents.find(a => a.name === targetAgentName)) {
      targetAgentName = agents[0]?.name || ''
    }

    if (targetAgentName) {
      connectionStore.setCurrentAgent(targetAgentName)
      const sessions = await connectionStore.fetchSessions(targetAgentName)

      const lastSessionId = connectionStore.lastSessionId
      let targetSession = null

      if (lastSessionId) {
        targetSession = sessions.find(s => s.session_id === lastSessionId)
      }

      if (targetSession) {
        sessionStore.setActiveSession(targetSession.session_id)
        const detail = await connectionStore.fetchSessionDetail(targetSession.session_id)
        chatStore.restoreSessionMessages(targetSession.session_id, detail.messages || [])
        console.log(`[MindX] Resumed session: ${targetSession.session_id}`)
      }

      // 根据 agent 的 model 字段设置 Model
      const targetAgent = agents.find(a => a.name === targetAgentName)
      if (targetAgent?.model && !connectionStore.currentModelName) {
        connectionStore.setCurrentModel(targetAgent.model)
      }
    }
  } catch (e) {
    console.error('[MindX] Initialization error:', e)
  }
}

async function handleDirectoryConfirm() {
  if (!selectedDirectory.value.trim() || !setupAgentName.value) return

  try {
    const result = await connectionStore.createSession(setupAgentName.value, selectedDirectory.value)
    const sessionId = result.session_id

    connectionStore.setLastAgent(setupAgentName.value)
    connectionStore.setLastSession(sessionId)

    const newSession = {
      session_id: sessionId,
      agent_name: setupAgentName.value,
      title: `Session ${sessionId.substring(0, 8)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0
    }
    sessionStore.syncServerSessions([newSession])

    sessionStore.setActiveSession(sessionId)
    console.log(`[MindX] Created session: ${sessionId} for agent: ${setupAgentName.value}`)

    showSetupDialog.value = false
    pendingSetup.value = false
  } catch (e) {
    console.error('[MindX] Failed to create session:', e)
  }
}

function handleDirectoryCancel() {
  showSetupDialog.value = false
  pendingSetup.value = false
}

watch(() => connectionStore.state, (newState) => {
  // watch 只用于连接状态变化时的 UI 响应，不在这里初始化
})

onMounted(async () => {
  chatStore.loadTokenStats()

  const connected = await connectionStore.autoConnect(5000)
  if (!connected) {
    console.log('[MindX] Auto-connect timed out, running in offline mode')
  } else {
    initializeAfterConnect()
  }
})
</script>

<template>
  <ElConfigProvider namespace="el">
    <ChatLayout
      :show-setup-dialog="showSetupDialog"
      :setup-agent-name="setupAgentName"
      :selected-directory="selectedDirectory"
      @update:selected-directory="selectedDirectory = $event"
      @setup-confirm="handleDirectoryConfirm"
      @setup-cancel="handleDirectoryCancel"
      @toggle-setup-dialog="showSetupDialog = !showSetupDialog"
    />
  </ElConfigProvider>
</template>
