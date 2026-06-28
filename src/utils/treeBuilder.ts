/**
 * treeBuilder.ts — 将扁平 SearchResult[] 构建为层级树
 *
 * 核心逻辑：
 * 1. 按 doc_id 分组 → 文档内建立 parent_id 树
 * 2. 父 chunk 不在搜索结果中的子片 → 提升到同级（显示虚拟路径）
 * 3. 同一文档内按 level 排序（0→1→2...）
 * 4. chunk_type === "region" 独立显示
 */

import type { SearchResult } from '../services/graphApi'

// ── 树节点类型 ──

export interface TreeNode {
  /** 原始 SearchResult */
  result: SearchResult
  /** 直属子节点 */
  children: TreeNode[]
  /** 是否有子节点（在搜索结果中） */
  hasChildren: boolean
  /** 展开状态（仅 UI 控制） */
  expanded: boolean
  /** 是否为“路径补齐”的虚拟节点（父 chunk 不在搜索命中内） */
  ghost: boolean
}

// ── 构建入口 ──

export function buildSearchTree(results: SearchResult[]): TreeNode[] {
  if (results.length === 0) return []

  // 按 id 建索引
  const byId = new Map<string, SearchResult>()
  for (const r of results) {
    if (r.id) byId.set(r.id, r)
  }

  // 建立 parent_id → children 映射
  const parentToChildren = new Map<string, SearchResult[]>()
  const orphans: SearchResult[] = []
  const regionItems: SearchResult[] = []

  for (const r of results) {
    if (r.chunk_type === 'region') {
      regionItems.push(r)
      continue
    }
    // 有 parent_id 且 parent 也在搜索结果中 → 挂到 parent 下
    if (r.parent_id && byId.has(r.parent_id)) {
      const list = parentToChildren.get(r.parent_id) ?? []
      list.push(r)
      parentToChildren.set(r.parent_id, list)
    } else {
      // 无 parent / parent 不在结果中 → 作为顶层（孤儿）
      orphans.push(r)
    }
  }

  // 对每组的 children 按 level 排序
  for (const [, children] of parentToChildren) {
    children.sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
  }

  // 递归构建 TreeNode
  function toNode(r: SearchResult): TreeNode {
    const children = (parentToChildren.get(r.id) ?? []).map(toNode)
    return {
      result: r,
      children,
      hasChildren: children.length > 0,
      expanded: false,
      ghost: false,
    }
  }

  // 孤儿按 doc_id 分组后再排序
  const byDoc = new Map<string, SearchResult[]>()
  for (const o of orphans) {
    const docKey = o.doc_id || o.source_file || '_no_doc'
    const list = byDoc.get(docKey) ?? []
    list.push(o)
    byDoc.set(docKey, list)
  }

  const tree: TreeNode[] = []
  // 先按 doc 分组显示，child 内再 tree
  for (const [, items] of byDoc) {
    items.sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    for (const item of items) {
      tree.push(toNode(item))
    }
  }

  // Region 条目放在最前面（作为目录上下文）
  const regionNodes = regionItems.map(r => ({
    result: r,
    children: [] as TreeNode[],
    hasChildren: false,
    expanded: false,
    ghost: false,
  }))

  return [...regionNodes, ...tree]
}

// ── 工具 ──

/** 获取 chunk_type 对应的图标标签 */
export function chunkTypeLabel(type?: string): string {
  switch (type) {
    case 'region':  return '📁'
    case 'root':    return '📄'
    case 'segment': return '📑'
    default:        return '📄'
  }
}

/** 获取 level 对应的 CSS class */
export function levelClass(level?: number): string {
  if (level === undefined || level === null) return 'lvl-unknown'
  return `lvl-${level}`
}
