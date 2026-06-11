<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMindXClient } from '../services/websocket'
import { useConnectionStore } from '../stores/connectionStore'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible'])

const connectionStore = useConnectionStore()
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

interface RuleItem {
  id: string
  intro: string
  scope: string
  priority: number
  enabled: boolean
}

const rules = ref<RuleItem[]>([])
const showForm = ref(false)
const editingId = ref<string | null>(null)

// Form fields
const formId = ref('')
const formIntro = ref('')
const formScope = ref('global')
const formPriority = ref(0)
const formEnabled = ref(true)

const scopeOptions = computed(() => [
  { value: 'global', label: t('ruleEditor.scopeGlobal') },
  { value: 'local', label: t('ruleEditor.scopeLocal') },
  { value: 'conversation', label: t('ruleEditor.scopeConversation') }
])

function resetForm() {
  editingId.value = null
  formId.value = crypto.randomUUID()
  formIntro.value = ''
  formScope.value = 'global'
  formPriority.value = 0
  formEnabled.value = true
}

async function loadRules() {
  if (!connectionStore.isConnected) {
    error.value = t('ruleEditor.notConnected')
    return
  }
  loading.value = true
  error.value = null
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')
    const result = await client.call<{ count: number; rules: RuleItem[] }>('rule.list', {})
    rules.value = Array.isArray(result?.rules) ? result.rules : []
  } catch (err: any) {
    error.value = err.message || t('ruleEditor.loadFailed')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  resetForm()
  showForm.value = true
}

function openEdit(rule: RuleItem) {
  editingId.value = rule.id
  formId.value = rule.id
  formIntro.value = rule.intro
  formScope.value = rule.scope || 'global'
  formPriority.value = rule.priority ?? 0
  formEnabled.value = rule.enabled !== false
  showForm.value = true
}

async function handleSave() {
  if (!formIntro.value.trim()) {
    ElMessage.warning(t('ruleEditor.introRequired'))
    return
  }

  saving.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')

    if (editingId.value) {
      // Update existing rule — only send changed fields
      const params: Record<string, any> = { id: editingId.value }
      if (formIntro.value !== undefined) params.intro = formIntro.value
      if (formScope.value !== undefined) params.scope = formScope.value
      if (formPriority.value !== undefined) params.priority = formPriority.value
      if (formEnabled.value !== undefined) params.enabled = formEnabled.value
      await client.call('rule.update', params)
      ElMessage.success(t('ruleEditor.updated', { id: editingId.value }))
    } else {
      // Create new rule
      await client.call('rule.create', {
        id: formId.value.trim(),
        intro: formIntro.value.trim(),
        scope: formScope.value,
        priority: formPriority.value,
        enabled: formEnabled.value
      })
      ElMessage.success(t('ruleEditor.created', { id: formId.value }))
    }

    showForm.value = false
    await loadRules()
  } catch (err: any) {
    ElMessage.error(err.message || t('ruleEditor.loadFailed'))
  } finally {
    saving.value = false
  }
}

async function handleDelete(rule: RuleItem) {
  try {
    await ElMessageBox.confirm(
      t('ruleEditor.deleteConfirm', { id: rule.id }),
      t('ruleEditor.deleteConfirmTitle'),
      { confirmButtonText: t('common.delete'), cancelButtonText: t('common.cancel'), type: 'warning', confirmButtonClass: 'el-button--danger' }
    )

    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')
    await client.call('rule.delete', { id: rule.id })
    ElMessage.success(t('ruleEditor.deleted', { id: rule.id }))
    await loadRules()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || t('ruleEditor.loadFailed'))
    }
  }
}

watch(() => props.visible, (val) => {
  if (val) loadRules()
})
</script>

<template>
  <div v-if="visible">
    <el-dialog
      :model-value="true"
      @update:model-value="emit('update:visible', false)"
      title=""
      width="720px"
      class="rule-editor-dialog"
      append-to-body
      destroy-on-close
    >
      <template #header>
        <div class="dialog-header">
          <h2>
            <el-icon><Document /></el-icon>
            {{ t('ruleEditor.title') }}
          </h2>
          <el-button class="header-action-btn" size="small" @click="openCreate" :disabled="!connectionStore.isConnected">
            <el-icon><Plus /></el-icon>
            {{ t('ruleEditor.newRule') }}
          </el-button>
        </div>
      </template>

      <!-- Form Panel -->
      <div v-if="showForm" class="form-panel">
        <h3>{{ editingId ? t('ruleEditor.editRule') : t('ruleEditor.createRule') }}</h3>
        <el-form label-position="top" size="default">
          <el-form-item :label="t('ruleEditor.descriptionLabel')" required>
            <el-input
              v-model="formIntro"
              type="textarea"
              :rows="2"
              :placeholder="t('ruleEditor.descriptionPlaceholder')"
            />
          </el-form-item>
          <el-form-item :label="t('ruleEditor.scopeLabel')">
            <el-select v-model="formScope" style="width: 100%">
              <el-option
                v-for="s in scopeOptions"
                :key="s.value"
                :label="s.label"
                :value="s.value"
              />
            </el-select>
          </el-form-item>
          <div class="form-row">
            <el-form-item :label="t('ruleEditor.priorityLabel')" style="flex: 1">
              <el-input-number v-model="formPriority" :min="0" :max="999" controls-position="right" style="width: 100%" />
            </el-form-item>
            <el-form-item :label="t('ruleEditor.enabledLabel')" style="flex: 1; padding-left: 12px;">
              <el-switch v-model="formEnabled" />
            </el-form-item>
          </div>
        </el-form>
        <div class="form-actions">
          <el-button @click="showForm = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">
            {{ editingId ? t('common.save') : t('common.create') }}
          </el-button>
        </div>
      </div>

      <!-- Rules List -->
      <div v-else v-loading="loading" class="rules-body">
        <div v-if="error" class="error-state">
          <p>{{ error }}</p>
          <el-button size="small" @click="loadRules">{{ t('common.retry') }}</el-button>
        </div>

        <div v-else-if="rules.length === 0 && !loading" class="empty-state">
          <el-icon :size="40" color="#64748b"><Document /></el-icon>
          <p>{{ t('ruleEditor.emptyState') }}</p>
          <el-button size="small" @click="openCreate">{{ t('ruleEditor.createFirst') }}</el-button>
        </div>

        <div v-else class="rules-list">
          <div
            v-for="r in rules"
            :key="r.id"
            class="rule-card"
            :class="{ disabled: !r.enabled }"
          >
            <div class="rule-main">
              <div class="rule-header">
                <span class="rule-id">{{ r.id }}</span>
                <el-tag size="small" :type="r.scope === 'global' ? '' : 'info'" effect="plain">{{ r.scope }}</el-tag>
                <el-tag v-if="!r.enabled" size="small" type="danger" effect="plain">{{ t('ruleEditor.disabled') }}</el-tag>
              </div>
              <p class="rule-intro">{{ r.intro }}</p>
              <div class="rule-meta">
                <span>{{ t('ruleEditor.priority', { n: r.priority ?? 0 }) }}</span>
              </div>
            </div>
            <div class="rule-actions">
              <el-button text size="small" @click="openEdit(r)">
                <el-icon><EditPen /></el-icon>
              </el-button>
              <el-button text size="small" type="danger" @click="handleDelete(r)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0;
}

