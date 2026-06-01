<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps({
  formData: {
    type: Object as () => Record<string, any>,
    default: () => ({})
  }
})

const emit = defineEmits(['submit'])

const isExpanded = ref(true)
const selectedOption = ref<string | null>(null)
const freeformInput = ref('')

const displayText = computed(() => {
  return props.formData?.question || props.formData?.text || props.formData?.message || ''
})

const options = computed(() => {
  const opts = props.formData?.options
  if (!opts) return []
  if (Array.isArray(opts)) {
    return opts.map(o => (typeof o === 'string' ? o : o.label || o.value || JSON.stringify(o)))
  }
  return []
})

const extraFields = computed(() => {
  const excludeKeys = new Set(['question', 'text', 'message', 'options'])
  return Object.entries(props.formData || {})
    .filter(([key]) => !excludeKeys.has(key))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
    }))
})

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

function selectOption(option: string) {
  selectedOption.value = option
}

function handleSubmit() {
  const data: Record<string, any> = {}
  if (selectedOption.value) {
    data.selected_option = selectedOption.value
  }
  if (freeformInput.value.trim()) {
    data.response = freeformInput.value.trim()
  }
  emit('submit', data)
}
</script>

<template>
  <div class="form-view">
    <div class="form-header" @click="toggleExpand">
      <div class="header-left">
        <div class="form-icon">
          <span class="icon-emoji">💬</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <div class="title-section">
          <h4 class="form-title">需要澄清</h4>
          <p class="form-subtitle" v-if="displayText">{{ displayText.slice(0, 60) }}{{ displayText.length > 60 ? '...' : '' }}</p>
        </div>
      </div>

      <div class="header-right">
        <el-icon class="expand-icon"><ArrowDown v-if="isExpanded" /><ArrowRight v-else /></el-icon>
      </div>
    </div>

    <transition name="expand">
      <div class="form-body" v-show="isExpanded">
        <div class="question-block" v-if="displayText">
          <p class="question-text">{{ displayText }}</p>
        </div>

        <div class="options-block" v-if="options.length > 0">
          <div class="options-label">📌 请选择</div>
          <div class="options-grid">
            <button
              v-for="(option, index) in options"
              :key="index"
              class="option-chip"
              :class="{ selected: selectedOption === option }"
              @click="selectOption(option)"
            >
              <span v-if="selectedOption === option" class="check-mark">✓</span>
              {{ option }}
            </button>
          </div>
        </div>

        <div class="fields-block" v-if="extraFields.length > 0">
          <div class="fields-label">📋 详情</div>
          <div class="fields-grid">
            <div v-for="field in extraFields" :key="field.key" class="field-card">
              <span class="field-key">{{ field.key }}</span>
              <span class="field-value">{{ field.value }}</span>
            </div>
          </div>
        </div>

        <div class="input-block">
          <div class="input-label">✍️ 你的回复</div>
          <textarea
            v-model="freeformInput"
            class="response-input"
            placeholder="输入你的回答或补充说明..."
            rows="3"
          ></textarea>
        </div>

        <div class="action-area">
          <button
            class="submit-btn"
            :disabled="!selectedOption && !freeformInput.trim()"
            @click="handleSubmit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
            </svg>
            提交回复
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.form-view {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.06), rgba(8, 145, 178, 0.04));
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(6, 182, 212, 0.08);
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
  gap: 16px;
}

.form-header:hover {
  background: rgba(6, 182, 212, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.form-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.icon-emoji {
  position: absolute;
  top: -8px;
  right: -8px;
  font-size: 16px;
}

.title-section {
  min-width: 0;
}

.form-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
  margin-bottom: 2px;
}

.form-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.expand-icon {
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.form-body {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.question-block {
  padding: 14px 16px;
  background: rgba(6, 182, 212, 0.06);
  border: 1px solid rgba(6, 182, 212, 0.18);
  border-radius: 10px;
}

.question-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  font-weight: 500;
  margin: 0;
}

.options-block,
.fields-block,
.input-block {
  padding: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.options-label,
.fields-label,
.input-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.options-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.option-chip:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.08);
}

.option-chip.selected {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(8, 145, 178, 0.15));
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  box-shadow: 0 0 12px rgba(6, 182, 212, 0.15);
}

.check-mark {
  font-size: 12px;
  font-weight: 800;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.field-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.field-key {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.field-value {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.4;
}

.response-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.response-input::placeholder {
  color: var(--text-muted);
}

.response-input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.12);
}

.action-area {
  display: flex;
  justify-content: flex-end;
}

.submit-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  color: white;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 16px rgba(6, 182, 212, 0.3);
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(6, 182, 212, 0.45);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

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
