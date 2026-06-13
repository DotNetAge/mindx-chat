<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loading, Close, Calendar, Plus } from '@element-plus/icons-vue'
import { getMindXClient } from '../../services/websocket'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useConnectionStore } from '../../stores/connectionStore'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'

const { t, locale } = useI18n()
const store = useScheduleStore()
const connectionStore = useConnectionStore()

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

// ── 已有计划列表 ──
const schedules = ref<ScheduleEntry[]>([])
const loading = ref(false)
const calendarRef = ref<InstanceType<typeof FullCalendar> | null>(null)
const filterAgent = ref('')
const allAgents = computed(() => {
  const set = new Set(schedules.value.map(s => s.agent))
  return Array.from(set).sort()
})
const filteredSchedules = computed(() => {
  if (!filterAgent.value) return schedules.value
  return schedules.value.filter(s => s.agent === filterAgent.value)
})

// ── 双击检测（FullCalendar 无原生双击事件） ──
const lastClick = ref<{ date: string; time: number } | null>(null)

function handleDateClick(info: { dateStr: string; date: Date }) {
  const now = Date.now()
  if (lastClick.value && lastClick.value.date === info.dateStr && now - lastClick.value.time < 500) {
    // 双击同一日期 → 打开创建表单
    openCreateDialog(info.dateStr)
    lastClick.value = null
  } else {
    lastClick.value = { date: info.dateStr, time: now }
  }
}

// ── 根据当前语言选择 meta 中的对应字段 ──
function getAgentLocaleName(agent: { name: string; meta?: Record<string, any> }): string {
  if (!agent.meta) return agent.name
  const loc = locale.value
  let key: string
  if (loc === 'zh') key = 'name_zh'
  else if (loc === 'zh-TW') key = 'name_zh-tw'
  else return agent.name
  const v = agent.meta[key]
  return v != null ? String(v) : agent.name
}

// ── 创建任务表单 ──
const dialogVisible = ref(false)
const saving = ref(false)
const dialogDate = ref('')
const CRON_OPTIONS = [
  { label: t('schedule.cronNone'), value: '' },
  { label: t('schedule.cronHourly'), value: '0 * * * *' },
  { label: t('schedule.cronDaily'), value: '0 0 * * *' },
  { label: t('schedule.cronWeekly'), value: '0 0 * * 0' },
  { label: t('schedule.cronMonthly'), value: '0 0 1 * *' },
  { label: t('schedule.cronCustom'), value: '__custom__' },
]
const formModel = ref({
  agent: '',
  content: '',
  isRecurring: false,
  cronPreset: '',
  cronCustom: '',
  scheduledAt: '',
  scheduledTime: '09:00',
})

function resetForm() {
  formModel.value = {
    agent: connectionStore.agents[0]?.name || '',
    content: '',
    isRecurring: false,
    cronPreset: '',
    cronCustom: '',
    scheduledAt: dialogDate.value,
    scheduledTime: '09:00',
  }
}

function openCreateDialog(dateStr: string) {
  dialogDate.value = dateStr
  resetForm()
  dialogVisible.value = true
}

function handleDialogClose() {
  dialogVisible.value = false
}

const computedCronExpr = computed(() => {
  if (!formModel.value.isRecurring) return ''
  if (formModel.value.cronPreset === '__custom__') return formModel.value.cronCustom.trim()
  return formModel.value.cronPreset
})

async function handleSubmit() {
  if (!formModel.value.content.trim()) return
  saving.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('Not connected')

    const params: Record<string, any> = {
      agent: formModel.value.agent,
      content: formModel.value.content.trim(),
    }

    if (formModel.value.isRecurring && computedCronExpr.value) {
      params.cron_expr = computedCronExpr.value
    } else {
      // 单次任务 → 拼接日期时间
      const iso = `${dialogDate.value}T${formModel.value.scheduledTime}:00`
      params.scheduled_at = iso
    }

    await client.call('schedule.create', params)
    dialogVisible.value = false
    await loadSchedules()
  } catch (err) {
    console.error('[Schedule] Failed to create:', err)
  } finally {
    saving.value = false
  }
}

