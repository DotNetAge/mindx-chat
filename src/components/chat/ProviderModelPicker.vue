<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConnectionStore } from '../../stores/connectionStore'
import type { ProviderInfo, ModelConfig, ProviderCreateParams, ModelCreateParams } from '../../types/websocket'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'model-changed'): void
}>()

const connectionStore = useConnectionStore()

const selectedProvider = ref('')
const selectedModel = ref('')
const editingProvider = ref<ProviderInfo | null>(null)
const editingModel = ref<ModelConfig | null>(null)
const showProviderForm = ref(false)
const showModelForm = ref(false)
const saving = ref(false)

const providerList = computed(() => connectionStore.providers)

const isProviderConfigured = (name: string): boolean => {
  const provider = connectionStore.rawProviders.find(p => p.name === name)
  return provider?.api_key === true
}

const currentModels = computed(() => {
  return providerList.value.find(p => p.name === selectedProvider.value)?.models || []
})

function selectProvider(name: string) {
  selectedProvider.value = name
  selectedModel.value = ''
}

function selectModel(name: string) {
  if (selectedModel.value === name) {
    selectedModel.value = ''
    return
  }
  selectedModel.value = name
}

async function confirmModel() {
  if (!selectedModel.value) return
  const model = currentModels.value.find(m => m.name === selectedModel.value)
  if (!model) return

  try {
    await connectionStore.switchModel(model.name, model.provider)
    emit('model-changed')
    emit('update:visible', false)
  } catch (err) {
    console.error('[MindX] Failed to switch model:', err)
  }
}

// --- Provider Editing ---

const providerForm = ref({
  name: '',
  title: '',
  base_url: '',
  api_key: '',
  auth_token: ''
})

function openAddProvider() {
  providerForm.value = { name: '', title: '', base_url: '', api_key: '', auth_token: '' }
  showProviderForm.value = true
}

function openEditProvider(p: ProviderInfo) {
  editingProvider.value = p
  providerForm.value = { ...p }
  showProviderForm.value = true
}

