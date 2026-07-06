<script setup lang="ts">
import { computed, watch, ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElTooltip, ElBadge } from 'element-plus'
import { useConnectionStore } from '../stores/connectionStore'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useFileExplorerStore } from '../stores/fileExplorerStore'

import { FolderOpened, Document, Loading, Monitor } from '@element-plus/icons-vue'
import LogDrawer from './LogDrawer.vue'
import IndexDetailsDialog from './IndexDetailsDialog.vue'
import EntityTagsDialog from './EntityTagsDialog.vue'
import TerminalDrawer from './TerminalDrawer.vue'
import { getMindXClient } from '../services/websocket'

const { t } = useI18n()
const connectionStore = useConnectionStore()
const chatStore = useChatStore()
const sessionStore = useSessionStore()
const fileExplorerStore = useFileExplorerStore()
const logDrawerRef = ref<InstanceType<typeof LogDrawer> | null>(null)
function openLogDrawer() {
  logErrorCount.value = 0
  logDrawerRef.value?.open()
}

// ── Log error/warning badge ──
const logErrorCount = ref(0)
let logPollTimer: ReturnType<typeof setInterval> | null = null

async function pollLogCounts() {
  if (!connectionStore.isConnected) return
  try {
    const res = await connectionStore.fetchLogCounts()
    const errorLines = res?.counts?.error?.lines || 0
    logErrorCount.value = errorLines
  } catch {
    // silently ignore
  }
}

watch(() => connectionStore.isConnected, (connected) => {
  if (connected) {
    pollLogCounts()
    if (!logPollTimer) {
      logPollTimer = setInterval(pollLogCounts, 10000)
    }
  } else {
    logErrorCount.value = 0
    if (logPollTimer) {
      clearInterval(logPollTimer)
      logPollTimer = null
    }
  }
})
onUnmounted(() => { if (logPollTimer) { clearInterval(logPollTimer); logPollTimer = null } })

const showTerminalDrawer = computed({
  get: () => connectionStore.showTerminalDrawer,
  set: (val: boolean) => { connectionStore.showTerminalDrawer = val }
})

const statusColor = computed(() => connectionStore.statusColor)
const statusLabel = computed(() => connectionStore.statusLabel)
const version = computed(() => connectionStore.serverVersion ? `v${connectionStore.serverVersion}` : '')

const activeProjectDir = computed(() => {
  return sessionStore.activeSession?.project_dir || ''
})

const updateLabel = computed(() => {
  if (connectionStore.updateState === 'downloading') return t('sidebar.update.downloading')
  if (connectionStore.updateState === 'restart_needed') return t('sidebar.update.restartNeeded')
  return ''
})

const indexingState = computed(() => connectionStore.indexingState)
const showIndexDialog = ref(false)
const showEntityTagDialog = ref(false)

async function handleOpenKB() {
  // Check if entity tags are configured
  try {
    const client = getMindXClient()
    if (!client) {
      showIndexDialog.value = true
      return
    }
    const result = await client.call<{ types: any[] }>('entity_tags.get', {})
    if (result?.types && result.types.length > 0) {
      showIndexDialog.value = true
    } else {
      showEntityTagDialog.value = true
    }
  } catch {
    showIndexDialog.value = true
  }
}

// ── Manifest data for progress bar ──
const manifestData = ref<any>(null)
const manifestLoading = ref(false)

async function fetchManifest() {
  const projectDir = activeProjectDir.value
  if (!projectDir) return
  manifestLoading.value = true
  try {
    manifestData.value = await connectionStore.getIndexQueue(projectDir)
  } catch (err: any) {
    console.warn('[StatusBar] Failed to fetch manifest:', err)
  } finally {
    manifestLoading.value = false
  }
}

watch(() => sessionStore.activeSession?.project_dir, (projectDir) => {
  if (projectDir && connectionStore.isConnected) {
    fetchManifest()
  } else {
    manifestData.value = null
  }
})

// ── Index progress bar ──
const indexProgress = computed(() => {
  if (!manifestData.value) return { indexed: 0, total: 0, percent: 0 }
  const total = manifestData.value.total_files || 0
  const indexed = manifestData.value.indexed_files || 0
  return { indexed, total, percent: total > 0 ? Math.round((indexed / total) * 100) : 0 }
})

// Periodic refresh of manifest while indexing is active
let progressTimer: ReturnType<typeof setInterval> | null = null
watch(indexingState, (s) => {
  if (s.active && !progressTimer) {
    console.log('[STATUSBAR] Starting 2s manifest polling timer')
    progressTimer = setInterval(() => {
      fetchManifest()
      chatStore.syncTotalTokenStats()
    }, 2000)
  } else if (!s.active && progressTimer) {
    console.log('[STATUSBAR] Stopping 2s manifest polling timer')
    clearInterval(progressTimer)
    progressTimer = null
  }
})
onUnmounted(() => { if (progressTimer) { clearInterval(progressTimer); progressTimer = null } })

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

function handleOpenAbout() {
  connectionStore.pendingShowAbout = true
}
</script>

