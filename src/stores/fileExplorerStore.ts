import { defineStore } from 'pinia'
import type { FSEntry } from '../types/websocket'

export interface OpenTab {
  id: string
  name: string
  path: string
  content: string
  isDirty: boolean
  isBinary: boolean
  fileType: 'code' | 'markdown' | 'html' | 'other' | 'binary'
}

function detectFileType(name: string): OpenTab['fileType'] {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (['js', 'ts', 'vue', 'jsx', 'tsx', 'css', 'scss', 'less', 'json', 'xml', 'yaml', 'yml',
    'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'sh', 'bash', 'sql', 'rb', 'php',
    'swift', 'kt', 'scala', 'r', 'lua', 'pl', 'hs', 'cs', 'svelte', 'toml', 'ini', 'cfg',
    'conf', 'env', 'dockerfile', 'makefile', 'gradle', 'cmake', 'proto', 'graphql', 'gql',
  ].includes(ext)) return 'code'
  // binary 文件
  const binaryExts = [
    // images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff',
    // video
    'mp4', 'avi', 'mkv', 'mov', 'flv', 'webm',
    // audio
    'mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a',
    // archives
    'zip', 'tar', 'gz', 'rar', '7z',
    // documents
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    // binary
    'exe', 'dll', 'so', 'dmg', 'app', 'iso', 'bin', 'dat',
  ]
  if (binaryExts.includes(ext)) return 'binary'
  return 'other'
}

export interface FileExplorerState {
  visible: boolean
  pendingStartDir: string
  tabs: OpenTab[]
  activeTabId: string | null
  // 编辑/预览切换（markdown/html 用）
  showSource: boolean
}

export const useFileExplorerStore = defineStore('file-explorer', {
  state: (): FileExplorerState => ({
    visible: false,
    pendingStartDir: '',
    tabs: [],
    activeTabId: null,
    showSource: false,
  }),

  getters: {
    activeTab: (state): OpenTab | null =>
      state.tabs.find(t => t.id === state.activeTabId) ?? null,
  },

  actions: {
    open(startDir?: string) {
      this.visible = true
      this.tabs = []
      this.activeTabId = null
      this.showSource = false
      if (startDir) this.pendingStartDir = startDir
    },
    close() {
      this.visible = false
    },

    setShowSource(v: boolean) {
      this.showSource = v
    },

    async openFile(entry: FSEntry, connectionStore: any) {
      if (entry.is_dir) return
      // 已有同路径 tab → 切换过去
      const existing = this.tabs.find(t => t.path === entry.path)
      if (existing) {
        this.activeTabId = existing.id
        this.showSource = false
        return
      }
      const fileType = detectFileType(entry.name)
      let content = ''
      let isBinary = fileType === 'binary'
      if (!isBinary) {
        content = await connectionStore.readFile(entry.path)
      } else {
        isBinary = true
        content = ''
      }
      const id = entry.path
      const tab: OpenTab = {
        id,
        name: entry.name,
        path: entry.path,
        content,
        isDirty: false,
        isBinary,
        fileType,
      }
      this.tabs.push(tab)
      this.activeTabId = id
      this.showSource = false
    },

    closeTab(tabId: string) {
      const idx = this.tabs.findIndex(t => t.id === tabId)
      if (idx === -1) return
      this.tabs.splice(idx, 1)
      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs.length > 0
          ? this.tabs[Math.min(idx, this.tabs.length - 1)].id
          : null
      }
    },

    setActiveTab(tabId: string) {
      this.activeTabId = tabId
      this.showSource = false
    },

    updateContent(tabId: string, content: string) {
      const tab = this.tabs.find(t => t.id === tabId)
      if (tab) {
        tab.content = content
        tab.isDirty = true
      }
    },
  },
})
