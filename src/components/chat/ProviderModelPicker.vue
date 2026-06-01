<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnectionStore } from '../../stores/connectionStore'

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

const providers = computed(() => connectionStore.providers)

const currentModels = computed(() => {
  const p = providers.value.find(p => p.name === selectedProvider.value)
  return p?.models || []
})

function selectProvider(name: string) {
  selectedProvider.value = name
  selectedModel.value = ''
}

function selectModel(name: string) {
  selectedModel.value = selectedModel.value === name ? '' : name
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

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="选择模型"
    width="540px"
    :close-on-click-modal="false"
    @update:model-value="(v) => !v && handleClose()"
    class="provider-model-dialog"
  >
    <div class="picker-layout">
      <div class="provider-list">
        <div
          v-for="p in providers"
          :key="p.name"
          class="provider-item"
          :class="{ active: selectedProvider === p.name }"
          @click="selectProvider(p.name)"
        >
          <div class="provider-name">{{ p.name }}</div>
          <div class="provider-count">{{ p.models.length }} 模型</div>
        </div>
      </div>

      <div class="model-list">
        <div v-if="!selectedProvider" class="list-placeholder">
          请先选择 Provider
        </div>
        <div
          v-for="m in currentModels"
          :key="m.name"
          class="model-item"
          :class="{ active: selectedModel === m.name }"
          @click="selectModel(m.name)"
        >
          <div class="model-info">
            <span class="model-name">{{ m.title || m.name }}</span>
            <span v-if="m.name === connectionStore.currentModelName" class="current-badge">当前</span>
          </div>
          <div class="model-desc">{{ m.description }}</div>
        </div>
        <div v-if="selectedProvider && currentModels.length === 0" class="list-placeholder">
          暂无模型
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :disabled="!selectedModel"
        @click="confirmModel"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.picker-layout {
  display: flex;
  gap: 16px;
  min-height: 300px;
}

.provider-list {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid rgba(55, 65, 81, 0.6);
  padding-right: 12px;
}

.provider-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.provider-item:hover {
  background: rgba(6, 182, 212, 0.08);
}

.provider-item.active {
  background: rgba(6, 182, 212, 0.12);
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.provider-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.provider-count {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.model-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  max-height: 320px;
}

.list-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
}

.model-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.model-item:hover {
  background: rgba(6, 182, 212, 0.06);
}

.model-item.active {
  background: rgba(6, 182, 212, 0.1);
  border-color: rgba(6, 182, 212, 0.3);
}

.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
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

.model-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 3px;
  line-height: 1.4;
}
</style>
