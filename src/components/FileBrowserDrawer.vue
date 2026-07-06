<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Folder,
  Document,
  BottomLeft,
  RefreshRight,
  Edit,
  Delete,
  CirclePlus,
  CircleCheck,
  CircleClose,
  Remove,
  Loading
} from '@element-plus/icons-vue'
import { ElMessage, ElTooltip } from 'element-plus'
import { useConnectionStore } from '../stores/connectionStore'
import { useSessionStore } from '../stores/sessionStore'
import { useFileExplorerStore } from '../stores/fileExplorerStore'
import IndexDetailsDialog from './IndexDetailsDialog.vue'
import EntityTagsDialog from './EntityTagsDialog.vue'
import { getMindXClient } from '../services/websocket'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  projectDir: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:visible', 'open-file', 'add-ref'])

const connectionStore = useConnectionStore()
const sessionStore = useSessionStore()
const fileExplorerStore = useFileExplorerStore()
const { t } = useI18n()

// ── Manifest 路径→状态 缓存（用于树节点索引图标）──
const manifestMap = ref<Record<string, string>>({})

async function refreshManifestMap() {
  const projectDir = sessionStore.activeSession?.project_dir
  if (!projectDir) { manifestMap.value = {}; return }
  try {
    const data = await connectionStore.getIndexQueue(projectDir)
    console.log('[FBD-DEBUG] refreshManifestMap raw:', JSON.stringify(data?.files?.slice(0, 10)))
    const map: Record<string, string> = {}
    if (data?.files) {
      for (const f of data.files) {
        // manifest 返回的路径可能不带前导 /，统一转为绝对路径以匹配 fs.list
        const absPath = f.path.startsWith('/') ? f.path : '/' + f.path
        if (f.state === 'done') map[absPath] = 'indexed'
        else if (f.state === 'pending') map[absPath] = 'pending'
        else if (f.state === 'processing') map[absPath] = 'indexing'
      }
    }
    manifestMap.value = map
    console.log('[FBD-DEBUG] refreshManifestMap built map keys:', Object.keys(map).length, 'sample:', Object.keys(map)[0])
  } catch {
    manifestMap.value = {}
  }
}

// 会话切换时刷新 manifest 缓存
watch(() => sessionStore.activeSession?.project_dir, () => {
  refreshManifestMap()
})
onMounted(() => { refreshManifestMap() })

const drawerVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const showIndexDialog = ref(false)
const showEntityTagDialog = ref(false)

async function handleOpenKB() {
  try {
    const client = getMindXClient()
    if (!client) {
      showIndexDialog.value = true
      return
    }
    const result = await client.call<{ types: any[] }>('entity_tags.get', {})
    if (result?.types && result.types.length > 0) {
      showIndexDialog.value = true
    } else {
      showEntityTagDialog.value = true
    }
  } catch {
    showIndexDialog.value = true
  }
}

function handleOpenEntityTags() {
  showEntityTagDialog.value = true
}

// ── 目录树（懒加载）──
const treeRef = ref<any>(null)
const treeKey = ref(0)

const treeProps = {
  children: 'children',
  label: 'name',
  isLeaf: 'isLeaf',
}

let pendingCreate: { parentPath: string; phantom: any } | null = null

