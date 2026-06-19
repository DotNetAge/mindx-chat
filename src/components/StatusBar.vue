<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConnectionStore } from '../stores/connectionStore'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useFileExplorerStore } from '../stores/fileExplorerStore'
import { useGraphStore } from '../stores/graphStore'
import { getMindXClient } from '../services/websocket'
import { FolderOpened, Plus, Document } from '@element-plus/icons-vue'
import LogDrawer from './LogDrawer.vue'

const { t } = useI18n()
const connectionStore = useConnectionStore()
const chatStore = useChatStore()
const sessionStore = useSessionStore()
const fileExplorerStore = useFileExplorerStore()
const graphStore = useGraphStore()

const logDrawerRef = ref<InstanceType<typeof LogDrawer> | null>(null)
function openLogDrawer() { logDrawerRef.value?.open() }

const statusColor = computed(() => connectionStore.statusColor)
const statusLabel = computed(() => connectionStore.statusLabel)
const version = computed(() => connectionStore.serverVersion ? `v${connectionStore.serverVersion}` : '')

const filewatchAvailable = computed(() => graphStore.filewatchStatus?.available ?? false)
const filewatchRunning = computed(() => graphStore.filewatchStatus?.running ?? false)
const autoIndexColor = computed(() => {
  if (!filewatchAvailable.value) return '#64748b'
  return filewatchRunning.value ? '#10b981' : '#64748b'
})
const autoIndexLabel = computed(() => {
  if (!filewatchAvailable.value) return t('sidebar.autoIndex.notAvailable')
  return filewatchRunning.value ? t('sidebar.autoIndex.enabled') : t('sidebar.autoIndex.disabled')
})
const autoIndexTitle = computed(() => {
  if (!filewatchAvailable.value) return t('sidebar.autoIndex.notAvailable')
  return filewatchRunning.value ? t('sidebar.autoIndex.running') : t('sidebar.autoIndex.stopped')
})

const toggling = ref(false)

async function handleToggleAutoIndex() {
  if (!filewatchAvailable.value || toggling.value) return

  toggling.value = true
  try {
    if (filewatchRunning.value) {
      await graphStore.stopFilewatch()
      // Refresh status to confirm
      await graphStore.refreshFilewatchStatus()
      if (!graphStore.filewatchStatus?.running) {
        ElMessage.success(t('sidebar.autoIndex.stopped'))
      } else {
        ElMessage.warning(t('sidebar.autoIndex.stopFailed'))
      }
      return
    }

    // ── Prerequisites for starting auto-index ──
    await graphStore.refreshFilewatchStatus()

    const watched = graphStore.filewatchStatus?.watched || []
    const hasWatchedDirs = watched.length > 0

    const client = getMindXClient()
    let hasTags = false
    if (client) {
      try {
        const res = await client.call<{ types: any[] }>('entity_tags.get', {})
        hasTags = (res?.types?.length ?? 0) > 0
      } catch {
        // RPC failed — treat as no tags
      }
    }

    // Build requirements status
    const requirements = [
      { label: t('sidebar.autoIndex.requirementWatchedDirs'), ok: hasWatchedDirs },
      { label: t('sidebar.autoIndex.requirementEntityTags'), ok: hasTags },
    ]
    const allMet = requirements.every(r => r.ok)

    if (!allMet) {
      const msg = t('sidebar.autoIndex.startFailedDesc') + '<br><br>' +
        requirements.map(r =>
          `<span style="color:${r.ok ? '#10b981' : '#ef4444'}">${r.ok ? '✓' : '✗'}</span> ${r.label}`
        ).join('<br>')
      await ElMessageBox.alert(msg, t('sidebar.autoIndex.startFailed'), {
        confirmButtonText: t('common.confirm'),
        type: 'warning',
        dangerouslyUseHTMLString: true
      })
      return
    }

    // All checks passed — start auto-indexing
    await graphStore.startFilewatch()
    // Refresh status to confirm — retry a few times to handle startup race
    let running = false
    for (let i = 0; i < 10; i++) {
      await graphStore.refreshFilewatchStatus()
      if (graphStore.filewatchStatus?.running) {
        running = true
        break
      }
      await new Promise(r => setTimeout(r, 100))
    }
    if (running) {
      ElMessage.success(t('sidebar.autoIndex.started'))
    } else {
      ElMessage.warning(t('sidebar.autoIndex.startFailedUnknown'))
    }
  } finally {
    toggling.value = false
  }
}

