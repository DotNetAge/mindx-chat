<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '../stores/graphStore'
import { getSchemaProperties } from '../services/graphApi'
import { getChineseLabel, getEntityColor, getPropertyLabel } from '../types/entityCategories'

const props = defineProps<{
  labelType: string   // e.g. 'Method', 'Topic', 'Person'
}>()

const { t } = useI18n()
const store = useGraphStore()

// ── Schema columns for this entity type ──
interface SchemaColumn {
  key: string
  label: string
}
const schemaColumns = ref<SchemaColumn[]>([])

// Pagination
const pageSize = 20
const currentPage = ref(1)

// ── Internal fields to exclude from table display ──
const INTERNAL_FIELDS = new Set(['id', 'source_doc_ids', 'confidence'])

onMounted(async () => {
  try {
    const res = await getSchemaProperties()
    const propsList = res.schemas[props.labelType] || []
    // Build columns: always include name first, then schema properties (excluding internal fields)
    const cols: SchemaColumn[] = [{ key: 'name', label: t('kgViewer.tableColName') || '名称' }]
    for (const k of propsList) {
      if (k !== 'name' && !INTERNAL_FIELDS.has(k)) {
        cols.push({ key: k, label: getPropertyLabel(k) || k })
      }
    }
    schemaColumns.value = cols
  } catch (e) {
    console.warn('[EntityListTab] failed to load schema:', e)
    // Fallback columns
    schemaColumns.value = [{ key: 'name', label: '名称' }, { key: 'description', label: '描述' }]
  }
})

/** All nodes matching this label type */
const allNodes = computed(() => {
  return store.nodes.filter(n =>
    n.labels.includes(props.labelType)
  )
})

/** Paginated data */
const pagedNodes = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return allNodes.value.slice(start, start + pageSize)
})

const totalNodes = computed(() => allNodes.value.length)

function formatCellValue(val: any): string {
  if (val === undefined || val === null) return ''
  if (Array.isArray(val)) return val.join(', ')
  return String(val)
}

function handleRowClick(row: any) {
  store.selectNode(row.id)
  store.loadNodeChunks(row.id)
}

function handlePageChange(page: number) {
  currentPage.value = page
}

/** Label color badge */
function labelBadge(label: string): { color: string; bg: string } {
  const c = getEntityColor(label)
  return { color: c, bg: c + '22' }
}

/** Get secondary labels (exclude current tab's labelType) */
function secondaryLabels(labels: string[]): string[] {
  return labels.filter(l => l !== props.labelType)
}

/** Whether any node has secondary labels (to decide if the Labels column is useful) */
const hasAnySecondaryLabel = computed(() => {
  return store.nodes.some(n =>
    n.labels.includes(props.labelType) && n.labels.length > 1
  )
})
</script>

<template>
  <div class="entity-list-tab">
    <!-- Toolbar -->
    <div class="elt-toolbar">
      <span class="elt-info">
        <span class="elt-label-badge" :style="labelBadge(labelType)">
          {{ getChineseLabel(labelType) }}
        </span>
        <span class="elt-count">{{ totalNodes }} {{ t('kgViewer.tableRecords') || '条记录' }}</span>
      </span>
    </div>

    <!-- Table -->
    <el-table
      :data="pagedNodes"
      :row-style="{ cursor: 'pointer' }"
      highlight-current-row
      stripe
      size="small"
      class="elt-table"
      @row-click="handleRowClick"
      empty-text="暂无数据"
    >
      <!-- Labels column (only shown when nodes have secondary labels beyond the tab's labelType) -->
      <el-table-column v-if="hasAnySecondaryLabel" :label="t('kgViewer.tableColLabels') || '类型'" width="90" fixed>
        <template #default="{ row }">
          <span
            v-for="lbl in secondaryLabels(row.labels)"
            :key="lbl"
            class="elt-cell-tag"
            :style="{ color: getEntityColor(lbl), backgroundColor: getEntityColor(lbl) + '20', borderColor: getEntityColor(lbl) + '40' }"
          >{{ getChineseLabel(lbl) }}</span>
          <span v-if="!secondaryLabels(row.labels).length" class="elt-cell-val">—</span>
        </template>
      </el-table-column>

      <!-- Schema property columns -->
      <el-table-column
        v-for="col in schemaColumns"
        :key="col.key"
        :prop="col.key"
        :label="col.label"
        min-width="140"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <span class="elt-cell-val">{{ formatCellValue(row.properties?.[col.key]) }}</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- Pagination -->
    <div class="elt-pagination" v-if="totalNodes > pageSize">
      <el-pagination
        size="small"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="totalNodes"
        :pager-count="5"
        layout="prev, pager, next, total"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.entity-list-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 8px 8px;
  overflow: hidden;
}

/* Toolbar */
.elt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 4px 6px;
  flex-shrink: 0;
}
.elt-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.elt-label-badge {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid;
  white-space: nowrap;
}
.elt-count {
  font-size: 12px;
  color: #64748b;
}

/* Table */
.elt-table {
  flex: 1;
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(6,182,212,.08);
  --el-table-border-color: rgba(55,65,81,.4);
  --el-table-text-color: #cbd5e1;
  --el-table-header-text-color: #94a3b8;
  font-size: 12px;
}
.elt-table :deep(.el-table__inner-wrapper::before) {
  display: none;
}
.elt-table :deep(.el-table__header) th.el-table__cell {
  background: rgba(255,255,255,.03) !important;
  color: #94a3b8 !important;
  border-bottom-color: rgba(55,65,81,.5) !important;
}
.elt-table :deep(.el-table__body tr) {
  background: transparent !important;
}
.elt-table :deep(.el-table__body .el-table__row--striped td.el-table__cell) {
  background: rgba(255,255,255,.02) !important;
}
.elt-table :deep(.el-table__body .current-row > td) {
  background: rgba(6,182,212,.10) !important;
}
.elt-table :deep(.el-table__body td.el-table__cell) {
  border-bottom-color: rgba(55,65,81,.25) !important;
}
.elt-cell-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 3px;
  border: 1px solid;
  line-height: 1.5;
  margin-right: 3px;
}
.elt-cell-val {
  color: #cbd5e1;
  font-size: 11.5px;
  line-height: 1.5;
}

/* Pagination */
.elt-pagination {
  display: flex;
  justify-content: center;
  padding: 8px 0 4px;
  flex-shrink: 0;
}
</style>
