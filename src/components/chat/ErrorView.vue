<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  message: {
    type: String,
    default: ''
  },
  code: {
    type: [String, Number],
    default: ''
  },
  details: {
    type: String,
    default: ''
  },
  isRecoverable: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['retry', 'dismiss'])

const isExpanded = ref(false)

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

function handleRetry() {
  emit('retry')
}

function handleDismiss() {
  emit('dismiss')
}
</script>

<template>
  <div class="error-view">
    <!-- Error Header -->
    <div class="error-header">
      <div class="error-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/>
        </svg>
      </div>

      <div class="error-content">
        <h4 class="error-title">执行错误</h4>
        <p class="error-message">{{ message }}</p>
        
        <span v-if="code" class="error-code">
          Error {{ code }}
        </span>
      </div>

      <div class="header-actions">
        <button 
          v-if="isRecoverable"
          class="retry-btn" 
          @click="handleRetry"
          :title="t('errorView.retry')"
        >
          <el-icon><RefreshRight /></el-icon>
        </button>

        <button 
          v-if="details"
          class="expand-btn" 
          @click="toggleExpand"
          :title="t('errorView.viewDetails')"
        >
          <el-icon><ArrowDown v-if="!isExpanded" /><ArrowUp v-else /></el-icon>
        </button>

        <button class="dismiss-btn" @click="handleDismiss" :title="t('errorView.close')">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>

    <!-- Error Details -->
    <transition name="expand">
      <div class="error-details" v-show="isExpanded && details">
        <div class="details-header">
          <span class="stack-label">📋 {{ t('errorView.detailTitle') }}</span>
        </div>
        
        <pre class="stack-trace"><code>{{ details }}</code></pre>
      </div>
    </transition>

    <!-- Recovery Actions -->
    <div class="recovery-actions" v-if="isRecoverable">
      <button class="action-btn-primary" @click="handleRetry">
        <el-icon><RefreshRight /></el-icon>
        重试操作
      </button>
      
      <button class="action-btn-secondary" @click="handleDismiss">
        {{ t('errorView.ignore') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.error-view {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(220, 38, 38, 0.04));
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(239, 68, 68, 0.08);
}

.error-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  background: rgba(239, 68, 68, 0.04);
}

.error-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  animation: error-pulse 2s ease-in-out infinite;
}

@keyframes error-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 16px rgba(239, 68, 68, 0); }
}

.error-content {
  flex: 1;
  min-width: 0;
}

.error-title {
  font-size: 14px;
  font-weight: 700;
  color: #fca5a5;
  letter-spacing: -0.3px;
  margin-bottom: 4px;
}

.error-message {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  word-break: break-word;
}

.error-code {
  display: inline-block;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.header-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.retry-btn,
.expand-btn,
.dismiss-btn {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  background: transparent;
  color: var(--text-muted);
}

.retry-btn:hover,
.expand-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.dismiss-btn:hover {
  background: rgba(55, 65, 81, 0.5);
  color: var(--text-secondary);
}

.error-details {
  padding: 0 20px 16px;
}

.details-header {
  margin-bottom: 10px;
}

.stack-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.stack-trace {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  padding: 14px;
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.65;
  color: #fca5a5;
  max-height: 250px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.recovery-actions {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid rgba(239, 68, 68, 0.15);
  background: rgba(17, 24, 39, 0.5);
}

.action-btn-primary,
.action-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn-primary {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.action-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(239, 68, 68, 0.4);
}

.action-btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.action-btn-secondary:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

/* Animations */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
