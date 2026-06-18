<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Folder,
  Document,
  Plus,
  RefreshRight,
  House,
  Close
} from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'
import type { FSEntry } from '../types/websocket'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  projectDir: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:visible', 'open-file', 'add-ref'])

const connectionStore = useConnectionStore()
const { t } = useI18n()

const currentPath = ref('')
const entries = ref<FSEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const sortedEntries = computed(() => {
  const dirs = entries.value.filter(e => e.is_dir).sort((a, b) => a.name.localeCompare(b.name))
  const files = entries.value.filter(e => !e.is_dir).sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
})

const breadcrumbSegments = computed(() => {
  if (!currentPath.value) return []
  const parts = currentPath.value.split('/').filter(Boolean)
  return parts.map((part, idx) => {
    const fullPath = '/' + parts.slice(0, idx + 1).join('/')
    return { label: part, path: fullPath }
  })
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  for (const unit of units) {
    if (size < 1024) return `${size.toFixed(size < 10 ? 1 : 0)} ${unit}`
    size /= 1024
  }
  return `${size.toFixed(1)} PB`
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

async function fetchFSList(path: string) {
  loading.value = true
  error.value = null
  try {
    if (!connectionStore.isConnected) {
      throw new Error(t('fileBrowser.notConnected'))
    }

    const result = await connectionStore.fetchFSList(path)

    console.log('[FileBrowser] Raw response:', typeof result, Array.isArray(result), result)

    if (Array.isArray(result)) {
      entries.value = result
    } else if (result && result.entries && Array.isArray(result.entries)) {
      entries.value = result.entries
    } else if (result && typeof result === 'object') {
      entries.value = Object.values(result).filter(item =>
        item && typeof item === 'object' && 'name' in item
      )
    } else {
      console.warn('[FileBrowser] Unexpected data format:', result)
      entries.value = []
    }

    currentPath.value = path
  } catch (err: any) {
    console.error('[FileBrowser] Failed to fetch directory:', err)
    error.value = err?.message || t('fileBrowser.loadFailed')
  } finally {
    loading.value = false
  }
}

async function handleOpen() {
  let targetPath = props.projectDir

  if (!targetPath || targetPath === '/') {
    console.log('[FileBrowser] No project dir, fetching home directory...')
    try {
      targetPath = await connectionStore.fetchFSHome()
      console.log(`[FileBrowser] ✅ Got home directory: ${targetPath}`)
    } catch (err) {
      console.error('[FileBrowser] Failed to fetch home:', err)
      error.value = t('fileBrowser.cannotGetHomeDir')
      loading.value = false
      return
    }
  }

  if (targetPath) {
    await fetchFSList(targetPath)
  } else {
    error.value = t('fileBrowser.noWorkingDir')
  }
}

function navigateTo(path: string) {
  fetchFSList(path)
}

function refresh() {
  if (currentPath.value) {
    fetchFSList(currentPath.value)
  }
}

async function handleDirClick(entry: FSEntry) {
  if (entry.is_dir) {
    fetchFSList(entry.path)
  }
}

function closeDrawer() {
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    handleOpen()
  }
})
</script>

