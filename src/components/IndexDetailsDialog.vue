<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElDialog, ElMessage, ElTag, ElButton, ElTooltip, ElTable, ElTableColumn, ElTabs, ElTabPane, ElCheckbox, ElInput } from 'element-plus'
import { Loading, Refresh, Setting, Close, CaretRight, RefreshRight } from '@element-plus/icons-vue'
import { useSessionStore } from '../stores/sessionStore'
import { useConnectionStore } from '../stores/connectionStore'
import { readFileContent, writeFileContent } from '../services/graphApi'

const { t } = useI18n()
const sessionStore = useSessionStore()
const connectionStore = useConnectionStore()

const props = defineProps<{
  visible: boolean
}>()
const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'refreshed'): void
}>()

const enqueuing = ref(false)
const operating = ref<Record<string, boolean>>({}) // per-file operation loading state

/** Current active project directory. */
const activeProjectDir = computed(() => sessionStore.activeSession?.project_dir || '')

// -- Manifest data (current session only) --
const manifestData = ref<any>(null)
const manifestLoading = ref(false)
let fetchSerial = 0 // monotonic counter to discard stale responses

async function fetchManifest() {
  const projectDir = activeProjectDir.value
  console.log('[IndexDetails] fetchManifest projectDir=', projectDir)
  if (!projectDir) { console.warn('[IndexDetails] No projectDir, returning'); return }
  const serial = ++fetchSerial
  manifestLoading.value = true
  try {
    const result = await connectionStore.getIndexQueue(projectDir)
    if (serial !== fetchSerial) {
      console.log('[IndexDetails] ignoring stale fetchManifest response, serial=', serial, 'current=', fetchSerial)
      return // discard stale response from a previous call
    }
    console.log('[IndexDetails] kb.index.list response=', JSON.stringify(result, null, 2))
    console.log('[IndexDetails] files array:', result?.files)
    console.log('[IndexDetails] files.length:', result?.files?.length)
    manifestData.value = result
  } catch (err: any) {
    if (serial !== fetchSerial) return
    console.error('[IndexDetails] Failed to fetch manifest:', err)
  } finally {
    if (serial === fetchSerial) manifestLoading.value = false
  }
}

// Watch for dialog open + session changes to auto-fetch
watch(() => props.visible, (val) => {
  if (val) {
    manifestData.value = null // 清除旧数据避免重开时闪现旧状态
    fetchManifest()
    startPolling()
  } else {
    stopPolling()
  }
})

// Auto-refresh when manifest changes (socket events)
watch(() => connectionStore.manifestVersion, () => {
  if (props.visible && activeProjectDir.value) {
    fetchManifest()
  }
})

// -- .mindxignore configurator --
const showIgnoreDialog = ref(false)
const ignoreContent = ref('')
const ignoreSaving = ref(false)
const ignoreTab = ref('simple')

