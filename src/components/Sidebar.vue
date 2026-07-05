<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Search, UserFilled, Monitor, ChatDotRound, FolderOpened, Folder, CollectionTag, Setting, Link, SwitchButton, Plus, Close, Document, FolderAdd, Refresh } from '@element-plus/icons-vue'
import { useSessionStore } from '../stores/sessionStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useChatStore } from '../stores/chatStore'
import { createMindXClient, getMindXClient } from '../services/websocket'
import type { ServerSessionInfo } from '../types/websocket'
import DirectoryBrowser from './DirectoryBrowser.vue'
import TokenUsageReport from './TokenUsageReport.vue'
import RuleEditor from './RuleEditor.vue'
import EntityTagsDialog from './EntityTagsDialog.vue'
import AgentSelectorDialog from './AgentSelectorDialog.vue'
import FileExplorer from './FileExplorer.vue'
import { useFileExplorerStore } from '../stores/fileExplorerStore'
import { useGraphStore } from '../stores/graphStore'
import { useI18n } from 'vue-i18n'
import { useMarkdown } from '../composables/useMarkdown'

const { t, locale } = useI18n()
const currentLocale = ref(locale.value)
const fileExplorerStore = useFileExplorerStore()
const graphStore = useGraphStore()

const langOptions = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' }
]

function switchLocale(val: string) {
  currentLocale.value = val
  locale.value = val
  localStorage.setItem('mindx-locale', val)
}

