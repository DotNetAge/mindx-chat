<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CollectionTag, EditPen } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { getMindXClient } from '../services/websocket'
import { useConnectionStore } from '../stores/connectionStore'
import { presetCategories } from '../types/entityCategories'
import type { EntityCategory } from '../types/entityCategories'
import SchemaEditorDialog from './SchemaEditorDialog.vue'

const props = defineProps<{
  visible: boolean
  projectDir?: string
}>()

const emit = defineEmits(['update:visible'])

const { t } = useI18n()

const connectionStore = useConnectionStore()
const loading = ref(false)
const saving = ref(false)
const activeTab = ref(0)

// ── 扁平化所有预设类型 ──
const allPresetTypes = computed(() => {
  const map = new Map<string, { label: string; value: string; desc: string; categoryName: string }>()
  for (const cat of presetCategories) {
    for (const t of cat.types) {
      map.set(t.value, { ...t, categoryName: cat.name })
    }
  }
  return map
})

// ── Schema 编辑器状态 ──
const schemaEditorVisible = ref(false)
const schemaEditorCategory = ref('')
const schemaEditorTypeName = ref('')
const schemaEditorTypeLabel = ref('')

function openSchemaEditor(categoryName: string, typeValue: string, typeLabel: string) {
  schemaEditorCategory.value = categoryName
  schemaEditorTypeName.value = typeValue
  schemaEditorTypeLabel.value = typeLabel
  schemaEditorVisible.value = true
}

// ── 选中的 value 数组 ──
const selectedValues = ref<string[]>([])

// ── 当前 Tab 的选中/总数 ──
const currentCategory = computed(() => presetCategories[activeTab.value])

const currentSelectedCount = computed(() => {
  if (!currentCategory.value) return 0
  return currentCategory.value.types.filter(t => selectedValues.value.includes(t.value)).length
})

const currentTotalCount = computed(() => currentCategory.value?.types.length ?? 0)

const currentAllSelected = computed(() => currentSelectedCount.value === currentTotalCount.value)

function toggleCurrentAll() {
  if (!currentCategory.value) return
  const vals = currentCategory.value.types.map(t => t.value)
  if (currentAllSelected.value) {
    selectedValues.value = selectedValues.value.filter(v => !vals.includes(v))
  } else {
    const existing = new Set(selectedValues.value)
    for (const v of vals) existing.add(v)
    selectedValues.value = Array.from(existing)
  }
}

// ── 从服务端加载保存的 EntityTags ──
async function loadSaved() {
  if (!connectionStore.isConnected) return
  loading.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')
    const params = props.projectDir ? { projectDir: props.projectDir } : {}
    const result = await client.call<{ types: { name: string; title: string; desc: string }[] }>('entity_tags.get', params)
    if (result?.types) {
      selectedValues.value = result.types.map(t => t.name)
    }
  } catch (err: any) {
    // 文件不存在属于正常情况，使用空选择
    if (!err.message?.includes('not found')) {
      console.warn('[EntityTags] load failed:', err)
    }
  } finally {
    loading.value = false
  }
}

// ── 保存到服务端 ──
async function handleSave() {
  if (!connectionStore.isConnected) {
    ElMessage.warning(t('entityTags.notConnected'))
    return
  }

  saving.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')

    // 从 selectedValues 构建保存数据
    const selectedTypes: { name: string; title: string; desc: string; category: string }[] = []
    for (const val of selectedValues.value) {
      const preset = allPresetTypes.value.get(val)
      if (preset) {
        selectedTypes.push({
          name: preset.value,
          title: preset.label,
          desc: preset.desc,
          category: preset.categoryName
        })
      }
    }

    await client.call('entity_tags.save', { types: selectedTypes, projectDir: props.projectDir })
    ElMessage.success(t('entityTags.saveSuccess', { n: selectedTypes.length }))
    emit('update:visible', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('entityTags.saveFailed'))
  } finally {
    saving.value = false
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    activeTab.value = 0
    loadSaved()
  }
})
</script>

