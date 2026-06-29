<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { RelationGraph } from 'relation-graph/vue3'
import type { RGJsonData } from 'relation-graph/vue3'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '../stores/graphStore'
import { getChineseLabel, getEntityColor } from '../types/entityCategories'

const { t } = useI18n()
const store = useGraphStore()
const graphRef = ref<any>(null)
let renderVersion = 0 // Version guard against stale setJsonData races

const props = defineProps<{
  onNodeClick?: (nodeId: string) => void
}>()

// ── 检查节点是否可展开（有出边） ──
const expandableNodeIds = computed(() => {
  const ids = new Set<string>()
  for (const e of store.edges) {
    ids.add(e.from_node_id)
  }
  return ids
})

// ── Graph data ──────────────────────────────────────────────────────────
const graphData = computed<RGJsonData>(() => {
  const multiHopNodes = store.multiHopResult
    ? new Map(store.multiHopResult.nodes.map(hn => [hn.node.id, hn.hopLevel]))
    : new Map()

  // Compute degree (connection count) for each node
const degreeMap = new Map<string, number>()
for (const e of store.filteredEdges) {
  degreeMap.set(e.from_node_id, (degreeMap.get(e.from_node_id) || 0) + 1)
  degreeMap.set(e.to_node_id, (degreeMap.get(e.to_node_id) || 0) + 1)
}

const nodes = store.filteredNodes.map(n => {
    const hopLevel = multiHopNodes.get(n.id)
    const isHighlighted = store.highlightedNodeIds.has(n.id)
    const opacity = hopLevel !== undefined ? Math.max(1 - hopLevel * 0.2, 0.3) : 1
    const baseColor = getNodeColor(n)
    const degree = degreeMap.get(n.id) || 1
    const radius = Math.max(6, Math.min(20, 4 + Math.sqrt(degree) * 3))
    const isExpandable = expandableNodeIds.value.has(n.id)
    return {
      id: n.id,
      text: getChineseLabel(n.properties.name) || n.id,
      nodeShape: 0,
      width: radius * 3 + 10,
      height: radius * 3 + 10,
      color: baseColor,
      borderColor: 'transparent',
      borderWidth: 0,
      fontColor: '#fff',
      fontSize: radius > 14 ? 11 : 10,
      opacity: isHighlighted ? 1 : opacity,
      data: {
        isHighlighted,
        hopLevel,
        baseColor,
        radius,
        isExpandable,
        isExpanded: store.isGraphNodeExpanded(n.id),
        labels: n.labels,
      },
    }
  })

  const edges = store.filteredEdges.map(e => ({
    from: e.from_node_id,
    to: e.to_node_id,
    text: e.properties?.predicate || e.type,
    color: getEdgeColor(e.type),
    lineWidth: 1,
    opacity: 0.45,
    fontColor: '#94a3b8',
    fontSize: 10,
  }))

  return {
    rootId: nodes[0]?.id || '',
    nodes,
    lines: edges,
  }
})

function getNodeColor(node: any): string {
  const labels = node.labels || []
  for (const l of labels) {
    const c = getEntityColor(l)
    if (c !== '#64748b') return c
  }
  return '#64748b'
}

function getEdgeColor(type: string): string {
  const map: Record<string, string> = {
    DESCRIBES: '#06b6d4', IS_A: '#8b5cf6', PART_OF: '#8b5cf6', CONTAINS: '#8b5cf6',
    IMPLIES: '#f59e0b', EQUIVALENT_TO: '#10b981', CONTRADICTS: '#ef4444', EXTENDS: '#f59e0b',
    PRECEDES: '#3b82f6', DEPENDS_ON: '#3b82f6', COMPLEMENTS: '#10b981',
    APPLIES_TO: '#ec4899', SOLVES: '#10b981', DEMONSTRATES: '#06b6d4',
    CITES: '#a78bfa', EXEMPLIFIES: '#34d399', CLASSIFIED_AS: '#818cf8',
  }
  return map[type] || 'rgba(148,163,184,.35)'
}

// Options aligned with dark theme
const options = computed(() => ({
  layouts: [
    {
      label: 'force',
      layoutName: 'force',
    },
  ],
  allowShowMiniToolBar: false,
  allowShowZoomMenu: false,
  allowSwitchLineShape: false,
  allowSwitchJunctionPoint: false,
  moveToCenterWhenResize: true,
  disableDragCanvas: false,
  allowShowSettingPanel: false,
  defaultJunctionPoint: 'border',
  defaultLineShape: 1,
  backgroundColor: 'transparent',
}))

function renderGraph(reLayout: boolean) {
  if (!graphRef.value) return
  const data = graphData.value
  if (!data.nodes.length) return
  const version = ++renderVersion
  graphRef.value.setJsonData(data, reLayout).catch((e: any) => {
    if (version === renderVersion) {
      console.warn('[GraphCanvas] setJsonData error:', e)
    }
  })
}

function handleNodeClick(node: any, _e: any) {
  // 点击节点本身（非 +/- badge）统一触发右侧详情抽屉
  props.onNodeClick?.(node.id)
}

function handleBadgeClick(nodeId: string) {
  store.toggleGraphNodeExpand(nodeId)
  renderGraph(false)
}

// ── Watchers ──────────────────────────────────────────────────────────────

