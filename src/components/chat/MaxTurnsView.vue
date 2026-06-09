<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  turnsCompleted: {
    type: Number,
    default: 0
  },
  maxTurns: {
    type: Number,
    default: 10
  },
  suggestion: {
    type: String,
    default: ''
  }
})

const progressPercent = computed(() => {
  if (props.maxTurns <= 0) return 100
  return Math.min(100, Math.round((props.turnsCompleted / props.maxTurns) * 100))
})

const isOverLimit = computed(() => props.turnsCompleted >= props.maxTurns)

function getProgressColor() {
  const pct = progressPercent.value
  if (pct >= 100) return '#f59e0b'
  if (pct >= 80) return '#fbbf24'
  return '#fcd34d'
}
</script>

<template>
  <div class="max-turns-view">
    <div class="warning-header">
      <div class="warning-icon">
        <span class="icon-inner">⚠️</span>
      </div>

      <div class="warning-content">
        <h4 class="warning-title">达到最大轮次</h4>
        <p class="warning-desc">
          对话已达到预设的最大交互轮次限制
        </p>
      </div>

      <div class="turns-indicator">
        <svg class="progress-ring" width="52" height="52" viewBox="0 0 52 52">
          <circle
            class="progress-ring-bg"
            cx="26"
            cy="26"
            r="22"
            fill="none"
            stroke-width="4"
          />
          <circle
            class="progress-ring-fill"
            cx="26"
            cy="26"
            r="22"
            fill="none"
            stroke-width="4"
            :stroke-dasharray="138.23"
            :stroke-dashoffset="138.23 * (1 - progressPercent / 100)"
            :style="{ stroke: getProgressColor() }"
          />
        </svg>
        <div class="turns-label">
          <span class="turns-current">{{ turnsCompleted }}</span>
          <span class="turns-separator">/</span>
          <span class="turns-max">{{ maxTurns }}</span>
        </div>
      </div>
    </div>

    <div class="turns-detail">
      <div class="detail-row">
        <span class="detail-key">已完成轮次</span>
        <span class="detail-value turns-value">{{ turnsCompleted }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">上限</span>
        <span class="detail-value limit-value">{{ maxTurns }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">状态</span>
        <span class="detail-value status-badge" :class="{ over: isOverLimit }">
          {{ isOverLimit ? '已达上限' : '接近上限' }}
        </span>
      </div>
    </div>

    <div class="suggestion-block" v-if="suggestion">
      <div class="suggestion-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" fill="currentColor"/>
        </svg>
        <span>{{ t('maxTurnsView.suggestion') }}</span>
      </div>
      <p class="suggestion-text">{{ suggestion }}</p>
    </div>
  </div>
</template>

<style scoped>
.max-turns-view {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.07), rgba(251, 191, 36, 0.04));
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(245, 158, 11, 0.08);
  animation: slide-in 0.35s ease-out;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.warning-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 20px;
  background: rgba(245, 158, 11, 0.04);
}

.warning-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
}

.icon-inner {
  font-size: 18px;
  line-height: 1;
}

.warning-content {
  flex: 1;
  min-width: 0;
}

.warning-title {
  font-size: 15px;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: -0.3px;
  margin-bottom: 5px;
}

.warning-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
}

.turns-indicator {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-ring {
  position: absolute;
  inset: 0;
  transform: rotate(-90deg);
}

.progress-ring-bg {
  stroke: rgba(245, 158, 11, 0.15);
}

.progress-ring-fill {
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s ease, stroke 0.3s ease;
}

.turns-label {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 1px;
  font-family: 'JetBrains Mono', monospace;
}

.turns-current {
  font-size: 15px;
  font-weight: 700;
  color: #fbbf24;
}

.turns-separator {
  font-size: 12px;
  color: var(--text-muted);
}

.turns-max {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.turns-detail {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  padding: 0 20px;
  margin-top: 14px;
  background: rgba(245, 158, 11, 0.1);
}

.detail-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--bg-card, rgba(17, 24, 39, 0.6));
}

.detail-key {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}

.detail-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 700;
}

.turns-value {
  color: #fbbf24;
}

.limit-value {
  color: var(--text-secondary);
}

.status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(251, 191, 36, 0.15);
  color: #fcd34d;
  border: 1px solid rgba(251, 191, 36, 0.25);
}

.status-badge.over {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.35);
}

.suggestion-block {
  margin: 14px 20px 18px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.05));
  border: 1px solid rgba(245, 158, 11, 0.18);
  border-radius: 10px;
}

.suggestion-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: #fcd34d;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.suggestion-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  margin: 0;
  word-break: break-word;
}
</style>
