import { defineStore } from 'pinia'
import * as api from '../services/graphApi'

// Re-export types for convenience
export type { GraphNode, GraphEdge, LabelCount, RelationTypeCount, DocChunk, SearchResult, FileStateResult, FilewatchStatus, MultiHopResult, HopNode, HopEdge } from '../services/graphApi'

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

  // Default chunk list (paginated from indexer, 20 per page)
  defaultChunks: api.SearchResult[]
  defaultChunksLoading: boolean
  chunkPage: number
  chunkTotal: number

  // File reader panel
  activeFilePath: string | null

  // Multi-hop graph
  multiHopResult: api.MultiHopResult | null
  multiHopLoading: boolean
  multiHopRootId: string | null

  // Chunk node highlighting & filtering
  highlightedNodeIds: Set<string>
  chunkNodeIds: Set<string>

  // Node detail drawer chunks
  detailChunks: api.SearchResult[]
  detailLoading: boolean

  // Show all nodes (bypass entity label filter, include isolated nodes)
  showAllNodes: boolean

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
    defaultChunks: [],
    defaultChunksLoading: false,
    chunkPage: 1,
    chunkTotal: 0,
    activeFilePath: null,
    multiHopResult: null,
      multiHopLoading: false,
      multiHopRootId: null,
      highlightedNodeIds: new Set(),
      chunkNodeIds: new Set(),
      detailChunks: [],
      detailLoading: false,
      showAllNodes: false,
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

      if (state.showAllNodes) {
        // Show all nodes — skip label filter & isolated-node exclusion
      } else {
        if (state.selectedLabels.length > 0) {
          result = result.filter(n =>
            n.labels.some(l => state.selectedLabels.includes(l))
          )
        }
        // Exclude nodes that have no edges to other nodes in this filtered set
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
      this.defaultChunks = []
      this.detailChunks = []
      this.showAllNodes = false
      this.multiHopResult = null
      this.multiHopRootId = null
      this.filewatchStatus = null
      this.activeFilePath = null
      this.fileStates = null
      this.error = null
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
      } catch (e: any) {
        this.error = e.message || String(e)
      } finally {
        this.loading = false
      }
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
        this.searchResults = await api.semanticSearch(query, 5)
        console.log('[GraphStore] searchResults:', JSON.stringify(this.searchResults))
      } catch (e: any) {
        console.warn('[GraphStore] Semantic search failed:', e)
        this.searchResults = []
      } finally {
        this.searchLoading = false
      }
    },

    clearSearch() {
      this.searchResults = []
      this.searchLoading = false
    },

    // ── Node detail drawer ──

    /** Load chunks associated with an entity (node) by filtering all memory chunks by entity_id */
    async loadNodeChunks(entityId: string) {
      this.detailLoading = true
      this.detailChunks = []
      try {
        // Load up to 100 chunks to find matches for this entity
        const result = await api.listMemoryChunks(1, 100)
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
      this.defaultChunksLoading = true
      this.chunkPage = page
      try {
        // 只在第1页时打印调试日志
        if (page === 1) {
          const rawResult = await api.listMemoryChunksRaw(page, pageSize)
          console.log('========================================')
          console.log('[GraphStore] === 全量分片原始数据 ===')
          console.log('[GraphStore] 总数:', rawResult.total, '| 本次返回:', rawResult.chunks?.length ?? 0)
          console.log('========================================')
          const chunks = rawResult.chunks ?? []
          for (let i = 0; i < chunks.length; i++) {
            const c = chunks[i]
            console.log(`\n--- chunk[${i}] ---`)
            console.log('  id:       ', JSON.stringify(c.id))
            console.log('  doc_id:   ', JSON.stringify(c.doc_id))
            console.log('  parent_id:', JSON.stringify(c.parent_id))
            console.log('  mime_type:', JSON.stringify(c.mime_type))
            console.log('  content:  ', JSON.stringify(c.content))
            console.log('  metadata: ', JSON.stringify(c.metadata, null, 2))
            console.log('  chunk_meta:', JSON.stringify(c.chunk_meta, null, 2))
          }
          console.log('\n========================================')
          console.log('[GraphStore] === 分片打印完毕 ===')
          console.log('========================================')
        }

        const result = await api.listMemoryChunks(page, pageSize)
        this.defaultChunks = result.chunks
        this.chunkTotal = result.total
      } catch (e: any) {
        console.warn('[GraphStore] Failed to load default chunks:', e)
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
        // memory.stats is lighter and proven to work (used by MemoryBrowser)
        const conn = useConnectionStore()
        const stats = await conn.fetchMemoryStats(projectDir)
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
    },

    closeFileViewer() {
      this.activeFilePath = null
    },
  },
})
