<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  toolName: {
    type: String,
    default: ''
  },
  params: {
    type: Object as () => Record<string, any>,
    default: () => ({})
  },
  reason: {
    type: String,
    default: ''
  },
  securityLevel: {
    type: String,
    default: 'medium'
  }
})

const emit = defineEmits(['grant', 'deny'])

const isExpanded = ref(true)
const submitted = ref(false)
const customParams = ref<Record<string, any>>({})
const showCustomInput = ref(false)
const isSubmitting = ref(false)
const remember = ref(false)

const levelConfig = computed(() => {
  const configs: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
    low: {
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.1)',
      border: 'rgba(16, 185, 129, 0.3)',
      icon: '🟢',
      label: '低风险'
    },
    medium: {
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.3)',
      icon: '🟡',
      label: '中等风险'
    },
    high: {
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.3)',
      icon: '🔴',
      label: '高风险'
    }
  }
  return configs[props.securityLevel] || configs.medium
})

function handleGrant() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  submitted.value = true
  isExpanded.value = false
  if (remember.value) {
    emit('grant', { ...customParams.value, remember: true })
  } else {
    emit('grant', customParams.value)
  }
}

function handleDeny() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  submitted.value = true
  isExpanded.value = false
  emit('deny', '用户拒绝')
}

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="permission-bar" :class="securityLevel">
    <!-- Header -->
    <div class="perm-header" @click="toggleExpand">
      <div class="header-left">
        <div class="warning-icon" :style="{ background: levelConfig.bg, borderColor: levelConfig.border }">
          <span class="level-emoji">{{ levelConfig.icon }}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" 
                  stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>

        <div class="title-section">
          <h4 class="perm-title">{{ t('permission.title') }}</h4>
          <p class="tool-name">{{ toolName }}</p>
        </div>
      </div>

      <div class="header-right">
        <span 
          class="level-badge"
          :style="{ 
            color: levelConfig.color, 
            background: levelConfig.bg, 
            borderColor: levelConfig.border 
          }"
        >
          {{ levelConfig.label }}
        </span>

        <el-icon class="expand-icon"><ArrowDown v-if="isExpanded" /><ArrowRight v-else /></el-icon>
      </div>
    </div>

    <!-- Body -->
    <transition name="expand">
      <div class="perm-body" v-show="isExpanded">
        <!-- Reason -->
        <div class="reason-block" v-if="reason">
          <div class="reason-label">📋 {{ t('permission.reasonLabel') }}</div>
          <p class="reason-text">{{ reason }}</p>
        </div>

        <!-- Parameters -->
        <div class="params-block" v-if="Object.keys(params).length > 0">
          <div class="params-header">
            <span class="params-label">⚙️ {{ t('permission.paramDetails') }}</span>
            <button 
              class="modify-btn"
              @click="showCustomInput = !showCustomInput"
            >
              <el-icon><EditPen /></el-icon>
              {{ t('permission.modifyParams') }}
            </button>
          </div>

          <transition name="slide-down">
            <div class="custom-input-area" v-if="showCustomInput">
              <div 
                v-for="(value, key) in params" 
                :key="key"
                class="param-edit-item"
              >
                <label>{{ key }}</label>
                <el-input 
                  :model-value="typeof value === 'object' ? JSON.stringify(value) : value"
                  size="small"
                  @update:model-value="(val: string) => customParams[key] = val"
                />
              </div>
            </div>
          </transition>

          <div class="params-grid">
            <div 
              v-for="(value, key) in params" 
              :key="key"
              class="param-card"
            >
              <span class="param-key">{{ key }}</span>
              <span class="param-value">
                <template v-if="typeof value === 'string' && value.length > 200">
                  {{ value.slice(0, 200) }}...
                </template>
                <template v-else-if="typeof value === 'object'">
                  {{ JSON.stringify(value) }}
                </template>
                <template v-else>
                  {{ value }}
                </template>
              </span>
            </div>
          </div>
        </div>

        <!-- 记住授权 -->
        <label class="remember-option">
          <input type="checkbox" v-model="remember" :disabled="isSubmitting" />
          <span class="remember-label">{{ t('permission.remember') }}</span>
        </label>

        <!-- Action Buttons -->
        <div class="action-buttons">
          <button class="deny-btn" @click="handleDeny" :disabled="isSubmitting">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
            </svg>
            {{ t('permission.deny') }}
          </button>
          
          <button class="grant-btn" @click="handleGrant" :disabled="isSubmitting" :style="{ background: `linear-gradient(135deg, ${levelConfig.color}, ${levelConfig.color}dd)` }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
            </svg>
            {{ t('permission.allow') }}
          </button>
        </div>

        <!-- Security Notice -->
        <div class="security-notice" v-if="securityLevel === 'high'">
          ⚠️ {{ t('permission.securityNotice') }}
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.permission-bar {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.06), rgba(99, 102, 241, 0.04));
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(139, 92, 246, 0.08);
}

.permission-bar.high {
  border-color: rgba(239, 68, 68, 0.35);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(220, 38, 38, 0.04));
  box-shadow: 0 8px 32px rgba(239, 68, 68, 0.08);
}

.perm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
  gap: 16px;
}

.perm-header:hover {
  background: rgba(139, 92, 246, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.warning-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  color: white;
  flex-shrink: 0;
}

.level-emoji {
  position: absolute;
  top: -8px;
  right: -8px;
  font-size: 16px;
}

.title-section {
  min-width: 0;
}

.perm-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
  margin-bottom: 2px;
}

.tool-name {
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent-cyan);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.level-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid;
}

.expand-icon {
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.perm-body {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.reason-block {
  padding: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.reason-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.reason-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.params-block {
  padding: 14px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.params-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.params-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.modify-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modify-btn:hover {
  border-style: solid;
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

.custom-input-area {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.param-edit-item {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
  align-items: center;
}

.param-edit-item label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
}

.params-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  width: 100%;
  box-sizing: border-box;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.param-key {
  flex-shrink: 0;
  color: #64748b;
  font-weight: 600;
  text-transform: lowercase;
}

.param-value {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.5;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.deny-btn,
.grant-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.deny-btn:disabled,
.grant-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* 记住授权勾选框 */
.remember-option {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  cursor: pointer;
  user-select: none;
}

.remember-option input[type="checkbox"] {
  accent-color: var(--accent-cyan);
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.remember-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  white-space: nowrap;
}

.deny-btn {
  background: linear-gradient(135deg, #374151, #1f2937);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.deny-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(55, 65, 81, 0.4);
  border-color: #ef4444;
  color: #fca5a5;
}

.grant-btn {
  color: white;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
}

.grant-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(99, 102, 241, 0.45);
}

.security-notice {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 8px;
  font-size: 12px;
  color: #fca5a5;
  text-align: center;
  font-weight: 500;
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

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
}
</style>
