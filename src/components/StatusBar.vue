<script setup lang="ts">
import { computed, onMounted, watch, ref, onUnmounted, inject } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElTooltip } from 'element-plus'
import { useConnectionStore } from '../stores/connectionStore'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useFileExplorerStore } from '../stores/fileExplorerStore'
import { useGraphStore } from '../stores/graphStore'
import { getMindXClient } from '../services/websocket'
import { FolderOpened, Plus, Document, Loading, Monitor } from '@element-plus/icons-vue'
import LogDrawer from './LogDrawer.vue'
import IndexDetailsDialog from './IndexDetailsDialog.vue'
import TerminalDrawer from './TerminalDrawer.vue'

const { t } = useI18n()
const connectionStore = useConnectionStore()
const chatStore = useChatStore()
const sessionStore = useSessionStore()
const fileExplorerStore = useFileExplorerStore()
const graphStore = useGraphStore()

const logDrawerRef = ref<InstanceType<typeof LogDrawer> | null>(null)
function openLogDrawer() { logDrawerRef.value?.open() }

const showTerminalDrawer = computed({
  get: () => connectionStore.showTerminalDrawer,
  set: (val: boolean) => { connectionStore.showTerminalDrawer = val }
})

const showSetupDialog = inject<Ref<boolean>>('showSetupDialog')!
const showEntityTags = inject<Ref<boolean>>('showEntityTags')!

const statusColor = computed(() => connectionStore.statusColor)
const statusLabel = computed(() => connectionStore.statusLabel)
const version = computed(() => connectionStore.serverVersion ? `v${connectionStore.serverVersion}` : '')

const filewatchAvailable = computed(() => graphStore.filewatchStatus?.available ?? false)
const filewatchRunning = computed(() => graphStore.filewatchStatus?.running ?? false)
const autoIndexLabel = computed(() => {
  if (!filewatchAvailable.value) return t('sidebar.autoIndex.conditionsNotMet')
  return filewatchRunning.value ? t('sidebar.autoIndex.enabled') : t('sidebar.autoIndex.disabled')
})
const autoIndexTitle = computed(() => {
  if (!filewatchAvailable.value) return t('sidebar.autoIndex.conditionsNotMet')
  return filewatchRunning.value ? t('sidebar.autoIndex.running') : t('sidebar.autoIndex.stopped')
})

const toggling = ref(false)

// ── Requirements Dialog ──
const showRequirementsDialogVisible = ref(false)
const requirementsList = ref<{ label: string; ok: boolean }[]>([])

async function checkAndShowRequirements() {
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

  requirementsList.value = [
    { label: t('sidebar.autoIndex.requirementWatchedDirs'), ok: hasWatchedDirs },
    { label: t('sidebar.autoIndex.requirementEntityTags'), ok: hasTags },
  ]

  const allMet = requirementsList.value.every(r => r.ok)
  if (allMet) return true

  showRequirementsDialogVisible.value = true
  return false
}

function handleCreateSession() {
  showRequirementsDialogVisible.value = false
  showSetupDialog.value = true
}

function handleConfigureTags() {
  showRequirementsDialogVisible.value = false
  showEntityTags.value = true
}

async function handleToggleAutoIndex() {
  if (toggling.value) return

  if (!filewatchAvailable.value) {
    await checkAndShowRequirements()
    return
  }

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
    const allMet = await checkAndShowRequirements()
    if (!allMet) return

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

/** Click on auto-index indicator: check conditions first, then open dialog. */
async function handleAutoIndexClick() {
  const allMet = await checkAndShowRequirements()
  if (!allMet) return
  showIndexDialog.value = true
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
  // Priority: session's project_dir > first watched directory from filewatch
  const active = sessionStore.sessions.find(s => s.session_id === sessionStore.activeSessionId)
  if (active?.project_dir) return active.project_dir
  const watched = graphStore.filewatchStatus?.watched
  if (watched && watched.length > 0) return watched[0]
  return ''
})

const updateLabel = computed(() => {
  if (connectionStore.updateState === 'downloading') return t('sidebar.update.downloading')
  if (connectionStore.updateState === 'restart_needed') return t('sidebar.update.restartNeeded')
  return ''
})

const indexingState = computed(() => connectionStore.indexingState)
const showIndexDialog = ref(false)

