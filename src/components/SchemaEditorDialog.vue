<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Top, Bottom } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { getMindXClient } from '../services/websocket'
import { getPropertyLabel } from '../types/entityCategories'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
  category: string
  typeName: string
  typeLabel: string
  projectDir?: string
}>()

const emit = defineEmits(['update:visible', 'saved'])

const loading = ref(false)
const saving = ref(false)
const description = ref('')
const fieldIdCounter = ref(0)

interface PropField {
  id: number
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'array'
  description: string
  required: boolean
}

const fields = ref<PropField[]>([])
const changed = ref(false)

const fieldTypeOptions = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'date', label: t('schemaEditor.typeDate') },
  { value: 'array', label: t('schemaEditor.typeArray') },
]

function fieldTypeLabel(type: string): string {
  return fieldTypeOptions.find(o => o.value === type)?.label || type
}

// 当前选中编辑的字段在侧边栏中的索引
const editingIndex = ref<number | null>(null)

// ── 加载 Schema ──
async function loadSchema() {
  if (!props.category || !props.typeName) return
  loading.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')
    const getParams: any = { category: props.category, name: props.typeName }
    if (props.projectDir) getParams.projectDir = props.projectDir
    const result = await client.call<{ category: string; name: string; schema: Record<string, any> }>(
      'schema.get',
      getParams
    )
    const schema = result.schema
    description.value = schema.description || ''
    fields.value = []
    fieldIdCounter.value = 0
    if (schema.properties) {
      const required = schema.required || []
      for (const [key, val] of Object.entries(schema.properties)) {
        const prop = val as any
        fields.value.push({
          id: fieldIdCounter.value++,
          name: key,
          type: detectFieldType(prop),
          description: prop.description || '',
          required: required.includes(key),
        })
      }
    }
    changed.value = false
    editingIndex.value = fields.value.length > 0 ? 0 : null
  } catch (err: any) {
    if (err.message?.includes('schema not found')) {
      ElMessage.warning(t('schemaEditor.schemaNotFound'))
      description.value = ''
      fields.value = []
      fieldIdCounter.value = 0
      changed.value = false
      editingIndex.value = null
    } else {
      ElMessage.error(t('schemaEditor.loadFailed'))
    }
  } finally {
    loading.value = false
  }
}

function detectFieldType(prop: any): PropField['type'] {
  const t = prop.type
  if (t === 'string' && prop.format === 'date') return 'date'
  if (t === 'string') return 'string'
  if (t === 'number' || t === 'integer') return 'number'
  if (t === 'boolean') return 'boolean'
  if (t === 'array') return 'array'
  return 'string'
}

// ── 添加新字段 ──
function addField() {
  const newField: PropField = {
    id: fieldIdCounter.value++,
    name: '',
    type: 'string',
    description: '',
    required: false,
  }
  fields.value.push(newField)
  editingIndex.value = fields.value.length - 1
  changed.value = true
}

// ── 删除字段 ──
async function removeField(index: number) {
  try {
    await ElMessageBox.confirm(
      t('schemaEditor.confirmDelete'),
      t('schemaEditor.confirmDeleteTitle'),
      { confirmButtonText: t('schemaEditor.confirmDeleteYes'), cancelButtonText: t('schemaEditor.confirmDeleteNo'), type: 'warning' }
    )
    fields.value.splice(index, 1)
    if (editingIndex.value === index) {
      editingIndex.value = fields.value.length > 0
        ? Math.min(index, fields.value.length - 1)
        : null
    } else if (editingIndex.value !== null && editingIndex.value > index) {
      editingIndex.value--
    }
    changed.value = true
  } catch { /* cancel */ }
}

// ── 上移 ──
function moveUp(index: number) {
  if (index <= 0) return
  const arr = fields.value
  ;[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]
  if (editingIndex.value === index) {
    editingIndex.value = index - 1
  } else if (editingIndex.value === index - 1) {
    editingIndex.value = index
  }
  changed.value = true
}

// ── 下移 ──
function moveDown(index: number) {
  if (index >= fields.value.length - 1) return
  const arr = fields.value
  ;[arr[index], arr[index + 1]] = [arr[index + 1], arr[index]]
  if (editingIndex.value === index) {
    editingIndex.value = index + 1
  } else if (editingIndex.value === index + 1) {
    editingIndex.value = index
  }
  changed.value = true
}

// ── 字段名变更时自动填充中文提示 ──
function onFieldNameBlur(field: PropField) {
  // 不做自动填充，只做展示用
  changed.value = true
}