const COMMON_IGNORE_ITEMS = computed<Array<{ pattern: string; desc: string }>>(() => [
  { pattern: '.git/', desc: t('sidebar.indexing.ignore.git') },
  { pattern: '.gitignore', desc: t('sidebar.indexing.ignore.gitignore') },
  { pattern: '.svn/', desc: t('sidebar.indexing.ignore.svn') },
  { pattern: '.hg/', desc: t('sidebar.indexing.ignore.hg') },
  { pattern: 'node_modules/', desc: t('sidebar.indexing.ignore.nodeModules') },
  { pattern: '.venv/', desc: t('sidebar.indexing.ignore.venv') },
  { pattern: 'venv/', desc: t('sidebar.indexing.ignore.venv2') },
  { pattern: '__pycache__/', desc: t('sidebar.indexing.ignore.pycache') },
  { pattern: '*.pyc', desc: t('sidebar.indexing.ignore.pyc') },
  { pattern: 'vendor/', desc: t('sidebar.indexing.ignore.vendor') },
  { pattern: '.bundle/', desc: t('sidebar.indexing.ignore.bundle') },
  { pattern: '.gradle/', desc: t('sidebar.indexing.ignore.gradle') },
  { pattern: 'target/', desc: t('sidebar.indexing.ignore.target') },
  { pattern: 'dist/', desc: t('sidebar.indexing.ignore.dist') },
  { pattern: 'build/', desc: t('sidebar.indexing.ignore.build') },
  { pattern: '.next/', desc: t('sidebar.indexing.ignore.next') },
  { pattern: '.nuxt/', desc: t('sidebar.indexing.ignore.nuxt') },
  { pattern: '*.doc', desc: t('sidebar.indexing.ignore.doc') },
  { pattern: '*.dot', desc: t('sidebar.indexing.ignore.dot') },
  { pattern: '*.xls', desc: t('sidebar.indexing.ignore.xls') },
  { pattern: '*.xlt', desc: t('sidebar.indexing.ignore.xlt') },
  { pattern: '*.ppt', desc: t('sidebar.indexing.ignore.ppt') },
  { pattern: '*.pps', desc: t('sidebar.indexing.ignore.pps') },
  { pattern: '*.mdb', desc: t('sidebar.indexing.ignore.mdb') },
  { pattern: '*.pst', desc: t('sidebar.indexing.ignore.pst') },
  { pattern: '*.pub', desc: t('sidebar.indexing.ignore.pub') },
  { pattern: '*.vsd', desc: t('sidebar.indexing.ignore.vsd') },
  { pattern: '*.one', desc: t('sidebar.indexing.ignore.one') },
  { pattern: '*.rtf', desc: t('sidebar.indexing.ignore.rtf') },
  { pattern: '*.odt', desc: t('sidebar.indexing.ignore.odt') },
  { pattern: '*.ods', desc: t('sidebar.indexing.ignore.ods') },
  { pattern: '*.odp', desc: t('sidebar.indexing.ignore.odp') },
  { pattern: '*.odg', desc: t('sidebar.indexing.ignore.odg') },
  { pattern: '*.xsd', desc: t('sidebar.indexing.ignore.xsd') },
  { pattern: '*.xsl', desc: t('sidebar.indexing.ignore.xsl') },
  { pattern: '*.xslt', desc: t('sidebar.indexing.ignore.xslt') },
  { pattern: '*.dtd', desc: t('sidebar.indexing.ignore.dtd') },
  { pattern: '*.wsdl', desc: t('sidebar.indexing.ignore.wsdl') },
  { pattern: '*.pdf', desc: t('sidebar.indexing.ignore.pdf') },
  { pattern: '*.jpg', desc: t('sidebar.indexing.ignore.jpg') },
  { pattern: '*.jpeg', desc: t('sidebar.indexing.ignore.jpeg') },
  { pattern: '*.png', desc: t('sidebar.indexing.ignore.png') },
  { pattern: '*.gif', desc: t('sidebar.indexing.ignore.gif') },
  { pattern: '*.bmp', desc: t('sidebar.indexing.ignore.bmp') },
  { pattern: '*.svg', desc: t('sidebar.indexing.ignore.svg') },
  { pattern: '*.ico', desc: t('sidebar.indexing.ignore.ico') },
  { pattern: '*.webp', desc: t('sidebar.indexing.ignore.webp') },
  { pattern: '*.mp3', desc: t('sidebar.indexing.ignore.mp3') },
  { pattern: '*.wav', desc: t('sidebar.indexing.ignore.wav') },
  { pattern: '*.mp4', desc: t('sidebar.indexing.ignore.mp4') },
  { pattern: '*.zip', desc: t('sidebar.indexing.ignore.zip') },
  { pattern: '*.tar', desc: t('sidebar.indexing.ignore.tar') },
  { pattern: '*.gz', desc: t('sidebar.indexing.ignore.gz') },
  { pattern: '*.rar', desc: t('sidebar.indexing.ignore.rar') },
  { pattern: '*.7z', desc: t('sidebar.indexing.ignore.sevenz') },
  { pattern: '.DS_Store', desc: t('sidebar.indexing.ignore.dsStore') },
  { pattern: '*.exe', desc: t('sidebar.indexing.ignore.exe') },
  { pattern: '*.dll', desc: t('sidebar.indexing.ignore.dll') },
  { pattern: '*.so', desc: t('sidebar.indexing.ignore.so') },
  { pattern: '*.dylib', desc: t('sidebar.indexing.ignore.dylib') },
  { pattern: '*.bin', desc: t('sidebar.indexing.ignore.bin') },
  { pattern: '*.class', desc: t('sidebar.indexing.ignore.class') },
  { pattern: '*.jar', desc: t('sidebar.indexing.ignore.jar') },
  { pattern: '*.war', desc: t('sidebar.indexing.ignore.war') },
  { pattern: '*.ttf', desc: t('sidebar.indexing.ignore.ttf') },
  { pattern: '*.otf', desc: t('sidebar.indexing.ignore.otf') },
  { pattern: '*.woff', desc: t('sidebar.indexing.ignore.woff') },
  { pattern: '*.woff2', desc: t('sidebar.indexing.ignore.woff2') },
  { pattern: '*.eot', desc: t('sidebar.indexing.ignore.eot') },
  { pattern: '.mindx/', desc: t('sidebar.indexing.ignore.mindx') },
  { pattern: '*.tmp', desc: t('sidebar.indexing.ignore.tmp') },
  { pattern: '*.temp', desc: t('sidebar.indexing.ignore.temp') },
  { pattern: '*.swp', desc: t('sidebar.indexing.ignore.swp') },
  { pattern: '*.swo', desc: t('sidebar.indexing.ignore.swo') },
  { pattern: '*.bak', desc: t('sidebar.indexing.ignore.bak') },
  { pattern: '*.log', desc: t('sidebar.indexing.ignore.log') },
  { pattern: '*.lock', desc: t('sidebar.indexing.ignore.lock') },
  { pattern: '*.cache', desc: t('sidebar.indexing.ignore.cache') },
])

