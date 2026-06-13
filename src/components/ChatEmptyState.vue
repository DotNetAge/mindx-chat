<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, tm } = useI18n()

defineProps<{
  isConnected: boolean
  isOfflineMode: boolean
  sessionsLength: number
}>()

const emit = defineEmits<{
  sendPrompt: [text: string]
}>()

// ── 随机任务列表 ──
const actionPool = computed(() => tm('chat.quickActions') as string[])
const shuffledActions = ref<string[]>([])

function pickRandom(arr: string[], n: number): string[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

onMounted(() => {
  shuffledActions.value = pickRandom(actionPool.value, 3)
})
</script>

<template>
  <div class="empty-state">
    <div class="empty-visual">
      <svg width="120" height="120" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="emptyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4"/>
            <stop offset="50%" stop-color="#8b5cf6"/>
            <stop offset="100%" stop-color="#10b981"/>
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10" stroke="url(#emptyGrad)" stroke-width="0.5" opacity="0.3"/>
        <path d="M12 6v6l4 2" stroke="url(#emptyGrad)" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
        <circle cx="12" cy="12" r="2" fill="url(#emptyGrad)" opacity="0.8"/>
      </svg>
    </div>

    <h3 class="empty-title">{{ !isOfflineMode && isConnected ? t('chat.welcome.startChat') : (sessionsLength > 0 ? t('chat.welcome.selectOrCreate') : t('chat.welcome.default')) }}</h3>

    <p class="empty-desc">
      <template v-if="!isOfflineMode && isConnected">
        {{ t('chat.welcome.description') }}
      </template>
      <template v-else-if="isOfflineMode">
        {{ t('chat.welcome.offlineHint') }}
      </template>
      <template v-else>
        {{ t('chat.welcome.connecting') }}
      </template>
    </p>

    <!-- 快速行动列表 -->
    <div class="quick-actions" v-if="!isOfflineMode && isConnected && shuffledActions.length > 0">
      <div class="action-items">
        <div
          v-for="(action, idx) in shuffledActions"
          :key="idx"
          class="action-item"
          @click="emit('sendPrompt', action)"
        >
          <span class="action-icon">▶</span>
          <span class="action-text">{{ action }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 48px;
  text-align: center;
  gap: 18px;
}

.empty-visual {
  opacity: 0.4;
  margin-bottom: 8px;
}

.empty-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text-primary);
}

.empty-desc {
  font-size: 14px;
  color: var(--text-muted);
  max-width: 420px;
  line-height: 1.65;
}

/* ── 快速行动列表 ── */
.quick-actions {
  margin-top: 8px;
}

.action-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 18px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: rgba(15, 23, 42, 0.4);
  cursor: pointer;
  transition: all 0.2s ease;
  max-width: 380px;
}

.action-item:hover {
  border-color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.08);
  transform: translateY(-1px);
}

.action-icon {
  font-size: 8px;
  color: var(--accent-cyan);
  opacity: 0.6;
  flex-shrink: 0;
}

.action-text {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-item:hover .action-text {
  color: var(--accent-cyan);
}
</style>
