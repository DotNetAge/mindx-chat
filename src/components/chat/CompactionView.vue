<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  sessionID: {
    type: String,
    default: ''
  },
  messagesSlid: {
    type: Number,
    default: 0
  },
  remainingAfter: {
    type: Number,
    default: 0
  },
  windowSize: {
    type: Number,
    default: 0
  }
})

const usageRatio = computed(() => {
  if (!props.windowSize) return 0
  return Math.min((props.remainingAfter / props.windowSize) * 100, 100)
})

const usagePercent = computed(() => usageRatio.value.toFixed(1))

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

const compactedPercent = computed(() => {
  const total = props.messagesSlid + props.remainingAfter
  if (!total) return 0
  return ((props.messagesSlid / total) * 100).toFixed(1)
})
</script>

<template>
  <div class="compaction-view">
    <div class="compaction-header">
      <div class="header-left">
        <div class="compaction-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-8-2h4v2h-4V4z" 
                  fill="currentColor"/>
          </svg>
        </div>
        <h3 class="compaction-title">上下文压缩</h3>
      </div>

      <div class="header-right">
        <span v-if="sessionID" class="session-tag" :title="sessionID">
          {{ sessionID.slice(0, 8) }}
        </span>
      </div>
    </div>

    <div class="compaction-body">
      <div class="window-bar-section">
        <div class="bar-labels">
          <span class="bar-label">上下文窗口</span>
          <span class="bar-value">{{ formatNumber(remainingAfter) }} / {{ formatNumber(windowSize) }}</span>
        </div>
        <div class="window-bar-track">
          <div 
            class="window-bar-fill" 
            :style="{ width: `${usageRatio}%` }"
          ></div>
          <div 
            class="window-bar-glow"
            :style="{ width: `${usageRatio}%` }"
          ></div>
        </div>
        <div class="bar-footer">
          <span class="usage-text">占用率</span>
          <span class="usage-percent">{{ usagePercent }}%</span>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-icon compressed">📦</span>
          <div class="stat-info">
            <span class="stat-value">{{ formatNumber(messagesSlid) }}</span>
            <span class="stat-label">已压缩消息</span>
          </div>
          <span class="stat-badge compressed">{{ compactedPercent }}%</span>
        </div>

        <div class="stat-divider"></div>

        <div class="stat-item">
          <span class="stat-icon remaining">📋</span>
          <div class="stat-info">
            <span class="stat-value">{{ formatNumber(remainingAfter) }}</span>
            <span class="stat-label">保留消息</span>
          </div>
        </div>

        <div class="stat-divider"></div>

        <div class="stat-item">
          <span class="stat-icon total">🪟</span>
          <div class="stat-info">
            <span class="stat-value">{{ formatNumber(windowSize) }}</span>
            <span class="stat-label">窗口大小</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compaction-view {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.06), rgba(99, 102, 241, 0.04));
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px;
  overflow: hidden;
  animation: compaction-enter 0.35s ease-out;
}

@keyframes compaction-enter {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.compaction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.12);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.compaction-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.compaction-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-tag {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.12);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.2);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compaction-body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.window-bar-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-labels {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bar-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.bar-value {
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: #93c5fd;
}

.window-bar-track {
  position: relative;
  height: 8px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.window-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #6366f1);
  border-radius: 4px;
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.window-bar-glow {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #6366f1);
  border-radius: 4px;
  filter: blur(4px);
  opacity: 0.4;
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.bar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.usage-text {
  font-size: 10px;
  color: var(--text-muted);
}

.usage-percent {
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: #60a5fa;
}

.stats-grid {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 16px;
}

.stat-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.stat-icon {
  font-size: 16px;
  flex-shrink: 0;
  line-height: 1;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

.stat-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.stat-badge.compressed {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.25);
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: var(--border-color);
  flex-shrink: 0;
}
</style>
