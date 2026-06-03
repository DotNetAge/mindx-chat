<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Folder,
  Document,
  ArrowUp,
  Loading,
  RefreshRight,
  House,
  Position
} from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'
import type { FSEntry } from '../types/websocket'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  embedded: {
    type: Boolean,
    default: false
  },
  initialPath: {
    type: String,
    default: ''
  },
  currentSelection: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:visible', 'select', 'update:currentSelection'])

const connectionStore = useConnectionStore()

const currentPath = ref('')
const pathInput = ref('')
const entries = ref<FSEntry[]>([])
const loading = ref(false)
const homePrefix = ref('')

function shortenPath(absPath: string): string {
  if (!absPath) return ''
  if (homePrefix.value && absPath.startsWith(homePrefix.value)) {
    return '~' + absPath.slice(homePrefix.value.length)
  }
  return absPath
}

function expandPath(displayPath: string): string {
  if (!displayPath) return ''
  if (displayPath.startsWith('~/') || displayPath === '~') {
    return homePrefix.value + displayPath.slice(1)
  }
  if (displayPath.startsWith('~')) {
    return homePrefix.value + displayPath.slice(1)
  }
  return displayPath
}

const displayPath = computed(() => shortenPath(currentPath.value))
const displayPathInput = computed({
  get: () => shortenPath(pathInput.value),
  set: (val: string) => { pathInput.value = expandPath(val) }
})

