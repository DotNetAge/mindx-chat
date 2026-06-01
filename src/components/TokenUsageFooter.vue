<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '../stores/chatStore'

const chatStore = useChatStore()

const formatNumber = (num: number): string => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

const formatCost = (cost: number): string => {
  if (cost < 0.01) return '¥0.00'
  return '¥' + cost.toFixed(2)
}

const totalTokens = computed(() => formatNumber(chatStore.totalTokensUsed))
const totalCost = computed(() => formatCost(chatStore.totalCost))
const totalConversations = computed(() => chatStore.totalConversations)
</script>

<template>
  <div class="token-usage-footer">
    <div class="usage-item">
      <span class="usage-label">总消耗</span>
      <span class="usage-value">{{ totalTokens }}</span>
    </div>
    <div class="usage-divider"></div>
    <div class="usage-item">
      <span class="usage-label">总费用</span>
      <span class="usage-value cost">{{ totalCost }}</span>
    </div>
    <div class="usage-divider"></div>
    <div class="usage-item">
      <span class="usage-label">对话</span>
      <span class="usage-value">{{ totalConversations }}</span>
    </div>
  </div>
</template>

<style scoped>
.token-usage-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(6, 182, 212, 0.05);
  border-top: 1px solid rgba(55, 65, 81, 0.5);
}

.usage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.usage-label {
  font-size: 10px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.usage-value {
  font-size: 13px;
  font-weight: 600;
  color: #22d3ee;
  font-family: 'JetBrains Mono', monospace;
}

.usage-value.cost {
  color: #6ee7b7;
}

.usage-divider {
  width: 1px;
  height: 24px;
  background: rgba(55, 65, 81, 0.5);
}
</style>
