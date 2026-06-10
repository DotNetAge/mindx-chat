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
