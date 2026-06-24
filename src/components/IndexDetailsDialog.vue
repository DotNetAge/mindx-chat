<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElDialog, ElMessage, ElTag, ElButton, ElScrollbar, ElProgress } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useGraphStore } from '../stores/graphStore'
import { filewatchRetryFailed, filewatchIgnoreFailed } from '../services/graphApi'
import type { FailedFileRecord, CompletedFileRecord } from '../services/graphApi'

const { t } = useI18n()
const graphStore = useGraphStore()

const props = defineProps<{
  visible: boolean
}>()
const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'refreshed'): void
}>()

const retrying = ref<Record<string, boolean>>({})

/** Flatten all directory index states from the filewatch status. */
const dirStates = computed(() => {
  const st = graphStore.filewatchStatus?.index_state
  if (!st) return []
  return Object.values(st)
})

/** Total progress across all directories. */
const totalProgress = computed(() => {
  let total = 0, indexed = 0, failed = 0
  for (const s of dirStates.value) {
    total += s.total_files
    indexed += s.indexed_files
    failed += (s.failed_files || []).length
  }
  return { total, indexed, failed, percent: total > 0 ? Math.round((indexed / total) * 100) : 0 }
})

/** All failed files across all directories. */
const allFailedFiles = computed(() => {
  const result: Array<{ dir: string; file: FailedFileRecord }> = []
  for (const s of dirStates.value) {
    for (const f of (s.failed_files || [])) {
      result.push({ dir: s.dir, file: f })
    }
  }
  return result
})

/** All completed files across all directories (for summary count). */
const allCompletedCount = computed(() => {
  let count = 0
  for (const s of dirStates.value) {
    count += (s.completed_files || []).length
  }
  return count
})

/** Total entity & relationship counts across all directories. */
const totalEntityStats = computed(() => {
  let entities = 0, rels = 0
  for (const s of dirStates.value) {
    entities += s.entities_created || 0
    rels += s.rels_created || 0
  }
  return { entities, rels }
})

/** Total elapsed time (ms) across all directories. */
const totalElapsedMs = computed(() => {
  let total = 0
  for (const s of dirStates.value) {
    total += s.total_elapsed_ms || 0
  }
  return total
})

/** Whether any directory is currently being indexed. */
const isIndexing = computed(() => {
  return dirStates.value.some(s => s.state === 'indexing')
})

/** Retry a single failed file. */
async function handleRetry(dir: string, filePath: string) {
  const key = dir + '::' + filePath
  retrying.value[key] = true
  try {
    const res = await filewatchRetryFailed(dir, [filePath])
    if (res.status === 'ok') {
      ElMessage.success(t('sidebar.indexing.retrySuccess', { file: filePath }))
    } else if (res.status === 'partial') {
      ElMessage.warning(t('sidebar.indexing.retryPartial', { file: filePath, errors: res.errors }))
    }
    emit('refreshed')
    await graphStore.refreshFilewatchStatus()
  } catch (err: any) {
    ElMessage.error(t('sidebar.indexing.retryError', { file: filePath, error: err.message || String(err) }))
  } finally {
    retrying.value[key] = false
  }
}

/** Retry all failed files. */
async function handleRetryAll() {
  for (const item of allFailedFiles.value) {
    await handleRetry(item.dir, item.file.path)
  }
}

/** Ignore a single failed file. */
async function handleIgnore(dir: string, filePath: string) {
  try {
    await filewatchIgnoreFailed(dir, [filePath])
    ElMessage.info(t('sidebar.indexing.ignored', { file: filePath }))
    emit('refreshed')
    await graphStore.refreshFilewatchStatus()
  } catch (err: any) {
    ElMessage.error(t('sidebar.indexing.ignoreError', { file: filePath, error: err.message || String(err) }))
  }
}

/** Ignore all failed files. */
async function handleIgnoreAll() {
  // Group by dir
  const byDir = new Map<string, string[]>()
  for (const item of allFailedFiles.value) {
    const list = byDir.get(item.dir) || []
    list.push(item.file.path)
    byDir.set(item.dir, list)
  }
  for (const [dir, files] of byDir.entries()) {
    try {
      await filewatchIgnoreFailed(dir, files)
    } catch (err: any) {
      ElMessage.error(t('sidebar.indexing.ignoreError', { file: files.join(', '), error: err.message || String(err) }))
    }
  }
  ElMessage.info(t('sidebar.indexing.ignoredAll', { count: allFailedFiles.value.length }))
  emit('refreshed')
  await graphStore.refreshFilewatchStatus()
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString()
}
</script>

