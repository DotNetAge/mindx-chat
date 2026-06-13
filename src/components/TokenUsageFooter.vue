<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const { t } = useI18n()

const formatNumber = (num: number): string => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

const formatCost = (cost: number): string => {
  if (cost < 0.01) return '¥0.00'
  return '¥' + cost.toFixed(2)
}

const sessionTokens = computed(() => formatNumber(chatStore.sessionTokensUsed))
const sessionCost = computed(() => formatCost(chatStore.sessionCost))
const totalTokens = computed(() => formatNumber(chatStore.totalTokensUsed))
const totalCost = computed(() => formatCost(chatStore.totalCost))
const totalConversations = computed(() => chatStore.totalConversations)
</script>

<template>
  <div class="token-usage-footer">
    <div class="stat-group session">
      <div class="stat-item">
        <span class="stat-label">{{ t('tokenUsage.footerSessions') }}</span>
        <span class="stat-value">{{ sessionTokens }}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-label">{{ t('tokenUsage.footerCost') }}</span>
        <span class="stat-value cost">{{ sessionCost }}</span>
      </div>
    </div>

    <div class="stat-separator"></div>

    <div class="stat-group total">
      <div class="stat-item">
        <span class="stat-label">{{ t('tokenUsage.footerTotal') }}</span>
        <span class="stat-value">{{ totalTokens }}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-label">{{ t('tokenUsage.footerCost') }}</span>
        <span class="stat-value cost">{{ totalCost }}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-label">{{ t('tokenUsage.footerDialogues') }}</span>
        <span class="stat-value">{{ totalConversations }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.token-usage-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 16px;
  background: rgba(6, 182, 212, 0.05);
  border-top: 1px solid rgba(55, 65, 81, 0.5);
}

.stat-group {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 10px;
  border-radius: 8px;
}

.stat-group.session {
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
}

.stat-group.total {
  background: rgba(6, 182, 212, 0.08);
  border: 1px solid rgba(6, 182, 212, 0.2);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 36px;
}

.stat-label {
  color: #64748b;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
}

.stat-value {
  font-size: 9px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  line-height: 1.2;
}

.stat-group.session .stat-value {
  color: #a78bfa;
}

.stat-group.session .stat-value.cost {
  color: #c4b5fd;
}

.stat-group.total .stat-value {
  color: #22d3ee;
}

.stat-group.total .stat-value.cost {
  color: #6ee7b7;
}

.stat-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
}

.stat-separator {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
}
</style>