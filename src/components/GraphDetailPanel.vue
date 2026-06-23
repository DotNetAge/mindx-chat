<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Document, InfoFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '../stores/graphStore'
import { useMarkdown } from '../composables/useMarkdown'
import { getChineseLabel, getEntityColor, getPropertyLabel } from '../types/entityCategories'
import { getSchemaProperties } from '../services/graphApi'

const { t } = useI18n()
const store = useGraphStore()
const { md, renderMermaidInRoot } = useMarkdown()

// ── Schema 属性白名单（从服务端动态加载，所有 Schema 的并集） ──
const allSchemaKeys = ref<Set<string>>(new Set())
// Mermaid 渲染目标容器
const drawerBodyRef = ref<HTMLElement | null>(null)
// 折叠面板状态
const collapseActive = ref<string[]>(['properties'])

onMounted(async () => {
  try {
    const res = await getSchemaProperties()
    const keys = new Set<string>()
    for (const propList of Object.values(res.schemas || {})) {
      for (const k of propList) {
        keys.add(k)
      }
    }
    allSchemaKeys.value = keys
  } catch (e) {
    console.warn('[GraphDetailPanel] failed to load schema properties:', e)
  }
})

// 当分片内容更新后，渲染 Mermaid 图表
watch(() => store.detailChunks, async () => {
  await nextTick()
  // 展开分片面板（有数据时自动展开）
  if (store.detailChunks.length > 0 && !collapseActive.value.includes('chunks')) {
    collapseActive.value.push('chunks')
  }
  await renderMermaidInRoot(drawerBodyRef.value)
}, { flush: 'post' })

const nodeName = computed(() => {
  const n = store.selectedNode
  return n?.properties?.name || n?.id || ''
})

/** 内部字段（始终不显示） */
const internalKeys = new Set(['name', 'source_chunk_ids', 'ID'])

/** 将节点属性转为列表，仅保留 Schema 白名单内的属性（所有 Schema 并集） */
const nodeProperties = computed(() => {
  const n = store.selectedNode
  if (!n) return []

  const props = n.properties || {}
  const allowedKeys = allSchemaKeys.value

  const entries: { label: string; value: any; type: string; color?: string }[] = []

  // Labels — 每个标签独立一行，用中文 + 颜色
  if (n.labels?.length) {
    for (const lbl of n.labels) {
      entries.push({
        label: t('kgViewer.nodeTypeLabel'),
        value: getChineseLabel(lbl),
        type: 'tag',
        color: getEntityColor(lbl),
      })
    }
  }

  // Properties — 仅显示在任意 Schema 中定义的属性
  for (const [key, val] of Object.entries(props)) {
    if (internalKeys.has(key)) continue
    if (allowedKeys.size > 0 && !allowedKeys.has(key)) continue
    if (val === undefined || val === null || val === '') continue
    if (Array.isArray(val) && val.length === 0) continue
    const translatedKey = getPropertyLabel(key)
    entries.push({
      label: translatedKey,
      value: Array.isArray(val) ? val.join(', ') : String(val),
      type: typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'bool' : 'text',
    })
  }

  return entries
})

function renderMd(text: string): string {
  if (!text) return ''
  try { return md.render(text) }
  catch { return text }
}

function closeDrawer() {
  store.detailChunks = []
  store.selectNode(null)
}
</script>