function isPatternSelected(pattern: string): boolean {
  return ignoreContent.value.split('\n').some(l => l.trim() === pattern)
}

function togglePattern(pattern: string) {
  const lines = ignoreContent.value.split('\n')
  const idx = lines.findIndex(l => l.trim() === pattern)
  if (idx >= 0) {
    lines.splice(idx, 1)
  } else {
    lines.push(pattern)
  }
  ignoreContent.value = lines.join('\n')
}

async function openIgnoreConfig() {
  if (!activeProjectDir.value) {
    ElMessage.warning('没有活动的工作目录')
    return
  }
  try {
    const content = await readFileContent(activeProjectDir.value + '/.mindxignore')
    ignoreContent.value = content
  } catch {
    ignoreContent.value = `# .mindxignore — 在此文件中添加要排除的文件/目录模式（每行一个）\n# 语法遵循 .gitignore 规则：\n#   # 开头为注释\n#   / 结尾匹配目录\n#   *.ext 匹配扩展名\n`
  }
  showIgnoreDialog.value = true
}

async function saveIgnoreConfig() {
  if (!activeProjectDir.value) return
  ignoreSaving.value = true
  try {
    await writeFileContent(activeProjectDir.value + '/.mindxignore', ignoreContent.value)
    ElMessage.success('.mindxignore 已保存')
    showIgnoreDialog.value = false
  } catch (err: any) {
    ElMessage.error('保存失败: ' + (err.message || String(err)))
  } finally {
    ignoreSaving.value = false
  }
}

// -- Progress derived from manifest data --
const totalProgress = computed(() => {
  if (!manifestData.value) return { total: 0, indexed: 0, failed: 0, pending: 0, enqueued: 0, percent: 0 }
  const files: any[] = manifestData.value.files || []
  const total = files.length
  const indexed = files.filter((f: any) => f.state === 'done').length
  const failed = files.filter((f: any) => f.state === 'error').length
  const pending = files.filter((f: any) => f.state === 'pending').length
  const enqueued = files.filter((f: any) => f.state === 'enqueued').length
  return {
    total,
    indexed,
    failed,
    pending,
    enqueued,
    percent: total > 0 ? Math.round((indexed / total) * 100) : 0
  }
})

const currentFile = computed(() => manifestData.value?.current_file || '')
const isIndexing = computed(() => !!currentFile.value)