<template>
  <footer class="status-bar">
    <div class="status-left">
      <span class="status-dot" :style="{ background: statusColor }"></span>
      <span class="status-text">{{ statusLabel }}</span>
      <ElTooltip v-if="!connectionStore.isConnected" :content="t('sidebar.connect')" placement="top" :show-after="400">
        <button
          class="action-btn connect-btn"
          @click="handleOpenConnection"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
          </svg>
        </button>
      </ElTooltip>
      <ElTooltip v-else :content="t('sidebar.disconnect')" placement="top" :show-after="400">
        <button
          class="action-btn disconnect-btn"
          @click="handleDisconnect"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </ElTooltip>

      <!-- 工作目录 -->
      <div class="project-dir-section" v-if="activeProjectDir && !indexingState.active">
        <ElTooltip content="打开工作目录" placement="top" :show-after="400">
          <button
            class="dir-label-btn"
            @click="handleOpenProjectDir"
          >
            <el-icon :size="13"><FolderOpened /></el-icon>
            <span class="dir-label">工作目录</span>
          </button>
        </ElTooltip>
        <ElTooltip :content="activeProjectDir" placement="top" :show-after="500">
          <span class="dir-path">{{ activeProjectDir }}</span>
        </ElTooltip>
      </div>

      <!-- 知识库索引 -->
      <div class="kb-section" v-if="activeProjectDir">
        <ElTooltip content="打开知识库整理服务" placement="top" :show-after="400">
          <button
            class="kb-label-btn"
            @click="handleOpenKB"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <span class="kb-label">知识库</span>
          </button>
        </ElTooltip>

        <!-- Indexing Progress Bar -->
        <div
          class="indexing-progress"
          v-if="indexProgress.total > 0 || indexingState.active"
        >
          <div class="progress-bar-track">
            <div class="progress-bar-fill" :style="{ width: indexProgress.percent + '%' }"></div>
          </div>
          <span class="progress-text">{{ indexProgress.indexed }}/{{ indexProgress.total }}</span>
          <span v-if="indexingState.active" class="indexing-file">
            <el-icon class="is-loading index-loading-icon"><Loading /></el-icon>
            {{ indexingState.message }}
          </span>
        </div>
      </div>
      <IndexDetailsDialog :visible="showIndexDialog" @update:visible="showIndexDialog = $event" @refreshed="fetchManifest()" />
      <EntityTagsDialog :visible="showEntityTagDialog" @update:visible="showEntityTagDialog = $event" />
    </div>

    <div class="status-right">
      <!-- 只看答案 -->
      <div class="answer-only-switch">
        <el-switch
          v-model="chatStore.showAnswerOnly"
          size="small"
          active-text="只看答案"
          inactive-text=""
        />
      </div>
      <!-- Token statistics -->
      <ElTooltip :content="t('tokenUsage.viewDetails')" placement="top" :show-after="400">
        <button class="stat-block" @click="handleOpenTokenReport">
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
      </ElTooltip>
      <ElTooltip content="Terminal" placement="top" :show-after="400">
        <button
          class="action-btn terminal-btn"
          @click="showTerminalDrawer = true"
        >
          <el-icon :size="13"><Monitor /></el-icon>
        </button>
      </ElTooltip>
      <ElTooltip :content="t('chat.logTab')" placement="top" :show-after="400">
        <ElBadge
          :value="logErrorCount"
          :hidden="logErrorCount === 0"
          :max="99"
          type="danger"
          class="log-badge"
        >
          <button
            class="action-btn log-btn"
            @click="openLogDrawer"
          >
            <el-icon :size="13"><Document /></el-icon>
          </button>
        </ElBadge>
      </ElTooltip>
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
      <ElTooltip :content="t('sidebar.about.title')" placement="top" :show-after="400">
        <button
          class="version-btn"
          v-if="version"
          @click="handleOpenAbout"
        >{{ version }}</button>
      </ElTooltip>
    </div>
  </footer>
  <LogDrawer ref="logDrawerRef" />
  <TerminalDrawer :visible="showTerminalDrawer" @update:visible="showTerminalDrawer = $event" :cwd="activeProjectDir" />
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

/* Log badge positioning */
.log-badge {
  display: inline-flex;
  align-items: center;
  line-height: 0;
}
.log-badge :deep(sup.el-badge__content) {
  font-size: 9px;
  padding: 0 4px;
  height: 15px;
  line-height: 15px;
  min-width: 15px;
  border: 1px solid rgba(239, 68, 68, 0.4);
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

.dir-label-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.dir-label-btn:hover {
  background: rgba(55, 65, 81, 0.3);
  border-color: rgba(55, 65, 81, 0.5);
}

.dir-label {
  font-size: 10px;
  color: var(--text-muted, #94a3b8);
  flex-shrink: 0;
  cursor: pointer;
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

.answer-only-switch {
  display: inline-flex;
  align-items: center;
  margin-right: 6px;
  padding-right: 6px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}
.answer-only-switch :deep(.el-switch) {
  --el-switch-on-color: #8b5cf6;
  --el-switch-off-color: rgba(100, 116, 139, 0.35);
  height: 18px;
  line-height: 18px;
}
.answer-only-switch :deep(.el-switch__core) {
  height: 12px;
  min-width: 28px;
  border-radius: 6px;
}
.answer-only-switch :deep(.el-switch__core::after) {
  width: 10px;
  height: 10px;
}
.answer-only-switch :deep(.el-switch__label) {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted, #94a3b8);
}
.answer-only-switch :deep(.el-switch.is-checked .el-switch__label) {
  color: #a78bfa;
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

/* Right - fills remaining space and right-aligns */
.status-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
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

/* ── Knowledge base section ── */
.kb-section {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  padding-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}
.kb-label-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.kb-label-btn:hover {
  background: rgba(55, 65, 81, 0.3);
  border-color: rgba(55, 65, 81, 0.5);
  color: #a78bfa;
}
.kb-label {
  font-size: 10px;
  flex-shrink: 0;
  cursor: pointer;
}

/* ── Index progress bar ── */
.indexing-progress {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
  padding-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}
.progress-bar-track {
  width: 60px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #a78bfa, #22d3ee);
  transition: width 0.5s ease;
}
.progress-text {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted, #94a3b8);
  white-space: nowrap;
}
.indexing-file {
  font-size: 10px;
  color: var(--accent-cyan, #22d3ee);
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.index-loading-icon {
  font-size: 12px;
  flex-shrink: 0;
}
</style>
