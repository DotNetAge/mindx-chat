<script setup lang="ts">
import { computed, ref } from 'vue'
import { html } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'

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
    outputFormat: props.sideBySide ? 'side-by-side' : 'line-by-file',
    maxLineLengthHighlight: 10000,
  })
})
</script>

<template>
  <div class="diff-view-block">
    <div class="diff-header" @click="showDiff = !showDiff">
      <span class="file-icon">{{ isNew ? '📄' : '✏️' }}</span>
      <span class="file-path">{{ filePath }}</span>
      <span class="diff-stats">
        <el-tag size="small" type="success" effect="plain">+{{ additions }}</el-tag>
        <el-tag size="small" type="danger" effect="plain">-{{ deletions }}</el-tag>
      </span>
      <el-tag size="small" :type="isNew ? 'warning' : 'info'" effect="plain">
        {{ isNew ? '新增' : '修改' }}
      </el-tag>
      <span class="expand-icon">{{ showDiff ? '▲' : '▼' }}</span>
    </div>
    <div v-if="showDiff" class="diff-body" v-html="diffHtml"></div>
  </div>
</template>

<style scoped>
.diff-view-block {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  margin: 6px 0;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.06);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.diff-header:hover {
  background: rgba(59, 130, 246, 0.1);
}

.file-path {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
}

.diff-stats {
  display: flex;
  gap: 4px;
}

.expand-icon {
  color: var(--text-muted);
  font-size: 10px;
  margin-left: 4px;
}

.diff-body {
  border-top: 1px solid var(--border-color);
  max-height: 500px;
  overflow-y: auto;
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
}

.diff-body :deep(.d2h-code-side-line) {
  font-size: 11px;
  line-height: 1.5;
}

.diff-body :deep(.d2h-code-line-ctn) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.diff-body :deep(.d2h-del) {
  background-color: rgba(239, 68, 68, 0.12);
}

.diff-body :deep(.d2h-ins) {
  background-color: rgba(16, 185, 129, 0.12);
}

.diff-body :deep(.d2h-info) {
  background-color: rgba(100, 116, 139, 0.08);
  color: #94a3b8;
}
</style>
