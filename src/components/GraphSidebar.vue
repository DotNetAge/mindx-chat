<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Document, Collection, DataAnalysis, Search, RefreshLeft, Delete } from '@element-plus/icons-vue'
import { useGraphStore, CATEGORY_COLORS } from '../stores/graphStore'

const { t } = useI18n()
const store = useGraphStore()

const tabs = [
  { key: 'documents' as const, icon: Document, label: t('kgViewer.documents') },
  { key: 'entities' as const, icon: Collection, label: t('kgViewer.entities') },
  { key: 'stats' as const, icon: DataAnalysis, label: t('kgViewer.stats') },
]

// ── Documents ──

function shortenDocId(id: string): string {
  if (id.length > 36) return id.slice(0, 18) + '...' + id.slice(-12)
  return id
}

// ── Entities ──

function getLabelColor(label: string): string {
  for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
    if (label === cat || label.startsWith(cat)) return color
  }
  return '#64748b'
}
</script>

<template>
  <aside class="gv-sidebar">
    <!-- Tab bar -->
    <div class="sidebar-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: store.activeTab === tab.key }"
        @click="store.setActiveTab(tab.key)"
      >
        <el-icon :size="14"><component :is="tab.icon" /></el-icon>
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- Search -->
    <div class="sidebar-search">
      <el-input
        v-model="store.searchQuery"
        :placeholder="t('kgViewer.searchPlaceholder')"
        size="small"
        clearable
        :prefix-icon="Search"
      />
    </div>

    <!-- Content area -->
    <div class="sidebar-content">
      <!-- Loading / Error -->
      <div v-if="store.loading" class="sidebar-empty">
        <span>{{ t('common.loading') }}</span>
      </div>
      <div v-else-if="store.error" class="sidebar-empty error">
        <span>{{ store.error }}</span>
        <button class="retry-btn" @click="store.loadAllData()">
          <el-icon><RefreshLeft /></el-icon> {{ t('common.retry') }}
        </button>
      </div>

      <!-- Tab: Documents -->
      <template v-else-if="store.activeTab === 'documents'">
        <div v-if="!store.docs.length" class="sidebar-empty">
          <span>{{ t('kgViewer.noDocuments') }}</span>
        </div>
        <ul v-else class="doc-list">
          <li
            v-for="doc in store.docs"
            :key="doc"
            class="doc-item"
            :class="{ active: store.selectedDocId === doc }"
            @click="store.setSelectedDoc(doc)"
          >
            <el-icon :size="14"><Document /></el-icon>
            <span class="doc-name">{{ shortenDocId(doc) }}</span>
          </li>
        </ul>
      </template>

      <!-- Tab: Entities (label distribution) -->
      <template v-else-if="store.activeTab === 'entities'">
        <div v-if="!store.labelDistribution.length" class="sidebar-empty">
          <span>{{ t('kgViewer.noEntities') }}</span>
        </div>
        <ul v-else class="entity-list">
          <li
            v-for="item in store.labelDistribution"
            :key="item.label"
            class="entity-item"
            :class="{ active: store.selectedLabels.includes(item.label) }"
            @click="store.toggleLabelFilter(item.label)"
          >
            <span class="entity-dot" :style="{ background: getLabelColor(item.label) }"></span>
            <span class="entity-label">{{ item.label }}</span>
            <span class="entity-count">{{ item.count }}</span>
          </li>
        </ul>
      </template>

      <!-- Tab: Stats -->
      <template v-else-if="store.activeTab === 'stats'">
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalNodes.toLocaleString() }}</span>
            <span class="stat-label">Nodes</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalEdges.toLocaleString() }}</span>
            <span class="stat-label">Edges</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.nodes.length }}</span>
            <span class="stat-label">Loaded Nodes</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.edges.length }}</span>
            <span class="stat-label">Loaded Edges</span>
          </div>
        </div>

        <!-- Level distribution -->
        <div v-if="store.levelDistribution.length" class="stat-section">
          <h4>Knowledge Levels</h4>
          <div class="level-bars">
            <div v-for="lv in store.levelDistribution" :key="lv.label" class="level-row">
              <span class="level-name">{{ lv.label }}</span>
              <div class="level-bar-track">
                <div
                  class="level-bar-fill"
                  :style="{
                    width: (lv.count / Math.max(...store.levelDistribution.map(l => l.count)) * 100) + '%',
                    background: lv.label === 'core' ? '#06b6d4' : lv.label === 'advanced' ? '#8b5cf6' : lv.label === 'practical' ? '#10b981' : '#94a3b8'
                  }"
                ></div>
              </div>
              <span class="level-count">{{ lv.count }}</span>
            </div>
          </div>
        </div>

        <!-- Relation type distribution -->
        <div v-if="store.relationDistribution.length" class="stat-section">
          <h4>{{ t('kgViewer.relationTypes') }}</h4>
          <ul class="rel-type-list">
            <li v-for="r in store.relationDistribution.slice(0, 15)" :key="r.type" class="rel-item">
              <code class="rel-code">{{ r.type }}</code>
              <span class="rel-count">{{ r.count }}</span>
            </li>
          </ul>
        </div>
      </template>
    </div>

    <!-- Footer: Clear filters -->
    <div v-if="store.selectedDocId || store.selectedLabels.length || store.searchQuery" class="sidebar-footer">
      <button class="clear-btn" @click="store.clearFilters()">
        <el-icon><Delete /></el-icon> {{ t('kgViewer.clearFilters') }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.gv-sidebar {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow: hidden;
}

/* Tabs */
.sidebar-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 10px 0;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  transition: all .15s;
}
.tab-btn:hover { color: var(--text-secondary); background: rgba(255,255,255,.04); }
.tab-btn.active {
  color: var(--accent-cyan);
  background: rgba(6,182,212,.08);
  border-bottom: 2px solid var(--accent-cyan);
}