<template>
  <transition name="slide-right">
    <div
      v-if="store.selectedNodeId"
      class="detail-drawer"
    >
      <!-- Header -->
      <div class="drawer-header">
        <div class="drawer-title-row">
          <span class="drawer-title">{{ nodeName }}</span>
          <span class="drawer-badge" v-if="store.detailChunks.length > 0">{{ store.detailChunks.length }} {{ t('kgViewer.chunksCount') }}</span>
        </div>
        <button class="drawer-close" @click="closeDrawer">&times;</button>
      </div>

      <!-- Body: el-collapse 两栏折叠面板 -->
      <div class="drawer-body" ref="drawerBodyRef">
        <el-collapse v-model="collapseActive" class="detail-collapse">

          <!-- ── Panel 1: 节点属性 ── -->
          <el-collapse-item name="properties">
            <template #title>
              <span class="collapse-title">
                <el-icon :size="13"><InfoFilled /></el-icon>
                {{ t('kgViewer.nodeProperties') }}
              </span>
            </template>

            <div class="property-list" v-if="nodeProperties.length > 0">
              <div
                v-for="(prop, idx) in nodeProperties"
                :key="idx"
                class="property-row"
              >
                <span class="prop-label">{{ prop.label }}</span>
                <span class="prop-value-wrap">
                  <template v-if="prop.type === 'tag'">
                    <span
                      class="prop-tag"
                      :style="{ color: prop.color || '#94a3b8', borderColor: (prop.color || '#94a3b8') + '55', backgroundColor: (prop.color || '#94a3b8') + '18' }"
                    >{{ prop.value }}</span>
                  </template>
                  <template v-else-if="prop.type === 'bool'">
                    <span
                      class="prop-tag"
                      :style="{ color: prop.value ? '#34d399' : '#f87171', borderColor: (prop.value ? '#34d399' : '#f87171') + '55', backgroundColor: (prop.value ? '#34d399' : '#f87171') + '18' }"
                    >{{ prop.value ? t('common.yes') : t('common.no') }}</span>
                  </template>
                  <template v-else-if="prop.type === 'number'">
                    <span class="prop-value-num">{{ prop.value }}</span>
                  </template>
                  <template v-else>
                    <span class="prop-value-text">{{ prop.value }}</span>
                  </template>
                </span>
              </div>
            </div>
            <div v-else class="no-props">{{ t('kgViewer.noNodeProperties') }}</div>
          </el-collapse-item>

          <!-- ── Panel 2: 关联分片 ── -->
          <el-collapse-item name="chunks" v-if="store.detailChunks.length > 0 || store.detailLoading">
            <template #title>
              <span class="collapse-title">
                <el-icon :size="13"><Document /></el-icon>
                {{ t('kgViewer.relatedChunks') }}
                <span v-if="store.detailChunks.length" class="collapse-count">({{ store.detailChunks.length }})</span>
              </span>
            </template>

            <!-- Loading -->
            <div v-if="store.detailLoading" class="drawer-loading">
              <div class="loading-spinner"></div>
              <span>{{ t('common.loading') }}</span>
            </div>

            <!-- Chunk list -->
            <template v-else>
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
            </template>
          </el-collapse-item>

        </el-collapse>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.detail-drawer {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 440px;
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
  padding: 4px 8px 12px;
}

/* ── el-collapse 暗色主题覆盖 ── */
.detail-collapse {
  --el-collapse-header-bg-color: transparent;
  --el-collapse-header-text-color: #cbd5e1;
  --el-collapse-header-font-size: 12.5px;
  --el-collapse-content-bg-color: transparent;
  --el-collapse-border-color: rgba(55,65,81,.35);
  border: none;
}
.collapse-title {
  display: flex; align-items: center; gap: 6px;
  font-weight: 600; font-size: 12.5px;
  color: #06b6d4;
  white-space: nowrap;
}
.collapse-count {
  font-weight: 400; color: #64748b;
  font-size: 11px;
}

/* ── Property list (inside collapse panel) ── */
.property-list {
  padding: 2px 0 6px;
}
.property-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 14px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.25);
  transition: background-color .12s;
}
.property-row:last-child {
  border-bottom: none;
}
.property-row:hover {
  background: rgba(255, 255, 255, 0.02);
}
.prop-label {
  flex-shrink: 0;
  width: 80px;
  min-width: 80px;
  font-size: 11.5px;
  font-weight: 500;
  color: #94a3b8;
  text-align: right;
  line-height: 1.6;
}
.prop-value-wrap {
  flex: 1;
  min-width: 0;
  line-height: 1.6;
}
.prop-tag {
  display: inline-block;
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid;
  line-height: 1.6;
}
.prop-value-num {
  font-family: 'JetBrains Mono', monospace;
  color: #06b6d4;
  font-weight: 500;
  font-size: 11.5px;
}
.prop-value-text {
  color: #cbd5e1;
  font-size: 11.5px;
  word-break: break-all;
}
.no-props {
  text-align: center;
  padding: 14px 0;
  color: #64748b;
  font-size: 12px;
}

/* ── Loading ── */
.drawer-loading {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0;
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

/* ── Chunk card ── */
.chunk-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex; flex-direction: column;
  gap: 6px;
  transition: border-color .15s;
  margin-bottom: 8px;
}
.chunk-card:last-child { margin-bottom: 0; }
.chunk-card:hover { border-color: rgba(255,255,255,.12); }

