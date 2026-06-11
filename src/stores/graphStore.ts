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

  // Multi-hop graph
  multiHopResult: api.MultiHopResult | null
  multiHopLoading: boolean
  multiHopRootId: string | null

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
    multiHopResult: null,
    multiHopLoading: false,
    multiHopRootId: null,
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
        result = result.filter(n =>
          n.labels.some(l => state.selectedLabels.includes(l))
        )
      }

      if (state.searchQuery.trim()) {
        const q = state.searchQuery.toLowerCase()
        result = result.filter(n =>
          (n.properties.name as string)?.toLowerCase().includes(q)
        )
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
      this.multiHopResult = null
      this.multiHopRootId = null
      this.filewatchStatus = null
      this.fileStates = null
      this.error = null
    },

    selectNode(nodeId: string | null) {
      this.selectedNodeId = nodeId
      this.neighborNodeIds.clear()
    },

    setActiveTab(tab: 'documents' | 'entities' | 'stats') {
      this.activeTab = tab
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
      // Declare outside try so finally block can access them (avoids TDZ error)
      let nodesRes: PromiseSettledResult<any>, edgesRes: PromiseSettledResult<any>
      let stats: PromiseSettledResult<any>
      let labelDist: PromiseSettledResult<any>, relDist: PromiseSettledResult<any>
      let levelDist: PromiseSettledResult<any>, docs: PromiseSettledResult<any>
      try {
        const results = await Promise.allSettled([
          api.graphQuery('MATCH (n) RETURN n.id as id, labels(n) as labels, properties(n) as props LIMIT 2000'),
          api.graphQuery('MATCH ()-[r]->() RETURN id(r) as id, startNode(r).id as from_id, endNode(r).id as to_id, type(r) as type, properties(r) as props LIMIT 5000'),
          api.getGraphStats(),
          api.getLabelDistribution(),
          api.getRelationTypeDistribution(),
          api.getLevelDistribution(),
          api.discoverDocs(),
        ])
        ;[nodesRes, edgesRes, stats, labelDist, relDist, levelDist, docs] = results

        // Parse nodes
        if (nodesRes.status === 'fulfilled' && nodesRes.value?.rows) {
          this.nodes = nodesRes.value.rows.map((row: any[]) => ({
            id: row[0],
            labels: row[1] || [],
            properties: row[2] || {},
          }))
        }

        // Parse edges
        if (edgesRes.status === 'fulfilled' && edgesRes.value?.rows) {
          this.edges = edgesRes.value.rows.map((row: any[]) => ({
            id: row[0],
            from_node_id: row[1],
            to_node_id: row[2],
            type: row[3],
            properties: row[4] || {},
          }))
        }

        if (stats.status === 'fulfilled') this.stats = stats.value
        if (labelDist.status === 'fulfilled') this.labelDistribution = labelDist.value
        if (relDist.status === 'fulfilled') this.relationDistribution = relDist.value
        if (levelDist.status === 'fulfilled') this.levelDistribution = levelDist.value
        if (docs.status === 'fulfilled') this.docs = docs.value
      } catch (e: any) {
        this.error = e.message || String(e)
      } finally {
        this.loading = false
        // Warn if data was truncated
        if (stats.status === 'fulfilled' && nodesRes.status === 'fulfilled') {
          const total = stats.value?.totalNodes ?? 0
          const loaded = this.nodes.length
          if (total > loaded && loaded > 0) {
            console.warn(`[GraphStore] Nodes truncated: showing ${loaded} of ${total}`)
          }
        }
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
      } catch (e: any) {
        console.warn('[GraphStore] Semantic search failed:', e)
        this.searchResults = []
      } finally {
        this.searchLoading = false
      }
    },

    clearSearch() {
      this.searchResults = []
    },

    // ── Multi-hop graph ──

    async loadMultiHop(nodeId: string, depth = 3) {
      this.multiHopLoading = true
      this.multiHopRootId = nodeId
      try {
        this.multiHopResult = await api.loadMultiHop(nodeId, depth)
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
        this.fileStates = await api.scanFileStates(projectDir)
      } catch (e: any) {
        console.warn('[GraphStore] Failed to scan file states:', e)
        this.fileStates = null
      } finally {
        this.fileStatesLoading = false
      }
    },
  },
})
