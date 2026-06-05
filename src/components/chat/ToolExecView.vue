<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef, nextTick } from 'vue'
import { useMarkdown } from '../../composables/useMarkdown'

/**
 * ToolExecView — 渲染 GoReact 原始工具执行事件
 *
 * props 直接透传 GoReact 数据，无中间结构：
 *   start: ToolExecStartData  {tool_name, params, predicted_tokens}
 *   end:   ToolExecEndData    {tool_name, tool_call_id, success, result, error, duration_ms}
 *   status: 'executing' | 'done' | 'failed'
 */

const props = defineProps({
  start: { type: Object as () => any, default: null },
  end: { type: Object as () => any, default: null },
  status: { type: String as () => 'executing' | 'done' | 'failed', default: 'executing' },
  title: { type: String, default: '' }
})

// 共享的 markdown-it + hljs + mermaid 实例（语言注册和 mermaid 初始化只发生一次）
const { md, renderMermaidInRoot } = useMarkdown()

const showDetail = ref(false)

// 失败时整块红色
const isFailed = computed(() => props.status === 'failed')
const isDone = computed(() => props.status === 'done' || props.status === 'failed')

const toolName = computed(() => props.start?.tool_name || props.end?.tool_name || props.title || '工具')

// ===== 计时器：执行中实时计时，完成后显示服务端 duration_ms =====
const startTime = ref<number>(0)
const elapsedMs = ref(0)
let timerHandle: ReturnType<typeof setInterval> | null = null

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}.${String(ms % 1000).padStart(3, '0')}s`
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// 最终显示的时长文字：完成时优先用服务端数据，否则用客户端计时
const durationText = computed(() => {
  // 历史还原或已完成：用 end.duration_ms（GoReact 服务端精确值）
  if (props.end?.duration_ms) return formatDuration(props.end.duration_ms)
  // 执行中：客户端实时计时
  if (props.status === 'executing') return formatDuration(elapsedMs.value)
  // 完成后无服务端数据时，退回到客户端计时
  if (elapsedMs.value > 0) return formatDuration(elapsedMs.value)
  return ''
})

// 启动/停止计时器
watch(() => props.status, (s, prev) => {
  if (s === 'executing') {
    startTime.value = Date.now()
    elapsedMs.value = 0
    timerHandle = setInterval(() => {
      elapsedMs.value = Date.now() - startTime.value
    }, 100)
  } else {
    if (timerHandle) {
      clearInterval(timerHandle)
      timerHandle = null
    }
    // 完成时保留最后一次 elapsed，如果服务端没给 duration_ms 就用这个近似值
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (timerHandle) clearInterval(timerHandle)
  document.removeEventListener('keydown', onKeydown)
})

// ===== ESC 关闭结果详情 =====
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showDetail.value) {
    e.stopPropagation()
    showDetail.value = false
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

// ===== 参数处理 =====
function cleanParams(params?: Record<string, any>): Record<string, any> | undefined {
  if (!params || Object.keys(params).length === 0) return undefined
  const cleaned: Record<string, any> = {}
  for (const [k, v] of Object.entries(params)) {
    if (!k.startsWith('_')) cleaned[k] = v
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

function formatParamsPreview(params?: Record<string, any>): string {
  const c = cleanParams(params)
  if (!c) return ''
  return Object.entries(c)
    .map(([k, v]) => typeof v === 'string' ? v.substring(0, 80) : JSON.stringify(v).substring(0, 80))
    .join(', ')
}

// ===== 扩展名 → Markdown 代码块语言 =====
// read 工具读到的内容是纯文本，markdown-it 不会自动识别为代码块。
// 这里在送入 md.render 之前先根据文件扩展名包一层 ```lang，让代码文件"漂亮"起来。
const EXT_TO_LANG: Record<string, string> = {
  // Web / 脚本
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  vue: 'vue', svelte: 'svelte',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  // 后端
  go: 'go',
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  scala: 'scala', clj: 'clojure',
  cs: 'csharp',
  py: 'python',
  rb: 'ruby',
  php: 'php',
  rs: 'rust',
  swift: 'swift',
  // C 系列
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  m: 'objectivec', mm: 'objectivec',
  // Shell / 系统
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  ps1: 'powershell',
  // 数据 / 配置
  json: 'json', jsonc: 'json',
  yml: 'yaml', yaml: 'yaml',
  toml: 'ini',
  ini: 'ini', cfg: 'ini', conf: 'ini',
  env: 'bash',
  // 数据库
  sql: 'sql',
  // 函数式
  hs: 'haskell', ml: 'ocaml',
  ex: 'elixir', exs: 'elixir',
  erl: 'erlang',
  // 其它
  lua: 'lua',
  pl: 'perl',
  r: 'r',
  dart: 'dart',
  groovy: 'groovy',
  vim: 'vim',
  dockerfile: 'dockerfile',
  make: 'makefile',
  proto: 'protobuf',
  graphql: 'graphql',
  gql: 'graphql',
  // 文档（不包裹——已经是 markdown）
  md: 'markdown', markdown: 'markdown',
}