const props = defineProps({
  isCollapsed: {
    type: Boolean,
    default: false
  },
  showSetupDialog: {
    type: Boolean,
    default: false
  },
  setupAgentName: {
    type: String,
    default: ''
  },
  selectedDirectory: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['toggle-collapse', 'update:selectedDirectory', 'setupConfirm', 'setupCancel', 'toggleSetupDialog', 'toggle-file-browser'])

const sessionStore = useSessionStore()
const connectionStore = useConnectionStore()
const chatStore = useChatStore()
const searchQuery = ref('')
const serverUrl = ref(connectionStore.serverUrl || 'ws://localhost:1314/ws')
const showConnectionDialog = ref(false)
const setupSelectedPath = ref('')
const showTokenReport = ref(false)
const showRuleEditor = ref(false)
const showEntityTags = inject('showEntityTags', ref(false))
const restarting = ref(false)
const showAgentSelector = ref(false)
const showAbout = ref(false)
const showDirBrowser = ref(false)
const currentRelease = ref<any>(null)
const loadingRelease = ref(false)
const checkingUpdate = ref(false)
const isLatestVersion = ref(false)
const updateInfo = ref<any>(null)       // VersionInfo from daemon check_update
const updateRelease = ref<any>(null)     // GitHub release data for the newer version
const loadingUpdateRelease = ref(false)
const applyingUpdate = ref(false)

// 获取当前版本的 Release Notes（匹配 connectionStore.serverVersion）
async function fetchCurrentRelease() {
  const version = connectionStore.serverVersion
  if (!version) return
  loadingRelease.value = true
  try {
    const resp = await fetch(`https://api.github.com/repos/DotNetAge/mindx/releases/tags/v${version}`)
    if (resp.ok) {
      currentRelease.value = await resp.json()
    }
  } catch (e) {
    console.warn('[MindX] Failed to fetch release notes:', e)
  } finally {
    loadingRelease.value = false
  }
}

async function checkForUpdates() {
  checkingUpdate.value = true
  isLatestVersion.value = false
  updateInfo.value = null
  updateRelease.value = null
  try {
    const client = getMindXClient()
    if (client) {
      const result = await client.call('server.check_update', {})
      console.log('[MindX] Update check result:', result)
      if (result && !result.update_available) {
        isLatestVersion.value = true
      } else if (result && result.update_available) {
        updateInfo.value = result
        // 获取新版本的 Release Notes
        try {
          loadingUpdateRelease.value = true
          const resp = await fetch(`https://api.github.com/repos/DotNetAge/mindx/releases/tags/v${result.latest_version}`)
          if (resp.ok) {
            updateRelease.value = await resp.json()
          }
        } catch (e) {
          console.warn('[MindX] Failed to fetch update release notes:', e)
        } finally {
          loadingUpdateRelease.value = false
        }
      }
    }
  } catch (e) {
    console.warn('[MindX] Failed to check for updates:', e)
  } finally {
    checkingUpdate.value = false
  }
}

async function applyUpdate() {
  if (!updateInfo.value) return

  const source = updateInfo.value.install_source
  const isMac = navigator.platform.toUpperCase().includes('MAC')

  // Determine the update command based on install source
  let cmd: string | null = null
  if (source === 'homebrew') {
    cmd = 'brew update && brew upgrade mindx && mindx restart'
  } else if (source === 'snap') {
    cmd = 'sudo snap refresh mindx && mindx restart'
  } else if (source === 'system' && isMac) {
    cmd = 'brew update && brew upgrade mindx && mindx restart'
  } else if (source === 'system' && !isMac) {
    cmd = 'sudo apt update && sudo apt install -y mindx && mindx restart'
  }

  if (cmd) {
    // Package-managed: auto-run command in terminal drawer
    showAbout.value = false
    connectionStore.setPendingTerminalCommand(cmd)
    return
  }

  // Manual install: use the existing backend download-and-install flow
  applyingUpdate.value = true
  try {
    const client = getMindXClient()
    if (client) {
      await client.call('server.apply_update', {})
      showAbout.value = false
      updateInfo.value = null
      updateRelease.value = null
      isLatestVersion.value = false
      ElMessage.success(t('sidebar.about.updateSuccess'))
    }
  } catch (e) {
    console.warn('[MindX] Failed to apply update:', e)
  } finally {
    applyingUpdate.value = false
  }
}

function showAboutDialog() {
  showAbout.value = true
  isLatestVersion.value = false
  updateInfo.value = null
  updateRelease.value = null
  fetchCurrentRelease()
}

watch(() => connectionStore.pendingShowAbout, (val) => {
  if (val) {
    connectionStore.pendingShowAbout = false
    showAboutDialog()
  }
})

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const { md } = useMarkdown()
const releaseBodyHtml = computed(() => {
  if (!currentRelease.value?.body) return ''
  return md.render(currentRelease.value.body)
})

// --- 用户偏好设定（来自服务端 user.config）---
const userPreferences = ref<{ lastAgent: string; lastSessionId: string }>({
  lastAgent: '',
  lastSessionId: ''
})
let autoSelectedAgent = false
let autoSelectedSession = false

function shortenPath(absPath: string): string {
  if (!absPath) return ''
  // 将 /Users/xxx 替换为 ~
  let path = absPath
  const m = absPath.match(/^\/Users\/[^/]+/)
  if (m) {
    path = '~' + absPath.slice(m[0].length)
  }
  // 如果 split 深度 > 3，只保留最后两级
  const parts = path.split('/')
  if (parts.length > 3) {
    return '.../' + parts.slice(-2).join('/')
  }
  return path
}

const displaySelectedPath = computed(() => shortenPath(setupSelectedPath.value))

const agentsList = computed(() => {
  return connectionStore.agents.map(agent => ({
    ...agent,
    isActive: agent.name === (connectionStore.currentAgent?.name || connectionStore.primaryAgent?.name)
  }))
})

const sessions = computed(() => {
  const currentAgentName = connectionStore.currentAgent?.name || ''

  return sessionStore.sortedSessions
    .filter(s => {
      if (!currentAgentName) return true
      return s.agent_name === currentAgentName || !s.agent_name
    })
    .map(s => ({
      id: s.session_id,
      title: s.title || t('common.noData'),
      subtitle: formatTime(s.updated_at),
      projectDir: s.project_dir || '',
      time: formatTime(s.updated_at),
      isActive: s.session_id === sessionStore.activeSessionId
    }))
})

const filteredSessions = computed(() => {
  if (!searchQuery.value.trim()) return sessions.value
  
  const query = searchQuery.value.toLowerCase()
  return sessions.value.filter(s => 
    s.title.toLowerCase().includes(query) ||
    s.subtitle.toLowerCase().includes(query)
  )
})

function formatTime(timeStr?: string): string {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffDays = Math.floor(diffMins / 1440)
  
  if (diffMins < 1) return t('sidebar.timeAgo.justNow')
  if (diffMins < 60) return t('sidebar.timeAgo.minutesAgo', { n: diffMins })
  if (diffMins < 1440) return t('sidebar.timeAgo.hoursAgo', { n: Math.floor(diffMins / 60) })
  if (diffDays < 30) return t('sidebar.timeAgo.daysAgo', { n: diffDays })
  
  // 30 天以上显示具体日期
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function selectAgent(agentName: string) {
  connectionStore.setCurrentAgent(agentName)
  connectionStore.setLastAgent(agentName)
  loadSessionsForAgent(agentName)
}

async function loadSessionsForAgent(agentName?: string) {
  try {
    const serverSessions = await connectionStore.fetchSessions(agentName)
    console.log(`[MindX] 📥 serverSessions (raw):`, JSON.parse(JSON.stringify(serverSessions)))
    const mapped = serverSessions.map(s => ({
      session_id: s.session_id,
      agent_name: s.agent_name || agentName || '',
      title: s.title || t('common.noData'),  // 服务端已从 meta.json 返回 title（首条 user 消息）
      created_at: s.created_at,
      updated_at: s.last_activity_at,
      message_count: 0,  // messages 通过 session.get 动态加载，列表不返回
      project_dir: s.project_dir
    }))
    console.log(`[MindX] 📋 mapped sessions:`, JSON.parse(JSON.stringify(mapped)))

    sessionStore.syncServerSessions(mapped, true)

    // 自动选择偏好中的 session 并加载消息历史
    if (autoSelectedAgent && !autoSelectedSession && userPreferences.value.lastSessionId) {
      const matched = serverSessions.find(s => s.session_id === userPreferences.value.lastSessionId)
      if (matched) {
        autoSelectedSession = true
        console.log(`[MindX] 🎯 Auto-selecting session from preferences: "${userPreferences.value.lastSessionId}"`)
        await selectSession(matched.session_id)
        return
      } else {
        console.log(`[MindX] ⚠️ last_session_id "${userPreferences.value.lastSessionId}" not found in session list`)
      }
    }

    if (serverSessions.length > 0 && !sessionStore.activeSessionId) {
      // 按 last_activity_at 降序排列，确保 fallback 选择最近会话
      const sorted = [...serverSessions].sort((a, b) => {
        const aTime = a.last_activity_at || a.created_at || 0
        const bTime = b.last_activity_at || b.created_at || 0
        return String(bTime).localeCompare(String(aTime))
      })
      await selectSession(sorted[0].session_id)
    }
  } catch (err) {
    console.error('Failed to load sessions:', err)
  }
}

// fallbackLoadSessions: 当没有用户偏好或偏好失效时，尝试回退到 executive-assistant
async function fallbackLoadSessions(agents: any[]) {
  if (agents.length === 0) {
    console.warn('[MindX] ⚠️ No agents available, cannot load sessions')
    return
  }
  // 优先尝试 executive-assistant，不存在则取第一个 active agent
  const primaryAgent = agents.find(a => a.name === 'executive-assistant') || agents.find(a => a.active) || agents[0]
  autoSelectedAgent = true
  console.log(`[MindX] 🔄 Fallback: selecting agent "${primaryAgent.name}"`)
  connectionStore.setLastAgent(primaryAgent.name)
  connectionStore.setCurrentAgent(primaryAgent.name)
  // 不直接调用 loadSessionsForAgent —— 由 setCurrentAgent 触发的 watcher 处理
}

async function selectSession(sessionId: string) {
  chatStore.isRestoringSession = true
  sessionStore.setActiveSession(sessionId)
  connectionStore.setLastSession(sessionId)

  // 从服务端同步当前 session 的 token 用量统计
  await chatStore.syncSessionTokenStats(sessionId)

  try {
    const detail = await connectionStore.fetchSessionDetail(sessionId)
    if (detail?.messages && detail.messages.length > 0) {
      chatStore.restoreSessionMessages(sessionId, detail.messages)
      // 消息已恢复，通知 ChatArea 背后渲染→滚动→揭晓骨架屏
      chatStore.sessionRevealPending = true
      // 异步加载子Agent 会话（不阻塞主界面渲染）
      chatStore.loadSubtaskSessions(sessionId).catch(err => console.warn('Failed to load subtask sessions:', err))
    } else {
      // 服务端无消息时清空该 session 的消息
      chatStore.clearSessionMessages(sessionId)
      chatStore.isRestoringSession = false
    }
  } catch (err) {
    console.error('Failed to load session messages:', err)
    // 加载失败时清空该 session 的消息，避免显示旧数据
    chatStore.clearSessionMessages(sessionId)
    chatStore.isRestoringSession = false
  }
}

async function handleConnect() {
  try {
    connectionStore.setServerUrl(serverUrl.value)

    if (!connectionStore.clientId) {
      connectionStore.generateClientId()
    }

    createMindXClient(serverUrl.value, (_old, newState) => {
      connectionStore.setConnectionState(newState)
      if (newState === 'error') {
        const client = getMindXClient()
        connectionStore.setServerError(client?.lastError.value || t('sidebar.status.error'))
      }
    })

    connectionStore.setConnectionState('connecting')
    showConnectionDialog.value = false
  } catch (error) {
    console.error('Connection failed:', error)
    connectionStore.setServerError(String(error))
  }
}

function handleDisconnect() {
  connectionStore.disconnect()
}

async function handleRestartService() {
  try {
    await ElMessageBox.confirm(
      t('sidebar.settingsRestartConfirm'),
      t('sidebar.settingsRestartTitle'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
  } catch {
    return // user cancelled
  }

  restarting.value = true
  try {
    const client = getMindXClient()
    if (client) {
      await client.call('server.restart_daemon', {})
      ElMessage.success(t('sidebar.settingsRestartSuccess'))
    }
  } catch (e: any) {
    ElMessage.error(t('sidebar.settingsRestartFailed') + (e.message ? `: ${e.message}` : ''))
  } finally {
    restarting.value = false
  }
}

function handleNewSession() {
  if (connectionStore.isConnected && connectionStore.currentAgent) {
    setupSelectedPath.value = ''
    emit('toggleSetupDialog')
  }
}

const dirBrowserRef = ref<InstanceType<typeof DirectoryBrowser> | null>(null)

async function confirmSetup() {
  const browser = dirBrowserRef.value
  if (browser) {
    const targetPath = browser.resolvedPath
    // 如果输入框有内容且路径与当前选中不同，先创建目录
    if (targetPath !== setupSelectedPath.value) {
      try {
        await connectionStore.fetchFSMkdir(targetPath)
        setupSelectedPath.value = targetPath
      } catch (e: any) {
        console.error('[MindX] Failed to create directory:', e)
        ElMessage.error({ message: e?.message || '创建目录失败', duration: 3000 })
        return
      }
    }
  }
  emit('update:selectedDirectory', setupSelectedPath.value)
  emit('setupConfirm')
}

function handleSetupSelect(path: string) {
  emit('update:selectedDirectory', path)
  showDirBrowser.value = false
}

async function handleDeleteSession(sessionId: string, event: Event) {
  event.stopPropagation()

  const session = sessionStore.sessions.find(s => s.session_id === sessionId)
  const sessionTitle = session?.title || t('sidebar.sessionList')

  try {
    await ElMessageBox.confirm(
      t('sidebar.deleteConfirmMsg'),
      t('sidebar.deleteConfirmTitle'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    // 服务端删除可能失败（网络/客户端未初始化等），但无论结果如何都要从本地 store 中移除
    try {
      if (!connectionStore.isOfflineMode) {
        await connectionStore.deleteSession(sessionId)
        // Refresh filewatch status to reflect removed watch dir
        graphStore.refreshFilewatchStatus()
      }
    } catch (serverErr) {
      console.warn('[MindX] 服务端删除失败，继续从本地移除:', serverErr)
    }
    sessionStore.deleteSession(sessionId)
  } catch (err: any) {
    if (err !== 'cancel' && err !== 'close') {
      console.error('[MindX] 删除会话失败:', err)
    }
  }
}

onMounted(() => {
  console.log(`[MindX] 📌 Sidebar mounted, serverVersion = "${connectionStore.serverVersion}"`)
})

watch(() => connectionStore.state, async (newState, oldState) => {
  if (newState === 'connected' && oldState !== 'connected') {
    // 重置自动选择标记，便于重新连接时再次触发
    autoSelectedAgent = false
    autoSelectedSession = false

    try {
      const [agents, models, , userConfig] = await Promise.all([
        connectionStore.fetchAgents(),
        connectionStore.fetchModels(),
        connectionStore.fetchProviders(),
        connectionStore.fetchUserConfig(),
        connectionStore.fetchServerVersion()
      ])

      // 1. 读取用户偏好：localStorage（WebUI 最近选择）优先级最高，
      //    服务端配置（来自 TUI/CLI 或旧版进程）作为兜底
      const localLastAgent = localStorage.getItem('mindx-last-agent')
      if (localLastAgent) {
        console.log(`[MindX] 📋 lastAgent from localStorage: "${localLastAgent}"`)
        userPreferences.value.lastAgent = localLastAgent
      } else if (userConfig.last_agent) {
        console.log(`[MindX] 📋 lastAgent from server config: "${userConfig.last_agent}"`)
        userPreferences.value.lastAgent = userConfig.last_agent
      }
      if (userConfig.last_session_id) {
        userPreferences.value.lastSessionId = userConfig.last_session_id
      }

      // 2. 填充 agents / models 到 store（这会触发 agentsList computed 更新）
      connectionStore.setAgents(agents.map(a => ({
        name: a.name,
        role: a.role || '',
        description: a.description,
        model: a.model,
        skills: a.skills,
        exclude_tools: a.exclude_tools,
        introduction: a.introduction,
        meta: a.meta
      })))

      connectionStore.setModels(models.map(m => ({
        name: m.name,
        title: m.title || m.name,
        description: m.description,
        provider: m.provider,
        enabled: m.enabled !== false
      })))

      // 3. 显式触发 Agent 自动选择（不依赖 watcher 时序）
      if (!autoSelectedAgent && userPreferences.value.lastAgent) {
        const hasAgent = agents.find(a => a.name === userPreferences.value.lastAgent)
        if (hasAgent) {
          autoSelectedAgent = true
          console.log(`[MindX] 🎯 Auto-selecting agent from preferences: "${userPreferences.value.lastAgent}"`)
          connectionStore.setLastAgent(hasAgent.name)
          connectionStore.setCurrentAgent(hasAgent.name)
          // 不直接调用 loadSessionsForAgent —— 由 setCurrentAgent 触发的 watcher 处理
        } else {
          // last_agent 指向的 agent 不存在，fallback 到第一个可用 agent
          console.log(`[MindX] ⚠️ last_agent "${userPreferences.value.lastAgent}" not found, falling back to first available agent`)
          await fallbackLoadSessions(agents)
        }
      } else if (!autoSelectedAgent) {
        // 无用户偏好时，使用第一个可用 agent 加载 session
        console.log(`[MindX] 📋 No user preference, using first available agent`)
        await fallbackLoadSessions(agents)
      }

      console.log(`[MindX] ✅ Loaded ${agents.length} agents and ${models.length} models`)
    } catch (err) {
      console.error('Failed to load initial data:', err)
      connectionStore.setServerError(`${t('common.error')}: ${err}`)
    }
  }
})

// 监听 Agent 切换（覆盖所有切换路径：AgentSelectorDialog 双击/按钮等）
// 守卫条件 `isLoadedFromServer` 已被移除：如果初始 loadSessionsForAgent
// 因任何时序问题未完成 syncServerSessions，该守卫会永久阻止后续切换。
// loadSessionsForAgent 本身就是幂等的（syncServerSessions 是覆盖操作），
// 即使初始加载期间触发一次冗余调用也无害。
watch(() => connectionStore.currentAgentName, async (newAgent, oldAgent) => {
  if (!newAgent || newAgent === oldAgent) return
  if (!connectionStore.isConnected) return
  console.log(`[MindX] 🔄 Agent switched: "${oldAgent}" → "${newAgent}", reloading sessions...`)
  await loadSessionsForAgent(newAgent)
})

watch(() => connectionStore.showConnectionDialog, (val) => {
  if (val) showConnectionDialog.value = true
})

watch(showConnectionDialog, (val) => {
  if (!val) connectionStore.showConnectionDialog = false
})

watch(() => connectionStore.showTokenReport, (val) => {
  if (val) showTokenReport.value = true
})

watch(showTokenReport, (val) => {
  if (!val) connectionStore.showTokenReport = false
})
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: isCollapsed }">
    <!-- Header -->
    <div class="sidebar-header">
      <div class="logo-section" @click="showAboutDialog" style="cursor: pointer;">
        <div class="logo-icon">
          <img src="/icon.svg" alt="MindX" width="48" height="48" />
        </div>
        <transition name="fade">
          <div v-if="!isCollapsed" class="logo-text">
            <h1>MindX</h1>
            <span>v{{ connectionStore.serverVersion || '?.?' }}</span>
          </div>
        </transition>
      </div>
      <el-popover placement="bottom-end" :width="300" trigger="click">
        <template #reference>
          <el-button text circle class="settings-btn">
            <el-icon><Setting /></el-icon>
          </el-button>
        </template>

        <div class="settings-panel">
          <h4>⚙️ {{ t('sidebar.settings') }}</h4>

          <!-- Language -->
          <div class="setting-row setting-row-lang">
            <div class="setting-row-info">
              <el-icon class="setting-row-icon"><ChatDotRound /></el-icon>
              <div class="setting-row-text">
                <div class="setting-row-title">{{ t('sidebar.language') }}</div>
                <div class="setting-row-desc">{{ t('sidebar.settingsLanguageDesc') }}</div>
              </div>
            </div>
            <div class="lang-switcher">
              <button
                v-for="opt in langOptions"
                :key="opt.value"
                class="lang-btn"
                :class="{ active: currentLocale === opt.value }"
                @click="switchLocale(opt.value)"
              >{{ opt.label }}</button>
            </div>
          </div>

          <!-- Entity Tags -->
          <div class="setting-row">
            <div class="setting-row-info">
              <el-icon class="setting-row-icon"><CollectionTag /></el-icon>
              <div class="setting-row-text">
                <div class="setting-row-title">{{ t('entityTags.button') }}</div>
                <div class="setting-row-desc">{{ t('sidebar.settingsEntityTagsDesc') }}</div>
              </div>
            </div>
            <el-button
              size="small"
              @click="showEntityTags = true"
              :disabled="!connectionStore.isConnected"
            >
              {{ t('sidebar.settingsSelectBtn') }}
            </el-button>
          </div>

          <!-- Rules -->
          <div class="setting-row">
            <div class="setting-row-info">
              <el-icon class="setting-row-icon"><Document /></el-icon>
              <div class="setting-row-text">
                <div class="setting-row-title">{{ t('sidebar.rules') }}</div>
                <div class="setting-row-desc">{{ t('sidebar.settingsRulesDesc') }}</div>
              </div>
            </div>
            <el-button
              size="small"
              @click="showRuleEditor = true"
              :disabled="!connectionStore.isConnected"
            >
              {{ t('sidebar.settingsManageBtn') }}
            </el-button>
          </div>

          <!-- Restart Service -->
          <div class="setting-row">
            <div class="setting-row-info">
              <el-icon class="setting-row-icon"><Refresh /></el-icon>
              <div class="setting-row-text">
                <div class="setting-row-title">{{ t('sidebar.settingsRestartTitle') }}</div>
                <div class="setting-row-desc">{{ t('sidebar.settingsRestartDesc') }}</div>
              </div>
            </div>
            <el-button
              size="small"
              type="danger"
              @click="handleRestartService"
              :loading="restarting"
            >
              {{ t('sidebar.settingsRestartBtn') }}
            </el-button>
          </div>
        </div>
      </el-popover>
    </div>

    <!-- User Profile -->
     <div class="user-profile">
       <div class="user-info">
         <span class="user-name">
           {{ connectionStore.currentAgent?.meta?.name_zh || connectionStore.currentAgent?.name || connectionStore.primaryAgent?.meta?.name_zh || connectionStore.primaryAgent?.name || t('sidebar.defaultUserName') }}
         </span>
         <span class="user-status">
           <span class="status-dot" :class="{ online: connectionStore.isConnected }"></span>
           {{ connectionStore.currentAgent?.meta?.role_zh || connectionStore.currentAgent?.role || connectionStore.primaryAgent?.meta?.role_zh || connectionStore.primaryAgent?.role || '' }}
         </span>
         <span class="user-rating" v-if="connectionStore.currentAgent">
           <span v-for="i in 5" :key="i" class="star" :class="{ filled: i <= (connectionStore.currentAgent.meta?.ratings || 0) }">★</span>
         </span>
       </div>

       <el-button
         text
         circle
         class="agent-select-btn"
         @click="showAgentSelector = true"
         :disabled="!connectionStore.isConnected"
         :title="t('agentSelector.title')"
       >
         <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
           <path d="M9 15C8.44771 15 8 15.4477 8 16C8 16.5523 8.44771 17 9 17C9.55229 17 10 16.5523 10 16C10 15.4477 9.55229 15 9 15Z"/>
           <path d="M14 16C14 15.4477 14.4477 15 15 15C15.5523 15 16 15.4477 16 16C16 16.5523 15.5523 17 15 17C14.4477 17 14 16.5523 14 16Z"/>
           <path fill-rule="evenodd" clip-rule="evenodd" d="M12 1C10.8954 1 10 1.89543 10 3C10 3.74028 10.4022 4.38663 11 4.73244V7H6C4.34315 7 3 8.34315 3 10V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V10C21 8.34315 19.6569 7 18 7H13V4.73244C13.5978 4.38663 14 3.74028 14 3C14 1.89543 13.1046 1 12 1ZM5 10C5 9.44772 5.44772 9 6 9H7.38197L8.82918 11.8944C9.16796 12.572 9.86049 13 10.618 13H13.382C14.1395 13 14.832 12.572 15.1708 11.8944L16.618 9H18C18.5523 9 19 9.44772 19 10V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V10ZM13.382 11L14.382 9H9.61803L10.618 11H13.382Z"/>
           <path d="M1 14C0.447715 14 0 14.4477 0 15V17C0 17.5523 0.447715 18 1 18C1.55228 18 2 17.5523 2 17V15C2 14.4477 1.55228 14 1 14Z"/>
           <path d="M22 15C22 14.4477 22.4477 14 23 14C23.5523 14 24 14.4477 24 15V17C24 17.5523 23.5523 18 23 18C22.4477 18 22 17.5523 22 17V15Z"/>
         </svg>
       </el-button>
     </div>

    <!-- 分隔线 -->
    <div class="divider" v-show="!isCollapsed"></div>

    <!-- New Chat Button -->
    <div class="new-chat-btn-wrapper">
      <el-button
        type="primary"
        class="new-chat-btn"
        :class="{ 'btn-collapsed': isCollapsed }"
        @click="handleNewSession"
      >
        <el-icon class="btn-icon"><Plus /></el-icon>
        <transition name="fade">
          <span v-if="!isCollapsed">{{ t('sidebar.newChat') }}</span>
        </transition>
      </el-button>
    </div>

    <!-- Search -->
    <div class="search-wrapper" v-show="!isCollapsed && sessions.length > 0">
      <el-input
        v-model="searchQuery"
        :placeholder="t('common.search') + '...'"
        :prefix-icon="Search"
        clearable
        class="search-input"
      />
    </div>

    <!-- ===== 下段：Session 列表 ===== -->
    <nav class="sessions-nav">
      <div class="nav-header" v-show="!isCollapsed">
        <span class="nav-title">
          {{ connectionStore.currentAgent ? `${connectionStore.currentAgent.name} ${t('sidebar.sessionList')}` : t('common.all') + ' ' + t('sidebar.sessionList') }}
        </span>
        <span class="session-count">{{ sessions.length }}</span>
        
        <span class="session-hint" v-if="!connectionStore.isConnected">
          {{ t('chat.offlineMode') }}
        </span>
      </div>
      
      <ul class="session-list" v-if="sessions.length > 0">
        <li
          v-for="session in filteredSessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.isActive }"
          @click="selectSession(session.id)"
        >
          <div class="session-icon">
            <el-icon><ChatDotRound /></el-icon>
          </div>
          
          <transition name="fade">
            <div v-if="!isCollapsed" class="session-content">
              <h3 class="session-title">{{ session.title }}</h3>
              <p class="session-subtitle">{{ session.subtitle }}</p>
            </div>
          </transition>
          
          <transition name="fade">
            <span v-if="!isCollapsed && session.isActive" class="active-indicator"></span>
          </transition>

          <div class="session-actions">
            <button 
              v-if="!isCollapsed" 
              class="browse-session-btn"
              @click="fileExplorerStore.open(session.projectDir)"
              :title="t('sidebar.browseSessionDir')"
            >
              <el-icon><FolderOpened /></el-icon>
            </button>
            <button 
              v-if="!isCollapsed" 
              class="delete-session-btn"
              @click="handleDeleteSession(session.id, $event)"
              :title="t('sidebar.deleteConfirmTitle')"
            >
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </li>
      </ul>

      <!-- Empty State -->
      <div v-else class="empty-sessions">
        <el-icon :size="32" color="#64748b"><FolderAdd /></el-icon>
        <p>{{ connectionStore.currentAgent ? `${t('common.noData')} ${connectionStore.currentAgent.name}` : (connectionStore.isConnected ? t('common.noData') : t('chat.notConnected')) }}</p>
        <el-button 
          size="small" 
          round 
          type="primary"
          @click="handleNewSession"
          v-if="!connectionStore.isConnected"
        >
          {{ t('common.create') }} {{ t('sidebar.sessionList') }}
        </el-button>
      </div>
    </nav>

    <!-- Footer -->
    <div class="sidebar-footer" v-show="!isCollapsed">
      <div class="footer-links">
        <a
          class="footer-link"
          href="https://github.com/dotNetAge/mindx"
          target="_blank"
          rel="noopener noreferrer"
          :title="'GitHub'"
        >
          <svg class="footer-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm3.163 21.783h-.093a.513.513 0 0 1-.382-.14.513.513 0 0 1-.14-.372v-1.406c.006-.467.01-.94.01-1.416a3.693 3.693 0 0 0-.151-1.028 1.832 1.832 0 0 0-.542-.875 8.014 8.014 0 0 0 2.038-.471 4.051 4.051 0 0 0 1.466-.964c.407-.427.71-.943.885-1.506a6.77 6.77 0 0 0 .3-2.13 4.138 4.138 0 0 0-.26-1.476 3.892 3.892 0 0 0-.795-1.284 2.81 2.81 0 0 0 .162-.582c.033-.2.05-.402.05-.604 0-.26-.03-.52-.09-.773a5.309 5.309 0 0 0-.221-.763.293.293 0 0 0-.111-.02h-.11c-.23.002-.456.04-.674.111a5.34 5.34 0 0 0-.703.26 6.503 6.503 0 0 0-.661.343c-.215.127-.405.249-.573.362a9.578 9.578 0 0 0-5.143 0 13.507 13.507 0 0 0-.572-.362 6.022 6.022 0 0 0-.672-.342 4.516 4.516 0 0 0-.705-.261 2.203 2.203 0 0 0-.662-.111h-.11a.29.29 0 0 0-.11.02 5.844 5.844 0 0 0-.23.763c-.054.254-.08.513-.081.773 0 .202.017.404.051.604.033.199.086.394.16.582A3.888 3.888 0 0 0 5.702 10a4.142 4.142 0 0 0-.263 1.476 6.871 6.871 0 0 0 .292 2.12c.181.563.483 1.08.884 1.516.415.422.915.75 1.466.964.653.25 1.337.41 2.033.476a1.828 1.828 0 0 0-.452.633 2.99 2.99 0 0 0-.2.744 2.754 2.754 0 0 1-1.175.27 1.788 1.788 0 0 1-1.065-.3 2.904 2.904 0 0 1-.752-.824 3.1 3.1 0 0 0-.292-.382 2.693 2.693 0 0 0-.372-.343 1.841 1.841 0 0 0-.432-.24 1.2 1.2 0 0 0-.481-.101c-.04.001-.08.005-.12.01a.649.649 0 0 0-.162.02.408.408 0 0 0-.13.06.116.116 0 0 0-.06.1.33.33 0 0 0 .14.242c.093.074.17.131.232.171l.03.021c.133.103.261.214.382.333.112.098.213.209.3.33.09.119.168.246.231.381.073.134.15.288.231.463.188.474.522.875.954 1.145.453.243.961.364 1.476.351.174 0 .349-.01.522-.03.172-.028.343-.057.515-.091v1.743a.5.5 0 0 1-.533.521h-.062a10.286 10.286 0 1 1 6.324 0v.005z"/>
          </svg>
          <span>GitHub</span>
        </a>
        <a
          class="footer-link"
          href="https://gitee.com/ray_liang/mindx"
          target="_blank"
          rel="noopener noreferrer"
          :title="'Gitee'"
        >
          <svg class="footer-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296z"/>
          </svg>
          <span>Gitee</span>
        </a>
      </div>
    </div>

    <!-- Connection Dialog -->
    <el-dialog
      v-model="showConnectionDialog"
      :title="t('sidebar.connectDaemon')"
      width="420px"
      :close-on-click-modal="false"
      class="connection-dialog"
      append-to-body
      destroy-on-close
    >
      <div class="dialog-content">
        <div class="dialog-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10 10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1V7h2c1.1 0 2-.9 2-2V5z" fill="url(#dialogGrad)"/>
            <defs>
              <linearGradient id="dialogGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#06b6d4"/>
                <stop offset="100%" stop-color="#3b82f6"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        
        <p class="dialog-desc">{{ t('chat.notConnected') }}</p>
        <p class="dialog-hint">💡 {{ t('chat.offlineMode') }}</p>
        
        <el-form label-position="top">
          <el-form-item :label="t('sidebar.connectionConfig')">
            <el-input 
              v-model="serverUrl" 
              size="large" 
              placeholder="ws://localhost:1314/ws"
            >
              <template #prefix>
                <el-icon><Link /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          
          <div class="quick-connects">
            <span class="label">{{ t('sidebar.quickSelect') }}</span>
            <el-tag 
              v-for="url in ['ws://localhost:1314/ws']" 
              :key="url"
              @click="serverUrl = url"
              class="url-tag"
            >
              {{ url }}
            </el-tag>
          </div>
        </el-form>
      </div>
      
      <template #footer>
        <el-button @click="showConnectionDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleConnect" :loading="connectionStore.state === 'connecting'">
          {{ connectionStore.state === 'connecting' ? t('sidebar.status.connecting') : t('sidebar.connect') }}
        </el-button>
        <el-button type="success" plain @click="showConnectionDialog = false; handleNewSession()">
          {{ t('chat.offlineMode') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="props.showSetupDialog"
      :title="t('directoryBrowser.title')"
      width="640px"
      :close-on-click-modal="false"
      class="setup-dialog"
      append-to-body
      destroy-on-close
      @update:model-value="(v) => { if (!v) emit('setupCancel') }"
    >
      <DirectoryBrowser
        ref="dirBrowserRef"
        :visible="true"
        :embedded="true"
        v-model:currentSelection="setupSelectedPath"
      />
      <template #footer>
        <div style="display: flex; align-items: center; gap: 12px; justify-content: flex-end;">
          <el-button @click="emit('setupCancel')">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="confirmSetup" :disabled="!setupSelectedPath">
            {{ t('directoryBrowser.title') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <TokenUsageReport v-show="showTokenReport" v-model:visible="showTokenReport" />

    <RuleEditor v-model:visible="showRuleEditor" />

    <EntityTagsDialog v-model:visible="showEntityTags" />

    <!-- About Dialog -->
    <el-dialog
      v-model="showAbout"
      :title="t('sidebar.about.title')"
      width="540px"
      :close-on-click-modal="true"
      class="about-dialog"
      append-to-body
      destroy-on-close
    >
      <div class="about-content">
        <div class="about-logo">
          <img src="/icon.svg" alt="MindX" width="72" height="72" />
        </div>
        <h2 class="about-title">MindX</h2>
        <p class="about-version">v{{ connectionStore.serverVersion || '?.?' }}</p>
        <p class="about-copyright">{{ t('sidebar.about.copyright') }}</p>

        <div class="about-divider"></div>

        <div class="about-release-notes">
          <h3>{{ t('sidebar.about.releaseNotes') }}</h3>
          <div v-if="loadingRelease" class="about-loading">{{ t('sidebar.about.loadingRelease') }}</div>
          <div v-else-if="!currentRelease" class="about-loading">{{ t('sidebar.about.noReleaseNotes') }}</div>
          <div v-else class="release-item">
            <div class="release-header">
              <a
                :href="currentRelease.html_url"
                target="_blank"
                rel="noopener noreferrer"
                class="release-tag"
              >{{ currentRelease.tag_name }}</a>
              <span class="release-date">{{ t('sidebar.about.publishedAt', { date: formatDate(currentRelease.published_at) }) }}</span>
            </div>
            <div
              v-if="currentRelease.body"
              class="release-body"
              v-html="releaseBodyHtml"></div>
          </div>
        </div>

        <!-- 可用更新提示 -->
        <div v-if="updateInfo" class="about-update-available">
          <div class="about-update-divider"></div>
          <div class="about-update-header">
            <span class="about-update-badge">{{ t('sidebar.about.updateAvailable') }}</span>
            <span class="about-update-version">v{{ updateInfo.current_version }} → <strong>v{{ updateInfo.latest_version }}</strong></span>
          </div>
          <div v-if="loadingUpdateRelease" class="about-loading">{{ t('sidebar.about.loadingRelease') }}</div>
          <div v-else-if="updateRelease" class="release-item">
            <div class="release-header">
              <a
                :href="updateRelease.html_url"
                target="_blank"
                rel="noopener noreferrer"
                class="release-tag"
              >{{ updateRelease.tag_name }}</a>
              <span class="release-date">{{ t('sidebar.about.publishedAt', { date: formatDate(updateRelease.published_at) }) }}</span>
            </div>
            <div
              v-if="updateRelease.body"
              class="release-body"
              v-html="md.render(updateRelease.body)"></div>
          </div>
        </div>
      </div>
      <div class="about-footer">
        <template v-if="updateInfo">
          <el-button
            size="small"
            type="primary"
            :loading="applyingUpdate"
            @click="applyUpdate"
          >{{ t('sidebar.about.applyUpdate') }}</el-button>
        </template>
        <template v-else-if="isLatestVersion">
          <span class="about-latest-text">{{ t('sidebar.about.latestVersion') }}</span>
        </template>
        <template v-else>
          <el-button
            size="small"
            :loading="checkingUpdate"
            @click="checkForUpdates"
          >{{ t('sidebar.about.checkUpdate') }}</el-button>
        </template>
        <el-button
          size="small"
          class="about-close-btn"
          @click="showAbout = false"
        >{{ t('sidebar.about.close') }}</el-button>
      </div>
    </el-dialog>

    <AgentSelectorDialog v-model:visible="showAgentSelector" />
    <FileExplorer />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 320px;
  min-width: 320px;
  height: 100vh;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 10;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar.collapsed {
  width: 72px;
  min-width: 72px;
}

.sidebar::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 100%;
  background: linear-gradient(to bottom, transparent, var(--accent-cyan), transparent);
  opacity: 0.3;
}

/* Header */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border-color);
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-text h1 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, var(--text-primary), var(--accent-cyan));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}

.logo-text span {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 700;
  margin-left: 4px;
  padding: 2px 6px;
  background: rgba(6, 182, 212, 0.15);
  border-radius: 4px;
}

/* ===== Agents Section ===== */
.agents-section {
  padding: 16px 12px 8px;
  max-height: 240px;
  overflow-y: auto;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px 10px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-count {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-card);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.agent-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.agent-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-color);
}

.agent-item.active {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.25);
}

.agent-avatar {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: all 0.25s ease;
  font-size: 15px;
}

.agent-avatar.active {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  color: white;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.35);
}

.agent-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.agent-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-role {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-badge {
  font-size: 9px;
  font-weight: 700;
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.15);
  padding: 2px 8px;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.empty-agents {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  gap: 8px;
  opacity: 0.6;
}

.empty-agents p {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

/* Divider */
.divider {
  height: 1px;
  margin: 0 20px;
  background: linear-gradient(to right, transparent, var(--border-color), transparent);
  opacity: 0.5;
}

/* New Chat Button */
.new-chat-btn-wrapper {
  padding: 12px 20px;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.new-chat-btn {
  flex: 1;
  height: 44px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  border: none;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.3px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 20px rgba(6, 182, 212, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.new-chat-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(6, 182, 212, 0.4);
}

.new-chat-btn.btn-collapsed {
  padding: 0;
  width: 44px;
}

.btn-icon {
  font-size: 18px;
}

/* Search */
.search-wrapper {
  padding: 0 20px 12px;
}

.search-input :deep(.el-input__wrapper) {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: none;
  transition: all 0.2s ease;
}

.search-input :deep(.el-input__wrapper:hover),
.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.1);
}

.search-input :deep(.el-input__inner) {
  color: var(--text-primary);
}

.search-input :deep(.el-input__inner::placeholder) {
  color: var(--text-muted);
}

/* Sessions Nav */
.sessions-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 12px;
  flex-wrap: wrap;
  gap: 6px;
}

.nav-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.session-count {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-card);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.session-hint {
  font-size: 9px;
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
  padding: 2px 6px;
  border-radius: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.session-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.session-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-color);
}

.session-item.active {
  background: rgba(6, 182, 212, 0.08);
  border-color: rgba(6, 182, 212, 0.2);
}

.session-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.session-item.active .session-icon {
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  color: white;
  box-shadow: 0 4px 12px rgba(6, 182, 212, 0.25);
}

.session-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.session-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-indicator {
  width: 3px;
  height: 24px;
  background: linear-gradient(to bottom, var(--gradient-start), var(--gradient-end));
  border-radius: 2px;
  position: absolute;
  right: 8px;
  animation: pulse-glow 2s infinite;
}

.session-actions {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.session-item:hover .session-actions {
  opacity: 1;
}
.session-actions button {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.browse-session-btn:hover {
  background: rgba(6, 182, 212, 0.12);
  color: #06b6d4;
}
.delete-session-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(6, 182, 212, 0.5); }
  50% { opacity: 0.7; box-shadow: 0 0 12px rgba(6, 182, 212, 0.7); }
}

/* Empty State */
.empty-sessions {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
  opacity: 0.7;
}

.empty-sessions p {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

/* Footer */
.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
}

.footer-links {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  text-decoration: none;
  transition: all 0.15s ease;
}

.footer-link:hover {
  background: rgba(139, 92, 246, 0.1);
  color: #a78bfa;
}

.footer-link-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* ===== Agents Section ===== */
.dir-action-btn:hover {
  background: rgba(6, 182, 212, 0.1);
  border-color: rgba(6, 182, 212, 0.4);
  color: var(--accent-cyan);
}

.dir-action-btn .el-icon {
  font-size: 14px;
}

.project-dir-path {
  color: var(--accent-cyan);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  background: rgba(6, 182, 212, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  flex: 1;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  margin: 0 16px;
  margin-top: 12px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  color: white;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.avatar.connected {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.avatar.offline {
  background: linear-gradient(135deg, #64748b, #475569);
  box-shadow: 0 4px 12px rgba(71, 85, 105, 0.2);
}

.user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.user-status {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
}

.status-dot.online {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.user-rating {
  display: flex;
  gap: 1px;
  margin-top: 2px;
}
.user-rating .star {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.25);
}
.user-rating .star.filled {
  color: #f59e0b;
}

.settings-btn {
  color: var(--text-muted);
}

.settings-btn:hover {
  color: var(--accent-cyan);
}

.agent-select-btn {
  color: var(--text-muted);
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}
.agent-select-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
}

.settings-panel h4 {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-row-lang {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.setting-row-lang .lang-switcher {
  width: 100%;
  flex-shrink: initial;
}

.setting-row-info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.setting-row-icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--accent-cyan);
  margin-top: 1px;
}

.setting-row-text {
  flex: 1;
  min-width: 0;
}

.setting-row-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.setting-row-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-top: 2px;
}

.setting-row .el-button {
  flex-shrink: 0;
}

.cache-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.stat-value {
  font-size: 9px;
  font-weight: 700;
  color: var(--accent-cyan);
  font-family: 'JetBrains Mono', monospace;
}

.stat-label {
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.lang-switcher {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

.lang-btn {
  flex: 1;
  padding: 7px 0;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(55, 65, 81, 0.6);
  background: rgba(15, 23, 42, 0.8);
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.lang-btn:first-child {
  border-radius: 8px 0 0 8px;
}

.lang-btn:last-child {
  border-radius: 0 8px 8px 0;
}

.lang-btn:not(:last-child) {
  border-right: none;
}

.lang-btn:hover {
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.08);
}

.lang-btn.active {
  background: linear-gradient(135deg, #06b6d4, #3b82f6);
  border-color: transparent;
  color: white;
  box-shadow: 0 2px 8px rgba(6, 182, 212, 0.3);
}

/* Dialog */
.dialog-content {
  text-align: center;
}

.dialog-icon {
  margin-bottom: 16px;
}

.dialog-desc {
  color: var(--text-secondary);
  margin-bottom: 8px;
  font-size: 14px;
}

.dialog-hint {
  color: #10b981;
  font-size: 12px;
  margin-bottom: 20px;
  background: rgba(16, 185, 129, 0.08);
  padding: 8px 12px;
  border-radius: 8px;
}

.quick-connects {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.quick-connects .label {
  font-size: 12px;
  color: var(--text-muted);
}

.url-tag {
  cursor: pointer;
  transition: all 0.2s ease;
}

.url-tag:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

/* About Dialog */
.about-dialog :deep(.el-dialog) {
  background: #111827;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.about-dialog :deep(.el-dialog__header) {
  padding: 20px 24px 12px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

.about-dialog :deep(.el-dialog__title) {
  color: #e2e8f0;
  font-size: 16px;
  font-weight: 700;
}

.about-dialog :deep(.el-dialog__headerbtn .el-dialog__close) {
  color: #94a3b8;
  font-size: 18px;
}

.about-dialog :deep(.el-dialog__headerbtn:hover .el-dialog__close) {
  color: #f87171;
}

.about-dialog :deep(.el-dialog__body) {
  padding: 24px;
  color: #cbd5e1;
  max-height: 70vh;
  overflow-y: auto;
}

.about-content {
  text-align: center;
}

.about-logo {
  margin-bottom: 12px;
}

.about-logo img {
  border-radius: 16px;
}

.about-title {
  font-size: 22px;
  font-weight: 800;
  color: #e2e8f0;
  margin: 0 0 4px;
  background: linear-gradient(135deg, #e2e8f0, #06b6d4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.about-version {
  font-size: 13px;
  color: #94a3b8;
  margin: 0 0 8px;
  font-family: 'JetBrains Mono', monospace;
}

.about-copyright {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

.about-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(55, 65, 81, 0.8), transparent);
  margin: 20px 0;
}

.about-release-notes {
  text-align: left;
}

.about-release-notes h3 {
  font-size: 14px;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0 0 12px;
}

.about-loading {
  text-align: center;
  color: #64748b;
  font-size: 13px;
  padding: 20px 0;
}

.about-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(55, 65, 81, 0.5);
}

.about-close-btn {
  color: #fff !important;
}

.about-dialog :deep(.el-button--primary) {
  color: #fff !important;
}

.about-latest-text {
  font-size: 12px;
  color: #10b981;
  font-weight: 600;
}

/* ── 可用更新 ── */
.about-update-available {
  text-align: left;
  margin-top: 4px;
}
.about-update-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(6, 182, 212, 0.4), transparent);
  margin: 12px 0;
}
.about-update-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.about-update-badge {
  font-size: 11px;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  padding: 3px 10px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.about-update-version {
  font-size: 13px;
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
}
.about-update-version strong {
  color: #06b6d4;
}

.release-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.release-item {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 10px;
  padding: 14px;
}

.release-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 8px;
}

.release-tag {
  font-size: 13px;
  font-weight: 700;
  color: #06b6d4;
  text-decoration: none;
  font-family: 'JetBrains Mono', monospace;
}

.release-tag:hover {
  color: #22d3ee;
  text-decoration: underline;
}

.release-date {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}

.release-body {
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.7;
  max-height: 200px;
  overflow-y: auto;
}

.release-body :deep(h1),
.release-body :deep(h2),
.release-body :deep(h3),
.release-body :deep(h4) {
  font-size: 14px;
  font-weight: 700;
  color: #e2e8f0;
  margin: 12px 0 6px;
}

.release-body :deep(p) {
  margin: 6px 0;
}

.release-body :deep(ul),
.release-body :deep(ol) {
  padding-left: 20px;
  margin: 6px 0;
}

.release-body :deep(li) {
  margin: 2px 0;
}

.release-body :deep(a) {
  color: #06b6d4;
  text-decoration: none;
}

.release-body :deep(a:hover) {
  color: #22d3ee;
  text-decoration: underline;
}

.release-body :deep(code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  background: rgba(15, 23, 42, 0.8);
  padding: 2px 6px;
  border-radius: 4px;
  color: #e2e8f0;
}

.release-body :deep(pre) {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}

.release-body :deep(pre code) {
  background: none;
  padding: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.connection-dialog :deep(.el-overlay) {
  background: rgba(0, 0, 0, 0.6);
}

.connection-dialog :deep(.el-dialog) {
  background: #111827;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.connection-dialog :deep(.el-dialog__header) {
  padding: 20px 24px 12px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

.connection-dialog :deep(.el-dialog__title) {
  color: #e2e8f0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.connection-dialog :deep(.el-dialog__headerbtn .el-dialog__close) {
  color: #94a3b8;
  font-size: 18px;
}

.connection-dialog :deep(.el-dialog__headerbtn:hover .el-dialog__close) {
  color: #f87171;
}

.connection-dialog :deep(.el-dialog__body) {
  padding: 24px;
  color: #cbd5e1;
}

.connection-dialog :deep(.el-dialog__footer) {
  padding: 14px 24px 20px;
  border-top: 1px solid rgba(55, 65, 81, 0.5);
  background: rgba(15, 23, 42, 0.6);
  border-radius: 0 0 16px 16px;
}

.connection-dialog :deep(.dialog-desc) {
  color: #94a3b8;
}

.connection-dialog :deep(.dialog-hint) {
  color: #6ee7b7;
}

.connection-dialog :deep(.el-form-item__label) {
  color: #94a3b8;
  font-size: 13px;
  font-weight: 600;
}

.connection-dialog :deep(.el-input__wrapper) {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(55, 65, 81, 0.6);
  box-shadow: none;
}

.connection-dialog :deep(.el-input__wrapper:hover),
.connection-dialog :deep(.el-input__wrapper.is-focus) {
  border-color: rgba(6, 182, 212, 0.5);
}

.connection-dialog :deep(.el-input__inner) {
  color: #e2e8f0;
}

.connection-dialog :deep(.el-input__inner::placeholder) {
  color: #64748b;
}

.connection-dialog :deep(.quick-connects .label) {
  color: #64748b;
}
</style>

<!-- 全局样式：穿透 el-dialog Teleport -->
<style>
.about-dialog .el-button--primary {
  color: #fff !important;
}
</style>

<style>
.el-popover:has(.settings-panel) {
  background: #111827 !important;
  border: 1px solid rgba(55, 65, 81, 0.8) !important;
  border-radius: 14px !important;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45) !important;
}

.settings-panel h4 {
  color: #e2e8f0 !important;
}

.settings-panel .setting-row {
  border-bottom-color: rgba(55, 65, 81, 0.5) !important;
}

.settings-panel .setting-row:last-child {
  border-bottom: none !important;
}

.settings-panel .setting-row-desc {
  color: #94a3b8 !important;
}

.settings-panel .stat-item .stat-value {
  color: #22d3ee !important;
}

.settings-panel .stat-item .stat-label {
  color: #64748b !important;
}

.settings-panel .el-input__wrapper {
  background: rgba(15, 23, 42, 0.8) !important;
  border: 1px solid rgba(55, 65, 81, 0.6) !important;
  box-shadow: none !important;
}

.settings-panel .el-input__inner {
  color: #e2e8f0 !important;
  font-size: 13px !important;
}

.settings-panel .el-input__inner::placeholder {
  color: #64748b !important;
}
</style>
