<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import MarkdownIt from 'markdown-it'

interface ActionStep {
  toolName: string
  status: 'executing' | 'done' | 'failed'
  estimatedTok?: number
  duration?: number
  params?: Record<string, any>
  resultText?: string
  collapsed?: boolean
}

const props = defineProps({
  steps: {
    type: Array as () => ActionStep[],
    default: () => []
  },
  toolCount: {
    type: Number,
    default: 0
  },
  toolNames: {
    type: Array as () => string[],
    default: () => []
  },
  totalPredictedTokens: {
    type: Number,
    default: 0
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  successCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  totalDuration: {
    type: Number,
    default: 0
  }
})

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str: string, lang: string) {
    return `<pre class="code-block"><code class="language-${lang || 'text'}">${md.utils.escapeHtml(str)}</code></pre>`
  }
})

const stepResultStreams = ref<Record<number, string>>({})

watch(() => props.steps, (newSteps) => {
  newSteps.forEach((step, index) => {
    if (step.resultText && stepResultStreams.value[index] !== step.resultText) {
      stepResultStreams.value[index] = step.resultText
    }
    if (step.status === 'done' || step.status === 'failed') {
      if (step.collapsed === undefined) {
        step.collapsed = true
      }
    }
  })
}, { deep: true, immediate: true })

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m${s}s`
}

function formatParams(params?: Record<string, any>): string {
  if (!params || Object.keys(params).length === 0) return ''
  return Object.entries(params)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(', ')
}

function renderMarkdown(text: string): string {
  if (!text) return ''
  return md.render(text)
}

function toggleStep(index: number) {
  if (props.steps[index]) {
    props.steps[index].collapsed = !props.steps[index].collapsed
  }
}
</script>

<template>
  <div class="action-block" v-if="steps.length > 0 || !isCompleted">
    <div
      v-for="(step, index) in steps"
      :key="index"
      class="step-item"
      :class="step.status"
    >
      <div class="step-header" @click="step.status !== 'executing' ? toggleStep(index) : null">
        <span class="tool-call">
          <template v-if="step.toolName">
            {{ step.toolName }}
            <template v-if="formatParams(step.params)">
              ({{ formatParams(step.params) }})
            </template>
          </template>
          <template v-else-if="step.resultText">
            工具执行结果
          </template>
        </span>
        <span class="step-meta">
          <span v-if="step.duration" class="duration">{{ formatDuration(step.duration) }}</span>
          <span v-if="step.status === 'executing'" class="loading-spinner"></span>
          <span v-else-if="step.status === 'done'" class="status-badge done">✓</span>
          <span v-else-if="step.status === 'failed'" class="status-badge failed">✗</span>
          <span v-if="step.status !== 'executing' && (step.resultText || stepResultStreams[index])" class="expand-toggle">
            {{ step.collapsed ? '展开' : '收起' }}
          </span>
        </span>
      </div>

      <transition name="result-expand">
        <div class="step-result" v-if="!step.collapsed && (step.resultText || stepResultStreams[index]) && step.status !== 'executing'">
          <div class="result-content markdown-body" v-html="renderMarkdown(step.resultText || stepResultStreams[index] || '')"></div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.action-block {
  max-width: 85%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-item {
  border-left: 2px solid rgba(59, 130, 246, 0.3);
  padding-left: 12px;
}

.step-item.done {
  border-left-color: rgba(16, 185, 129, 0.4);
}

.step-item.failed {
  border-left-color: rgba(239, 68, 68, 0.4);
}

.step-item.executing {
  border-left-color: rgba(59, 130, 246, 0.5);
}

.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  cursor: default;
}

.step-item:not(.executing) .step-header {
  cursor: pointer;
}

.tool-call {
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-primary);
}

.step-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.duration {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: #64748b;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-badge {
  font-size: 12px;
  font-weight: 600;
}

.status-badge.done {
  color: #10b981;
}

.status-badge.failed {
  color: #ef4444;
}

.expand-toggle {
  font-size: 11px;
  color: #60a5fa;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  transition: background 0.2s ease;
}

.expand-toggle:hover {
  background: rgba(96, 165, 250, 0.1);
}

.step-result {
  padding: 8px 0 8px 0;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
  margin-top: 4px;
}

.result-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.result-content :deep(h1),
.result-content :deep(h2),
.result-content :deep(h3) {
  color: var(--text-primary);
  font-weight: 600;
  margin: 8px 0 4px;
}

.result-content :deep(h1) { font-size: 15px; }
.result-content :deep(h2) { font-size: 14px; }
.result-content :deep(h3) { font-size: 13px; }

.result-content :deep(p) {
  margin: 4px 0;
}

.result-content :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.result-content :deep(em) {
  font-style: italic;
  color: #22d3ee;
}

.result-content :deep(code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  background: rgba(59, 130, 246, 0.1);
  color: #60a5fa;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(59, 130, 246, 0.15);
}

.result-content :deep(.code-block) {
  background: var(--bg-secondary);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: #60a5fa;
}

.result-content :deep(.code-block) code {
  background: none;
  padding: 0;
  border: none;
}

.result-content :deep(ul),
.result-content :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}

.result-content :deep(li) {
  margin: 2px 0;
}

.result-content :deep(blockquote) {
  border-left: 3px solid #3b82f6;
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-muted);
  font-style: italic;
}

.result-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.result-content :deep(th),
.result-content :deep(td) {
  border: 1px solid rgba(55, 65, 81, 0.5);
  padding: 6px 10px;
  text-align: left;
}

.result-content :deep(th) {
  background: rgba(59, 130, 246, 0.08);
  font-weight: 600;
}

.result-expand-enter-active {
  transition: all 0.3s ease-out;
}

.result-expand-leave-active {
  transition: all 0.2s ease-in;
}

.result-expand-enter-from {
  opacity: 0;
  max-height: 0;
}

.result-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.result-expand-enter-to {
  opacity: 1;
  max-height: 2000px;
}

.result-expand-leave-from {
  opacity: 1;
  max-height: 2000px;
}
</style>