async function loadTreeNode(node: any, resolve: any) {
  try {
    let path: string
    if (node.level === 0) {
      path = props.projectDir || connectionStore.currentProjectDir || ''
      if (!path || path === '/') {
        path = await connectionStore.fetchFSHome()
      }
    } else {
      path = node.data.path
    }
    const entries: any = await connectionStore.fetchFSList(path)
    console.log('[FBD-DEBUG] loadTreeNode path:', path, 'entries:', entries.map((e: any) => ({ name: e.name, index_state: e.index_state })))
    const arr = Array.isArray(entries) ? entries : []
    arr.sort((a: any, b: any) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    const children = arr.map((e: any) => ({ ...e, isLeaf: !e.is_dir }))

    // 从 manifest 缓存合并索引状态（确保节点图标正确）
    for (const child of children) {
      const st = manifestMap.value[child.path]
      if (st) child.index_state = st
    }
    console.log('[FBD-DEBUG] loadTreeNode children after merge:', children.map((c: any) => ({ name: c.name, index_state: c.index_state })))

    if (pendingCreate && pendingCreate.parentPath === path) {
      children.unshift(pendingCreate.phantom)
      pendingCreate = null
      resolve(children)
      nextTick(() => nextTick(focusEditingInput))
      return
    }

    resolve(children)
  } catch {
    resolve([])
  }
}

// ── 当前选中节点路径（用于知识标签配置等操作）──
const selectedNodePath = ref('')

async function handleTreeNodeClick(data: any) {
  selectedNodePath.value = data.path
  if (!data.is_dir && !data._phantom) {
    try {
      fileExplorerStore.pendingSelectPath = data.path
      await fileExplorerStore.openFile(data, connectionStore)
      fileExplorerStore.visible = true
    } catch (err: any) {
      ElMessage.error('Failed to open file: ' + (err?.message || ''))
    }
  }
}

function refreshTree() {
  treeKey.value++
}

// ── 右键上下文菜单 ──
const ctxMenuVisible = ref(false)
const ctxMenuPos = ref({ x: 0, y: 0 })
const ctxTarget = ref<any>(null)

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
  if (st === 'pending' || st === 'indexed') return 'remove'
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
      ElMessage.success('Added to index: ' + data.name)
      data.index_state = 'pending'
      await refreshManifestMap()
    } catch (err: any) {
      ElMessage.error('Index error: ' + (err?.message || ''))
    }
  } else {
    try {
      await connectionStore.removeFromIndexQueue(projectDir, [data.path])
      ElMessage.success('Removed from index: ' + data.name)
      data.index_state = 'unindexed'
      await refreshManifestMap()
    } catch (err: any) {
      ElMessage.error('Remove error: ' + (err?.message || ''))
    }
  }
  closeCtxMenu()
}

