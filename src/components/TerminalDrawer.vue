<template>
  <Teleport to="body">
    <Transition name="drawer-up" @after-enter="onAfterEnter">
      <div v-if="visible" class="terminal-drawer">
        <!-- Header toolbar -->
        <div class="drawer-toolbar">
          <span class="toolbar-title">Terminal</span>
          <span class="toolbar-cwd" v-if="resolvedCwd" :title="resolvedCwd">{{ resolvedCwd }}</span>
          <el-tag v-if="connected" type="success" size="small" effect="dark" round>Connected</el-tag>
          <el-tag v-else type="danger" size="small" effect="dark" round>Disconnected</el-tag>
          <div class="toolbar-actions">
            <button class="toolbar-btn" @click="handleClose" title="Close">✕</button>
          </div>
        </div>

        <!-- xterm container -->
        <div ref="terminalContainerRef" class="terminal-container"></div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount, computed } from 'vue'
import { ElTag } from 'element-plus'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { getMindXClient } from '../services/websocket'
import { useSessionStore } from '../stores/sessionStore'
import { useGraphStore } from '../stores/graphStore'

const props = defineProps<{
  visible: boolean
  cwd?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const sessionStore = useSessionStore()
const graphStore = useGraphStore()

// Resolve working directory with multiple fallbacks
const resolvedCwd = computed(() => {
  // 1. Explicit prop from parent (StatusBar's activeProjectDir)
  if (props.cwd) return props.cwd
  // 2. Active session's project_dir
  const active = sessionStore.sessions.find(s => s.session_id === sessionStore.activeSessionId)
  if (active?.project_dir) return active.project_dir
  // 3. First watched directory from filewatch
  const watched = graphStore.filewatchStatus?.watched
  if (watched && watched.length > 0) return watched[0]
  // 4. Fallback: current working directory of daemon process
  return ''
})

const terminalContainerRef = ref<HTMLElement | null>(null)

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let sessionId = ''
let outputUnregister: (() => void) | null = null
let exitUnregister: (() => void) | null = null

const connected = ref(false)
let resizeObserver: ResizeObserver | null = null
let fitTimers: ReturnType<typeof setTimeout>[] = []

// ── Lifecycle ──

watch(() => props.visible, async (val) => {
  if (!val) return
  await nextTick()
  // Small delay to let Transition render the DOM at full size
  setTimeout(() => initTerminal(), 50)
})

onBeforeUnmount(() => {
  cleanup()
})

// ── Terminal Init / Teardown ──

async function initTerminal() {
  cleanup()
  const container = terminalContainerRef.value
  if (!container) return

  const client = getMindXClient()
  if (!client || !client.isConnected()) {
    writeLine('\x1b[33m[Terminal] WebSocket not connected\x1b[0m')
    return
  }

  // Create xterm instance
  term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 14,
    lineHeight: 1.2,
    fontFamily: '"SF Mono", "Menlo", "Monaco", "Inconsolata", "Fira Code", "Cascadia Code", "JetBrains Mono", "Source Code Pro", "Roboto Mono", "Noto Sans Mono CJK SC", "Apple Color Emoji", "Segoe UI Emoji", monospace',
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      cursorAccent: '#0d1117',
      selectionBackground: '#264f78',
      selectionForeground: '#ffffff',
      black: '#484f58',
      red: '#f85149',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc',
    },
    scrollback: 5000,
    convertEol: true,
    allowProposedApi: true,
    allowTransparency: true,
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(container)

  // Auto-fit on container resize (debounced)
  let fitRaf = 0
  resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(fitRaf)
    fitRaf = requestAnimationFrame(() => fitAddon?.fit())
  })
  resizeObserver.observe(container)

  // Also listen on window resize
  window.addEventListener('resize', onWindowResize)

  scheduleDelayedFits()

  // Wire user input → backend
  term.onData((data) => {
    sendInput(data)
  })

  // Handle resize
  term.onResize(({ cols, rows }) => {
    resizeTerminal(cols, rows)
  })

  // Start PTY session on backend
  try {
    const cwd = resolvedCwd.value
    console.log('[Terminal] Starting PTY with cwd:', cwd)
    const result = await client.call<{ session_id: string }>('terminal.start', { cwd: cwd || '' })
    sessionId = result.session_id
    connected.value = true

    // Listen for PTY output pushed from server
    outputUnregister = client.on('terminal.output', (envelope) => {
      if (envelope.session_id === sessionId && envelope.data) {
        term?.write(envelope.data)
      }
    })

    // Listen for process exit
    exitUnregister = client.on('terminal.exit', (envelope) => {
      if (envelope.session_id === sessionId) {
        const code = envelope.meta?.exit_code ?? 0
        term?.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`)
        connected.value = false
      }
    })
  } catch (err) {
    writeLine(`\x1b[31m[Terminal] Failed to start: ${err}\x1b[0m`)
  }
}

function scheduleDelayedFits() {
  // Multiple delayed fits ensure correct sizing after CSS transitions/layout settle
  const delays = [0, 100, 300, 500]
  for (const ms of delays) {
    const t = setTimeout(() => fitAddon?.fit(), ms)
    fitTimers.push(t)
  }
}

function onAfterEnter() {
  // Called after Transition finishes — final reliable fit
  fitAddon?.fit()
}

function onWindowResize() {
  fitAddon?.fit()
}

function cleanup() {
  window.removeEventListener('resize', onWindowResize)

  fitTimers.forEach(clearTimeout)
  fitTimers = []

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  outputUnregister?.call(this)
  outputUnregister = null
  exitUnregister?.call(this)
  exitUnregister = null

  if (sessionId) {
    killSession()
    sessionId = ''
  }

  term?.dispose()
  term = null
  fitAddon = null
  connected.value = false
}

function handleClose() {
  cleanup()
  emit('update:visible', false)
}

// ── RPC Helpers ──

function sendInput(data: string) {
  if (!sessionId) return
  const client = getMindXClient()
  client?.call('terminal.input', { session_id: sessionId, data }).catch(() => {})
}

function resizeTerminal(cols: number, rows: number) {
  if (!sessionId) return
  const client = getMindXClient()
  client?.call('terminal.resize', { session_id: sessionId, rows, cols, x: 0, y: 0 }).catch(() => {})
}

function killSession() {
  if (!sessionId) return
  const client = getMindXClient()
  client?.call('terminal.kill', { session_id: sessionId }).catch(() => {})
}

function writeLine(text: string) {
  if (!term) return
  term.write(text + '\r\n')
}
</script>

<style scoped>
/* ===== Drawer ===== */
.terminal-drawer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 55vh;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  background: #0d1117;
  border-top: 2px solid #30363d;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.6);
  /* Ensure full viewport width */
  box-sizing: border-box;
  width: 100vw;
}

/* ===== Toolbar ===== */
.drawer-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
  min-width: 0;
}
.toolbar-title {
  font-size: 14px;
  font-weight: 600;
  color: #e6edf3;
  flex-shrink: 0;
}
.toolbar-cwd {
  font-size: 12px;
  color: #8b949e;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toolbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
}
.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e6edf3;
}

/* ===== Terminal Container ===== */
.terminal-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  min-width: 0;
  padding: 4px 6px;
  overflow: hidden;
}

/* Force xterm to fill container completely */
.terminal-container :deep(.xterm) {
  width: 100% !important;
  height: 100% !important;
}
.terminal-container :deep(.xterm-screen) {
  width: 100% !important;
  height: 100% !important;
  background: #0d1117 !important;
}
.terminal-container :deep(.xterm-viewport) {
  width: 100% !important;
  background: #0d1117 !important;
}
.terminal-container :deep(.xterm-scroll-area) {
  width: 100% !important;
}

/* ===== Transition ===== */
.drawer-up-enter-active,
.drawer-up-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.drawer-up-enter-from,
.drawer-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
