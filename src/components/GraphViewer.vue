<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
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
</style>
