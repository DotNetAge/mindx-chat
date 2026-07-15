<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import {
  Document, Collection, DataAnalysis, Search,
  RefreshLeft, WarningFilled,
} from '@element-plus/icons-vue'
import { useGraphStore } from '../stores/graphStore'
import { useMarkdown } from '../composables/useMarkdown'
import { getChineseLabel, getEntityColor } from '../types/entityCategories'
import TreeSearchPanel from './TreeSearchPanel.vue'

const { t } = useI18n()
const store = useGraphStore()
const { md } = useMarkdown()

const expandedChunkIds = ref<Set<string>>(new Set())

function toggleChunkExpand(id: string) {
  const s = expandedChunkIds.value
  if (s.has(id)) s.delete(id)
  else s.add(id)
  // trigger reactivity
  expandedChunkIds.value = new Set(s)
}

function isChunkExpanded(id: string): boolean {
  return expandedChunkIds.value.has(id)
}

function onChunkContentClick(entityIds: string[]) {
  // Toggle: if same IDs already active, clear filter
  const current = [...store.chunkNodeIds].sort().join(',')
  const next = [...entityIds].sort().join(',')
  if (current === next) {
    store.clearHighlightedNodes()
  } else {
    store.selectChunkNodes(entityIds)
  }
}

/** Render markdown to HTML */
function renderMd(text: string): string {
  if (!text) return ''
  try {
    return md.render(text)
  } catch {
    return text
  }
}

function confidenceClass(score: number): string {
  if (score > 0.7) return 'confidence-high'
  if (score > 0.4) return 'confidence-mid'
  return 'confidence-low'
}

function onChunkPageChange(page: number) {
  if (page !== store.chunkPage) {
    store.loadDefaultChunks(page)
  }
}

const searchInput = ref('')

const resettingKB = ref(false)

async function handleResetKB() {
  try {
    await ElMessageBox.confirm(
      '⚠️ 确定要重置知识库吗？\n\n这将永久删除 GraphIndexer 下的全部索引数据（向量、图谱、全文索引），且不可恢复！\n\n如果知识库正在被使用，请先确认已备份重要数据。',
      '⚠️ 严重警告',
      {
        confirmButtonText: '确认重置，全部删除',
        cancelButtonText: '取消',
        type: 'error',
        confirmButtonClass: 'el-button--danger',
        cancelButtonClass: 'el-button--default',
      }
    )
    resettingKB.value = true
    await store.resetKnowledgeBase()
    ElMessage.success('知识库已重置')
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('重置知识库失败: ' + (e.message || e))
    }
  } finally {
    resettingKB.value = false
  }
}


const tabs = [
  { key: 'documents' as const, icon: Document, label: t('kgViewer.documents') },
  { key: 'entities' as const, icon: Collection, label: t('kgViewer.entities') },
  { key: 'stats' as const, icon: DataAnalysis, label: t('kgViewer.stats') },
]

// ── Search ──

function onSearchKeyup() {
  if (!searchInput.value.trim()) {
    store.clearSearch()
    return
  }
  store.semanticSearch(searchInput.value.trim())
}

watch(searchInput, (val) => {
  if (!val) store.clearSearch()
})

// ── Helpers ──

function shortenDocId(id: string): string {
  if (id.length > 36) return id.slice(0, 18) + '...' + id.slice(-12)
  return id
}

function getLabelColor(label: string): string {
  return getEntityColor(label)
}

/** Get relation label from i18n, fallback to raw type */
function relationLabel(type: string): string {
  const key = `kgViewer.relationLabels.${type}`
  const label = t(key)
  return label !== key ? label : type
}

/** Click entity label: filter graph + open table tab (don't switch to it) */
function handleEntityClick(item: { label: string; count: number }) {
  // Toggle label filter on graph
  store.toggleLabelFilter(item.label)
  // Ensure graph tab is active
  if (store.activeMainTabId !== 'graph') {
    store.activeMainTabId = 'graph'
  }
  // Open entity list table tab (but don't activate it — stays on graph)
  store.openEntityTab(item.label, getChineseLabel(item.label))
}