onMounted(() => {
  if (connectionStore.isConnected) {
    graphStore.refreshFilewatchStatus()
  }
})

watch(() => connectionStore.isConnected, async (connected) => {
  if (connected) {
    await graphStore.refreshFilewatchStatus()
  } else {
    graphStore.$patch({ filewatchStatus: null })
  }
})

// GraphViewer 关闭时会清空 filewatchStatus，需要重新刷新
watch(() => graphStore.visible, (visible) => {
  if (!visible && connectionStore.isConnected) {
    graphStore.refreshFilewatchStatus()
  }
})

const activeProjectDir = computed(() => {
  const active = sessionStore.sessions.find(s => s.session_id === sessionStore.activeSessionId)
  return active?.project_dir || ''
})

const updateLabel = computed(() => {
  if (connectionStore.updateState === 'downloading') return t('sidebar.update.downloading')
  if (connectionStore.updateState === 'restart_needed') return t('sidebar.update.restartNeeded')
  return ''
})

const indexingState = computed(() => connectionStore.indexingState)

const formatNumber = (num: number): string => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

const formatCost = (cost: number): string => {
  if (cost < 0.01) return '¥0.00'
  return '¥' + cost.toFixed(2)
}

const sessionTokens = computed(() => formatNumber(chatStore.sessionTokensUsed))
const sessionCost = computed(() => formatCost(chatStore.sessionCost))
const totalTokens = computed(() => formatNumber(chatStore.totalTokensUsed))
const totalCost = computed(() => formatCost(chatStore.totalCost))
const totalConversations = computed(() => chatStore.totalConversations)

function handleOpenConnection() {
  connectionStore.showConnectionDialog = true
}

function handleDisconnect() {
  connectionStore.disconnect()
}

function handleOpenTokenReport() {
  connectionStore.showTokenReport = true
}

function handleOpenProjectDir() {
  if (activeProjectDir.value) {
    fileExplorerStore.open(activeProjectDir.value)
  }
}

function handleToggleFileBrowser() {
  connectionStore.showFileBrowser = !connectionStore.showFileBrowser
}

function handleOpenAbout() {
  connectionStore.pendingShowAbout = true
}
</script>