const sortedEntries = computed(() => {
  if (!Array.isArray(entries.value)) return []
  return entries.value
    .filter(e => e.is_dir && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const showRootLink = computed(() => {
  if (!currentPath.value) return false
  const disp = shortenPath(currentPath.value)
  return disp.startsWith('~/') && disp.length > 2
})

const breadcrumbSegments = computed(() => {
  if (!currentPath.value) return []
  const disp = shortenPath(currentPath.value)
  if (disp === '~') return []
  if (disp.startsWith('~/')) {
    const rest = disp.slice(2)
    if (!rest) return []
    const parts = rest.split('/').filter(Boolean)
    return parts.map((part, idx) => {
      const fullPath = '~/' + parts.slice(0, idx + 1).join('/')
      return { label: part, path: fullPath }
    })
  }
  const parts = disp.split('/').filter(Boolean)
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
  try {
    if (!connectionStore.isConnected) {
      throw new Error('未连接到 MindX 服务，请先建立连接')
    }
    entries.value = await connectionStore.fetchFSList(path)
    currentPath.value = path
    pathInput.value = path
    if (!homePrefix.value && path) {
      const parts = path.split('/').filter(Boolean)
      if (parts.length > 1) {
        parts.pop()
        homePrefix.value = '/' + parts.join('/')
      }
    }
    emit('update:currentSelection', path)
  } catch (err: any) {
    ElMessage.error({ message: err?.message || '无法访问该路径', duration: 3000 })
  } finally {
    loading.value = false
  }
}

async function handleOpen() {
  loading.value = true
  try {
    let targetPath = props.initialPath
    if (!targetPath) {
      if (!connectionStore.isConnected) {
        throw new Error('未连接到 MindX 服务，请先建立连接')
      }
      targetPath = await connectionStore.fetchFSHome()
    }
    if (targetPath) {
      const parts = targetPath.split('/').filter(Boolean)
      if (parts.length > 1) {
        parts.pop()
        homePrefix.value = '/' + parts.join('/')
      }
      await fetchFSList(targetPath)
    } else {
      ElMessage.error({ message: '无法获取用户主目录', duration: 3000 })
    }
  } catch (err: any) {
    ElMessage.error({ message: err?.message || '获取主目录失败，请检查连接状态', duration: 3000 })
    loading.value = false
  }
}

function handleClose() {
  emit('update:visible', false)
}

function handleSelect() {
  emit('select', currentPath.value)
  emit('update:visible', false)
}

function navigateTo(path: string) {
  fetchFSList(expandPath(path))
}

function goUp() {
  const disp = shortenPath(currentPath.value)
  if (disp === '~') return
  const parts = disp.replace(/\/+$/, '').split('/').filter(Boolean)
  parts.pop()
  const parentDisp = parts.length > 0 ? '~/' + parts.join('/') : '~'
  fetchFSList(expandPath(parentDisp))
}

function goToInputPath() {
  const target = pathInput.value.trim()
  if (!target) return
  fetchFSList(expandPath(target))
}

function handleEntryClick(entry: FSEntry) {
  if (entry.is_dir) {
    fetchFSList(entry.path)
  }
}

function refresh() {
  if (currentPath.value) {
    fetchFSList(currentPath.value)
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    handleOpen()
  }
}, { immediate: true })
</script>

<template>
  <el-dialog
    v-if="!embedded"
    :model-value="visible"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
    title=""
    width="640px"
    class="directory-browser-dialog"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
  >
    <template #header>
      <div class="dialog-title-bar">
        <span class="dialog-title-icon">📁</span>
        <span class="dialog-title-text">选择工作目录</span>
      </div>
    </template>

    <div class="browser-body">
      <div class="path-input-row">
        <el-icon class="home-icon" @click="handleOpen"><House /></el-icon>
        <el-input
          v-model="displayPathInput"
          placeholder="输入路径 (支持 ~ 缩写)..."
          size="default"
          class="path-input"
          @keyup.enter="goToInputPath"
        />
        <el-button size="default" class="go-btn" @click="goToInputPath">
          <el-icon><Position /></el-icon>
          Go
        </el-button>
        <el-button size="default" class="refresh-btn" :loading="loading" @click="refresh">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
      </div>

      <div class="breadcrumb-row">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item v-if="showRootLink">
            <a class="breadcrumb-link" @click.prevent="navigateTo('~')">~</a>
          </el-breadcrumb-item>
          <el-breadcrumb-item
            v-for="seg in breadcrumbSegments"
            :key="seg.path"
          >
            <a class="breadcrumb-link" @click.prevent="navigateTo(seg.path)">{{ seg.label }}</a>
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <div class="entry-list-wrapper">
        <div v-if="loading && entries.length === 0" class="loading-overlay">
          <el-icon class="loading-spinner" :size="32"><Loading /></el-icon>
          <span>加载中...</span>
        </div>

        <table v-else class="entry-table">
          <tbody>
            <tr class="entry-row dir-entry" @click="goUp" @dblclick="goUp">
              <td class="entry-name-cell">
                <span class="entry-icon">📁</span>
                <span class="entry-name">..</span>
                <span class="entry-hint">(上级目录)</span>
              </td>
              <td class="entry-size-cell"></td>
              <td class="entry-date-cell"></td>
            </tr>

            <tr
              v-for="entry in sortedEntries"
              :key="entry.path"
              class="entry-row"
              :class="{ 'dir-entry': entry.is_dir, 'file-entry': !entry.is_dir }"
              @click="handleEntryClick(entry)"
              @dblclick="handleEntryClick(entry)"
            >
              <td class="entry-name-cell">
                <span class="entry-icon">{{ entry.is_dir ? '📁' : '📄' }}</span>
                <span class="entry-name" :title="entry.name">{{ entry.name }}</span>
              </td>
              <td class="entry-size-cell">
                <span v-if="entry.is_dir" class="dir-tag">&lt;dir&gt;</span>
                <span v-else class="file-size">{{ formatSize(entry.size) }}</span>
              </td>
              <td class="entry-date-cell">
                <span class="mod-date">{{ formatDate(entry.mod_time) }}</span>
              </td>
            </tr>

            <tr v-if="!loading && sortedEntries.length === 0">
              <td colspan="3" class="empty-cell">
                <span>此目录为空</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="current-path-display">
          <span class="path-label">当前:</span>
          <code class="path-code" :title="currentPath">{{ displayPath || '/' }}</code>
        </div>
        <div class="action-buttons">
          <el-button class="cancel-btn" @click="handleClose">取消</el-button>
          <el-button type="primary" class="select-btn" @click="handleSelect">
            ✓ 选择此目录
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>

  <div v-else class="embedded-browser">
    <div class="path-input-row">
      <el-icon class="home-icon" @click="handleOpen"><House /></el-icon>
      <el-input
        v-model="displayPathInput"
        placeholder="输入路径 (支持 ~ 缩写)..."
        size="default"
        class="path-input"
        @keyup.enter="goToInputPath"
      />
      <el-button size="default" class="go-btn" @click="goToInputPath">
        <el-icon><Position /></el-icon>
        Go
      </el-button>
      <el-button size="default" class="refresh-btn" :loading="loading" @click="refresh">
        <el-icon><RefreshRight /></el-icon>
      </el-button>
    </div>

    <div class="breadcrumb-row">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item v-if="showRootLink">
          <a class="breadcrumb-link" @click.prevent="navigateTo('~')">~</a>
        </el-breadcrumb-item>
        <el-breadcrumb-item
          v-for="seg in breadcrumbSegments"
          :key="seg.path"
        >
          <a class="breadcrumb-link" @click.prevent="navigateTo(seg.path)">{{ seg.label }}</a>
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <div class="entry-list-wrapper">
      <div v-if="loading && entries.length === 0" class="loading-overlay">
        <el-icon class="loading-spinner" :size="32"><Loading /></el-icon>
        <span>加载中...</span>
      </div>

      <table v-else class="entry-table">
        <tbody>
          <tr class="entry-row dir-entry" @click="goUp" @dblclick="goUp">
            <td class="entry-name-cell">
              <span class="entry-icon">📁</span>
              <span class="entry-name">..</span>
              <span class="entry-hint">(上级目录)</span>
            </td>
            <td class="entry-size-cell"></td>
            <td class="entry-date-cell"></td>
          </tr>

          <tr
            v-for="entry in sortedEntries"
            :key="entry.path"
            class="entry-row"
            :class="{ 'dir-entry': entry.is_dir, 'file-entry': !entry.is_dir }"
            @click="handleEntryClick(entry)"
            @dblclick="handleEntryClick(entry)"
          >
            <td class="entry-name-cell">
              <span class="entry-icon">{{ entry.is_dir ? '📁' : '📄' }}</span>
              <span class="entry-name" :title="entry.name">{{ entry.name }}</span>
            </td>
            <td class="entry-size-cell">
              <span v-if="entry.is_dir" class="dir-tag">&lt;dir&gt;</span>
              <span v-else class="file-size">{{ formatSize(entry.size) }}</span>
            </td>
            <td class="entry-date-cell">
              <span class="mod-date">{{ formatDate(entry.mod_time) }}</span>
            </td>
          </tr>

          <tr v-if="!loading && sortedEntries.length === 0">
            <td colspan="3" class="empty-cell">
              <span>此目录为空</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.directory-browser-dialog :deep(.el-overlay) {
  background: rgba(0, 0, 0, 0.6);
}

.directory-browser-dialog :deep(.el-dialog) {
  background: #111827;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 14px;
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #e2e8f0;
}

.directory-browser-dialog :deep(.el-dialog__header) {
  padding: 16px 24px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.8);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(59, 130, 246, 0.05));
}

.directory-browser-dialog :deep(.el-dialog__headerbtn) {
  color: #94a3b8;
}

.directory-browser-dialog :deep(.el-dialog__headerbtn:hover) {
  color: #e2e8f0;
}

.directory-browser-dialog :deep(.el-dialog__body) {
  padding: 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #111827;
}

.directory-browser-dialog :deep(.el-dialog__footer) {
  padding: 14px 24px;
  border-top: 1px solid rgba(55, 65, 81, 0.8);
  background: #0f172a;
}

.dialog-title-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog-title-icon {
  font-size: 20px;
}

.dialog-title-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}