// -- Polling fallback: when there is active work, refresh every 2s --
let refreshInterval: ReturnType<typeof setInterval> | null = null

const shouldAutoRefresh = computed(() => {
  return props.visible && activeProjectDir.value && (
    totalProgress.value.pending > 0 ||
    totalProgress.value.enqueued > 0 ||
    !!currentFile.value
  )
})

function startPolling() {
  if (refreshInterval) return
  refreshInterval = setInterval(() => {
    if (shouldAutoRefresh.value) {
      fetchManifest()
    }
  }, 2000)
}

function stopPolling() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

onUnmounted(() => {
  stopPolling()
})

// -- Helpers --
function basename(filePath: string): string {
  const idx = filePath.lastIndexOf('/')
  return idx >= 0 ? filePath.substring(idx + 1) : filePath
}

function formatElapsed(ms: number): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatCount(val: number | undefined): string {
  if (val === undefined || val === null || val === 0) return '-'
  return val.toLocaleString()
}

// -- Per-file actions --
async function handleFileAction(row: any) {
  const opKey = row.path
  if (operating.value[opKey]) return
  const projectDir = activeProjectDir.value
  if (!projectDir) return

  operating.value = { ...operating.value, [opKey]: true }
  try {
    if (row.state === 'pending' || row.state === 'enqueued') {
      // Remove from manifest
      await connectionStore.removeFromIndexQueue(projectDir, [row.path])
      ElMessage.success('已从清单删除: ' + basename(row.path))
    } else if (row.state === 'error') {
      // Retry: remove and re-add to put it back in queue
      await connectionStore.removeFromIndexQueue(projectDir, [row.path])
      await connectionStore.addToIndexQueue(projectDir, [row.path])
      ElMessage.success('已重新加入队列: ' + basename(row.path))
    } else if (row.state === 'done') {
      // Re-index: remove and re-add
      await connectionStore.removeFromIndexQueue(projectDir, [row.path])
      await connectionStore.addToIndexQueue(projectDir, [row.path])
      ElMessage.success('已重新加入队列: ' + basename(row.path))
    }
    await fetchManifest()
    emit('refreshed')
  } catch (err: any) {
    ElMessage.error('操作失败: ' + (err?.message || ''))
  } finally {
    operating.value = { ...operating.value, [opKey]: false }
  }
}

/** 独立索引单个文件（不触发 Region 更新） */
async function handleIndexSingleFile(row: any) {
  const opKey = 'idx:' + row.path
  if (operating.value[opKey]) return
  const projectDir = activeProjectDir.value
  if (!projectDir) return

  operating.value = { ...operating.value, [opKey]: true }
  try {
    // row.path 始终是绝对路径（后端 kb.index.list 统一返回）
    await connectionStore.indexSingleFile(projectDir, row.path, row.state === 'done')
    ElMessage.success('已加入队列: ' + basename(row.path))
    await fetchManifest()
    emit('refreshed')
  } catch (err: any) {
    ElMessage.error('索引失败: ' + (err?.message || ''))
  } finally {
    operating.value = { ...operating.value, [opKey]: false }
  }
}

async function handleEnqueueAll() {
  if (enqueuing.value) return
  enqueuing.value = true
  try {
    const projectDir = activeProjectDir.value
    if (!projectDir) { ElMessage.warning('No active project directory'); return }

    await connectionStore.enqueueAll(projectDir)
    ElMessage.success('已启动')
    await fetchManifest()
    emit('refreshed')
  } catch (err: any) {
    ElMessage.error('启动失败: ' + (err?.message || ''))
  } finally {
    enqueuing.value = false
  }
}
</script>

