<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch, computed, onErrorCaptured } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElInput } from 'element-plus'
import { Setting, Close, FolderOpened } from '@element-plus/icons-vue'
import { useChatStore, ChatMessage } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useConnectionStore } from '../stores/connectionStore'
import { getMindXClient } from '../services/websocket'
import MessageComponentRouter from './chat/MessageComponentRouter.vue'
import ProviderModelPicker from './chat/ProviderModelPicker.vue'
import ScheduleView from './chat/ScheduleView.vue'
import SkeletonChat from './chat/SkeletonChat.vue'
import ChatEmptyState from './ChatEmptyState.vue'
import FileReviewBar from './FileReviewBar.vue'
import GraphViewer from './GraphViewer.vue'
import StatusBar from './StatusBar.vue'
import { useGraphStore } from '../stores/graphStore'
import { useScheduleStore } from '../stores/scheduleStore'

// 图谱组件 ref
const graphStore = useGraphStore()
const scheduleStore = useScheduleStore()

function openGraphViewer() { graphStore.open() }

// ── Header clock ──
const now = ref(new Date())
let timer: ReturnType<typeof setInterval>

function updateClock() {
  now.value = new Date()
}

const headerDate = computed(() => {
  const d = now.value
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getDate()}日 / 周${weekdays[d.getDay()]}`
})

const headerTime = computed(() => {
  const d = now.value
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

function openSchedule() {
  scheduleStore.open()
}

function toggleFileBrowser() {
  connectionStore.showFileBrowser = !connectionStore.showFileBrowser
}

onMounted(() => {
  timer = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})

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
  },
  fileRefs: {
    type: Array as () => { path: string; name: string }[],
    default: () => []
  }
})

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const connectionStore = useConnectionStore()

// ── 多 Tab 会话系统 ──
// openTabIds: 已打开的会话 Tab ID 列表（始终包含当前活跃会话）
const openTabIds = ref<string[]>([])

// 确保当前活跃会话在 tab 列表中
function ensureActiveTab(sessionId: string) {
  if (sessionId && !openTabIds.value.includes(sessionId)) {
    openTabIds.value.push(sessionId)
  }
}

// 切换会话 Tab
async function switchSessionTab(sessionId: string) {
  if (sessionId === sessionStore.activeSessionId) return
  await sessionStore.switchToSession(sessionId)
}

// 关闭会话 Tab（活跃 Tab 不可关闭）
function closeSessionTab(sessionId: string) {
  if (sessionId === sessionStore.activeSessionId) return
  const idx = openTabIds.value.indexOf(sessionId)
  if (idx === -1) return
  openTabIds.value.splice(idx, 1)
}

// 从 sessionStore 同步：当 activeSessionId 变化时，确保 tab 存在
watch(() => sessionStore.activeSessionId, (newId) => {
  if (newId) {
    ensureActiveTab(newId)
  }
}, { immediate: true })
const { t, locale } = useI18n()

// ── 错误边界：防止子组件渲染错误破坏 TransitionGroup 内部状态 ──
onErrorCaptured((err) => {
  console.warn('[ChatArea] Error captured:', err)
  return false // 阻止错误继续传播
})

const messageInput = ref('')
const messageInputRef = ref<InstanceType<typeof ElInput> | null>(null)
const chatContainer = ref(null)
const optimizeLoading = ref(false)

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
  // 保留已有输入内容，录音转写结果追加到尾部
  const existingText = messageInput.value

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
    // 仅在尾部插入转写文本，不清除已有内容
    messageInput.value = existingText + finalTranscript
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

const emit = defineEmits(['update:showModelPicker', 'remove-ref', 'clear-refs'])

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

// 切换会话骨架屏揭晓：先让消息流在背后渲染并滚到底部，再移除骨架屏
watch(
  () => chatStore.sessionRevealPending,
  (pending) => {
    if (pending) {
      nextTick(() => {
        // 临时禁用平滑滚动，确保瞬间到位
        const el = chatContainer.value
        if (el) {
          el.style.scrollBehavior = 'auto'
          scrollToBottom()
          // 确保滚动提交到浏览器的渲染管线后再揭晓
          requestAnimationFrame(() => {
            chatStore.isRestoringSession = false
            chatStore.sessionRevealPending = false
            // 恢复平滑滚动
            el.style.scrollBehavior = ''
          })
        }
      })
    }
  }
)

const selectedModel = ref(connectionStore.currentModel?.name || '')
const showProviderPicker = ref(false)

/** 只看答案模式：按消息类型过滤 */
const shouldShowMessage = (msg: ChatMessage): boolean => {
  if (!chatStore.showAnswerOnly) return true
  const et = msg.eventType
  if (et === 'thinking_delta' || et === 'thinking_done') return false
  if (et === 'tool_exec' || et === 'tool_exec_start' || et === 'tool_exec_end') return false
  if (et === 'tool_use_delta') return false
  if (et === 'subtask_spawned' || et === 'subtask_completed') return false
  if (et === 'compaction') return false
  if (et === 'max_turns_reached') return false
  if (et === 'permission_denied') return false
  // form (AskUserView) 和 permission_request (AskPermissionView) 需要用户交互，始终显示
  // file_modified 展示文件变更结果（结果性内容），不属于过程信息，始终显示
  if (et === 'cycle_end' || et === 'execution_summary') return false
  return true
}

const filteredMessages = computed(() => {
  return chatStore.currentMessages.filter(shouldShowMessage)
})

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

function onQuickPrompt(text: string) {
  messageInput.value = text
  sendMessage()
}

async function sendMessage() {
  if (!messageInput.value.trim() || chatStore.isProcessing) return

  // 前置文件引用路径
  let finalMessage = messageInput.value.trim()
  if (props.fileRefs && props.fileRefs.length > 0) {
    const refs = props.fileRefs.map(r => r.path).join('\n')
    finalMessage = refs + '\n' + finalMessage
  }

  // 翻译模式：包装用户输入为翻译指令
  if (translateMode.value) {
    finalMessage = `请将以下的文本翻译为${translateTargetLang.value}：${finalMessage}`
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

  const result = chatStore.sendMessage(finalMessage)

  if (result.queued) {
    console.log('消息已加入离线队列，等待连接后发送')
  }

  messageInput.value = ''
  emit('clear-refs')

  nextTick(() => scrollToBottom())
}

async function optimizeInput() {
  const text = messageInput.value.trim()
  if (!text || text.length <= 5 || optimizeLoading.value) return

  optimizeLoading.value = true
  try {
    const client = getMindXClient()
    if (!client) {
      ElMessage.warning(t('chat.notConnected'))
      return
    }
    const result: { text: string } = await client.call('optimize.rpc', { text })
    messageInput.value = result.text
  } catch (err: any) {
    console.error('[ChatArea] optimize failed:', err)
    ElMessage.error(t('chat.optimizeFailed', { msg: err?.message || t('common.unknownError') }))
  } finally {
    optimizeLoading.value = false
  }
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

/**
 * FormView（clarify_needed）表单提交处理。
 * 注意：AskUser 现已改为非阻塞设计，
 * AskUserView 直接通过 WebSocket 发送用户消息，
 * 不再经由此 RPC 路径。
 */
async function handleFormSubmit(data: Record<string, any>) {
  const correlationId = chatStore.pendingCorrelationId
  if (!correlationId) {
    console.warn('[MindX] No pending correlation ID for form submit')
    return
  }

  let answers: Record<string, string> = {}
  // 新格式：{ answers: { q_0: "...", q_1: "..." } }
  if (data.answers && typeof data.answers === 'object') {
    answers = data.answers
  } else {
    // 兼容旧格式：{ selected_option, response }
    if (data.selected_option) answers.selected_option = data.selected_option
    if (data.response) answers.response = data.response
  }

  try {
    await connectionStore.respondToAskUser(correlationId, answers)
    console.log('[MindX] FormView response sent:', { correlationId, answers })
    chatStore.pendingCorrelationId = null
  } catch (err) {
    console.error('[MindX] Failed to send FormView response:', err)
  }
}

/**
 * 非阻塞权限同意：
 * 1. 调用 execution.resume RPC 将授权存入后端缓存（GrantCache）
 * 2. 静默重发最后一条用户消息，LLM 重新进入循环继续执行
 */
async function handlePermissionGrant(data: Record<string, any>) {
  const toolName = chatStore.pendingPermissionToolName
  if (!toolName) {
    console.warn('[MindX] No pending permission tool name for grant')
    return
  }

  const sessionId = sessionStore.activeSessionId
  if (!sessionId) {
    console.warn('[MindX] No active session for permission grant')
    return
  }

  const remember = data?.remember === true

  try {
    // 1. 调用 execution.resume 将授权存入缓存（兼容旧路径）
    await connectionStore.resumeExecution(sessionId, toolName)
    console.log('[MindX] Permission granted, execution.resume called:', { sessionId, toolName, remember })

    // 2. 清理本地 pending 状态
    chatStore.pendingPermissionToolName = ''

    // 3. 静默重发魔术词 — 不在 UI 中显示
    const client = getMindXClient()
    if (client) {
      const magicWord = remember ? 'PermissionAllowSession' : 'PermissionAllow'
      client.sendMessage(magicWord, sessionId)
      chatStore.isProcessing = true
      console.log('[MindX] Sending permission magic word:', magicWord)
    }
  } catch (err) {
    console.error('[MindX] Failed to grant permission:', err)
  }
}

/**
 * 非阻塞权限拒绝：LLM 循环已经暂停，无需通知后端。
 * 只需清理本地 pending 状态即可。
 */
async function handlePermissionDeny(_reason?: string) {
  const toolName = chatStore.pendingPermissionToolName
  if (!toolName) {
    console.warn('[MindX] No pending permission tool name for deny')
    return
  }

  chatStore.pendingPermissionToolName = ''
  console.log('[MindX] Permission denied (non-blocking, no backend call):', { toolName })
}

function handleRetry(messageId: string) {
  chatStore.retryFromError(messageId)
}

function handleDismiss(messageId: string) {
  const msgs = chatStore.currentMessages
  const errIdx = msgs.findIndex(m => m.id === messageId)
  if (errIdx < 0) return
  const targetSessionId = sessionStore.activeSessionId
  chatStore.messagesBySession[targetSessionId] = [
    ...msgs.slice(0, errIdx),
    ...msgs.slice(errIdx + 1)
  ]
}

// [DEBUG] Log current messages for subtask debugging
function logCurrentMessages(messages: any[]) {
  const subtaskMsgs = messages.filter(m => m.eventType === 'subtask_spawned' || m.eventType === 'subtask_completed')
  if (subtaskMsgs.length > 0) {
    console.log('[MindX CHAT DEBUG] ChatArea rendering messages with subtask events:', {
      totalMessages: messages.length,
      subtaskCount: subtaskMsgs.length,
      subtaskMessages: subtaskMsgs.map(m => ({ id: m.id, eventType: m.eventType, eventData: m.eventData }))
    })
  }
  return ''
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
        <button class="nav-pill kg-btn" @click="openGraphViewer" :title="t('kgViewer.title')">
          {{ t('kgViewer.title') }}
        </button>
        <el-button text circle class="file-browser-btn" @click="toggleFileBrowser" title="文件浏览器">
          <el-icon><FolderOpened /></el-icon>
        </el-button>
        <span class="header-clock" :title="now.toLocaleString()" @click="openSchedule">
          {{ headerDate }} / {{ headerTime }}
        </span>
      </div>
    </header>

    <ProviderModelPicker
      :visible="showProviderPicker || showModelPicker"
      @update:visible="(v) => { showProviderPicker = v; if (showModelPicker && !v) emit('update:showModel-picker', false) }"
      @model-changed="handleModelChanged"
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

    <!-- ── 会话 Tab 栏 ── -->
    <div v-if="openTabIds.length > 1" class="session-tab-bar">
      <div
        v-for="sid in openTabIds"
        :key="sid"
        class="session-tab"
        :class="{ active: sid === sessionStore.activeSessionId }"
        @click="switchSessionTab(sid)"
      >
        <span class="session-tab-title">{{ sessionStore.sessions.find(s => s.session_id === sid)?.title || sid.slice(0, 8) }}</span>
        <el-icon
          v-if="sid !== sessionStore.activeSessionId"
          class="session-tab-close"
          @click.stop="closeSessionTab(sid)"
        >
          <Close />
        </el-icon>
      </div>
    </div>

    <!-- Messages Area -->
    <div class="chat-messages" ref="chatContainer">
      <!-- 消息流：与骨架屏共存，加载时隐藏在骨架屏后方 -->
      <div v-if="chatStore.currentMessages.length > 0" class="messages-container">
        <!-- [DEBUG] -->
        {{ logCurrentMessages(chatStore.currentMessages) }}
        <transition-group name="message-list" tag="div" class="message-list-inner">
          <div
            v-for="message in filteredMessages"
            :key="message.id"
            class="message-wrapper"
            :class="[message.role, message.eventType]"
          >
            <MessageComponentRouter 
              :message="message"
              @permission-grant="(data) => handlePermissionGrant(data)"
              @permission-deny="(reason) => handlePermissionDeny(reason)"
              @form-submit="(data) => handleFormSubmit(data)"
              @retry="handleRetry(message.id)"
              @dismiss="handleDismiss(message.id)"
            />
          </div>
        </transition-group>

        <!-- 只看答案模式下的 Loading 占位 -->
        <div v-if="chatStore.showAnswerOnly && chatStore.isProcessing" class="answer-only-placeholder">
          <div class="placeholder-loading">
            <svg class="placeholder-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
            </svg>
            <span>正在奋力思考中...</span>
          </div>
        </div>
      </div>

      <!-- 切换会话加载历史消息时的骨架屏覆盖层 -->
      <div v-if="chatStore.isRestoringSession" class="skeleton-overlay">
        <SkeletonChat />
      </div>

      <!-- 空状态：仅当未加载且无消息时显示 -->
      <ChatEmptyState
        v-if="!chatStore.isRestoringSession && chatStore.currentMessages.length === 0"
        :is-connected="connectionStore.isConnected"
        :is-offline-mode="connectionStore.isOfflineMode"
        :sessions-length="sessionStore.sessions.length"
        @send-prompt="onQuickPrompt"
      />
    </div>

    <!-- File Review Bar -->
    <FileReviewBar />

    <!-- Input Area -->
    <footer class="chat-input-area">
      <div class="input-container" :class="{ 'is-recording': isRecording }">
        <div class="ref-tag-bar" v-if="fileRefs && fileRefs.length > 0">
          <el-tag
            v-for="ref in fileRefs"
            :key="ref.path"
            closable
            size="small"
            type="info"
            class="ref-tag"
            @close="emit('remove-ref', ref.path)"
          >
            {{ ref.name }}
          </el-tag>
        </div>
        <div class="input-row input-row-1">
          <el-input
            ref="messageInputRef"
            v-model="messageInput"
            type="textarea"
            :rows="2"
            :autosize="{ minRows: 2, maxRows: 10 }"
            resize="none"
            :readonly="optimizeLoading"
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
          <el-tooltip
            v-if="!isRecording && messageInput.length > 5 && !optimizeLoading"
            :content="t('chat.optimize')"
            placement="top"
            effect="dark"
          >
            <button
              class="optimize-btn"
              @click="optimizeInput"
            >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.2773 16.5148C10.282 16.405 10.4639 16.3613 10.5179 16.4571C10.7712 16.9068 11.2034 17.5682 11.6937 17.8689C12.1841 18.1696 12.9695 18.2549 13.4851 18.2768C13.595 18.2815 13.6386 18.4634 13.5428 18.5174C13.0931 18.7707 12.4318 19.2029 12.1311 19.6932C11.8304 20.1836 11.745 20.969 11.7232 21.4847C11.7185 21.5945 11.5365 21.6381 11.4825 21.5423C11.2292 21.0926 10.7971 20.4313 10.3067 20.1306C9.81637 19.8299 9.03097 19.7446 8.51529 19.7227C8.40544 19.718 8.36182 19.536 8.45761 19.4821C8.90731 19.2287 9.56866 18.7966 9.86938 18.3062C10.1701 17.8159 10.2554 17.0305 10.2773 16.5148Z" fill="currentColor"/>
              <path d="M18.4924 15.5147C18.4839 15.4051 18.292 15.3591 18.2348 15.453C18.0625 15.7355 17.814 16.0764 17.5379 16.2458C17.2617 16.4152 16.8451 16.482 16.5152 16.5075C16.4056 16.516 16.3596 16.7078 16.4535 16.7651C16.736 16.9374 17.0769 17.1858 17.2463 17.462C17.4157 17.7382 17.4825 18.1548 17.508 18.4847C17.5165 18.5943 17.7083 18.6403 17.7656 18.5464C17.9379 18.2639 18.1863 17.923 18.4625 17.7536C18.7387 17.5842 19.1552 17.5174 19.4852 17.4919C19.5948 17.4834 19.6408 17.2916 19.5469 17.2343C19.2644 17.062 18.9234 16.8135 18.7541 16.5374C18.5847 16.2612 18.5178 15.8446 18.4924 15.5147Z" fill="currentColor"/>
              <path d="M14.7039 4.00181L14.4616 3.69574C13.5249 2.51266 13.0566 1.92112 12.5118 2.00845C11.9669 2.09577 11.7064 2.80412 11.1854 4.22083L11.0506 4.58735C10.9025 4.98993 10.8285 5.19122 10.6865 5.33897C10.5445 5.48671 10.3506 5.56417 9.96291 5.71911L9.60991 5.86016L9.36205 5.95933C8.16253 6.4406 7.5581 6.71331 7.48093 7.24324C7.39861 7.80849 7.97072 8.29205 9.11492 9.25915L9.41094 9.50935C9.73609 9.78417 9.89866 9.92158 9.99186 10.1089C10.0851 10.2962 10.0983 10.5121 10.1249 10.9441L10.149 11.3373C10.2424 12.8574 10.2891 13.6174 10.783 13.8794C11.277 14.1414 11.8911 13.7319 13.1193 12.9129L13.1193 12.9129L13.4371 12.701C13.7861 12.4683 13.9606 12.3519 14.1602 12.32C14.3598 12.288 14.5618 12.344 14.966 12.456L15.3339 12.558C16.756 12.9522 17.4671 13.1493 17.8547 12.746C18.2423 12.3427 18.0498 11.6061 17.6646 10.1328L17.565 9.75163C17.4555 9.33297 17.4008 9.12364 17.431 8.91657C17.4611 8.70951 17.5727 8.52816 17.796 8.16546L17.796 8.16544L17.9992 7.83522C18.7848 6.55883 19.1776 5.92063 18.9231 5.40935C18.6687 4.89806 17.9356 4.85229 16.4694 4.76076L16.09 4.73708C15.6734 4.71107 15.4651 4.69807 15.2841 4.60208C15.1032 4.5061 14.9701 4.338 14.7039 4.00181L14.7039 4.00181Z" fill="currentColor"/>
              <path d="M8.835 13.326C6.69772 14.3702 4.91931 16.024 4.24844 18.0002C3.49589 13.2926 4.53976 10.2526 6.21308 8.36328C6.35728 8.658 6.54466 8.902 6.71297 9.09269C7.06286 9.48911 7.56518 9.91347 8.07523 10.3444L8.44225 10.6545C8.51184 10.7134 8.56597 10.7592 8.61197 10.7989C8.61665 10.8632 8.62129 10.9383 8.62727 11.0357L8.65708 11.5212C8.69717 12.1761 8.7363 12.8155 8.835 13.326Z" fill="currentColor"/>
            </svg>
          </button>
          </el-tooltip>
          <button
            v-if="!isRecording && optimizeLoading"
            class="optimize-btn optimizing"
            disabled
          >
            <svg class="optimize-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
            </svg>
          </button>
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

    <StatusBar />

    <!-- 全局组件：知识图谱 -->
    <GraphViewer @close="graphStore.close()" />

    <!-- ScheduleView 通过 Teleport 渲染到 body -->
    <ScheduleView />
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

/* ── 会话 Tab 栏 ── */
.session-tab-bar {
  display: flex;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  flex-shrink: 0;
  padding: 0 8px;
}

.session-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: all .15s;
  user-select: none;
  flex-shrink: 0;
}

.session-tab:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.session-tab.active {
  color: var(--accent-cyan);
  border-bottom-color: var(--accent-cyan);
  background: rgba(6,182,212,.06);
}

.session-tab-title {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-tab-close {
  font-size: 11px;
  border-radius: 3px;
  padding: 1px;
  color: var(--text-muted);
}

.session-tab-close:hover {
  background: rgba(239,68,68,.15);
  color: #ef4444;
}

.header-clock {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted, #64748b);
  opacity: 0.7;
  white-space: nowrap;
  padding-left: 8px;
  border-left: 1px solid rgba(255,255,255,.08);
  cursor: pointer;
  transition: opacity .15s, color .15s;
}

.header-clock:hover {
  opacity: 1;
  color: var(--accent-cyan, #06b6d4);
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
  position: relative;
}

.messages-container {
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 骨架屏覆盖层：在消息恢复期间遮盖消息流 */
.skeleton-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: var(--bg-primary, #0f172a);
  overflow: hidden;
}

/* 只看答案模式 - 加载占位 */
.answer-only-placeholder {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}
.placeholder-loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #a78bfa;
}
.placeholder-spinner {
  animation: placeholder-spin 1s linear infinite;
  color: #8b5cf6;
}
@keyframes placeholder-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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

/* ── Messages list (flat) ── */
.message-list-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Input Area */
.chat-input-area {
  padding: 0;
}

/* ── 引用标签栏 ── */
.ref-tag-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 10px 4px;
  min-height: 0;
}

.ref-tag.ref-tag {
  max-width: 200px;
  font-size: 11px;
  border-radius: 4px;
}

.ref-tag :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  /* autosize 模式下高度由 Element Plus 动态设 inline style；
     transition 监听 height 变化使其平滑过渡，避免输入多行时瞬间跳变。 */
  transition: height 0.2s ease;
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

.optimize-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.8);
  color: #fbbf24;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
}
.optimize-btn:hover {
  background: rgba(251, 191, 36, 0.12);
  border-color: rgba(251, 191, 36, 0.4);
  color: #fcd34d;
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.15);
}
.optimize-btn:active {
  transform: scale(0.92);
}
.optimize-btn.optimizing {
  cursor: not-allowed;
  opacity: 0.6;
}
.optimize-spinner {
  animation: optimize-rotate 1s linear infinite;
}
@keyframes optimize-rotate {
  to { transform: rotate(360deg); }
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
