<script setup lang="ts">
import { ref, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { getMindXClient } from '../../services/websocket'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
}>()

interface ScheduleEntry {
  id: string
  agent: string
  session_id?: string
  project_dir?: string
  content: string
  cron_expr: string
  enabled: boolean
  created_at: string
  updated_at: string
  last_run_at?: string
}

const schedules = ref<ScheduleEntry[]>([])
const loading = ref(false)
const selectedDate = ref(new Date())

function getCellData(date: Date) {
  const dateStr = date.toISOString().split('T')[0]
  const daySchedules = schedules.value.filter(s => {
    const sDate = new Date(s.created_at).toISOString().split('T')[0]
    return sDate === dateStr
  })
  return daySchedules.length > 0
    ? { schedules: daySchedules }
    : undefined
}

async function loadSchedules() {
  loading.value = true
  try {
    const client = getMindXClient()
    if (!client) return
    const result = await client.call<ScheduleEntry[]>('schedule.list', {})
    schedules.value = result || []
  } catch (err) {
    console.error('[MindX] Failed to load schedules:', err)
  } finally {
    loading.value = false
  }
}

function handleClose() {
  emit('update:visible', false)
}

function formatScheduleDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

watch(() => props.visible, (v) => {
  if (v) loadSchedules()
})
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="📅 计划任务日历"
    width="820px"
    :close-on-click-modal="false"
    @update:model-value="(v) => !v && handleClose()"
    class="schedule-view-dialog"
  >
    <div class="schedule-layout">
      <div class="calendar-section">
        <el-calendar v-model="selectedDate">
          <template #date-cell="{ data }">
            <div class="calendar-cell">
              <span class="cell-day">{{ data.day.split('-').slice(2).join('') }}</span>
              <div class="cell-schedules" v-if="getCellData(data.date)">
                <span
                  v-for="s in getCellData(data.date)!.schedules"
                  :key="s.id"
                  class="cell-dot"
                  :class="{ active: s.enabled }"
                ></span>
              </div>
            </div>
          </template>
        </el-calendar>
      </div>

      <div class="schedules-section">
        <div class="section-title">计划列表</div>

        <div v-if="loading" class="loading-state">
          <el-icon class="is-loading"><Loading /></el-icon>
          加载中...
        </div>

        <div v-else-if="schedules.length === 0" class="empty-state">
          暂无计划任务
        </div>

        <div v-else class="schedule-list">
          <div
            v-for="s in schedules"
            :key="s.id"
            class="schedule-card"
            :class="{ disabled: !s.enabled }"
          >
            <div class="schedule-header">
              <span class="schedule-agent">{{ s.agent }}</span>
              <span class="schedule-status" :class="{ active: s.enabled }">
                {{ s.enabled ? '启用' : '暂停' }}
              </span>
            </div>
            <div class="schedule-body">
              <p class="schedule-content">{{ s.content }}</p>
            </div>
            <div class="schedule-meta">
              <span class="meta-item">⏰ {{ s.cron_expr }}</span>
              <span class="meta-item">📅 {{ formatScheduleDate(s.created_at) }}</span>
              <span v-if="s.last_run_at" class="meta-item">🔄 {{ formatScheduleDate(s.last_run_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button type="primary" @click="loadSchedules">刷新</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.schedule-layout {
  display: flex;
  gap: 20px;
  min-height: 400px;
}

.calendar-section {
  flex: 1;
  min-width: 0;
}

.calendar-cell {
  text-align: center;
  padding: 2px;
}

.cell-day {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.cell-schedules {
  display: flex;
  justify-content: center;
  gap: 2px;
  margin-top: 2px;
}

.cell-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(55, 65, 81, 0.5);
}

.cell-dot.active {
  background: var(--accent-cyan);
}

.schedules-section {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.6);
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 200px;
  color: var(--text-muted);
  font-size: 13px;
}

.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  max-height: 340px;
}

.schedule-card {
  padding: 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.schedule-card:hover {
  border-color: rgba(6, 182, 212, 0.3);
  background: rgba(15, 23, 42, 0.8);
}

.schedule-card.disabled {
  opacity: 0.55;
}

.schedule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.schedule-agent {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-cyan);
  font-family: 'JetBrains Mono', monospace;
}

.schedule-status {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(55, 65, 81, 0.3);
  color: var(--text-muted);
}

.schedule-status.active {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.schedule-body {
  margin-bottom: 6px;
}

.schedule-content {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.5;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.schedule-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-item {
  font-size: 10px;
  color: var(--text-muted);
}

:deep(.el-calendar) {
  background: transparent;
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 10px;
  overflow: hidden;
}

:deep(.el-calendar__header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.6);
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

:deep(.el-calendar__title) {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

:deep(.el-calendar__button-group) {
  display: flex;
  gap: 6px;
}

:deep(.el-calendar__button-group .el-button-group) {
  display: flex;
  gap: 1px;
}

:deep(.el-calendar__button-group .el-button) {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(55, 65, 81, 0.5);
  color: var(--text-primary);
  font-size: 12px;
  padding: 4px 12px;
}

:deep(.el-calendar__button-group .el-button:hover) {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

:deep(.el-calendar-table) {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

:deep(.el-calendar-table thead th) {
  padding: 8px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
  background: rgba(15, 23, 42, 0.4);
  border-bottom: 1px solid rgba(55, 65, 81, 0.3);
}

:deep(.el-calendar-table td) {
  border: 1px solid rgba(55, 65, 81, 0.15);
  background: rgba(15, 23, 42, 0.2);
  text-align: center;
  padding: 6px 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  vertical-align: top;
  height: 64px;
}

:deep(.el-calendar-table td:hover) {
  background: rgba(6, 182, 212, 0.06);
}

:deep(.el-calendar-table td.is-today) {
  background: rgba(6, 182, 212, 0.1);
}

:deep(.el-calendar-table td.is-today .cell-day) {
  color: var(--accent-cyan);
}

:deep(.el-calendar-table td.is-selected) {
  background: rgba(6, 182, 212, 0.08);
}

:deep(.el-calendar-table td.prev),
:deep(.el-calendar-table td.next) {
  background: rgba(15, 23, 42, 0.1);
}

:deep(.el-calendar-table td.prev .cell-day),
:deep(.el-calendar-table td.next .cell-day) {
  color: rgba(100, 116, 139, 0.4);
}

:deep(.el-calendar-table .el-calendar-day) {
  height: auto;
  padding: 0;
}
</style>
