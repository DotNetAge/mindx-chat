<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElDialog, ElMessage, ElTag, ElButton, ElScrollbar, ElProgress, ElInput, ElTooltip, ElTabs, ElTabPane, ElCheckbox } from 'element-plus'
import { Loading, Setting } from '@element-plus/icons-vue'
import { useGraphStore } from '../stores/graphStore'
import { useSessionStore } from '../stores/sessionStore'
import { filewatchRetryFailed, filewatchIgnoreFailed, readFileContent, writeFileContent } from '../services/graphApi'
import type { FailedFileRecord, CompletedFileRecord } from '../services/graphApi'
import { getMindXClient } from '../services/websocket'

const { t } = useI18n()
const graphStore = useGraphStore()
const sessionStore = useSessionStore()

const props = defineProps<{
  visible: boolean
}>()
const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'refreshed'): void
}>()

const retrying = ref<Record<string, boolean>>({})
const toggling = ref(false)

/** Current active project directory. */
const activeProjectDir = computed(() => sessionStore.activeSession?.project_dir || '')

// -- .mindxignore configurator --
const showIgnoreDialog = ref(false)
const ignoreContent = ref('')
const ignoreSaving = ref(false)
const ignoreTab = ref('simple')

const COMMON_IGNORE_ITEMS = computed<Array<{ pattern: string; desc: string }>>(() => [
  // 版本控制
  { pattern: '.git/', desc: t('sidebar.indexing.ignore.git') },
  { pattern: '.gitignore', desc: t('sidebar.indexing.ignore.gitignore') },
  { pattern: '.svn/', desc: t('sidebar.indexing.ignore.svn') },
  { pattern: '.hg/', desc: t('sidebar.indexing.ignore.hg') },
  // 依赖 & 包管理
  { pattern: 'node_modules/', desc: t('sidebar.indexing.ignore.nodeModules') },
  { pattern: '.venv/', desc: t('sidebar.indexing.ignore.venv') },
  { pattern: 'venv/', desc: t('sidebar.indexing.ignore.venv2') },
  { pattern: '__pycache__/', desc: t('sidebar.indexing.ignore.pycache') },
  { pattern: '*.pyc', desc: t('sidebar.indexing.ignore.pyc') },
  { pattern: 'vendor/', desc: t('sidebar.indexing.ignore.vendor') },
  { pattern: '.bundle/', desc: t('sidebar.indexing.ignore.bundle') },
  { pattern: '.gradle/', desc: t('sidebar.indexing.ignore.gradle') },
  { pattern: 'target/', desc: t('sidebar.indexing.ignore.target') },
  // 构建输出
  { pattern: 'dist/', desc: t('sidebar.indexing.ignore.dist') },
  { pattern: 'build/', desc: t('sidebar.indexing.ignore.build') },
  { pattern: '.next/', desc: t('sidebar.indexing.ignore.next') },
  { pattern: '.nuxt/', desc: t('sidebar.indexing.ignore.nuxt') },
  // Office 97-2003 旧版二进制格式（新版 OpenXML 格式可被解析索引）
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
  // OpenDocument 格式
  { pattern: '*.odt', desc: t('sidebar.indexing.ignore.odt') },
  { pattern: '*.ods', desc: t('sidebar.indexing.ignore.ods') },
  { pattern: '*.odp', desc: t('sidebar.indexing.ignore.odp') },
  { pattern: '*.odg', desc: t('sidebar.indexing.ignore.odg') },
  // 标记/格式/模板文件
  { pattern: '*.xsd', desc: t('sidebar.indexing.ignore.xsd') },
  { pattern: '*.xsl', desc: t('sidebar.indexing.ignore.xsl') },
  { pattern: '*.xslt', desc: t('sidebar.indexing.ignore.xslt') },
  { pattern: '*.dtd', desc: t('sidebar.indexing.ignore.dtd') },
  { pattern: '*.wsdl', desc: t('sidebar.indexing.ignore.wsdl') },
  { pattern: '*.pdf', desc: t('sidebar.indexing.ignore.pdf') },
  // 图片 & 媒体
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
  // 压缩 & 归档
  { pattern: '*.zip', desc: t('sidebar.indexing.ignore.zip') },
  { pattern: '*.tar', desc: t('sidebar.indexing.ignore.tar') },
  { pattern: '*.gz', desc: t('sidebar.indexing.ignore.gz') },
  { pattern: '*.rar', desc: t('sidebar.indexing.ignore.rar') },
  { pattern: '*.7z', desc: t('sidebar.indexing.ignore.sevenz') },
  // 系统 & 杂项二进制
  { pattern: '.DS_Store', desc: t('sidebar.indexing.ignore.dsStore') },
  { pattern: '*.exe', desc: t('sidebar.indexing.ignore.exe') },
  { pattern: '*.dll', desc: t('sidebar.indexing.ignore.dll') },
  { pattern: '*.so', desc: t('sidebar.indexing.ignore.so') },
  { pattern: '*.dylib', desc: t('sidebar.indexing.ignore.dylib') },
  { pattern: '*.bin', desc: t('sidebar.indexing.ignore.bin') },
  { pattern: '*.class', desc: t('sidebar.indexing.ignore.class') },
  { pattern: '*.jar', desc: t('sidebar.indexing.ignore.jar') },
  { pattern: '*.war', desc: t('sidebar.indexing.ignore.war') },
  // 字体文件
  { pattern: '*.ttf', desc: t('sidebar.indexing.ignore.ttf') },
  { pattern: '*.otf', desc: t('sidebar.indexing.ignore.otf') },
  { pattern: '*.woff', desc: t('sidebar.indexing.ignore.woff') },
  { pattern: '*.woff2', desc: t('sidebar.indexing.ignore.woff2') },
  { pattern: '*.eot', desc: t('sidebar.indexing.ignore.eot') },
  // MindX 自身
  { pattern: '.mindx/', desc: t('sidebar.indexing.ignore.mindx') },
  // 临时 & 缓存
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
    // File doesn't exist — start with comment header
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
  return {
    total,
    indexed,
    failed,
    pending: Math.max(0, total - indexed - failed),
    percent: total > 0 ? Math.round((indexed / total) * 100) : 0
  }
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

/** Whether any directory is currently being indexed or pending. */
const isIndexing = computed(() => {
  if (!graphStore.filewatchStatus?.running) return false
  return dirStates.value.some(s => s.state === 'indexing' || s.state === 'pending')
})

/** Whether any directory has pending files to be indexed. */
const hasPending = computed(() => {
  return dirStates.value.some(s => s.state === 'pending') || totalProgress.value.pending > 0
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

async function handleToggleAutoIndex() {
  if (toggling.value) return

  // 检查前置条件：监控目录 + 实体标签
  const allMet = await checkPrerequisites()
  if (!allMet) return

  toggling.value = true
  try {
    if (graphStore.filewatchStatus?.running) {
      await graphStore.stopFilewatch()
      await graphStore.refreshFilewatchStatus()
      if (!graphStore.filewatchStatus?.running) {
        ElMessage.success(t('sidebar.autoIndex.stopped'))
      } else {
        ElMessage.warning(t('sidebar.autoIndex.stopFailed'))
      }
      return
    }
    await graphStore.startFilewatch()
    let running = false
    for (let i = 0; i < 10; i++) {
      await graphStore.refreshFilewatchStatus()
      if (graphStore.filewatchStatus?.running) {
        running = true
        break
      }
      await new Promise(r => setTimeout(r, 100))
    }
    if (running) {
      ElMessage.success(t('sidebar.autoIndex.started'))
    } else {
      ElMessage.warning(t('sidebar.autoIndex.startFailedUnknown'))
    }
  } finally {
    toggling.value = false
  }
}

async function checkPrerequisites(): Promise<boolean> {
  await graphStore.refreshFilewatchStatus()

  const watched = graphStore.filewatchStatus?.watched || []
  const hasWatchedDirs = watched.length > 0

  const client = getMindXClient()
  let hasTags = false
  if (client) {
    try {
      const res = await client.call<{ types: any[] }>('entity_tags.get', {})
      hasTags = (res?.types?.length ?? 0) > 0
    } catch {
      // RPC failed — treat as no tags
    }
  }

  if (!hasWatchedDirs || !hasTags) {
    ElMessage.warning('前置条件未满足：需要先配置' + (!hasWatchedDirs ? '工作目录 ' : '') + (!hasTags ? '实体标签' : ''))
    return false
  }
  return true
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString()
}

function stateLabel(s: string): string {
  switch (s) {
    case 'pending': return '待处理'
    case 'indexing': return '索引中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return s
  }
}
</script>

<template>
  <div class="index-details-root">
    <ElDialog
      :model-value="props.visible"
      @update:model-value="emit('update:visible', $event)"
      title="知识库整理服务"
      width="620px"
      :close-on-click-modal="true"
      class="index-details-dialog"
    >
    <ElScrollbar max-height="500px">
      <!-- Warning: only show when indexing is not enabled -->
      <div v-if="!graphStore.filewatchStatus?.running" class="warning-banner">
        ⚠️ 知识图谱需要采用大模型对数据进行整理与提取因此会因文件的多少产生相应的消耗，为确保数据质量与更低的成本建议使用干净的纯文本文件而不是Office类的格式文件。
      </div>

      <!-- Index status + toggle button (replaces status bar toggle) -->
      <div class="index-toggle-row">
        <div class="toggle-row-left">
          <span class="toggle-label">服务状态：</span>
          <ElTag :type="graphStore.filewatchStatus?.running ? 'success' : 'info'" size="small">
            {{ graphStore.filewatchStatus?.running ? '已启用' : '未启用' }}
          </ElTag>
        </div>
        <div class="toggle-row-right">
          <ElButton
            size="small"
            :type="graphStore.filewatchStatus?.running ? 'danger' : 'primary'"
            :loading="toggling"
            @click="handleToggleAutoIndex"
          >
            {{ graphStore.filewatchStatus?.running ? '禁用' : '启用' }}
          </ElButton>
          <ElTooltip content="配置排除文件 (.mindxignore)" placement="top" :show-after="300">
            <ElButton size="small" circle :icon="Setting" @click="openIgnoreConfig" />
          </ElTooltip>
        </div>
      </div>

      <!-- Overall summary -->
      <div class="summary-section">
        <!-- Indexing in progress: show animated progress bar -->
        <div v-if="isIndexing" class="summary-row indexing-active-row">
          <span class="summary-label">整理进度：</span>
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
          <span class="summary-label">整理进度：</span>
          <span class="summary-value">
            {{ totalProgress.indexed }} / {{ totalProgress.total }}
            ({{ totalProgress.percent }}%)
          </span>
        </div>
        <div class="summary-row" v-if="totalProgress.failed > 0">
          <span class="summary-label">{{ t('sidebar.indexing.failed') }}:</span>
          <span class="summary-value failed-count">{{ totalProgress.failed }}</span>
        </div>
        <div class="summary-row" v-if="hasPending && totalProgress.pending > 0">
          <span class="summary-label">待索引：</span>
          <span class="summary-value pending-count">{{ totalProgress.pending }}</span>
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
            {{ stateLabel(st.state) }}
          </ElTag>
        </div>
        <div class="dir-progress">
          <span class="dir-stats">
            <template v-if="st.state === 'pending' && st.total_files === 0">
              待处理
            </template>
            <template v-else>
              {{ st.indexed_files }} / {{ st.total_files }} files
            </template>
            <span v-if="st.failed_files?.length">, {{ st.failed_files.length }} 个失败</span>
          </span>
          <span class="dir-entity-stats" v-if="(st.entities_created || 0) > 0 || (st.rels_created || 0) > 0">
            · {{ st.entities_created || 0 }} {{ t('kgViewer.entities') || '实体' }} / {{ st.rels_created || 0 }} {{ t('kgViewer.relationships') || '关系' }}
          </span>
          <span class="dir-elapsed-stats" v-if="(st.total_elapsed_ms || 0) > 0">
            · {{ formatElapsed(st.total_elapsed_ms || 0) }}
          </span>
        </div>

        <!-- Pending files for this directory -->
        <div v-if="st.state === 'pending'" class="pending-section">
          <div class="pending-header">待索引文件：</div>
          <div class="pending-info">
            <template v-if="st.total_files > 0">
              共 {{ st.total_files }} 个文件等待索引处理，已完成 {{ st.indexed_files }} 个
            </template>
            <template v-else>
              目录已加入待处理队列，等待服务调度...
            </template>
          </div>
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
.summary-section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: #fbbf24;
}
.index-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 8px;
}
.toggle-row-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toggle-row-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.toggle-label {
  font-size: 13px;
  color: #94a3b8;
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
.pending-section {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 6px;
}
.pending-header {
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
  margin-bottom: 4px;
}
.pending-info {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
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

/* Ignore config dialog styles */
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