function extensionToLanguage(path: string): string | null {
  if (!path) return null
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  if (!m) return null
  return EXT_TO_LANG[m[1]] || null
}

function isCodeFile(path: string | undefined): boolean {
  if (!path) return false
  const lang = extensionToLanguage(path)
  // markdown / 文档类文件不包裹（已经是 markdown 文本）
  return !!lang && lang !== 'markdown'
}

// 如果是代码型文件，且内容尚未以 ``` 开头，就用 ```lang 包起来
function wrapIfCodeFile(text: string, path: string | undefined): string {
  if (!isCodeFile(path)) return text
  if (text.trimStart().startsWith('```')) return text
  const lang = extensionToLanguage(path!) || 'text'
  return '```' + lang + '\n' + text + '\n```'
}

// ===== 去除 read 工具附加的行号 =====
// read 工具返回的内容是 cat -n 风格：每行 "<num>\t<content>"，空行只是 "<num>"
// 这些行号是工具自己加的，破坏了 markdown 语法（如 "1\t# Title" 不再是标题）
// 在送入 md.render() 之前剥掉。
// 安全点：要求数字后面必须紧跟 \t（普通行）或者数字正好是整行（空行）才剥。
// 不会误伤原文中以数字开头的行：
//   - "1. xxx"（markdown 有序列表）→ . 不是 \t，不剥
//   - "2024-01-01"                  → - 不是 \t，不剥
//   - "1" 单独成行的真数字            → 会被剥（实际文本中几乎不出现，trade-off 接受）
function stripLineNumbers(text: string): string {
  return text.replace(/^\d+(\t|$)/gm, '')
}

const resultText = computed(() => {
  const e = props.end
  if (!e) return ''
  return e.result || e.error || ''
})

// ===== 结果解析 =====
// 工具（特别是 read / ls / glob）可能返回结构化 JSON 包装：
//   read:   { _note?, content: string, has_more?, next_offset?, lines_read?, ... }
//   ls:     { items: [{ name, type: 'file'|'directory', size, modTime, children? }, ...] }
//   glob:   { files: ["/abs/path/1", "/abs/path/2", ...] }
// 解析后按 kind 路由到合适的渲染器
type FileItem = {
  name: string
  type: 'file' | 'directory' | string
  size?: number
  modTime?: string
  children?: FileItem[]
  path?: string // 可选：完整路径（glob 工具的结果会带上）
}

type ParsedResult =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'structured'; text: string; note?: string; metadata: Record<string, any> }
  | { kind: 'fileList'; items: FileItem[]; metadata: Record<string, any>; source: 'ls' | 'glob' }
  | { kind: 'json'; value: any }

