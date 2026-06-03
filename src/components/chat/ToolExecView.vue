<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import MarkdownIt from 'markdown-it'

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

const md = new MarkdownIt({ html: true, linkify: true, typographer: true })

const resultText = computed(() => {
  const e = props.end
  if (!e) return ''
  return e.result || e.error || ''
})
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
        <div class="modal-dialog" :class="{ 'dialog-failed': isFailed }">
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

          <!-- Markdown 结果 -->
          <div class="modal-section modal-result">
            <div class="result-md markdown-body" v-html="md.render(resultText)"></div>
          </div>
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
  overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.5;color:#60a5fa;
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
