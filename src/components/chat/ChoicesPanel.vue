<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  prompt: {
    type: String,
    default: () => t('choices.pleaseSelect')
  },
  options: {
    type: Array as () => string[],
    default: () => []
  },
  multiSelect: {
    type: Boolean,
    default: false
  },
  allowTextInput: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select', 'cancel'])

const selectedIndex = ref(-1)
const selectedIndices = ref<Set<number>>(new Set())
const customText = ref('')
const isInputActive = ref(false)

const hasSelection = computed(() => {
  if (props.multiSelect) return selectedIndices.value.size > 0
  return selectedIndex.value >= 0
})

function selectOption(index: number) {
  if (!props.multiSelect) {
    selectedIndex.value = index
    emit('select', { index, customText: customText.value })
  } else {
    if (selectedIndices.value.has(index)) {
      selectedIndices.value.delete(index)
    } else {
      selectedIndices.value.add(index)
    }
  }
}

function toggleInput() {
  if (props.allowTextInput) {
    isInputActive.value = !isInputActive.value
  }
}

function confirmSelection() {
  const indices = Array.from(selectedIndices.value)
  emit('select', { 
    index: props.multiSelect ? -1 : selectedIndex.value,
    indices,
    customText: customText.value
  })
}

function cancelSelection() {
  emit('cancel')
}
</script>

<template>
  <div class="choices-panel">
    <div class="panel-header">
      <div class="header-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>
      <h4 class="prompt-text">{{ prompt }}</h4>
      
      <span class="mode-badge" v-if="multiSelect">
        多选模式
      </span>
    </div>

    <!-- Options List -->
    <div class="options-list" v-if="options.length > 0">
      <button
        v-for="(option, idx) in options"
        :key="idx"
        class="option-item"
        :class="{ 
          selected: multiSelect ? selectedIndices.has(idx) : selectedIndex === idx,
          focused: !multiSelect && selectedIndex === idx
        }"
        @click="selectOption(idx)"
      >
        <div class="option-indicator">
          <template v-if="multiSelect">
            <span class="checkbox" :class="{ checked: selectedIndices.has(idx) }">
              <svg v-if="selectedIndices.has(idx)" width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" stroke="currentColor" stroke-width="3"/>
              </svg>
            </span>
          </template>
          <template v-else>
            <span class="radio-dot" :class="{ checked: selectedIndex === idx }"></span>
          </template>
        </div>
        
        <span class="option-text">{{ option }}</span>
        
        <svg v-if="(multiSelect ? selectedIndices.has(idx) : selectedIndex === idx)" 
             width="14" height="14" viewBox="0 0 24 24" fill="none" class="check-icon">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" stroke="currentColor" stroke-width="2.5"/>
        </svg>
      </button>
    </div>

    <!-- Custom Text Input -->
    <div class="custom-input-section" v-if="allowTextInput">
      <button 
        class="input-toggle-btn" 
        :class="{ active: isInputActive }"
        @click="toggleInput"
      >
        <el-icon><EditPen /></el-icon>
        {{ isInputActive ? '返回列表' : '自定义输入' }}
      </button>

      <transition name="slide-down">
        <div v-if="isInputActive" class="input-wrapper">
          <el-input
            v-model="customText"
            :placeholder="t('choices.inputPlaceholder')"
            size="large"
            clearable
            class="custom-input"
          />
          
          <div class="input-hints">
            <kbd>Enter</kbd> 确认 · <kbd>Esc</kbd> 取消
          </div>
        </div>
      </transition>
    </div>

    <!-- Action Buttons -->
    <div class="action-bar">
      <el-button @click="cancelSelection" class="cancel-btn">{{ t('choices.cancelBtn') }}</el-button>
      <el-button 
        type="primary" 
        @click="confirmSelection"
        :disabled="!hasSelection && (!allowTextInput || !customText)"
        class="confirm-btn"
      >
        确认选择
        <template v-if="multiSelect && selectedIndices.size > 0">
          ({{ selectedIndices.size }} 项)
        </template>
      </el-button>
    </div>

    <!-- Keyboard Hints -->
    <div class="keyboard-hints" v-if="!isInputActive">
      <span><kbd>↑↓</kbd> {{ t('choices.navigate') }}</span>
      <span><kbd>Space</kbd> {{ t('choices.select') }}</span>
      <span><kbd>Enter</kbd> {{ t('choices.confirm') }}</span>
      <span><kbd>Esc</kbd> {{ t('choices.cancel') }}</span>
    </div>
  </div>
</template>

<style scoped>
.choices-panel {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.06), rgba(59, 130, 246, 0.04));
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(6, 182, 212, 0.08);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: rgba(6, 182, 212, 0.06);
  border-bottom: 1px solid rgba(6, 182, 212, 0.15);
}

.header-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.prompt-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
  flex: 1;
}

.mode-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.3);
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  max-height: 280px;
  overflow-y: auto;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  width: 100%;
  font-size: 13px;
  font-weight: 500;
}

.option-item:hover {
  background: rgba(6, 182, 212, 0.06);
  border-color: rgba(6, 182, 212, 0.15);
  color: var(--text-primary);
}

.option-item.selected {
  background: rgba(6, 182, 212, 0.1);
  border-color: rgba(6, 182, 212, 0.35);
  color: var(--accent-cyan);
  box-shadow: 0 0 16px rgba(6, 182, 212, 0.1);
}

.option-item.focused.selected {
  background: linear-gradient(90deg, rgba(6, 182, 212, 0.15), rgba(59, 130, 246, 0.1));
}

.option-indicator {
  flex-shrink: 0;
}

.checkbox {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  color: white;
}

.checkbox.checked {
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  border-color: transparent;
}

.radio-dot {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  transition: all 0.2s ease;
  position: relative;
}

.radio-dot.checked {
  border-color: var(--accent-cyan);
  box-shadow: inset 0 0 0 4px var(--accent-cyan);
}

.option-text {
  flex: 1;
  line-height: 1.4;
}

.check-icon {
  color: var(--accent-cyan);
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.option-item.selected .check-icon {
  opacity: 1;
  transform: scale(1);
}

.custom-input-section {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.input-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.input-toggle-btn:hover,
.input-toggle-btn.active {
  border-style: solid;
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.06);
}

.input-wrapper {
  margin-top: 12px;
}

.custom-input :deep(.el-input__wrapper) {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: none;
}

.custom-input :deep(.el-input__wrapper:focus-within) {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.1);
}

.input-hints {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

kbd {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  font-family: inherit;
  font-size: inherit;
}

.action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  background: rgba(17, 24, 39, 0.5);
}

.cancel-btn {
  border-color: var(--border-color);
  color: var(--text-secondary);
}

.confirm-btn {
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  border: none;
  font-weight: 600;
}

.keyboard-hints {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 10px 20px;
  font-size: 10px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
  background: rgba(17, 24, 39, 0.3);
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
  margin-top: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
