<script setup lang="ts">
import { ref, computed, watch, useTemplateRef, nextTick } from 'vue'
import { CopyDocument, Document, Download, Link } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useMarkdown } from '../../composables/useMarkdown'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  format: {
    type: String,
    default: 'markdown'
  },
  title: {
    type: String,
    default: ''
  },
  tokensIn: {
    type: Number,
    default: 0
  },
  tokensOut: {
    type: Number,
    default: 0
  },
  tokensCache: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number,
    default: 0
  }
})

const showRaw = ref(false)
const copySuccess = ref(false)
const downloadSuccess = ref(false)
const isSpeaking = ref(false)
const isPaused = ref(false)
const saveDialogVisible = ref(false)
const saveFilename = ref('')
const saveSuccess = ref(false)

function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

// 共享的 markdown-it + hljs + mermaid 实例（与 ToolExecView 共用同一份配置）
const { md, renderMermaidInRoot } = useMarkdown()

// 去除 markdown 标记，只保留纯文本用于朗读
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')          // 代码块
    .replace(/`([^`]+)`/g, '$1')              // 行内代码
    .replace(/!\[.*?\]\(.*?\)/g, '')          // 图片
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')    // 链接
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // 加粗/斜体/删除线
    .replace(/#{1,6}\s+/g, '')                // 标题标记
    .replace(/>\s+/g, '')                     // 引用标记
    .replace(/[-*+]\s+/g, '')                 // 列表标记
    .replace(/\n{3,}/g, '\n\n')               // 多余空行
    .trim()
}

function speakContent() {
  if (!props.content) return
  const synth = window.speechSynthesis
  if (isSpeaking.value) {
    if (isPaused.value) {
      synth.resume()
      isPaused.value = false
    } else {
      synth.cancel()
      isSpeaking.value = false
    }
    return
  }
  const utterance = new SpeechSynthesisUtterance(stripMarkdown(props.content))
  utterance.lang = 'zh-CN'
  utterance.rate = 1.0
  utterance.pitch = 1.0
  utterance.onend = () => { isSpeaking.value = false; isPaused.value = false }
  utterance.onpause = () => { isPaused.value = true }
  utterance.onerror = () => { isSpeaking.value = false; isPaused.value = false }
  synth.speak(utterance)
  isSpeaking.value = true
  isPaused.value = false
}

const formattedContent = computed(() => {
  if (!props.content) return ''
  if (props.format === 'raw') return props.content
  return md.render(preprocessPaths(props.content))
})

// 将文本中的 URL 转换为 markdown 链接
function preprocessPaths(text: string): string {
  // 先替出已有 markdown 链接，避免破坏已有语法
  const links: string[] = []
  const stripped = text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (m) => {
    links.push(m)
    return `\x00MDLINK${links.length - 1}\x00`
  })

  // 匹配 http/https URL
  const urlRe = /https?:\/\/[^\s<>"']+(?<![.,;:!?)\]])/g
  const result = stripped.replace(urlRe, (match) => {
    return `[${match}](${match})`
  })

  // 恢复已有链接
  return result.replace(/\x00MDLINK(\d+)\x00/g, (_, i) => links[Number(i)])
}

async function copyToClipboard() {
  if (navigator.clipboard && props.content) {
    await navigator.clipboard.writeText(props.content)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  }
}

// 根据 title 推断安全的文件名（去Windows/macOS禁用字符）
function deriveDownloadFilename(): string {
  if (props.title) {
    const safe = props.title
      .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
      .replace(/^\s+|\s+$/g, '')
      .slice(0, 80)
    if (safe) return `${safe}.md`
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `mindx-output-${ts}.md`
}

function downloadAsMarkdown() {
  if (!props.content) return
  try {
    const blob = new Blob([props.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = deriveDownloadFilename()
    a.style.display = 'none'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
      a.remove()
    }, 100)
    downloadSuccess.value = true
    setTimeout(() => { downloadSuccess.value = false }, 2000)
  } catch (e) {
    console.warn('[OutputView] download failed:', e)
  }
}

function openSaveDialog() {
  saveFilename.value = deriveDownloadFilename()
  saveDialogVisible.value = true
}

async function saveToProject() {
  if (!props.content || !saveFilename.value.trim()) return
  const name = saveFilename.value.trim()
  const finalName = name.endsWith('.md') ? name : `${name}.md`
  const { useConnectionStore } = await import('../../stores/connectionStore')
  const conn = useConnectionStore()
  if (!conn.currentProjectDir) {
    ElMessage.warning(t('outputView.noProjectDir'))
    return
  }
  const fullPath = `${conn.currentProjectDir}/${finalName}`
  try {
    const { writeFileContent } = await import('../../services/graphApi')
    await writeFileContent(fullPath, props.content)
    saveDialogVisible.value = false
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 2000)
  } catch (e: any) {
    console.warn('[OutputView] save failed:', e)
    ElMessage.error(t('outputView.saveError', { msg: e?.message || t('common.unknownError') }))
  }
}

// ===== Mermaid 渲染 =====
// OutputView 没有弹窗，content 变化时（消息流式到达）就需要扫描渲染
const formattedRef = useTemplateRef<HTMLElement>('formatted')

watch(
  [() => props.content, () => props.format, showRaw],
  async () => {
    if (showRaw.value || props.format === 'raw') return
    await nextTick()
    await renderMermaidInRoot(formattedRef.value)
  },
  { flush: 'post', immediate: true }
)
</script>

<template>
  <div class="output-content" v-if="content">
    <div v-if="!showRaw" class="formatted-content markdown-body" v-html="formattedContent"></div>
    <pre v-else class="raw-content"><code>{{ content }}</code></pre>

    <div class="meta" v-if="tokensOut > 0 || duration">
      <span v-if="tokensIn > 0" class="meta-item">{{ t('outputView.tokensIn', { n: formatCompactNumber(tokensIn) }) }}</span>
      <span v-if="tokensOut > 0" class="meta-item">{{ t('outputView.tokensOut', { n: formatCompactNumber(tokensOut) }) }}</span>
      <span v-if="tokensIn > 0 || tokensOut > 0" class="meta-item">{{ t('outputView.tokensCache', { n: formatCompactNumber(tokensCache) }) }}</span>
      <span v-if="tokensIn > 0 || tokensOut > 0" class="meta-item">{{ t('outputView.tokensTotal', { n: formatCompactNumber(tokensIn + tokensOut - tokensCache) }) }}</span>
      <span v-if="duration" class="meta-item">{{ duration }}ms</span>
    </div>

    <!-- 尾部工具栏（图标 only，default 样式） -->
    <div class="actions actions-footer">
      <button class="action-btn" :class="{ 'is-active': isSpeaking }" @click.stop="speakContent" :title="t('outputView.speak')" :aria-label="t('outputView.speak')">
        <svg v-if="!isSpeaking" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <rect x="17" y="9" width="3" height="6" rx="1"/>
          <rect x="21" y="11" width="3" height="2" rx="1"/>
        </svg>
        <span v-if="isSpeaking" class="action-badge">■</span>
      </button>
      <button class="action-btn" @click.stop="copyToClipboard" :title="t('outputView.copy')" :aria-label="t('outputView.copy')">
        <el-icon><CopyDocument /></el-icon>
        <span v-if="copySuccess" class="action-success">{{ t('common.copied') }}</span>
      </button>
      <button class="action-btn" @click.stop="downloadAsMarkdown" :title="t('outputView.download')" :aria-label="t('outputView.download')">
        <el-icon><Download /></el-icon>
        <span v-if="downloadSuccess" class="action-success">✓</span>
      </button>
      <button class="action-btn" @click.stop="openSaveDialog" :title="t('outputView.save')" :aria-label="t('outputView.save')">
        <el-icon><Link /></el-icon>
        <span v-if="saveSuccess" class="action-success">✓</span>
      </button>
      <button class="action-btn" @click.stop="showRaw = !showRaw" :title="showRaw ? t('outputView.renderedView') : t('outputView.rawView')" :aria-label="t('outputView.toggleView')">
        <el-icon><Document /></el-icon>
      </button>
    </div>

    <!-- 保存文件名对话框 -->
    <el-dialog v-model="saveDialogVisible" :title="t('outputView.saveDialogTitle')" width="400px" align-center>
      <el-input v-model="saveFilename" :placeholder="t('outputView.saveDialogPlaceholder')" @keyup.enter="saveToProject" />
      <template #footer>
        <el-button @click="saveDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveToProject">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.output-block {
  width: 100%;
}

.output-content {
  width: 100%;
}

/* ===== 尾部工具栏（图标 only，default 样式，常驻可见） ===== */
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(6, 182, 212, 0.1);
  /* 修：之前 opacity:0 + 错父选择器 .output-block:hover 导致按钮永久不可见 */
}

.action-btn {
  position: relative;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: rgba(6, 182, 212, 0.1);
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  position: relative;
}

.action-btn:hover {
  background: rgba(6, 182, 212, 0.2);
  color: #22d3ee;
}

.action-btn.is-active {
  background: rgba(6, 182, 212, 0.25);
  color: #22d3ee;
  animation: pulse-speak 1.2s ease-in-out infinite;
}

@keyframes pulse-speak {
  0%, 100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.3); }
  50% { box-shadow: 0 0 0 4px rgba(6, 182, 212, 0.1); }
}

.action-badge {
  font-size: 8px;
  color: #ef4444;
  position: absolute;
  top: -2px;
  right: -2px;
}

.copy-success {
  font-size: 10px;
  color: #10b981;
}

.action-success {
  font-size: 10px;
  color: #10b981;
  margin-left: 1px;
}

.formatted-content {
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-secondary);
}

.formatted-content :deep(h1),
.formatted-content :deep(h2),
.formatted-content :deep(h3) {
  color: var(--text-primary);
  font-weight: 700;
  margin: 16px 0 8px;
}

.formatted-content :deep(h1) { font-size: 18px; }
.formatted-content :deep(h2) { font-size: 16px; }
.formatted-content :deep(h3) { font-size: 14px; }

.formatted-content :deep(p) {
  margin: 8px 0;
}

.formatted-content :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.formatted-content :deep(em) {
  font-style: italic;
  color: #22d3ee;
}

.formatted-content :deep(code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  background: rgba(6, 182, 212, 0.1);
  color: #22d3ee;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(6, 182, 212, 0.15);
}

.formatted-content :deep(.code-block) {
  background: var(--bg-secondary);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin: 10px 0;
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  /* hljs 主题（atom-one-dark）会接管 .hljs 子元素的 color；这里保留浅色作为降级 */
  color: #e2e8f0;
}

.formatted-content :deep(.code-block) code {
  background: none;
  padding: 0;
  border: none;
  color: inherit;
}

/* Mermaid 容器：聊天消息里的流程图 */
.formatted-content :deep(.mermaid) {
  background: #161b22;
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 8px;
  padding: 12px;
  margin: 10px 0;
  overflow-x: auto;
  text-align: center;
  min-height: 60px;
}
.formatted-content :deep(.mermaid svg) {
  max-width: 100%;
  height: auto;
}

.formatted-content :deep(ul),
.formatted-content :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.formatted-content :deep(li) {
  margin: 4px 0;
}

.formatted-content :deep(blockquote) {
  border-left: 3px solid #06b6d4;
  padding-left: 12px;
  margin: 10px 0;
  color: var(--text-muted);
  font-style: italic;
}

.formatted-content :deep(a) {
  color: #22d3ee;
  text-decoration: none;
}

.formatted-content :deep(a[href^="file://"]) {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #5eead4;
  font-weight: 600;
  font-size: 13px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(6, 182, 212, 0.08);
  border: 1px solid rgba(6, 182, 212, 0.15);
  transition: all 0.15s ease;
  white-space: nowrap;
}

.formatted-content :deep(a[href^="file://"]:hover) {
  background: rgba(6, 182, 212, 0.15);
  border-color: rgba(6, 182, 212, 0.35);
  color: #67e8f9;
  text-decoration: none;
}

.formatted-content :deep(a:hover) {
  text-decoration: underline;
}

.formatted-content :deep(hr) {
  border: none;
  border-top: 1px solid rgba(55, 65, 81, 0.5);
  margin: 16px 0;
}

.formatted-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0;
}

.formatted-content :deep(th),
.formatted-content :deep(td) {
  border: 1px solid rgba(55, 65, 81, 0.5);
  padding: 6px 10px;
  text-align: left;
}

.formatted-content :deep(th) {
  background: rgba(6, 182, 212, 0.08);
  font-weight: 600;
}

.raw-content {
  background: var(--bg-secondary);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.meta {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(6, 182, 212, 0.1);
}

.meta-item {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: #64748b;
}
</style>