// ── 保存 ──
async function handleSave() {
  // 校验：字段名不能为空
  for (let i = 0; i < fields.value.length; i++) {
    if (!fields.value[i].name.trim()) {
      ElMessage.warning(t('schemaEditor.nameRequired'))
      editingIndex.value = i
      return
    }
  }

  saving.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')

    const schema = buildSchema()
    const saveParams: any = {
      category: props.category,
      name: props.typeName,
      schema,
    }
    if (props.projectDir) saveParams.projectDir = props.projectDir
    await client.call('schema.save', saveParams)
    ElMessage.success(t('schemaEditor.saveSuccess'))
    changed.value = false
    emit('saved')
    emit('update:visible', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('schemaEditor.saveFailed'))
  } finally {
    saving.value = false
  }
}

function buildSchema(): Record<string, any> {
  const properties: Record<string, any> = {}
  const required: string[] = []
  for (const field of fields.value) {
    if (!field.name.trim()) continue
    const prop: any = { type: fieldTypeToSchema(field.type) }
    if (field.type === 'date') {
      prop.format = 'date'
    }
    if (field.type === 'array') {
      prop.items = { type: 'string' }
    }
    if (field.description) {
      prop.description = field.description
    }
    properties[field.name.trim()] = prop
    if (field.required) {
      required.push(field.name.trim())
    }
  }
  const schema: Record<string, any> = {
    type: 'object',
    properties,
  }
  if (description.value) {
    schema.description = description.value
  }
  if (required.length > 0) {
    schema.required = required
  }
  return schema
}

function fieldTypeToSchema(type: PropField['type']): string {
  if (type === 'date') return 'string'
  return type
}

function onDescInput() {
  changed.value = true
}

function onFieldChange() {
  changed.value = true
}

watch(() => props.visible, (val) => {
  if (val) {
    loadSchema()
  }
})
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', false)"
    :title="t('schemaEditor.title', { label: typeLabel })"
    width="820px"
    class="schema-editor-dialog"
    append-to-body
    destroy-on-close
  >
    <div v-loading="loading" class="editor-body">
      <!-- 路径提示 -->
      <div class="schema-path-info">
        <el-tag size="small" type="info">{{ category }}</el-tag>
        <span class="path-separator">/</span>
        <el-tag size="small" type="info">{{ typeName }}</el-tag>
      </div>

      <!-- 描述 -->
      <div class="form-section">
        <label class="section-label">{{ t('schemaEditor.descLabel') }}</label>
        <el-input
          v-model="description"
          type="textarea"
          :rows="2"
          :placeholder="t('schemaEditor.descPlaceholder')"
          @input="onDescInput"
        />
      </div>

      <!-- 字段列表 -->
      <div class="form-section">
        <div class="section-header">
          <label class="section-label">{{ t('schemaEditor.fieldsLabel') }}</label>
          <el-button size="small" type="primary" plain @click="addField">
            <el-icon><Plus /></el-icon>
            {{ t('schemaEditor.addField') }}
          </el-button>
        </div>

        <div v-if="fields.length === 0" class="empty-fields">
          <el-empty :description="t('schemaEditor.emptyFields')" :image-size="64">
            <el-button size="small" type="primary" @click="addField">
              <el-icon><Plus /></el-icon>
              {{ t('schemaEditor.addField') }}
            </el-button>
          </el-empty>
        </div>
      </div>

      <!-- 字段列表 + 编辑面板 -->
      <div v-if="fields.length > 0" class="fields-layout">
        <!-- 左侧：字段列表 -->
        <div class="fields-sidebar">
          <div
            v-for="(field, idx) in fields"
            :key="field.id"
            class="field-list-item"
            :class="{ 'is-active': editingIndex === idx }"
            @click="editingIndex = idx"
          >
            <div class="field-list-info">
              <span class="field-list-name">{{ field.name || t('schemaEditor.unnamed') }}</span>
              <el-tag size="small" class="field-list-type">{{ fieldTypeLabel(field.type) }}</el-tag>
            </div>
            <div class="field-list-req" v-if="field.required">
              <el-tag size="small" type="danger" class="req-tag">{{ t('schemaEditor.requiredShort') }}</el-tag>
            </div>
          </div>
        </div>

        <!-- 右侧：编辑面板 -->
        <div v-if="editingIndex !== null" class="field-editor">
          <div class="editor-card">
            <!-- 顶部操作栏 -->
            <div class="editor-card-header">
              <span class="editor-card-title">{{ t('schemaEditor.fieldSettings') }}</span>
              <div class="editor-card-actions">
                <el-tooltip :content="t('schemaEditor.moveUp')">
                  <el-button text size="small" :icon="Top" :disabled="editingIndex === 0" @click="moveUp(editingIndex)" />
                </el-tooltip>
                <el-tooltip :content="t('schemaEditor.moveDown')">
                  <el-button text size="small" :icon="Bottom" :disabled="editingIndex >= fields.length - 1" @click="moveDown(editingIndex)" />
                </el-tooltip>
                <el-tooltip :content="t('schemaEditor.deleteField')">
                  <el-button text size="small" type="danger" :icon="Delete" @click="removeField(editingIndex)" />
                </el-tooltip>
              </div>
            </div>

            <!-- 字段名 -->
            <div class="editor-field-row">
              <label class="editor-field-label">{{ t('schemaEditor.fieldName') }}</label>
              <el-input
                v-model="fields[editingIndex].name"
                :placeholder="t('schemaEditor.fieldNamePlaceholder')"
                @input="onFieldChange"
                @blur="onFieldNameBlur(fields[editingIndex])"
              />
              <div v-if="getPropertyLabel(fields[editingIndex].name) !== fields[editingIndex].name" class="field-name-hint">
                {{ getPropertyLabel(fields[editingIndex].name) }}
              </div>
            </div>

            <!-- 类型 -->
            <div class="editor-field-row">
              <label class="editor-field-label">{{ t('schemaEditor.fieldType') }}</label>
              <el-select v-model="fields[editingIndex].type" @change="onFieldChange">
                <el-option
                  v-for="opt in fieldTypeOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>

            <!-- 描述 -->
            <div class="editor-field-row">
              <label class="editor-field-label">{{ t('schemaEditor.fieldDesc') }}</label>
              <el-input
                v-model="fields[editingIndex].description"
                type="textarea"
                :rows="2"
                :placeholder="t('schemaEditor.fieldDescPlaceholder')"
                @input="onFieldChange"
              />
            </div>

            <!-- 必填开关 -->
            <div class="editor-field-row editor-switch-row">
              <span class="editor-field-label">{{ t('schemaEditor.required') }}</span>
              <el-switch v-model="fields[editingIndex].required" @change="onFieldChange" />
            </div>
          </div>
        </div>

        <!-- 未选中字段 -->
        <div v-else class="field-editor editor-empty-state">
          <el-empty :description="t('schemaEditor.selectFieldHint')" :image-size="48" />
        </div>
      </div>

      <!-- 底部统计 -->
      <div class="field-count-footer">
        <span>{{ t('schemaEditor.fieldCount', { n: fields.length }) }}</span>
      </div>
    </div>

    <template #footer>
      <div class="editor-footer">
        <el-button @click="emit('update:visible', false)">
          {{ t('schemaEditor.cancel') }}
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!changed || loading"
          @click="handleSave"
        >
          {{ t('schemaEditor.save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.schema-path-info {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
}

.path-separator {
  color: #64748b;
  font-size: 14px;
}

.editor-body {
  min-height: 300px;
}

.form-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 8px;
}

.section-header .section-label {
  margin-bottom: 0;
}

.empty-fields {
  padding: 8px 0;
}

/* ── 字段列表 + 编辑面板布局 ── */
.fields-layout {
  display: flex;
  gap: 16px;
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.3);
}

