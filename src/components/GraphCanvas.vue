<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { RelationGraph } from 'relation-graph/vue3'
import type { RGJsonData } from 'relation-graph/vue3'
import { useI18n } from 'vue-i18n'
import { useGraphStore, CATEGORY_COLORS } from '../stores/graphStore'

const { t } = useI18n()
const store = useGraphStore()
const graphRef = ref<any>(null)
let dataVersion = 0 // Version guard against stale setJsonData races

const props = defineProps<{
  onNodeClick?: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
}>()

// Map store data → relation-graph format
const graphData = computed<RGJsonData>(() => {
  const nodes = store.filteredNodes.map(n => ({
    id: n.id,
    text: n.properties.name || n.id,
    nodeShape: 1,
    color: getNodeColor(n),
    borderColor: getNodeColor(n),
    borderWidth: 0,
    fontColor: '#e2e8f0',
    fontSize: 12,
  }))

  const edges = store.filteredEdges.map(e => ({
    from: e.from_node_id,
    to: e.to_node_id,
    text: e.type,
    color: getEdgeColor(e.type),
    lineWidth: isNeighborEdge(e) ? 2 : 1,
    opacity: isNeighborEdge(e) ? 1 : 0.45,
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
  for (const cat of Object.keys(CATEGORY_COLORS)) {
    if (labels.includes(cat)) return CATEGORY_COLORS[cat]
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

function isNeighborEdge(edge: any): boolean {
  if (!store.selectedNodeId) return true
  return edge.from_node_id === store.selectedNodeId || edge.to_node_id === store.selectedNodeId
}

// Options aligned with dark theme
const options = computed(() => ({
  layout: { direction: 'radial', radialRadius: 200 },
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

function handleNodeClick(node: any, _e: any) {
  props.onNodeClick?.(node.id)
}

async function handleNodeDblClick(node: any, _e: any) {
  props.onNodeDoubleClick?.(node.id)
}

// Push data into relation-graph when store data changes
watch(graphData, async (data) => {
  if (!graphRef.value || !data.nodes.length) return
  const version = ++dataVersion
  try {
    await graphRef.value.setJsonData(data, false)
    // Only keep result if this is still the latest version
    if (version !== dataVersion) return
  } catch (e) {
    if (version === dataVersion) {
      console.warn('[GraphCanvas] setJsonData error:', e)
    }
  }
})

// Note: No onMounted needed — watch(graphData) fires immediately with initial value,
// and data arrives asynchronously via loadAllData() after mount.
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
      :on-node-expand="handleNodeClick"
      :on-node-dbl-click="handleNodeDblClick"
    >
      <!-- Slot-based node/line rendering can be added here if needed -->
    </RelationGraph>

    <!-- Loading overlay -->
    <div v-if="store.loading" class="canvas-loading">
      <div class="spinner"></div>
      <span>{{ t('kgViewer.loadingGraph') }}</span>
    </div>
  </div>
</template>

<style scoped>
.graph-canvas-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 30% 40%, rgba(6,182,212,.03) 0%, transparent 50%),
    radial-gradient(circle at 70% 60%, rgba(139,92,246,.03) 0%, transparent 50%),
    var(--bg-primary);
}

.graph-canvas-wrapper :deep(.rel-graph-container) {
  width: 100% !important;
  height: 100% !important;
  background: transparent !important;
}

.canvas-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: var(--text-muted);
  font-size: 14px;
}
.canvas-empty .hint {
  font-size: 12px; color: var(--text-muted); opacity: .7;
}

.canvas-loading {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column;
  align-items: center; gap: 10px;
  color: var(--text-secondary); font-size: 13px;
  z-index: 10;
}
.spinner {
  width: 28px; height: 28px;
  border: 2px solid rgba(6,182,212,.15);
  border-top-color: var(--accent-cyan);
  border-radius: 50%;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.canvas-error p {
  color: #ef4444;
  font-size: 13px;
  max-width: 360px;
  text-align: center;
  line-height: 1.5;
}
.retry-btn {
  padding: 6px 20px;
  border: 1px solid rgba(6,182,212,.4);
  border-radius: 6px;
  background: rgba(6,182,212,.08);
  color: var(--accent-cyan);
  font-size: 13px;
  cursor: pointer;
  transition: background .2s, border-color .2s;
}
.retry-btn:hover {
  background: rgba(6,182,212,.18);
  border-color: var(--accent-cyan);
}
</style>
