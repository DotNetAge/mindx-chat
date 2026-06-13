<script setup lang="ts">
import { ref, nextTick, onMounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElInput } from 'element-plus'
import { Setting, Calendar } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useConnectionStore } from '../stores/connectionStore'
import MessageComponentRouter from './chat/MessageComponentRouter.vue'
import ProviderModelPicker from './chat/ProviderModelPicker.vue'
import ScheduleView from './chat/ScheduleView.vue'
import FileReviewBar from './FileReviewBar.vue'
import LogDrawer from './LogDrawer.vue'
import GraphViewer from './GraphViewer.vue'
import { useGraphStore } from '../stores/graphStore'

// 日志/图谱组件 ref
const logDrawerRef = ref<InstanceType<typeof LogDrawer> | null>(null)
const graphStore = useGraphStore()

function openLogDrawer() { logDrawerRef.value?.open() }
function openGraphViewer() { graphStore.open() }

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
const { t, locale } = useI18n()
const messageInput = ref('')
const messageInputRef = ref<InstanceType<typeof ElInput> | null>(null)
const chatContainer = ref(null)

// ── 翻译工具栏状态 ──
const translateMode = ref(false)
const translateTargetLang = ref('英文')
const LANG_OPTIONS = ['英文', '中文', '日文', '韩文', '法文', '德文', '西班牙文', '俄文', '阿拉伯文']

// ── 语音识别 ──
const isRecording = ref(false)
const recognitionTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const recognition = ref<any>(null)
const HOLD_DURATION = 2000

function startSpeechRecognition() {
  const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognitionAPI) {
    console.warn('[ChatArea] SpeechRecognition not supported')
    return
  }

  isRecording.value = true
  messageInput.value = ''

  const sr = new SpeechRecognitionAPI()
  if (locale.value === 'zh') sr.lang = 'zh-CN'
  else if (locale.value === 'zh-TW') sr.lang = 'zh-TW'
  else sr.lang = 'en-US'
  sr.continuous = true
  sr.interimResults = true

  let finalTranscript = ''
  sr.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i]
      if (r.isFinal) {
        finalTranscript += r[0].transcript
      }
    }
    messageInput.value = finalTranscript
  }

  sr.onerror = () => {
    isRecording.value = false
  }

  sr.onend = () => {
    isRecording.value = false
  }

  sr.start()
  recognition.value = sr
}

function stopSpeechRecognition() {
  if (recognition.value) {
    recognition.value.stop()
    recognition.value = null
  }
  isRecording.value = false
}

const emit = defineEmits(['update:showModelPicker'])

watch(
  () => chatStore.currentMessages.length,
  () => nextTick(() => scrollToBottom()),
)

// ── 从外部（如 Agent 编辑器）填入输入框 ──
watch(
  () => chatStore.pendingInputText,
  (val) => {
    if (val) {
      messageInput.value = val
      chatStore.pendingInputText = ''
      nextTick(() => {
        messageInputRef.value?.focus()
      })
    }
  }
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
  if (chatStore.isProcessing && chatStore.currentThinking) return t('chat.thinking')
  if (chatStore.isProcessing) return t('chat.processing')
  return null
})

const progressPercent = computed(() => {
  if (!chatStore.actionProgress) return 0
  return Math.round((chatStore.actionProgress.completed / chatStore.actionProgress.total) * 100)
})

// ── 当前 Agent 的语言版本名称 ──
function localeMetaValue(
  meta: Record<string, any> | undefined,
  fieldBase: string,
  fallback: string
): string {
  if (!meta) return fallback
  const loc = locale.value
  let key: string
  if (loc === 'zh') key = `${fieldBase}_zh`
  else if (loc === 'zh-TW') key = `${fieldBase}_zh-tw`
  else return fallback
  const v = meta[key]
  return v != null ? String(v) : fallback
}

const currentAgentDisplayName = computed(() => {
  const agent = connectionStore.currentAgent
  if (!agent) return 'Agent'
  return localeMetaValue(agent.meta, 'name', agent.name)
})