const parsedResult = computed<ParsedResult>(() => {
  const raw = resultText.value
  if (!raw) return { kind: 'empty' }

  const trimmed = raw.trim()
  // 仅尝试解析看起来像 JSON 对象的字符串（避免误判含 `{` 的普通文本）
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { kind: 'text', text: raw }
  }

  let obj: any
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return { kind: 'text', text: raw }
  }

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { kind: 'json', value: obj }
  }

  // 识别 ls 工具的目录列表：顶层有 items 数组
  if (Array.isArray(obj.items) && obj.items.length > 0 && isFileItem(obj.items[0])) {
    const { items, ...metadata } = obj
    return { kind: 'fileList', items: items as FileItem[], metadata, source: 'ls' }
  }

  // 识别 glob 工具的路径列表：顶层有 files 字符串数组
  if (Array.isArray(obj.files) && obj.files.length > 0 && obj.files.every((f: any) => typeof f === 'string')) {
    const items: FileItem[] = (obj.files as string[]).map((p) => ({
      name: basename(p),
      type: 'file',
      path: p
    }))
    return { kind: 'fileList', items, metadata: {}, source: 'glob' }
  }

  // 识别带 content 字段的结构化结果（read 工具）
  if (typeof obj.content === 'string') {
    const { _note, content, ...metadata } = obj
    return {
      kind: 'structured',
      text: content,
      note: typeof _note === 'string' ? _note : undefined,
      metadata
    }
  }

  return { kind: 'json', value: obj }
})

// 识别一个对象是否是文件项（ls 工具的 schema）
function isFileItem(x: any): boolean {
  return (
    x && typeof x === 'object' &&
    typeof x.name === 'string' &&
    (x.type === 'file' || x.type === 'directory' || x.type === 'symlink')
  )
}

const showRawResult = ref(false)

// 简单的路径 basename，跨平台分隔符
function basename(path: string): string {
  if (!path) return ''
  return path.split(/[\\/]/).pop() || path
}

// 元数据里哪些字段不显示在信息条上（避免重复/噪音）
const HIDDEN_META_KEYS = new Set(['success', 'scope', 'size_bytes', 'items'])
function visibleMetadata(meta: Record<string, any>): Array<[string, any]> {
  return Object.entries(meta).filter(([k]) => !HIDDEN_META_KEYS.has(k))
}

// ===== 文件列表渲染辅助 =====

// 递归扁平化：返回 [{ item, depth }, ...] 用于树状渲染
type FlatFile = { item: FileItem; depth: number }
function flattenFileTree(items: FileItem[]): FlatFile[] {
  const out: FlatFile[] = []
  const walk = (arr: FileItem[], depth: number) => {
    for (const it of arr) {
      out.push({ item: it, depth })
      if (it.children && it.children.length > 0) walk(it.children, depth + 1)
    }
  }
  walk(items, 0)
  return out
}

// 排序：目录在前，文件在后；各自内按 name 不区分大小写
function sortFileItems(items: FileItem[]): FileItem[] {
  const sorted = [...items].sort((a, b) => {
    const ad = a.type === 'directory' ? 0 : 1
    const bd = b.type === 'directory' ? 0 : 1
    if (ad !== bd) return ad - bd
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return sorted.map((it) =>
    it.children && it.children.length > 0
      ? { ...it, children: sortFileItems(it.children) }
      : it
  )
}

// 字节数转人类可读
function formatSize(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// 紧凑化 modTime：2026-06-05 11:49:22 → 06-05 11:49
function formatModTime(s: string | undefined): string {
  if (!s) return '—'
  // 尝试解析 ISO / 常见格式
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})/)
  if (m) return `${m[2]}-${m[3]} ${m[4]}`
  return s.length > 16 ? s.slice(0, 16) : s
}

