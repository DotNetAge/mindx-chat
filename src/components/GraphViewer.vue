<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Refresh, Monitor, VideoPause } from '@element-plus/icons-vue'
import GraphSidebar from './GraphSidebar.vue'
import GraphCanvas from './GraphCanvas.vue'
import GraphDetailPanel from './GraphDetailPanel.vue'
import { useGraphStore } from '../stores/graphStore'

const { t } = useI18n()
const store = useGraphStore()

const emit = defineEmits(['close'])

const pollingTimer = ref<ReturnType<typeof setInterval> | null>(null)

onMounted(() => {
  store.refreshFilewatchStatus()
})

async function toggleIndexing() {
  if (store.filewatchStatus?.running) {
    await store.stopFilewatch()
    stopPolling()
  } else {
    await store.startFilewatch()
    startPolling()
  }
}

function startPolling() {
  stopPolling()
  pollingTimer.value = setInterval(() => {
    store.refreshFilewatchStatus()
    if (store.filewatchStatus?.watched?.length) {
      store.refreshFileStates(store.filewatchStatus.watched[0])
    }
  }, 5000)
}

function stopPolling() {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
}

function getStateLabel(state: string): string {
  const map: Record<string, string> = {
    indexed: t('kgViewer.indexedCount'),
    changed: t('kgViewer.changedCount'),
    new: t('kgViewer.newCount'),
    removed: 'Removed',
    skipped: 'Skipped',
  }
  return map[state] || state
}

function getStateColor(state: string): string {
  const map: Record<string, string> = {
    indexed: '#10b981',
    changed: '#f59e0b',
    new: '#06b6d4',
    removed: '#ef4444',
    skipped: '#64748b',
  }
  return map[state] || '#64748b'
}

function handleBack() {
  store.close()
  emit('close')
}

function handleRefresh() {
  store.loadAllData()
}

function handleNodeClick(nodeId: string) {
  store.selectNode(nodeId)
}

async function handleNodeDoubleClick(nodeId: string) {
  await store.loadNeighbors(nodeId, 2)
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade-scale">
      <div v-if="store.visible" class="gv-overlay">
        <!-- Header bar -->
        <header class="gv-header">
          <div class="gv-header-left">
            <button class="back-btn" @click="handleBack">
              <el-icon><ArrowLeft /></el-icon>
              {{ t('common.back') }}
            </button>
            <h1 class="gv-title">{{ t('kgViewer.title') }}</h1>
            <span class="beta-badge">Beta</span>
          </div>
          <div class="gv-header-right">
            <div class="header-index-control" :class="{ running: store.filewatchStatus?.running }">
              <span class="index-dot" :class="{ running: store.filewatchStatus?.running }"></span>
              <button
                class="index-toggle-btn"
                :class="{ running: store.filewatchStatus?.running }"
                @click="toggleIndexing"
                :disabled="store.filewatchStatus === null"
              >
                <el-icon :size="13">
                  <component :is="store.filewatchStatus?.running ? VideoPause : Monitor" />
                </el-icon>
                {{ store.filewatchStatus?.running ? t('kgViewer.indexStop') : t('kgViewer.indexStart') }}
              </button>
              <div v-if="store.fileStates" class="header-index-stats">
                <span
                  v-for="s in ['indexed', 'new', 'changed', 'removed']"
                  :key="s"
                  class="index-stat-item"
                  :style="{ color: getStateColor(s) }"
                >
                  {{ (store.fileStates.counts as any)[s] ?? 0 }}
                </span>
              </div>
              <div v-else class="header-index-stats muted">
                <span>{{ t('common.loading') }}</span>
              </div>
            </div>
            <button class="header-action-btn" @click="handleRefresh" title="Reload">
              <el-icon><Refresh /></el-icon>
            </button>
          </div>
        </header>

        <!-- Main body: sidebar + canvas + detail panel -->
        <div class="gv-body">
          <GraphSidebar />
          <div class="gv-main-area">
            <GraphCanvas
              :on-node-click="handleNodeClick"
              :on-node-double-click="handleNodeDoubleClick"
            />
            <GraphDetailPanel />
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.gv-overlay {
  position: fixed; inset: 0; z-index: 8000;
  display: flex; flex-direction: column;
  background: var(--bg-primary);
}

/* Header */
.gv-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 20px;
  min-height: 48px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.gv-header-left {
  display: flex; align-items: center; gap: 12px;
}
.back-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 7px; cursor: pointer;
  transition: all .15s;
}
.back-btn:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,.08);
  border-color: rgba(255,255,255,.18);
}
.gv-title {
  font-size: 16px; font-weight: 700; color: var(--text-primary);
  margin: 0;
}
.beta-badge {
  font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 10px;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff; letter-spacing: .5px;
  text-transform: uppercase;
}
.gv-header-right {
  display: flex; align-items: center; gap: 6px;
}
.header-action-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 16px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 7px; cursor: pointer;
  transition: all .15s;
}
.header-action-btn:hover {
  color: var(--accent-cyan);
  background: rgba(6,182,212,.08);
  border-color: rgba(6,182,212,.2);
}

/* Body */
.gv-body {
  flex: 1; display: flex;
  overflow: hidden;
}
.gv-main-area {
  flex: 1;
  display: flex; flex-direction: column;
  position: relative;
  min-width: 0;
  overflow: hidden;
}

/* Transitions */
.fade-scale-enter-active { transition: opacity .2s ease, transform .2s ease; }
.fade-scale-leave-active { transition: opacity .15s ease, transform .15s ease; }
.fade-scale-enter-from { opacity: 0; transform: scale(.97); }
.fade-scale-leave-to { opacity: 0; transform: scale(.97); }

/* ── Header Index Control ── */
.header-index-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-right: 1px solid var(--border-color);
  margin-right: 6px;
}

.header-index-control .index-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #64748b;
  transition: background .3s;
  flex-shrink: 0;
}
.header-index-control .index-dot.running {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16,185,129,.5);
}

.header-index-control .index-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #e2e8f0;
  background: rgba(16,185,129,.15);
  border: 1px solid rgba(16,185,129,.3);
  border-radius: 5px;
  cursor: pointer;
  transition: all .15s;
}
.header-index-control .index-toggle-btn:hover { background: rgba(16,185,129,.25); }
.header-index-control .index-toggle-btn.running {
  background: rgba(239,68,68,.12);
  border-color: rgba(239,68,68,.25);
}
.header-index-control .index-toggle-btn.running:hover { background: rgba(239,68,68,.22); }
.header-index-control .index-toggle-btn:disabled { opacity: .5; cursor: not-allowed; }

.header-index-stats {
  display: flex;
  gap: 6px;
  font-size: 10.5px;
  font-family: 'JetBrains Mono', monospace;
}
.header-index-stats.muted {
  color: var(--text-muted);
}

.header-index-control .index-stat-item {
  display: flex;
  align-items: center;
  gap: 2px;
}
.header-index-control .index-stat-item::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 2px;
}
</style>