onMounted(() => {
  store.loadDefaultChunks()
})

// Debug: log Documents tab state changes
watch(() => store.activeTab, (tab) => {
  if (tab === 'documents') {
    
  }
  // 切换 Tab 时清空搜索框文字
  searchInput.value = ''
})
watch(() => store.defaultChunks, (chunks) => {
  
})

</script>

<template>
  <aside class="gv-sidebar">
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

    <!-- ── Search bar (only in documents tab) ── -->
    <div v-if="store.activeTab === 'documents'" class="sidebar-search">
      <el-input
        v-model="searchInput"
        :placeholder="t('kgViewer.searchKnowledge')"
        size="small"
        clearable
        @keyup.enter="onSearchKeyup"
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
      <!-- Error (blocks content) -->
      <div v-if="store.error" class="sidebar-empty error">
        <span>{{ store.error }}</span>
        <button class="retry-btn" @click="store.loadAllData()">
          <el-icon><RefreshLeft /></el-icon> {{ t('common.retry') }}
        </button>
      </div>

      <!-- ═══════════════ Tab views ═══════════════ -->

      <!-- ── Tab: Documents ── -->
      <template v-else-if="store.activeTab === 'documents'">
        <!-- Search mode: show tree results -->
        <template v-if="store.searchTree.length > 0 || store.searchLoading">
          <div class="search-results-section">
            <h4 class="section-title">{{ t('kgViewer.searchResults') }} ({{ store.searchResults.length }})</h4>
            <TreeSearchPanel
              :tree="store.searchTree"
              :loading="store.searchLoading"
            />
          </div>

          <!-- Related Graph Paths -->
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

        <!-- Default chunks mode -->
        <template v-else>
          <!-- Chunk filter indicator -->
          <div v-if="store.chunkNodeIds.size > 0" class="chunk-filter-bar">
            <el-icon style="color:var(--accent-cyan);font-size:14px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></el-icon>
            <span>图谱已筛选，<span class="chunk-filter-link" @click="store.clearHighlightedNodes()">点击清除</span></span>
          </div>

          <!-- Loading skeleton -->
          <div v-if="store.defaultChunksLoading" class="search-skeleton" style="padding:8px 0;">
            <div v-for="i in 3" :key="i" class="skeleton-item"></div>
          </div>

          <!-- Chunk items -->
          <template v-else-if="store.defaultChunks.length > 0">
            <div class="search-results-section">
              <h4 class="section-title">{{ t('kgViewer.defaultChunksTitle') }} ({{ store.defaultChunks.length }})</h4>
              <div class="search-results">
                <div v-for="r in store.defaultChunks" :key="r.id" class="chunk-card">
                  <!-- ── Title: summary (from metadata) ── -->
                  <div
                    v-if="r.summary"
                    class="chunk-title"
                    :title="r.summary"
                    @click="toggleChunkExpand(r.id)"
                  >
                    {{ r.summary }}
                  </div>

                  <!-- ── Content (expanded, markdown rendered) ── -->
                  <div
                    v-if="isChunkExpanded(r.id)"
                    class="chunk-content"
                    :class="{ 'has-entities': r.entity_ids?.length }"
                    :title="r.entity_ids?.length ? '点击关联知识节点' : ''"
                    @click="r.entity_ids?.length && onChunkContentClick(r.entity_ids)"
                    v-html="renderMd(r.content)"
                  ></div>

                  <!-- ── Separator ── -->
                  <div v-if="r.source_file || (r.tags && r.tags.length)" class="chunk-separator"></div>

                  <!-- ── Footer: tags + source file ── -->
                  <div class="chunk-footer">
                    <!-- Tags -->
                    <div v-if="r.tags && r.tags.length" class="chunk-tags">
                      <span v-for="tag in r.tags.slice(0, 5)" :key="tag" class="chunk-tag">{{ tag }}</span>
                      <span v-if="r.tags.length > 5" class="chunk-tag-more">+{{ r.tags.length - 5 }}</span>
                    </div>

                    <!-- Source file -->
                    <div v-if="r.source_file" class="chunk-file" :title="r.source_file" @click="store.openFile(r.source_file)">
                      <el-icon :size="11"><Document /></el-icon>
                      <span>{{ r.source_file.split('/').pop() }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- ── Paginator ── -->
            <div v-if="store.chunkTotal > 20" class="chunk-paginator">
              <el-pagination
                size="small"
                :current-page="store.chunkPage"
                :page-size="20"
                :total="store.chunkTotal"
                :pager-count="5"
                layout="prev, pager, next"
                @current-change="onChunkPageChange"
              />
            </div>
          </template>

          <div v-else class="sidebar-empty">
            <span>{{ t('kgViewer.noDocuments') }}</span>
          </div>
        </template>
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
            @click="handleEntityClick(item)"
          >
            <span class="entity-dot" :style="{ background: getLabelColor(item.label) }"></span>
            <span class="entity-label">{{ getChineseLabel(item.label) }}</span>
            <span class="entity-count">{{ item.count }}</span>
          </li>
        </ul>
        <!-- Entity tab footer: orphan node toggle -->
        <div class="entity-footer">
          <span class="orphan-label">{{ t('kgViewer.showOrphanNodes') || '显示孤儿节点' }}</span>
          <el-switch
            v-model="store.showOrphanNodes"
            size="small"
            :active-color="'#06b6d4'"
          />
        </div>
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

        <div class="stat-section reset-section">
          <div class="reset-warning-text">
            <el-icon><WarningFilled /></el-icon>
            <span>危险操作 — 将清空全部索引数据</span>
          </div>
          <el-button
            type="danger"
            size="small"
            class="reset-btn"
            @click="handleResetKB"
            :loading="resettingKB"
          >
            <el-icon><WarningFilled /></el-icon>
            重置知识库
          </el-button>
        </div>

        <div v-if="store.relationDistribution.length" class="stat-section">
          <h4>{{ t('kgViewer.relationTypes') }}</h4>
          <ul class="rel-type-list">
            <li v-for="r in store.relationDistribution.slice(0, 15)" :key="r.type" class="rel-item">
              <code class="rel-code">{{ relationLabel(r.type) }}</code>
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
  width: 320px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow: hidden;
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

.chunk-filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--accent-cyan);
  padding: 6px 8px;
  margin: 4px 0;
  background: rgba(6, 182, 212, 0.08);
  border-radius: 6px;
}
.chunk-filter-link {
  text-decoration: underline;
  cursor: pointer;
  font-weight: 600;
}
.chunk-filter-link:hover {
  color: #fff;
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
.search-result-card {
  position: relative;
}

/* ── Confidence Badge ── */
.confidence-badge {
  display: inline-block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  margin-bottom: 4px;
  border-radius: 4px;
  line-height: 1.5;
}
.confidence-high {
  background: rgba(16,185,129,.15);
  color: #34d399;
}
.confidence-mid {
  background: rgba(245,158,11,.15);
  color: #fbbf24;
}
.confidence-low {
  background: rgba(100,116,139,.15);
  color: #94a3b8;
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

.entity-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 6px;
  margin-top: 4px;
  border-top: 1px solid rgba(255,255,255,.06);
}
.orphan-label {
  font-size: 12px;
  color: var(--text-secondary);
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

/* ── Reset KB button ── */

.reset-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  margin-top: 12px;
  border-top: 1px solid rgba(239, 68, 68, 0.2);
}
.reset-warning-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: #ef4444;
  justify-content: center;
}
.reset-warning-text .el-icon {
  font-size: 14px;
}
.reset-btn {
  width: 100%;
  font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.3) inset;
}
.reset-btn:hover {
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.6) inset;
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