// 文件项的小图标
function fileIcon(it: FileItem): string {
  if (it.type === 'directory') return '📁'
  if (it.type === 'symlink') return '🔗'
  // 文件：按扩展名粗分
  const ext = it.name.split('.').pop()?.toLowerCase() || ''
  if (['md', 'markdown', 'txt'].includes(ext)) return '📄'
  if (['go', 'py', 'js', 'ts', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'sh'].includes(ext)) return '💻'
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) return '⚙️'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return '🖼️'
  if (['zip', 'tar', 'gz', 'bz2', '7z', 'rar'].includes(ext)) return '📦'
  if (['exe', 'bin'].includes(ext)) return '⚡'
  return '📄'
}

// 排序后的列表 + 递归扁平化
const sortedFileList = computed<FileItem[]>(() => {
  if (parsedResult.value.kind !== 'fileList') return []
  return sortFileItems(parsedResult.value.items)
})

const flatFileRows = computed<FlatFile[]>(() => {
  if (parsedResult.value.kind !== 'fileList') return []
  return flattenFileTree(sortedFileList.value)
})

// 列表头部参数（从 start.params 拿）
const fileListHeaderPath = computed(() => {
  const p = cleanParams(props.start?.params)
  if (p && typeof p.path === 'string') return p.path
  return ''
})
const fileListHeaderPattern = computed(() => {
  const p = cleanParams(props.start?.params)
  if (p && typeof p.pattern === 'string') return p.pattern
  return ''
})

// 渲染前的最终文本：先剥 read 工具加的行号 → 再按文件类型决定是否包成代码块
const renderedText = computed(() => {
  if (parsedResult.value.kind !== 'structured') return ''
  const { text, metadata } = parsedResult.value
  const stripped = stripLineNumbers(text)
  return wrapIfCodeFile(stripped, metadata.path)
})

// 列表来源
const fileListSource = computed<'ls' | 'glob' | ''>(() => {
  if (parsedResult.value.kind !== 'fileList') return ''
  return parsedResult.value.source
})

// 复制路径到剪贴板（用于 pathList 行的 hover 操作）
const copiedPath = ref('')
async function copyPath(path: string) {
  if (!path) return
  try {
    await navigator.clipboard.writeText(path)
    copiedPath.value = path
    setTimeout(() => { copiedPath.value = '' }, 1500)
  } catch (e) {
    console.warn('[ToolExecView] copy path failed:', e)
  }
}

// 统计
const fileListStats = computed(() => {
  if (parsedResult.value.kind !== 'fileList') return { dirs: 0, files: 0, total: 0 }
  let dirs = 0
  let files = 0
  const walk = (arr: FileItem[]) => {
    for (const it of arr) {
      if (it.type === 'directory') dirs++
      else files++
      if (it.children) walk(it.children)
    }
  }
  walk(parsedResult.value.items)
  return { dirs, files, total: dirs + files }
})

// ===== Mermaid 渲染 =====
// 用 useTemplateRef 拿到弹窗 DOM 容器；监听 showDetail/parsedResult，DOM 更新后扫描 .mermaid 节点
const modalDialogRef = useTemplateRef<HTMLElement>('modalDialog')

// 弹窗打开 / 内容变化时，DOM 更新后渲染 mermaid
watch(
  [showDetail, () => props.end?.result, () => props.end?.error],
  async () => {
    if (!showDetail.value) return
    await nextTick()
    await renderMermaidInRoot(modalDialogRef.value)
  },
  { flush: 'post' }
)
</script>

