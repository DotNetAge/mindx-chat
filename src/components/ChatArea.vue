<script setup lang="ts">
import { ref, nextTick, onMounted, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Setting, Calendar } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useConnectionStore } from '../stores/connectionStore'
import MessageComponentRouter from './chat/MessageComponentRouter.vue'
import ProviderModelPicker from './chat/ProviderModelPicker.vue'
import ScheduleView from './chat/ScheduleView.vue'
import FileReviewBar from './FileReviewBar.vue'
import LogDrawer from './LogDrawer.vue'
import MemoryModal from './MemoryModal.vue'

// 日志/记忆组件 ref
const logDrawerRef = ref<InstanceType<typeof LogDrawer> | null>(null)
const memoryModalRef = ref<InstanceType<typeof MemoryModal> | null>(null)

function openLogDrawer() { logDrawerRef.value?.open() }
function openMemoryModal() { memoryModalRef.value?.open() }

const props = defineProps({
  isSidebarCollapsed: {
    type: Boolean,
    default: false
  },
  onRequestNewSession: {
    type: Function,
    default: null
  },
  showModelPicker: {
    type: Boolean,
    default: false
  }
})

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const connectionStore = useConnectionStore()
const messageInput = ref('')
const chatContainer = ref(null)

const emit = defineEmits(['update:showModelPicker'])

watch(
  () => chatStore.currentMessages.length,
  () => nextTick(() => scrollToBottom()),
  { flush: 'post' }
)

watch(
  () => chatStore.currentMessages.map(m => m.content).join(''),
  () => nextTick(() => scrollToBottom()),
  { flush: 'post' }
)

const selectedModel = ref(connectionStore.currentModel?.name || '')
const showProviderPicker = ref(false)
const showScheduleView = ref(false)

const currentActionLabel = computed(() => {
  if (chatStore.currentAction) return chatStore.currentAction
  if (chatStore.isProcessing && chatStore.currentThinking) return '深度思考中...'
  if (chatStore.isProcessing) return 'Agent 处理中...'
  return null
})

const progressPercent = computed(() => {
  if (!chatStore.actionProgress) return 0
  return Math.round((chatStore.actionProgress.completed / chatStore.actionProgress.total) * 100)
})

async function sendMessage() {
  if (!messageInput.value.trim() || chatStore.isProcessing) return

  if (!sessionStore.activeSessionId) {
    console.log('[MindX] No active session, attempting to create one...')

    if (!connectionStore.isConnected) {
      ElMessage.warning('请先连接到 MindX 服务')
      return
    }

    if (!connectionStore.currentAgent) {
      ElMessage.warning('请先选择一个 Agent')
      return
    }

    try {
      chatStore.clearAll()

      if (props.onRequestNewSession) {
        await props.onRequestNewSession()
      }

      if (!sessionStore.activeSessionId) {
        ElMessage.error('无法创建会话，请手动点击"新建对话"按钮')
        return
      }

      console.log('[MindX] Session created:', sessionStore.activeSessionId)
    } catch (err: any) {
      console.error('[MindX] Failed to create session:', err)
      ElMessage.error(`创建会话失败: ${err?.message || '未知错误'}`)
      return
    }
  }

  const result = chatStore.sendMessage(messageInput.value)

  if (result.queued) {
    console.log('消息已加入离线队列，等待连接后发送')
  }

  messageInput.value = ''

  nextTick(() => scrollToBottom())
}

