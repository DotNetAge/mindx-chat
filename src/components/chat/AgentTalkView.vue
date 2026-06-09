<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  isStart: {
    type: Boolean,
    default: true
  },
  to: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  reply: {
    type: String,
    default: ''
  },
  error: {
    type: String,
    default: ''
  }
})

const isCollapsed = ref(false)

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function hasContent(): boolean {
  return props.isStart ? !!props.message : !!(props.reply || props.error)
}
</script>

<template>
  <div class="agent-talk-view" :class="{ 'is-start': isStart, 'is-end': !isStart, 'has-error': !isStart && error }">
    <div class="talk-header" @click="toggleCollapse">
      <div class="header-left">
        <div class="talk-icon" :class="{ 'icon-start': isStart, 'icon-end': !isStart }">
          <template v-if="isStart">
            <span class="pulse-ring"></span>
          </template>
          <span class="icon-emoji">🤖</span>
        </div>

        <div class="title-section">
          <h3 class="talk-title">{{ isStart ? 'Agent对话开始' : 'Agent对话结束' }}</h3>
          <span v-if="to" class="target-badge">
            → {{ to }}
          </span>
        </div>
      </div>

      <div class="header-right">
        <span v-if="!isStart && error" class="status-tag error">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
          </svg>
          错误
        </span>
        <span v-else-if="!isStart && reply" class="status-tag success">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
          </svg>
          {{ t('agentTalk.replied') }}
        </span>

        <button class="collapse-btn" v-if="hasContent()" :title="isCollapsed ? t('agentTalk.expand') : t('agentTalk.collapse')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  :style="{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.25s ease' }"/>
          </svg>
        </button>
      </div>
    </div>

    <transition name="collapse">
      <div class="talk-body" v-show="!isCollapsed && hasContent()">
        <template v-if="isStart">
          <div class="chat-bubble sent-bubble">
            <div class="bubble-label">
              <span class="label-icon">📤</span>
              发送消息 → {{ t('agentTalk.sendMessage') }}
            </div>
            <div class="bubble-content">{{ message }}</div>
          </div>
        </template>

        <template v-else>
          <div v-if="error" class="chat-bubble error-bubble">
            <div class="bubble-label">
              <span class="label-icon">⚠️</span>
              {{ t('agentTalk.talkError') }}
            </div>
            <div class="bubble-content error-text">{{ error }}</div>
          </div>
          <div v-else-if="reply" class="chat-bubble received-bubble">
            <div class="bubble-label">
              <span class="label-icon">📥</span>
              {{ t('agentTalk.receivedReply') }}
            </div>
            <div class="bubble-content">{{ reply }}</div>
          </div>
        </template>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.agent-talk-view {
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.agent-talk-view.is-start {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.06), rgba(124, 58, 237, 0.04));
  border: 1px solid rgba(139, 92, 246, 0.22);
}

.agent-talk-view.is-end {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(79, 70, 229, 0.03));
  border: 1px solid rgba(99, 102, 241, 0.18);
}

.agent-talk-view.has-error {
  border-color: rgba(239, 68, 68, 0.3);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(99, 102, 241, 0.02));
}

.talk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  cursor: pointer;
  user-select: none;
  gap: 14px;
  transition: background 0.2s ease;
}

.talk-header:hover {
  background: rgba(139, 92, 246, 0.05);
}

.agent-talk-view.is-end .talk-header:hover {
  background: rgba(99, 102, 241, 0.05);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  flex: 1;
}

.talk-icon {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 15px;
}

.talk-icon.icon-start {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  box-shadow: 0 2px 10px rgba(139, 92, 246, 0.35);
}

.talk-icon.icon-end {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.28);
}

.icon-emoji {
  z-index: 1;
  line-height: 1;
}

.pulse-ring {
  position: absolute;
  inset: -4px;
  border: 2px solid rgba(139, 92, 246, 0.45);
  border-radius: 12px;
  animation: pulse-expand 2s ease-out infinite;
}

@keyframes pulse-expand {
  0% { transform: scale(0.92); opacity: 1; }
  100% { transform: scale(1.32); opacity: 0; }
}

.title-section {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.talk-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.3px;
  white-space: nowrap;
}

.is-start .talk-title {
  background: linear-gradient(90deg, #a78bfa, #c4b5fd);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.is-end .talk-title {
  color: var(--text-primary);
}

.target-badge {
  font-size: 11px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  padding: 3px 10px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}

.is-start .target-badge {
  background: rgba(139, 92, 246, 0.15);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.22);
}

.is-end .target-badge {
  background: rgba(99, 102, 241, 0.13);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.18);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 3px 9px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
}

.status-tag.success {
  background: rgba(16, 185, 129, 0.13);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.status-tag.error {
  background: rgba(239, 68, 68, 0.13);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.collapse-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.collapse-btn:hover {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}

.talk-body {
  padding: 0 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-bubble {
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.sent-bubble {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(124, 58, 237, 0.07));
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-left: 3px solid #8b5cf6;
}

.received-bubble {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.09), rgba(79, 70, 229, 0.06));
  border: 1px solid rgba(99, 102, 241, 0.18);
  border-left: 3px solid #6366f1;
}

.error-bubble {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(220, 38, 38, 0.05));
  border: 1px solid rgba(239, 68, 68, 0.22);
  border-left: 3px solid #ef4444;
}

.bubble-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 12px 4px;
}

.sent-bubble .bubble-label {
  color: #a78bfa;
}

.received-bubble .bubble-label {
  color: #a5b4fc;
}

.error-bubble .bubble-label {
  color: #fca5a5;
}

.label-icon {
  font-size: 11px;
}

.bubble-content {
  padding: 6px 12px 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  word-break: break-word;
  white-space: pre-wrap;
}

.error-text {
  color: #fca5a5;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