<template>
  <div class="tool-exec-block" :class="{ failed: isFailed }">
    <!-- Header：工具名 + 参数 + 状态 -->
    <div class="exec-header">
      <span class="tool-name">{{ toolName }}</span>

      <!-- 参数预览 -->
      <span v-if="cleanParams(start?.params)" class="params-preview">
        {{ formatParamsPreview(start.params) }}
      </span>

      <!-- 状态：执行中 → spinner + 计时 / 完成 → 时长 + 详情按钮 / 失败 → 红色时长 + 错误按钮 -->
      <template v-if="status === 'executing'">
        <span class="spinner"></span>
        <span class="timer executing">{{ durationText }}</span>
      </template>

      <template v-else-if="isDone && !isFailed">
        <span class="timer done">{{ durationText }}</span>
        <button class="detail-btn" @click="showDetail = true">查看结果</button>
      </template>

      <template v-else-if="isFailed">
        <span class="timer failed">{{ durationText }}</span>
        <button class="error-btn" @click="showDetail = true">查看错误</button>
      </template>
    </div>
  </div>

  <!-- 模态对话框：Markdown 结果 -->
  <Teleport to="body">
    <transition name="modal">
      <div v-if="showDetail" class="modal-overlay" @click.self="showDetail = false">
        <div ref="modalDialog" class="modal-dialog" :class="{ 'dialog-failed': isFailed }">
          <!-- 对话框头部 -->
          <div class="modal-header">
            <span class="modal-title">{{ isFailed ? `${toolName} — 执行失败` : `${toolName} — 执行结果` }}</span>
            <button class="close-btn" @click="showDetail = false">&times;</button>
          </div>

          <!-- 参数（始终在顶部） -->
          <div v-if="cleanParams(start?.params)" class="modal-section modal-params">
            <div class="section-label">参数</div>
            <pre class="params-json"><code>{{ JSON.stringify(cleanParams(start.params), null, 2) }}</code></pre>
          </div>

          <!-- 文件列表结果（ls / glob）：紧凑的列表/树 -->
          <template v-if="parsedResult.kind === 'fileList'">
            <div class="modal-section modal-file-list">
              <!-- 头部：路径 + pattern + 统计 -->
              <div class="file-list-header">
                <span v-if="fileListHeaderPath" class="file-list-path" :title="fileListHeaderPath">
                  {{ fileListSource === 'glob' ? '🔎' : '📁' }} {{ fileListHeaderPath }}
                </span>
                <span v-if="fileListHeaderPattern" class="meta-pill">
                  pattern: <code>{{ fileListHeaderPattern }}</code>
                </span>
                <span class="file-list-stats">
                  {{ fileListStats.total }} 项
                  <template v-if="fileListStats.dirs > 0 && fileListStats.files > 0">
                    · {{ fileListStats.dirs }} 目录 · {{ fileListStats.files }} 文件
                  </template>
                  <template v-else-if="fileListStats.files > 0">
                    · {{ fileListStats.files }} 文件
                  </template>
                </span>
              </div>

              <!-- 空列表 -->
              <div v-if="flatFileRows.length === 0" class="file-list-empty">
                (空目录)
              </div>

              <!-- 列表 -->
              <ul v-else class="file-list">
                <li
                  v-for="(row, idx) in flatFileRows"
                  :key="row.item.path || `${row.item.name}-${idx}`"
                  class="file-row"
                  :class="{ dir: row.item.type === 'directory', 'has-path': row.item.path }"
                >
                  <span class="file-indent" :style="{ width: (row.depth * 16) + 'px' }"></span>
                  <span v-if="row.depth > 0" class="file-tree-prefix">└─</span>
                  <span class="file-icon">{{ fileIcon(row.item) }}</span>
                  <span
                    class="file-name"
                    :class="{ clickable: !!row.item.path }"
                    :title="row.item.path || row.item.name"
                    @click="row.item.path && copyPath(row.item.path)"
                  >
                    {{ row.item.path || row.item.name }}
                  </span>
                  <span
                    v-if="copiedPath && copiedPath === row.item.path"
                    class="file-copied-badge"
                  >已复制</span>
                  <span class="file-size">{{ formatSize(row.item.size) }}</span>
                  <span class="file-mtime">{{ formatModTime(row.item.modTime) }}</span>
                </li>
              </ul>
            </div>
            <div class="modal-section raw-toggle-row">
              <button class="raw-toggle" @click="showRawResult = !showRawResult">
                {{ showRawResult ? '🙈 隐藏原始 JSON' : '🔍 查看原始 JSON' }}
              </button>
              <pre v-if="showRawResult" class="result-json"><code>{{ resultText }}</code></pre>
            </div>
          </template>

          <!-- 结构化结果（如 read 工具）：元数据信息条 + content 主体 -->
          <template v-if="parsedResult.kind === 'structured'">
            <div
              v-if="parsedResult.metadata.path || parsedResult.metadata.has_more || parsedResult.metadata.total_lines !== undefined || parsedResult.note || visibleMetadata(parsedResult.metadata).length > 0"
              class="modal-section modal-meta"
            >
              <div class="meta-row">
                <span
                  v-if="parsedResult.metadata.path"
                  class="meta-pill path"
                  :title="parsedResult.metadata.path"
                >
                  📄 {{ basename(parsedResult.metadata.path) }}
                </span>
                <span
                  v-if="parsedResult.metadata.total_lines !== undefined"
                  class="meta-pill"
                  :title="`文件总行数`"
                >
                  总 {{ parsedResult.metadata.total_lines }} 行
                </span>
                <span
                  v-if="parsedResult.metadata.start_line !== undefined && parsedResult.metadata.lines_read !== undefined"
                  class="meta-pill"
                  :title="`已读取的行范围`"
                >
                  读 {{ parsedResult.metadata.start_line }}–{{ parsedResult.metadata.start_line + parsedResult.metadata.lines_read - 1 }}
                </span>
                <span
                  v-if="parsedResult.metadata.has_more"
                  class="meta-pill warn"
                  :title="`还有更多内容，下一次可从 offset ${parsedResult.metadata.next_offset ?? '?'} 继续`"
                >
                  ⏩ 还有更多 (next offset: {{ parsedResult.metadata.next_offset ?? '?' }})
                </span>
                <!-- 兜底：其它没在白名单里的元数据键 -->
                <span
                  v-for="[k, v] in visibleMetadata(parsedResult.metadata).filter(([k]) => !['path','total_lines','start_line','lines_read','has_more','next_offset'].includes(k))"
                  :key="k"
                  class="meta-pill subtle"
                  :title="`${k}: ${v}`"
                >
                  {{ k }}: {{ String(v) }}
                </span>
              </div>
              <div v-if="parsedResult.note" class="meta-note">
                💡 {{ parsedResult.note }}
              </div>
            </div>
            <div class="modal-section modal-result">
              <div class="result-md markdown-body" v-html="md.render(renderedText)"></div>
            </div>
            <div class="modal-section raw-toggle-row">
              <button class="raw-toggle" @click="showRawResult = !showRawResult">
                {{ showRawResult ? '🙈 隐藏原始' : '🔍 查看原始 JSON' }}
              </button>
              <pre v-if="showRawResult" class="result-json"><code>{{ resultText }}</code></pre>
            </div>
          </template>

          <!-- 纯文本结果：原样渲染为 Markdown -->
          <template v-else-if="parsedResult.kind === 'text'">
            <div class="modal-section modal-result">
              <div class="result-md markdown-body" v-html="md.render(parsedResult.text)"></div>
            </div>
          </template>

          <!-- 纯 JSON 结果（无 content 字段）：代码块展示 -->
          <template v-else-if="parsedResult.kind === 'json'">
            <div class="modal-section modal-result">
              <pre class="result-json"><code>{{ JSON.stringify(parsedResult.value, null, 2) }}</code></pre>
            </div>
          </template>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* ===== 工具块 ===== */
