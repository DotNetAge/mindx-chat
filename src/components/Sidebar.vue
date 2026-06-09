<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Search, UserFilled, Monitor, ChatDotRound, FolderOpened, Folder } from '@element-plus/icons-vue'
import { useSessionStore } from '../stores/sessionStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useChatStore } from '../stores/chatStore'
import { createMindXClient, getMindXClient } from '../services/websocket'
import type { ServerSessionInfo } from '../types/websocket'
import DirectoryBrowser from './DirectoryBrowser.vue'
import TokenUsageFooter from './TokenUsageFooter.vue'
import TokenUsageReport from './TokenUsageReport.vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const currentLocale = ref(locale.value)

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

const connectionStatus = computed(() => {
  const state = connectionStore.state
  const statusMap: Record<string, { label: string; color: string }> = {
    disconnected: { label: t('sidebar.status.disconnected'), color: '#94a3b8' },
    connecting: { label: t('sidebar.status.connecting'), color: '#f59e0b' },
    connected: { label: t('sidebar.status.connected'), color: '#10b981' },
    reconnecting: { label: t('sidebar.status.reconnecting'), color: '#f59e0b' },
    error: { label: t('sidebar.status.error'), color: '#ef4444' }
  }
  return statusMap[state] || statusMap.disconnected
})

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
      subtitle: shortenPath(s.project_dir || ''),
      subtitleFull: s.project_dir || '',
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
  
  if (diffMins < 1) return t('sidebar.timeAgo.justNow')
  if (diffMins < 60) return t('sidebar.timeAgo.minutesAgo', { n: diffMins })
  if (diffMins < 1440) return t('sidebar.timeAgo.hoursAgo', { n: Math.floor(diffMins / 60) })
  return t('sidebar.timeAgo.daysAgo', { n: Math.floor(diffMins / 1440) })
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
      sessionStore.setActiveSession(serverSessions[0].session_id)
    }
  } catch (err) {
    console.error('Failed to load sessions:', err)
  }
}