// ── 日历事件 ──
const calendarEvents = computed(() => {
  return filteredSchedules.value.map(s => {
    const hasCron = !!s.cron_expr
    return {
      id: s.id,
      title: `[${s.agent}] ${s.content}`,
      start: hasCron ? s.created_at : (s.last_run_at || s.created_at),
      end: s.last_run_at || s.created_at,
      extendedProps: {
        agent: s.agent,
        content: s.content,
        cron: s.cron_expr,
        enabled: s.enabled,
        createdAt: s.created_at,
        lastRunAt: s.last_run_at,
      },
      classNames: s.enabled ? ['fc-event-enabled'] : ['fc-event-disabled'],
      display: 'auto',
    }
  })
})

const calendarOptions = computed(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin],
  initialView: 'dayGridMonth',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
  },
  buttonText: {
    today: t('schedule.today'),
    month: t('schedule.monthView'),
    week: t('schedule.weekView'),
    day: t('schedule.dayView'),
    list: t('schedule.listView'),
  },
  locale: 'zh-cn',
  events: calendarEvents.value,
  height: '100%',
  firstDay: 1,
  slotMinTime: '00:00:00',
  slotMaxTime: '24:00:00',
  allDaySlot: false,
  nowIndicator: true,
  editable: false,
  selectable: false,
  dayMaxEvents: 3,
  eventTimeFormat: {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
  noEventsText: t('schedule.empty'),
  moreLinkText: (n: number) => `+${n}`,
  dateClick: handleDateClick,
}))

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
  store.close()
}

function handleEventClick(info: any) {
  const props = info.event.extendedProps
  console.log('[Schedule] Event clicked:', info.event.title, props)
}

watch(() => store.visible, (v) => {
  if (v) loadSchedules()
})
</script>

