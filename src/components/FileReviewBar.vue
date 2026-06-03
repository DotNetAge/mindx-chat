<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
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
    ElMessage.error(`确认文件失败: ${err?.message || '未知错误'}`)
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
    ElMessage.error(`回滚文件失败: ${err?.message || '未知错误'}`)
  } finally {
    rollingBack.value = false
  }
}
</script>

<template>
  <div v-if="chatStore.pendingFileModifications.length > 0" class="file-review-bar">
    <el-alert
      :title="`${chatStore.pendingFileModifications.length} 个文件被修改`"
      type="warning"
      :closable="false"
      show-icon
    >
      <template #default>
        <div class="review-files">
          <div
            v-for="(f, i) in chatStore.pendingFileModifications"
            :key="i"
            class="review-file-row"
          >
            <span class="file-path">{{ f.path }}</span>
            <div class="file-stats">
              <el-tag size="small" type="success" effect="plain">+{{ f.additions }}</el-tag>
              <el-tag size="small" type="danger" effect="plain">-{{ f.deletions }}</el-tag>
            </div>
          </div>
        </div>
        <div class="review-actions">
          <el-button
            size="small"
            type="primary"
            :loading="confirming"
            :disabled="rollingBack"
            @click="confirmAll"
          >
            {{ confirming ? '确认中...' : '全部确认' }}
          </el-button>
          <el-button
            size="small"
            :loading="rollingBack"
            :disabled="confirming"
            @click="rollbackAll"
          >
            {{ rollingBack ? '回滚中...' : '全部回滚' }}
          </el-button>
        </div>
      </template>
    </el-alert>
  </div>
</template>

<style scoped>
.file-review-bar {
  padding: 8px 28px;
  flex-shrink: 0;
}

.review-files {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  background: rgba(0, 0, 0, 0.03);
}

.file-path {
  flex: 1;
  color: var(--text-primary);
}

.file-stats {
  display: flex;
  gap: 4px;
}

.review-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
</style>
