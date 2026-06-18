<script setup>
import { ref, computed, watch } from 'vue'
import Sidebar from './Sidebar.vue'
import ChatArea from './ChatArea.vue'
import FileBrowserDrawer from './FileBrowserDrawer.vue'
import { FolderOpened } from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'

const props = defineProps({
  showSetupDialog: Boolean,
  setupAgentName: String,
  selectedDirectory: String,
  showModelPicker: Boolean
})

const emit = defineEmits(['update:selectedDirectory', 'setupConfirm', 'setupCancel', 'toggleSetupDialog', 'update:showModelPicker', 'toggle-file-browser'])

const isCollapsed = ref(false)
const fileBrowserVisible = ref(false)

// ── 文件引用 ──
const fileRefs = ref([])

function addRef(path, name) {
  // 去重
  if (!fileRefs.value.some(r => r.path === path)) {
    fileRefs.value.push({ path, name })
  }
}

function removeRef(path) {
  fileRefs.value = fileRefs.value.filter(r => r.path !== path)
}

function clearRefs() {
  fileRefs.value = []
}

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

watch(() => connectionStore.showFileBrowser, (val) => {
  if (val) {
    fileBrowserVisible.value = true
  }
})

watch(fileBrowserVisible, (val) => {
  if (!val) connectionStore.showFileBrowser = false
})

async function handleRequestNewSession() {
  if (!connectionStore.isConnected || !connectionStore.currentAgent) {
    throw new Error(t('chat.notConnectedOrNoAgent'))
  }

  emit('toggleSetupDialog')
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
        @toggle-file-browser="toggleFileBrowser"
      />
      <ChatArea
        :is-sidebar-collapsed="isCollapsed"
        :on-request-new-session="handleRequestNewSession"
        :show-model-picker="showModelPicker"
        :file-refs="fileRefs"
        @remove-ref="removeRef"
        @clear-refs="clearRefs"
        @update:show-model-picker="(v) => emit('update:showModel-picker', v)"
      />
    </div>

    <FileBrowserDrawer
      v-model:visible="fileBrowserVisible"
      :project-dir="currentProjectDir"
      @add-ref="addRef"
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
  overflow: hidden;
  transition: margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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