<script lang="ts">
export default { name: 'TreeSearchPanel' }
</script>

<script setup lang="ts">
import { useGraphStore, type TreeNode } from '../stores/graphStore'
import { chunkTypeLabel } from '../utils/treeBuilder'

const store = useGraphStore()

defineProps<{
  tree: TreeNode[]
  loading: boolean
}>()

function scoreClass(score: number): string {
  if (score > 0.7) return 'score-high'
  if (score > 0.4) return 'score-mid'
  return 'score-low'
}

function handleNodeClick(nodeId: string) {
  // 选中图节点（如果有对应的 graph node）
  if (store.nodes.find(n => n.id === nodeId)) {
    store.selectNode(nodeId)
  }
}

function handleEntityClick(entityIds: string[]) {
  const current = [...store.chunkNodeIds].sort().join(',')
  const next = [...entityIds].sort().join(',')
  if (current === next) {
    store.clearHighlightedNodes()
  } else {
    store.selectChunkNodes(entityIds)
  }
}
</script>

<template>
  <div class="tree-search-panel">
    <!-- Loading -->
    <div v-if="loading" class="search-skeleton">
      <div v-for="i in 3" :key="i" class="skeleton-item"></div>
    </div>

    <!-- No results -->
    <div v-else-if="tree.length === 0" class="tree-empty">
      无匹配结果
    </div>

    <!-- Tree -->
    <div v-else class="tree-container">
      <template v-for="node in tree" :key="node.result.id">
        <!-- ── 单层树节点 ── -->
        <div class="tree-node-row" :class="{ ghost: node.ghost }">
          <!-- [+]/[−] -->
          <button
            v-if="node.hasChildren"
            class="expand-btn"
            :class="{ expanded: store.expandedChunkIds.has(node.result.id) }"
            @click="store.toggleTreeNode(node.result.id)"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M4 2v2H2v2h2v2h2V6h2V4H6V2z" />
            </svg>
          </button>
          <span v-else class="expand-spacer"></span>

          <!-- Level 徽标 -->
          <span class="lvl-badge" :class="'lvl-' + (node.result.level ?? 0)">
            L{{ node.result.level ?? 0 }}
          </span>

          <!-- 类型图标 -->
          <span class="type-icon">{{ chunkTypeLabel(node.result.chunk_type) }}</span>

          <!-- 标题（summary） -->
          <span
            class="node-title"
            :title="node.result.summary || node.result.content?.slice(0, 200)"
            @click="handleNodeClick(node.result.id)"
          >
            {{ node.result.summary || node.result.content?.slice(0, 80) || node.result.title }}
          </span>

          <!-- 置信度 -->
          <span class="score-badge" :class="scoreClass(node.result.score)">
            {{ (node.result.score * 100).toFixed(0) }}%
          </span>
        </div>

      <!-- ── 子节点（展开时显示） ── -->
      <template v-if="store.expandedChunkIds.has(node.result.id) && node.children.length > 0">
        <div v-for="child in node.children" :key="child.result.id">
          <div
            class="tree-node-row child-row"
            @click="handleNodeClick(child.result.id)"
          >
            <!-- 缩进引导线 -->
            <span class="indent-guide">
              <svg width="16" height="20" viewBox="0 0 16 20">
                <line x1="8" y1="0" x2="8" y2="20" stroke="rgba(255,255,255,.08)" stroke-width="1" />
              </svg>
            </span>

            <!-- [+]/[−] for child -->
            <button
              v-if="child.hasChildren"
              class="expand-btn"
              :class="{ expanded: store.expandedChunkIds.has(child.result.id) }"
              @click.stop="store.toggleTreeNode(child.result.id)"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M4 2v2H2v2h2v2h2V6h2V4H6V2z" />
              </svg>
            </button>
            <span v-else class="expand-spacer"></span>

            <!-- Level 徽标 -->
            <span class="lvl-badge" :class="'lvl-' + (child.result.level ?? 0)">
              L{{ child.result.level ?? 0 }}
            </span>

            <!-- 类型图标 -->
            <span class="type-icon">{{ chunkTypeLabel(child.result.chunk_type) }}</span>

            <!-- 标题 -->
            <span class="node-title" :title="child.result.summary || child.result.content?.slice(0, 200)">
              {{ child.result.summary || child.result.content?.slice(0, 60) || child.result.title }}
            </span>

            <!-- 置信度 -->
            <span class="score-badge" :class="scoreClass(child.result.score)">
              {{ (child.result.score * 100).toFixed(0) }}%
            </span>

            <!-- 关联实体数 -->
            <span v-if="child.result.entity_ids?.length" class="entity-chip" @click.stop="handleEntityClick(child.result.entity_ids ?? [])">
              {{ child.result.entity_ids.length }} 节点
            </span>
          </div>
        </div>
      </template>
    </template>
    </div>
  </div>
