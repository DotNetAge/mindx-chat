import { ref, reactive } from 'vue'
import type {
  ConnectionConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  ResponseEnvelope,
  MessageHandler
} from '../types/websocket'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

class MindXWebSocketClient {
  private ws: WebSocket | null = null
  private config: ConnectionConfig
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (reason: any) => void }>()
  private handlers = new Map<string, Set<MessageHandler>>()
  private reconnectAttempts = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private messageIdCounter = 0

  state = ref<ConnectionState>('disconnected')
  lastError = ref<string | null>(null)
  sessionId = ref<string>('')
  clientId = ref<string>('')

  constructor(config: ConnectionConfig) {
    this.config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 54000,
      ...config
    }
    this.generateClientId()
  }

  private generateClientId() {
    this.clientId.value = 'web_' + Math.random().toString(36).substring(2, 15)
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`
  }

  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.state.value = 'connecting'
    this.lastError.value = null

    try {
      const wsUrl = this.config.url.replace(/^http/, 'ws')
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('[MindX WS] ✅ WebSocket onopen fired - Connected to', this.config.url)
        this.state.value = 'connected'
        this.reconnectAttempts = 0
        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = (event) => {
        console.log('[MindX WS] ❌ WebSocket onclose fired', { code: event.code, reason: event.reason })
        this.stopHeartbeat()
        this.state.value = 'disconnected'
        this.handleReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('[MindX WS] ❌ WebSocket onerror fired', error)
        this.lastError.value = 'WebSocket connection error'
        this.state.value = 'error'
      }
    } catch (error) {
      console.error('[MindX WS] Failed to connect:', error)
      this.lastError.value = String(error)
      this.state.value = 'error'
      throw error
    }
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.stopHeartbeat()

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      this.reconnectAttempts = this.config.maxReconnectAttempts || 10

      if (this.ws) {
        this.ws.onclose = () => resolve()
        this.ws.close(1000, 'Client disconnect')
        this.ws = null
      } else {
        resolve()
      }

      this.state.value = 'disconnected'
      this.pendingRequests.forEach(({ reject }) => reject(new Error('Connection closed')))
      this.pendingRequests.clear()
    })
  }

  call<T = any>(method: string, params?: any, timeoutMs = 60000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'))
        return
      }

      const id = this.generateMessageId()
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params
      }

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC call timeout: ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (reason) => {
          clearTimeout(timer)
          reject(reason)
        }
      })

      this.sendRaw(JSON.stringify(request))
    })
  }

  notify(method: string, params?: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[MindX WS] Cannot send notification: not connected')
      return false
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params
    }

    return this.sendRaw(JSON.stringify(notification))
  }

  sendMessage(text: string, sessionId?: string): void {
    const params: { text: string; session_id?: string } = { text }
    if (sessionId) {
      params.session_id = sessionId
    }
    this.notify('user.message', params)
  }

  on(method: string, handler: MessageHandler): () => void {
    console.log('[MindX WS] 📝 Registering handler for:', method)
    if (!this.handlers.has(method)) {
      this.handlers.set(method, new Set())
      console.log('[MindX WS] ✅ Created new handler set for:', method)
    }
    this.handlers.get(method)!.add(handler)
    console.log('[MindX WS] ✅ Handler added, total handlers for', method, ':', this.handlers.get(method)!.size)

    return () => {
      this.handlers.get(method)?.delete(handler)
    }
  }

  onStateChange(handler: (oldState: ConnectionState, newState: ConnectionState) => void): () => void {
    let lastReported = this.state.value

    const stopWatch = setInterval(() => {
      if (this.state.value !== lastReported) {
        const oldState = lastReported
        lastReported = this.state.value
        handler(oldState, this.state.value)
      }
    }, 50)

    return () => clearInterval(stopWatch)
  }

  isConnected(): boolean {
    return this.state.value === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }

  private sendRaw(data: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      this.ws.send(data)
      return true
    } catch (error) {
      console.error('[MindX WS] Send failed:', error)
      return false
    }
  }

  private handleMessage(rawData: string): void {
    console.log('[MindX WS] 📨 Received raw message:', rawData.substring(0, 500))

    try {
      const lines = rawData.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const message = JSON.parse(line)
          console.log('[MindX WS] 📦 Parsed JSON message:', {
            hasId: !!message.id,
            hasMethod: !!message.method,
            hasResult: !!message.result,
            hasError: !!message.error,
            method: message.method
          })

          if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
            this.handleResponse(message as JsonRpcResponse)
          } else if (message.method) {
            this.handleNotification(message as JsonRpcNotification)
          } else {
            console.warn('[MindX WS] Unknown message format:', message)
          }
        } catch (e) {
          console.error('[MindX WS] Failed to parse JSON line:', line.substring(0, 200), e)
        }
      }
    } catch (error) {
      console.error('[MindX WS] Failed to parse message:', error, rawData)
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const id = String(response.id)
    const pending = this.pendingRequests.get(id)

    if (pending) {
      this.pendingRequests.delete(id)

      if (response.error) {
        pending.reject(new Error(response.error.message))
      } else {
        pending.resolve(response.result)
      }
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    const method = notification.method
    console.log('[MindX WS] 📩 handleNotification called:', {
      method,
      paramsType: typeof notification.params,
      paramsValue: notification.params,
      params: notification.params
    })

    let paramsObj: any
    if (typeof notification.params === 'string') {
      console.log('[MindX WS] 🔄 Params is string, parsing JSON...')
      try {
        paramsObj = JSON.parse(notification.params)
        console.log('[MindX WS] ✅ Parsed params:', paramsObj)
      } catch (e) {
        console.error('[MindX WS] ❌ Failed to parse params:', e)
        return
      }
    } else if (notification.params && typeof notification.params === 'object') {
      paramsObj = notification.params
      console.log('[MindX WS] ✅ Params is already object:', paramsObj)
    } else {
      paramsObj = {}
      console.log('[MindX WS] ⚠️ No params, using empty object')
    }

    const envelope = paramsObj as {
      type?: string;
      session_id?: string;
      title?: string;
      data?: any;
      meta?: Record<string, any>;
    }

    const eventEnvelope = {
      type: envelope.type || method,
      session_id: envelope.session_id,
      title: envelope.title,
      data: envelope.data,
      meta: envelope.meta
    }

    console.log('[MindX WS] 📦 Event envelope:', eventEnvelope)
    console.log('[MindX WS] 🔍 Looking for handlers for method:', method, 'and type:', eventEnvelope.type)
    console.log('[MindX WS] 📋 Registered handlers:', Array.from(this.handlers.keys()))

    const handlers = this.handlers.get(method)
    if (handlers) {
      console.log('[MindX WS] ✅ Found handlers for method:', method, 'count:', handlers.size)
      handlers.forEach(handler => {
        try {
          handler(eventEnvelope)
        } catch (error) {
          console.error(`[MindX WS] ❌ Handler error for ${method}:`, error)
        }
      })
    } else {
      console.log('[MindX WS] ❌ No handlers for method:', method)
    }

    const typedHandlers = this.handlers.get(eventEnvelope.type)
    if (typedHandlers) {
      console.log('[MindX WS] ✅ Found typed handlers for:', eventEnvelope.type, 'count:', typedHandlers.size)
      typedHandlers.forEach(handler => {
        try {
          handler(eventEnvelope)
        } catch (error) {
          console.error(`[MindX WS] ❌ Typed handler error for ${eventEnvelope.type}:`, error)
        }
      })
    } else {
      console.log('[MindX WS] ❌ No typed handlers for:', eventEnvelope.type)
    }

    if (envelope.session_id && envelope.session_id !== this.sessionId.value) {
      this.sessionId.value = envelope.session_id
      console.log('[MindX WS] 🔄 Updated sessionId to:', envelope.session_id)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.ws?.send('{"jsonrpc":"2.0","method":"ping"}')
      }
    }, this.config.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private handleReconnect(): void {
    const maxAttempts = this.config.maxReconnectAttempts || 10

    if (this.reconnectAttempts >= maxAttempts) {
      console.warn(`[MindX WS] Max reconnect attempts (${maxAttempts}) reached`)
      this.lastError.value = `Failed to reconnect after ${maxAttempts} attempts`
      return
    }

    this.reconnectAttempts++
    this.state.value = 'reconnecting'

    const delay = Math.min(
      this.config.reconnectInterval! * Math.pow(1.5, this.reconnectAttempts - 1),
      30000
    )

    console.log(`[MindX WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  destroy(): void {
    this.disconnect()
    this.handlers.clear()
  }
}

let clientInstance: MindXWebSocketClient | null = null
let stateBridgeCleanup: (() => void) | null = null

export function createMindXClient(
  url: string,
  onStateChange?: (oldState: ConnectionState, newState: ConnectionState) => void
): MindXWebSocketClient {
  if (clientInstance) {
    clientInstance.destroy()
  }

  if (stateBridgeCleanup) {
    stateBridgeCleanup()
    stateBridgeCleanup = null
  }

  clientInstance = new MindXWebSocketClient({ url })

  if (onStateChange) {
    stateBridgeCleanup = clientInstance.onStateChange(onStateChange)
  }

  clientInstance.connect().catch((err) => {
    console.error('[MindX WS] Auto-connect failed:', err)
  })

  return clientInstance
}

export function getMindXClient(): MindXWebSocketClient | null {
  return clientInstance
}

export default MindXWebSocketClient
