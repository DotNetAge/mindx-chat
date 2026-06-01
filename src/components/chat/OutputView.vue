<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownIt from 'markdown-it'

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
  duration: {
    type: Number,
    default: 0
  }
})

const showRaw = ref(false)
const copySuccess = ref(false)

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str: string, lang: string) {
    return `<pre class="code-block"><code class="language-${lang || 'text'}">${md.utils.escapeHtml(str)}</code></pre>`
  }
})

const formattedContent = computed(() => {
  if (!props.content) return ''
  if (props.format === 'raw') return props.content
  return md.render(props.content)
})

async function copyToClipboard() {
  if (navigator.clipboard && props.content) {
    await navigator.clipboard.writeText(props.content)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  }
}
</script>

<template>
  <div class="output-content" v-if="content">
    <div v-if="!showRaw" class="formatted-content markdown-body" v-html="formattedContent"></div>
    <pre v-else class="raw-content"><code>{{ content }}</code></pre>

    <div class="actions">
      <button class="action-btn" @click.stop="copyToClipboard" title="复制">
        <el-icon><CopyDocument /></el-icon>
        <span v-if="copySuccess" class="copy-success">✓</span>
      </button>
      <button class="action-btn" @click.stop="showRaw = !showRaw" title="原始">
        <el-icon><Document /></el-icon>
      </button>
    </div>

    <div class="meta" v-if="tokensOut > 0 || duration">
      <span v-if="tokensOut > 0" class="meta-item">{{ tokensOut }} tokens</span>
      <span v-if="duration" class="meta-item">{{ duration }}ms</span>
    </div>
  </div>
</template>

<style scoped>
.output-block {
  width: 100%;
}

.output-content {
  padding: 12px 18px;
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(6, 182, 212, 0.05));
  border: 1px solid rgba(6, 182, 212, 0.2);
  border-radius: 12px;
}

.actions {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.output-block:hover .actions {
  opacity: 1;
}

.action-btn {
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
}

.action-btn:hover {
  background: rgba(6, 182, 212, 0.2);
  color: #22d3ee;
}

.copy-success {
  font-size: 10px;
  color: #10b981;
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
  color: #22d3ee;
}

.formatted-content :deep(.code-block) code {
  background: none;
  padding: 0;
  border: none;
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