function handleKeyPress(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

function handleModelChange(modelName: string) {
  connectionStore.setCurrentModel(modelName)
  const model = connectionStore.models.find(m => m.name === modelName)
  if (model) {
    connectionStore.switchModel(modelName, model.provider).catch(err => {
      console.error('[MindX] Failed to switch model:', err)
    })
  }
}

function handleModelChanged() {
  selectedModel.value = connectionStore.currentModelName
}

async function handleFormSubmit(data: Record<string, any>) {
  const correlationId = chatStore.pendingCorrelationId
  if (!correlationId) {
    console.warn('[MindX] No pending correlation ID for form submit')
    return
  }

  const answers: Record<string, string> = {}
  if (data.selected_option) answers.selected_option = data.selected_option
  if (data.response) answers.response = data.response

  try {
    await connectionStore.respondToAskUser(correlationId, answers)
    console.log('[MindX] AskUser response sent:', { correlationId, answers })
    chatStore.pendingCorrelationId = null
  } catch (err) {
    console.error('[MindX] Failed to send AskUser response:', err)
  }
}

async function handlePermissionGrant(data: Record<string, any>) {
  const correlationId = chatStore.pendingCorrelationId
  if (!correlationId) {
    console.warn('[MindX] No pending correlation ID for permission grant')
    return
  }

  try {
    await connectionStore.respondToPermission(correlationId, 'grant', { params: data })
    console.log('[MindX] Permission granted:', { correlationId, data })
    chatStore.pendingCorrelationId = null
  } catch (err) {
    console.error('[MindX] Failed to grant permission:', err)
  }
}

async function handlePermissionDeny(reason?: string) {
  const correlationId = chatStore.pendingCorrelationId
  if (!correlationId) {
    console.warn('[MindX] No pending correlation ID for permission deny')
    return
  }

  try {
    await connectionStore.respondToPermission(correlationId, 'deny', { reason: reason || '用户拒绝' })
    console.log('[MindX] Permission denied:', { correlationId, reason })
    chatStore.pendingCorrelationId = null
  } catch (err) {
    console.error('[MindX] Failed to deny permission:', err)
  }
}
</script>

<template>
  <main class="chat-area" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
    <!-- Header -->
    <header class="chat-header">
      <div class="header-left">
        <div class="provider-info" v-if="connectionStore.isConnected && connectionStore.currentModel">
          <span class="provider-label">{{ connectionStore.formatProviderTitle(connectionStore.currentModel.provider) }}</span>
          <span class="model-label">{{ connectionStore.currentModel.title || connectionStore.currentModel.name }}</span>
          <el-button text circle class="gear-btn" @click="showProviderPicker = true">
            <el-icon><Setting /></el-icon>
          </el-button>
          <el-button text circle class="gear-btn" @click="showScheduleView = true">
            <el-icon><Calendar /></el-icon>
          </el-button>
        </div>
      </div>

      <div class="header-right">
        <button class="nav-pill" @click="openLogDrawer" title="查看日志">日志</button>
        <button class="nav-pill" @click="openMemoryModal" title="查询记忆">记忆</button>
      </div>
    </header>

    <ProviderModelPicker
      :visible="showProviderPicker || showModelPicker"
      @update:visible="(v) => { showProviderPicker = v; if (showModelPicker && !v) emit('update:showModel-picker', false) }"
      @model-changed="handleModelChanged"
    />

    <ScheduleView
      :visible="showScheduleView"
      @update:visible="showScheduleView = $event"
    />

    <!-- Offline Mode Banner -->
    <div class="offline-banner" v-if="chatStore.isOfflineMode && !connectionStore.isConnected">
      <div class="banner-content">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.42 1.43C9.93 6.22 10.93 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 .99-.47 1.87-1.2 2.41l1.41 1.41C23.25 20.54 24 18.83 24 17c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14h3c0-1.68.69-3.21 1.79-4.31L5 13.09v4.41c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5V13.91l2.5-2.5V9l-2-2V3H3v2.27z" fill="currentColor"/>
        </svg>
        
        <span class="offline-text">离线模式 - 消息已保存到本地</span>

        <span class="queue-count" v-if="chatStore.offlineMessageQueue.length > 0">
          {{ chatStore.offlineMessageQueue.length }} 条待发送
        </span>
      </div>
    </div>

    <!-- Processing Banner -->
    <div class="processing-banner" v-if="chatStore.isProcessing">
      <div class="banner-content">
        <div class="processing-indicator">
          <div class="spinner-ring"></div>
          <div class="spinner-core"></div>
        </div>
        
        <span class="banner-text">{{ currentActionLabel }}</span>

        <div class="progress-section" v-if="chatStore.actionProgress">
          <el-progress 
            :percentage="progressPercent" 
            :stroke-width="4"
            :show-text="false"
            color="#f59e0b"
            style="width: 120px;"
          />
          <span class="progress-info">
            <strong>{{ chatStore.actionProgress.completed }}</strong>/{{ chatStore.actionProgress.total }}
            <template v-if="chatStore.actionProgress.status">· {{ chatStore.actionProgress.status }}</template>
          </span>
        </div>

        <div class="thinking-preview" v-else-if="chatStore.currentThinking">
          <div class="thinking-dots">
            <span></span><span></span><span></span>
          </div>
          <code class="preview-code">{{ chatStore.currentThinking.slice(-60) }}</code>
        </div>

        <button class="stop-btn" @click="chatStore.resetProcessingState()" title="停止处理">
          <el-icon><VideoPause /></el-icon>
        </button>
      </div>
    </div>

    <!-- Messages Area -->
    <div class="chat-messages" ref="chatContainer">
      <div class="messages-container" v-if="chatStore.currentMessages.length > 0">
        <transition-group name="message-list">
          <div
            v-for="message in chatStore.currentMessages"
            :key="message.id"
            class="message-wrapper"
            :class="[message.role, message.eventType]"
          >
            <MessageComponentRouter 
              :message="message"
              @permission-grant="(data) => handlePermissionGrant(data)"
              @permission-deny="(reason) => handlePermissionDeny(reason)"
              @form-submit="(data) => handleFormSubmit(data)"
              @retry="handleRetry()"
              @dismiss="handleDismiss()"
            />
          </div>
        </transition-group>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-visual">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="emptyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#06b6d4"/>
                <stop offset="50%" stop-color="#8b5cf6"/>
                <stop offset="100%" stop-color="#10b981"/>
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" stroke="url(#emptyGrad)" stroke-width="0.5" opacity="0.3"/>
            <path d="M12 6v6l4 2" stroke="url(#emptyGrad)" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
            <circle cx="12" cy="12" r="2" fill="url(#emptyGrad)" opacity="0.8"/>
          </svg>
        </div>
        
        <h3 class="empty-title">{{ !connectionStore.isOfflineMode && connectionStore.isConnected ? '开始与 Agent 对话' : (sessionStore.sessions.length > 0 ? '选择或创建会话开始对话' : '欢迎使用 MindX2') }}</h3>
        
        <p class="empty-desc">
          <template v-if="!connectionStore.isOfflineMode && connectionStore.isConnected">
            发送消息给 AI Agent，观察实时的思考过程、工具调用和最终输出
          </template>
          <template v-else-if="connectionStore.isOfflineMode">
            当前处于离线模式，请连接服务器后使用
          </template>
          <template v-else>
            正在建立安全连接...
          </template>
        </p>

        <div class="quick-prompts" v-if="!connectionStore.isOfflineMode || sessionStore.sessions.length > 0">
          <p class="prompts-label">💡 快速开始</p>
          <div class="prompt-buttons">
            <el-button 
              v-for="prompt in ['帮我分析这个项目', '代码审查建议', '设计 API 接口']" 
              :key="prompt"
              size="small"
              round
              @click="messageInput = prompt; sendMessage()"
              class="quick-prompt"
            >
              {{ prompt }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- File Review Bar -->
    <FileReviewBar />

    <!-- Input Area -->
    <footer class="chat-input-area">
      <div class="input-container">
        <div class="input-row input-row-1">
          <el-input
            v-model="messageInput"
            type="textarea"
            :rows="2"
            resize="none"
            :placeholder="!connectionStore.isOfflineMode && connectionStore.isConnected ? `与 ${connectionStore.currentAgent?.name || 'Agent'} 对话... (Enter 发送)` : (connectionStore.isOfflineMode ? '离线模式 - 消息将保存到本地' : '请先连接到 MindX 服务')"
            @keypress="handleKeyPress"
            :disabled="false"
            class="message-input"
          />
        </div>
      </div>
    </footer>

    <!-- 全局组件：日志抽屉 + 记忆模态框 -->
    <LogDrawer ref="logDrawerRef" />
    <MemoryModal ref="memoryModalRef" />
  </main>
</template>

<style scoped>
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  position: relative;
  z-index: 5;
  min-width: 0;
  overflow: hidden;
}

.chat-area.sidebar-collapsed .chat-header {
  padding: 8px 16px;
}

.chat-area.sidebar-collapsed .chat-messages {
  padding: 16px;
}

.chat-area.sidebar-collapsed .input-container {
  margin: 0 12px 12px;
}

/* Header */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 28px;
  min-height: 40px;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(139, 92, 246, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 8px;
  cursor: pointer;
  transition: all .2s ease;
  white-space: nowrap;
}
.nav-pill:hover {
  color: #a78bfa;
  background: rgba(139, 92, 246, 0.12);
  border-color: rgba(139, 92, 246, 0.3);
}

.provider-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: rgba(6, 182, 212, 0.08);
  border: 1px solid rgba(6, 182, 212, 0.15);
  border-radius: 8px;
  max-width: 100%;
  overflow: hidden;
}

.provider-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.model-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-cyan);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gear-btn {
  width: 24px;
  height: 24px;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.gear-btn:hover {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(100, 116, 139, 0.15);
  color: var(--text-muted);
  border: 1px solid rgba(100, 116, 139, 0.25);
}

.status-badge.connected {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-badge.connected .dot {
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.9); }
}

