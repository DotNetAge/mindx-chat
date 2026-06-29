import { defineStore } from 'pinia'
import * as api from '../services/graphApi'
import { useConnectionStore } from './connectionStore'
import { buildSearchTree, type TreeNode } from '../utils/treeBuilder'

// Re-export types for convenience
export type { GraphNode, GraphEdge, LabelCount, RelationTypeCount, DocChunk, SearchResult, FileStateResult, FilewatchStatus, MultiHopResult, HopNode, HopEdge } from '../services/graphApi'
export type { TreeNode } from '../utils/treeBuilder'

// ── Category color mapping (aligned with theme CSS vars) ──
export const CATEGORY_COLORS: Record<string, string> = {
  Concept: '#06b6d4',       // accent-cyan
  KnowledgeUnit: '#3b82f6', // accent-blue
  Resource: '#8b5cf6',      // accent-purple
  Practice: '#10b981',      // green
  Association: '#f59e0b',   // amber
}

export const LEVEL_COLORS: Record<string, string> = {
  basic: '#94a3b8',
  core: '#06b6d4',
  advanced: '#8b5cf6',
  practical: '#10b981',
}

export interface MainTab {
  id: string
  type: 'graph' | 'file' | 'entity'
  label: string
  labelType?: string   // entity tab: e.g. 'Method'
  filePath?: string    // file tab
  closable: boolean
}

export interface GraphViewerState {
  visible: boolean
  loading: boolean
  error: string | null

  // Graph data
  nodes: api.GraphNode[]
  edges: api.GraphEdge[]
  selectedNodeId: string | null
  neighborNodeIds: Set<string>

  // Sidebar data
  docs: string[]
  labelDistribution: api.LabelCount[]
  relationDistribution: api.RelationTypeCount[]
  levelDistribution: api.LabelCount[]
  stats: { totalNodes: number; totalEdges: number }

  // Filters
  activeTab: 'documents' | 'entities' | 'stats' // sidebar tab
  selectedDocId: string | null
  selectedLabels: string[]
  searchQuery: string

  // Semantic search
  searchResults: api.SearchResult[]
  searchLoading: boolean
  /** 树状搜索结果 */
  searchTree: TreeNode[]
  /** 已展开的 chunk ID */
  expandedChunkIds: Set<string>

  // Default chunk list (paginated from indexer, 20 per page)
  defaultChunks: api.SearchResult[]
  defaultChunksLoading: boolean
  chunkPage: number
  chunkTotal: number

  // File reader panel
  activeFilePath: string | null

  // Main viewport tabs (graph / file / entity list)
  mainTabs: MainTab[]
  activeMainTabId: string

  // Multi-hop graph
  multiHopResult: api.MultiHopResult | null
  multiHopLoading: boolean
  multiHopRootId: string | null

  // Chunk node highlighting & filtering
  highlightedNodeIds: Set<string>
  chunkNodeIds: Set<string>

  // Graph progressive loading
  /** 当前在力导图中可见的节点 ID */
  graphVisibleNodeIds: Set<string>
  /** 是否启用力导图渐进加载模式 */
  graphProgressiveEnabled: boolean

  // Node detail drawer chunks
  detailChunks: api.SearchResult[]
  detailLoading: boolean

  // Show orphan nodes (when label filter is active, include isolated nodes)
  showOrphanNodes: boolean

  // File index status
  filewatchStatus: api.FilewatchStatus | null
  fileStates: api.FileStateResult | null
  fileStatesLoading: boolean
}