.tool-exec-block {
  width: 100%;
  margin-left: 0px;
}

.exec-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  flex-wrap: wrap;
}

/* 失败状态：红色 */
.failed .exec-header {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.25);
}

.tool-name {
  font-size: 13px;
  font-weight: 600;
  color: #60a5fa;
  font-family: 'JetBrains Mono', monospace;
}

.failed .tool-name {
  color: #f87171;
}

.params-preview {
  font-size: 11px;
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 执行中动画 */
.spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin .8s linear infinite;
  flex-shrink: 0;
}

.hint-text {
  font-size: 11.5px; color: #64748b; font-style: italic;
}

/* 计时器 */
.timer {
  font-size: 11.5px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  flex-shrink: 0;
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 4px;
}
.timer.executing {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
}
.timer.done {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}
.timer.failed {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
}

@keyframes spin { to { transform: rotate(360deg); } }

/* 按钮 */
.detail-btn {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
}
.detail-btn:hover { background: rgba(59, 130, 246, 0.18); }

.error-btn {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
}
.error-btn:hover { background: rgba(239, 68, 68, 0.18); }

/* ===== 模态对话框 ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.modal-dialog {
  width: min(780px, 90vw);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, #1a1b2e);
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.dialog-failed {
  border-color: rgba(239, 68, 68, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
  flex-shrink: 0;
}

.dialog-failed .modal-header {
  border-bottom-color: rgba(239, 68, 68, 0.15);
  background: rgba(239, 68, 68, 0.04);
}

.modal-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e2e8f0);
}

.close-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: #94a3b8;
  background: none; border: none; border-radius: 6px; cursor: pointer;
  transition: all 0.15s;
}
.close-btn:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }

.modal-section {
  padding: 16px 18px;
  overflow-y: auto;
}

.modal-params {
  border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
  flex-shrink: 0;
}

.modal-meta {
  background: rgba(59, 130, 246, 0.04);
  border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
  flex-shrink: 0;
  padding: 10px 18px;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 999px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-pill.path { max-width: 360px; }
.meta-pill.warn {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.25);
}
.meta-pill.subtle {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.18);
}

.meta-note {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-muted, #94a3b8);
  font-style: italic;
}

.raw-toggle-row {
  padding: 8px 18px 14px;
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));
  background: rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}

.raw-toggle {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
  background: none;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 5px;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.raw-toggle:hover {
  color: #e2e8f0;
  border-color: rgba(148, 163, 184, 0.4);
  background: rgba(148, 163, 184, 0.08);
}

.result-json {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(55, 65, 81, 0.5);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: #a5b4fc;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.result-json code { background: none; padding: 0; border: none; color: inherit; }

/* ===== 文件列表（ls / glob） ===== */
.modal-file-list {
  padding: 0;
  background: rgba(15, 18, 28, 0.4);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.file-list-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  background: rgba(59, 130, 246, 0.05);
  border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
  font-size: 11.5px;
  font-family: 'JetBrains Mono', monospace;
  color: #cbd5e1;
  flex-shrink: 0;
}
.file-list-path {
  flex: 1;
  min-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #93c5fd;
}
.file-list-path code { color: inherit; }
.file-list-stats {
  color: #94a3b8;
  font-size: 11px;
  white-space: nowrap;
}