<template>
  <div class="index-details-root">
    <ElDialog
      :model-value="props.visible"
      @update:model-value="emit('update:visible', $event)"
      title="知识库整理服务"
      :close-on-click-modal="true"
      class="index-details-dialog"
    >
      <div class="summary-section">
        <div v-if="isIndexing" class="summary-row indexing-active-row">
          <span class="summary-label">整理进度：</span>
          <div class="progress-inline">
            <el-icon class="is-loading index-spinner"><Loading /></el-icon>
            <span class="progress-inline-text">
              {{ totalProgress.indexed }} / {{ totalProgress.total }}
              ({{ totalProgress.percent }}%)
            </span>
          </div>
        </div>
        <div v-else class="summary-row">
          <span class="summary-label">整理进度：</span>
          <span class="summary-value">
            {{ totalProgress.indexed }} / {{ totalProgress.total }}
            ({{ totalProgress.percent }}%)
          </span>
        </div>
        <div class="summary-row" v-if="totalProgress.failed > 0">
          <span class="summary-label">失败：</span>
          <span class="summary-value failed-count">{{ totalProgress.failed }}</span>
        </div>
        <div class="summary-row" v-if="totalProgress.pending > 0">
          <span class="summary-label">待索引：</span>
          <span class="summary-value pending-count">{{ totalProgress.pending }}</span>
        </div>
        <div class="summary-row" v-if="totalProgress.enqueued > 0">
          <span class="summary-label">队列中：</span>
          <span class="summary-value pending-count">{{ totalProgress.enqueued }}</span>
        </div>
      </div>

      <!-- All files table (the entire index manifest) -->
      <div class="table-section">
        <ElTable
          v-if="manifestData?.files?.length"
          :data="manifestData.files"
          stripe
          size="small"
          style="width: 100%"
          max-height="100%"
          class="manifest-table"
        >
          <!-- Action column -->
          <ElTableColumn label="*" width="44" align="center">
            <template #default="{ row }">
              <div v-if="row.state === 'processing'" class="action-cell">
                <el-icon class="is-loading action-loading"><Loading /></el-icon>
              </div>
              <ElTooltip
                v-else
                :content="row.state === 'pending' || row.state === 'enqueued' ? '从清单删除' : row.state === 'error' ? '重新索引' : '重新索引'"
                placement="left"
                :show-after="300"
              >
                <ElButton
                  size="small"
                  circle
                  :type="row.state === 'error' ? 'danger' : 'default'"
                  :loading="!!operating[row.path]"
                  :icon="row.state === 'pending' || row.state === 'enqueued' ? Close : RefreshRight"
                  @click="handleFileAction(row)"
                  class="action-btn"
                />
              </ElTooltip>
            </template>
          </ElTableColumn>

          <!-- Index now column -->
          <ElTableColumn label="索引" width="52" align="center">
            <template #default="{ row }">
              <ElTooltip
                v-if="row.state !== 'processing'"
                content="马上整理"
                placement="left"
                :show-after="300"
              >
                <ElButton
                  size="small"
                  circle
                  type="primary"
                  :loading="!!operating['idx:' + row.path]"
                  :icon="CaretRight"
                  @click="handleIndexSingleFile(row)"
                  class="action-btn"
                />
              </ElTooltip>
            </template>
          </ElTableColumn>

          <!-- File name (basename only) -->
          <ElTableColumn prop="path" label="文件" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="table-file-path" :title="row.path">{{ basename(row.path) }}</span>
            </template>
          </ElTableColumn>

          <!-- State -->
          <ElTableColumn prop="state" label="状态" width="72" align="center">
            <template #default="{ row }">
              <ElTag
                :type="row.state === 'done' ? 'success' : row.state === 'error' ? 'danger' : row.state === 'processing' ? 'primary' : row.state === 'enqueued' ? 'warning' : 'info'"
                size="small"
                effect="plain"
              >
                {{ row.state === 'pending' ? '待索引' : row.state === 'enqueued' ? '队列中' : row.state === 'processing' ? '处理中' : row.state === 'done' ? '已完成' : '失败' }}
              </ElTag>
            </template>
          </ElTableColumn>

          <!-- 知识点 (Chunks) -->
          <ElTableColumn prop="chunks" label="知识点" width="72" align="right">
            <template #default="{ row }">
              <span class="table-metric-value">{{ formatCount(row.chunks) }}</span>
            </template>
          </ElTableColumn>

          <!-- 节点 (Nodes) -->
          <ElTableColumn prop="nodes" label="节点" width="60" align="right">
            <template #default="{ row }">
              <span class="table-metric-value">{{ formatCount(row.nodes) }}</span>
            </template>
          </ElTableColumn>

          <!-- Token columns -->
          <ElTableColumn prop="input_tokens" label="输入(T)" width="110" align="right" sortable>
            <template #default="{ row }">
              <span class="table-token-value">{{ formatCount(row.input_tokens) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="output_tokens" label="输出(T)" width="110" align="right" sortable>
            <template #default="{ row }">
              <span class="table-token-value">{{ formatCount(row.output_tokens) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="cost" label="费用" width="90" align="right" sortable>
            <template #default="{ row }">
              <span class="table-cost-value">{{ row.cost > 0 ? row.cost.toFixed(6) : '-' }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="elapsed_ms" label="耗时" width="72" align="right" sortable>
            <template #default="{ row }">
              <span class="table-elapsed-value">{{ formatElapsed(row.elapsed_ms) }}</span>
            </template>
          </ElTableColumn>
        </ElTable>

        <!-- Empty state -->
        <div v-else-if="!manifestLoading" class="empty-state">
          {{ t('sidebar.indexing.noData') }}
        </div>
      </div>

      <!-- Footer: control bar -->
      <template #footer>
        <div class="dialog-footer-bar">
          <div class="footer-left" />
          <div class="footer-right">
            <ElButton
              size="small"
              type="primary"
              :loading="enqueuing"
              @click="handleEnqueueAll"
            >
              <el-icon><CaretRight /></el-icon>
              启动
            </ElButton>
            <ElButton
              size="small"
              :loading="manifestLoading"
              @click="fetchManifest"
            >
              <el-icon><Refresh /></el-icon>
              刷新清单
            </ElButton>
            <ElButton
              size="small"
              @click="openIgnoreConfig"
            >
              <el-icon><Setting /></el-icon>
              排除规则
            </ElButton>
          </div>
        </div>
      </template>
    </ElDialog>

    <!-- .mindxignore configurator dialog -->
    <ElDialog
      :model-value="showIgnoreDialog"
      @update:model-value="showIgnoreDialog = $event"
      title="配置排除规则 (.mindxignore)"
      width="560px"
      :close-on-click-modal="false"
      class="ignore-config-dialog"
    >
      <div class="ignore-config-body">
        <ElTabs v-model="ignoreTab" class="ignore-tabs">
          <ElTabPane label="简单" name="simple">
            <div class="simple-mode">
              <div class="simple-hint">需要排除的文件规则：</div>
              <div class="simple-list">
                <div
                  class="simple-item"
                  v-for="item in COMMON_IGNORE_ITEMS"
                  :key="item.pattern"
                  @click="togglePattern(item.pattern)"
                >
                  <ElCheckbox :checked="isPatternSelected(item.pattern)" @click.stop="togglePattern(item.pattern)" />
                  <span class="simple-pattern">{{ item.pattern }}</span>
                  <span class="simple-desc">{{ item.desc }}</span>
                </div>
              </div>
            </div>
          </ElTabPane>
          <ElTabPane label="高级" name="advanced">
            <ElInput
              v-model="ignoreContent"
              type="textarea"
              :rows="14"
              placeholder="输入排除规则..."
              class="ignore-textarea"
            />
            <div class="ignore-hint">
              规则遵循 .gitignore 语法：支持目录/、文件名、*.ext 通配符。
              请勿添加 .mindx/ 和 .mindxignore 自身的规则。
            </div>
          </ElTabPane>
        </ElTabs>
      </div>
      <template #footer>
        <ElButton @click="showIgnoreDialog = false">取消</ElButton>
        <ElButton type="primary" :loading="ignoreSaving" @click="saveIgnoreConfig">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
/* ── Summary ── */
.summary-section {
  padding: 0 4px;
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
.pending-count {
  color: #f59e0b;
}

/* ── Table section ── */
.table-section {
  flex: 1;
  overflow: hidden;
}
.empty-state {
  text-align: center;
  color: #64748b;
  padding: 48px 0;
  font-size: 13px;
}

/* ── Table cell values ── */
.table-file-path {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #e2e8f0;
}
.table-token-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #93c5fd;
}
.table-cost-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #fbbf24;
}
.table-elapsed-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
}
.table-metric-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #34d399;
}

/* ── Action cell ── */
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
}
.action-loading {
  font-size: 14px;
  color: #a78bfa;
}
.action-btn {
  --el-button-size: 22px;
}

/* ── Ignore config (unchanged) ── */
.ignore-config-body {
  display: flex;
  flex-direction: column;
}
.simple-mode {
  display: flex;
  flex-direction: column;
}
.simple-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}
.simple-list {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
  gap: 2px;
}
.simple-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.simple-item:hover {
  background: rgba(55, 65, 81, 0.4);
}
.simple-item .el-checkbox {
  flex-shrink: 0;
}
.simple-pattern {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: #e2e8f0;
  min-width: 120px;
  flex-shrink: 0;
}
.simple-desc {
  font-size: 12px;
  color: #64748b;
}
.ignore-textarea {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
}
.ignore-hint {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
  margin-top: 6px;
}
.ignore-tabs {
  margin-top: -8px;
}
.ignore-tabs .el-tabs__header {
  margin-bottom: 12px;
}
.ignore-tabs .el-tabs__nav-wrap::after {
  display: none;
}
</style>