// ── 内联编辑 ──
const editingPath = ref<string | null>(null)
const editingValue = ref('')

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

  pendingCreate = { parentPath, phantom }
  editingPath.value = phantom.path
  editingValue.value = ''

  if (!parentNode.loaded) {
    parentNode.expand()
  } else {
    parentNode.loaded = false
    if (parentNode.expanded) {
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

  const node = treeRef.value?.getNode(path)
  if (node?.data._phantom) {
    const parentPath = getParentPath(path)
    const fullPath = joinPath(parentPath, val)
    const isDir = node.data.is_dir
    try {
      if (isDir) {
        await connectionStore.fetchFSMkdir(fullPath)
      } else {
        await connectionStore.writeFile(fullPath, '')
      }
      treeRef.value?.remove(path)
      const newNode = { name: val, path: fullPath, is_dir: isDir, isLeaf: !isDir }
      treeRef.value?.append(newNode, parentPath)
      treeRef.value?.setCurrentKey(fullPath)
      ElMessage.success(isDir ? 'Folder created' : 'File created')
      if (!isDir) {
        fileExplorerStore.openFile(newNode as any, connectionStore).then(() => {
          fileExplorerStore.visible = true
        }).catch((err: any) => {
          ElMessage.error('Failed to open new file: ' + (err?.message || ''))
        })
      }
    } catch (err: any) {
      ElMessage.error('Failed: ' + (err?.message || ''))
      refreshTree()
    }
  } else {
    const oldPath = path
    const parentDir = getParentPath(oldPath)
    const newPath = parentDir ? parentDir + '/' + val : val
    if (newPath === oldPath) return
    try {
      await connectionStore.fetchFSMove(oldPath, newPath)

      const oldNode = treeRef.value?.getNode(oldPath)
      const isDir = oldNode?.data.is_dir
      const newNode = { name: val, path: newPath, is_dir: isDir, isLeaf: !isDir }
      treeRef.value?.remove(oldPath)
      treeRef.value?.append(newNode, parentDir)
      treeRef.value?.setCurrentKey(newPath)

      if (isDir) {
        fileExplorerStore.tabs.forEach(t => {
          if (t.path.startsWith(oldPath + '/') || t.path === oldPath) {
            t.path = newPath + t.path.slice(oldPath.length)
          }
        })
      } else {
        const tab = fileExplorerStore.tabs.find(t => t.path === oldPath)
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
  treeRef.value?.remove(node.path)
  const tab = fileExplorerStore.tabs.find(t => t.path === node.path)
  if (tab) fileExplorerStore.closeTab(tab.id)
  try {
    await connectionStore.fetchFSRemove(node.path)
    ElMessage.success('Deleted')
  } catch (err: any) {
    ElMessage.error('Delete failed: ' + (err?.message || ''))
    refreshTree()
  }
}

function getParentPath(p: string): string {
  if (!p) return ''
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  return p.slice(0, idx)
}

function joinPath(parent: string, name: string): string {
  const p = parent.endsWith('/') ? parent.slice(0, -1) : parent
  return (p || '/') + '/' + name
}

// ── 拖拽移动 ──
function allowDrop(draggingNode: any, dropNode: any, type: string): boolean {
  if (type === 'inner') return dropNode.data.is_dir === true && !dropNode.data._phantom
  return !draggingNode.data._phantom
}

async function handleNodeDrop(draggingNode: any, dropNode: any, dropType: string) {
  const srcPath = draggingNode.data.path
  let targetDir: string
  if (dropType === 'inner') {
    targetDir = dropNode.data.path
  } else {
    targetDir = getParentPath(dropNode.data.path)
  }
  const newPath = joinPath(targetDir, draggingNode.data.name)
  if (newPath === srcPath) return
  try {
    await connectionStore.fetchFSMove(srcPath, newPath)
    draggingNode.data.path = newPath
    const tab = fileExplorerStore.tabs.find(t => t.path === srcPath)
    if (tab) {
      tab.path = newPath
    }
    ElMessage.success('Moved')
  } catch (err: any) {
    ElMessage.error('Move failed: ' + (err?.message || ''))
    refreshTree()
  }
}

function handleAddRef(entry: any) {
  emit('add-ref', entry.path, entry.name)
  emit('update:visible', false)
}

// ── 索引状态控制 ──
function manifestTooltipKey(state: string): string {
  const map: Record<string, string> = {
    excluded: 'excluded',
    indexing: 'indexing',
    unindexed: 'addToKB',
    indexed: 'inKB',
    pending: 'removeFromKB',
  }
  return map[state] || ''
}

async function handleIndexClick(data: any) {
  if (data._phantom) return
  const projectDir = sessionStore.activeSession?.project_dir
  if (!projectDir) { ElMessage.warning('No active project directory'); return }
  console.log('[FBD-DEBUG] handleIndexClick data:', { name: data.name, path: data.path, index_state: data.index_state })
  if (data.index_state === 'unindexed') {
    try {
      await connectionStore.addToIndexQueue(projectDir, [data.path])
      ElMessage.success('Added to index: ' + data.name)
      data.index_state = 'pending'
      console.log('[FBD-DEBUG] handleIndexClick add done, refreshing manifest')
      await refreshManifestMap()
    } catch (err: any) {
      ElMessage.error('Add to index error: ' + (err?.message || ''))
    }
  } else if (data.index_state === 'pending' || data.index_state === 'indexed') {
    try {
      await connectionStore.removeFromIndexQueue(projectDir, [data.path])
      ElMessage.success('Removed from index: ' + data.name)
      data.index_state = 'unindexed'
      console.log('[FBD-DEBUG] handleIndexClick remove done, refreshing manifest')
      await refreshManifestMap()
    } catch (err: any) {
      ElMessage.error('Remove error: ' + (err?.message || ''))
    }
  }
}

function onDocumentClick() {
  if (ctxMenuVisible.value) closeCtxMenu()
}

watch(() => props.visible, (val) => {
  if (val) {
    selectedNodePath.value = props.projectDir || connectionStore.currentProjectDir || sessionStore.activeSession?.project_dir || ''
    treeKey.value++
  }
})
</script>

<template>
  <el-drawer
    v-model="drawerVisible"
    direction="rtl"
    size="380px"
    :append-to-body="false"
    @click="onDocumentClick"
    class="fe-drawer"
  >
    <!-- 自定义标题 -->
    <template #header>
      <div class="drawer-header">
        <div class="drawer-title">
          <el-icon><Folder /></el-icon>
          <span>文件浏览器</span>
        </div>
        <div class="drawer-actions">
          <button class="action-btn" @click="handleOpenEntityTags" title="知识标签配置">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2z"/>
              <path d="M7 7h.01"/>
            </svg>
          </button>
          <button class="action-btn" @click="handleOpenKB" title="知识库">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </button>
          <button class="action-btn" @click="refreshTree" :title="t('common.refresh')">
            <el-icon><RefreshRight /></el-icon>
          </button>
        </div>
      </div>
    </template>

    <!-- 目录树 -->
    <div class="tree-container" tabindex="-1">
      <el-tree
        :key="treeKey"
        ref="treeRef"
        :props="treeProps"
        :load="loadTreeNode"
        lazy
        node-key="path"
        highlight-current
        draggable
        :allow-drag="() => true"
        :allow-drop="allowDrop"
        @node-click="handleTreeNodeClick"
        @node-contextmenu="showCtxMenu"
        @node-drop="handleNodeDrop"
        class="fe-tree"
      >
        <template #default="{ data }">
          <template v-if="editingPath === data.path">
            <input
              class="fe-inline-input"
              v-model="editingValue"
              @keydown.enter.prevent="confirmEdit"
              @keydown.escape.prevent="cancelEdit"
              @blur="confirmEdit"
              @click.stop
            />
          </template>
          <template v-else>
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
              </ElTooltip>
            </span>
            <span class="fe-tree-label" :title="data.name">{{ data.name }}</span>
            <div class="tree-node-actions" @click.stop>
              <el-icon
                class="ref-icon"
                :title="t('fileBrowser.addToChat')"
                @click="handleAddRef(data)"
              >
                <BottomLeft />
              </el-icon>
            </div>
          </template>
        </template>
      </el-tree>
    </div>

    <!-- 右键菜单 -->
    <Transition name="fade">
      <div
        v-if="ctxMenuVisible"
        class="ctx-menu"
        :style="{ left: ctxMenuPos.x + 'px', top: ctxMenuPos.y + 'px' }"
        @click.stop
      >
        <div class="ctx-item" @click="handleAddRef(ctxTarget)">
          <el-icon><Plus /></el-icon>
          <span>{{ t('fileBrowser.addToChat') }}</span>
        </div>
        <div v-if="indexCtxState() === 'add'" class="ctx-item" @click="handleIndexCtx">
          <el-icon><CirclePlus /></el-icon>
          <span>{{ t('fileExplorer.indexManifest.addToKB') }}</span>
        </div>
        <div v-else-if="indexCtxState() === 'remove'" class="ctx-item" @click="handleIndexCtx">
          <el-icon><CircleClose /></el-icon>
          <span>{{ t('fileExplorer.indexManifest.removeFromKB') }}</span>
        </div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" @click="handleNewFile">
          <el-icon><Document /></el-icon>
          <span>{{ t('fileExplorer.newFile') }}</span>
        </div>
        <div class="ctx-item" @click="handleNewFolder">
          <el-icon><Folder /></el-icon>
          <span>{{ t('fileExplorer.newFolder') }}</span>
        </div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" @click="handleRename">
          <el-icon><Edit /></el-icon>
          <span>{{ t('fileExplorer.rename') }}</span>
        </div>
        <div class="ctx-item delete" @click="handleDelete">
          <el-icon><Delete /></el-icon>
          <span>{{ t('fileExplorer.delete') }}</span>
        </div>
      </div>
    </Transition>
    <IndexDetailsDialog :visible="showIndexDialog" @update:visible="showIndexDialog = $event" @refreshed="refreshManifestMap()" />
    <EntityTagsDialog :visible="showEntityTagDialog" :project-dir="selectedNodePath || sessionStore.activeSession?.project_dir" @update:visible="showEntityTagDialog = $event" />
  </el-drawer>
</template>

<style scoped>
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.action-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all .15s;
}
.action-btn:hover {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.08);
}
.action-btn svg {
  display: block;
}

.tree-container {
  flex: 1;
  height: 100%;
  overflow-y: auto;
}

.fe-tree {
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
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

.fe-tree :deep(.el-draggable) {
  cursor: grab;
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

.tree-node-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s ease;
  margin-left: 4px;
}

.fe-tree :deep(.el-tree-node__content:hover) .tree-node-actions {
  opacity: 1;
}

.tree-node-actions .ref-icon {
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.2s ease;
  font-size: 14px;
}

.ref-icon:hover {
  color: #10b981;
}

.fe-inline-input {
  width: 100%;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--accent-cyan);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  font-family: inherit;
}

.ctx-menu {
  position: fixed;
  z-index: 3100;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 0;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background .1s;
}

.ctx-item:hover { background: var(--bg-hover); }

.ctx-item .el-icon { font-size: 15px; }

.ctx-item.delete { color: #ef4444; }
.ctx-item.delete:hover { background: rgba(239,68,68,.12); }

.ctx-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .12s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
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
  margin-right: 2px;
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

<!-- 全局样式覆盖 el-drawer 默认样式以匹配暗色主题 -->
<style>
.fe-drawer {
  background: var(--bg-primary, #0a0e17);
  border-left: 1px solid var(--border-color, #1e293b);
}

.fe-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #1e293b);
  background: var(--bg-secondary, #111827);
}

.fe-drawer .el-drawer__body {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fe-drawer .el-drawer__close-btn {
  color: var(--text-muted, #64748b);
  font-size: 18px;
}

.fe-drawer .el-drawer__close-btn:hover {
  color: var(--text-primary, #f1f5f9);
}
</style>
