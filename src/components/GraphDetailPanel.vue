<script setup lang="ts">
import { computed } from 'vue'
import { Document } from '@element-plus/icons-vue'
import { useGraphStore } from '../stores/graphStore'
import { useMarkdown } from '../composables/useMarkdown'

const store = useGraphStore()
const { md } = useMarkdown()

const nodeName = computed(() => {
  const n = store.selectedNode
  return n?.properties?.name || n?.id || ''
})

function renderMd(text: string): string {
  if (!text) return ''
  try { return md.render(text) }
  catch { return text }
}

function closeDrawer() {
  store.detailChunks = []
}
</script>

<template>
  <transition name="slide-right">
    <div
      v-if="store.detailChunks.length > 0 || store.detailLoading"
      class="detail-drawer"
    >
      <!-- Header -->
      <div class="drawer-header">
        <div class="drawer-title-row">
          <span class="drawer-title">{{ nodeName }}</span>
          <span class="drawer-badge">{{ store.detailChunks.length }} 个分片</span>
        </div>
        <button class="drawer-close" @click="closeDrawer">&times;</button>
      </div>

      <!-- Loading -->
      <div v-if="store.detailLoading" class="drawer-loading">
        <div class="loading-spinner"></div>
        <span>加载中…</span>
      </div>

      <!-- Chunk list -->
      <div v-else-if="store.detailChunks.length > 0" class="drawer-body">
        <!-- Empty state: no chunks found for this node -->
        <div v-if="store.detailChunks.length === 0 && !store.detailLoading" class="empty-state">
          该节点暂无关联的分片
        </div>

        <div
          v-for="r in store.detailChunks"
          :key="r.id"
          class="chunk-card"
        >
          <!-- ── Summary ── -->
          <div v-if="r.summary" class="chunk-title">
            {{ r.summary }}
          </div>

          <!-- ── Content (markdown rendered) ── -->
          <div class="chunk-content" v-html="renderMd(r.content)"></div>

          <!-- ── Separator ── -->
          <div v-if="r.source_file || (r.tags && r.tags.length)" class="chunk-separator"></div>

          <!-- ── Footer: tags + source file ── -->
          <div class="chunk-footer">
            <div v-if="r.tags && r.tags.length" class="chunk-tags">
              <span v-for="tag in r.tags.slice(0, 5)" :key="tag" class="chunk-tag">{{ tag }}</span>
              <span v-if="r.tags.length > 5" class="chunk-tag-more">+{{ r.tags.length - 5 }}</span>
            </div>
            <div v-if="r.source_file" class="chunk-file" :title="r.source_file" @click="store.openFile(r.source_file)">
              <el-icon :size="11"><Document /></el-icon>
              <span>{{ typeof r.source_file === 'string' ? r.source_file.split('/').pop() : '' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.detail-drawer {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 380px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 20;
  box-shadow: -4px 0 24px rgba(0,0,0,.3);
  overflow: hidden;
}

/* ── Header ── */
.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  flex-shrink: 0;
}
.drawer-title-row {
  display: flex; align-items: center; gap: 8px;
  min-width: 0;
}
.drawer-title {
  font-size: 14px; font-weight: 700; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.drawer-badge {
  font-size: 10.5px; font-weight: 600;
  padding: 2px 7px; border-radius: 8px;
  background: rgba(139,92,246,.12); color: #a78bfa;
  white-space: nowrap;
}
.drawer-close {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: var(--text-muted);
  background: none; border: none; border-radius: 6px; cursor: pointer;
  flex-shrink: 0;
}
.drawer-close:hover { background: rgba(255,255,255,.08); color: var(--text-primary); }

/* ── Body ── */
.drawer-body {
  flex: 1; overflow-y: auto;
  padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
}

/* ── Loading ── */
.drawer-loading {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 40px 0;
  color: var(--text-muted); font-size: 13px;
}
.loading-spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(139,92,246,.2);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Empty state ── */
.empty-state {
  text-align: center; padding: 40px 0;
  color: var(--text-muted); font-size: 13px;
}

/* ── Chunk card ── */
.chunk-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex; flex-direction: column;
  gap: 6px;
  transition: border-color .15s;
}
.chunk-card:hover { border-color: rgba(255,255,255,.12); }

.chunk-title {
  font-size: 13px; font-weight: 600; color: var(--accent-cyan);
  cursor: pointer; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.chunk-title:hover { color: #67e8f9; }

.chunk-content {
  font-size: 12px; line-height: 1.6;
  color: var(--text-secondary);
  padding: 6px 0;
  cursor: pointer;
}
.chunk-content :deep(p) { margin: 0 0 4px; }
.chunk-content :deep(code) {
  font-size: 11px; padding: 1px 4px;
  background: rgba(255,255,255,.04);
  border-radius: 3px;
}
.chunk-content :deep(pre) {
  font-size: 11px; padding: 6px;
  background: rgba(0,0,0,.2);
  border-radius: 4px;
  overflow-x: auto;
}

.chunk-separator {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255,255,255,.06), transparent);
}

.chunk-footer {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 6px;
}
.chunk-tags {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.chunk-tag {
  font-size: 10px; font-weight: 500;
  padding: 1px 6px; border-radius: 3px;
  background: rgba(139,92,246,.08); color: #a78bfa;
  border: 1px solid rgba(139,92,246,.12);
}
.chunk-tag-more {
  font-size: 10px; color: var(--text-muted);
}
.chunk-file {
  display: flex; align-items: center; gap: 4px;
  font-size: 10.5px; color: var(--text-muted);
  cursor: pointer; white-space: nowrap;
  padding: 2px 6px; border-radius: 4px;
  transition: all .12s;
}
.chunk-file:hover {
  color: var(--accent-cyan);
  background: rgba(6,182,212,.08);
}

/* ── Slide right animation ── */
.slide-right-enter-active { transition: all .25s ease-out; }
.slide-right-leave-active { transition: all .15s ease-in; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); opacity: 0; }
</style>