<template>
  <Teleport to="body">
    <transition name="fade-scale">
      <div v-if="store.visible" class="sv-overlay">
        <!-- Header bar -->
        <header class="sv-header">
          <div class="sv-header-left">
            <h1 class="sv-title">
              <el-icon><Calendar /></el-icon>
              {{ t('schedule.calendarTitle') }}
            </h1>
            <span class="sv-count">{{ filteredSchedules.length }} / {{ schedules.length }} {{ t('schedule.listTitle') }}</span>
          </div>
          <div class="sv-header-right">
            <!-- Agent filter -->
            <el-select
              v-model="filterAgent"
              size="small"
              :placeholder="t('schedule.filterAll')"
              clearable
              teleported
              popper-class="schedule-popper"
              class="sv-filter"
            >
              <el-option
                v-for="name in allAgents"
                :key="name"
                :label="name"
                :value="name"
              />
            </el-select>
            <el-button size="small" @click="loadSchedules" :loading="loading">{{ t('schedule.refresh') }}</el-button>
            <button class="close-btn" @click="handleClose" :title="t('common.close')" aria-label="Close">
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </header>

        <!-- Body -->
        <div class="sv-body">
          <div v-if="loading && schedules.length === 0" class="sv-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
            {{ t('schedule.loading') }}
          </div>
          <div v-else class="sv-calendar fc-dark">
            <FullCalendar
              ref="calendarRef"
              :options="calendarOptions"
              @date-click="handleDateClick"
              @event-click="handleEventClick"
            />
          </div>
        </div>

        <!-- 底部提示 -->
        <footer class="sv-footer">
          <span class="sv-tip">{{ t('schedule.dblClickTip') }}</span>
        </footer>
      </div>
    </transition>

    <!-- 创建任务面板（在 Overlay 内居中弹出） -->
    <div v-if="dialogVisible" class="sv-form-overlay" @click.self="handleDialogClose">
      <div class="sv-form-panel">
        <header class="sv-form-header">
          <h3>{{ t('schedule.createTitle') }}</h3>
          <button class="close-btn" @click="handleDialogClose" :title="t('common.close')" aria-label="Close">
            <el-icon><Close /></el-icon>
          </button>
        </header>
        <div class="sv-form-body">
          <el-form label-position="top" class="sv-form" @submit.prevent="handleSubmit">
            <!-- Agent -->
            <el-form-item :label="t('schedule.formAgent')">
              <el-select v-model="formModel.agent" class="sv-field" teleported popper-class="schedule-popper">
                <el-option
                  v-for="a in connectionStore.agents"
                  :key="a.name"
                  :label="getAgentLocaleName(a)"
                  :value="a.name"
                />
              </el-select>
            </el-form-item>

            <!-- 日期 -->
            <el-form-item :label="t('schedule.formDate')">
              <el-date-picker
                v-model="dialogDate"
                type="date"
                value-format="YYYY-MM-DD"
                class="sv-field"
                popper-class="schedule-popper"
              />
            </el-form-item>

            <!-- 时间 -->
            <el-form-item :label="t('schedule.formTime')" v-if="!formModel.isRecurring">
              <el-time-picker
                v-model="formModel.scheduledTime"
                format="HH:mm"
                value-format="HH:mm"
                class="sv-field"
                popper-class="schedule-popper"
              />
            </el-form-item>

            <!-- 内容 -->
            <el-form-item :label="t('schedule.formContent')">
              <el-input
                v-model="formModel.content"
                type="textarea"
                :rows="3"
                :placeholder="t('schedule.formContentPlaceholder')"
                class="sv-field"
              />
            </el-form-item>

            <!-- 周期性开关 -->
            <el-form-item>
              <el-checkbox v-model="formModel.isRecurring">
                {{ t('schedule.formRecurring') }}
              </el-checkbox>
            </el-form-item>

            <!-- CRON 预设 -->
            <el-form-item :label="t('schedule.formCron')" v-if="formModel.isRecurring">
              <el-select v-model="formModel.cronPreset" class="sv-field" teleported popper-class="schedule-popper">
                <el-option
                  v-for="opt in CRON_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <el-input
                v-if="formModel.cronPreset === '__custom__'"
                v-model="formModel.cronCustom"
                :placeholder="t('schedule.cronCustomPlaceholder')"
                class="sv-field"
                style="margin-top: 8px"
              />
            </el-form-item>
          </el-form>
        </div>
        <footer class="sv-form-footer">
          <el-button @click="handleDialogClose">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleSubmit" :loading="saving">
            {{ t('common.confirm') }}
          </el-button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ─── Overlay ─── */
.sv-overlay {
  position: fixed; inset: 0; z-index: 8000;
  display: flex; flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

/* ─── Header ─── */
.sv-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 20px;
  min-height: 48px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.sv-header-left {
  display: flex; align-items: center; gap: 12px;
}
.sv-title {
  font-size: 16px; font-weight: 700; color: var(--text-primary);
  margin: 0;
  display: flex; align-items: center; gap: 8px;
}
.sv-count {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  padding: 2px 8px;
  background: rgba(6, 182, 212, 0.08);
  border-radius: 6px;
}
.sv-header-right {
  display: flex; align-items: center; gap: 8px;
}
.sv-filter {
  width: 140px;
}

/* ─── Popper style for agent filter ─── */
:global(.schedule-popper) {
  z-index: 9001 !important;
  background: #1e293b;
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
:global(.schedule-popper .el-select-dropdown__item) {
  color: #e2e8f0;
  font-size: 12px;
}
:global(.schedule-popper .el-select-dropdown__item.hover),
:global(.schedule-popper .el-select-dropdown__item.selected) {
  background: rgba(6, 182, 212, 0.1);
  color: #22d3ee;
}
.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px; cursor: pointer;
  transition: all .15s;
}
.close-btn:hover {
  color: #f87171;
  background: rgba(239, 68, 68, 0.12);
}

/* ─── Body ─── */
.sv-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding: 16px 20px 8px;
}

.sv-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
}