export const useGraphStore = defineStore('graph', {
  state: (): GraphViewerState => ({
    visible: false,
    loading: false,
    error: null,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    neighborNodeIds: new Set(),
    docs: [],
    labelDistribution: [],
    relationDistribution: [],
    levelDistribution: [],
    stats: { totalNodes: 0, totalEdges: 0 },
    activeTab: 'documents',
    selectedDocId: null,
    selectedLabels: [],
    searchQuery: '',
    searchResults: [],
    searchLoading: false,
    searchTree: [],
    expandedChunkIds: new Set(),
    defaultChunks: [],
    defaultChunksLoading: false,
    chunkPage: 1,
    chunkTotal: 0,
    activeFilePath: null,
    mainTabs: [{ id: 'graph', type: 'graph', label: '图谱', closable: false }],
    activeMainTabId: 'graph',
    multiHopResult: null,
    multiHopLoading: false,
    multiHopRootId: null,
    highlightedNodeIds: new Set(),
    chunkNodeIds: new Set(),
    graphVisibleNodeIds: new Set(),
    graphProgressiveEnabled: false,
    detailChunks: [],
    detailLoading: false,
    showOrphanNodes: false,
    filewatchStatus: null,
    fileStates: null,
    fileStatesLoading: false,
  }),

  getters: {
    /** Nodes filtered by current selection */
    filteredNodes(state) {
      let result = state.nodes

      if (state.selectedDocId) {
        result = result.filter(n =>
          (n.properties.source_chunk_ids as string[])?.some(cid =>
            cid.includes(state.selectedDocId!)
          ) || false
        )
      }

      if (state.selectedLabels.length > 0) {
        // Label filter active: filter by selected labels
        result = result.filter(n =>
          n.labels.some(l => state.selectedLabels.includes(l))
        )
        // If orphan switch is OFF, further exclude isolated nodes
        if (!state.showOrphanNodes) {
          const filteredIds = new Set(result.map(n => n.id))
          const connectedIds = new Set<string>()
          for (const e of state.edges) {
            if (filteredIds.has(e.from_node_id) && filteredIds.has(e.to_node_id)) {
              connectedIds.add(e.from_node_id)
              connectedIds.add(e.to_node_id)
            }
          }
          result = result.filter(n => connectedIds.has(n.id))
        }
        // If orphan switch is ON, keep all matching nodes (including orphans)
      } else {
        // No label filter: exclude isolated nodes (keep only the largest connected component)
        const filteredIds = new Set(result.map(n => n.id))
        const connectedIds = new Set<string>()
        for (const e of state.edges) {
          if (filteredIds.has(e.from_node_id) && filteredIds.has(e.to_node_id)) {
            connectedIds.add(e.from_node_id)
            connectedIds.add(e.to_node_id)
          }
        }
        result = result.filter(n => connectedIds.has(n.id))
      }

      if (state.searchQuery.trim()) {
        const q = state.searchQuery.toLowerCase()
        result = result.filter(n =>
          (n.properties.name as string)?.toLowerCase().includes(q)
        )
      }

      if (state.chunkNodeIds.size > 0) {
        result = result.filter(n => state.chunkNodeIds.has(n.id))
      }

      // 力导图渐进加载：只显示可见节点
      if (state.graphProgressiveEnabled && state.graphVisibleNodeIds.size > 0) {
        result = result.filter(n => state.graphVisibleNodeIds.has(n.id))
      }

      return result
    },

    /** Edges where both endpoints are in the filtered set */
    filteredEdges(state) {
      const fnIds = new Set(this.filteredNodes.map(n => n.id))
      return state.edges.filter(e => fnIds.has(e.from_node_id) && fnIds.has(e.to_node_id))
    },

    /** Currently selected node object */
    selectedNode(state): api.GraphNode | null {
      if (!state.selectedNodeId) return null
      return state.nodes.find(n => n.id === state.selectedNodeId) ?? null
    },

    /** Edges connected to the selected node */
    selectedNodeEdges(state) {
      if (!state.selectedNodeId) return []
      return state.edges.filter(
        e => e.from_node_id === state.selectedNodeId || e.to_node_id === state.selectedNodeId
      )
    },
  },

  actions: {
    open() {
      this.visible = true
      this.loadAllData()
    },

    close() {
      this.visible = false
      this.selectedNodeId = null
      this.neighborNodeIds.clear()
      this.clearHighlightedNodes() // also clears chunkNodeIds
      // Clear stale data to prevent flash on reopen
      this.nodes = []
      this.edges = []
      this.docs = []
      this.labelDistribution = []
      this.relationDistribution = []
      this.levelDistribution = []
      this.stats = { totalNodes: 0, totalEdges: 0 }
      this.selectedDocId = null
      this.selectedLabels = []
      this.searchQuery = ''
      this.searchResults = []
      this.searchTree = []
      this.expandedChunkIds.clear()
      this.defaultChunks = []
      this.detailChunks = []
      this.showOrphanNodes = false
      this.multiHopResult = null
      this.multiHopRootId = null
      this.filewatchStatus = null
      this.activeFilePath = null
      this.fileStates = null
      this.mainTabs = [{ id: 'graph', type: 'graph', label: '图谱', closable: false }]
      this.activeMainTabId = 'graph'
      this.error = null
      this.graphVisibleNodeIds.clear()
      this.graphProgressiveEnabled = false
    },

    selectNode(nodeId: string | null) {
      this.selectedNodeId = nodeId
      this.neighborNodeIds.clear()
    },

    /** Highlight entity nodes associated with a chunk (from entity_ids) and filter the graph */
    selectChunkNodes(entityIds: string[]) {
      this.highlightedNodeIds = new Set(entityIds)
      this.chunkNodeIds = new Set(entityIds)
      if (entityIds.length === 0) return
      // If exactly one node, also select it for edge highlighting
      if (entityIds.length === 1) {
        this.selectedNodeId = entityIds[0]
        this.neighborNodeIds.clear()
      }
    },

    clearHighlightedNodes() {
      this.highlightedNodeIds.clear()
      this.chunkNodeIds.clear()
    },

    setActiveTab(tab: 'documents' | 'entities' | 'stats') {
      this.activeTab = tab
      this.clearSearch() // 切换 Tab 时自动清除搜索结果，恢复 Tab 内容
    },

    setSelectedDoc(docId: string | null) {
      this.selectedDocId = docId === this.selectedDocId ? null : docId
    },

    toggleLabelFilter(label: string) {
      const idx = this.selectedLabels.indexOf(label)
      if (idx >= 0) {
        this.selectedLabels.splice(idx, 1)
      } else {
        this.selectedLabels.push(label)
      }
    },

    clearFilters() {
      this.selectedDocId = null
      this.selectedLabels = []
      this.searchQuery = ''
    },

    setSearch(query: string) {
      this.searchQuery = query
    },

    // ── Data loading ──

    async loadAllData() {
      this.loading = true
      this.error = null
      try {
        // Use direct storage APIs instead of Cypher (labels(), properties(), type(), etc. are not implemented in gograph)
        const [nodes, edges] = await Promise.all([
          api.listAllNodes(),
          api.listAllEdges(),
        ])

        this.nodes = nodes
        this.edges = edges
        console.log('[GraphStore] nodes loaded:', this.nodes.length, 'items', this.nodes.slice(0, 3))
        console.log('[GraphStore] edges loaded:', this.edges.length, 'items', this.edges.slice(0, 3))

        // Derive stats from data
        this.stats = { totalNodes: nodes.length, totalEdges: edges.length }

        // Derive label distribution
        const labelMap = new Map<string, number>()
        for (const n of nodes) {
          // Each node can have multiple labels; count each
          const labels = n.labels.length > 0 ? n.labels : ['Unknown']
          for (const l of labels) {
            labelMap.set(l, (labelMap.get(l) || 0) + 1)
          }
        }
        this.labelDistribution = Array.from(labelMap.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)

        // Derive relation type distribution
        const relMap = new Map<string, number>()
        for (const e of edges) {
          const t = e.type || 'Unknown'
          relMap.set(t, (relMap.get(t) || 0) + 1)
        }
        this.relationDistribution = Array.from(relMap.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count)

        // Derive level distribution (from node properties)
        const levelMap = new Map<string, number>()
        for (const n of nodes) {
          const lvl = n.properties?.level || n.properties?.knowledge_level || 'unknown'
          const key = typeof lvl === 'string' ? lvl : String(lvl)
          levelMap.set(key, (levelMap.get(key) || 0) + 1)
        }
        this.levelDistribution = Array.from(levelMap.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)

        // Discover document IDs from chunks
        try {
          this.docs = await api.discoverDocs()
          console.log('[GraphStore] docs:', JSON.stringify(this.docs))
        } catch (e) {
          console.warn('[GraphStore] discoverDocs failed:', e)
          this.docs = []
        }
        this.seedGraphVisibility()
      } catch (e: any) {
        this.error = e.message || String(e)
      } finally {
        this.loading = false
      }
    },

    /* ── 力导图渐进加载 ──────────────────────────────── */

    /** 种子化可见节点：仅显示 Region + Document */
    seedGraphVisibility() {
      if (this.nodes.length === 0) return
      const visible = new Set<string>()
      for (const n of this.nodes) {
        if (n.labels.includes('Region') || n.labels.includes('Document')) {
          visible.add(n.id)
        }
      }
      this.graphVisibleNodeIds = visible
      this.graphProgressiveEnabled = true
      console.log(`[GraphStore] visibility seeded: ${visible.size} nodes`)
    },

    /** 展开节点：将其直接子节点加入可见集 */
    toggleGraphNodeExpand(nodeId: string) {
      const expanded = this.isGraphNodeExpanded(nodeId)
      const childIds = new Set<string>()
      for (const e of this.edges) {
        if (e.from_node_id === nodeId) childIds.add(e.to_node_id)
      }
      if (childIds.size === 0) return
      const next = new Set(this.graphVisibleNodeIds)
      if (expanded) {
        childIds.forEach(id => next.delete(id))
      } else {
        childIds.forEach(id => next.add(id))
      }
      this.graphVisibleNodeIds = next
    },

    /** 判断节点是否已展开（子节点可见） */
    isGraphNodeExpanded(nodeId: string): boolean {
      for (const e of this.edges) {
        if (e.from_node_id === nodeId && this.graphVisibleNodeIds.has(e.to_node_id)) return true
      }
      return false
    },

    /** 重置力导图可见性（回到初始态） */
    resetGraphVisibility() {
      this.graphProgressiveEnabled = false
      this.graphVisibleNodeIds.clear()
      this.seedGraphVisibility()
    },

    /** Load neighbors for a node and highlight them on canvas */
    async loadNeighbors(nodeId: string, depth = 1) {
      try {
        const res = await api.getNeighbors(nodeId, depth, 50)
        const neighborIds = new Set(res.neighbors.map(n => n.id))

        // Merge new nodes/edges into existing data
        const existingIds = new Set(this.nodes.map(n => n.id))
        for (const n of res.neighbors) {
          if (!existingIds.has(n.id)) {
            this.nodes.push(n)
          }
        }
        // O(1) edge dedup via Set lookup
        const existingEdgeKeys = new Set(
          this.edges.map(e => `${e.from_node_id}|${e.to_node_id}|${e.type}`)
        )
        for (const e of res.edges) {
          const key = `${e.from_node_id}|${e.to_node_id}|${e.type}`
          if (!existingEdgeKeys.has(key)) {
            existingEdgeKeys.add(key)
            this.edges.push(e)
          }
        }

        this.neighborNodeIds = neighborIds
      } catch (e: any) {
        console.warn('[GraphStore] Failed to load neighbors:', e)
      }
    },

    // ── Semantic search ──

    async semanticSearch(query: string) {
      this.searchLoading = true
      try {
        this.searchResults = await api.kbSearch(query, 10)
        console.log('[GraphStore] kbSearch results:', JSON.stringify(this.searchResults))
        // 构建搜索树 + 自动展开 Level 0 根节点
        const tree = buildSearchTree(this.searchResults)
        this.searchTree = tree
        // 自动展开所有 Level 0 节点
        this.expandedChunkIds = new Set(tree.filter(n => (n.result.level ?? 0) === 0).map(n => n.result.id))
      } catch (e: any) {
        console.warn('[GraphStore] KB search failed:', e)
        this.searchResults = []
        this.searchTree = []
      } finally {
        this.searchLoading = false
      }
    },

    clearSearch() {
      this.searchResults = []
      this.searchTree = []
      this.expandedChunkIds.clear()
      this.searchLoading = false
    },

    /** 切换搜索树节点的展开/折叠状态 */
    toggleTreeNode(chunkId: string) {
      if (this.expandedChunkIds.has(chunkId)) {
        this.expandedChunkIds.delete(chunkId)
      } else {
        this.expandedChunkIds.add(chunkId)
      }
      // 触发响应式更新
      this.expandedChunkIds = new Set(this.expandedChunkIds)
    },

    /** 递归判断节点是否已展开 */
    isTreeNodeExpanded(chunkId: string): boolean {
      return this.expandedChunkIds.has(chunkId)
    },

    // ── Node detail drawer ──

    /** Load chunks associated with a node.
     *
     * Priority:
     *  1. If the node has `source_chunk_ids`, match chunks by their ID directly.
     *  2. Otherwise, fall back to filtering chunks by `entity_ids` (for Entity nodes).
     */
    async loadNodeChunks(entityId: string) {
      this.detailLoading = true
      this.detailChunks = []
      try {
        // 1. Prefer source_chunk_ids from the node (for Document/Region nodes)
        const node = this.selectedNode
        const sourceChunkIds =
          (node?.properties as Record<string, any>)?.source_chunk_ids as string[] | undefined
        if (sourceChunkIds && sourceChunkIds.length > 0) {
          const result = await api.listKBChunksAsSearchResults(1, 100)
          const filtered = result.chunks.filter(c => sourceChunkIds.includes(c.id))
          this.detailChunks = filtered
          return
        }

        // 2. Fallback: filter by entity_ids (for Entity nodes)
        const result = await api.listKBChunksAsSearchResults(1, 100)
        const filtered = result.chunks.filter(c =>
          c.entity_ids?.includes(entityId)
        )
        this.detailChunks = filtered
      } catch (e: any) {
        console.warn('[GraphStore] Failed to load node chunks:', e)
        this.detailChunks = []
      } finally {
        this.detailLoading = false
      }
    },

    // ── Default chunk list ──

    async loadDefaultChunks(page = 1) {
      const pageSize = 20
      console.log('[GraphStore] loadDefaultChunks called, page=', page, 'pageSize=', pageSize)
      this.defaultChunksLoading = true
      this.chunkPage = page
      try {
        // Build default filters: level=0 + source_file prefix matches project dir
        const conn = useConnectionStore()
        const filters: api.FilterCondition[] = [
          { key: 'level', type: 'exact', value: 0 },
        ]
        if (conn.currentProjectDir) {
          filters.push({ key: 'source_file', type: 'prefix', value: conn.currentProjectDir })
        }

        // 调用 kb.chunks RPC 获取原始数据并打印完整结果
        const rawResult = await api.listKBChunks(page, pageSize, filters)
        console.log('══════════════════════════════════════════')
        console.log('[GraphStore] kb.chunks 原始返回:')
        console.log('  total:     ', rawResult.total)
        console.log('  page:      ', rawResult.page)
        console.log('  page_size: ', rawResult.page_size)
        console.log('  has_more:  ', rawResult.has_more)
        console.log('  chunks数:  ', rawResult.chunks?.length ?? 0)
        console.log('══════════════════════════════════════════')

        const chunks = rawResult.chunks ?? []
        if (chunks.length > 0) {
          console.log('[GraphStore] --- 前3条 chunk 详情 ---')
          for (let i = 0; i < Math.min(3, chunks.length); i++) {
            const c = chunks[i]
            console.log(`  chunk[${i}]: id=${c.id}, doc_id=${c.doc_id}, content_len=${c.content?.length ?? 0}`)
            console.log(`    metadata=`, JSON.stringify(c.metadata))
            console.log(`    chunk_meta=`, JSON.stringify(c.chunk_meta))
          }
          if (chunks.length > 3) {
            console.log(`  ... 还有 ${chunks.length - 3} 条`)
          }
        } else {
          console.warn('[GraphStore] ⚠️ kb.chunks 返回空! chunks 数组为空或 undefined')
        }

        // 转换为 SearchResult 格式并赋值
        const result = await api.listKBChunksAsSearchResults(page, pageSize, filters)
        this.defaultChunks = result.chunks
        this.chunkTotal = result.total
        console.log('[GraphStore] ✅ defaultChunks 已赋值: count=', this.defaultChunks.length, 'total=', this.chunkTotal)
      } catch (e: any) {
        console.error('[GraphStore] ❌ loadDefaultChunks 异常:', e.message || e)
        console.error('[GraphStack]', e.stack)
        this.defaultChunks = []
        this.chunkTotal = 0
      } finally {
        this.defaultChunksLoading = false
      }
    },

    // ── Multi-hop graph ──

    async loadMultiHop(nodeId: string, depth = 3) {
      this.multiHopLoading = true
      this.multiHopRootId = nodeId
      try {
        this.multiHopResult = await api.loadMultiHop(nodeId, depth)
        console.log('[GraphStore] multiHopResult nodes:', this.multiHopResult.nodes.length, 'edges:', this.multiHopResult.edges.length)
      } catch (e: any) {
        console.warn('[GraphStore] Multi-hop load failed:', e)
        this.multiHopResult = null
      } finally {
        this.multiHopLoading = false
      }
    },

    clearMultiHop() {
      this.multiHopResult = null
      this.multiHopRootId = null
    },

    // ── File index control ──

    async refreshFilewatchStatus() {
      try {
        this.filewatchStatus = await api.filewatchStatus()
        console.log('[GraphStore] filewatchStatus:', JSON.stringify(this.filewatchStatus))
      } catch (e: any) {
        console.warn('[GraphStore] Failed to get filewatch status:', e)
        this.filewatchStatus = null
      }
    },

    async startFilewatch() {
      try {
        const res = await api.filewatchStart()
        if (res.status === 'started' || res.status === 'already_running') {
          await this.refreshFilewatchStatus()
        }
      } catch (e: any) {
        console.warn('[GraphStore] Failed to start filewatch:', e)
      }
    },

    async stopFilewatch() {
      try {
        const res = await api.filewatchStop()
        if (res.status === 'stopped' || res.status === 'already_stopped') {
          await this.refreshFilewatchStatus()
        }
      } catch (e: any) {
        console.warn('[GraphStore] Failed to stop filewatch:', e)
      }
    },

    async refreshFileStates(projectDir: string) {
      this.fileStatesLoading = true
      try {
        // kb.stats provides file indexing progress from GraphIndexer
        const conn = useConnectionStore()
        const stats = await conn.fetchKBStats(projectDir)
        this.fileStates = {
          states: [],
          counts: {
            indexed: stats.indexed_files,
            changed: 0,
            new: 0,
            removed: 0,
            skipped: 0,
            total: stats.total_files,
          },
        }
      } catch (e: any) {
        // Fallback: memory.file_states (heavier)
        try {
          this.fileStates = await api.scanFileStates(projectDir)
        } catch {
          console.warn('[GraphStore] Failed to load file states:', e)
          this.fileStates = null
        }
      } finally {
        this.fileStatesLoading = false
      }
    },

    // ── File reader panel ──

    openFile(filePath: string) {
      this.activeFilePath = filePath
      // Open as tab
      const fileName = filePath.split('/').pop() || filePath
      const tabId = `file:${filePath}`
      const existing = this.mainTabs.find(t => t.id === tabId)
      if (!existing) {
        this.mainTabs.push({ id: tabId, type: 'file', label: fileName, filePath, closable: true })
      }
      this.activeMainTabId = tabId
    },

    closeFileViewer() {
      this.activeFilePath = null
    },

    // ── Main viewport tabs ──

    /** Open an entity list tab for a given label (does NOT switch to it) */
    openEntityTab(labelType: string, labelCN: string) {
      const tabId = `entity:${labelType}`
      const existing = this.mainTabs.find(t => t.id === tabId)
      if (!existing) {
        this.mainTabs.push({
          id: tabId,
          type: 'entity',
          label: labelCN,
          labelType,
          closable: true,
        })
      }
    },

    closeMainTab(tabId: string) {
      const idx = this.mainTabs.findIndex(t => t.id === tabId)
      if (idx < 0 || !this.mainTabs[idx].closable) return
      this.mainTabs.splice(idx, 1)
      // Switch to adjacent tab if closing active one
      if (this.activeMainTabId === tabId) {
        const newIdx = Math.min(idx, this.mainTabs.length - 1)
        this.activeMainTabId = this.mainTabs[newIdx]?.id || 'graph'
      }
    },
  },
})
