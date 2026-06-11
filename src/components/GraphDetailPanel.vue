<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore, LEVEL_COLORS } from '../stores/graphStore'

const { t } = useI18n()
const store = useGraphStore()

const node = computed(() => store.selectedNode)
const edges = computed(() => store.selectedNodeEdges)

function levelBadge(level: string): string {
  return level || 'unknown'
}

function levelColor(level: string): string {
  return LEVEL_COLORS[level] || '#64748b'
}

// ── Multi-hop path grouping ──

/** Group multi-hop nodes by hopLevel for tree display */
const multiHopGroups = computed(() => {
  if (!store.multiHopResult) return []
  const groups: { level: number; nodes: { id: string; name: string; labels: string[] }[] }[] = []
  for (let i = 0; i <= 3; i++) {
    const nodesAtLevel = store.multiHopResult.nodes.filter(hn => hn.hopLevel === i)
    if (nodesAtLevel.length > 0) {
      groups.push({
        level: i,
        nodes: nodesAtLevel.map(hn => ({
          id: hn.node.id,
          name: hn.node.properties?.name || hn.node.id,
          labels: hn.node.labels || [],
        })),
      })
    }
  }
  return groups
})
</script>

<template>
  <transition name="slide-up">
    <div v-if="node" class="detail-panel">
      <div class="detail-header">
        <div class="detail-title-row">
          <span class="detail-name">{{ node.properties.name || node.id }}</span>
          <span
            class="detail-level-badge"
            :style="{ background: levelColor(node.properties.level) + '22', color: levelColor(node.properties.level), borderColor: levelColor(node.properties.level) + '55' }"
          >
            {{ levelBadge(node.properties.level) }}
          </span>
        </div>
        <button class="detail-close" @click="store.selectNode(null)">&times;</button>
      </div>

      <div class="detail-body">
        <!-- Labels -->
        <div class="detail-section" v-if="node.labels?.length">
          <span class="section-label">Labels</span>
          <div class="tag-group">
            <span v-for="l in node.labels" :key="l" class="detail-tag">{{ l }}</span>
          </div>
        </div>

        <!-- Summary -->
        <div class="detail-section" v-if="node.properties.summary">
          <span class="section-label">{{ t('kgViewer.summary') }}</span>
          <p class="section-text">{{ node.properties.summary }}</p>
        </div>

        <!-- Aliases -->
        <div class="detail-section" v-if="node.properties.aliases?.length">
          <span class="section-label">{{ t('kgViewer.aliases') }}</span>
          <div class="tag-group">
            <span v-for="a in node.properties.aliases" :key="a" class="detail-tag alias">{{ a }}</span>
          </div>
        </div>

        <!-- Source chunks -->
        <div class="detail-section" v-if="node.properties.source_chunk_ids?.length">
          <span class="section-label">{{ t('kgViewer.sourceChunks') }}</span>
          <div class="chunk-refs">
            <code
              v-for="cid in node.properties.source_chunk_ids.slice(0, 10)"
              :key="cid"
              class="chunk-ref"
            >{{ cid }}</code>
            <span v-if="node.properties.source_chunk_ids.length > 10" class="more-hint">
              +{{ node.properties.source_chunk_ids.length - 10 }} more
            </span>
          </div>
        </div>

        <!-- Connected relations -->
        <div class="detail-section" v-if="edges.length">
          <span class="section-label">{{ t('kgViewer.relations') }} ({{ edges.length }})</span>
          <div class="edge-list">
            <div v-for="e in edges.slice(0, 20)" :key="e.id" class="edge-item">
              <span class="edge-from">{{ e.from_node_id === node.id ? 'self' : e.from_node_id.slice(0, 12) }}</span>
              <span class="edge-arrow">
                <span class="edge-type">{{ e.type }}</span>
                &rarr;
              </span>
              <span class="edge-to">{{ e.to_node_id === node.id ? 'self' : e.to_node_id.slice(0, 12) }}</span>
            </div>
            <span v-if="edges.length > 20" class="more-hint">+{{ edges.length - 20 }} more relations</span>
          </div>
        </div>

        <!-- Raw ID -->
        <div class="detail-section">
          <span class="section-label">{{ t('kgViewer.nodeId') }}</span>
          <code class="raw-id">{{ node.id }}</code>
        </div>
      </div>

      <!-- ── Multi-hop Path Tree ── -->
      <div v-if="multiHopGroups.length > 1" class="multi-hop-section">
        <span class="section-label">{{ t('kgViewer.relatedPaths') }} ({{ (store.multiHopResult?.nodes.length || 0) - 1 }})</span>
        <div class="hop-tree">
          <div v-for="group in multiHopGroups" :key="group.level" class="hop-group">
            <div class="hop-level-line">
              <span class="hop-level-tag" :class="'tag-hop-' + group.level">Hop {{ group.level }}</span>
              <span class="hop-level-count">{{ group.nodes.length }} node{{ group.nodes.length > 1 ? 's' : '' }}</span>
            </div>
            <div class="hop-nodes">
              <div
                v-for="n in group.nodes.slice(0, 8)"
                :key="n.id"
                class="hop-node-chip"
                @click="store.selectNode(n.id)"
              >
                <span class="hop-node-badge" :class="'badge-hop-' + group.level">{{ n.labels[0]?.[0] || '?' }}</span>
                <span class="hop-node-name">{{ n.name }}</span>
              </div>
              <span v-if="group.nodes.length > 8" class="more-hint">+{{ group.nodes.length - 8 }} more</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.detail-panel {
  position: absolute;
  bottom: 0; left: 280px; right: 0;
  max-height: 260px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 10;
  box-shadow: 0 -4px 24px rgba(0,0,0,.3);
}

