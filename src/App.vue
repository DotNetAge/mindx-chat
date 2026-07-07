<script setup>
import { ref, onMounted, watch, provide } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatLayout from './components/ChatLayout.vue'
import { useConnectionStore } from './stores/connectionStore'
import { useSessionStore } from './stores/sessionStore'
import { useChatStore } from './stores/chatStore'
import { ElConfigProvider, ElMessage } from 'element-plus'

const connectionStore = useConnectionStore()
const sessionStore = useSessionStore()
const chatStore = useChatStore()
const { t } = useI18n()

const showSetupDialog = ref(false)
const showEntityTags = ref(false)
provide('showSetupDialog', showSetupDialog)
provide('showEntityTags', showEntityTags)
const setupAgentName = ref('')
const selectedDirectory = ref('')
const pendingSetup = ref(false)
const showModelPicker = ref(false)

async function initializeAfterConnect() {
  if (!connectionStore.isConnected) return

  // Agent/Session 自动选择由 Sidebar 中基于 user.config 的 watcher 处理
  // 这里仅处理 Model 初始化
  // 注意：fetchAgents 已在 Sidebar watcher 中调用，此处不再重复

  // ========================================
  // 🎯 Model 初始化：只从服务端 ~/.mindx.json 读取
  // ❌ 不再从 Agent.model 读取
  // ❌ 不再从 localStorage 缓存读取
  // ========================================
  console.log(`[MindX] 📋 Fetching user config from server (/home/mindx/.mindx/mindx.json)...`)

  try {
    const userConfig = await connectionStore.fetchUserConfig()
    const modelFromConfig = userConfig.default_model || userConfig.last_model

    console.log(`[MindX] 📋 User config response:`)
    console.log(`  - default_model: "${userConfig.default_model}"`)
    console.log(`  - last_model: "${userConfig.last_model}"`)
    console.log(`  - last_agent: "${userConfig.last_agent}"`)
    console.log(`  - last_session_id: "${userConfig.last_session_id}"`)
    console.log(`  - Selected model: "${modelFromConfig}"`)

    if (modelFromConfig) {
      connectionStore.setCurrentModel(modelFromConfig)
      console.log(`[MindX] ✅ Model set from server config: ${modelFromConfig}`)
    } else {
      console.warn(`[MindX] ❌ No model in server config — user will configure via header gear button`)
    }
  } catch (configErr) {
    console.error(`[MindX] ❌ Failed to fetch user config:`, configErr)
    console.warn(`[MindX] User can configure via header gear button`)
  }
}

async function handleDirectoryConfirm() {
  if (!selectedDirectory.value.trim()) {
    ElMessage.warning({ message: t('chat.selectWorkspace'), duration: 3000 })
    return
  }
  if (!setupAgentName.value) {
    ElMessage.error({ message: '未选择 Agent，请先选择一个 Agent', duration: 3000 })
    return
  }

  // 设计规则：同一个 Agent 下每个会话对应唯一目录，如果当前 Agent 已有此目录的会话则阻止创建
  const normalizedSelected = selectedDirectory.value.replace(/\/+$/, '')
  const existingSession = sessionStore.sessions.find(
    s => s.agent_name === setupAgentName.value &&
         s.project_dir &&
         s.project_dir.replace(/\/+$/, '') === normalizedSelected
  )
  if (existingSession) {
    ElMessage.warning({
      message: t('chat.duplicateDirWarning', { agent: setupAgentName.value, dir: normalizedSelected }),
      duration: 5000
    })
    return
  }

  try {
    const result = await connectionStore.createSession(setupAgentName.value, selectedDirectory.value)
    const sessionId = result.session_id
    console.log(`[MindX] Using session ${sessionId} for agent: ${setupAgentName.value} with dir: ${selectedDirectory.value}`)

    connectionStore.setLastAgent(setupAgentName.value)
    connectionStore.setLastSession(sessionId)
    connectionStore.currentProjectDir = selectedDirectory.value

    // 从服务端获取真实 session 元数据（title, project_working_dir 等）
    const detail = await connectionStore.fetchSessionDetail(sessionId)
    const meta = detail?.meta || {}
    console.log(`[MindX] 📥 session detail:`, JSON.parse(JSON.stringify(detail)))
    console.log(`[MindX] 📋 session meta:`, JSON.parse(JSON.stringify(meta)))

    sessionStore.addSession({
      session_id: sessionId,
      agent_name: setupAgentName.value,
      title: meta.title || '',
      created_at: meta.created_at || new Date().toISOString(),
      updated_at: meta.updated_at || new Date().toISOString(),
      message_count: meta.message_count || 0,
      project_dir: meta.project_working_dir || selectedDirectory.value
    })
    sessionStore.setActiveSession(sessionId)

    showSetupDialog.value = false
    pendingSetup.value = false
    ElMessage.success({ message: t('chat.sessionCreated'), duration: 2000 })
  } catch (e) {
    console.error('[MindX] Failed to setup session:', e)
    const msg = e?.message || t('chat.sessionCreateFailed')
    ElMessage.error({ message: msg, duration: 5000 })
  }
}

function handleDirectoryCancel() {
  showSetupDialog.value = false
  pendingSetup.value = false
}

// 不论通过什么路径打开 setup 对话框（StatusBar → inject、Sidebar 按钮、ChatArea 等），
// 都确保 setupAgentName 被正确赋值。
watch(showSetupDialog, (val) => {
  if (val) {
    setupAgentName.value = connectionStore.currentAgentName || connectionStore.currentAgent?.name || ''
  }
})

watch(() => connectionStore.state, (newState) => {
})

onMounted(async () => {
  const connected = await connectionStore.autoConnect(5000)
  if (!connected) {
  } else {
    await initializeAfterConnect()
    // 连接成功后从服务端同步 token 统计（替代旧的 localStorage 方案）
    await chatStore.syncTotalTokenStats()
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
      @toggle-setup-dialog="showSetupDialog = !showSetupDialog; if(showSetupDialog) { setupAgentName = connectionStore.currentAgentName || connectionStore.currentAgent?.name || '' }"
      @update:show-model-picker="showModelPicker = $event"
    />
  </ElConfigProvider>
</template>