<style>
/* ── Dialog sizing ── */
.index-details-dialog {
  --dialog-width: 60vw;
}
.index-details-dialog .el-dialog {
  width: var(--dialog-width) !important;
  height: 60vh !important;
  display: flex;
  flex-direction: column;
  background: #111827;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}
.index-details-dialog .el-dialog__header {
  padding: 14px 20px 12px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
  flex-shrink: 0;
}
.index-details-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}
.index-details-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}
.index-details-dialog .el-dialog__body {
  padding: 12px 20px 16px;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.index-details-dialog .el-dialog__title {
  color: #f1f5f9;
  font-size: 15px;
  font-weight: 600;
}

/* ── Dialog footer ── */
.index-details-dialog .el-dialog__footer {
  padding: 8px 20px 12px;
  margin: 0;
  border-top: 1px solid rgba(55, 65, 81, 0.4);
  flex-shrink: 0;
}

.dialog-footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.footer-label {
  font-size: 13px;
  color: #94a3b8;
}
.dialog-footer-bar .el-button .el-icon {
  margin-right: 3px;
}

/* ── ElTable dark theme overrides ── */
.index-details-dialog .el-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(15, 23, 42, 0.6);
  --el-table-row-hover-bg-color: rgba(55, 65, 81, 0.4);
  --el-table-border-color: rgba(55, 65, 81, 0.3);
  --el-table-text-color: #e2e8f0;
  --el-table-header-text-color: #94a3b8;
  background: transparent;
  border: none;
}
.index-details-dialog .el-table th.el-table__cell {
  background-color: rgba(15, 23, 42, 0.6);
  border-bottom: 1px solid rgba(55, 65, 81, 0.3);
}
.index-details-dialog .el-table td.el-table__cell {
  border-bottom: 1px solid rgba(55, 65, 81, 0.15);
}
.index-details-dialog .el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell {
  background-color: rgba(30, 41, 59, 0.3);
}
.index-details-dialog .el-table__body-wrapper {
  background: transparent;
}
.index-details-dialog .el-table--enable-row-hover .el-table__body tr:hover > td {
  background-color: rgba(55, 65, 81, 0.3);
}
.index-details-dialog .el-table__body-wrapper,
.index-details-dialog .el-table__header-wrapper {
  border-radius: 0;
}

/* ── Ignore config dialog ── */
.ignore-config-dialog .el-dialog {
  background: #111827;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}
.ignore-config-dialog .el-dialog__header {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.ignore-config-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}
.ignore-config-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}
.ignore-config-dialog .el-dialog__body {
  padding: 16px 24px 12px;
}
.ignore-config-dialog .el-dialog__title {
  color: #f1f5f9;
  font-size: 16px;
  font-weight: 600;
}
.ignore-config-dialog .el-dialog__footer {
  padding: 8px 24px 18px;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
}
</style>
