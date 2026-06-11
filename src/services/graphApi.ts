import { getMindXClient } from './websocket'

// ── Graph DB types ──

export interface GraphNode {
  id: string
  labels: string[]
  properties: Record<string, any>
}

export interface GraphEdge {
  id: string
  from_node_id: string
  to_node_id: string
  type: string
  properties: Record<string, any>
}

export interface CypherResult {
  columns?: string[]
  rows?: any[][]
  affected?: number
}

export interface DocChunk {
  id: string
  doc_id: string
  content: string
  metadata?: Record<string, any>
  chunk_meta?: { index: number; position: number; length: number }
}

export interface ChunksPage {
  chunks: DocChunk[]
  page: number
  page_size: number
  total: number
  has_more: boolean
}

export interface DocChunksResult {
  doc_id: string
  chunks: DocChunk[]
  count: number
}

export interface LabelCount {
  label: string
  count: number
}

export interface RelationTypeCount {
  type: string
  count: number
}

// ── Semantic search types ──

export interface SearchResult {
  id: string
  title: string
  content: string
  tags: string[]
  score: number
  /** Extracted doc_id (may come from title or tags) */
  doc_id?: string
  /** Extracted source filename */
  source?: string
}

// ── File index state types ──

export enum FileState {
  Indexed = 'indexed',
  Changed = 'changed',
  New = 'new',
  Removed = 'removed',
  Skipped = 'skipped',
}

export interface FileStateInfo {
  path: string
  state: FileState
  size?: number
  mtime?: number
  cached_size?: number
  cached_mtime?: number
  error?: string
}

export interface FileStateResult {
  states: FileStateInfo[]
  counts: {
    indexed: number
    changed: number
    new: number
    removed: number
    skipped: number
    total: number
  }
}

// ── Filewatch types ──

export interface FilewatchStatus {
  available: boolean
  running: boolean
  watched: string[]
  cache_dir?: string
}

// ── Multi-hop graph types ──

export interface HopNode {
  node: GraphNode
  hopLevel: number
}

export interface HopEdge {
  edge: GraphEdge
  /** Which hop this edge was discovered at */
  fromHop: number
}

export interface MultiHopResult {
  nodes: HopNode[]
  edges: HopEdge[]
}

// ── API methods ──

async function call<T>(method: string, params?: Record<string, any>): Promise<T> {
  const client = getMindXClient()
  if (!client) throw new Error('WebSocket not connected')
  return client.call<T>(method, params)
}

/** Cypher read query */
export async function graphQuery(cypher: string, params?: Record<string, any>): Promise<CypherResult> {
  return call('graph.query', { query: cypher, ...(params ? { params } : {}) })
}

/** Cypher write query */
export async function graphExec(cypher: string, params?: Record<string, any>): Promise<{ affected: number }> {
  return call('graph.exec', { query: cypher, ...(params ? { params } : {}) })
}

/** Get single node by ID */
export async function getNode(id: string): Promise<GraphNode | null> {
  return call('graph.get_node', { id })
}

/** Get neighbors of a node */
export async function getNeighbors(
  id: string,
  depth = 1,
  limit = 50,
  types?: string[]
): Promise<{ neighbors: GraphNode[]; edges: GraphEdge[] }> {
  return call('graph.get_neighbors', { id, depth, limit, types })
}

/** Batch upsert nodes */
export async function upsertNodes(nodes: Partial<GraphNode>[]): Promise<{ created: number; updated: number }> {
  return call('graph.upsert_nodes', { nodes })
}

/** Batch upsert edges */
export async function upsertEdges(edges: Partial<GraphEdge>[]): Promise<{ created: number; updated: number }> {
  return call('graph.upsert_edges', { edges })
}

// ── RAG / Memory methods ──

/** Paginated chunk list (for document discovery) */
export async function listChunks(page = 1, pageSize = 200): Promise<ChunksPage> {
  return call('memory.chunks', { page, page_size: pageSize, doc_id: 'all' })
}

/** Fetch ALL chunks for a single document */
export async function getDocChunks(docId: string): Promise<DocChunksResult> {
  return call('memory.get_chunks', { doc_id: docId })
}

// ── Aggregation helpers (pre-built Cyphers) ──

/** Total node + edge counts */
export async function getGraphStats(): Promise<{
  totalNodes: number
  totalEdges: number
}> {
  const [nodeRes, edgeRes] = await Promise.all([
    graphQuery('MATCH (n) RETURN count(n) as cnt'),
    graphQuery('MATCH ()-[r]->() RETURN count(r) as cnt'),
  ])
  return {
    totalNodes: nodeRes?.rows?.[0]?.[0] ?? 0,
    totalEdges: edgeRes?.rows?.[0]?.[0] ?? 0,
  }
}