// ── Index progress bar ──
const indexProgress = computed(() => {
  const idx = graphStore.filewatchStatus?.index_state
  if (!idx) return { indexed: 0, total: 0, percent: 0 }
  let total = 0, indexed = 0
  for (const s of Object.values(idx)) {
    total += s.total_files
    indexed += s.indexed_files
  }
  return { indexed, total, percent: total > 0 ? Math.round((indexed / total) * 100) : 0 }
})
// Debug: log indexing state changes
watch(indexingState, (s) => {
  console.log('[INDEXING-DEBUG] StatusBar indexingState changed:', JSON.stringify(s))
})

// Debug: log indexProgress changes
watch(indexProgress, (p) => {
  console.log('[INDEXING-DEBUG] StatusBar indexProgress:', JSON.stringify(p))
})

// Periodic refresh of filewatchStatus while indexing is active
let progressTimer: ReturnType<typeof setInterval> | null = null
watch(indexingState, (s) => {
  if (s.active && !progressTimer) {
    console.log('[INDEXING-DEBUG] Starting 2s polling timer')
    progressTimer = setInterval(() => {
      graphStore.refreshFilewatchStatus()
      chatStore.syncTotalTokenStats()
    }, 2000)
  } else if (!s.active && progressTimer) {
    console.log('[INDEXING-DEBUG] Stopping 2s polling timer')
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
        <ElTooltip :content="t('sidebar.addToChat')" placement="top" :show-after="400">
          <button
            class="action-btn add-btn"
            @click="handleToggleFileBrowser"
          >
            <el-icon :size="13"><Plus /></el-icon>
          </button>
        </ElTooltip>
      </div>

      <!-- Auto Index Status -->
      <ElTooltip :content="autoIndexTitle" placement="top" :show-after="400">
        <button
          class="auto-index-indicator"
          @click="handleAutoIndexClick"
          :disabled="toggling"
        >
          <span class="auto-index-dot" :class="{ running: filewatchRunning }" :style="!filewatchAvailable ? { background: '#f59e0b' } : undefined"></span>
          <span class="auto-index-label">{{ autoIndexLabel }}</span>
        </button>
      </ElTooltip>

      <!-- Indexing Progress Bar -->
      <div
        class="indexing-progress"
        v-if="filewatchAvailable || indexingState.active || indexProgress.total > 0 || indexProgress.indexed > 0"
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
      <IndexDetailsDialog :visible="showIndexDialog" @update:visible="showIndexDialog = $event" @refreshed="graphStore.refreshFilewatchStatus()" />
    </div>

    <div class="status-center">
      <div class="answer-only-switch">
        <el-switch
          v-model="chatStore.showAnswerOnly"
          size="small"
          active-text="只看答案"
          inactive-text=""
        />
      </div>
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
    </div>

    <div class="status-right">
      <ElTooltip content="Terminal" placement="top" :show-after="400">
        <button
          class="action-btn terminal-btn"
          @click="showTerminalDrawer = true"
        >
          <el-icon :size="13"><Monitor /></el-icon>
        </button>
      </ElTooltip>
      <ElTooltip :content="t('chat.logTab')" placement="top" :show-after="400">
        <button
          class="action-btn log-btn"
          @click="openLogDrawer"
        >
          <el-icon :size="13"><Document /></el-icon>
        </button>
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

  <!-- Requirements Dialog -->
  <el-dialog
    v-model="showRequirementsDialogVisible"
    :title="t('sidebar.autoIndex.startFailed')"
    :width="360"
    :close-on-click-modal="true"
    append-to-body
  >
    <div class="requirements-dialog-body">
      <p class="requirements-desc">{{ t('sidebar.autoIndex.startFailedDesc') }}</p>
      <div class="requirements-list">
        <div
          v-for="(req, idx) in requirementsList"
          :key="idx"
          class="requirement-row"
        >
          <span class="requirement-icon" :class="{ met: req.ok }">{{ req.ok ? '✓' : '✗' }}</span>
          <span class="requirement-label">{{ req.label }}</span>
          <el-button
            v-if="!req.ok"
            size="small"
            class="requirement-action-btn"
            @click="idx === 0 ? handleCreateSession() : handleConfigureTags()"
          >
            {{ idx === 0 ? t('directoryBrowser.title') : t('entityTags.configure') }}
          </el-button>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="showRequirementsDialogVisible = false">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
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

/* ── Requirements Dialog ── */
.requirements-dialog-body {
  padding: 4px 0;
}
.requirements-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-secondary, #c8d6e5);
  line-height: 1.5;
}
.requirements-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.requirement-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}
.requirement-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
.requirement-icon.met {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.requirement-label {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary, #e2e8f0);
  line-height: 1.4;
}
.requirement-action-btn {
  flex-shrink: 0;
  font-size: 11px;
}
</style>