async function selectSession(sessionId: string) {
  sessionStore.setActiveSession(sessionId)
  connectionStore.setLastSession(sessionId)

  // 恢复当前 session 的 token 用量统计
  chatStore.loadSessionTokenStats(sessionId)

  try {
    const detail = await connectionStore.fetchSessionDetail(sessionId)
    if (detail?.messages && detail.messages.length > 0) {
      chatStore.restoreSessionMessages(sessionId, detail.messages)
    }
  } catch (err) {
    console.error('Failed to load session messages:', err)
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

function handleNewSession() {
  if (connectionStore.isConnected && connectionStore.currentAgent) {
    setupSelectedPath.value = ''
    emit('toggleSetupDialog')
  }
}

function confirmSetup() {
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
        connectionStore.fetchUserConfig()
      ])

      // 1. 先保存用户偏好设定（在 setAgents 之前，确保 watcher 触发时已就绪）
      if (userConfig.last_agent || userConfig.last_session_id) {
        console.log(`[MindX] 📋 User preferences from config:`, {
          last_agent: userConfig.last_agent,
          last_session_id: userConfig.last_session_id
        })
        userPreferences.value = {
          lastAgent: userConfig.last_agent || '',
          lastSessionId: userConfig.last_session_id || ''
        }
      }

      // 2. 填充 agents / models 到 store（这会触发 agentsList computed 更新）
      connectionStore.setAgents(agents.map(a => ({
        name: a.name,
        role: a.role || '',
        description: a.description,
        model: a.model,
        skills: a.skills,
        introduction: a.introduction
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
          connectionStore.setCurrentAgent(hasAgent.name)
          connectionStore.setLastAgent(hasAgent.name)

          // 4. 加载 sessions 并自动选择会话（await 确保完成后再继续）
          await loadSessionsForAgent(hasAgent.name)
        }
      }

      console.log(`[MindX] ✅ Loaded ${agents.length} agents and ${models.length} models`)
    } catch (err) {
      console.error('Failed to load initial data:', err)
      connectionStore.setServerError(`${t('common.error')}: ${err}`)
    }
  }
})
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: isCollapsed }">
    <!-- Header -->
    <div class="sidebar-header">
      <div class="logo-section">
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

          <!-- Connection Settings -->
          <div class="setting-section">
            <h5>{{ t('sidebar.connectionConfig') }}</h5>
            <div class="setting-item">
              <label>{{ t('sidebar.connectionConfig') }}</label>
              <el-input
                v-model="serverUrl"
                size="small"
                placeholder="ws://localhost:1314/ws"
              />
            </div>

            <div class="setting-actions">
              <el-button
                v-if="!connectionStore.isConnected"
                type="primary"
                size="small"
                @click="handleConnect"
                :loading="connectionStore.state === 'connecting'"
              >
                {{ connectionStore.state === 'connecting' ? t('sidebar.status.connecting') : t('sidebar.connect') }}
              </el-button>

              <el-button
                v-else
                size="small"
                @click="handleDisconnect"
              >
                {{ t('sidebar.disconnect') }}
              </el-button>
            </div>
          </div>

          <!-- Language Switcher -->
          <div class="setting-section">
            <h5>语言</h5>
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
        </div>
      </el-popover>
    </div>

    <!-- Connection Status -->
    <div class="connection-status" :class="connectionStore.state">
      <div class="status-indicator" :style="{ background: connectionStatus.color }"></div>
      <transition name="fade">
        <span v-if="!isCollapsed" class="status-label">{{ connectionStatus.label }}</span>
      </transition>
      
      <template v-if="!isCollapsed">
        <button 
          v-if="!connectionStore.isConnected"
          class="connect-btn"
          @click="showConnectionDialog = true"
        >
          <el-icon><Link /></el-icon>
          {{ t('sidebar.connect') }}
        </button>
        
        <button 
          v-else
          class="disconnect-btn"
          @click="handleDisconnect"
        >
          <el-icon><SwitchButton /></el-icon>
        </button>
      </template>
    </div>

    <!-- ===== 上段：Agent 列表 ===== -->
    <section class="agents-section">
      <div class="section-header" v-show="!isCollapsed">
        <span class="section-title">
          <el-icon><Monitor /></el-icon>
          Agents
        </span>
        <span class="section-count" v-if="agentsList.length > 0">{{ agentsList.length }}</span>
      </div>

      <ul class="agent-list" v-if="agentsList.length > 0">
        <li
          v-for="agent in agentsList"
          :key="agent.name"
          class="agent-item"
          :class="{ active: agent.isActive }"
          @click="selectAgent(agent.name)"
        >
          <div class="agent-avatar" :class="{ active: agent.isActive }">
            <el-icon v-if="agent.isActive"><UserFilled /></el-icon>
            <el-icon v-else><Monitor /></el-icon>
          </div>
          
          <transition name="fade">
            <div v-if="!isCollapsed" class="agent-info">
              <h4 class="agent-name">{{ agent.name }}</h4>
              <p class="agent-role">{{ agent.role }} · {{ agent.model }}</p>
            </div>
          </transition>

          <transition name="fade">
            <span v-if="!isCollapsed && agent.isActive" class="active-badge">{{ t('common.current') }}</span>
          </transition>
        </li>
      </ul>

      <div v-else class="empty-agents">
        <el-icon :size="24" color="#64748b"><Monitor /></el-icon>
        <p>{{ connectionStore.isConnected ? t('chat.noAgent') : t('sidebar.connect') + ' Agents' }}</p>
      </div>
    </section>

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
              <p class="session-subtitle" :title="session.subtitleFull || session.subtitle">{{ session.subtitle }}</p>
            </div>
          </transition>
          
          <transition name="fade">
            <span v-if="!isCollapsed && session.isActive" class="active-indicator"></span>
          </transition>

          <button 
            v-if="!isCollapsed" 
            class="delete-session-btn"
            @click="handleDeleteSession(session.id, $event)"
            :title="t('sidebar.deleteConfirmTitle')"
          >
            <el-icon><Close /></el-icon>
          </button>
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
      <div class="project-dir-info" v-if="connectionStore.currentProjectDir">
        <el-icon><FolderOpened /></el-icon>
        <span class="project-dir-label">{{ t('sidebar.localCache') }}</span>
        <code class="project-dir-path">{{ connectionStore.currentProjectDir }}</code>
        <button
          class="open-browser-btn"
          @click="emit('toggle-file-browser')"
          :title="t('common.search')"
        >
          <el-icon><FolderOpened /></el-icon>
        </button>
      </div>

      <div class="user-profile">
        <div class="avatar" :class="{ connected: connectionStore.isConnected, offline: !connectionStore.isConnected }">
          <span v-if="connectionStore.isConnected">✓</span>
          <span v-else>📴</span>
        </div>
        
        <div class="user-info">
          <span class="user-name">
            {{ connectionStore.currentAgent?.name || connectionStore.primaryAgent?.name || 'MindX User' }}
          </span>
          <span class="user-status">
            <span class="status-dot" :class="{ online: connectionStore.isConnected }"></span>
            {{ connectionStore.statusLabel }}
            <template v-if="connectionStore.currentModel">
              · {{ connectionStore.currentModel.name }}
            </template>
          </span>
        </div>
      </div>

    <!-- Token Usage Footer (inside sidebar-footer, always visible when expanded) -->
    <TokenUsageFooter v-show="!isCollapsed" @click="showTokenReport = true" style="cursor: pointer;" />
    </div>

    <!-- Connection Dialog -->
    <el-dialog
      v-model="showConnectionDialog"
      :title="t('sidebar.connect') + ' MindX Daemon'"
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
            <span class="label">快速选择:</span>
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
      :title="t('chat.selectWorkspace')"
      width="640px"
      :close-on-click-modal="false"
      class="setup-dialog"
      append-to-body
      destroy-on-close
      @update:model-value="(v) => { if (!v) emit('setupCancel') }"
    >
      <div class="setup-info" style="padding: 0 0 12px 0;">
        <p>Agent: <strong>{{ props.setupAgentName }}</strong></p>
        <p class="setup-hint">{{ t('chat.selectWorkspace') }}</p>
      </div>
      <DirectoryBrowser
        :visible="true"
        :embedded="true"
        v-model:currentSelection="setupSelectedPath"
      />
      <template #footer>
        <div style="display: flex; align-items: center; gap: 12px; justify-content: space-between;">
          <div style="font-size: 12px; color: var(--text-secondary);">
            {{ t('common.current') }}: <code style="color: var(--accent-cyan); font-family: 'JetBrains Mono', monospace;">{{ displaySelectedPath || '(' + t('common.none') + ')' }}</code>
          </div>
          <div style="display: flex; gap: 8px;">
            <el-button @click="emit('setupCancel')">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" @click="confirmSetup" :disabled="!setupSelectedPath">
              {{ t('common.create') }} {{ t('sidebar.sessionList') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <TokenUsageReport v-show="showTokenReport" v-model:visible="showTokenReport" />
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

/* Connection Status */
.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  margin: 0 16px;
  margin-top: 12px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

.connection-status.connected {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.05);
}

.connection-status.disconnected {
  border-color: rgba(148, 163, 184, 0.25);
  background: rgba(148, 163, 184, 0.05);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.connection-status.connected .status-indicator {
  animation: pulse-green 2s infinite;
}

@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
}

.status-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex: 1;
}

