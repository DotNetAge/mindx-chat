<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElTooltip } from 'element-plus'
import {
  Close, Folder, Document,
  RefreshRight, Setting, Edit, Reading, Link,
  Plus, Delete, Monitor,
  CirclePlus, CircleCheck, CircleClose, Clock, Remove, Loading
} from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'
import { useSessionStore } from '../stores/sessionStore'
import { useFileExplorerStore } from '../stores/fileExplorerStore'
import { useMarkdown } from '../composables/useMarkdown'
import { useEditorPreferences } from '../composables/useEditorPreferences'
import CodemirrorEditor from './CodemirrorEditor.vue'

const { t } = useI18n()
const connectionStore = useConnectionStore()
const sessionStore = useSessionStore()
const store = useFileExplorerStore()
const { md, renderMermaidInRoot } = useMarkdown()
const editorPrefs = useEditorPreferences()

// ── Manifest 路径→状态 缓存（用于树节点索引图标）──
const manifestMap = ref<Record<string, string>>({})

async function refreshManifestMap(targetDir?: string) {
  const projectDir = (targetDir || sessionStore.activeSession?.project_dir || connectionStore.currentProjectDir || '').replace(/\/+$/, '')
  if (!projectDir) { manifestMap.value = {}; return }
  try {
    const data = await connectionStore.getIndexQueue(projectDir)

    const map: Record<string, string> = {}
    if (data?.files) {
      for (const f of data.files) {
        // kb.index.list 现在统一返回绝对路径
        if (f.state === 'done') map[f.path] = 'indexed'
        else if (f.state === 'pending') map[f.path] = 'pending'
        else if (f.state === 'enqueued') map[f.path] = 'enqueued'
        else if (f.state === 'processing') map[f.path] = 'indexing'
      }
    }
    manifestMap.value = map

  } catch {
    manifestMap.value = {}
  }
}

// 收到 file_indexing 事件时更新已加载树节点状态
function syncNodesFromManifest() {
  const nodesMap = treeRef.value?.store?.nodesMap
  if (!nodesMap) return
  const map = manifestMap.value
  nodesMap.forEach((node: any) => {
    if (!node?.data || node.data._phantom || node.data.is_dir) return
    const st = map[node.data.path]
    if (st !== undefined && node.data.index_state !== st) {
      node.data.index_state = st
    } else if (st === undefined && node.data.index_state !== 'unindexed') {
      node.data.index_state = 'unindexed'
    }
  })
}

// 会话切换时刷新 manifest 缓存
watch(() => sessionStore.activeSession?.project_dir, () => {
  refreshManifestMap()
})
// 收到 file_indexing 事件时自动刷新
watch(() => connectionStore.manifestVersion, () => {
  refreshManifestMap()
  syncNodesFromManifest()
})
onMounted(() => { refreshManifestMap() })

// ── Markdown 预览（Mermaid）──
const mdPreviewRef = ref<HTMLElement | null>(null)
watch(
  () => store.activeTab?.content,
  async () => {
    await nextTick()
    if (mdPreviewRef.value) {
      await renderMermaidInRoot(mdPreviewRef.value)
    }
  },
  { flush: 'post' }
)

const emit = defineEmits(['close'])

// ── 保存 ──
const saving = ref(false)
async function saveFile(tabId: string) {
  const tab = store.tabs.find(t => t.id === tabId)
  if (!tab || tab.isBinary) return
  saving.value = true
  try {
    await connectionStore.writeFile(tab.path, tab.content)
    tab.isDirty = false
    ElMessage.success(t('fileExplorer.saved'))
  } catch (err: any) {
    ElMessage.error(t('fileExplorer.saveError') + ': ' + (err?.message || ''))
  } finally {
    saving.value = false
  }
}

function handleCodemirrorSave(val: string) {
  if (store.activeTabId) saveFile(store.activeTabId)
}

// ── 二进制文件打开（file:/// 协议）──
function openBinaryFile(tab: { name: string; path: string }) {
  const fileUrl = 'file://' + tab.path
  window.open(fileUrl, '_blank')
}

// ── 目录树（懒加载 + 节点 API 注入 phantom）──
const treeRef = ref<any>(null)
const treeKey = ref(0)

const treeProps = {
  children: 'children',
  label: 'name',
  isLeaf: 'isLeaf',
}