.sv-calendar {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Footer ─── */
.sv-footer {
  flex-shrink: 0;
  padding: 6px 20px 10px;
  text-align: center;
}
.sv-tip {
  font-size: 11px;
  color: #64748b;
  opacity: 0.7;
}

/* ─── 创建任务面板 ─── */
.sv-form-overlay {
  position: fixed; inset: 0;
  z-index: 8500;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}
.sv-form-panel {
  width: 480px;
  max-height: 85vh;
  display: flex; flex-direction: column;
  background: var(--bg-card);
  border: 1px solid rgba(55, 65, 81, 0.6);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.sv-form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.4);
  flex-shrink: 0;
}
.sv-form-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.sv-form-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.sv-form-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 14px 20px 16px;
  border-top: 1px solid rgba(55, 65, 81, 0.4);
  background: rgba(15, 23, 42, 0.4);
  flex-shrink: 0;
  border-radius: 0 0 14px 14px;
}
.sv-form-body :deep(.el-form-item__label) {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding-bottom: 2px;
}
.sv-field {
  width: 100%;
}
.sv-form-panel :deep(.el-input__wrapper),
.sv-form-panel :deep(.el-textarea__inner) {
  background: var(--bg-secondary) !important;
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 8px;
  box-shadow: none;
}
.sv-form-panel :deep(.el-input__wrapper:hover),
.sv-form-panel :deep(.el-textarea__inner:hover) {
  border-color: rgba(6, 182, 212, 0.4);
}
.sv-form-panel :deep(.el-input__wrapper.is-focus),
.sv-form-panel :deep(.el-textarea__inner:focus) {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 1px rgba(6, 182, 212, 0.2);
}
.sv-form-panel :deep(.el-input__inner) {
  color: var(--text-primary);
}
.sv-form-panel :deep(.el-select) {
  width: 100%;
}
.sv-form-panel :deep(.el-checkbox__label) {
  color: var(--text-secondary);
  font-size: 13px;
}

/* ─── Transition ─── */
.fade-scale-enter-active { transition: opacity .2s ease, transform .2s ease; }
.fade-scale-leave-active { transition: opacity .15s ease, transform .15s ease; }
.fade-scale-enter-from { opacity: 0; transform: scale(.97); }
.fade-scale-leave-to { opacity: 0; transform: scale(.97); }

/* ================================================
   FullCalendar dark theme overrides
   ================================================ */
.sv-calendar :deep(.fc) {
  flex: 1;
  display: flex;
  flex-direction: column;
  --fc-border-color: rgba(55, 65, 81, 0.4);
  --fc-button-text-color: #e2e8f0;
  --fc-button-bg-color: rgba(15, 23, 42, 0.8);
  --fc-button-border-color: rgba(55, 65, 81, 0.5);
  --fc-button-hover-bg-color: rgba(6, 182, 212, 0.1);
  --fc-button-hover-border-color: #06b6d4;
  --fc-button-active-bg-color: rgba(6, 182, 212, 0.15);
  --fc-button-active-border-color: #06b6d4;
  --fc-today-bg-color: rgba(6, 182, 212, 0.08);
  --fc-event-bg-color: rgba(6, 182, 212, 0.15);
  --fc-event-border-color: rgba(6, 182, 212, 0.3);
  --fc-event-text-color: #22d3ee;
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: rgba(15, 23, 42, 0.2);
  --fc-list-event-hover-bg-color: rgba(6, 182, 212, 0.06);
  --fc-now-indicator-color: #ef4444;
  --fc-highlight-color: rgba(6, 182, 212, 0.05);
  --fc-more-link-bg-color: transparent;
  --fc-more-link-text-color: #64748b;
  font-family: inherit;
  font-size: 13px;
  color: #e2e8f0;
}

.sv-calendar :deep(.fc-header-toolbar) {
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 10px;
  border: 1px solid rgba(55, 65, 81, 0.4);
}

.sv-calendar :deep(.fc-toolbar-title) {
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
}

.sv-calendar :deep(.fc-button) {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 6px;
  transition: all 0.15s;
  text-transform: none;
  box-shadow: none;
}

