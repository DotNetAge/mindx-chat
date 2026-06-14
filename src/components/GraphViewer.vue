<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Close, Monitor, VideoPause } from '@element-plus/icons-vue'
import GraphSidebar from './GraphSidebar.vue'
import GraphCanvas from './GraphCanvas.vue'
import GraphDetailPanel from './GraphDetailPanel.vue'
import { useGraphStore } from '../stores/graphStore'

const { t } = useI18n()
const store = useGraphStore()

const emit = defineEmits(['close'])

function handleBack() {
  store.close()
  emit('close')
}

function handleNodeClick(nodeId: string) {
  store.selectNode(nodeId)
}

async function handleNodeDoubleClick(nodeId: string) {
  await store.loadNeighbors(nodeId, 2)
}

// ── Index control ──

const indexedCount = computed(() => store.fileStates?.counts?.indexed ?? 0)
const unindexedCount = computed(() => store.fileStates?.counts
  ? store.fileStates.counts.total - store.fileStates.counts.indexed
  : 0
)

const pollingTimer = ref<ReturnType<typeof setInterval> | null>(null)

onMounted(() => {
  store.refreshFilewatchStatus()
})

onUnmounted(() => {
  stopPolling()
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
</script>

<template>
  <Teleport to="body">
    <transition name="fade-scale">
      <div v-if="store.visible" class="gv-overlay">
        <!-- Header bar -->
        <header class="gv-header">
          <div class="gv-header-left">
            <h1 class="gv-title">{{ t('kgViewer.title') }}</h1>
            <span class="beta-badge">Beta</span>
          </div>
          <div class="gv-header-right">
            <div class="index-control">
              <span class="index-dot" :class="{ running: store.filewatchStatus?.running }"></span>
              <button
                class="index-toggle-btn"
                :class="{ running: store.filewatchStatus?.running }"
                @click="toggleIndexing"
                :disabled="store.filewatchStatus === null || !store.filewatchStatus.watched?.length"
              >
                <el-icon :size="13">
                  <component :is="store.filewatchStatus?.running ? VideoPause : Monitor" />
                </el-icon>
                {{ store.filewatchStatus?.running ? '停止' : '自动索引' }}
              </button>
              <span v-if="store.fileStates" class="index-stats">
                <span class="index-stat-item" style="color: #10b981">{{ indexedCount }}</span>
                <span class="index-stat-item" style="color: #f59e0b">{{ unindexedCount }}</span>
              </span>
            </div>
            <button class="close-btn" @click="handleBack" :title="t('common.close')">
              <el-icon><Close /></el-icon>
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
.gv-header-right {
  display: flex; align-items: center; gap: 10px;
}
.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px; cursor: pointer;
  transition: all .15s;
}
.close-btn:hover {
  color: #f87171;
  background: rgba(239, 68, 68, 0.12);
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

/* ── Index control in header ── */

.index-control {
  display: flex;
  align-items: center;
  gap: 6px;
}
.index-control .index-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #64748b;
  transition: background .3s;
  flex-shrink: 0;
}
.index-control .index-dot.running {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16,185,129,.5);
}
.index-control .index-toggle-btn {
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
.index-control .index-toggle-btn:hover { background: rgba(16,185,129,.25); }
.index-control .index-toggle-btn.running {
  background: rgba(239,68,68,.12);
  border-color: rgba(239,68,68,.25);
}
.index-control .index-toggle-btn.running:hover { background: rgba(239,68,68,.22); }
.index-control .index-toggle-btn:disabled { opacity: .5; cursor: not-allowed; }

.index-control .index-stats {
  display: flex;
  gap: 8px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  margin-left: 4px;
}
.index-control .index-stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
}
.index-control .index-stat-item::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
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
</style>
