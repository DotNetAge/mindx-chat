<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

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
  }
})

// 思考中展开，完成后可折叠
const isCollapsed = ref(false)
const bodyRef = ref<HTMLElement | null>(null)

watch(() => props.isComplete, (complete) => {
  if (complete) isCollapsed.value = true
})

watch(() => props.isActive, (active) => {
  if (active) isCollapsed.value = false
})

// 核心需求：流式输出时内容溢出 → 自动滚到底部
watch(() => displayContent.value, async () => {
  if (!props.isActive || !bodyRef.value) return
  await nextTick()
  const el = bodyRef.value
  if (el.scrollHeight > el.clientHeight) {
    el.scrollTop = el.scrollHeight - el.clientHeight
  }
})

const displayContent = computed(() => props.content || props.pending || '')

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="thinking-block" v-if="displayContent">
    <!-- Header：死文字 + 状态动画 + 折叠 toggle -->
    <div class="thinking-header" @click="toggleCollapse">
      <span class="header-icon">💭</span>
      <span class="header-label">思考过程</span>
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
  margin-left: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.18);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.thinking-header:hover {
  background: rgba(167, 139, 250, 0.14);
}

.header-icon {
  font-size: 13px;
}

.header-label {
  font-size: 12px;
  font-weight: 600;
  color: #a78bfa;
  flex: 1;
}

.loading-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(167, 139, 250, 0.25);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.collapse-icon {
  font-size: 10px;
  color: #a78bfa;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Body：max-height 约束5行，超出滚动 */
.thinking-body {
  margin-top: 4px;
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
  color: #c4b5fd;
  font-family: 'JetBrains Mono', monospace;
  white-space: pre-wrap;
  word-break: break-word;
  border-left: 2px solid rgba(167, 139, 250, 0.3);
  border-radius: 0 6px 6px 0;
  background: rgba(30, 20, 50, 0.4);
}

.streaming-cursor {
  animation: blink 1s step-end infinite;
  color: #a78bfa;
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
