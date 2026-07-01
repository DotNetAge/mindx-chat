<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  formData: {
    type: Object as () => Record<string, any>,
    default: () => ({})
  }
})

const emit = defineEmits(['submit'])

const isExpanded = ref(true)

/** 解析 questions 数组，兼容单问题平铺结构 */
interface QuestionItem {
  index: number
  question: string
  options: string[]
  multiSelect: boolean
}

const questions = computed<QuestionItem[]>(() => {
  const raw = props.formData
  // 标准结构：{ questions: [{ question, options, multi_select }] }
  if (raw.questions && Array.isArray(raw.questions) && raw.questions.length > 0) {
    return raw.questions.map((q: any, i: number) => ({
      index: i,
      question: q.question || '',
      options: Array.isArray(q.options) ? q.options.filter((o: any) => typeof o === 'string') : [],
      multiSelect: !!q.multi_select
    }))
  }
  // 兼容旧平铺结构：{ question, options, multi_select }
  if (raw.question) {
    return [{
      index: 0,
      question: raw.question,
      options: Array.isArray(raw.options) ? raw.options.filter((o: any) => typeof o === 'string') : [],
      multiSelect: !!raw.multi_select
    }]
  }
  return []
})

const hasQuestions = computed(() => questions.value.length > 0)

/** 单选答案: questionIndex → selectedOption */
const singleAnswers = reactive<Record<number, string>>({})
/** 多选答案: questionIndex → Set<option> */
const multiAnswers = reactive<Record<number, Set<string>>>({})
/** 自由输入答案: questionIndex → text */
const freeformInputs = reactive<Record<number, string>>({})

function isSingleSelected(qIdx: number, option: string): boolean {
  return singleAnswers[qIdx] === option
}

function selectSingle(qIdx: number, option: string) {
  singleAnswers[qIdx] = option
}

function toggleMulti(qIdx: number, option: string) {
  if (!multiAnswers[qIdx]) {
    multiAnswers[qIdx] = new Set()
  }
  const s = multiAnswers[qIdx]
  if (s.has(option)) {
    s.delete(option)
  } else {
    s.add(option)
  }
  // trigger reactivity by reassigning
  multiAnswers[qIdx] = new Set(s)
}

function isMultiSelected(qIdx: number, option: string): boolean {
  return multiAnswers[qIdx]?.has(option) ?? false
}

function hasAnyAnswer(): boolean {
  // 至少一个问题有答案才可提交
  for (const q of questions.value) {
    if (q.options.length > 0) {
      if (q.multiSelect) {
        if (multiAnswers[q.index]?.size > 0) return true
      } else {
        if (singleAnswers[q.index]) return true
      }
    } else {
      if (freeformInputs[q.index]?.trim()) return true
    }
  }
  return false
}

function handleSubmit() {
  const answers: Record<string, string> = {}
  for (const q of questions.value) {
    const key = `q_${q.index}`
    if (q.options.length > 0) {
      if (q.multiSelect) {
        const selected = multiAnswers[q.index]
        answers[key] = selected ? Array.from(selected).join(', ') : ''
      } else {
        answers[key] = singleAnswers[q.index] || ''
      }
    } else {
      answers[key] = freeformInputs[q.index]?.trim() || ''
    }
  }
  emit('submit', { answers })
}

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="form-view" v-if="hasQuestions">
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
          <h4 class="form-title">{{ t('form.title') }}</h4>
          <p class="form-subtitle">
            {{ questions.length > 1
              ? t('form.multiQuestions', { count: questions.length })
              : questions[0]?.question?.slice(0, 60) || ''
            }}{{ questions[0]?.question?.length > 60 ? '...' : '' }}
          </p>
        </div>
      </div>
      <div class="header-right">
        <el-icon class="expand-icon"><ArrowDown v-if="isExpanded" /><ArrowRight v-else /></el-icon>
      </div>
    </div>

    <transition name="expand">
      <div class="form-body" v-show="isExpanded">
        <div
          v-for="(q, idx) in questions"
          :key="q.index"
          class="question-card"
          :class="{ 'is-last': idx === questions.length - 1 }"
        >
          <div class="question-header">
            <span class="question-number" v-if="questions.length > 1">{{ idx + 1 }}.</span>
            <p class="question-text">{{ q.question }}</p>
            <span
              v-if="q.options.length > 0 && q.multiSelect"
              class="question-badge multi-badge"
            >{{ t('form.multiSelect') }}</span>
            <span
              v-else-if="q.options.length > 0"
              class="question-badge single-badge"
            >{{ t('form.singleSelect') }}</span>
          </div>

          <!-- 选项区域 -->
          <div class="options-block" v-if="q.options.length > 0">
            <!-- 多选 -->
            <template v-if="q.multiSelect">
              <label
                v-for="option in q.options"
                :key="option"
                class="option-item checkbox-item"
                :class="{ checked: isMultiSelected(q.index, option) }"
              >
                <el-checkbox
                  :model-value="isMultiSelected(q.index, option)"
                  @change="toggleMulti(q.index, option)"
                  size="small"
                />
                <span class="option-label">{{ option }}</span>
              </label>
            </template>
            <!-- 单选 -->
            <template v-else>
              <label
                v-for="option in q.options"
                :key="option"
                class="option-item radio-item"
                :class="{ checked: isSingleSelected(q.index, option) }"
              >
                <el-radio
                  :model-value="isSingleSelected(q.index, option)"
                  @change="selectSingle(q.index, option)"
                  size="small"
                />
                <span class="option-label">{{ option }}</span>
              </label>
            </template>
          </div>

          <!-- 自由输入 -->
          <div class="input-block" v-else>
            <textarea
              v-model="freeformInputs[q.index]"
              class="response-input"
              :placeholder="t('form.inputPlaceholder')"
              rows="2"
            ></textarea>
          </div>
        </div>

        <div class="action-area">
          <button
            class="submit-btn"
            :disabled="!hasAnyAnswer()"
            @click="handleSubmit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
            </svg>
            {{ t('form.submit') }}
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

/* Question Card */
.question-card {
  padding: 16px;
  background: rgba(6, 182, 212, 0.04);
  border: 1px solid rgba(6, 182, 212, 0.14);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.question-card.is-last {
  margin-bottom: 0;
}

.question-header {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
}

.question-number {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-cyan);
  flex-shrink: 0;
}

.question-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  font-weight: 500;
  margin: 0;
  flex: 1;
  min-width: 0;
}

.question-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 2px;
}
.multi-badge {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.3);
}
.single-badge {
  background: rgba(6, 182, 212, 0.12);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.25);
}

/* Options */
.options-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  margin: 0;
}
.option-item:hover {
  border-color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.06);
}
.option-item.checked {
  border-color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
  box-shadow: 0 0 8px rgba(6, 182, 212, 0.08);
}

.option-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.5;
}

/* Freeform Input */
.input-block {
  padding: 0;
}

.response-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
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

/* Action Area */
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

/* Transition */
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
