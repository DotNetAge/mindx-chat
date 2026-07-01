<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/sessionStore'
import { getMindXClient } from '../../services/websocket'

const { t } = useI18n()
const sessionStore = useSessionStore()

const props = defineProps({
  formData: {
    type: Object as () => Record<string, any>,
    default: () => ({})
  }
})

const isExpanded = ref(true)

interface QuestionItem {
  index: number
  question: string
  options: string[]
  multiSelect: boolean
}

const questions = computed<QuestionItem[]>(() => {
  const raw = props.formData
  if (raw.questions && Array.isArray(raw.questions) && raw.questions.length > 0) {
    return raw.questions.map((q: any, i: number) => ({
      index: i,
      question: q.question || '',
      options: Array.isArray(q.options) ? q.options.filter((o: any) => typeof o === 'string') : [],
      multiSelect: !!q.multi_select
    }))
  }
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

const singleAnswers = reactive<Record<number, string>>({})
const multiAnswers = reactive<Record<number, Set<string>>>({})
const freeformInputs = reactive<Record<number, string>>({})

// "其它"选项状态
const otherSelected = reactive<Record<number, boolean>>({})
const otherInputs = reactive<Record<number, string>>({})

function isSingleSelected(qIdx: number, option: string): boolean {
  return singleAnswers[qIdx] === option
}

function selectSingle(qIdx: number, option: string) {
  singleAnswers[qIdx] = option
  otherSelected[qIdx] = false
}

function selectOtherSingle(qIdx: number) {
  singleAnswers[qIdx] = ''
  otherSelected[qIdx] = true
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
  multiAnswers[qIdx] = new Set(s)
}

function toggleOtherMulti(qIdx: number) {
  otherSelected[qIdx] = !otherSelected[qIdx]
}

function isMultiSelected(qIdx: number, option: string): boolean {
  return multiAnswers[qIdx]?.has(option) ?? false
}

function hasAnyAnswer(): boolean {
  for (const q of questions.value) {
    if (q.options.length > 0) {
      if (q.multiSelect) {
        if ((multiAnswers[q.index]?.size ?? 0) > 0) return true
        if (otherSelected[q.index] && otherInputs[q.index]?.trim()) return true
      } else {
        if (singleAnswers[q.index]) return true
        if (otherSelected[q.index] && otherInputs[q.index]?.trim()) return true
      }
    } else {
      if (freeformInputs[q.index]?.trim()) return true
    }
  }
  return false
}

function handleSubmit() {
  // Build formatted answer text
  const answerParts: string[] = []
  const isMultiSelectAny = questions.value.some(q => q.options.length > 0 && q.multiSelect)

  if (isMultiSelectAny) {
    const selections: string[] = []
    for (const q of questions.value) {
      if (q.options.length > 0 && q.multiSelect) {
        const selected = multiAnswers[q.index]
        if (selected && selected.size > 0) {
          selections.push(...Array.from(selected))
        }
        // 多选"其它"：追加 "其它：<输入内容>"
        if (otherSelected[q.index] && otherInputs[q.index]?.trim()) {
          selections.push(t('form.other') + '：' + otherInputs[q.index].trim())
        }
      } else if (q.options.length > 0) {
        const selected = singleAnswers[q.index]
        if (selected) selections.push(selected)
      }
    }
    if (selections.length > 0) {
      answerParts.push(t('form.myChoices') + selections.join('、'))
    }
  } else {
    for (const q of questions.value) {
      if (q.options.length > 0) {
        // 单选"其它"：直接使用输入内容作为答案
        if (otherSelected[q.index] && otherInputs[q.index]?.trim()) {
          answerParts.push(otherInputs[q.index].trim())
        } else {
          const selected = singleAnswers[q.index]
          if (selected) answerParts.push(selected)
        }
      } else {
        const input = freeformInputs[q.index]?.trim()
        if (input) answerParts.push(input)
      }
    }
  }

  const answerText = answerParts.length > 0 ? answerParts.join('\n') : ''

  // Send as user message via WebSocket
  const client = getMindXClient()
  const targetSessionId = sessionStore.activeSessionId
  if (client && targetSessionId) {
    client.sendMessage(answerText, targetSessionId)
  }
}

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="ask-user-view" v-if="hasQuestions">
    <div class="au-header" @click="toggleExpand">
      <div class="au-header-left">
        <div class="au-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="au-title-section">
          <h4 class="au-title">{{ t('form.title') }}</h4>
          <p class="au-subtitle">
            {{ questions.length > 1
              ? t('form.multiQuestions', { count: questions.length })
              : questions[0]?.question?.slice(0, 60) || ''
            }}{{ questions[0]?.question?.length > 60 ? '...' : '' }}
          </p>
        </div>
      </div>
      <div class="au-header-right">
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          class="au-chevron"
          :class="{ rotated: isExpanded }"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    </div>

    <transition name="expand-au">
      <div class="au-body" v-show="isExpanded">
        <div
          v-for="(q, idx) in questions"
          :key="q.index"
          class="au-question-card"
        >
          <div class="au-question-header">
            <span class="au-q-number" v-if="questions.length > 1">{{ idx + 1 }}.</span>
            <p class="au-q-text">{{ q.question }}</p>
            <span
              v-if="q.options.length > 0 && q.multiSelect"
              class="au-badge badge-multi"
            >{{ t('form.multiSelect') }}</span>
            <span
              v-else-if="q.options.length > 0"
              class="au-badge badge-single"
            >{{ t('form.singleSelect') }}</span>
          </div>

          <div class="au-options" v-if="q.options.length > 0">
            <label
              v-for="option in q.options"
              :key="option"
              class="au-option"
              :class="{ checked: q.multiSelect ? isMultiSelected(q.index, option) : isSingleSelected(q.index, option) }"
              @click="q.multiSelect ? toggleMulti(q.index, option) : selectSingle(q.index, option)"
            >
              <span class="au-opt-indicator">
                <template v-if="q.multiSelect">
                  <span class="au-cb" :class="{ on: isMultiSelected(q.index, option) }">
                    <svg v-if="isMultiSelected(q.index, option)" width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" stroke="currentColor" stroke-width="3"/>
                    </svg>
                  </span>
                </template>
                <template v-else>
                  <span class="au-rd" :class="{ on: isSingleSelected(q.index, option) }"></span>
                </template>
              </span>
              <span class="au-opt-label">{{ option }}</span>
            </label>

            <!-- "其它"选项 -->
            <label
              class="au-option"
              :class="{ checked: otherSelected[q.index] }"
              @click="q.multiSelect ? toggleOtherMulti(q.index) : selectOtherSingle(q.index)"
            >
              <span class="au-opt-indicator">
                <template v-if="q.multiSelect">
                  <span class="au-cb" :class="{ on: otherSelected[q.index] }">
                    <svg v-if="otherSelected[q.index]" width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" stroke="currentColor" stroke-width="3"/>
                    </svg>
                  </span>
                </template>
                <template v-else>
                  <span class="au-rd" :class="{ on: otherSelected[q.index] }"></span>
                </template>
              </span>
              <span class="au-opt-label">{{ t('form.other') }}</span>
            </label>
            <div v-if="otherSelected[q.index]" class="au-other-input-wrap">
              <input
                v-model="otherInputs[q.index]"
                class="au-other-input"
                :placeholder="t('form.otherPlaceholder')"
              />
            </div>
          </div>

          <div class="au-input" v-else>
            <textarea
              v-model="freeformInputs[q.index]"
              class="au-textarea"
              :placeholder="t('form.inputPlaceholder')"
              rows="2"
            ></textarea>
          </div>
        </div>

        <div class="au-actions">
          <button
            class="au-submit"
            :disabled="!hasAnyAnswer()"
            @click="handleSubmit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
.ask-user-view {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.06), rgba(8, 145, 178, 0.04));
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 10px;
  overflow: hidden;
}

