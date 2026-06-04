<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Close } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chatStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useSessionStore } from '../stores/sessionStore'

const chatStore = useChatStore()
const connectionStore = useConnectionStore()
const sessionStore = useSessionStore()

const confirming = ref(false)
const rollingBack = ref(false)

async function confirmAll() {
  const sessionId = sessionStore.activeSessionId
  if (!sessionId) return

  confirming.value = true
  try {
    const confirmed = await connectionStore.confirmFiles(sessionId)
    console.log('[FileReviewBar] Files confirmed:', confirmed)
    chatStore.pendingFileModifications = []
    ElMessage.success(`已确认 ${confirmed.length} 个文件的修改`)
  } catch (err: any) {
    console.error('[FileReviewBar] Confirm failed:', err)
    const msg = (err && err.message) || '未知错误'
    ElMessage.error(`确认文件失败: ${msg}`)
  } finally {
    confirming.value = false
  }
}

async function rollbackAll() {
  const sessionId = sessionStore.activeSessionId
  if (!sessionId) return

  rollingBack.value = true
  try {
    const rolledBack = await connectionStore.rollbackFiles(sessionId)
    console.log('[FileReviewBar] Files rolled back:', rolledBack)
    chatStore.pendingFileModifications = []
    ElMessage.success(`已回滚 ${rolledBack.length} 个文件的修改`)
  } catch (err: any) {
    console.error('[FileReviewBar] Rollback failed:', err)
    const msg = (err && err.message) || '未知错误'
    ElMessage.error(`回滚文件失败: ${msg}`)
  } finally {
    rollingBack.value = false
  }
}
</script>

<template>
  <div v-if="chatStore.pendingFileModifications.length > 0" class="file-review-bar">
    <div class="review-card">
      <div class="review-header">
        <span class="header-icon">
          <el-icon :size="18"><WarningFilled /></el-icon>
        </span>
        <span class="header-title">{{ chatStore.pendingFileModifications.length }} 个文件被修改</span>
      </div>
      <div class="review-body">
        <div class="review-files">
          <div
            v-for="(f, i) in chatStore.pendingFileModifications"
            :key="i"
            class="review-file-row"
          >
            <span class="file-path">{{ f.path }}</span>
            <div class="file-stats">
              <span class="stat stat-add">+{{ f.additions }}</span>
              <span class="stat stat-del">-{{ f.deletions }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="review-actions">
        <el-button
          size="small"
          type="success"
          :loading="confirming"
          :disabled="rollingBack"
          @click="confirmAll"
        >
          <el-icon :size="14"><Check /></el-icon>
          {{ confirming ? '确认中...' : '全部确认' }}
        </el-button>
        <el-button
          size="small"
          :loading="rollingBack"
          :disabled="confirming"
          @click="rollbackAll"
        >
          <el-icon :size="14"><Close /></el-icon>
          {{ rollingBack ? '回滚中...' : '全部回滚' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-review-bar {
  padding: 8px 28px;
  flex-shrink: 0;
}

.review-card {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.06), rgba(245, 158, 11, 0.04));
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(245, 158, 11, 0.08);
}

.review-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: rgba(245, 158, 11, 0.06);
  border-bottom: 1px solid rgba(245, 158, 11, 0.15);
}

.header-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.review-body {
  padding: 12px 20px;
}

.review-files {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.review-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}

.review-file-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.file-path {
  flex: 1;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-stats {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.stat {
  font-size: 11px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  padding: 0 6px;
  border-radius: 3px;
  line-height: 1.6;
}

.stat-add {
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
}

.stat-del {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

.review-actions {
  display: flex;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid rgba(245, 158, 11, 0.15);
  background: rgba(17, 24, 39, 0.5);
}
</style>
