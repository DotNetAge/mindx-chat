<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Document, Collection, DataAnalysis, Search,
  RefreshLeft, Delete, Monitor, VideoPause,
  Link, FolderOpened
} from '@element-plus/icons-vue'
import { useGraphStore, CATEGORY_COLORS } from '../stores/graphStore'
import type { FileStateResult } from '../stores/graphStore'

const { t } = useI18n()
const store = useGraphStore()

const searchInput = ref('')
const pollingTimer = ref<ReturnType<typeof setInterval> | null>(null)

const tabs = [
  { key: 'documents' as const, icon: Document, label: t('kgViewer.documents') },
  { key: 'entities' as const, icon: Collection, label: t('kgViewer.entities') },
  { key: 'stats' as const, icon: DataAnalysis, label: t('kgViewer.stats') },
]

// ── Lifecycle ──

onMounted(() => {
  store.refreshFilewatchStatus()
})

// ── Search ──

function onSearchInput() {
  if (!searchInput.value.trim()) {
    store.clearSearch()
    return
  }
  store.semanticSearch(searchInput.value.trim())
}

watch(searchInput, () => {
  if (!searchInput.value) store.clearSearch()
})

// ── File index ──

async function toggleIndexing() {
  if (store.filewatchStatus?.running) {
    await store.stopFilewatch()
    stopPolling()
  } else {
    await store.startFilewatch()
    startPolling()
  }
}

function startPolling() {
  stopPolling()
  pollingTimer.value = setInterval(() => {
    store.refreshFilewatchStatus()
    // Refresh file states if there's a watched directory
    if (store.filewatchStatus?.watched?.length) {
      store.refreshFileStates(store.filewatchStatus.watched[0])
    }
  }, 5000)
}

function stopPolling() {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
}

// ── Helpers ──

function shortenDocId(id: string): string {
  if (id.length > 36) return id.slice(0, 18) + '...' + id.slice(-12)
  return id
}

function getLabelColor(label: string): string {
  for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
    if (label === cat || label.startsWith(cat)) return color
  }
  return '#64748b'
}

function getStateLabel(state: string): string {
  const map: Record<string, string> = {
    indexed: t('kgViewer.indexedCount'),
    changed: t('kgViewer.changedCount'),
    new: t('kgViewer.newCount'),
    removed: 'Removed',
    skipped: 'Skipped',
  }
  return map[state] || state
}

function getStateColor(state: string): string {
  const map: Record<string, string> = {
    indexed: '#10b981',
    changed: '#f59e0b',
    new: '#06b6d4',
    removed: '#ef4444',
    skipped: '#64748b',
  }
  return map[state] || '#64748b'
}
</script>

<template>
  <aside class="gv-sidebar">
    <!-- ── Index Control Bar ── -->
    <div class="index-bar" :class="{ running: store.filewatchStatus?.running }">
      <div class="index-bar-header">
        <span class="index-bar-title">
          <span class="index-dot" :class="{ running: store.filewatchStatus?.running }"></span>
          {{ t('kgViewer.indexControl') }}
        </span>
        <button
          class="index-toggle-btn"
          :class="{ running: store.filewatchStatus?.running }"
          @click="toggleIndexing"
          :disabled="store.filewatchStatus === null"
        >
          <el-icon :size="13">
            <component :is="store.filewatchStatus?.running ? VideoPause : Monitor" />
          </el-icon>
          {{ store.filewatchStatus?.running ? t('kgViewer.indexStop') : t('kgViewer.indexStart') }}
        </button>
      </div>
      <div v-if="store.fileStates" class="index-bar-stats">
        <span
          v-for="s in ['indexed', 'new', 'changed', 'removed']"
          :key="s"
          class="index-stat-item"
          :style="{ color: getStateColor(s) }"
        >
          {{ getStateLabel(s) }} {{ (store.fileStates.counts as any)[s] ?? 0 }}
        </span>
      </div>
      <div v-else class="index-bar-stats muted">
        <span>{{ t('common.loading') }}</span>
      </div>
    </div>

    <!-- ── Tab bar ── -->
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

    <!-- ── Search bar ── -->
    <div class="sidebar-search">
      <el-input
        v-model="searchInput"
        :placeholder="t('kgViewer.searchKnowledge')"
        size="small"
        clearable
        @input="onSearchInput"
      >
        <template #prefix>
          <el-icon class="search-icon" :class="{ loading: store.searchLoading }">
            <Search />
          </el-icon>
        </template>
      </el-input>
    </div>

    <!-- ── Content area ── -->
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

      <!-- ── Search Results (shown when available) ── -->
      <template v-else-if="store.searchResults.length > 0 || store.searchLoading">
        <div class="search-results-section">
          <h4 class="section-title">{{ t('kgViewer.searchResults') }} ({{ store.searchResults.length }})</h4>

          <!-- Loading skeleton -->
          <div v-if="store.searchLoading" class="search-skeleton">
            <div v-for="i in 3" :key="i" class="skeleton-item"></div>
          </div>

          <!-- Result items -->
          <div v-else class="search-results">
            <div
              v-for="r in store.searchResults"
              :key="r.id"
              class="search-result-item"
            >
              <div class="result-header">
                <span class="result-score" :style="{ color: r.score > 0.7 ? '#10b981' : r.score > 0.4 ? '#f59e0b' : '#64748b' }">
                  {{ (r.score * 100).toFixed(0) }}%
                </span>
                <span class="result-doc-id" :title="r.doc_id">
                  {{ shortenDocId(r.doc_id || '') }}
                </span>
              </div>
              <div v-if="r.title" class="result-title">{{ r.title }}</div>
              <p class="result-preview">{{ r.content?.slice(0, 120) }}{{ r.content?.length > 120 ? '...' : '' }}</p>
              <div v-if="r.tags && r.tags.length" class="result-tags">
                <span v-for="tag in r.tags.slice(0, 4)" :key="tag" class="result-tag">{{ tag }}</span>
                <span v-if="r.tags.length > 4" class="result-tag-more">+{{ r.tags.length - 4 }}</span>
              </div>
              <div class="result-meta">
                <el-icon :size="12"><FolderOpened /></el-icon>
                <span class="result-source" :title="r.source">{{ r.source || r.doc_id }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Related Graph Paths ── -->
        <div v-if="store.multiHopResult && store.multiHopResult.nodes.length > 0" class="related-paths-section">
          <h4 class="section-title">{{ t('kgViewer.relatedPaths') }} ({{ store.multiHopResult.nodes.length }})</h4>
          <div class="path-list">
            <div
              v-for="hn in store.multiHopResult.nodes.slice(0, 10)"
              :key="hn.node.id"
              class="path-item"
              :style="{ paddingLeft: (hn.hopLevel * 16 + 8) + 'px' }"
            >
              <span class="hop-badge" :class="'hop-' + hn.hopLevel">{{ hn.hopLevel }}{{ t('kgViewer.hops') }}</span>
              <span class="path-node-name">{{ hn.node.properties?.name || hn.node.id }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Tab: Documents ── -->
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

      <!-- ── Tab: Entities ── -->
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

      <!-- ── Tab: Stats ── -->
      <template v-else-if="store.activeTab === 'stats'">
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalNodes.toLocaleString() }}</span>
            <span class="stat-label">{{ t('kgViewer.nodes') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalEdges.toLocaleString() }}</span>
            <span class="stat-label">{{ t('kgViewer.edges') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.nodes.length }}</span>
            <span class="stat-label">{{ t('kgViewer.loadedNodes') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.edges.length }}</span>
            <span class="stat-label">{{ t('kgViewer.loadedEdges') }}</span>
          </div>
        </div>

        <div v-if="store.levelDistribution.length" class="stat-section">
          <h4>{{ t('kgViewer.knowledgeLevels') }}</h4>
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

    <!-- ── Footer: Clear filters ── -->
    <div class="sidebar-footer">
      <button
        v-if="store.selectedDocId || store.selectedLabels.length || store.searchQuery || store.searchResults.length"
        class="clear-btn"
        @click="store.clearFilters(); store.clearSearch(); searchInput = ''"
      >
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

