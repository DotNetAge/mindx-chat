<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Close, Document } from '@element-plus/icons-vue'
import GraphSidebar from './GraphSidebar.vue'
import GraphCanvas from './GraphCanvas.vue'
import GraphDetailPanel from './GraphDetailPanel.vue'
import FileReaderPanel from './FileReaderPanel.vue'
import EntityListTab from './EntityListTab.vue'
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
  const node = store.selectedNode
  console.log(`[GraphViewer] selected node:`, JSON.parse(JSON.stringify(node)))
  store.loadNodeChunks(nodeId)
}

/** Get the active tab object */
const activeMainTab = () => {
  return store.mainTabs.find(tab => tab.id === store.activeMainTabId)
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
          </div>
          <div class="gv-header-right">
            <button class="close-btn" @click="handleBack" :title="t('common.close')">
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </header>

        <!-- Main body: sidebar + tabbed main area -->
        <div class="gv-body">
          <GraphSidebar />
          <div class="gv-main-area">
            <!-- Tab bar + content -->
            <el-tabs
              v-model="store.activeMainTabId"
              type="card"
              class="gv-main-tabs"
              @tab-remove="store.closeMainTab"
            >
              <!-- ── Graph tab (always present, not closable) ── -->
              <el-tab-pane
                name="graph"
                :closable="false"
              >
                <template #label>
                  <span class="tab-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="4" cy="8" r="2"/><circle cx="20" cy="8" r="2"/><circle cx="4" cy="16" r="2"/><circle cx="20" cy="16" r="2"/><line x1="6.5" y1="9.5" x2="9.5" y2="10.5"/><line x1="17.5" y1="9.5" x2="14.5" y2="10.5"/><line x1="6.5" y1="14.5" x2="9.5" y2="13.5"/><line x1="17.5" y1="14.5" x2="14.5" y2="13.5"/></svg>
                    {{ t('kgViewer.tabGraph') || '图谱' }}
                  </span>
                </template>
                <div class="tab-content-graph">
                  <GraphCanvas :on-node-click="handleNodeClick" />
                </div>
              </el-tab-pane>

              <!-- ── Dynamic tabs: file / entity list ── -->
              <el-tab-pane
                v-for="tab in store.mainTabs.filter(t => t.id !== 'graph')"
                :key="tab.id"
                :name="tab.id"
                :closable="tab.closable"
              >
                <template #label>
                  <span class="tab-label">
                    <!-- File icon for file tabs -->
                    <el-icon v-if="tab.type === 'file'" :size="13"><Document /></el-icon>
                    {{ tab.label }}
                  </span>
                </template>

                <!-- File content -->
                <FileReaderPanel v-if="tab.type === 'file'" />

                <!-- Entity list table -->
                <EntityListTab
                  v-else-if="tab.type === 'entity' && tab.labelType"
                  :label-type="tab.labelType"
                />
              </el-tab-pane>
            </el-tabs>

            <!-- Detail panel overlay (always on top) -->
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

/* Main Tabs */
.gv-main-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.gv-main-tabs :deep(.el-tabs__header) {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 10px;
  margin: 0;
  flex-shrink: 0;
}
.gv-main-tabs :deep(.el-tabs__nav-wrap) {
  overflow-x: auto;
}
.gv-main-tabs :deep(.el-tabs__nav) {
  border: none;
}
.gv-main-tabs :deep(.el-tabs__item) {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  border: none !important;
  border-radius: 6px 6px 0 0;
  padding: 0 14px;
  height: 36px;
  line-height: 36px;
  transition: all .15s;
}
.gv-main-tabs :deep(.el-tabs__item:hover) {
  color: var(--text-primary);
  background: rgba(255,255,255,.04);
}
.gv-main-tabs :deep(.el-tabs__item.is-active) {
  color: #06b6d4;
  background: var(--bg-primary);
  border-top: 2px solid #06b6d4;
}
.gv-main-tabs :deep(.el-tabs__content) {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.gv-main-tabs :deep(.el-tab-pane) {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.tab-label {
  display: flex; align-items: center; gap: 5px;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Graph tab content — absolute fill to bypass el-tabs flex-chain height issues */
.tab-content-graph {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

/* Transitions */
.fade-scale-enter-active { transition: opacity .2s ease, transform .2s ease; }
.fade-scale-leave-active { transition: opacity .15s ease, transform .15s ease; }
.fade-scale-enter-from { opacity: 0; transform: scale(.97); }
.fade-scale-leave-to { opacity: 0; transform: scale(.97); }
</style>

<!-- 全局样式：确保确认对话框在 GraphViewer (z:8000) 之上 -->
<style>
.el-overlay:has(.el-message-box) {
  z-index: 9000 !important;
}
</style>