.detail-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  flex-shrink: 0;
}
.detail-title-row {
  display: flex; align-items: center; gap: 10px;
}
.detail-name {
  font-size: 15px; font-weight: 700; color: var(--text-primary);
}
.detail-level-badge {
  font-size: 10.5px; font-weight: 700;
  padding: 2px 8px; border-radius: 10px;
  text-transform: uppercase; letter-spacing: .5px;
  border: 1px solid;
}
.detail-close {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: var(--text-muted);
  background: none; border: none; border-radius: 6px; cursor: pointer;
}
.detail-close:hover { background: rgba(255,255,255,.08); color: var(--text-primary); }

.detail-body {
  flex: 1; overflow-y: auto;
  padding: 12px 20px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px 32px;
}

.detail-section { display: flex; flex-direction: column; gap: 4px; }
.section-label {
  font-size: 11px; font-weight: 600;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px;
}
.section-text {
  font-size: 12.5px; line-height: 1.6;
  color: var(--text-secondary); margin: 0;
}

.tag-group { display: flex; flex-wrap: wrap; gap: 5px; }
.detail-tag {
  font-size: 11px; font-weight: 500;
  padding: 2px 8px; border-radius: 4px;
  background: rgba(139,92,246,.1); color: #a78bfa;
  border: 1px solid rgba(139,92,246,.2);
}
.detail-tag.alias {
  background: rgba(245,158,11,.1); color: #fbbf24;
  border-color: rgba(245,158,11,.2);
}

.chunk-refs { display: flex; flex-wrap: wrap; gap: 4px; }
.chunk-ref {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  padding: 2px 6px; border-radius: 4px;
  background: rgba(6,182,212,.08); color: var(--accent-cyan);
  border: 1px solid rgba(6,182,212,.15);
}

.edge-list { display: flex; flex-direction: column; gap: 3px; }
.edge-item {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-family: 'JetBrains Mono', monospace;
  color: var(--text-secondary);
}
.edge-from, .edge-to { color: var(--text-muted); }
.edge-type {
  color: var(--accent-purple); font-weight: 600;
  background: rgba(139,92,246,.1);
  padding: 1px 5px; border-radius: 3px;
}
.edge-arrow { color: var(--text-muted); }

.raw-id {
  font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
  padding: 4px 8px; border-radius: 4px;
  background: rgba(255,255,255,.03);
  color: var(--text-muted); word-break: break-all;
}

.more-hint {
  font-size: 11px; color: var(--text-muted);
}

.slide-up-enter-active { transition: all .25s ease-out; }
.slide-up-leave-active { transition: all .15s ease-in; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); opacity: 0; }

/* ── Multi-hop tree ── */
.multi-hop-section {
  padding: 12px 20px 16px;
  border-top: 1px solid rgba(255,255,255,.06);
}
.hop-tree { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.hop-group { display: flex; flex-direction: column; gap: 4px; }
.hop-level-line {
  display: flex; align-items: center; gap: 8px;
}
.hop-level-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; font-weight: 700;
  padding: 1px 7px; border-radius: 4px;
}
.tag-hop-0 { background: rgba(6,182,212,.15); color: #06b6d4; }
.tag-hop-1 { background: rgba(16,185,129,.12); color: #10b981; }
.tag-hop-2 { background: rgba(245,158,11,.12); color: #f59e0b; }
.tag-hop-3 { background: rgba(239,68,68,.1); color: #ef4444; }
.hop-level-count {
  font-size: 10.5px; color: var(--text-muted);
}
.hop-nodes {
  display: flex; flex-wrap: wrap; gap: 4px;
  margin-left: 8px;
}
.hop-node-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 5px;
  font-size: 11px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.06);
  cursor: pointer;
  transition: all .12s;
}
.hop-node-chip:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.12); }
.hop-node-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; font-weight: 700;
  width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 3px;
}
.badge-hop-0 { background: rgba(6,182,212,.2); color: #06b6d4; }
.badge-hop-1 { background: rgba(16,185,129,.2); color: #10b981; }
.badge-hop-2 { background: rgba(245,158,11,.2); color: #f59e0b; }
.badge-hop-3 { background: rgba(239,68,68,.15); color: #ef4444; }
.hop-node-name {
  color: var(--text-secondary);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
