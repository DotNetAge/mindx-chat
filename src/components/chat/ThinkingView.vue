<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

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
  durationMs: {
    type: Number,
    default: 0
  }
})

// 思考中展开，完成后可折叠
const isCollapsed = ref(false)
const bodyRef = ref<HTMLElement | null>(null)

// ===== 计时器 =====
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

// 最终显示的时长：完成时优先用 props.durationMs（来自历史恢复），否则用客户端计时
const displayDuration = computed(() => {
  if (props.durationMs) return formatDuration(props.durationMs)
  if (props.isActive) return formatDuration(elapsedMs.value)
  return ''
})

watch(() => props.isActive, (active) => {
  if (active) {
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
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (timerHandle) clearInterval(timerHandle)
})

watch(() => props.isComplete, (complete) => {
  if (complete) isCollapsed.value = true
})

watch(() => props.isActive, (active) => {
  if (active) isCollapsed.value = false
})

const displayContent = computed(() => props.content || props.pending || '')

// 核心需求：流式输出时内容溢出 → 自动滚到底部
watch(() => displayContent.value, async () => {
  if (!props.isActive || !bodyRef.value) return
  await nextTick()
  const el = bodyRef.value
  if (el.scrollHeight > el.clientHeight) {
    el.scrollTop = el.scrollHeight - el.clientHeight
  }
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="thinking-block" v-if="displayContent">
    <!-- Header：死文字 + 状态动画 + 折叠 toggle -->
    <div class="thinking-header" @click="toggleCollapse">
      <span class="header-icon">💭</span>
      <span class="header-label">{{ t('message.thinking') }}</span>
      <span v-if="displayDuration" class="thinking-timer" :class="{ active: isActive, done: isComplete }">{{ displayDuration }}</span>
      <span v-if="isActive" class="loading-spinner"></span>
      <span v-else class="collapse-icon">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>

    <!-- Body：最多5行，overflow 滚动 -->
    <transition name="collapse">
      <div v-if="!isCollapsed" class="thinking-body" ref="bodyRef">
        <pre class="thinking-content">{{ displayContent }}</pre>
        <span v-if="isActive" class="streaming-cursor">▌</span>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.thinking-header {
  margin-left: 0px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(100, 116, 139, 0.08);
  border: 1px solid rgba(100, 116, 139, 0.18);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.thinking-header:hover {
  background: rgba(100, 116, 139, 0.14);
}

.header-icon {
  font-size: 13px;
}

.header-label {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  flex: 1;
}

.loading-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(100, 116, 139, 0.25);
  border-top-color: #64748b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.thinking-timer {
  font-size: 11.5px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
}
.thinking-timer.active {
  color: #94a3b8;
  background: rgba(100, 116, 139, 0.1);
}
.thinking-timer.done {
  color: #64748b;
  background: rgba(100, 116, 139, 0.08);
}

.collapse-icon {
  font-size: 10px;
  color: #94a3b8;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Body：max-height 约束5行，超出滚动 */
.thinking-body {
  margin-left: 0px;
  margin-top: 10px;
  max-height: calc(1.7em * 5 + 20px); /* 5行 + padding */
  overflow-y: auto;
  position: relative;
  scroll-behavior: smooth;
}

.thinking-content {
  margin: 0;
  padding: 10px 14px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  white-space: pre-wrap;
  word-break: break-word;
  border-left: 2px solid rgba(100, 116, 139, 0.3);
  border-radius: 0 6px 6px 0;
  background: rgba(30, 20, 50, 0.4);
}

.streaming-cursor {
  animation: blink 1s step-end infinite;
  color: #94a3b8;
  font-size: 13px;
  margin-left: 2px;
}

@keyframes blink { 50% { opacity: 0; } }

/* 折叠动画 */
.collapse-enter-active { transition: all 0.25s ease-out; }
.collapse-leave-active { transition: all 0.2s ease-in; }
.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}
</style>