.file-list-empty {
  padding: 40px 20px;
  text-align: center;
  color: #64748b;
  font-style: italic;
  font-size: 12px;
}

.file-list {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.7;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 18px 2px 6px;
  color: #cbd5e1;
  border-radius: 0;
  transition: background 0.1s;
}
.file-row:hover { background: rgba(59, 130, 246, 0.06); }
.file-row.dir { color: #fde68a; }
.file-row.dir:hover { background: rgba(245, 158, 11, 0.08); }

.file-indent { display: inline-block; flex-shrink: 0; }
.file-tree-prefix {
  color: #475569;
  margin-right: 2px;
  flex-shrink: 0;
  font-size: 11px;
}
.file-icon {
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  font-size: 12px;
}
.file-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}
.file-name.clickable { cursor: pointer; }
.file-name.clickable:hover { text-decoration: underline; color: #fff; }

.file-copied-badge {
  font-size: 10px;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  animation: fadeOut 1.5s ease-in forwards;
}

.file-size {
  flex-shrink: 0;
  width: 64px;
  text-align: right;
  color: #64748b;
  font-size: 11px;
}
.file-mtime {
  flex-shrink: 0;
  width: 96px;
  text-align: right;
  color: #64748b;
  font-size: 11px;
}

@keyframes fadeOut {
  0%, 70% { opacity: 1; }
  100% { opacity: 0; }
}

/* ===== Mermaid 图表容器 ===== */
.result-md :deep(.mermaid) {
  background: #161b22;
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 8px;
  padding: 16px;
  margin: 10px 0;
  overflow-x: auto;
  text-align: center;
  min-height: 60px;
}
.result-md :deep(.mermaid svg) {
  max-width: 100%;
  height: auto;
}
/* mermaid 渲染失败时（语法错误）会回退显示原始文本，做个明显警示 */
.result-md :deep(.mermaid[data-processed="error"]) {
  border-color: rgba(248, 81, 73, 0.4);
  background: rgba(248, 81, 73, 0.05);
  color: #fca5a5;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  white-space: pre-wrap;
  text-align: left;
}

.section-label {
  font-size: 11px; font-weight: 600; color: #f59e0b;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;
}

.params-json {
  margin: 0; padding: 10px 12px; border-radius: 6px;
  background: rgba(245, 158, 11, 0.06); border: 1px solid rgba(245, 158, 11, 0.12);
  font-family: 'JetBrains Mono', monospace; font-size: 11.5px; line-height: 1.5;
  color: #fbbf24; overflow-x: auto;
}
.params-json code { background: none; padding: 0; border: none; color: inherit; }

.modal-result {
  flex: 1;
  min-height: 0;          /* 关键：允许 flex 子项收缩到比内容小，使 overflow-y: auto 生效 */
  overflow-y: auto;
}

.result-md {
  font-size: 13px; line-height: 1.65; color: var(--text-secondary, #94a3b8);
}
.result-md :deep(h1),.result-md :deep(h2),.result-md :deep(h3) {
  color: var(--text-primary); font-weight: 600; margin: 10px 0 4px;
}
.result-md :deep(h1){font-size:15px} .result-md :deep(h2){font-size:14px} .result-md :deep(h3){font-size:13px}
.result-md :deep(p){margin:4px 0} .result-md :deep(strong){color:var(--text-primary);font-weight:600}
.result-md :deep(code){
  font-family:'JetBrains Mono',monospace;font-size:12px;
  background:rgba(59,130,246,.1);color:#60a5fa;padding:2px 6px;border-radius:4px;border:1px solid rgba(59,130,246,.15);
}
.result-md :deep(.code-block){
  background:var(--bg-secondary,#161727);border:1px solid rgba(55,65,81,.5);border-radius:8px;padding:12px;margin:8px 0;
  overflow-x:auto;overflow-y:auto;max-height:60vh;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.5;color:#e2e8f0;
}
.result-md :deep(.code-block) code{background:none;padding:0;border:none}
.result-md :deep(ul),.result-md :deep(ol){padding-left:20px;margin:4px 0}
.result-md :deep(li){margin:2px 0}
.result-md :deep(a){color:#60a5fa;text-decoration:none}
.result-md :deep(a:hover){text-decoration:underline}
.result-md :deep(blockquote){
  border-left:3px solid #3b82f6;padding-left:12px;margin:8px 0;color:var(--text-muted);font-style:italic;
}

/* 动画 */
.modal-enter-active { transition: opacity 0.2s ease-out; }
.modal-enter-active .modal-dialog { transition: transform 0.2s ease-out, opacity 0.2s ease-out; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .modal-dialog { transform: scale(0.96); opacity: 0; }
.modal-leave-active { transition: opacity 0.15s ease-in; }
.modal-leave-to { opacity: 0; }
</style>