<template>
  <div v-if="visible">
    <el-dialog
      :model-value="true"
      @update:model-value="emit('update:visible', false)"
      title=""
      width="680px"
      class="entity-tags-dialog"
      append-to-body
      destroy-on-close
    >
      <template #header>
        <div class="dialog-header">
          <h2>
            <el-icon><CollectionTag /></el-icon>
            {{ t('entityTags.title') }}
          </h2>
          <span class="header-hint">{{ t('entityTags.hint') }}</span>
          <el-alert
            v-if="props.projectDir"
            :title="props.projectDir"
            type="success"
            show-icon
            :closable="false"
            effect="dark"
            class="header-region-alert"
          />
        </div>
      </template>

      <div v-loading="loading" class="dialog-body">
        <!-- Tabs -->
        <el-tabs v-model="activeTab" class="category-tabs" tab-position="left">
          <el-tab-pane
            v-for="(cat, idx) in presetCategories"
            :key="cat.name"
            :label="cat.label"
            :name="idx"
          >
            <template #label>
              <div class="tab-label">
                <span>{{ t('entityTags.tabs.' + cat.name) }}</span>
                <el-tag size="small" class="tab-count" round>
                  {{ cat.types.filter(t => selectedValues.includes(t.value)).length }}/{{ cat.types.length }}
                </el-tag>
              </div>
            </template>

            <div class="tab-content">
              <div class="tab-actions">
                <el-checkbox
                  :model-value="currentAllSelected"
                  :indeterminate="currentSelectedCount > 0 && !currentAllSelected"
                  @change="toggleCurrentAll"
                >
                  {{ t('entityTags.selectAll') }}
                </el-checkbox>
                <span class="tab-summary">{{ t('entityTags.selected', { n: currentSelectedCount }) }} / {{ currentTotalCount }}</span>
              </div>

              <el-checkbox-group v-model="selectedValues" class="tag-checkbox-group">
                <div
                  v-for="et in cat.types"
                  :key="et.value"
                  class="tag-checkbox-item"
                >
                  <el-checkbox :value="et.value" :label="et.value" class="tag-checkbox">
                    <div class="tag-item-content">
                      <span class="tag-label">{{ t('entityTags.types.' + et.value) }}</span>
                      <span class="tag-value">{{ et.value }}</span>
                      <span class="tag-desc">{{ t('entityTags.descs.' + et.value) }}</span>
                    </div>
                  </el-checkbox>
                  <el-tooltip :content="t('entityTags.editSchema')" placement="top" :show-after="400">
                    <el-button
                      class="edit-schema-btn"
                      text
                      size="small"
                      @click.stop="openSchemaEditor(cat.name, et.value, t('entityTags.types.' + et.value))"
                    >
                      <el-icon><EditPen /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </el-checkbox-group>
            </div>
          </el-tab-pane>
        </el-tabs>

        <!-- 底部统计 -->
        <div class="selection-footer">
          <el-tag type="info" round>
            {{ t('entityTags.selected', { n: selectedValues.length }) }}
          </el-tag>
        </div>
      </div>

      <template #footer>
        <el-button @click="emit('update:visible', false)">{{ t('entityTags.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ t('entityTags.save') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Schema 编辑器 -->
    <SchemaEditorDialog
      :visible="schemaEditorVisible"
      @update:visible="schemaEditorVisible = $event"
      :category="schemaEditorCategory"
      :type-name="schemaEditorTypeName"
      :type-label="schemaEditorTypeLabel"
      :project-dir="props.projectDir"
      @saved="loadSaved()"
    />
  </div>
</template>

<style scoped>
.dialog-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.header-hint {
  font-size: 12px;
  color: #64748b;
  font-weight: 400;
}

.header-region-alert {
  margin-top: 4px;
}
.header-region-alert :deep(.el-alert__content) {
  overflow: hidden;
}
.header-region-alert :deep(.el-alert__title) {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  direction: rtl;
  text-align: left;
}

.dialog-body {
  min-height: 360px;
}

.category-tabs {
  --el-tabs-header-height: auto;
}

.category-tabs :deep(.el-tabs__header) {
  margin-right: 0;
}

.category-tabs :deep(.el-tabs__nav-wrap) {
  padding: 0;
}

.category-tabs :deep(.el-tabs__item) {
  height: auto;
  padding: 8px 16px;
  line-height: 1.4;
  color: #94a3b8;
  border: none !important;
  transition: all 0.2s ease;
}

.category-tabs :deep(.el-tabs__item:hover) {
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.06);
}

.category-tabs :deep(.el-tabs__item.is-active) {
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.1);
  border-radius: 8px;
}

.category-tabs :deep(.el-tabs__active-bar) {
  display: none;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.tab-count {
  font-size: 10px;
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  background: rgba(55, 65, 81, 0.6);
  border: none;
  color: #94a3b8;
}

.tab-content {
  padding: 0 4px;
}

.tab-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 8px;
}

.tab-actions :deep(.el-checkbox__label) {
  font-size: 12px;
  color: #94a3b8;
}

.tab-summary {
  font-size: 11px;
  color: #64748b;
}

.tag-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tag-checkbox-item {
  display: flex;
  align-items: center;
  padding: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.25);
  transition: background 0.15s ease;
}