/**
 * 所有影响 filtered 数据的变化（新数据、筛选、搜索等）都触发重绘。
 * 不设 hasRendered 抑制——组件卸载重挂后仍能响应 loadAllData 的回调。
 */
watch(() => [
  store.nodes,
  store.edges,
  store.selectedDocId,
  store.selectedLabels,
  store.searchQuery,
  store.showOrphanNodes,
  [...store.chunkNodeIds],
], () => {
  nextTick(() => {
    if (!graphRef.value) return
    renderGraph(true)
  })
}, { deep: true })

/** 挂载时如果已有数据则立即渲染 */
onMounted(() => {
  if (store.nodes.length) {
    renderGraph(true)
  }
})
</script>

<template>
  <div class="graph-canvas-wrapper">
    <!-- Error state -->
    <div v-if="store.error" class="canvas-empty canvas-error">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
        <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <p>{{ store.error }}</p>
      <button class="retry-btn" @click="store.loadAllData()">{{ t('kgViewer.retry') || '重试' }}</button>
    </div>
    <!-- Empty state (no data yet) -->
    <div v-else-if="!store.nodes.length" class="canvas-empty">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" style="opacity:.3">
        <circle cx="12" cy="12" r="10" stroke="#94a3b8" stroke-width=".5"/>
        <circle cx="8" cy="9" r="2" fill="#94a3b8"/>
        <circle cx="16" cy="9" r="2" fill="#94a3b8"/>
        <circle cx="12" cy="17" r="2" fill="#94a3b8"/>
        <line x1="9.5" y1="10" x2="10.5" y2="15.5" stroke="#94a3b8" stroke-width=".8"/>
        <line x1="14.5" y1="10" x2="13.5" y2="15.5" stroke="#94a3b8" stroke-width=".8"/>
      </svg>
      <p>{{ t('kgViewer.noData') }}</p>
      <p class="hint">{{ t('kgViewer.noDataHint') }}</p>
    </div>

    <!-- Canvas -->
    <RelationGraph
      v-else
      ref="graphRef"
      :options="options"
      :on-node-click="handleNodeClick"
    >
      <template #node="{node}">
        <div class="custom-node" :class="{ highlighted: node.data?.isHighlighted, expandable: node.data?.isExpandable, expanded: node.data?.isExpanded }">
          <span
            class="node-dot"
            :class="{ expanded: node.data?.isExpanded }"
            :style="{
              background: node.color,
              width: node.data?.radius * 2 + 'px',
              height: node.data?.radius * 2 + 'px',
            }"
          ></span>
          <span class="node-label" :class="{ highlighted: node.data?.isHighlighted }" :style="{ fontSize: node.fontSize + 'px' }">{{ node.text }}</span>
          <span v-if="node.data?.isExpandable" class="expand-badge" @click.stop="handleBadgeClick(node.id)">{{ node.data?.isExpanded ? '−' : '+' }}</span>
        </div>
      </template>
    </RelationGraph>

    <!-- Loading overlay -->
    <transition name="fade">
      <div v-if="store.loading" class="canvas-loading">
        <svg class="spinner" width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#3b82f6" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
        </svg>
        <p>{{ t('kgViewer.loading') }}</p>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.graph-canvas-wrapper {
  flex: 1; position: relative; overflow: hidden;
}
.canvas-empty {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8px; color: var(--text-tertiary);
}
.canvas-empty p { margin: 0; font-size: 14px; }
.canvas-empty .hint { font-size: 12px; opacity: .6; }
.canvas-error p { color: var(--danger); }
.retry-btn {
  margin-top: 8px; padding: 6px 16px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-secondary); color: var(--text-primary);
  cursor: pointer; font-size: 13px;
}
.retry-btn:hover { background: var(--bg-hover); }

/* Loading */
.canvas-loading {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px;
  background: rgba(0,0,0,.5);
  color: var(--text-secondary); font-size: 14px;
  z-index: 10;
}
.canvas-loading p { margin: 0; }
.spinner { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.fade-enter-active { transition: opacity .2s ease; }
.fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── Custom node rendering ── */
.custom-node {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  position: relative;
  cursor: pointer;
}
.node-dot {
  border-radius: 50%;
  display: block;
  transition: box-shadow .2s ease;
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
.node-dot.highlighted {
  box-shadow: 0 0 12px 4px rgba(251,191,36,.6);
}
.custom-node.highlighted .node-dot {
  box-shadow: 0 0 12px 4px rgba(251,191,36,.6);
}
.node-label {
  color: #fff !important;
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0,0,0,.8);
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.node-label.highlighted {
  color: #fbbf24 !important;
}
.custom-node.expandable:hover .node-dot {
  box-shadow: 0 0 8px 2px rgba(6,182,212,.4);
}
.custom-node.expandable .node-dot {
  cursor: pointer;
}
.node-dot.expanded {
  box-shadow: 0 0 8px 2px rgba(139,92,246,.5);
}

/* ── Expand/collapse badge ── */
.expand-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  border: 1.5px solid rgba(148,163,184,.4);
  border-radius: 50%;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  transition: all .15s;
}
.custom-node.expanded .expand-badge {
  background: rgba(139,92,246,.2);
  border-color: #8b5cf6;
  color: #a78bfa;
}

/* ── Edge label dark theme ── */
:deep(.rel-link-text) { fill: #94a3b8 !important; }
</style>