.connect-btn,
.disconnect-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.connect-btn {
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  color: white;
}

.connect-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 10px rgba(6, 182, 212, 0.3);
}

.disconnect-btn {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.disconnect-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
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

.delete-session-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0;
}

.session-item:hover .delete-session-btn {
  opacity: 1;
  color: var(--text-muted);
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

.project-dir-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: rgba(6, 182, 212, 0.06);
  border: 1px solid rgba(6, 182, 212, 0.15);
  border-radius: 8px;
  font-size: 12px;
}

.project-dir-info .el-icon {
  color: var(--accent-cyan);
  font-size: 14px;
  flex-shrink: 0;
}

.project-dir-label {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
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

.open-browser-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(6, 182, 212, 0.2);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.open-browser-btn:hover {
  background: rgba(6, 182, 212, 0.1);
  border-color: rgba(6, 182, 212, 0.4);
  color: var(--accent-cyan);
}

.open-browser-btn .el-icon {
  font-size: 14px;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 12px;
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

.settings-btn {
  color: var(--text-muted);
}

.settings-btn:hover {
  color: var(--accent-cyan);
}

.settings-panel h4 {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.setting-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.setting-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.setting-section.danger {
  border-color: rgba(239, 68, 68, 0.2);
}

.setting-section h5 {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.setting-item {
  margin-bottom: 12px;
}

.setting-item label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.setting-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
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
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-cyan);
  font-family: 'JetBrains Mono', monospace;
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.lang-switcher {
  display: flex;
  gap: 0;
  width: 100%;
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

.settings-panel .setting-section h5 {
  color: #94a3b8 !important;
}

.settings-panel .setting-section {
  border-bottom-color: rgba(55, 65, 81, 0.5) !important;
}

.settings-panel .setting-item label {
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