.browser-body,
.embedded-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: calc(100vh - 200px);
  overflow: hidden;
}

.path-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.home-icon {
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  transition: color 0.2s ease;
  flex-shrink: 0;
}

.home-icon:hover {
  color: var(--accent-cyan);
}

.path-input {
  flex: 1;
}

.path-input :deep(.el-input__wrapper) {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: none;
  transition: all 0.2s ease;
}

.path-input :deep(.el-input__wrapper:hover),
.path-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.1);
}

.path-input :deep(.el-input__inner) {
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}

.path-input :deep(.el-input__inner::placeholder) {
  color: var(--text-muted);
}

.go-btn {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 8px 14px;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.go-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
}

.refresh-btn {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 8px 10px;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.refresh-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
}

.breadcrumb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-color);
  min-height: 36px;
  overflow-x: auto;
}

.breadcrumb-row :deep(.el-breadcrumb) {
  flex: 1;
  min-width: 0;
}

.breadcrumb-row :deep(.el-breadcrumb__item) {
  font-size: 13px;
}

.breadcrumb-row :deep(.el-breadcrumb__separator) {
  color: var(--text-muted);
  font-weight: 600;
}

.breadcrumb-link {
  color: var(--accent-cyan);
  text-decoration: none;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  transition: opacity 0.15s ease;
  white-space: nowrap;
}

.breadcrumb-link:hover {
  opacity: 0.75;
  text-decoration: underline;
}

.entry-list-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  max-height: 420px;
}

.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 240px;
  color: var(--text-muted);
  font-size: 14px;
}

.loading-spinner {
  animation: spin 1s linear infinite;
  color: var(--accent-cyan);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.entry-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.entry-row {
  display: table-row;
  cursor: pointer;
  transition: background 0.15s ease;
}

.entry-row:hover {
  background: var(--bg-hover);
}

.entry-row.dir-entry .entry-name {
  color: var(--accent-cyan);
  font-weight: 600;
}

.entry-row.file-entry .entry-name {
  color: var(--text-secondary);
}

.entry-name-cell {
  padding: 9px 16px;
  display: table-cell;
  width: 55%;
  vertical-align: middle;
}

.entry-size-cell {
  padding: 9px 12px;
  display: table-cell;
  width: 18%;
  vertical-align: middle;
  text-align: right;
}

.entry-date-cell {
  padding: 9px 16px;
  display: table-cell;
  width: 27%;
  vertical-align: middle;
  text-align: right;
}

.entry-icon {
  font-size: 16px;
  margin-right: 8px;
  flex-shrink: 0;
  display: inline-block;
}

.entry-name {
  font-size: 13px;
  word-break: break-all;
  display: inline;
}

.entry-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 8px;
  font-style: italic;
}

.dir-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.file-size {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.mod-date {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.empty-cell {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 13px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.current-path-display {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.path-label {
  flex-shrink: 0;
}

.path-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.08);
  padding: 2px 8px;
  border-radius: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
  display: inline-block;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 8px;
  font-weight: 500;
  padding: 8px 20px;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
  background: var(--bg-hover);
}

.select-btn {
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  border: none;
  color: white;
  border-radius: 8px;
  font-weight: 600;
  padding: 8px 20px;
  letter-spacing: 0.3px;
  transition: all 0.25s ease;
  box-shadow: 0 4px 15px rgba(6, 182, 212, 0.25);
}

.select-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px rgba(6, 182, 212, 0.4);
}
</style>