/** Node distribution by label */
export async function getLabelDistribution(): Promise<LabelCount[]> {
  const res = await graphQuery(
    'MATCH (n) RETURN labels(n)[0] as label, count(*) as cnt ORDER BY cnt DESC'
  )
  return (res?.rows ?? []).map(([label, cnt]) => ({ label: label || 'Unknown', count: cnt }))
}

/** Edge distribution by relation type */
export async function getRelationTypeDistribution(): Promise<RelationTypeCount[]> {
  const res = await graphQuery(
    'MATCH ()-[r]->() RETURN type(r) as t, count(*) as cnt ORDER BY cnt DESC'
  )
  return (res?.rows ?? []).map(([type, cnt]) => ({ type, count: cnt }))
}

/** Node distribution by knowledge level */
export async function getLevelDistribution(): Promise<LabelCount[]> {
  const res = await graphQuery(
    "MATCH (n) WHERE n.level IS NOT NULL RETURN n.level as lvl, count(*) as cnt ORDER BY cnt DESC"
  )
  return (res?.rows ?? []).map(([level, cnt]) => ({ label: level || 'unknown', count: cnt }))
}

/** Discover unique document IDs from RAG chunks (iterates pages until exhausted) */
export async function discoverDocs(page = 1, pageSize = 500): Promise<string[]> {
  const ids = new Set<string>()
  let currentPage = page
  let hasMore = true
  const MAX_PAGES = 100 // Safety limit to prevent infinite loops

  while (hasMore && currentPage - page < MAX_PAGES) {
    try {
      const res = await listChunks(currentPage, pageSize)
      for (const c of res.chunks ?? []) {
        if (c.doc_id) ids.add(c.doc_id)
      }
      hasMore = res.has_more
      currentPage++
    } catch {
      break // Stop on error rather than failing entirely
    }
  }

  if (hasMore) {
    console.warn(`[graphApi] discoverDocs stopped at page ${MAX_PAGES}, some docs may be missing`)
  }

  return Array.from(ids)
}

// ── Semantic search ──

/** Semantic search across the knowledge base (memory.query) */
export async function semanticSearch(query: string, limit = 5, minScore = 0): Promise<SearchResult[]> {
  const records = await call<any[]>('memory.query', { query, limit, min_score: minScore })
  return (records ?? []).map((r: any) => ({
    id: r.id || '',
    title: r.title || '',
    content: r.content || '',
    tags: r.tags || [],
    score: r.score || 0,
    doc_id: r.title || r.id?.split('_')[0] || '',
    source: (r.tags?.find((t: string) => t.startsWith('source:'))?.slice(7)) || r.title || '',
  }))
}

// ── File index state ──

/** Start filewatch indexing service */
export async function filewatchStart(): Promise<{ status: string }> {
  return call('filewatch.start')
}

/** Stop filewatch indexing service */
export async function filewatchStop(): Promise<{ status: string }> {
  return call('filewatch.stop')
}

/** Get filewatch service status */
export async function filewatchStatus(): Promise<FilewatchStatus> {
  return call('filewatch.status')
}

/** Scan project directory for file states (read-only, no indexing) */
export async function scanFileStates(projectDir: string): Promise<FileStateResult> {
  return call('memory.file_states', { project_dir: projectDir })
}

// ── Multi-hop graph traversal ──

/**
 * Recursively load neighbors up to a given depth.
 * Each node is tagged with its hopLevel so the frontend can style accordingly.
 */
export async function loadMultiHop(
  rootId: string,
  maxDepth = 3,
  limitPerHop = 25
): Promise<MultiHopResult> {
  const allNodes = new Map<string, HopNode>()
  const allEdges = new Map<string, HopEdge>()
  const visited = new Set<string>()

  // BFS by hop depth
  let currentLayer = [rootId]
  visited.add(rootId)
  allNodes.set(rootId, { node: { id: rootId, labels: [], properties: {} }, hopLevel: 0 })

  for (let depth = 1; depth <= maxDepth && currentLayer.length > 0; depth++) {
    const nextLayer: string[] = []

    for (const nodeId of currentLayer) {
      try {
        const res = await getNeighbors(nodeId, 1, limitPerHop)
        for (const n of res.neighbors ?? []) {
          if (!visited.has(n.id)) {
            visited.add(n.id)
            allNodes.set(n.id, { node: n, hopLevel: depth })
            nextLayer.push(n.id)
          }
        }
        for (const e of res.edges ?? []) {
          const eKey = e.id || `${e.from_node_id}-${e.type}-${e.to_node_id}`
          if (!allEdges.has(eKey)) {
            allEdges.set(eKey, { edge: e, fromHop: depth - 1 })
          }
        }
      } catch {
        // Skip nodes that error
      }
    }

    currentLayer = nextLayer
  }

  return {
    nodes: Array.from(allNodes.values()),
    edges: Array.from(allEdges.values()),
  }
}