.model-name,
.stats-badge {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.stats-badge {
  background: rgba(99, 102, 241, 0.1);
  padding: 3px 10px;
  border-radius: 12px;
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0;
}

.action-btn {
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.action-btn:hover {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
}

/* Processing Banner */
.processing-banner {
  background: linear-gradient(90deg, 
    rgba(245, 158, 11, 0.06), 
    rgba(251, 146, 60, 0.04),
    rgba(139, 92, 246, 0.04));
  border-bottom: 1px solid rgba(245, 158, 11, 0.2);
  padding: 12px 28px;
  animation: banner-shimmer 3s ease-in-out infinite;
}

@keyframes banner-shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 900px;
  margin: 0 auto;
}

.processing-indicator {
  position: relative;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 2px solid transparent;
  border-top-color: #f59e0b;
  border-right-color: #f97316;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-core {
  position: absolute;
  top: 7px;
  left: 7px;
  width: 8px;
  height: 8px;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  border-radius: 50%;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.banner-text {
  font-size: 13px;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 0.3px;
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.progress-info {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: #fbbf24;
}

.thinking-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  max-width: 280px;
}

.thinking-dots {
  display: flex;
  gap: 3px;
}

.thinking-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #8b5cf6;
  animation: typing-bounce 1.4s infinite ease-in-out both;
}

.thinking-dots span:nth-child(1) { animation-delay: -0.32s; }
.thinking-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing-bounce {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.preview-code {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: #c4b5fd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: rgba(139, 92, 246, 0.08);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid rgba(139, 92, 246, 0.15);
}

.stop-btn {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: none;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.stop-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #ef4444;
}

/* Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  scroll-behavior: smooth;
}

.messages-container {
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-wrapper {
  animation: slideInUp 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-list-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.message-list-leave-active {
  transition: all 0.2s ease-in;
}

.message-list-enter-from {
  opacity: 0;
  transform: translateY(-16px);
}

.message-list-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 48px;
  text-align: center;
  gap: 18px;
}

.empty-visual {
  opacity: 0.4;
  margin-bottom: 8px;
}

.empty-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text-primary);
}

.empty-desc {
  font-size: 14px;
  color: var(--text-muted);
  max-width: 420px;
  line-height: 1.65;
}

.quick-prompts {
  margin-top: 12px;
}

.prompts-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.prompt-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.quick-prompt {
  border-color: var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
}

.quick-prompt:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.08);
}

/* Input Area */
.chat-input-area {
  padding: 0;
}

.input-container {
  max-width: 920px;
  margin: 0 auto 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(15, 23, 42, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(55, 65, 81, 0.6);
  border-radius: 10px;
  padding: 12px 16px;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.input-container:focus-within {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15), 0 4px 20px rgba(6, 182, 212, 0.1);
}

.input-row-1 {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 0 10px;
}

.input-row-1 .message-input {
  flex: 1;
}

.message-input {
  flex: 1;
}

.message-input :deep(.el-textarea__inner) {
  background: transparent;
  border: none;
  box-shadow: none;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.6;
  padding: 0;
  resize: none;
}

/* Offline Mode Banner */
.offline-banner {
  background: linear-gradient(90deg, 
    rgba(100, 116, 139, 0.08), 
    rgba(71, 85, 105, 0.06));
  border-bottom: 1px solid rgba(100, 116, 139, 0.25);
  padding: 10px 28px;
}

.offline-banner .banner-content {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 900px;
  margin: 0 auto;
  color: var(--text-secondary);
  font-size: 13px;
}

.offline-banner svg {
  color: #94a3b8;
  flex-shrink: 0;
}

.offline-text {
  flex: 1;
  font-weight: 600;
}

.queue-count {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid rgba(245, 158, 11, 0.25);
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