</template>

<style scoped>
.tree-search-panel {
  padding: 4px 0;
}

/* ── Empty state ── */
.tree-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Skeleton ── */
.search-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}
.skeleton-item {
  height: 36px;
  background: rgba(255,255,255,.04);
  border-radius: 6px;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: .4; } 50% { opacity: .8; } }

/* ── Tree container ── */
.tree-container {
  display: flex;
  flex-direction: column;
}

/* ── Tree node row ── */
.tree-node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 4px;
  border-radius: 5px;
  cursor: pointer;
  transition: background .1s;
  user-select: none;
}
.tree-node-row:hover {
  background: rgba(139,92,246,.08);
}
.tree-node-row.ghost {
  opacity: .5;
}

.child-row {
  padding-left: 20px !important;
}

/* ── Expand button ── */
.expand-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .12s;
  font-size: 8px;
}
.expand-btn:hover {
  background: rgba(255,255,255,.08);
  color: var(--text-primary);
}
.expand-btn.expanded svg {
  transform: rotate(45deg);
}
.expand-btn svg {
  transition: transform .15s;
}
.expand-spacer {
  width: 16px;
  flex-shrink: 0;
}

/* ── Indent guide ── */
.indent-guide {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  width: 16px;
  height: 20px;
}

/* ── Level badge ── */
.lvl-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  width: 20px;
  height: 15px;
  border-radius: 3px;
  flex-shrink: 0;
  line-height: 1;
}
.lvl-badge.lvl-0 {
  background: rgba(6,182,212,.15);
  color: #06b6d4;
}
.lvl-badge.lvl-1 {
  background: rgba(139,92,246,.15);
  color: #a78bfa;
}
.lvl-badge.lvl-2 {
  background: rgba(16,185,129,.15);
  color: #34d399;
}
.lvl-badge.lvl-3 {
  background: rgba(245,158,11,.15);
  color: #fbbf24;
}
.lvl-badge.lvl-4 {
  background: rgba(100,116,139,.15);
  color: #94a3b8;
}

/* ── Type icon ── */
.type-icon {
  flex-shrink: 0;
  font-size: 12px;
  width: 16px;
  text-align: center;
}

/* ── Title ── */
.node-title {
  flex: 1;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  line-height: 1.3;
}
.tree-node-row:hover .node-title {
  color: var(--text-primary);
}

/* ── Score badge ── */
.score-badge {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1.4;
}
.score-high {
  background: rgba(16,185,129,.12);
  color: #34d399;
}
.score-mid {
  background: rgba(245,158,11,.12);
  color: #fbbf24;
}
.score-low {
  background: rgba(100,116,139,.12);
  color: #94a3b8;
}

/* ── Entity chip ── */
.entity-chip {
  flex-shrink: 0;
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(251,191,36,.12);
  color: #fbbf24;
  cursor: pointer;
  line-height: 1.4;
  transition: background .1s;
}
.entity-chip:hover {
  background: rgba(251,191,36,.2);
}
</style>
