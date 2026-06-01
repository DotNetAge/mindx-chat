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
const showModelPicker = ref(false)

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

        if (detail?.meta?.project_dir) {
          connectionStore.currentProjectDir = detail.meta.project_dir
          console.log(`[MindX] ✅ Set project dir from session: ${detail.meta.project_dir}`)
        } else {
          console.warn(`[MindX] ⚠️ No project_dir in session meta, trying to fetch home dir...`)
          try {
            const homeDir = await connectionStore.fetchFSHome()
            if (homeDir && homeDir !== '/') {
              connectionStore.currentProjectDir = homeDir
              console.log(`[MindX] ✅ Set project dir from home: ${homeDir}`)
            }
          } catch (err) {
            console.warn(`[MindX] Could not fetch home directory:`, err)
          }
        }
      } else {
        console.warn(`[MindX] ⚠️ No target session found (lastSessionId: ${lastSessionId})`)
      }

      // ========================================
      // 🎯 Model 初始化：只从服务端 ~/.mindx/mindh.json 读取
      // ❌ 不再从 Agent.model 读取
      // ❌ 不再从 localStorage 缓存读取
      // ========================================
      console.log(`[MindX] 📋 Fetching user config from server (~/.mindx/mindh.json)...`)

      try {
        const userConfig = await connectionStore.fetchUserConfig()
        const modelFromConfig = userConfig.default_model || userConfig.last_model

        console.log(`[MindX] 📋 User config response:`)
        console.log(`  - default_model: "${userConfig.default_model}"`)
        console.log(`  - last_model: "${userConfig.last_model}"`)
        console.log(`  - Selected model: "${modelFromConfig}"`)

        if (modelFromConfig) {
          connectionStore.setCurrentModel(modelFromConfig)
          console.log(`[MindX] ✅ Model set from server config: ${modelFromConfig}`)
        } else {
          console.warn(`[MindX] ❌ No model in server config, showing picker...`)
          showModelPicker.value = true
        }
      } catch (configErr) {
        console.error(`[MindX] ❌ Failed to fetch user config:`, configErr)
        console.warn(`[MindX] Falling back to model picker...`)
        showModelPicker.value = true
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
    connectionStore.currentProjectDir = selectedDirectory.value

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
    console.log(`[MindX] Created session: ${sessionId} for agent: ${setupAgentName.value} with dir: ${selectedDirectory.value}`)

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
      :show-model-picker="showModelPicker"
      @update:selected-directory="selectedDirectory = $event"
      @setup-confirm="handleDirectoryConfirm"
      @setup-cancel="handleDirectoryCancel"
      @toggle-setup-dialog="showSetupDialog = !showSetupDialog"
      @update:show-model-picker="showModelPicker = $event"
    />
  </ElConfigProvider>
</template>