<template>
  <ElDialog
    :model-value="props.visible"
    @update:model-value="emit('update:visible', $event)"
    :title="t('sidebar.indexing.dialogTitle')"
    width="620px"
    :close-on-click-modal="true"
    class="index-details-dialog"
  >
    <ElScrollbar max-height="500px">
      <!-- Overall summary -->
      <div class="summary-section">
        <!-- Indexing in progress: show animated progress bar -->
        <div v-if="isIndexing" class="summary-row indexing-active-row">
          <span class="summary-label">{{ t('sidebar.indexing.progress') }}:</span>
          <div class="progress-inline">
            <el-icon class="is-loading index-spinner"><Loading /></el-icon>
            <ElProgress
              :percentage="totalProgress.percent"
              :stroke-width="8"
              :show-text="false"
              color="#a78bfa"
              style="width: 180px; flex-shrink: 0;"
            />
            <span class="progress-inline-text">
              {{ totalProgress.indexed }} / {{ totalProgress.total }}
              ({{ totalProgress.percent }}%)
            </span>
          </div>
        </div>
        <!-- Completed or failed: show static numbers -->
        <div v-else class="summary-row">
          <span class="summary-label">{{ t('sidebar.indexing.progress') }}:</span>
          <span class="summary-value">
            {{ totalProgress.indexed }} / {{ totalProgress.total }}
            ({{ totalProgress.percent }}%)
          </span>
        </div>
        <div class="summary-row" v-if="totalProgress.failed > 0">
          <span class="summary-label">{{ t('sidebar.indexing.failed') }}:</span>
          <span class="summary-value failed-count">{{ totalProgress.failed }}</span>
        </div>
        <div class="summary-row" v-if="totalEntityStats.entities > 0 || totalEntityStats.rels > 0">
          <span class="summary-label">{{ t('kgViewer.entities') || '实体' }}:</span>
          <span class="summary-value entity-count">{{ totalEntityStats.entities }}</span>
          <span class="summary-label" style="margin-left: 16px">{{ t('kgViewer.relationships') || '关系' }}:</span>
          <span class="summary-value rel-count">{{ totalEntityStats.rels }}</span>
        </div>
        <div class="summary-row" v-if="totalElapsedMs > 0 || !isIndexing">
          <span class="summary-label">{{ t('sidebar.indexing.totalElapsed') || '总耗时' }}:</span>
          <span class="summary-value elapsed-count">{{ formatElapsed(totalElapsedMs) }}</span>
        </div>
      </div>

      <!-- Per-directory states -->
      <div class="dir-section" v-for="st in dirStates" :key="st.dir">
        <div class="dir-header">
          <span class="dir-name" :title="st.dir">{{ st.dir.split('/').pop() }}</span>
          <ElTag :type="st.state === 'completed' ? 'success' : st.state === 'failed' ? 'danger' : 'warning'" size="small">
            {{ st.state }}
          </ElTag>
        </div>
        <div class="dir-progress">
          <span class="dir-stats">
            {{ st.indexed_files }} / {{ st.total_files }} files
            <span v-if="st.failed_files?.length">, {{ st.failed_files.length }} failed</span>
          </span>
          <span class="dir-entity-stats" v-if="(st.entities_created || 0) > 0 || (st.rels_created || 0) > 0">
            · {{ st.entities_created || 0 }} {{ t('kgViewer.entities') || '实体' }} / {{ st.rels_created || 0 }} {{ t('kgViewer.relationships') || '关系' }}
          </span>
          <span class="dir-elapsed-stats" v-if="(st.total_elapsed_ms || 0) > 0">
            · {{ formatElapsed(st.total_elapsed_ms || 0) }}
          </span>
        </div>

        <!-- Failed files for this directory -->
        <div v-if="st.failed_files?.length" class="failed-section">
          <div class="failed-header">{{ t('sidebar.indexing.failedFiles') }}:</div>
          <div class="failed-item" v-for="ff in st.failed_files" :key="ff.path">
            <div class="failed-info">
              <span class="failed-path" :title="ff.path">{{ ff.path }}</span>
              <span class="failed-error">{{ ff.error }}</span>
              <span class="failed-elapsed">{{ formatElapsed(ff.elapsed_ms) }}</span>
            </div>
            <div class="failed-actions">
              <ElButton
                size="small"
                type="primary"
                :loading="retrying[st.dir + '::' + ff.path]"
                @click="handleRetry(st.dir, ff.path)"
              >
                {{ t('sidebar.indexing.retry') }}
              </ElButton>
              <ElButton size="small" @click="handleIgnore(st.dir, ff.path)">
                {{ t('sidebar.indexing.ignore') }}
              </ElButton>
            </div>
          </div>
        </div>

        <!-- Completed files for this directory (always visible, not collapsed) -->
        <div v-if="st.completed_files?.length" class="completed-section">
          <div class="completed-header">
            <span>{{ t('sidebar.indexing.completedFiles') }}</span>
            <ElTag type="success" size="small">{{ st.completed_files.length }}</ElTag>
          </div>
          <div class="completed-list">
            <div class="completed-item" v-for="cf in st.completed_files" :key="cf.path">
              <span class="completed-path" :title="cf.path">{{ cf.path }}</span>
              <span class="completed-meta">
                {{ cf.chunks }} {{ t('kgViewer.knowledgePoints') || '知识点' }}<template v-if="cf.elapsed_ms > 0"> · {{ formatElapsed(cf.elapsed_ms) }}</template>
              </span>
            </div>
          </div>
        </div>

        <div v-if="st.error" class="dir-error">
          {{ st.error }}
        </div>
      </div>

      <!-- Batch actions -->
      <div class="batch-actions" v-if="allFailedFiles.length > 0">
        <ElButton type="primary" @click="handleRetryAll">
          {{ t('sidebar.indexing.retryAll', { count: allFailedFiles.length }) }}
        </ElButton>
        <ElButton @click="handleIgnoreAll">
          {{ t('sidebar.indexing.ignoreAll', { count: allFailedFiles.length }) }}
        </ElButton>
      </div>

      <!-- Empty state -->
      <div v-if="dirStates.length === 0" class="empty-state">
        {{ t('sidebar.indexing.noData') }}
      </div>
    </ElScrollbar>
  </ElDialog>