.tag-checkbox-item .edit-schema-btn {
  flex-shrink: 0;
  margin-left: auto;
  margin-right: 4px;
  color: #475569;
  opacity: 0;
  transition: all 0.2s ease;
}

.tag-checkbox-item:hover .edit-schema-btn {
  opacity: 1;
  color: #06b6d4;
}

.tag-checkbox-item .edit-schema-btn:hover {
  color: #22d3ee;
  background: rgba(6, 182, 212, 0.1);
}

.tag-checkbox-item:last-child {
  border-bottom: none;
}

.tag-checkbox-item:hover {
  background: rgba(6, 182, 212, 0.04);
}

.tag-checkbox {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  height: auto;
}

.tag-checkbox :deep(.el-checkbox__label) {
  width: 100%;
}

.tag-checkbox :deep(.el-checkbox__input) {
  margin-top: 2px;
}

.tag-item-content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.tag-label {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  min-width: 60px;
}

.tag-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #64748b;
  background: rgba(55, 65, 81, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
  min-width: 80px;
  text-align: center;
}

.tag-desc {
  font-size: 12px;
  color: #64748b;
  flex: 1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
  margin-top: 12px;
}
</style>

<style>
.entity-tags-dialog .el-overlay {
  background: rgba(0, 0, 0, 0.65);
}

.entity-tags-dialog .el-dialog {
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.entity-tags-dialog .el-dialog__header {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

.entity-tags-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}

.entity-tags-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}

.entity-tags-dialog .el-dialog__body {
  padding: 16px 24px 12px;
  max-height: 60vh;
  overflow-y: auto;
}

/* Checkbox styling */
.entity-tags-dialog .el-checkbox {
  color: #cbd5e1;
}

.entity-tags-dialog .el-checkbox.is-checked {
  color: #06b6d4;
}

.entity-tags-dialog .el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #06b6d4;
  border-color: #06b6d4;
}

.entity-tags-dialog .el-checkbox__input.is-indeterminate .el-checkbox__inner {
  background-color: #06b6d4;
  border-color: #06b6d4;
}

.entity-tags-dialog .el-checkbox__inner {
  background: rgba(15, 23, 42, 0.8);
  border-color: rgba(55, 65, 81, 0.6);
}

/* Tab pane */
.entity-tags-dialog .el-tabs__content {
  padding-left: 16px;
}

/* Tag styling */
.entity-tags-dialog .el-tag--info {
  --el-tag-bg-color: rgba(55, 65, 81, 0.4);
  --el-tag-border-color: rgba(55, 65, 81, 0.5);
  --el-tag-text-color: #94a3b8;
}
</style>