async function sendMessage() {
  if (!messageInput.value.trim() || chatStore.isProcessing) return

  // 翻译模式：包装用户输入为翻译指令
  if (translateMode.value) {
    const text = messageInput.value.trim()
    messageInput.value = `请将以下的文本翻译为${translateTargetLang.value}：${text}`
    translateMode.value = false
  }

  if (!sessionStore.activeSessionId) {
    console.log('[MindX] No active session, attempting to create one...')

    if (!connectionStore.isConnected) {
      ElMessage.warning(t('chat.notConnected'))
      return
    }

    if (!connectionStore.currentAgent) {
      ElMessage.warning(t('chat.noAgent'))
      return
    }

    try {
      chatStore.clearAll()

      if (props.onRequestNewSession) {
        await props.onRequestNewSession()
      }

      if (!sessionStore.activeSessionId) {
        ElMessage.error(t('chat.cannotCreateSession'))
        return
      }

      console.log('[MindX] Session created:', sessionStore.activeSessionId)
    } catch (err: any) {
      console.error('[MindX] Failed to create session:', err)
      ElMessage.error(t('chat.createSessionFailed', { msg: err?.message || t('common.unknownError') }))
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

function handleInputKeydown(e: KeyboardEvent) {
  // 录音期间锁定输入
  if (isRecording.value) {
    e.preventDefault()
    return
  }

  // Enter 发送
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
    return
  }

  // 空格长按 3s 检测
  if (e.key === ' ' && !e.repeat) {
    recognitionTimer.value = setTimeout(() => {
      startSpeechRecognition()
    }, HOLD_DURATION)
  }
}

function handleInputKeyup(e: KeyboardEvent) {
  if (e.key === ' ') {
    // 不足 3s 取消定时器
    if (recognitionTimer.value) {
      clearTimeout(recognitionTimer.value)
      recognitionTimer.value = null
    }
    // 放空格键停止录音
    if (isRecording.value) {
      stopSpeechRecognition()
    }
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
    await connectionStore.respondToPermission(correlationId, 'deny', { reason: reason || t('chat.userDenied') })
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
        <!-- Configured: show provider + model info -->
        <div v-if="connectionStore.isConnected && connectionStore.currentModel" class="provider-info">
          <span class="provider-label">{{ connectionStore.formatProviderTitle(connectionStore.currentModel.provider) }}</span>
          <span class="model-label">{{ connectionStore.currentModel.title || connectionStore.currentModel.name }}</span>
          <el-button text circle class="gear-btn" @click="showProviderPicker = true">
            <el-icon><Setting /></el-icon>
          </el-button>
          <el-button text circle class="gear-btn" @click="showScheduleView = true">
            <el-icon><Calendar /></el-icon>
          </el-button>
        </div>
        <!-- Unconfigured: guide user to set up provider & API key -->
        <div v-else-if="connectionStore.isConnected" class="provider-info unconfigured-state">
          <span class="warning-dot"></span>
          <span class="unconfigured-label">{{ t('chat.unconfiguredProvider') }}</span>
          <el-tooltip
            placement="bottom"
            effect="dark"
            :content="t('chat.configureProviderHint')"
            :visible="false"
            popper-class="config-tooltip"
          >
            <el-button text circle class="gear-btn pulse" @click="showProviderPicker = true">
              <el-icon><Setting /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <div class="header-right">
        <a class="nav-pill nav-link" href="https://github.com/dotNetAge/mindx" target="_blank" title="GitHub" rel="noopener noreferrer">GitHub</a>
        <a class="nav-pill nav-link" href="https://gitee.com/ray_liang/mindx" target="_blank" title="Gitee" rel="noopener noreferrer">Gitee</a>
        <button class="nav-pill" @click="openLogDrawer" :title="t('chat.logTab')">{{ t('chat.logTab') }}</button>
        <button class="nav-pill kg-btn" @click="openGraphViewer" :title="t('kgViewer.title')">
          {{ t('kgViewer.title') }}
          <span class="beta-tag">beta</span>
        </button>
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
        
        <span class="offline-text">{{ t('chat.offlineMode') }}</span>

        <span class="queue-count" v-if="chatStore.offlineMessageQueue.length > 0">
          {{ chatStore.offlineMessageQueue.length }} {{ t('chat.pendingSend') }}
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

        <button class="stop-btn" @click="chatStore.cancelProcessing()" :title="t('chat.stopProcessing')">
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
        
        <h3 class="empty-title">{{ !connectionStore.isOfflineMode && connectionStore.isConnected ? t('chat.welcome.startChat') : (sessionStore.sessions.length > 0 ? t('chat.welcome.selectOrCreate') : t('chat.welcome.default')) }}</h3>
        
        <p class="empty-desc">
          <template v-if="!connectionStore.isOfflineMode && connectionStore.isConnected">
            {{ t('chat.welcome.description') }}
          </template>
          <template v-else-if="connectionStore.isOfflineMode">
            {{ t('chat.welcome.offlineHint') }}
          </template>
          <template v-else>
            {{ t('chat.welcome.connecting') }}
          </template>
        </p>

        <div class="quick-prompts" v-if="!connectionStore.isOfflineMode || sessionStore.sessions.length > 0">
          <p class="prompts-label">💡 {{ t('chat.quickStart') }}</p>
          <div class="prompt-buttons">
            <el-button
              v-for="prompt in [t('chat.prompt.analyzeProject'), t('chat.prompt.codeReview'), t('chat.prompt.designApi')]"
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
      <div class="input-container" :class="{ 'is-recording': isRecording }">
        <div class="input-row input-row-1">
          <el-input
            ref="messageInputRef"
            v-model="messageInput"
            type="textarea"
            :rows="2"
            resize="none"
            :placeholder="isRecording ? t('chat.recordingPlaceholder') : (translateMode ? t('chat.translatePlaceholder') : (!connectionStore.isOfflineMode && connectionStore.isConnected ? t('chat.defaultPlaceholder') : (connectionStore.isOfflineMode ? t('chat.offlineInputPlaceholder') : t('chat.notConnected'))))"
            @keydown="handleInputKeydown"
            @keyup="handleInputKeyup"
            :disabled="false"
            class="message-input"
          />
          <div v-if="isRecording" class="recording-indicator">
            <span class="rec-dot"></span>
            <span class="rec-label">{{ t('chat.recording') }}</span>
          </div>
        </div>
        <div class="input-row-toolbar" v-if="!translateMode">
          <el-button
            size="small"
            class="toolbar-btn translate-btn"
            @click="translateMode = true"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M14 6l-1 2"/><path d="M18 12l5 5"/><path d="M21 12l5 5" transform="translate(-1,-3)"/><path d="M16 20l3 3 3-3"/></svg>
            {{ t('chat.translate') }}
          </el-button>
        </div>
        <div class="input-row-toolbar" v-else>
          <el-tag closable size="small" type="info" class="translate-tag" @close="translateMode = false">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/></svg>
            {{ t('chat.translate') }}
          </el-tag>
          <span class="translate-prefix">{{ t('chat.translateTo') }}</span>
          <el-select
            v-model="translateTargetLang"
            size="small"
            class="translate-lang-select"
            popper-class="translate-popper"
          >
            <el-option
              v-for="lang in LANG_OPTIONS"
              :key="lang"
              :label="lang"
              :value="lang"
            />
          </el-select>
          <el-button
            size="small"
            text
            class="toolbar-cancel"
            @click="translateMode = false"
          >{{ t('common.cancel') }}</el-button>
        </div>
      </div>
    </footer>

    <!-- 全局组件：日志抽屉 + 知识图谱 -->
    <LogDrawer ref="logDrawerRef" />
    <!-- GraphViewer 通过 Teleport 渲染到 body，由 graphStore.visible 控制显隐 -->
    <GraphViewer @close="graphStore.close()" />
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
.nav-link {
  text-decoration: none;
}

.kg-btn {
  background: linear-gradient(135deg, rgba(6,182,212,.1), rgba(139,92,246,.1));
  border-color: rgba(139,92,246,.25);
  color: #a78bfa;
  font-weight: 700;
  letter-spacing: .5px;
}
.kg-btn:hover {
  background: linear-gradient(135deg, rgba(6,182,212,.16), rgba(139,92,246,.16));
  border-color: rgba(139,92,246,.4);
  color: #c4b5fd;
}
.beta-tag {
  font-size: 9px; font-weight: 800;
  margin-left: 3px; padding: 0 4px;
  border-radius: 8px;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff;
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

/* ── Unconfigured state ── */
.provider-info.unconfigured-state {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.07);
}

.warning-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  flex-shrink: 0;
  animation: pulse-red 2s ease-in-out infinite;
}

.unconfigured-label {
  font-size: 12px;
  font-weight: 600;
  color: #f87171;
  white-space: nowrap;
}

.gear-btn.pulse {
  animation: gear-attention 2s ease-in-out infinite;
}

@keyframes pulse-red {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}

@keyframes gear-attention {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.65; transform: scale(1.15); }
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

/* ── 工具栏行 ── */
.input-row-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  min-height: 28px;
}
.toolbar-btn {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}
.toolbar-btn:hover {
  color: var(--accent-cyan);
}
.translate-btn {
  padding: 2px 10px;
  border-radius: 6px;
  border: 1px solid rgba(55, 65, 81, 0.4);
  background: rgba(15, 23, 42, 0.6);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.translate-tag {
  flex-shrink: 0;
}
.translate-prefix {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}
.translate-lang-select {
  width: 110px;
}
.translate-lang-select :deep(.el-select__wrapper) {
  background: rgba(15, 23, 42, 0.8);
  border-color: rgba(55, 65, 81, 0.5);
  box-shadow: none;
  min-height: 26px;
  height: 26px;
}
.translate-lang-select :deep(.el-select__wrapper:hover) {
  border-color: var(--accent-cyan);
}
.translate-lang-select :deep(.el-select__placeholder),
.translate-lang-select :deep(.el-select__selected-item) {
  font-size: 12px;
  color: #e2e8f0;
}
.toolbar-cancel {
  font-size: 11px;
  color: #64748b;
  margin-left: auto;
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

/* ── 录音指示器 ── */
.recording-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 6px;
  animation: rec-pulse-border 1.5s ease-in-out infinite;
}
.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  animation: rec-pulse-dot 1s ease-in-out infinite;
}
.rec-label {
  font-size: 11px;
  font-weight: 600;
  color: #fca5a5;
  white-space: nowrap;
}
@keyframes rec-pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}
@keyframes rec-pulse-border {
  0%, 100% { border-color: rgba(239, 68, 68, 0.25); }
  50% { border-color: rgba(239, 68, 68, 0.55); }
}

.input-container.is-recording {
  border-color: rgba(239, 68, 68, 0.4) !important;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1), 0 4px 20px rgba(239, 68, 68, 0.08) !important;
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

<style>
/* ── Unconfigured tooltip override (popper teleported to body) ── */
.config-tooltip {
  background: #dc2626 !important;
  border-color: #dc2626 !important;
  color: #fff !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  padding: 8px 14px !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4) !important;
}
.config-tooltip .popper__arrow,
.config-tooltip .popper__arrow::after {
  border-bottom-color: #dc2626 !important;
}

/* ── Translate 语言选择下拉 ── */
.translate-popper {
  background: #1e293b !important;
  border: 1px solid rgba(55, 65, 81, 0.6) !important;
}
.translate-popper .el-select-dropdown__item {
  color: #cbd5e1 !important;
  font-size: 12px !important;
}
.translate-popper .el-select-dropdown__item.hover,
.translate-popper .el-select-dropdown__item:hover {
  background: rgba(6, 182, 212, 0.08) !important;
  color: #e2e8f0 !important;
}
.translate-popper .el-select-dropdown__item.selected {
  color: #06b6d4 !important;
  font-weight: 600 !important;
}
</style>