</template>

<style scoped>
.summary-section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;
}
.summary-label {
  color: #94a3b8;
  min-width: 80px;
}
.indexing-active-row {
  align-items: center !important;
}
.progress-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.index-spinner {
  font-size: 16px;
  color: #a78bfa;
  flex-shrink: 0;
}
.progress-inline-text {
  font-weight: 600;
  color: #f1f5f9;
  font-size: 13px;
  white-space: nowrap;
}
.summary-value {
  font-weight: 600;
  color: #f1f5f9;
}
.failed-count {
  color: #ef4444;
}
.entity-count {
  color: #34d399;
}
.rel-count {
  color: #60a5fa;
}
.elapsed-count {
  color: #fbbf24;
}
.dir-section {
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 8px;
}
.dir-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.dir-name {
  font-weight: 600;
  font-size: 14px;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
}
.dir-progress {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}
.dir-stats {
  font-size: 12px;
}
.dir-entity-stats {
  font-size: 11px;
  color: #64748b;
}
.dir-elapsed-stats {
  font-size: 11px;
  color: #fbbf24;
}
.failed-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
}
.failed-header {
  font-size: 12px;
  font-weight: 600;
  color: #ef4444;
  margin-bottom: 6px;
}
.failed-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 4px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(55, 65, 81, 0.3);
  border-radius: 6px;
  font-size: 12px;
}
.failed-item:hover {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(55, 65, 81, 0.5);
}
.failed-info {
  flex: 1;
  min-width: 0;
}
.failed-path {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.failed-error {
  display: block;
  color: #ef4444;
  font-size: 11px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.failed-elapsed {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-top: 1px;
}
.failed-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.dir-error {
  margin-top: 6px;
  font-size: 12px;
  color: #ef4444;
}
.completed-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
}
.completed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: #34d399;
  margin-bottom: 6px;
}
.completed-list {
  max-height: 200px;
  overflow-y: auto;
}
.completed-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}
.completed-path {
  font-family: 'JetBrains Mono', monospace;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.completed-meta {
  color: #64748b;
  flex-shrink: 0;
  font-size: 11px;
}
.batch-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(55, 65, 81, 0.5);
}
.empty-state {
  text-align: center;
  color: #64748b;
  padding: 32px 0;
  font-size: 13px;
}
</style>

<style>
.index-details-dialog .el-dialog {
  background: #111827;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}
.index-details-dialog .el-dialog__header {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.index-details-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}
.index-details-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}
.index-details-dialog .el-dialog__body {
  padding: 16px 24px 20px;
}
.index-details-dialog .el-dialog__title {
  color: #f1f5f9;
  font-size: 16px;
  font-weight: 600;
}
</style>
