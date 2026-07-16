<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConnectionStore } from '../stores/connectionStore'
import { useSessionStore } from '../stores/sessionStore'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const connectionStore = useConnectionStore()
const sessionStore = useSessionStore()

// ── Loading ──
const loading = ref(false)

// ── Editable state ──
const editingId = ref<string | null>(null)
const editSummary = ref('')
const editContent = ref('')
const editTags = ref<string[]>([])

// ── Data ──
const memories = computed(() => connectionStore.sessionMemoryList?.chunks ?? [])
const memoryCount = computed(() => connectionStore.sessionMemoryList?.count ?? 0)

// ── Selection state ──
const selectedId = ref<string | null>(null)
const selectedMemory = computed(() => memories.value.find(m => m.id === selectedId.value) ?? null)

// ── Clear all ──
const clearingAll = ref(false)

async function handleClearAll() {
  const count = memories.value.length
  if (count === 0) {
    ElMessage.info('没有可清空的记忆')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要清空全部 ${count} 条记忆吗？此操作不可撤销。`,
      '清空记忆',
      {
        confirmButtonText: '清空全部',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return
  }
  clearingAll.value = true
  let failed = 0
  for (const item of memories.value) {
    try {
      const ok = await connectionStore.deleteSessionMemory(item.id)
      if (!ok) failed++
    } catch {
      failed++
    }
  }
  clearingAll.value = false
  selectedId.value = null
  cancelEdit()
  if (failed === 0) {
    ElMessage.success(`已清空全部 ${count} 条记忆`)
  } else {
    ElMessage.warning(`已删除 ${count - failed} 条，${failed} 条删除失败`)
  }
  await refresh()
}

// ── Format timestamp ──
function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  // Today: show time only
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  // This week: show day + time
  if (diff < 604800000) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return days[d.getDay()] + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  // Older: show date
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ── Start editing ──
function startEdit(item: { id: string; summary: string; content: string; tags: string[] }) {
  selectedId.value = item.id
  editingId.value = item.id
  editSummary.value = item.summary
  editContent.value = item.content
  editTags.value = [...(item.tags || [])]
}

// ── Cancel editing ──
function cancelEdit() {
  editingId.value = null
  editSummary.value = ''
  editContent.value = ''
  editTags.value = []
}

// ── Save edit ──
async function saveEdit(id: string) {
  const summary = editSummary.value.trim()
  const content = editContent.value.trim()
  const tags = editTags.value
  if (!summary && !content) {
    ElMessage.warning('摘要和内容不能同时为空')
    return
  }
  loading.value = true
  try {
    const ok = await connectionStore.updateSessionMemory(id, summary, content, tags)
    if (ok) {
      ElMessage.success('已更新')
      editingId.value = null
    } else {
      ElMessage.error('更新失败')
    }
  } catch {
    ElMessage.error('更新失败')
  } finally {
    loading.value = false
  }
}

// ── Delete ──
async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除这条记忆吗？此操作不可撤销。', '删除记忆', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    loading.value = true
    try {
      const ok = await connectionStore.deleteSessionMemory(id)
      if (ok) {
        if (selectedId.value === id) {
          selectedId.value = null
          cancelEdit()
        }
        ElMessage.success('已删除')
      } else {
        ElMessage.error('删除失败')
      }
    } catch {
      ElMessage.error('删除失败')
    } finally {
      loading.value = false
    }
  } catch {
    // User cancelled
  }
}

// ── Refresh ──
async function refresh() {
  const sessionId = sessionStore.activeSessionId
  if (!sessionId) return
  loading.value = true
  try {
    await connectionStore.fetchSessionMemoryList(sessionId)
  } finally {
    loading.value = false
  }
}

// ── Reset editing state on dialog close ──
watch(() => props.visible, (v) => {
  if (!v) {
    selectedId.value = null
    cancelEdit()
  }
})
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    @update:model-value="emit('close')"
    title="记忆"
    width="1240px"
    class="memory-browser-dialog"
    append-to-body
    destroy-on-close
    top="5vh"
  >
    <div class="mb-body" v-loading="loading">
      <!-- Empty state -->
      <div v-if="memories.length === 0" class="mb-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mb-empty-icon">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        <p class="mb-empty-text">暂无记忆</p>
      </div>

      <!-- Two-column layout -->
      <div v-else class="mb-split">
        <!-- ── Left: list sidebar ── -->
        <div class="mb-sidebar">
          <div
            v-for="item in memories"
            :key="item.id"
            class="mb-sidebar-item"
            :class="{ active: selectedId === item.id }"
            @click="selectedId = item.id; editingId = null"
          >
            <div class="mb-sidebar-header">
              <span class="mb-sidebar-summary">{{ item.summary || '(无摘要)' }}</span>
              <span class="mb-sidebar-time">{{ formatTime(item.timestamp) }}</span>
            </div>
            <p class="mb-sidebar-preview">{{ item.content ? (item.content.length > 80 ? item.content.slice(0, 80) + '...' : item.content) : '' }}</p>
          </div>
        </div>

        <!-- ── Right: detail panel ── -->
        <div class="mb-detail">
          <template v-if="!selectedMemory">
            <div class="mb-detail-empty">
              <p>选择一条记忆查看详情</p>
            </div>
          </template>

          <!-- View mode -->
          <template v-else-if="editingId !== selectedMemory.id">
            <div class="mb-detail-header">
              <h3 class="mb-detail-title">{{ selectedMemory.summary || '(无摘要)' }}</h3>
              <span class="mb-detail-time">{{ formatTime(selectedMemory.timestamp) }}</span>
            </div>
            <div class="mb-detail-content">{{ selectedMemory.content }}</div>
            <div class="mb-detail-tags" v-if="selectedMemory.tags && selectedMemory.tags.length > 0">
              <span v-for="tag in selectedMemory.tags" :key="tag" class="mb-tag">{{ tag }}</span>
            </div>
            <div class="mb-detail-actions">
              <button class="mb-action-btn edit-btn" @click="startEdit(selectedMemory)" title="编辑">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>编辑</span>
              </button>
              <button class="mb-action-btn delete-btn" @click="handleDelete(selectedMemory.id)" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>删除</span>
              </button>
            </div>
          </template>

          <!-- Edit mode -->
          <template v-else>
            <div class="mb-edit-section">
              <div class="mb-edit-field">
                <label class="mb-edit-label">摘要</label>
                <input v-model="editSummary" class="mb-edit-input" placeholder="摘要" />
              </div>
              <div class="mb-edit-field">
                <label class="mb-edit-label">内容</label>
                <textarea v-model="editContent" class="mb-edit-textarea" placeholder="内容" rows="12"></textarea>
              </div>
              <div class="mb-edit-field">
              <label class="mb-edit-label">标签</label>
              <el-select
                v-model="editTags"
                multiple
                allow-create
                filterable
                default-first-option
                placeholder="输入标签后回车"
                class="mb-tag-select"
                size="small"
              />
            </div>
              <div class="mb-edit-actions">
                <button class="mb-edit-btn cancel" @click="cancelEdit">取消</button>
                <button class="mb-edit-btn save" :disabled="loading" @click="saveEdit(selectedMemory.id)">
                  {{ loading ? '保存中...' : '保存' }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <template #footer>
      <span class="mb-footer-count">{{ memoryCount }} 条记忆</span>
      <div class="mb-footer-actions">
        <el-button size="small" :loading="clearingAll" :disabled="clearingAll" @click="handleClearAll">清空</el-button>
        <el-button size="small" @click="refresh">刷新</el-button>
        <el-button size="small" type="primary" @click="emit('close')">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.mb-body {
  min-height: 200px;
  max-height: 65vh;
  overflow-y: auto;
  padding: 4px 0;
}

/* ── Empty state ── */
.mb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  gap: 12px;
}
.mb-empty-icon {
  color: #475569;
}
.mb-empty-text {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

/* ── Split layout ── */
.mb-split {
  display: flex;
  gap: 0;
  height: 100%;
  min-height: 400px;
}

/* ── Left sidebar ── */
.mb-sidebar {
  width: 320px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid rgba(55, 65, 81, 0.5);
  padding: 4px 0;
}
.mb-sidebar-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.12s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
.mb-sidebar-item:last-child {
  border-bottom: none;
}
.mb-sidebar-item:hover {
  background: rgba(139, 92, 246, 0.04);
}
.mb-sidebar-item.active {
  background: rgba(139, 92, 246, 0.1);
  border-left: 3px solid #8b5cf6;
  padding-left: 13px;
}
.mb-sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.mb-sidebar-summary {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mb-sidebar-time {
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 2px;
}
.mb-sidebar-preview {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Right detail panel ── */
.mb-detail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
}
.mb-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: #64748b;
  font-size: 14px;
}
.mb-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.4);
}
.mb-detail-title {
  font-size: 16px;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
  line-height: 1.4;
  flex: 1;
}
.mb-detail-time {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 3px;
}
.mb-detail-content {
  font-size: 14px;
  color: #cbd5e1;
  line-height: 1.8;
  margin-bottom: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}
.mb-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 20px;
}
.mb-detail-actions {
  display: flex;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid rgba(55, 65, 81, 0.4);
}

/* ── Tags (shared) ── */
.mb-tag {
  display: inline-block;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 500;
  color: #a78bfa;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 10px;
  white-space: nowrap;
}

/* ── Action buttons (shared) ── */
.mb-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}
.edit-btn {
  color: #94a3b8;
  border-color: rgba(100, 116, 139, 0.2);
}
.edit-btn:hover {
  color: #22d3ee;
  background: rgba(6, 182, 212, 0.08);
  border-color: rgba(6, 182, 212, 0.2);
}
.delete-btn {
  color: #94a3b8;
  border-color: rgba(100, 116, 139, 0.2);
}
.delete-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
}

/* ── Edit mode (right panel) ── */
.mb-edit-section {
  padding: 0;
}
.mb-edit-field {
  margin-bottom: 14px;
}
.mb-edit-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
}
.mb-edit-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 6px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.mb-edit-input:focus {
  border-color: #8b5cf6;
}
.mb-edit-input::placeholder {
  color: #475569;
}
.mb-edit-textarea {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 6px;
  outline: none;
  transition: border-color 0.15s;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  min-height: 300px;
}
.mb-edit-textarea:focus {
  border-color: #8b5cf6;
}
.mb-edit-textarea::placeholder {
  color: #475569;
}
.mb-tag-select {
  width: 100%;
}
.mb-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.mb-edit-btn {
  padding: 7px 18px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}
.mb-edit-btn.cancel {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}
.mb-edit-btn.cancel:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.08);
}
.mb-edit-btn.save {
  color: #fff;
  background: #8b5cf6;
  border-color: #8b5cf6;
}
.mb-edit-btn.save:hover:not(:disabled) {
  background: #7c3aed;
}
.mb-edit-btn.save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Footer ── */
.mb-footer-count {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}
.mb-footer-actions {
  display: flex;
  gap: 8px;
}
</style>

<style>
/* Global overrides for this dialog */
.memory-browser-dialog .el-overlay {
  background: rgba(0, 0, 0, 0.65);
}
.memory-browser-dialog .el-dialog {
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}
.memory-browser-dialog .el-dialog__header {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.memory-browser-dialog .el-dialog__title {
  font-size: 15px;
  font-weight: 700;
  color: #e2e8f0;
}
.memory-browser-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}
.memory-browser-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}
.memory-browser-dialog .el-dialog__body {
  padding: 16px 24px 12px;
}
.memory-browser-dialog .el-dialog__footer {
  padding: 12px 24px 16px;
  border-top: 1px solid rgba(55, 65, 81, 0.5);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.memory-browser-dialog .el-button--primary {
  --el-button-bg-color: #8b5cf6;
  --el-button-border-color: #8b5cf6;
  --el-button-hover-bg-color: #7c3aed;
  --el-button-hover-border-color: #7c3aed;
}
.memory-browser-dialog .el-button--danger {
  --el-button-bg-color: #ef4444;
  --el-button-border-color: #ef4444;
  --el-button-hover-bg-color: #dc2626;
  --el-button-hover-border-color: #dc2626;
}

/* ── Tag select theme ── */
.memory-browser-dialog .el-select__tags .el-tag {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.3);
  color: #a78bfa;
}
.memory-browser-dialog .el-select__tags .el-tag .el-tag__close {
  color: #a78bfa;
}
.memory-browser-dialog .el-select__tags .el-tag .el-tag__close:hover {
  background: #8b5cf6;
  color: #fff;
}
</style>