.au-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  gap: 12px;
}
.au-header:hover {
  background: rgba(6, 182, 212, 0.04);
}

.au-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.au-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.au-title-section {
  min-width: 0;
}

.au-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.2px;
  margin: 0 0 1px;
}

.au-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.au-header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.au-chevron {
  color: var(--text-muted);
  transition: transform 0.2s ease;
}
.au-chevron.rotated {
  transform: rotate(180deg);
}

.au-body {
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.au-question-card {
  padding: 12px;
  background: rgba(6, 182, 212, 0.04);
  border: 1px solid rgba(6, 182, 212, 0.14);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.au-question-header {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
}

.au-q-number {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-cyan);
  flex-shrink: 0;
}

.au-q-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  font-weight: 500;
  margin: 0;
  flex: 1;
  min-width: 0;
}

.au-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  margin-top: 1px;
}
.badge-multi {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.3);
}
.badge-single {
  background: rgba(6, 182, 212, 0.12);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.au-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.au-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
  margin: 0;
}
.au-option:hover {
  border-color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.06);
}
.au-option.checked {
  border-color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
}

.au-opt-indicator {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.au-cb {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  color: white;
}
.au-cb.on {
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  border-color: transparent;
}

.au-rd {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  transition: all 0.2s ease;
}
.au-rd.on {
  border-color: var(--accent-cyan);
  box-shadow: inset 0 0 0 4px var(--accent-cyan);
}

.au-opt-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
  flex: 1;
}

/* "其它"输入框 */
.au-other-input-wrap {
  padding: 4px 10px 8px;
}
.au-other-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}
.au-other-input::placeholder {
  color: var(--text-muted);
}
.au-other-input:focus {
  border-color: var(--accent-cyan);
}

.au-input {
  padding: 0;
}

.au-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}
.au-textarea::placeholder {
  color: var(--text-muted);
}
.au-textarea:focus {
  border-color: var(--accent-cyan);
}

.au-actions {
  display: flex;
  justify-content: flex-end;
}

.au-submit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 18px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  color: white;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 10px rgba(6, 182, 212, 0.25);
}
.au-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(6, 182, 212, 0.4);
}
.au-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.expand-au-enter-active,
.expand-au-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.expand-au-enter-from,
.expand-au-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