async function loadTreeNode(node: any, resolve: any) {
  try {
    let path: string
    if (node.level === 0) {
      path = store.pendingStartDir || connectionStore.currentProjectDir || ''
      store.pendingStartDir = ''
      if (!path) {
        path = await connectionStore.fetchFSHome()
      }
    } else {
      path = node.data.path
    }

    // 根节点首次加载前确保 manifestMap 已就绪（和 onMounted 不重复请求）
    const projectDir = (connectionStore.currentProjectDir || '').replace(/\/+$/, '')
    if (node.level === 0 && projectDir && Object.keys(manifestMap.value).length === 0) {
      await refreshManifestMap(projectDir)
    }

    const entries: any = await connectionStore.fetchFSList(path)

    const arr = Array.isArray(entries) ? entries : []
    arr.sort((a: any, b: any) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    const children = arr.map((e: any) => ({ ...e, isLeaf: !e.is_dir }))

    // 从 manifest 缓存合并索引状态（项目目录下默认 unindexed）
    const inProject = projectDir && (path === projectDir || path.startsWith(projectDir + '/'))
    if (inProject) {
      for (const child of children) {
        const st = manifestMap.value[child.path]
        if (st) {
          child.index_state = st
        } else if (child.is_dir) {
          const prefix = child.path + '/'
          const hasIndexed = Object.keys(manifestMap.value).some(p => p.startsWith(prefix))
          child.index_state = hasIndexed ? 'indexed' : 'unindexed'
        } else {
          child.index_state = 'unindexed'
        }
      }
    }
    

    // 如果有待创建的 phantom 节点，注入到最前面
    if (pendingCreate && pendingCreate.parentPath === path) {
      children.unshift(pendingCreate.phantom)
      pendingCreate = null
      resolve(children)
      // phantom 刚注入，等 DOM 渲染后聚焦输入框
      nextTick(() => nextTick(focusEditingInput))
      return
    }

    resolve(children)
  } catch {
    resolve([])
  }
}

async function handleTreeNodeClick(data: any) {
  if (!data.is_dir && !data._phantom) {
    try {
      await store.openFile(data, connectionStore)
    } catch (err: any) {
      ElMessage.error('Failed to open file: ' + (err?.message || ''))
    }
  }
}

function refreshTree(parentPath?: string) {
  if (parentPath) {
    // 只刷新指定父节点（保留其他节点的展开状态）
    const node = treeRef.value?.getNode(parentPath)
    if (node) {
      node.loaded = false
      if (node.expanded) {
        node.collapse()
      }
      node.expand()
    }
    return
  }
  // 全量刷新（Home/Refresh 按钮）
  treeKey.value++
}

// ── 右键上下文菜单 ──
const ctxMenuVisible = ref(false)
const ctxMenuPos = ref({ x: 0, y: 0 })
const ctxTarget = ref<any>(null)  // the data of the right-clicked node

function showCtxMenu(e: MouseEvent, data: any) {
  if (data._phantom) return
  e.preventDefault()
  ctxTarget.value = data
  ctxMenuPos.value = { x: e.clientX, y: e.clientY }
  ctxMenuVisible.value = true
}

function closeCtxMenu() {
  ctxMenuVisible.value = false
}

// ── 右键菜单：索引控制 ──
function indexCtxState(): string {
  const st = ctxTarget.value?.index_state
  if (st === 'unindexed') return 'add'
  if (st === 'pending' || st === 'enqueued' || st === 'indexed') return 'remove'
  return ''
}

async function handleIndexCtx() {
  const data = ctxTarget.value
  if (!data || data._phantom) return
  const st = indexCtxState()
  if (!st) { closeCtxMenu(); return }
  const projectDir = sessionStore.activeSession?.project_dir
  if (!projectDir) { ElMessage.warning('No active project directory'); closeCtxMenu(); return }
  if (st === 'add') {
    try {
      await connectionStore.addToIndexQueue(projectDir, [data.path])
      ElMessage.success(t('fileExplorer.addedToIndex') + ': ' + data.name)
      data.index_state = 'pending'
      await refreshManifestMap()
      refreshTree()
    } catch (err: any) {
      ElMessage.error(t('fileExplorer.indexError') + ': ' + (err?.message || ''))
    }
  } else {
    try {
      await connectionStore.removeFromIndexQueue(projectDir, [data.path])
      ElMessage.success('Removed from index: ' + data.name)
      data.index_state = 'unindexed'
      await refreshManifestMap()
      refreshTree()
    } catch (err: any) {
      ElMessage.error('Remove error: ' + (err?.message || ''))
    }
  }
  closeCtxMenu()
}

// ── 统一内联编辑（Rename + 新建）──
const editingPath = ref<string | null>(null)
const editingValue = ref('')

// 待创建 phantom（用于懒加载节点）
let pendingCreate: { parentPath: string; phantom: any } | null = null

function startRename(data: any) {
  cancelEdit()
  editingPath.value = data.path
  editingValue.value = data.name
  closeCtxMenu()
  nextTick(focusEditingInput)
}

function startCreate(isDir: boolean) {
  cancelEdit()
  const parentPath = ctxTarget.value?.is_dir
    ? ctxTarget.value.path
    : getParentPath(ctxTarget.value?.path || '')
  if (!parentPath) return

  const phantom: any = {
    name: '',
    path: parentPath + '/__new__' + Date.now(),
    is_dir: isDir,
    isLeaf: !isDir,
    _phantom: true,
  }

  closeCtxMenu()

  const parentNode = treeRef.value?.getNode(parentPath)
  if (!parentNode) return

  // 统一通过 pendingCreate + 重载机制注入 phantom
  // 禁止直接操作 Node 内部 API（insertChild），会破坏 el-tree 节点注册状态
  pendingCreate = { parentPath, phantom }
  editingPath.value = phantom.path
  editingValue.value = ''

  if (!parentNode.loaded) {
    // 未加载过：expand 触发 lazy load → loadTreeNode 会 pick up pendingCreate
    parentNode.expand()
  } else {
    // 已加载过（loaded=true）：强制重载以注入 phantom
    parentNode.loaded = false
    if (parentNode.expanded) {
      // 已展开 → 先折叠再展开来触发重载
      parentNode.collapse()
    }
    parentNode.expand()
  }
}

function focusEditingInput() {
  const inp = document.querySelector<HTMLInputElement>('.fe-inline-input')
  inp?.focus()
  inp?.select()
}

async function confirmEdit() {
  const path = editingPath.value
  const val = editingValue.value.trim()
  if (!path || !val) {
    cancelEdit()
    return
  }
  editingPath.value = null

  // 检查是否是 phantom 节点
  const node = treeRef.value?.getNode(path)
  if (node?.data._phantom) {
    // 新建
    const parentPath = getParentPath(path)
    const fullPath = joinPath(parentPath, val)
    const isDir = node.data.is_dir
    try {
      if (isDir) {
        await connectionStore.fetchFSMkdir(fullPath)
      } else {
        await connectionStore.writeFile(fullPath, '')
      }
      // 移除 phantom
      treeRef.value?.remove(path)
      // 用公开 API append 添加真实节点（保留已展开目录状态）
      const newNode = { name: val, path: fullPath, is_dir: isDir, isLeaf: !isDir }
      treeRef.value?.append(newNode, parentPath)
      treeRef.value?.setCurrentKey(fullPath)
      ElMessage.success(isDir ? 'Folder created' : 'File created')
      if (!isDir) {
        store.openFile(newNode as any, connectionStore).catch((err: any) => {
          ElMessage.error('Failed to open new file: ' + (err?.message || ''))
        })
      }
    } catch (err: any) {
      ElMessage.error('Failed: ' + (err?.message || ''))
      refreshTree(parentPath)
    }
  } else {
    // 重命名（无刷新更新节点）
    const oldPath = path
    const parentDir = getParentPath(oldPath)
    const newPath = parentDir ? parentDir + '/' + val : val
    if (newPath === oldPath) return
    try {
      await connectionStore.fetchFSMove(oldPath, newPath)

      // 获取旧节点信息，在树中直接替换
      const oldNode = treeRef.value?.getNode(oldPath)
      const isDir = oldNode?.data.is_dir
      const newNode = { name: val, path: newPath, is_dir: isDir, isLeaf: !isDir }
      treeRef.value?.remove(oldPath)
      treeRef.value?.append(newNode, parentDir)
      treeRef.value?.setCurrentKey(newPath)

      // 更新已打开 tab 的路径（文件本身 + 目录下所有子文件）
      if (isDir) {
        store.tabs.forEach(t => {
          if (t.path.startsWith(oldPath + '/') || t.path === oldPath) {
            t.path = newPath + t.path.slice(oldPath.length)
          }
        })
      } else {
        const tab = store.tabs.find(t => t.path === oldPath)
        if (tab) {
          tab.path = newPath
          tab.name = val
        }
      }

      ElMessage.success('Renamed')
    } catch (err: any) {
      ElMessage.error('Rename failed: ' + (err?.message || ''))
    }
  }
}

function cancelEdit() {
  if (editingPath.value) {
    // 移除 phantom（如果存在）
    const node = treeRef.value?.getNode(editingPath.value)
    if (node?.data._phantom) {
      treeRef.value?.remove(editingPath.value)
    }
  }
  editingPath.value = null
  pendingCreate = null
}

function handleNewFile() { startCreate(false) }
function handleNewFolder() { startCreate(true) }

function handleRename() {
  const node = ctxTarget.value
  if (!node || node._phantom) return
  startRename(node)
}

async function handleDelete() {
  const node = ctxTarget.value
  if (!node || node._phantom) return
  closeCtxMenu()
  const parentPath = getParentPath(node.path)
  // 乐观移除节点（所见即所得）
  treeRef.value?.remove(node.path)
  // 删除已打开 tab
  const tab = store.tabs.find(t => t.path === node.path)
  if (tab) store.closeTab(tab.id)
  try {
    await connectionStore.fetchFSRemove(node.path)
    ElMessage.success('Deleted')
  } catch (err: any) {
    ElMessage.error('Delete failed: ' + (err?.message || ''))
    refreshTree(parentPath) // 失败时恢复
  }
}

function getParentPath(p: string): string {
  if (!p) return ''
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'  // /xxx → /
  return p.slice(0, idx)
}

/** 安全拼接路径，避免根目录 / 下产生 // */
function joinPath(parent: string, name: string): string {
  const p = parent.endsWith('/') ? parent.slice(0, -1) : parent
  return (p || '/') + '/' + name
}

// ── 拖拽移动 ──
function allowDrop(draggingNode: any, dropNode: any, type: string): boolean {
  if (type === 'inner') return dropNode.data.is_dir === true && !dropNode.data._phantom
  return !draggingNode.data._phantom
}

async function handleNodeDrop(draggingNode: any, dropNode: any, dropType: string, ev: any) {
  const srcPath = draggingNode.data.path
  let targetDir: string
  if (dropType === 'inner') {
    targetDir = dropNode.data.path
  } else {
    targetDir = getParentPath(dropNode.data.path)
  }
  const newPath = joinPath(targetDir, draggingNode.data.name)
  if (newPath === srcPath) return
  // el-tree 已自动完成视觉移动，只需调用后端 API
  try {
    await connectionStore.fetchFSMove(srcPath, newPath)
    // 更新节点 path 使后续操作正确
    draggingNode.data.path = newPath
    // 更新已打开 tab 的路径
    const tab = store.tabs.find(t => t.path === srcPath)
    if (tab) {
      tab.path = newPath
    }
    ElMessage.success('Moved')
  } catch (err: any) {
    ElMessage.error('Move failed: ' + (err?.message || ''))
    // 后端失败，el-tree 的视觉移动需要回滚
    refreshTree(getParentPath(srcPath))
    refreshTree(targetDir)
  }
}

// ── 编辑器设置 ──
function setTheme(v: string) { editorPrefs.value.theme = v as any }
function setFontFamily(v: string) { editorPrefs.value.fontFamily = v as any }
function setFontSize(v: number) { editorPrefs.value.fontSize = v }
function handleTabClick(tabId: string) {
  store.setActiveTab(tabId)
}

function handleTabClose(tabId: string) {
  store.closeTab(tabId)
}

// ── 编辑器 ──
function onContentUpdate(val: string) {
  if (store.activeTabId) {
    store.updateContent(store.activeTabId, val)
  }
}

// ── 从 drawer 打开文件后，在树中定位并高亮该节点 ──
watch(() => store.visible, (visible) => {
  if (visible && store.pendingSelectPath) {
    const path = store.pendingSelectPath
    store.pendingSelectPath = '' // 消费掉
    navigateTreeToFile(path)
  }
})

/**
 * 在懒加载树中逐层展开目录，最终选中目标文件。
 * el-tree 的节点展开是异步的（触发 lazy load），
 * 因此采用轮询方式等待每一级节点加载完成。
 */
function navigateTreeToFile(targetPath: string) {
  const rootPath = connectionStore.currentProjectDir || '/'
  // 相对路径 segments，如 ['dir1', 'dir2', 'file.txt']
  const rel = targetPath.startsWith(rootPath)
    ? targetPath.slice(rootPath.length).replace(/^\//, '')
    : targetPath
  const segments = rel.split('/').filter(Boolean)
  if (segments.length === 0) return

  let idx = 0
  let currentPath = rootPath

  function step() {
    if (idx >= segments.length) return
    const nextPath = joinPath(currentPath, segments[idx])
    const node = treeRef.value?.getNode(nextPath)

    if (!node) {
      // 节点尚未加载，等 100ms 重试
      setTimeout(step, 100)
      return
    }

    if (idx === segments.length - 1) {
      // 最后一级 → 选中
      treeRef.value?.setCurrentKey(nextPath)
      return
    }

    // 中间目录 → 展开
    currentPath = nextPath
    idx++
    if (!node.expanded) {
      node.expand()
    }
    // 展开后等子节点加载完成再继续
    setTimeout(step, 200)
  }

  step()
}

// 不使用 watch + treeKey++，因为 v-if="store.visible" 已保证每次打开时 el-tree 全新挂载

function handleClose() {
  store.close()
  emit('close')
}

// ── 索引状态控制 ──
function manifestTooltipKey(state: string): string {
  const map: Record<string, string> = {
    excluded: 'excluded',
    indexing: 'indexing',
    unindexed: 'addToKB',
    indexed: 'inKB',
    pending: 'removeFromKB',
    enqueued: 'removeFromKB',
  }
  return map[state] || ''
}

async function handleIndexClick(data: any) {
  if (data._phantom) return
  const projectDir = sessionStore.activeSession?.project_dir
  if (!projectDir) { ElMessage.warning('No active project directory'); return }
  
  if (data.index_state === 'unindexed') {
    try {
      await connectionStore.addToIndexQueue(projectDir, [data.path])
      ElMessage.success(t('fileExplorer.addedToIndex') + ': ' + data.name)
      const node = treeRef.value?.getNode(data.path)
      if (node) { node.data.index_state = 'pending' }
      
      await refreshManifestMap()
      refreshTree(getParentPath(data.path))
    } catch (err: any) {
      ElMessage.error(t('fileExplorer.indexError') + ': ' + (err?.message || ''))
    }
  } else if (data.index_state === 'pending' || data.index_state === 'enqueued' || data.index_state === 'indexed') {
    try {
      await connectionStore.removeFromIndexQueue(projectDir, [data.path])
      ElMessage.success('Removed from index: ' + data.name)
      const node = treeRef.value?.getNode(data.path)
      if (node) { node.data.index_state = 'unindexed' }
      
      await refreshManifestMap()
      refreshTree(getParentPath(data.path))
    } catch (err: any) {
      ElMessage.error('Remove error: ' + (err?.message || ''))
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade-scale">
      <div v-if="store.visible" class="fv-overlay">
        <!-- Header -->
        <header class="fv-header">
          <div class="fv-header-left">
            <h1 class="fv-title">
              <el-icon><Folder /></el-icon>
              {{ t('fileExplorer.title') }}
            </h1>
          </div>
          <div class="fv-header-right">
            <button class="action-btn" @click="connectionStore.showTerminalDrawer = true" title="Terminal">
              <el-icon><Monitor /></el-icon>
            </button>
            <button class="close-btn" @click="handleClose" :title="t('common.close')">
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </header>

        <div class="fv-body">
          <!-- ─── 左：目录树 ─── -->
          <aside class="fv-sidebar">
            <div class="sidebar-toolbar">
              <el-button text class="tool-btn" @click="refreshTree" title="Refresh">
                <el-icon><RefreshRight /></el-icon>
              </el-button>
              <div style="flex:1"></div>
              <el-popover placement="bottom-start" :width="210" trigger="click" :popper-style="{ zIndex: 8010 }">
                <template #reference>
                  <el-button text class="tool-btn" :title="t('fileExplorer.settings')">
                    <el-icon><Setting /></el-icon>
                  </el-button>
                </template>
                <div class="editor-settings-panel">
                  <div class="settings-section">
                    <label class="settings-label">{{ t('fileExplorer.theme') }}</label>
                    <el-select
                      :model-value="editorPrefs.theme"
                      @update:model-value="setTheme"
                      size="small"
                      class="settings-select"
                      popper-style="z-index: 8010"
                    >
                      <el-option label="One Dark" value="oneDark" />
                      <el-option label="Default" value="default" />
                      <el-option label="Monokai" value="monokai" />
                      <el-option label="Dracula" value="dracula" />
                      <el-option label="Nord" value="nord" />
                      <el-option label="GitHub Light" value="githubLight" />
                      <el-option label="GitHub Dark" value="githubDark" />
                      <el-option label="Sublime" value="sublime" />
                      <el-option label="Tokyo Night" value="tokyoNight" />
                    </el-select>
                  </div>
                  <div class="settings-section">
                    <label class="settings-label">{{ t('fileExplorer.font') }}</label>
                    <el-select
                      :model-value="editorPrefs.fontFamily"
                      @update:model-value="setFontFamily"
                      size="small"
                      class="settings-select"
                      popper-style="z-index: 8010"
                    >
                      <el-option label="JetBrains Mono" value="JetBrains Mono" />
                      <el-option label="Fira Code" value="Fira Code" />
                      <el-option label="Consolas" value="Consolas" />
                      <el-option label="Source Code Pro" value="Source Code Pro" />
                      <el-option label="Monospace" value="monospace" />
                      <el-option label="SF Mono" value="SF Mono" />
                      <el-option label="Menlo" value="Menlo" />
                      <el-option label="Monaco" value="Monaco" />
                      <el-option label="DejaVu Sans Mono" value="DejaVu Sans Mono" />
                      <el-option label="Cascadia Code" value="Cascadia Code" />
                      <el-option label="Ubuntu Mono" value="Ubuntu Mono" />
                    </el-select>
                  </div>
                  <div class="settings-section">
                    <label class="settings-label">{{ t('fileExplorer.fontSize') }}: {{ editorPrefs.fontSize }}px</label>
                    <div class="font-size-row">
                      <el-button size="small" @click="editorPrefs.fontSize = Math.max(10, editorPrefs.fontSize - 1)" :disabled="editorPrefs.fontSize <= 10">-</el-button>
                      <el-slider
                        :model-value="editorPrefs.fontSize"
                        @update:model-value="setFontSize"
                        :min="10"
                        :max="24"
                        :step="1"
                        size="small"
                        class="font-size-slider"
                      />
                      <el-button size="small" @click="editorPrefs.fontSize = Math.min(24, editorPrefs.fontSize + 1)" :disabled="editorPrefs.fontSize >= 24">+</el-button>
                    </div>
                  </div>
                </div>
              </el-popover>
            </div>

            <el-tree
              :key="treeKey"
              ref="treeRef"
              :props="treeProps"
              :load="loadTreeNode"
              lazy
              node-key="path"
              highlight-current
              draggable
              :allow-drop="allowDrop"
              class="fe-tree"
              @node-click="handleTreeNodeClick"
              @node-contextmenu="showCtxMenu"
              @node-drop="handleNodeDrop"
            >
              <template #default="{ data }">
                <span class="fe-tree-icon">
                  <el-icon v-if="data.is_dir"><Folder /></el-icon>
                  <el-icon v-else><Document /></el-icon>
                </span>
                <!-- 索引状态图标 -->
                <span v-if="data.index_state && !data._phantom" class="fe-index-icon" :class="'idx-' + data.index_state" @click.stop="handleIndexClick(data)">
                  <ElTooltip :content="t(`fileExplorer.indexManifest.${manifestTooltipKey(data.index_state)}`)" placement="left" :show-after="300">
                    <el-icon v-if="data.index_state === 'excluded'" :size="15"><Remove /></el-icon>
                    <el-icon v-else-if="data.index_state === 'indexing'" :size="15" class="is-loading"><Loading /></el-icon>
                    <el-icon v-else-if="data.index_state === 'unindexed'" :size="15"><CirclePlus /></el-icon>
                    <el-icon v-else-if="data.index_state === 'indexed'" :size="15"><CircleCheck /></el-icon>
                    <el-icon v-else-if="data.index_state === 'pending'" :size="15"><CircleClose /></el-icon>
                    <el-icon v-else-if="data.index_state === 'enqueued'" :size="15"><Clock /></el-icon>
                  </ElTooltip>
                </span>
                <template v-if="editingPath === data.path">
                  <input
                    v-model="editingValue"
                    class="fe-inline-input"
                    @keyup.enter="confirmEdit"
                    @keyup.esc="cancelEdit"
                    @click.stop
                  />
                </template>
                <span v-else class="fe-tree-label" :title="data.name">{{ data._phantom ? 'untitled' : data.name }}</span>
              </template>
            </el-tree>

            <!-- ── 右键上下文菜单 ── -->
            <div v-if="ctxMenuVisible" class="ctx-overlay" @click="closeCtxMenu" @contextmenu.prevent="closeCtxMenu"></div>
            <div v-if="ctxMenuVisible" class="ctx-menu" :style="{ left: ctxMenuPos.x + 'px', top: ctxMenuPos.y + 'px' }">
              <div class="ctx-menu-item" @click="handleNewFile">
                <el-icon><Plus /></el-icon>
                {{ t('fileExplorer.newFile') }}
              </div>
              <div class="ctx-menu-item" @click="handleNewFolder">
                <el-icon><Folder /></el-icon>
                {{ t('fileExplorer.newFolder') }}
              </div>
              <div v-if="indexCtxState() === 'add'" class="ctx-menu-item" @click="handleIndexCtx">
                <el-icon><CirclePlus /></el-icon>
                {{ t('fileExplorer.indexManifest.addToKB') }}
              </div>
              <div v-else-if="indexCtxState() === 'remove'" class="ctx-menu-item" @click="handleIndexCtx">
                <el-icon><CircleClose /></el-icon>
                {{ t('fileExplorer.indexManifest.removeFromKB') }}
              </div>
              <div class="ctx-menu-divider"></div>
              <div class="ctx-menu-item" @click="handleRename">
                <el-icon><Edit /></el-icon>
                {{ t('common.edit') }}
              </div>
              <div class="ctx-menu-item ctx-menu-danger" @click="handleDelete">
                <el-icon><Delete /></el-icon>
                {{ t('common.delete') }}
              </div>
            </div>
          </aside>

          <!-- ─── 右：Tab 栏 + 编辑器 ─── -->
          <div class="fv-main">
            <!-- Tab 栏 -->
            <div v-if="store.tabs.length > 0" class="tab-bar">
              <div
                v-for="tab in store.tabs"
                :key="tab.id"
                class="tab-item"
                :class="{ active: tab.id === store.activeTabId }"
                @click="handleTabClick(tab.id)"
              >
                <span class="tab-name">{{ tab.name }}</span>
                <el-icon class="tab-close" @click.stop="handleTabClose(tab.id)"><Close /></el-icon>
              </div>
            </div>

            <!-- 编辑器区域 -->
            <div v-if="store.activeTab" class="editor-area">
              <!-- 切换：源代码 / 预览 -->
              <div v-if="store.activeTab.fileType === 'html'" class="view-toggle">
                <button
                  :class="{ on: !store.showSource }"
                  @click="store.setShowSource(false)"
                >
                  <el-icon><Reading /></el-icon> Preview
                </button>
                <button
                  :class="{ on: store.showSource }"
                  @click="store.setShowSource(true)"
                >
                  <el-icon><Edit /></el-icon> Source
                </button>
              </div>

              <!-- Code: CodeMirror 编辑器 -->
              <div v-if="store.activeTab.fileType === 'code'" class="cm-container">
                <CodemirrorEditor
                  :model-value="store.activeTab.content"
                  :language="store.activeTab.name"
                  :theme="editorPrefs.theme"
                  :font-family="editorPrefs.fontFamily"
                  :font-size="editorPrefs.fontSize"
                  @update:model-value="onContentUpdate"
                  @save="handleCodemirrorSave"
                />
              </div>

              <!-- Markdown: 左右分栏（编辑 + 预览） -->
              <div v-if="store.activeTab.fileType === 'markdown'" class="editor-tab-pane">
                <div class="md-split">
                  <div class="md-split-editor">
                    <CodemirrorEditor
                      :model-value="store.activeTab.content"
                      language="md"
                      :theme="editorPrefs.theme"
                      :font-family="editorPrefs.fontFamily"
                      :font-size="editorPrefs.fontSize"
                      @update:model-value="onContentUpdate"
                      @save="handleCodemirrorSave"
                    />
                  </div>
                  <div class="md-split-divider"></div>
                  <div class="md-split-preview markdown-body"
                    ref="mdPreviewRef"
                    v-html="md.render(store.activeTab.content)"
                  ></div>
                </div>
              </div>

              <!-- HTML: 预览（iframe） / 源码 -->
              <div v-if="store.activeTab.fileType === 'html'" class="editor-tab-pane">
                <div v-if="store.showSource" class="source-view">
                  <div class="cm-container">
                    <CodemirrorEditor
                      :model-value="store.activeTab.content"
                      language="html"
                      :theme="editorPrefs.theme"
                      :font-family="editorPrefs.fontFamily"
                      :font-size="editorPrefs.fontSize"
                      @update:model-value="onContentUpdate"
                      @save="handleCodemirrorSave"
                    />
                  </div>
                </div>
                <iframe
                  v-else
                  class="html-preview"
                  :srcdoc="store.activeTab.content"
                  sandbox="allow-scripts"
                ></iframe>
              </div>

              <!-- Binary -->
              <div v-if="store.activeTab.isBinary" class="binary-view">
                <el-icon :size="64" class="binary-icon"><Document /></el-icon>
                <p class="binary-name">{{ store.activeTab.name }}</p>
                <div class="binary-path" :title="store.activeTab.path">{{ store.activeTab.path }}</div>
                <button class="binary-open-btn" @click="openBinaryFile(store.activeTab)">
                  <el-icon><Link /></el-icon>
                  {{ t('fileExplorer.openFile') }}
                </button>
              </div>

              <!-- Other -->
              <div v-else-if="store.activeTab.fileType === 'other'" class="source-view">
                <div class="cm-container">
                  <CodemirrorEditor
                    :model-value="store.activeTab.content"
                    language="text"
                    :theme="editorPrefs.theme"
                    :font-family="editorPrefs.fontFamily"
                    :font-size="editorPrefs.fontSize"
                    @update:model-value="onContentUpdate"
                    @save="handleCodemirrorSave"
                  />
                </div>
              </div>
            </div>

            <!-- 无打开文件 -->
            <div v-else class="no-tab">
              <el-icon :size="48"><Folder /></el-icon>
              <p>{{ t('fileExplorer.selectFile') }}</p>
            </div>
          </div>
        </div>

      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* ─── Overlay ─── */
.fv-overlay {
  position: fixed; inset: 0; z-index: 8000;
  display: flex; flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

/* ─── Header ─── */
.fv-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 20px;
  min-height: 48px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.fv-header-left {
  display: flex; align-items: center; gap: 12px;
}
.fv-title {
  font-size: 16px; font-weight: 700; color: var(--text-primary);
  margin: 0;
  display: flex; align-items: center; gap: 8px;
}
.fv-header-right {
  display: flex; align-items: center; gap: 6px;
}
.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px; cursor: pointer;
  transition: all .15s;
}
.close-btn:hover {
  color: #f87171;
  background: rgba(239, 68, 68, 0.12);
}
.action-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px; cursor: pointer;
  transition: all .15s;
}
.action-btn:hover {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.08);
}

/* ─── Body ─── */
.fv-body {
  flex: 1; display: flex;
  overflow: hidden;
}

/* ─── 侧栏 ─── */
.fv-sidebar {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
}
.tool-btn {
  border: none !important;
  color: var(--text-muted) !important;
  font-size: 14px;
  padding: 4px !important;
  height: auto !important;
  border-radius: 6px !important;
  transition: all .15s !important;
  background: transparent !important;
}
.tool-btn:hover { color: var(--accent-cyan) !important; background: rgba(6,182,212,.08) !important; }
.tool-btn:focus { outline: none; }

/* ─── 编辑器设置面板 ─── */
.editor-settings-panel { padding: 4px 0; }
.settings-section { margin-bottom: 12px; }
.settings-section:last-child { margin-bottom: 0; }
.settings-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.settings-select { width: 100%; }
.settings-select :deep(.el-input__wrapper) {
  background: rgba(255,255,255,.04);
  box-shadow: none;
  border: 1px solid var(--border-color);
}
.font-size-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.font-size-slider { flex: 1; }
.font-size-slider :deep(.el-slider__runway) {
  margin: 0;
  background: rgba(255,255,255,.08);
}
.font-size-slider :deep(.el-slider__bar) {
  background: var(--accent-cyan);
}

/* ─── el-tree 目录树 ─── */
.fe-tree {
  flex: 1;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  overflow-y: auto;
}
.fe-tree :deep(.el-tree-node__content) {
  height: 30px;
  padding: 0 8px;
  border-left: 2px solid transparent;
  transition: all .1s;
}
.fe-tree :deep(.el-tree-node__content:hover) {
  background: var(--bg-hover);
}
.fe-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: rgba(6,182,212,.08) !important;
  border-left-color: var(--accent-cyan) !important;
}
.fe-tree :deep(.el-tree-node:focus > .el-tree-node__content) {
  background-color: transparent !important;
}
.fe-tree :deep(.el-tree-node__content:focus-visible) {
  outline: none !important;
  background-color: transparent !important;
}
.fe-tree :deep(.el-tree-node__expand-icon) {
  color: var(--text-muted);
  font-size: 12px;
}
.fe-tree :deep(.el-tree-node__expand-icon.is-leaf) {
  color: transparent;
}
.fe-tree-icon {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  flex-shrink: 0;
}
.fe-tree-icon .el-icon {
  font-size: 16px;
}
.fe-tree-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fe-inline-input {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--accent-cyan);
  border-radius: 4px;
  outline: none;
}
/* ─── 主区 ─── */
.fv-main {
  flex: 1; display: flex; flex-direction: column;
  min-width: 0; overflow: hidden;
}

/* Tab 栏 */
.tab-bar {
  display: flex;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  flex-shrink: 0;
}
.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: all .15s;
  user-select: none;
}
.tab-item:hover { color: var(--text-primary); background: var(--bg-hover); }
.tab-item.active {
  color: var(--accent-cyan);
  border-bottom-color: var(--accent-cyan);
  background: rgba(6,182,212,.06);
}
.tab-close {
  font-size: 12px;
  border-radius: 4px;
  padding: 2px;
}
.tab-close:hover { background: rgba(239,68,68,.15); color: #ef4444; }

/* 编辑区 */
.editor-area {
  flex: 1; display: flex; flex-direction: column;
  position: relative; overflow: hidden;
}

/* 切换栏 */
.view-toggle {
  display: flex; gap: 0;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.view-toggle button {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 16px;
  font-size: 12px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all .15s;
}
.view-toggle button.on {
  color: var(--accent-cyan);
  border-bottom-color: var(--accent-cyan);
}
.view-toggle button:hover { color: var(--text-primary); background: var(--bg-hover); }

/* CodeMirror 容器 */
.cm-container {
  flex: 1; overflow: hidden;
  display: flex;
}

/* ─── Markdown 分栏 ─── */
.md-split {
  flex: 1; display: flex;
  flex-direction: row;
  overflow: hidden; min-height: 0;
}
.md-split-editor {
  flex: 1; display: flex;
  overflow: hidden; min-width: 0;
}
.md-split-divider {
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
}
.md-split-preview {
  flex: 1; overflow-y: auto;
  padding: 16px 20px;
  color: var(--text-primary);
  background: var(--bg-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans SC", "PingFang SC", "Segoe UI Emoji", sans-serif;
  font-size: 14px;
  line-height: 1.7;
}
.md-split-preview :deep(h1), .md-split-preview :deep(h2),
.md-split-preview :deep(h3), .md-split-preview :deep(h4) {
  margin: 16px 0 8px; color: var(--text-primary);
  font-weight: 700;
}
.md-split-preview :deep(p) { margin: 8px 0; line-height: 1.7; }
.md-split-preview :deep(code) {
  font-family: "SF Mono", "Menlo", "Monaco", "Inconsolata", "JetBrains Mono", "Cascadia Code", "Noto Sans Mono CJK SC", monospace;
  background: rgba(255,255,255,.06); padding: 2px 6px; border-radius: 4px; font-size: 13px;
}
.md-split-preview :deep(pre) { background: #0d1117; padding: 16px; border-radius: 8px; overflow-x: auto; }
.md-split-preview :deep(pre code) { background: none; padding: 0; }
.md-split-preview :deep(a) { color: #60a5fa; text-decoration: none; }
.md-split-preview :deep(a:hover) { text-decoration: underline; }
.md-split-preview :deep(a[href^="file://"]) {
  display: inline-flex; align-items: center; gap: 3px;
  color: #5eead4; font-weight: 600; font-size: 13px;
  padding: 1px 6px; border-radius: 4px;
  background: rgba(6,182,212,.08); border: 1px solid rgba(6,182,212,.15);
  white-space: nowrap; transition: all .15s;
}
.md-split-preview :deep(a[href^="file://"]:hover) {
  background: rgba(6,182,212,.15); border-color: rgba(6,182,212,.35);
  color: #67e8f9; text-decoration: none;
}
.md-split-preview :deep(blockquote) {
  border-left: 3px solid #3b82f6; padding-left: 12px; margin: 8px 0; color: var(--text-muted); font-style: italic;
}
.md-split-preview :deep(ul), .md-split-preview :deep(ol) { padding-left: 20px; margin: 8px 0; }
.md-split-preview :deep(li) { margin: 2px 0; }
.md-split-preview :deep(img) { max-width: 100%; border-radius: 6px; }
.md-split-preview :deep(table) { border-collapse: collapse; width: 100%; margin: 10px 0; }
.md-split-preview :deep(th), .md-split-preview :deep(td) {
  border: 1px solid rgba(55,65,81,.5); padding: 6px 10px; text-align: left;
}
.md-split-preview :deep(th) { background: rgba(6,182,212,.08); font-weight: 600; }
.md-split-preview :deep(hr) { border: none; border-top: 1px solid rgba(55,65,81,.5); margin: 16px 0; }
/* Mermaid */
.md-split-preview :deep(.mermaid) {
  background: #161b22; border: 1px solid rgba(6,182,212,.25);
  border-radius: 8px; padding: 12px; margin: 10px 0;
  overflow-x: auto; text-align: center; min-height: 60px;
}
.md-split-preview :deep(.mermaid svg) { max-width: 100%; height: auto; }

/* Markdown 全屏（旧，保留向下兼容） */
.markdown-preview {
  flex: 1; overflow-y: auto;
  padding: 20px 24px;
  color: var(--text-primary);
}
.markdown-preview :deep(h1), .markdown-preview :deep(h2),
.markdown-preview :deep(h3), .markdown-preview :deep(h4) {
  margin: 16px 0 8px; color: var(--text-primary);
}
.markdown-preview :deep(p) { margin: 8px 0; line-height: 1.7; }
.markdown-preview :deep(code) { background: rgba(255,255,255,.06); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.markdown-preview :deep(pre) { background: #0d1117; padding: 16px; border-radius: 8px; overflow-x: auto; }
.markdown-preview :deep(pre code) { background: none; padding: 0; }
.markdown-preview :deep(a) { color: #60a5fa; text-decoration: none; }
.markdown-preview :deep(a:hover) { text-decoration: underline; }
.markdown-preview :deep(blockquote) {
  border-left: 3px solid #3b82f6; padding-left: 12px; margin: 8px 0; color: var(--text-muted); font-style: italic;
}
.markdown-preview :deep(ul), .markdown-preview :deep(ol) { padding-left: 20px; margin: 8px 0; }
.markdown-preview :deep(li) { margin: 2px 0; }
.markdown-preview :deep(img) { max-width: 100%; border-radius: 6px; }

/* 编辑器 Tab 容器 —— 提供 flex:1 让子元素正确撑高 */
.editor-tab-pane {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden; min-height: 0;
}

/* Source view (共用) */
.source-view {
  flex: 1; overflow: hidden;
}

/* HTML iframe */
.html-preview {
  flex: 1; border: none; background: #fff;
}

/* 无文件 */
.no-tab {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 14px;
}

/* 二进制文件 */
.binary-view {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px;
  padding: 40px;
}
.binary-icon { color: var(--text-muted); }
.binary-name { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
.binary-path {
  font-size: 11px;
  color: var(--text-muted);
  max-width: 80%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 10px;
  background: rgba(255,255,255,.04);
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
}
.binary-open-btn {
  display: flex; align-items: center; gap: 6px;
  margin-top: 8px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--accent-cyan);
  background: rgba(6,182,212,.08);
  border: 1px solid rgba(6,182,212,.2);
  border-radius: 8px;
  cursor: pointer;
  transition: all .15s;
}
.binary-open-btn:hover {
  background: rgba(6,182,212,.16);
  border-color: var(--accent-cyan);
}

/* ─── Transition ─── */
.fade-scale-enter-active { transition: opacity .2s ease, transform .2s ease; }
.fade-scale-leave-active { transition: opacity .15s ease, transform .15s ease; }
.fade-scale-enter-from { opacity: 0; transform: scale(.97); }
.fade-scale-leave-to { opacity: 0; transform: scale(.97); }

/* ─── 右键上下文菜单 ─── */
.ctx-overlay {
  position: fixed; inset: 0; z-index: 9999;
}
.ctx-menu {
  position: fixed; z-index: 10000;
  min-width: 160px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 4px 0;
  box-shadow: 0 8px 24px rgba(0,0,0,.4);
}
.ctx-menu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background .1s;
}
.ctx-menu-item:hover { background: var(--bg-hover); }
.ctx-menu-item .el-icon { font-size: 15px; color: var(--text-muted); }
.ctx-menu-danger { color: #f87171; }
.ctx-menu-danger:hover { background: rgba(239,68,68,.1); }
.ctx-menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 8px;
}

/* ─── 索引状态图标 ─── */
.fe-index-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 4px;
  transition: all .15s;
  cursor: pointer;
  color: var(--text-muted);
}
.fe-index-icon:hover {
  background: var(--bg-hover);
}
.fe-index-icon.idx-unindexed {
  opacity: 0.6;
  color: var(--text-muted);
}
.fe-index-icon.idx-unindexed:hover {
  opacity: 1;
  color: var(--accent-cyan);
  background: rgba(6,182,212,.08);
}
.fe-index-icon.idx-indexed {
  color: #34d399;
}
.fe-index-icon.idx-indexed:hover {
  background: rgba(239,68,68,.08);
  color: #f87171;
}
.fe-index-icon.idx-pending {
  color: #fbbf24;
}
.fe-index-icon.idx-pending:hover {
  background: rgba(239,68,68,.08);
  color: #f87171;
}
.fe-index-icon.idx-indexing {
  cursor: default;
  color: var(--accent-cyan);
}
.fe-index-icon.idx-excluded {
  cursor: default;
  opacity: 0.4;
  color: var(--text-muted);
}
</style>