/* Search */
.sidebar-search {
  padding: 10px 12px;
  flex-shrink: 0;
}
.sidebar-search :deep(.el-input__wrapper) {
  background: rgba(255,255,255,.04) !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,.08) inset !important;
}
.sidebar-search :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px rgba(139,92,246,.4) inset !important;
}

/* Content */
.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 10px;
}
.sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: var(--text-muted);
  font-size: 13px;
  gap: 8px;
}
.sidebar-empty.error { color: #ef4444; }

.retry-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 12px;
  font-size: 12px;
  color: #e2e8f0;
  background: rgba(239,68,68,.12);
  border: 1px solid rgba(239,68,68,.25);
  border-radius: 6px;
  cursor: pointer;
}
.retry-btn:hover { background: rgba(239,68,68,.2); }

/* Doc list */
.doc-list { list-style: none; margin: 0; padding: 0; }
.doc-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: background .12s;
  white-space: nowrap;
  overflow: hidden;
}
.doc-item:hover { background: rgba(255,255,255,.05); }
.doc-item.active {
  background: rgba(6,182,212,.1); color: var(--accent-cyan);
}
.doc-name {
  overflow: hidden; text-overflow: ellipsis;
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
}

/* Entity list */
.entity-list { list-style: none; margin: 0; padding: 0; }
.entity-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: background .12s;
}
.entity-item:hover { background: rgba(255,255,255,.05); }
.entity-item.active { background: rgba(139,92,246,.1); color: #a78bfa; }
.entity-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.entity-label { flex: 1; font-weight: 500; }
.entity-count {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--text-muted); background: rgba(255,255,255,.06);
  padding: 1px 7px; border-radius: 10px;
}

/* Stats */
.stats-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 8px; margin-bottom: 16px;
}
.stat-card {
  display: flex; flex-direction: column; align-items: center;
  padding: 12px 8px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 8px;
}
.stat-value {
  font-size: 20px; font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent-cyan);
}
.stat-label {
  font-size: 11px; color: var(--text-muted); margin-top: 2px;
}

.stat-section { margin-top: 14px; }
.stat-section h4 {
  font-size: 12px; font-weight: 600;
  color: var(--text-secondary); margin: 0 0 8px;
}

/* Level bars */
.level-bars { display: flex; flex-direction: column; gap: 6px; }
.level-row {
  display: flex; align-items: center; gap: 8px;
  font-size: 11.5px;
}
.level-name { width: 70px; color: var(--text-secondary); flex-shrink: 0; }
.level-bar-track {
  flex: 1; height: 6px;
  background: rgba(255,255,255,.06);
  border-radius: 3px; overflow: hidden;
}
.level-bar-fill { height: 100%; border-radius: 3px; transition: width .3s; }
.level-count {
  width: 36px; text-align: right;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted); font-size: 11px;
}

/* Relation types */
.rel-type-list { list-style: none; margin: 0; padding: 0; }
.rel-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 0; font-size: 11.5px;
}
.rel-code {
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent-purple); font-size: 11px;
  background: rgba(139,92,246,.08);
  padding: 1px 6px; border-radius: 4px;
}
.rel-count {
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted); font-size: 11px;
}

/* Footer */
.sidebar-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.clear-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 6px; font-size: 12px; font-weight: 500;
  color: var(--text-muted); background: transparent;
  border: 1px solid rgba(255,255,255,.1); border-radius: 6px;
  cursor: pointer; transition: all .15s;
}
.clear-btn:hover { color: #ef4444; border-color: rgba(239,68,68,.3); background: rgba(239,68,68,.06); }
</style>
