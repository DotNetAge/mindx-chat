<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { html } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'

const { t } = useI18n()

const props = defineProps<{
  filePath: string
  diff: string
  additions: number
  deletions: number
  isNew: boolean
  sideBySide?: boolean
}>()

const showDiff = ref(false)

const diffHtml = computed(() => {
  if (!props.diff) return ''
  return html(props.diff, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: props.sideBySide ? 'side-by-side' : 'line-by-line',
    maxLineLengthHighlight: 10000,
  })
})
</script>

<template>
  <div class="diff-view-block">
    <div class="diff-header" @click="showDiff = !showDiff">
      <div class="header-icon">
        <svg v-if="isNew" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
        </svg>
      </div>
      <span class="file-path">{{ filePath }}</span>
      <span class="diff-stats">
        <span class="stat stat-add">+{{ additions }}</span>
        <span class="stat stat-del">-{{ deletions }}</span>
      </span>
      <span class="file-type-tag">{{ isNew ? t('diff.added') : t('diff.modified') }}</span>
      <span class="expand-icon" :class="{ expanded: showDiff }">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </span>
    </div>
    <transition name="collapse">
      <div v-if="showDiff" class="diff-body" v-html="diffHtml"></div>
    </transition>
  </div>
</template>

<style scoped>
.diff-view-block {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.06), rgba(59, 130, 246, 0.04));
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(6, 182, 212, 0.08);
  margin: 6px 0;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(6, 182, 212, 0.06);
  border-bottom: 1px solid rgba(6, 182, 212, 0.15);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
}

.diff-header:hover {
  background: rgba(6, 182, 212, 0.10);
}

.header-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-icon svg {
  width: 14px;
  height: 14px;
}

.file-path {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-stats {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.stat {
  font-size: 11px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  padding: 1px 7px;
  border-radius: 4px;
  line-height: 1.6;
}

.stat-add {
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
}

.stat-del {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

.file-type-tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.10);
  padding: 1px 8px;
  border-radius: 4px;
  line-height: 1.6;
  flex-shrink: 0;
}

.expand-icon {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  transition: transform 0.25s ease;
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.diff-body {
  max-height: 360px;
  overflow-y: auto;
  overflow-x: auto;
}

/* 展开/折叠动画 */
.collapse-enter-active {
  animation: slideInUp 0.25s ease;
}

.collapse-leave-active {
  animation: slideInUp 0.2s ease reverse;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* diff2html 暗色主题适配 */
.diff-body :deep(.d2h-wrapper) {
  background: transparent;
}

.diff-body :deep(.d2h-file-header) {
  display: none;
}

.diff-body :deep(.d2h-code-line) {
  font-size: 11px;
  line-height: 1.5;
  color: #e2e8f0;
}

.diff-body :deep(.d2h-code-side-line) {
  font-size: 11px;
  line-height: 1.5;
  color: #e2e8f0;
}

.diff-body :deep(.d2h-code-line-ctn) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #e2e8f0;
}

/* 行号列：背景较深、字色足够亮 */
.diff-body :deep(.d2h-info) {
  background-color: rgba(15, 23, 42, 0.6);
  color: #cbd5e1;
}

.diff-body :deep(.d2h-info-contents) {
  color: #cbd5e1;
}

/* 删除行：高亮浅红背景，黑色字保证可读 */
.diff-body :deep(.d2h-del) {
  background-color: rgba(239, 68, 68, 0.28);
  color: #000;
}

.diff-body :deep(.d2h-del-contents),
.diff-body :deep(.d2h-del .d2h-code-line-ctn),
.diff-body :deep(.d2h-del .d2h-code-line) {
  color: #000;
}

/* 新增行：高亮浅绿背景，黑色字保证可读 */
.diff-body :deep(.d2h-ins) {
  background-color: rgba(16, 185, 129, 0.30);
  color: #000;
}

.diff-body :deep(.d2h-ins-contents),
.diff-body :deep(.d2h-ins .d2h-code-line-ctn),
.diff-body :deep(.d2h-ins .d2h-code-line) {
  color: #000;
}

/* 变更标记（@ 之类）使用黑色字更清晰 */
.diff-body :deep(.d2h-change) {
  color: #000;
  background-color: rgba(251, 191, 36, 0.6);
}
</style>
