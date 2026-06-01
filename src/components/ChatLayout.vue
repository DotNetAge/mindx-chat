<script setup>
import { ref, computed } from 'vue'
import Sidebar from './Sidebar.vue'
import ChatArea from './ChatArea.vue'
import FileBrowserDrawer from './FileBrowserDrawer.vue'
import { FolderOpened } from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'

const props = defineProps({
  showSetupDialog: Boolean,
  setupAgentName: String,
  selectedDirectory: String
})

const emit = defineEmits(['update:selectedDirectory', 'setupConfirm', 'setupCancel', 'toggleSetupDialog'])

const isCollapsed = ref(false)
const fileBrowserVisible = ref(false)

const connectionStore = useConnectionStore()
const currentProjectDir = computed(() => {
  return connectionStore.currentProjectDir || props.selectedDirectory || '/'
})

function updateSelectedDirectory(path) {
  emit('update:selectedDirectory', path)
}

function handleSetupConfirm() {
  emit('setupConfirm')
}

function handleSetupCancel() {
  emit('setupCancel')
}

function handleToggleSetupDialog() {
  emit('toggleSetupDialog')
}

function toggleFileBrowser() {
  fileBrowserVisible.value = !fileBrowserVisible.value
}
</script>

<template>
  <div class="chat-layout">
    <div class="main-content">
      <Sidebar
        :is-collapsed="isCollapsed"
        :show-setup-dialog="showSetupDialog"
        :setup-agent-name="setupAgentName"
        :selected-directory="selectedDirectory"
        @toggle-collapse="isCollapsed = !isCollapsed"
        @update:selectedDirectory="updateSelectedDirectory"
        @setup-confirm="handleSetupConfirm"
        @setup-cancel="handleSetupCancel"
        @toggle-setup-dialog="handleToggleSetupDialog"
      />
      <ChatArea :is-sidebar-collapsed="isCollapsed" />
    </div>

    <div class="right-toolbar" :class="{ 'with-drawer': fileBrowserVisible }">
      <button class="toolbar-btn" @click="toggleFileBrowser" title="文件浏览器">
        <el-icon><FolderOpened /></el-icon>
      </button>
    </div>

    <FileBrowserDrawer
      v-model:visible="fileBrowserVisible"
      :project-dir="currentProjectDir"
    />
  </div>
</template>

<style scoped>
.chat-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  background: var(--bg-primary);
  position: relative;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  min-width: 0;
  transition: margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.right-toolbar {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 14;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-right: none;
  border-radius: 8px 0 0 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.7;
}

.right-toolbar:hover {
  opacity: 1;
}

.right-toolbar.with-drawer {
  right: 360px;
  opacity: 1;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.toolbar-btn:hover {
  background: var(--bg-hover);
  color: var(--accent-cyan);
}

.chat-layout::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 80%;
  height: 100%;
  background: radial-gradient(ellipse at center, rgba(6, 182, 212, 0.08) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
</style>