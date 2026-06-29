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
  parent_id?: string
  mime_type?: string
  content: string
  metadata?: Record<string, any>
  chunk_meta?: {
    index: number
    start_pos: number
    end_pos: number
    heading_level: number
    heading_path?: string[]
  }
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
  // 以下字段从 metadata 中提取（分片列表用）
  summary?: string
  source_file?: string
  entity_ids?: string[]
  // ── 分层 RAG 字段 ──
  level?: number          // 语义层级深度（0=文档摘要, 1=章/类, 2=节/方法...）
  parent_id?: string      // 父 chunk 的 SHA
  chunk_type?: string     // root | segment | region
}

/** Metadata filter condition for kb.chunks RPC */
export interface FilterCondition {
  key: string
  type: 'exact' | 'prefix'
  value: any
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

export interface FailedFileRecord {
  path: string
  error: string
  timestamp: number
  elapsed_ms: number
}

export interface CompletedFileRecord {
  path: string
  chunks: number
  elapsed_ms: number
  timestamp: number
}

export interface DirIndexState {
  dir: string
  state: string       // pending | indexing | completed | failed
  total_files: number
  indexed_files: number
  error?: string
  started_at: number
  completed_at?: number
  entities_created?: number
  rels_created?: number
  total_elapsed_ms?: number
  failed_files?: FailedFileRecord[]
  completed_files?: CompletedFileRecord[]
  ignored_files?: string[]
}

export interface FilewatchStatus {
  available: boolean
  running: boolean
  watched: string[]
  cache_dir?: string
  index_state?: Record<string, DirIndexState>
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

/** List all nodes (bypasses broken Cypher functions like labels(), properties()) */
export async function listAllNodes(): Promise<GraphNode[]> {
  return call('graph.list_nodes')
}

/** List all edges (bypasses broken Cypher functions like type(), startNode(), endNode()) */
export async function listAllEdges(): Promise<GraphEdge[]> {
  return call('graph.list_edges')
}

/** Paginated chunk list (for document discovery) */
export async function listChunks(page = 1, pageSize = 200): Promise<ChunksPage> {
  return call('memory.chunks', { page, page_size: pageSize, doc_id: 'all' })
}

/** Paginated chunk list from knowledge base (GraphIndexer) */
export async function listKBChunks(page = 1, pageSize = 200, filters?: FilterCondition[]): Promise<ChunksPage> {
  return call('kb.chunks', { page, page_size: pageSize, filters })
}

/** 从服务端 Schema 定义获取每个实体类型的合法属性 key 列表 */
export async function getSchemaProperties(): Promise<{ schemas: Record<string, string[]> }> {
  return call('kb.schema_properties', {})
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
    totalNodes: nodeRes?.rows?.[0]?.cnt ?? 0,
    totalEdges: edgeRes?.rows?.[0]?.cnt ?? 0,
  }
}

/** Node distribution by label */
export async function getLabelDistribution(): Promise<LabelCount[]> {
  const res = await graphQuery(
    'MATCH (n) RETURN labels(n)[0] as label, count(*) as cnt ORDER BY cnt DESC'
  )
  return (res?.rows ?? []).map((row: any) => ({ label: row.label || 'Unknown', count: row.cnt }))
}

/** Edge distribution by relation type */
export async function getRelationTypeDistribution(): Promise<RelationTypeCount[]> {
  const res = await graphQuery(
    'MATCH ()-[r]->() RETURN type(r) as t, count(*) as cnt ORDER BY cnt DESC'
  )
  return (res?.rows ?? []).map((row: any) => ({ type: row.t, count: row.cnt }))
}

/** Node distribution by knowledge level */
export async function getLevelDistribution(): Promise<LabelCount[]> {
  const res = await graphQuery(
    "MATCH (n) WHERE n.level IS NOT NULL RETURN n.level as lvl, count(*) as cnt ORDER BY cnt DESC"
  )
  return (res?.rows ?? []).map((row: any) => ({ label: row.lvl || 'unknown', count: row.cnt }))
}

/** Discover unique document IDs from knowledge base chunks (iterates pages until exhausted) */
export async function discoverDocs(page = 1, pageSize = 500): Promise<string[]> {
  const ids = new Set<string>()
  let currentPage = page
  let hasMore = true
  const MAX_PAGES = 100 // Safety limit to prevent infinite loops

  while (hasMore && currentPage - page < MAX_PAGES) {
    try {
      const res = await listKBChunks(currentPage, pageSize)
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

/** Semantic search across the knowledge base via GraphIndexer (kb.search) */
export async function kbSearch(query: string, limit = 10, minScore = 0): Promise<SearchResult[]> {
  const records = await call<any[]>('kb.search', { query, limit, min_score: minScore })
  console.log('[graphApi] kbSearch raw:', JSON.stringify(records, null, 2))
  return (records ?? []).map((r: any) => {
    const meta = r.metadata || {}
    return {
      id: r.id || '',
      title: meta.title || (meta.source_file as string) || '',
      content: r.content || '',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      score: r.score || 0,
      doc_id: r.doc_id || r.id?.split('_')[0] || '',
      source: (meta.source_file as string) || '',
      summary: meta.summary || '',
      source_file: meta.source_file || '',
      entity_ids: Array.isArray(meta.entity_ids) ? meta.entity_ids : (meta.entity_names as string[] || []),
      // ── 分层 RAG ──
      level: typeof meta.level === 'number' ? meta.level : undefined,
      parent_id: typeof meta.parent_id === 'string' && meta.parent_id ? meta.parent_id : undefined,
      chunk_type: typeof meta.chunk_type === 'string' ? meta.chunk_type : undefined,
    }
  })
}

/** Semantic search across memory (memory.query) */
export async function semanticSearch(query: string, limit = 5, minScore = 0): Promise<SearchResult[]> {
  const records = await call<any[]>('memory.query', { query, limit, min_score: minScore })
  console.log('[graphApi] semanticSearch raw:', JSON.stringify(records, null, 2))
  return (records ?? []).map((r: any) => {
    const meta = r.metadata || r.chunk_meta || {}
    return {
      id: r.id || '',
      title: r.title || '',
      content: r.content || '',
      tags: Array.isArray(meta.tags) ? meta.tags : (r.tags || []),
      score: r.score || 0,
      doc_id: r.doc_id || r.title || r.id?.split('_')[0] || '',
      source: (Array.isArray(r.tags) ? r.tags.find((t: string) => t.startsWith('source:'))?.slice(7) : '') || r.title || '',
      summary: meta.summary || '',
      source_file: meta.source_file || '',
      entity_ids: Array.isArray(meta.entity_ids) ? meta.entity_ids : [],
    }
  })
}

/** List chunks from the memory indexer (memory.chunks) — returns raw RPC data */
export async function listMemoryChunksRaw(page = 1, pageSize = 10): Promise<any> {
  const result = await call<any>('memory.chunks', { page, page_size: pageSize })
  return result
}

/** List chunks from the memory indexer (memory.chunks) */
export async function listMemoryChunks(page = 1, pageSize = 10): Promise<{
  chunks: SearchResult[]
  total: number
  has_more: boolean
}> {
  const result = await call<any>('memory.chunks', { page, page_size: pageSize })
  const chunks: SearchResult[] = (result.chunks ?? []).map((c: any) => {
    const meta = c.metadata || {}
    const tags: string[] = Array.isArray(meta.tags) ? meta.tags : []
    return {
      id: c.id || '',
      title: '',
      content: c.content || '',
      tags,
      score: 0,
      doc_id: c.doc_id || '',
      source: meta.source_file || c.doc_id || '',
      summary: meta.summary || '',
      source_file: meta.source_file || '',
      entity_ids: Array.isArray(meta.entity_ids) ? meta.entity_ids : [],
    }
  })
  return { chunks, total: result.total ?? 0, has_more: result.has_more ?? false }
}

/** List chunks from the knowledge base GraphIndexer (kb.chunks) — returns SearchResult[] */
export async function listKBChunksAsSearchResults(page = 1, pageSize = 20, filters?: FilterCondition[]): Promise<{
  chunks: SearchResult[]
  total: number
  has_more: boolean
}> {
  const result = await call<any>('kb.chunks', { page, page_size: pageSize, filters })
  const chunks: SearchResult[] = (result.chunks ?? []).map((c: any) => {
    const meta = c.metadata || {}
    const tags: string[] = Array.isArray(meta.tags) ? meta.tags : []
    const entityIds: string[] = Array.isArray(meta.entity_ids) ? meta.entity_ids : []
    return {
      id: c.id || '',
      title: meta.title || '',
      content: c.content || '',
      tags,
      score: 0,
      doc_id: c.doc_id || '',
      parent_id: c.parent_id || meta.parent_id || '',
      source: meta.source_file || c.doc_id || '',
      summary: meta.summary || '',
      source_file: meta.source_file || '',
      entity_ids: entityIds,
      level: typeof meta.level === 'number' ? meta.level : undefined,
      chunk_type: meta.chunk_type || '',
    }
  })
  return { chunks, total: result.total ?? 0, has_more: result.has_more ?? false }
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

/** Remove a directory from the filewatch watchlist */
export async function filewatchRemove(dir: string): Promise<{ status: string; dir: string }> {
  return call('filewatch.remove', { dir })
}

/** Retry indexing failed files. Returns { status, indexed, errors }. */
export async function filewatchRetryFailed(dir: string, files: string[]): Promise<{ status: string; indexed?: number; errors?: number }> {
  return call('filewatch.retry-failed', { dir, files })
}

/** Mark failed files as ignored (hides them from the UI, won't retry). */
export async function filewatchIgnoreFailed(dir: string, files: string[]): Promise<{ status: string }> {
  return call('filewatch.ignore-failed', { dir, files })
}

/** Scan project directory for file states (read-only, no indexing) */
export async function scanFileStates(projectDir: string): Promise<FileStateResult> {
  return call('kb.file_states', { project_dir: projectDir })
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

// ── File content reading ──

/** Read a file from local filesystem via daemon */
export async function readFileContent(path: string): Promise<string> {
  const result = await call<{ content: string }>('fs.read', { path })
  return result.content
}

/** Write content to a file on local filesystem via daemon */
export async function writeFileContent(path: string, content: string): Promise<void> {
  await call('fs.write', { path, content })
}

/** Reveal a file in the native file manager (Finder/Explorer) */
export async function revealInFileManager(path: string): Promise<void> {
  await call('fs.reveal', { path })
}