async function saveProvider() {
  if (!providerForm.value.name || !providerForm.value.base_url || !providerForm.value.api_key) {
    ElMessage.warning('请填写必填字段（名称、BaseURL、API Key）')
    return
  }

  saving.value = true
  try {
    if (editingProvider.value) {
      await connectionStore.updateProvider(providerForm.value)
      ElMessage.success(`已更新 ${providerForm.value.title || providerForm.value.name}`)
    } else {
      await connectionStore.createProvider(providerForm.value as ProviderCreateParams)
      ElMessage.success(`已创建 ${providerForm.value.title || providerForm.value.name}`)
      if (!selectedProvider.value) selectedProvider.value = providerForm.value.name
    }
    showProviderForm.value = false
    editingProvider.value = null
    await refreshData()
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function deleteProvider(name: string) {
  const p = providerList.value.find(p => p.name === name)
  try {
    await ElMessageBox.confirm(
      `确定要删除供应商 "${p?.title || name}" 吗？`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  try {
    await connectionStore.deleteProvider(name)
    ElMessage.success(`已删除 ${name}`)
    if (selectedProvider.value === name) selectedProvider.value = ''
    await refreshData()
  } catch (err: any) {
    ElMessage.error(err.message || '删除失败')
  }
}

// --- Model Editing ---

const modelForm = ref<any>({})

const defaultModelForm = () => ({
  name: '',
  title: '',
  description: '',
  provider: '',
  base_url: '',
  api_key: '',
  max_tokens: 131072,
  context_length: 262144,
  is_local: false,
  func_calling: true,
  structuring: true,
  web_searching: false,
  prefix_con: false,
  context_cache: true,
  top_p: 0,
  top_k: 0,
  temperature: 0.7,
  repetition_penalty: 0,
  frequency_penalty: 0,
  enabled: true,
  max_turns: 0,
  cost_per_1m_in: 0,
  cost_per_1m_out: 0
})

function openAddModel() {
  modelForm.value = { ...defaultModelForm(), provider: selectedProvider.value }
  editingModel.value = null
  showModelForm.value = true
}

function openEditModel(m: ModelConfig) {
  editingModel.value = m
  modelForm.value = {
    name: m.name,
    title: m.title || '',
    description: m.description || '',
    provider: m.provider || selectedProvider.value,
    base_url: m.base_url || '',
    api_key: m.api_key || '',
    max_tokens: m.max_tokens || 131072,
    context_length: m.context_length || 262144,
    is_local: !!m.is_local,
    func_calling: !!m.func_calling,
    structuring: !!m.structuring,
    web_searching: !!m.web_searching,
    prefix_con: !!m.prefix_con,
    context_cache: !!m.context_cache,
    top_p: m.top_p || 0,
    top_k: m.top_k || 0,
    temperature: m.temperature ?? 0.7,
    repetition_penalty: m.repetition_penalty || 0,
    frequency_penalty: m.frequency_penalty || 0,
    enabled: m.enabled !== false,
    max_turns: m.max_turns || 0,
    cost_per_1m_in: 0,
    cost_per_1m_out: 0
  }
  showModelForm.value = true
}

async function saveModel() {
  if (!modelForm.value.name || !modelForm.value.title || !modelForm.value.provider) {
    ElMessage.warning('请填写必填字段（名称、标题、供应商）')
    return
  }

  saving.value = true
  try {
    if (editingModel.value) {
      await connectionStore.updateModel(modelForm.value)
      ElMessage.success(`已更新 ${modelForm.value.title}`)
    } else {
      await connectionStore.createModel(modelForm.value as ModelCreateParams)
      ElMessage.success(`已创建 ${modelForm.value.title}`)
    }
    showModelForm.value = false
    editingModel.value = null
    await refreshData()
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function deleteModel(name: string) {
  const m = currentModels.value.find(m => m.name === name)
  try {
    await ElMessageBox.confirm(
      `确定要删除模型 "${m?.title || name}" 吗？`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  try {
    await connectionStore.deleteModel(name)
    ElMessage.success(`已删除 ${name}`)
    if (selectedModel.value === name) selectedModel.value = ''
    await refreshData()
  } catch (err: any) {
    ElMessage.error(err.message || '删除失败')
  }
}

// --- Data Refresh ---

async function refreshData() {
  await Promise.all([
    connectionStore.fetchProviders(),
    connectionStore.fetchModels()
  ])
}

function handleClose() {
  emit('update:visible', false)
}

function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

watch(() => props.visible, async (val) => {
  if (val && connectionStore.isConnected) {
    await refreshData()
  }
})
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="模型与供应商设置"
    width="780px"
    :close-on-click-modal="false"
    @update:model-value="(v) => !v && handleClose()"
    class="provider-model-dialog"
  >
    <div class="picker-layout">
      <!-- Left: Provider List -->
      <div class="panel-left">
        <div class="panel-header">
          <span class="panel-title">供应商</span>
        </div>

        <div class="provider-list">
          <div
            v-for="p in providerList"
            :key="p.name"
            class="provider-item"
            :class="{ active: selectedProvider === p.name, unconfigured: !isProviderConfigured(p.name) }"
            @click="selectProvider(p.name)"
          >
            <div class="provider-main">
              <span class="provider-name">{{ connectionStore.formatProviderTitle(p.name) }}</span>
              <span class="provider-count">{{ p.models.length }} 模型</span>
            </div>
            <div class="item-actions" @click.stop>
              <button class="action-btn" title="编辑" @click="openEditProvider(p)">✎</button>
              <button class="action-btn danger" title="删除" @click="deleteProvider(p.name)">−</button>
              <span v-if="!isProviderConfigured(p.name)" class="unconfigured-tag">未配置</span>
            </div>
          </div>

          <div v-if="!providerList.length" class="empty-hint">暂无供应商</div>
        </div>

        <button class="add-bottom-btn" @click="openAddProvider">+ 新增供应商</button>
      </div>

      <!-- Right: Model List -->
      <div class="panel-right">
        <div class="panel-header">
          <span class="panel-title">{{ selectedProvider ? `${connectionStore.formatProviderTitle(selectedProvider)} 模型` : '模型列表' }}</span>
        </div>

        <div class="model-list">
          <template v-if="selectedProvider">
            <div
              v-for="m in currentModels"
              :key="m.name"
              class="model-item"
              :class="{ active: selectedModel === m.name }"
              @click="selectModel(m.name)"
            >
              <div class="model-main">
                <div class="model-info">
                  <span class="model-name">{{ m.title || m.name }}</span>
                  <span v-if="m.name === connectionStore.currentModelName" class="current-badge">当前</span>
                  <span v-if="!m.enabled" class="disabled-badge">禁用</span>
                </div>
                <div class="model-desc">{{ m.description }}</div>
                <div class="model-meta">
                  <span>{{ m.context_length ? formatNumber(m.context_length) + ' ctx' : '' }}</span>
                  <span v-if="m.is_local" class="local-tag">本地</span>
                </div>
              </div>
              <div class="item-actions" @click.stop>
                <button class="action-btn" title="编辑" @click="openEditModel(m)">✎</button>
                <button class="action-btn danger" title="删除" @click="deleteModel(m.name)">−</button>
              </div>
            </div>

            <div v-if="currentModels.length === 0" class="empty-hint">该供应商暂无模型</div>
          </template>

          <div v-else class="empty-hint">← 请先选择左侧的供应商</div>
        </div>

        <button
          v-if="selectedProvider"
          class="add-bottom-btn"
          @click="openAddModel"
        >+ 新增模型</button>
      </div>
    </div>

    <!-- Provider Form Dialog -->
    <el-dialog
      :model-value="showProviderForm"
      :title="editingProvider ? '编辑供应商' : '新增供应商'"
      width="480px"
      append-to-body
      @update:model-value="showProviderForm = $event"
    >
      <el-form :model="providerForm" label-width="90px" label-position="top">
        <el-form-item label="标识名 (name)" required>
          <el-input v-model="providerForm.name" placeholder="如: deepseek, dashscope" :disabled="!!editingProvider" />
        </el-form-item>
        <el-form-item label="显示标题" required>
          <el-input v-model="providerForm.title" placeholder="如: DeepSeek, Alibaba" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="providerForm.base_url" placeholder="https://api.deepseek.com" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="providerForm.api_key" placeholder="sk-xxx 或环境变量名" show-password />
        </el-form-item>
        <el-form-item label="Auth Token">
          <el-input v-model="providerForm.auth_token" placeholder="可选" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showProviderForm = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveProvider">保存</el-button>
      </template>
    </el-dialog>

    <!-- Model Form Dialog -->
    <el-dialog
      :model-value="showModelForm"
      :title="editingModel ? '编辑模型' : '新增模型'"
      width="560px"
      append-to-body
      @update:model-value="showModelForm = $event"
    >
      <el-form :model="modelForm" label-width="100px" label-position="top">
        <div class="form-row">
          <el-form-item label="标识名" required style="flex:1">
            <el-input v-model="modelForm.name" placeholder="如: gpt-4o" :disabled="!!editingModel" />
          </el-form-item>
          <el-form-item label="显示标题" required style="flex:1">
            <el-input v-model="modelForm.title" placeholder="GPT-4o" />
          </el-form-item>
        </div>
        <el-form-item label="描述">
          <el-input v-model="modelForm.description" type="textarea" :rows="2" placeholder="模型特点说明..." />
        </el-form-item>
        <el-form-item label="所属供应商" required>
          <el-select v-model="modelForm.provider" style="width:100%">
            <el-option v-for="p in providerList" :key="p.name" :label="connectionStore.formatProviderTitle(p.name)" :value="p.name" />
          </el-select>
        </el-form-item>
        <div class="form-row">
          <el-form-item label="Max Tokens" style="flex:1">
            <el-input-number v-model="modelForm.max_tokens" :min="1" style="width:100%" controls-position="right" />
          </el-form-item>
          <el-form-item label="Context Length" style="flex:1">
            <el-input-number v-model="modelForm.context_length" :min="1" style="width:100%" controls-position="right" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="Temperature" style="flex:1">
            <el-slider v-model="modelForm.temperature" :min="0" :max="2" :step="0.1" show-input :show-input-controls="false" input-size="small" />
          </el-form-item>
          <el-form-item label="Top P" style="flex:1">
            <el-slider v-model="modelForm.top_p" :min="0" :max="1" :step="0.05" show-input :show-input-controls="false" input-size="small" />
          </el-form-item>
        </div>
        <el-divider content-position="left">能力开关</el-divider>
        <div class="capability-grid">
          <el-checkbox v-model="modelForm.func_calling">函数调用</el-checkbox>
          <el-checkbox v-model="modelForm.structuring">结构化输出</el-checkbox>
          <el-checkbox v-model="modelForm.web_searching">联网搜索</el-checkbox>
          <el-checkbox v-model="modelForm.context_cache">上下文缓存</el-checkbox>
          <el-checkbox v-model="modelForm.prefix_con">前缀连续</el-checkbox>
          <el-checkbox v-model="modelForm.is_local">本地模型</el-checkbox>
        </div>
        <el-form-item label="启用">
          <el-switch v-model="modelForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showModelForm = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveModel">保存</el-button>
      </template>
    </el-dialog>

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
      <el-button
        type="primary"
        :disabled="!selectedModel"
        @click="confirmModel"
      >
        切换到选中模型
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.picker-layout {
  display: flex;
  gap: 16px;
  min-height: 380px;
}

.panel-left {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(55, 65, 81, 0.6);
  padding-right: 12px;
}

.panel-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

/* Provider List */
.provider-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  flex: 1;
}

.provider-item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.provider-item:hover { background: rgba(6, 182, 212, 0.08); }
.provider-item:hover .item-actions { opacity: 1; }

.provider-item.active {
  background: rgba(6, 182, 212, 0.12);
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.provider-item.unconfigured {
  opacity: 0.45;
}

.provider-item.unconfigured .provider-name,
.provider-item.unconfigured .provider-count {
  color: #64748b;
}

.unconfigured-tag {
  font-size: 9px;
  color: #94a3b8;
  margin-left: 4px;
  white-space: nowrap;
}

.provider-main {
  min-width: 0;
  flex: 1;
}

.provider-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-count {
  font-size: 10px;
  color: var(--text-muted);
}

.item-actions {
  opacity: 0;
  transition: opacity 0.15s;
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.action-btn {
  width: 22px; height: 22px;
  border: 1px solid rgba(55, 65, 81, 0.4);
  background: transparent;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(6, 182, 212, 0.12);
  color: #67e8f9;
  border-color: rgba(6, 182, 212, 0.3);
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.3);
}

/* Model List */
.model-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
}

.model-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.model-item:hover { background: rgba(6, 182, 212, 0.06); }
.model-item:hover .item-actions { opacity: 1; }

.model-item.active {
  background: rgba(6, 182, 212, 0.1);
  border-color: rgba(6, 182, 212, 0.3);
}

.model-main { min-width: 0; flex: 1; }

.model-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.model-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
}

.current-badge {
  font-size: 10px;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.disabled-badge {
  font-size: 10px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.local-tag {
  font-size: 10px;
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
}

.model-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 3px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.model-meta {
  margin-top: 4px;
  font-size: 10px;
  color: #475569;
  display: flex;
  gap: 8px;
}

.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
}

/* Form */
.form-row { display: flex; gap: 12px; }
.capability-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

/* Bottom Add Button */
.add-bottom-btn {
  margin-top: 8px;
  padding: 7px 0;
  border: 1px dashed rgba(55, 65, 81, 0.5);
  background: transparent;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
  width: 100%;
  text-align: center;
  letter-spacing: 0.5px;
}

.add-bottom-btn:hover {
  border-color: rgba(6, 182, 212, 0.4);
  color: #67e8f9;
  background: rgba(6, 182, 212, 0.05);
}
</style>