.sv-calendar :deep(.fc-button-primary:not(:disabled).fc-button-active),
.sv-calendar :deep(.fc-button-primary:not(:disabled):active) {
  background: rgba(6, 182, 212, 0.15);
  border-color: #06b6d4;
  color: #22d3ee;
}

.sv-calendar :deep(.fc-button-primary:disabled) {
  opacity: 0.4;
}

.sv-calendar :deep(.fc-today-button) {
  font-weight: 600;
}

.sv-calendar :deep(.fc-theme-standard .fc-scrollgrid) {
  border: 1px solid rgba(55, 65, 81, 0.3);
  border-radius: 8px;
  overflow: hidden;
}

.sv-calendar :deep(.fc-theme-standard th) {
  padding: 6px 0;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(15, 23, 42, 0.4);
  border-color: rgba(55, 65, 81, 0.3);
}

.sv-calendar :deep(.fc-theme-standard td) {
  border-color: rgba(55, 65, 81, 0.15);
}

.sv-calendar :deep(.fc-daygrid-day) {
  transition: background 0.15s;
}

.sv-calendar :deep(.fc-daygrid-day:hover) {
  background: rgba(6, 182, 212, 0.04);
}

.sv-calendar :deep(.fc-daygrid-day-number) {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 6px;
  color: #94a3b8;
}

.sv-calendar :deep(.fc-day-today .fc-daygrid-day-number) {
  color: #22d3ee;
}

.sv-calendar :deep(.fc-day-other .fc-daygrid-day-number) {
  opacity: 0.35;
}

.sv-calendar :deep(.fc-event) {
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  margin: 1px 2px;
  transition: opacity 0.15s;
}

.sv-calendar :deep(.fc-event:hover) {
  opacity: 0.85;
}

.sv-calendar :deep(.fc-event-disabled) {
  opacity: 0.4;
}

.sv-calendar :deep(.fc-event-title) {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sv-calendar :deep(.fc-daygrid-more-link) {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  padding: 0 4px;
}

.sv-calendar :deep(.fc-daygrid-more-link:hover) {
  color: #22d3ee;
}

.sv-calendar :deep(.fc-timegrid-slot) {
  border-color: rgba(55, 65, 81, 0.1);
}

.sv-calendar :deep(.fc-timegrid-slot-label) {
  font-size: 10px;
  color: #64748b;
  font-family: 'JetBrains Mono', monospace;
}

.sv-calendar :deep(.fc-timegrid-axis) {
  color: #64748b;
}

.sv-calendar :deep(.fc-timegrid-now-indicator-line) {
  border-color: #ef4444;
  border-width: 1.5px;
}

.sv-calendar :deep(.fc-timegrid-now-indicator-arrow) {
  border-color: #ef4444;
}

.sv-calendar :deep(.fc-list-day-cushion) {
  background: rgba(15, 23, 42, 0.3);
  padding: 6px 12px;
}

.sv-calendar :deep(.fc-list-day-text) {
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
}

.sv-calendar :deep(.fc-list-day-side-text) {
  font-size: 11px;
  color: #64748b;
}

.sv-calendar :deep(.fc-list-event:hover td) {
  background: rgba(6, 182, 212, 0.03);
}

.sv-calendar :deep(.fc-list-event-title) {
  font-size: 12px;
  color: #cbd5e1;
}

.sv-calendar :deep(.fc-list-event-time) {
  font-size: 11px;
  color: #64748b;
  font-family: 'JetBrains Mono', monospace;
}

.sv-calendar :deep(.fc-list-empty) {
  background: transparent;
  color: #64748b;
  font-size: 13px;
  padding: 40px;
}

.sv-calendar :deep(.fc-popover) {
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.sv-calendar :deep(.fc-popover-header) {
  background: rgba(15, 23, 42, 0.9);
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  color: #f1f5f9;
  border-bottom: 1px solid rgba(55, 65, 81, 0.3);
}

.sv-calendar :deep(.fc-popover-body) {
  padding: 4px;
}

.sv-calendar :deep(.fc-popover-close) {
  color: #64748b;
}

.sv-calendar :deep(.fc-list-event-dot) {
  border-color: #06b6d4;
}
</style>