/* ── Index Control Bar ── */

.index-bar {
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(255,255,255,.02);
  transition: background .2s;
}
.index-bar.running {
  background: rgba(16,185,129,.04);
}

.index-bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.index-bar-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.index-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #64748b;
  transition: background .3s;
}
.index-dot.running {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16,185,129,.5);
}

.index-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #e2e8f0;
  background: rgba(16,185,129,.15);
  border: 1px solid rgba(16,185,129,.3);
  border-radius: 5px;
  cursor: pointer;
  transition: all .15s;
}
.index-toggle-btn:hover { background: rgba(16,185,129,.25); }
.index-toggle-btn.running {
  background: rgba(239,68,68,.12);
  border-color: rgba(239,68,68,.25);
}
.index-toggle-btn.running:hover { background: rgba(239,68,68,.22); }
.index-toggle-btn:disabled { opacity: .5; cursor: not-allowed; }

.index-bar-stats {
  display: flex;
  gap: 10px;
  font-size: 10.5px;
  font-family: 'JetBrains Mono', monospace;
}
.index-bar-stats.muted {
  color: var(--text-muted);
}

.index-stat-item {
  display: flex;
  align-items: center;
  gap: 2px;
}
.index-stat-item::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 2px;
}

/* ── Tabs ── */

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

/* ── Search ── */

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

.search-icon.loading {
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Content ── */

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

/* ── Search Results ── */

.search-results-section,
.related-paths-section {
  padding: 8px 0;
}

.section-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px;
  padding: 0 2px;
}

.search-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton-item {
  height: 48px;
  background: rgba(255,255,255,.04);
  border-radius: 6px;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: .4; } 50% { opacity: .8; } }

.search-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.search-result-item {
  padding: 8px 10px;
  background: rgba(139,92,246,.04);
  border: 1px solid rgba(139,92,246,.1);
  border-radius: 7px;
  cursor: pointer;
  transition: background .12s;
}
.search-result-item:hover {
  background: rgba(139,92,246,.08);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.result-score {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
}
.result-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.result-doc-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-preview {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--accent-cyan);
}

/* ── Result Tags ── */
.result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  margin-bottom: 2px;
}
.result-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result-tag-more {
  font-size: 10px;
  color: var(--text-muted);
  padding: 1px 4px;
}
.result-source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Related Paths ── */

.related-paths-section {
  border-top: 1px solid rgba(255,255,255,.06);
  margin-top: 4px;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.path-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 4px;
  transition: background .1s;
}
.path-item:hover { background: rgba(255,255,255,.04); }

.hop-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
}
.hop-badge.hop-0 { background: rgba(6,182,212,.15); color: #06b6d4; }
.hop-badge.hop-1 { background: rgba(16,185,129,.12); color: #10b981; }
.hop-badge.hop-2 { background: rgba(245,158,11,.12); color: #f59e0b; }
.hop-badge.hop-3 { background: rgba(239,68,68,.1); color: #ef4444; }

.path-node-name {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Doc list ── */

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

/* ── Entity list ── */

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

/* ── Stats ── */

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

/* ── Footer ── */

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
