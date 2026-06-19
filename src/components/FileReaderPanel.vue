<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Close, Document, FullScreen, Aim, FolderOpened } from '@element-plus/icons-vue'
import { useGraphStore } from '../stores/graphStore'
import { readFileContent, revealInFileManager } from '../services/graphApi'
import { useMarkdown } from '../composables/useMarkdown'

const store = useGraphStore()
const { md, renderMermaidInRoot } = useMarkdown()

const content = ref<string>('')
const loading = ref(false)
const error = ref<string | null>(null)
const contentFullWidth = ref(false)
const contentRef = ref<HTMLElement | null>(null)

async function loadFile(path: string) {
  loading.value = true
  error.value = null
  content.value = ''
  try {
    content.value = await readFileContent(path)
  } catch (e: any) {
    console.warn('[FileReader] Failed to read file:', e)
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

watch(() => store.activeFilePath, async (path) => {
  if (path) {
    await loadFile(path)
    await nextTick()
    if (contentRef.value) {
      await renderMermaidInRoot(contentRef.value)
    }
  }
}, { immediate: true })

function renderMd(text: string): string {
  if (!text) return ''
  try {
    return md.render(text)
  } catch {
    return text
  }
}

function getFileName(path: string): string {
  return path?.split('/').pop() || path
}

function handleClose() {
  store.closeFileViewer()
}

function toggleWidth() {
  contentFullWidth.value = !contentFullWidth.value
}

async function handleReveal() {
  if (!store.activeFilePath) return
  try {
    await revealInFileManager(store.activeFilePath)
  } catch (e: any) {
    console.warn('[FileReader] Failed to reveal file:', e)
  }
}
</script>

<template>
  <div class="frp-wrapper">
    <!-- Header -->
    <header class="frp-header">
      <div class="frp-title">
        <el-icon :size="16"><Document /></el-icon>
        <span :title="store.activeFilePath || ''" class="frp-filename">
          {{ getFileName(store.activeFilePath || '') }}
        </span>
      </div>
      <div class="frp-header-actions">
        <button
          class="frp-action-btn"
          title="在文件管理器中显示"
          @click="handleReveal"
        >
          <el-icon :size="14"><FolderOpened /></el-icon>
        </button>
        <button
          class="frp-action-btn"
          :title="contentFullWidth ? '切换为居中显示' : '切换为撑满容器'"
          @click="toggleWidth"
        >
          <el-icon :size="14"><Aim v-if="contentFullWidth" /><FullScreen v-else /></el-icon>
        </button>
        <button class="frp-close" @click="handleClose" title="关闭文件">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </header>

    <!-- Content area -->
    <div class="frp-body">
      <!-- Loading -->
      <div v-if="loading" class="frp-loading">
        <div class="loading-bar" />
        <span>加载中...</span>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="frp-error">
        <p class="frp-error-title">无法读取文件</p>
        <p class="frp-error-msg">{{ error }}</p>
      </div>

      <!-- Rendered markdown -->
      <div v-else ref="contentRef" class="frp-content" :class="{ 'is-centered': !contentFullWidth }" v-html="renderMd(content)" />
    </div>
  </div>
</template>

<style scoped>
.frp-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

/* Header */
.frp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  min-height: 40px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.frp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-cyan);
  font-size: 13px;
  font-weight: 600;
  min-width: 0;
}
.frp-filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.frp-close {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 6px; cursor: pointer;
  transition: all .15s;
  flex-shrink: 0;
}
.frp-close:hover {
  color: #f87171;
  background: rgba(239, 68, 68, 0.12);
}
.frp-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.frp-action-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 6px; cursor: pointer;
  transition: all .15s;
  flex-shrink: 0;
}
.frp-action-btn:hover {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.12);
}

/* Body */
.frp-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  background: var(--bg-primary);
}

/* Loading */
.frp-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--text-muted);
  font-size: 13px;
}
.loading-bar {
  width: 32px;
  height: 3px;
  background: var(--accent-cyan);
  border-radius: 2px;
  animation: load-pulse 1s ease-in-out infinite;
}
@keyframes load-pulse {
  0%, 100% { opacity: .3; width: 32px; }
  50% { opacity: 1; width: 48px; }
}

/* Error */
.frp-error {
  text-align: center;
  padding: 32px 0;
}
.frp-error-title {
  color: #f87171;
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 8px;
}
.frp-error-msg {
  color: var(--text-muted);
  font-size: 12px;
  margin: 0;
}

/* Markdown content */
.frp-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
}
.frp-content.is-centered {
  max-width: 800px;
  margin: 0 auto;
}
.frp-content :deep(h1) {
  font-size: 20px; font-weight: 700;
  margin: 24px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color);
}
.frp-content :deep(h2) {
  font-size: 17px; font-weight: 700;
  margin: 20px 0 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}
.frp-content :deep(h3) {
  font-size: 15px; font-weight: 600;
  margin: 16px 0 8px;
}
.frp-content :deep(h4) {
  font-size: 14px; font-weight: 600;
  margin: 12px 0 6px;
}
.frp-content :deep(p) {
  margin: 8px 0;
}
.frp-content :deep(ul),
.frp-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}
.frp-content :deep(li) {
  margin: 4px 0;
}
.frp-content :deep(pre) {
  margin: 12px 0;
  padding: 12px 16px;
  background: rgba(0,0,0,.25);
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.6;
}
.frp-content :deep(code) {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  background: rgba(255,255,255,.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: .92em;
}
.frp-content :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
}
.frp-content :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--accent-cyan);
  color: var(--text-muted);
}
.frp-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  font-size: 13px;
}
.frp-content :deep(th),
.frp-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  text-align: left;
}
.frp-content :deep(th) {
  background: rgba(255,255,255,.04);
  font-weight: 600;
}
.frp-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 8px 0;
}
.frp-content :deep(a) {
  color: var(--accent-cyan);
  text-decoration: underline;
}
.frp-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 16px 0;
}
</style>