/* 左侧字段列表 */
.fields-sidebar {
  width: 200px;
  min-width: 200px;
  border-right: 1px solid rgba(55, 65, 81, 0.3);
  padding: 8px;
  overflow-y: auto;
  max-height: 400px;
  background: rgba(15, 23, 42, 0.2);
}

.field-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 2px;
}

.field-list-item:hover {
  background: rgba(6, 182, 212, 0.06);
}

.field-list-item.is-active {
  background: rgba(6, 182, 212, 0.12);
  border-left: 3px solid #06b6d4;
}

.field-list-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.field-list-name {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-list-type {
  font-size: 10px;
  padding: 0 6px;
  height: 16px;
  line-height: 16px;
  background: rgba(55, 65, 81, 0.5);
  border: none;
  color: #94a3b8;
}

.req-tag {
  font-size: 10px;
  padding: 0 5px;
  height: 16px;
  line-height: 16px;
}

/* 右侧编辑面板 */
.field-editor {
  flex: 1;
  padding: 12px 16px;
  min-height: 300px;
}

.editor-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-card-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.editor-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.25);
}

.editor-card-actions {
  display: flex;
  gap: 2px;
}

.editor-field-row {
  margin-bottom: 14px;
}

.editor-field-label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
  font-weight: 500;
}

.editor-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor-switch-row .editor-field-label {
  margin-bottom: 0;
}

.field-name-hint {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
  padding-left: 2px;
}

/* 底部统计 */
.field-count-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>

<style>
.schema-editor-dialog .el-overlay {
  background: rgba(0, 0, 0, 0.65);
}

.schema-editor-dialog .el-dialog {
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.schema-editor-dialog .el-dialog__header {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

.schema-editor-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}

.schema-editor-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}

.schema-editor-dialog .el-dialog__body {
  padding: 16px 24px 12px;
  max-height: 70vh;
  overflow-y: auto;
}

.schema-editor-dialog .el-dialog__footer {
  padding: 12px 24px 18px;
  border-top: 1px solid rgba(55, 65, 81, 0.5);
}
</style>