.chunk-title {
  font-size: 13px; font-weight: 600; color: var(--accent-cyan);
  cursor: pointer; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.chunk-title:hover { color: #67e8f9; }

.chunk-content {
  font-size: 12px; line-height: 1.7;
  color: #cbd5e1;
  padding: 6px 0;
  cursor: pointer;
}
.chunk-content :deep(p) { margin: 0 0 8px; }
.chunk-content :deep(p:last-child) { margin-bottom: 0; }

/* ── Headings ── */
.chunk-content :deep(h1),
.chunk-content :deep(h2),
.chunk-content :deep(h3),
.chunk-content :deep(h4) {
  font-weight: 700; color: #e2e8f0; line-height: 1.3;
  margin: 12px 0 6px;
}
.chunk-content :deep(h1) { font-size: 15px; }
.chunk-content :deep(h2) { font-size: 14px; border-bottom: 1px solid rgba(55,65,81,.5); padding-bottom: 4px; }
.chunk-content :deep(h3) { font-size: 13px; color: #94a3b8; }
.chunk-content :deep(h4) { font-size: 12.5px; color: #94a3b8; }

/* ── Lists ── */
.chunk-content :deep(ul), .chunk-content :deep(ol) {
  padding-left: 18px; margin: 6px 0;
}
.chunk-content :deep(li) {
  margin-bottom: 3px; line-height: 1.6;
  list-style-position: outside;
}
.chunk-content :deep(ul > li::marker) { color: #06b6d4; }
.chunk-content :deep(ol > li::marker) { color: #a78bfa; font-weight: 600; font-size: 10.5px; }
.chunk-content :deep(li > ul), .chunk-content :deep(li > ol) { margin-top: 2px; margin-bottom: 2px; }

/* ── Table ── */
.chunk-content :deep(table) {
  width: 100%; border-collapse: collapse;
  margin: 8px 0; font-size: 11.5px;
  border: 1px solid rgba(55,65,81,.5);
  border-radius: 6px; overflow: hidden;
}
.chunk-content :deep(th) {
  background: rgba(6,182,212,.08); color: #06b6d4;
  font-weight: 600; text-align: left;
  padding: 6px 10px; border-bottom: 1px solid rgba(55,65,81,.5);
}
.chunk-content :deep(td) {
  padding: 5px 10px; border-bottom: 1px solid rgba(55,65,81,.25);
  color: #cbd5e1; vertical-align: top;
}
.chunk-content :deep(tr:last-child td) { border-bottom: none; }
.chunk-content :deep(tr:hover td) { background: rgba(255,255,255,.03); }

/* ── Blockquote ── */
.chunk-content :deep(blockquote) {
  margin: 8px 0; padding: 6px 12px;
  border-left: 3px solid #06b6d4;
  background: rgba(6,182,212,.04);
  color: #94a3b8; font-style: italic;
  border-radius: 0 4px 4px 0;
}

/* ── Code (inline) ── */
.chunk-content :deep(code) {
  font-size: 11px; padding: 1px 5px;
  background: rgba(255,255,255,.06);
  border-radius: 3px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #f472b6;
}

/* ── Pre (code block) ── */
.chunk-content :deep(pre) {
  font-size: 11px; padding: 8px 10px;
  background: #0d1117;
  border-radius: 6px;
  overflow-x: auto;
  border: 1px solid rgba(55,65,81,.4);
  margin: 8px 0;
}
.chunk-content :deep(pre code) {
  padding: 0; background: transparent;
  color: inherit; font-size: inherit;
}

/* ── Links ── */
.chunk-content :deep(a) {
  color: #38bdf8; text-decoration: none;
  border-bottom: 1px dashed rgba(56,189,248,.4);
  transition: all .15s;
}
.chunk-content :deep(a:hover) {
  color: #7dd3fc; border-bottom-color: #7dd3fc;
}

/* ── Strong / Em ── */
.chunk-content :deep(strong) { color: #f1f5f9; font-weight: 700; }
.chunk-content :deep(em) { color: #a78bfa; }

/* ── HR ── */
.chunk-content :deep(hr) {
  border: none; height: 1px;
  background: linear-gradient(to right, transparent, rgba(55,65,81,.5), transparent);
  margin: 10px 0;
}

/* ── Mermaid diagram container ── */
.chunk-content :deep(.mermaid) {
  display: flex; justify-content: center;
  margin: 10px 0; padding: 12px;
  background: #161b22;
  border: 1px solid rgba(55,65,81,.4);
  border-radius: 8px;
  overflow-x: auto;
}
.chunk-content :deep(.mermaid svg) {
  max-width: 100%; height: auto;
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

<!-- 全局样式：确保确认对话框在 GraphViewer (z:8000) 之上 -->
<style>
/* Element Plus MessageBox overlay — must be above GraphViewer's z-index:8000 */
.el-overlay:has(.el-message-box) {
  z-index: 9000 !important;
}
</style>
