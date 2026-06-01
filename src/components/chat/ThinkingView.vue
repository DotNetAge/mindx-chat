<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  pending: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isComplete: {
    type: Boolean,
    default: false
  },
  tokensIn: {
    type: Number,
    default: 0
  },
  tokensOut: {
    type: Number,
    default: 0
  },
  reasoning: {
    type: String,
    default: ''
  },
  duration: {
    type: Number,
    default: 0
  }
})

const isCollapsed = ref(true)
const displayContent = computed(() => props.content || props.pending)

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m${s}s`
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="thinking-stream" v-if="content || pending">
    <div class="stream-text">{{ displayContent }}</div>
    <div class="streaming-cursor" v-if="isActive">▌</div>
  </div>
</template>

<style scoped>
.thinking-stream {
  padding: 8px 0;
  font-size: 13px;
  line-height: 1.7;
  color: #a78bfa;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'JetBrains Mono', monospace;
  display: flex;
  align-items: flex-end;
}

.stream-text {
  flex: 1;
}

.streaming-cursor {
  animation: blink 1s step-end infinite;
  color: #8b5cf6;
  font-size: 13px;
  flex-shrink: 0;
}

@keyframes blink {
  50% { opacity: 0; }
}
</style>