.form-panel {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
}

.form-panel h3 {
  font-size: 14px;
  font-weight: 600;
  color: #cbd5e1;
  margin: 0 0 16px 0;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-row .el-form-item {
  margin-bottom: 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(55, 65, 81, 0.4);
}

.rules-body {
  min-height: 200px;
}

.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 20px;
  color: #94a3b8;
  font-size: 13px;
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rule-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.rule-card:hover {
  border-color: rgba(6, 182, 212, 0.3);
  background: rgba(15, 23, 42, 0.7);
}

.rule-card.disabled {
  opacity: 0.55;
}

.rule-main {
  flex: 1;
  min-width: 0;
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.rule-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 700;
  color: #22d3ee;
}

.rule-intro {
  font-size: 13px;
  color: #cbd5e1;
  line-height: 1.4;
  margin: 0;
  word-break: break-word;
}

.rule-meta {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.rule-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
</style>

<style>
.rule-editor-dialog .el-overlay {
  background: rgba(0, 0, 0, 0.65);
}

.rule-editor-dialog .el-dialog {
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.rule-editor-dialog .el-dialog__header {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

.rule-editor-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}

.rule-editor-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}

.rule-editor-dialog .el-dialog__body {
  padding: 20px 24px;
  max-height: 60vh;
  overflow-y: auto;
}

/* Form overrides */
.rule-editor-dialog .el-form-item__label {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
}

.rule-editor-dialog .el-input__wrapper {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(55, 65, 81, 0.6);
  box-shadow: none;
}

.rule-editor-dialog .el-input__wrapper:hover,
.rule-editor-dialog .el-input__wrapper.is-focus {
  border-color: rgba(6, 182, 212, 0.5);
}

.rule-editor-dialog .el-input__inner {
  color: #e2e8f0;
}

.rule-editor-dialog .el-input__inner::placeholder {
  color: #64748b;
}

.rule-editor-dialog .el-textarea__inner {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(55, 65, 81, 0.6);
  color: #e2e8f0;
  box-shadow: none;
}

.rule-editor-dialog .el-textarea__inner:hover,
.rule-editor-dialog .el-textarea__inner:focus {
  border-color: rgba(6, 182, 212, 0.5);
}

.rule-editor-dialog .el-select .el-input__wrapper {
  background: rgba(15, 23, 42, 0.8);
}

.rule-editor-dialog .el-select .el-input__inner {
  color: #e2e8f0;
}

/* Tag */
.rule-editor-dialog .el-tag--dark.el-tag--info {
  --el-tag-bg-color: rgba(59, 130, 246, 0.15);
  --el-tag-border-color: rgba(59, 130, 246, 0.3);
  --el-tag-text-color: #93c5fd;
}

.rule-editor-dialog .el-tag--dark.el-tag--danger.is-plain {
  --el-tag-bg-color: rgba(239, 68, 68, 0.1);
  --el-tag-border-color: rgba(239, 68, 68, 0.25);
  --el-tag-text-color: #fca5a5;
}

/* Button text */
.rule-editor-dialog .el-button.is-text {
  color: #94a3b8;
}

.rule-editor-dialog .el-button.is-text:hover {
  color: #06b6d4;
}

.rule-editor-dialog .el-button.is-text.is-danger:hover {
  color: #ef4444;
}

/* Header action button — subtle dark style matching the design system */
.rule-editor-dialog .header-action-btn {
  background-color: #1a2332 !important;
  border-color: rgba(55, 65, 81, 0.6) !important;
  color: #94a3b8 !important;
  border-radius: 8px;
}

.rule-editor-dialog .header-action-btn:hover {
  border-color: rgba(6, 182, 212, 0.4) !important;
  color: #06b6d4 !important;
}

.rule-editor-dialog .header-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