<template>
  <Transition name="drawer-slide">
    <div v-if="visible" class="file-browser-drawer">
      <div class="drawer-header">
        <div class="drawer-title">
          <el-icon><Folder /></el-icon>
          <span>{{ t('fileBrowser.quickReference') }}</span>
        </div>
        <div class="drawer-actions">
          <el-button text circle @click="refresh" :loading="loading" :title="t('common.refresh')">
            <el-icon><RefreshRight /></el-icon>
          </el-button>
          <el-button text circle @click="closeDrawer" :title="t('common.close')">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>

      <div class="breadcrumb-bar">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item>
            <a class="breadcrumb-link" @click.prevent="navigateTo(projectDir || '/')">
              <el-icon><House /></el-icon>
            </a>
          </el-breadcrumb-item>
          <el-breadcrumb-item
            v-for="seg in breadcrumbSegments"
            :key="seg.path"
          >
            <a class="breadcrumb-link" @click.prevent="navigateTo(seg.path)">{{ seg.label }}</a>
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <div class="file-list">
        <div v-if="loading && entries.length === 0" class="loading-state">
          <div class="loading-spinner">
            <el-icon class="is-loading" :size="32"><RefreshRight /></el-icon>
          </div>
          <div class="loading-text">
            <span class="loading-title">{{ t('common.loading') }}...</span>
            <span class="loading-subtitle">{{ t('fileBrowser.loadingDir') }}</span>
          </div>
        </div>

        <div v-else-if="error && entries.length === 0" class="error-state">
          <el-icon :size="40" color="#ef4444"><Close /></el-icon>
          <div class="error-text">
            <span class="error-title">{{ t('common.error') }}</span>
            <span class="error-message">{{ error }}</span>
          </div>
          <el-button type="primary" size="small" @click="refresh" :loading="loading">
            {{ t('common.retry') }}
          </el-button>
        </div>

        <div
          v-for="entry in sortedEntries"
          :key="entry.path"
          class="file-item"
          :class="{ 'dir-item': entry.is_dir }"
          @click="entry.is_dir && handleDirClick(entry)"
        >
          <div class="file-icon">
            <el-icon v-if="entry.is_dir" :size="18"><Folder /></el-icon>
            <el-icon v-else :size="16"><Document /></el-icon>
          </div>
          <div class="file-info">
            <span class="file-name" :title="entry.name">{{ entry.name }}</span>
            <span class="file-meta">
              <span v-if="entry.is_dir" class="dir-tag">&lt;dir&gt;</span>
              <template v-else>
                <span class="file-size">{{ formatSize(entry.size) }}</span>
                <span class="file-date">{{ formatDate(entry.mod_time) }}</span>
              </template>
            </span>
          </div>
          <div class="file-actions">
            <el-icon class="ref-icon" :title="t('fileBrowser.addToChat')" @click.stop="emit('add-ref', entry.path, entry.name); emit('update:visible', false)">
              <Plus />
            </el-icon>
          </div>
        </div>

        <div v-if="!loading && sortedEntries.length === 0" class="empty-state">
          <el-icon :size="40"><Folder /></el-icon>
          <span>{{ t('fileBrowser.dirEmpty') }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.file-browser-drawer {
  width: 360px;
  min-width: 360px;
  height: 100vh;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 15;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.drawer-actions {
  display: flex;
  gap: 4px;
}

.breadcrumb-bar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.breadcrumb-bar :deep(.el-breadcrumb) {
  font-size: 12px;
}

.breadcrumb-link {
  color: var(--accent-cyan);
  text-decoration: none;
  cursor: pointer;
}

.breadcrumb-link:hover {
  text-decoration: underline;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.loading-state,
.empty-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--text-muted);
  font-size: 13px;
}

.loading-spinner {
  margin-bottom: 8px;
}

.loading-text,
.error-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.loading-title,
.error-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}

.loading-subtitle,
.error-message {
  font-size: 12px;
  color: var(--text-muted);
  max-width: 240px;
  text-align: center;
}

.error-state .error-title {
  color: #ef4444;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-left: 2px solid transparent;
}

.file-item:hover {
  background: var(--bg-hover);
  border-left-color: var(--accent-cyan);
}

.file-item.dir-item {
  border-left-color: rgba(6, 182, 212, 0.2);
}

.file-item.dir-item:hover {
  border-left-color: var(--accent-cyan);
}

.file-item.text-file .file-name {
  color: var(--text-primary);
}

.file-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.dir-item .file-icon {
  color: var(--accent-cyan);
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dir-tag {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
}

.file-size {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
}

.file-date {
  font-size: 10px;
  color: var(--text-muted);
}

.file-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.file-item:hover .file-actions {
  opacity: 1;
}

.file-actions .ref-icon {
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.2s ease;
}

.ref-icon:hover {
  color: #10b981;
}
</style>