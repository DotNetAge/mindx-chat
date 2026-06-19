<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Close } from '@element-plus/icons-vue'
import GraphSidebar from './GraphSidebar.vue'
import GraphCanvas from './GraphCanvas.vue'
import GraphDetailPanel from './GraphDetailPanel.vue'
import FileReaderPanel from './FileReaderPanel.vue'
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
  store.loadNodeChunks(nodeId)
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
            <button class="close-btn" @click="handleBack" :title="t('common.close')">
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </header>

        <!-- Main body: sidebar + main area -->
        <div class="gv-body">
          <GraphSidebar />
          <div class="gv-main-area">
            <FileReaderPanel v-if="store.activeFilePath" />
            <template v-else>
              <GraphCanvas
                :on-node-click="handleNodeClick"
              />
              <GraphDetailPanel />
            </template>
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