<template>
  <footer class="status-bar">
    <div class="status-left">
      <span class="status-dot" :style="{ background: statusColor }"></span>
      <span class="status-text">{{ statusLabel }}</span>
      <button
        v-if="!connectionStore.isConnected"
        class="action-btn connect-btn"
        @click="handleOpenConnection"
        :title="t('sidebar.connect')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
        </svg>
      </button>
      <button
        v-else
        class="action-btn disconnect-btn"
        @click="handleDisconnect"
        :title="t('sidebar.disconnect')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>

      <!-- Auto Index Status -->
      <button
        class="auto-index-indicator"
        v-if="filewatchAvailable"
        :title="autoIndexTitle"
        @click="handleToggleAutoIndex"
        :disabled="toggling"
      >
        <span class="auto-index-dot" :class="{ running: filewatchRunning }"></span>
        <span class="auto-index-label">{{ autoIndexLabel }}</span>
      </button>

      <!-- Project Directory / Indexing Status -->
      <div class="project-dir-section" v-if="activeProjectDir && !indexingState.active">
        <button
          class="action-btn dir-btn"
          @click="handleOpenProjectDir"
          :title="t('sidebar.browseFiles')"
        >
          <el-icon :size="13"><FolderOpened /></el-icon>
        </button>
        <span class="dir-path" :title="activeProjectDir">{{ activeProjectDir }}</span>
        <button
          class="action-btn add-btn"
          @click="handleToggleFileBrowser"
          :title="t('sidebar.addToChat')"
        >
          <el-icon :size="13"><Plus /></el-icon>
        </button>
      </div>
      <div class="indexing-status" v-if="indexingState.active">
        <svg v-if="indexingState.message.startsWith(t('sidebar.indexing.inProgress').substring(0,4))" class="indexing-spinner" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36"/>
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span class="indexing-text">{{ indexingState.message }}</span>
      </div>
    </div>

    <div class="status-center">
      <button class="stat-block" @click="handleOpenTokenReport" :title="t('tokenUsage.viewDetails')">
        <span class="stat-label">{{ t('tokenUsage.footerSessions') }}</span>
        <span class="stat-value session">{{ sessionTokens }}</span>
        <span class="stat-sep">·</span>
        <span class="stat-value cost session">{{ sessionCost }}</span>
        <span class="stat-divider"></span>
        <span class="stat-label">{{ t('tokenUsage.footerTotal') }}</span>
        <span class="stat-value total">{{ totalTokens }}</span>
        <span class="stat-sep">·</span>
        <span class="stat-value cost total">{{ totalCost }}</span>
        <span class="stat-divider"></span>
        <span class="stat-value conversations">{{ totalConversations }}</span>
      </button>
    </div>

    <div class="status-right">
      <button
        class="action-btn log-btn"
        @click="openLogDrawer"
        :title="t('chat.logTab')"
      >
        <el-icon :size="13"><Document /></el-icon>
      </button>
      <template v-if="connectionStore.updateState">
        <span class="update-indicator" :class="{ downloading: connectionStore.updateState === 'downloading' }">
          <svg class="update-spinner" v-if="connectionStore.updateState === 'downloading'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36"/>
          </svg>
          <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36"/>
          </svg>
          <span class="update-label">{{ updateLabel }}</span>
        </span>
      </template>
      <button
        class="version-btn"
        v-if="version"
        @click="handleOpenAbout"
        :title="t('sidebar.about.title')"
      >{{ version }}</button>
    </div>
  </footer>
  <LogDrawer ref="logDrawerRef" />
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  min-height: 28px;
  padding: 0 12px;
  background: var(--bg-tertiary, rgba(15, 23, 42, 0.95));
  border-top: 1px solid var(--border-color, rgba(55, 65, 81, 0.5));
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  flex-shrink: 0;
  z-index: 10;
  gap: 8px;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 45%;
  flex-shrink: 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-text {
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Auto index status */
.auto-index-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  transition: all 0.15s ease;
}

.auto-index-indicator:hover {
  background: rgba(55, 65, 81, 0.3);
  border-color: rgba(55, 65, 81, 0.5);
}

.auto-index-indicator:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auto-index-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-muted, #64748b);
  transition: background 0.3s;
}

.auto-index-dot.running {
  background: #10b981;
  box-shadow: 0 0 5px rgba(16, 185, 129, 0.5);
}

.auto-index-label {
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--text-muted, #94a3b8);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  transition: all 0.15s ease;
  padding: 0;
  flex-shrink: 0;
}

.connect-btn:hover {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.disconnect-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.log-btn:hover {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

/* Project directory */
.project-dir-section {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  padding-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  max-width: 100%;
}

.dir-btn:hover {
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
}

.add-btn:hover {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}

.dir-path {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--text-muted, #94a3b8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* Center: token stats */
.status-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 0 4px;
}

.stat-block {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  transition: background 0.15s ease;
  font-size: 10px;
  white-space: nowrap;
}

.stat-block:hover {
  background: rgba(139, 92, 246, 0.1);
}

.stat-label {
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.stat-value {
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}

.stat-value.session {
  color: #a78bfa;
}

.stat-value.total {
  color: #22d3ee;
}

.stat-value.cost.session {
  color: #c4b5fd;
}

.stat-value.cost.total {
  color: #6ee7b7;
}

.stat-value.conversations {
  color: #94a3b8;
}

.stat-sep {
  opacity: 0.3;
}

.stat-divider {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 3px;
}

/* Right */
.status-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.version-btn {
  display: inline-flex;
  align-items: center;
  padding: 0 4px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--text-muted, #94a3b8);
  opacity: 0.6;
  transition: all 0.15s ease;
  line-height: 20px;
}

.version-btn:hover {
  opacity: 1;
  color: #a78bfa;
  background: rgba(139, 92, 246, 0.1);
}

.update-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.update-indicator.downloading {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.update-indicator:not(.downloading) {
  color: #22d3ee;
  background: rgba(6, 182, 212, 0.1);
}

.update-spinner {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.update-label {
  white-space: nowrap;
}
</style>