/* ── Chunk card (Documents tab) ── */

.chunk-card {
  padding: 8px 8px 6px;
  background: rgba(139,92,246,.04);
  border: 1px solid rgba(139,92,246,.1);
  border-radius: 7px;
  transition: background .12s;
}
.chunk-card:hover {
  background: rgba(139,92,246,.08);
}

/* Title = summary from metadata */
.chunk-title {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
  cursor: pointer;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  user-select: none;
  transition: color .12s;
}
.chunk-title:hover {
  color: var(--accent-cyan);
}

/* Expanded content — markdown rendered */
.chunk-content {
  margin-top: 6px;
  padding: 6px 8px;
  background: rgba(0,0,0,.15);
  border-radius: 5px;
  max-height: 320px;
  overflow-y: auto;
  font-size: 11.5px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.chunk-content.has-entities {
  cursor: pointer;
  transition: background .12s;
  border-radius: 4px;
  padding: 4px 6px;
  margin: 4px -6px;
}
.chunk-content.has-entities:hover {
  background: rgba(251, 191, 36, 0.08);
}
.chunk-content :deep(pre) {
  margin: 4px 0;
  padding: 6px 8px;
  background: rgba(0,0,0,.25);
  border-radius: 4px;
  overflow-x: auto;
  font-size: 10.5px;
  line-height: 1.5;
}
.chunk-content :deep(code) {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
}
.chunk-content :deep(p) {
  margin: 4px 0;
}
.chunk-content :deep(ul),
.chunk-content :deep(ol) {
  margin: 4px 0;
  padding-left: 18px;
}
.chunk-content :deep(li) {
  margin: 2px 0;
}
.chunk-content :deep(h1),
.chunk-content :deep(h2),
.chunk-content :deep(h3),
.chunk-content :deep(h4) {
  margin: 8px 0 4px;
  color: var(--text-primary);
  font-size: inherit;
  font-weight: 600;
}
.chunk-content :deep(blockquote) {
  margin: 4px 0;
  padding: 2px 8px;
  border-left: 2px solid var(--accent-cyan);
  color: var(--text-muted);
}
.chunk-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 10.5px;
  margin: 4px 0;
}
.chunk-content :deep(th),
.chunk-content :deep(td) {
  border: 1px solid rgba(255,255,255,.1);
  padding: 3px 6px;
  text-align: left;
}
.chunk-content :deep(th) {
  background: rgba(255,255,255,.05);
  font-weight: 600;
}
.chunk-content :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
.chunk-content :deep(a) {
  color: var(--accent-cyan);
}

/* Separator between content and footer */
.chunk-separator {
  margin: 5px 0 4px;
  height: 1px;
  background: rgba(255,255,255,.06);
}

/* Footer: tags + file */
.chunk-footer {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.chunk-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.chunk-tag {
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
  white-space: nowrap;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}
.chunk-tag-more {
  font-size: 9.5px;
  color: var(--text-muted);
  padding: 1px 3px;
}
.chunk-file {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: color .12s;
}
.chunk-file:hover {
  color: var(--accent-cyan);
}
.chunk-file .el-icon {
  flex-shrink: 0;
}

/* Paginator — dark theme, matches sidebar style */
.chunk-paginator {
  display: flex;
  justify-content: center;
  padding: 4px 0 2px;
  overflow-x: auto;
}
.chunk-paginator .el-pagination {
  flex-wrap: nowrap;
  white-space: nowrap;
}
</style>

<!-- 全局样式：确保确认对话框在 GraphViewer (z:8000) 之上 -->
<style>
/* Element Plus MessageBox overlay — must be above GraphViewer's z-index:8000 */
.el-overlay:has(.el-message-box) {
  z-index: 9000 !important;
}
</style>
