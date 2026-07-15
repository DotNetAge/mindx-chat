<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConnectionStore } from '../stores/connectionStore'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import type { MonthlyUsageStats, ModelUsageSummary } from '../types/websocket'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible'])

const connectionStore = useConnectionStore()
const chatStore = useChatStore()
const sessionStore = useSessionStore()
const { t } = useI18n()

const loading = ref(false)
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)
const monthlyData = ref<MonthlyUsageStats | null>(null)
const error = ref<string | null>(null)

const viewMode = ref<'monthly' | 'session'>('monthly')

// 从服务端加载的会话 token 明细
const sessionServerRecords = ref<Array<{
  timestamp: string
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  totalTokens: number
  cost: number
  sessionId: string
  modelName: string
  providerName: string
}>>([])

const sessionDetailLoading = ref(false)

async function loadSessionDetail() {
  const sessionId = sessionStore.activeSessionId
  if (!sessionId || !connectionStore.isConnected) {
    sessionServerRecords.value = []
    return
  }
  sessionDetailLoading.value = true
  try {
    const data = await connectionStore.fetchSessionTokenDetail(sessionId)
    sessionServerRecords.value = (data.records || []).map(r => ({
      timestamp: r.timestamp,
      promptTokens: r.input_tokens,
      completionTokens: r.output_tokens,
      cachedTokens: r.cached_tokens,
      totalTokens: r.total_tokens,
      cost: r.cost,
      sessionId,
      modelName: r.model_name,
      providerName: r.provider_name,
    }))
  } catch (err) {
    console.warn('[TokenUsageReport] Failed to load session detail from server:', err)
    sessionServerRecords.value = []
  } finally {
    sessionDetailLoading.value = false
  }
}

const sessionRecords = computed(() => {
  const sessionId = sessionStore.activeSessionId

  // 1. 从服务端加载的持久化明细（token.usage.session.detail）
  const serverRecords = sessionServerRecords.value

  // 2. 实时记录（token_usage_recorded 事件，当前会话未刷新时）
  const liveRecords = chatStore.tokenUsageRecords.filter(r => r.sessionId === sessionId)

  // 合并去重：按 timestamp + totalTokens 去重（服务端优先，避免重复）
  const seen = new Set<string>()
  const merged = [...serverRecords, ...liveRecords].filter(r => {
    const key = `${r.timestamp}|${r.totalTokens}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map(r => ({
    ...r,
    // 计费口径：prompt + completion - cached，与月度统计 total_tokens 保持一致
    actualTokens: Math.max(0, r.promptTokens + r.completionTokens - r.cachedTokens)
  }))

  // 按时间倒序（最新在前）
  merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return merged
})

const formatCost = (cost: number): string => {
  if (cost < 0.01) return '¥0.00'
  return '¥' + cost.toFixed(2)
}

const sessionAverages = computed(() => {
  const records = sessionRecords.value
  if (!records.length) return null
  const n = records.length
  const sum = (fn: (r: typeof records[0]) => number) => records.reduce((a, r) => a + fn(r), 0)
  return {
    inputAvg: Math.round(sum(r => r.promptTokens) / n),
    outputAvg: Math.round(sum(r => r.completionTokens) / n),
    cacheAvg: Math.round(sum(r => r.cachedTokens) / n),
    // 计费口径：prompt + completion - cached，与月度统计保持一致
    totalAvg: Math.round(sum(r => r.actualTokens) / n),
    costAvg: sum(r => r.cost) / n,
  }
})

const formatNumber = (num: number | undefined | null): string => {
  if (num == null || isNaN(num)) return '0'
  return num.toLocaleString('zh-CN')
}

const formatCompactNumber = (num: number): string => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

const formatTime = (iso: string): string => {
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const monthLabel = computed(() => `${currentYear.value} ${t('tokenUsage.month', { m: String(currentMonth.value).padStart(2, '0') })}`)

const daysInMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value, 0).getDate()
})

interface DayCostItem { day: number; cost: number; label: string }

const dailyCostData = computed<DayCostItem[]>(() => {
  if (!monthlyData.value?.daily_usage) return []
  const map = new Map<number, number>()
  monthlyData.value.daily_usage.forEach(d => {
    const day = parseInt(d.date.split('-')[2] || '0')
    map.set(day, (map.get(day) || 0) + d.cost)
  })
  const result: DayCostItem[] = []
  for (let i = 1; i <= daysInMonth.value; i++) {
    result.push({ day: i, cost: map.get(i) || 0, label: `${i}` })
  }
  return result
})

const maxDailyCost = computed(() => {
  return Math.max(...dailyCostData.value.map(d => d.cost), 0.01)
})

const dailyChartHeight = 160

const getDailyBarHeight = (cost: number): number => {
  if (maxDailyCost.value <= 0) return 0
  return Math.max((cost / maxDailyCost.value) * (dailyChartHeight - 4), 0)
}

interface ModelDayData { day: number; requests: number; tokens: number; label: string }

function getDailyModelData(modelName: string): ModelDayData[] {
  if (!monthlyData.value?.daily_usage) return []
  const filtered = monthlyData.value.daily_usage.filter(d => d.model === modelName)
  const map = new Map<number, { requests: number; tokens: number }>()
  filtered.forEach(d => {
    const day = parseInt(d.date.split('-')[2] || '0')
    const prev = map.get(day) || { requests: 0, tokens: 0 }
    map.set(day, { requests: prev.requests + d.request_count, tokens: prev.tokens + d.total_tokens })
  })
  const result: ModelDayData[] = []
  for (let i = 1; i <= daysInMonth.value; i++) {
    const data = map.get(i) || { requests: 0, tokens: 0 }
    result.push({ day: i, ...data, label: `${i}` })
  }
  return result
}

function maxRequestsForModel(modelName: string): number {
  const data = getDailyModelData(modelName)
  return Math.max(...data.map(d => d.requests), 1)
}

function maxTokensForModel(modelName: string): number {
  const data = getDailyModelData(modelName)
  return Math.max(...data.map(d => d.tokens), 1)
}

function getTokenBarHeight(modelName: string, tokens: number): number {
  const maxT = maxTokensForModel(modelName)
  return Math.max((tokens / maxT) * 70, 0)
}

function getRequestLinePath(modelName: string): string {
  const data = getDailyModelData(modelName)
  if (!data.length) return ''
  const maxR = Math.max(...data.map(d => d.requests), 1)
  const w = 300
  const h = 80
  const step = w / (data.length - 1 || 1)

  let path = ''
  data.forEach((d, i) => {
    const x = i * step
    const y = h - (d.requests / maxR) * h * 0.9
    path += (i === 0 ? 'M' : ' L') + ` ${x} ${y}`
  })
  return path
}

function getRequestAreaPath(modelName: string): string {
  const data = getDailyModelData(modelName)
  if (!data.length) return ''
  const maxR = Math.max(...data.map(d => d.requests), 1)
  const w = 300
  const h = 80
  const step = w / (data.length - 1 || 1)

  let path = `M 0 ${h}`
  data.forEach((d, i) => {
    const x = i * step
    const y = h - (d.requests / maxR) * h * 0.9
    path += ` L ${x} ${y}`
  })
  path += ` L ${w} ${h} Z`
  return path
}

async function loadData() {
  if (!connectionStore.isConnected) {
    error.value = t('tokenUsage.connectFirst')
    return
  }

  loading.value = true
  error.value = null

  try {
    const data = await connectionStore.fetchTokenUsageMonthly(currentYear.value, currentMonth.value)
    monthlyData.value = data
  } catch (err: any) {
    console.error('[TokenUsageReport] Failed to load:', err)
    error.value = err.message || t('common.error')
    monthlyData.value = null
  } finally {
    loading.value = false
  }
}

function prevMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 12) {
    currentMonth.value = 1
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

function handleExport() {
  if (!monthlyData.value) return

  const lines: string[] = []
  lines.push(`${t('tokenUsage.reportTitle')} - ${monthLabel.value}`)
  lines.push('')
  lines.push(`=== ${t('tokenUsage.overview')} ===`)
  lines.push(`${t('tokenUsage.totalCost')}: ${formatCost(monthlyData.value.total_cost)}`)
  lines.push(`${t('tokenUsage.totalTokens')}: ${formatNumber(monthlyData.value.total_tokens)}`)
  lines.push(`${t('tokenUsage.totalRequests')}: ${formatNumber(monthlyData.value.total_requests)}`)
  lines.push('')

  if (monthlyData.value.model_breakdown.length > 0) {
    lines.push(`=== ${t('tokenUsage.modelBreakdown')} ===`)
    monthlyData.value.model_breakdown.forEach((m: ModelUsageSummary) => {
      lines.push(`${m.model} (${m.provider})`)
      lines.push(`  ${t('tokenUsage.tokens')}: ${formatNumber(m.total_tokens)} |  ${t('tokenUsage.requests')}: ${formatNumber(m.request_count)} |  ${t('tokenUsage.cost')}: ${formatCost(m.total_cost)}`)
    })
    lines.push('')
  }

  if (monthlyData.value.daily_usage.length > 0) {
    lines.push(`=== ${t('tokenUsage.dailyBreakdown')} ===`)
    lines.push(`${t('tokenUsage.date')}\t${t('tokenUsage.model')}\t${t('tokenUsage.inputTokens')}\t${t('tokenUsage.outputTokens')}\t${t('tokenUsage.totalTokens')}\t${t('tokenUsage.cost')}\t${t('tokenUsage.requestCount')}`)
    monthlyData.value.daily_usage.forEach(d => {
      lines.push(`${d.date}\t${d.model}\t${d.prompt_tokens}\t${d.completion_tokens}\t${d.total_tokens}\t${d.cost.toFixed(4)}\t${d.request_count}`)
    })
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mindx-token-usage-${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

watch(() => props.visible, (val) => {
  if (val) loadData()
}, { immediate: true })

watch([currentYear, currentMonth], () => {
  if (props.visible) loadData()
})

// 切换到会话明细 Tab 时从服务端加载明细
watch(viewMode, (mode) => {
  if (mode === 'session' && props.visible) {
    loadSessionDetail()
  }
})

// 切换会话时重新加载明细
watch(() => sessionStore.activeSessionId, () => {
  if (viewMode.value === 'session' && props.visible) {
    loadSessionDetail()
  }
})

// 确保 v-if 创建组件时立即加载数据
onMounted(() => {
  if (props.visible) loadData()
})
</script>

<template>
  <div v-if="visible">
  <el-dialog
    :model-value="true"
    @update:model-value="emit('update:visible', false)"
    title=""
    width="860px"
    class="token-usage-report"
    append-to-body
  >
    <template #header>
      <div class="report-header">
        <h2 class="report-title">📊 {{ t('tokenUsage.monthlyUsage') }}</h2>
        <div class="header-controls">
          <div class="view-toggle">
            <button
              :class="['toggle-btn', { active: viewMode === 'monthly' }]"
              @click="viewMode = 'monthly'"
            >{{ t('tokenUsage.monthlyReport') }}</button>
            <button
              :class="['toggle-btn', { active: viewMode === 'session' }]"
              @click="viewMode = 'session'"
            >{{ t('tokenUsage.sessionDetail') }}</button>
          </div>
          <div v-if="viewMode === 'monthly'" class="month-picker">
            <button class="picker-btn" @click="prevMonth" :disabled="loading">‹</button>
            <span class="month-label">{{ monthLabel }}</span>
            <button class="picker-btn" @click="nextMonth" :disabled="loading">›</button>
          </div>
          <el-button size="small" @click="handleExport" :disabled="!monthlyData || loading">{{ t('tokenUsage.export') }}</el-button>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="report-body">
      <!-- Session Detail View -->
      <template v-if="viewMode === 'session' && !loading">
        <div class="section session-detail-section">
          <h3 class="section-title">{{ t('tokenUsage.sessionDetail') }}</h3>
          <div v-if="sessionDetailLoading" class="empty-state">
            <p>{{ t('common.loading') }}</p>
          </div>
          <div v-else-if="sessionRecords.length === 0" class="empty-state">
            <p>{{ t('tokenUsage.noRecord') }}</p>
          </div>
          <div v-else class="session-records-table-wrapper">
            <div v-if="sessionAverages" class="session-averages">
              <span class="avg-label">{{ t('tokenUsage.averageStats') }}</span>
              <span class="avg-item">{{ t('tokenUsage.inputTokens') }} {{ formatCompactNumber(sessionAverages.inputAvg) }}</span>
              <span class="avg-item">{{ t('tokenUsage.outputTokens') }} {{ formatCompactNumber(sessionAverages.outputAvg) }}</span>
              <span class="avg-item">{{ t('tokenUsage.cacheTokens') }} {{ formatCompactNumber(sessionAverages.cacheAvg) }}</span>
              <span class="avg-item">{{ t('tokenUsage.totalTokens') }} {{ formatCompactNumber(sessionAverages.totalAvg) }}</span>
              <span class="avg-item">{{ t('tokenUsage.cost') }} {{ formatCost(sessionAverages.costAvg) }}</span>
            </div>
            <table class="session-records-table">
              <thead>
                <tr>
                  <th>{{ t('tokenUsage.time') }}</th>
                  <th>{{ t('tokenUsage.inputTokens') }}</th>
                  <th>{{ t('tokenUsage.outputTokens') }}</th>
                  <th>{{ t('tokenUsage.cacheTokens') }}</th>
                  <th>{{ t('tokenUsage.totalTokens') }}</th>
                  <th>{{ t('tokenUsage.cost') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in sessionRecords" :key="i">
                  <td class="cell-time">{{ formatTime(r.timestamp) }}</td>
                  <td class="cell-num">{{ formatNumber(r.promptTokens) }}</td>
                  <td class="cell-num">{{ formatNumber(r.completionTokens) }}</td>
                  <td class="cell-num">{{ formatNumber(r.cachedTokens) }}</td>
                  <td class="cell-num">{{ formatNumber(r.actualTokens) }}</td>
                  <td class="cell-cost">{{ formatCost(r.cost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <el-button size="small" type="primary" @click="loadData">{{ t('common.retry') }}</el-button>
      </div>

      <!-- Monthly Content -->
      <template v-else-if="monthlyData">
        <template v-if="viewMode === 'monthly'">
          <!-- Cost Overview -->
          <section class="section cost-overview">
          <div class="cost-summary">
            <span class="cost-label">{{ t('tokenUsage.spending') }}</span>
            <span class="cost-value">{{ formatCost(monthlyData.total_cost) }}</span>
          </div>

          <div class="chart-container daily-cost-chart">
            <div class="chart-y-axis">
              <span v-for="tick in 3" :key="tick" class="y-tick">{{ formatCost(maxDailyCost * (3 - tick) / 3) }}</span>
              <span class="y-tick">¥0</span>
            </div>
            <div class="chart-area">
              <div class="bars-wrapper">
                <div v-for="item in dailyCostData" :key="item.day" class="bar-col">
                  <el-tooltip
                    :content="t('tokenUsage.dayTooltip', { label: item.label + t('tokenUsage.month', { m: '' }).replace('月', ''), value: formatCost(item.cost) })"
                    placement="top"
                    :hide-after="100"
                  >
                    <div
                      class="bar cost-bar"
                      :style="{ height: getDailyBarHeight(item.cost) + 'px' }"
                    ></div>
                  </el-tooltip>
                </div>
              </div>
              <div class="x-axis">
                <span class="x-label">{{ dailyCostData[0]?.label }}-{{ dailyCostData[dailyCostData.length - 1]?.label }}</span>
                <span class="x-label-end">{{ dailyCostData[dailyCostData.length - 1]?.label }}-30</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Per-Model Breakdown -->
        <section
          v-for="model in monthlyData.model_breakdown"
          :key="model.model"
          class="section model-section"
        >
          <h3 class="model-name">{{ model.model }}</h3>

          <div class="model-charts-grid">
            <!-- API Requests Chart -->
            <div class="model-chart-card">
              <div class="card-header">
                <span class="card-title">{{ t('tokenUsage.apiRequests') }}</span>
                <span class="card-value">{{ formatNumber(model.request_count) }}</span>
              </div>
              <div class="mini-chart">
                <div class="chart-y-axis mini-y">
                  <span class="y-tick">{{ formatCompactNumber(maxRequestsForModel(model.model)) }}</span>
                  <span class="y-tick">0</span>
                </div>
                <div class="mini-chart-area">
                  <svg :viewBox="`0 0 300 80`" preserveAspectRatio="none" class="request-line-svg">
                    <defs>
                      <linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4"/>
                        <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
                      </linearGradient>
                    </defs>
                    <path :d="getRequestAreaPath(model.model)" fill="url(#lineGrad)" />
                    <path :d="getRequestLinePath(model.model)" fill="none" stroke="#3b82f6" stroke-width="1.5" />
                  </svg>
                  <div class="x-axis-mini">
                    <span>{{ getDailyModelData(model.model)[0]?.label }}-1</span>
                    <span>{{ getDailyModelData(model.model)[getDailyModelData(model.model).length - 1]?.label }}-30</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tokens Chart -->
            <div class="model-chart-card">
              <div class="card-header">
                <span class="card-title">{{ t('tokenUsage.tokens') }}</span>
                <span class="card-value">{{ formatNumber(model.total_tokens) }}</span>
              </div>
              <div class="mini-chart">
                <div class="chart-y-axis mini-y">
                  <span class="y-tick">{{ formatCompactNumber(maxTokensForModel(model.model)) }}</span>
                  <span class="y-tick">0</span>
                </div>
                <div class="mini-chart-area token-bars">
                  <div class="token-bars-row">
                    <div
                      v-for="(item, idx) in getDailyModelData(model.model)"
                      :key="idx"
                      class="token-bar-col"
                    >
                      <el-tooltip
                        v-if="item.tokens > 0"
                        :content="`${item.label}${t('tokenUsage.month', { m: '' }).replace('月', '')}日: ${formatNumber(item.tokens)} ${t('tokenUsage.tokens')}, ${formatNumber(item.requests)} ${t('tokenUsage.requests')}`"
                        placement="top"
                        :hide-after="100"
                      >
                        <div
                          class="token-bar"
                          :style="{ height: getTokenBarHeight(model.model, item.tokens) + 'px' }"
                        ></div>
                      </el-tooltip>
                    </div>
                  </div>
                  <div class="x-axis-mini">
                    <span>{{ getDailyModelData(model.model)[0]?.label }}-1</span>
                    <span>{{ getDailyModelData(model.model)[getDailyModelData(model.model).length - 1]?.label }}-30</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        </template>

        <!-- Empty State -->
        <div v-if="!monthlyData.model_breakdown.length && !loading && viewMode === 'monthly'" class="empty-state">
          <p>{{ t('tokenUsage.noRecord') }}</p>
        </div>
      </template>
    </div>
  </el-dialog>
  </div>
</template>

<style scoped>
.token-usage-report :deep(.el-overlay) {
  background: rgba(0, 0, 0, 0.7);
}
.token-usage-report :deep(.el-dialog) {
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.token-usage-report :deep(.el-dialog__header) {
  padding: 0; margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.token-usage-report :deep(.el-dialog__body) {
  padding: 0;
  color: #e2e8f0;
}

.report-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 28px; background: rgba(15, 23, 42, 0.8);
}
.report-title {
  font-size: 18px; font-weight: 800; color: #f1f5f9; margin: 0;
}
.header-controls {
  display: flex; align-items: center; gap: 12px;
}
.month-picker {
  display: flex; align-items: center; gap: 4px;
  background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(55, 65, 81, 0.6);
  border-radius: 8px; padding: 4px 8px;
}
.picker-btn {
  width: 26px; height: 26px; border: none; background: transparent;
  color: #94a3b8; font-size: 16px; cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.picker-btn:hover:not(:disabled) { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.picker-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.month-label {
  font-size: 13px; font-weight: 600; color: #e2e8f0; padding: 0 6px;
  min-width: 90px; text-align: center; font-family: 'JetBrains Mono', monospace;
}

.report-body {
  padding: 20px 28px 28px; min-height: 300px; max-height: 75vh; overflow-y: auto;
}
.error-state, .empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 20px; gap: 12px; color: #64748b; font-size: 14px;
}

.section { margin-bottom: 32px; }
.cost-overview {
  background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 12px; padding: 20px 24px;
}
.cost-summary { display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px; }
.cost-label { font-size: 14px; color: #94a3b8; font-weight: 500; }
.cost-value { font-size: 22px; font-weight: 800; color: #fbbf24; font-family: 'JetBrains Mono', monospace; }

.chart-container { display: flex; gap: 8px; }
.chart-y-axis {
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 4px 0; min-width: 48px;
}
.y-tick { font-size: 10px; color: #64748b; font-family: 'JetBrains Mono', monospace; text-align: right; line-height: 1.2; }
.mini-y .y-tick { font-size: 9px; min-width: 56px; }
.chart-area { flex: 1; }
.bars-wrapper {
  display: flex; align-items: flex-end; gap: 1px; height: 160px; padding: 0 2px;
}
.bar-col { flex: 1; display: flex; align-items: flex-end; justify-content: center; min-width: 0; }
.cost-bar {
  width: 100%; max-width: 8px; min-height: 0;
  background: linear-gradient(to top, #ca8a04, #facc15); border-radius: 2px 2px 0 0;
  transition: height 0.3s ease; cursor: pointer;
}
.cost-bar:hover { filter: brightness(1.2); }
.x-axis { display: flex; justify-content: space-between; padding-top: 6px; margin-top: 4px; border-top: 1px solid rgba(55, 65, 81, 0.3); }
.x-label, .x-label-end { font-size: 10px; color: #475569; font-family: 'JetBrains Mono', monospace; }

.model-section {
  background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(55, 65, 81, 0.35);
  border-radius: 12px; padding: 20px 24px;
}
.model-name { font-size: 15px; font-weight: 700; color: #e2e8f0; margin: 0 0 16px 0; font-family: 'JetBrains Mono', monospace; }
.model-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.model-chart-card {
  background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(55, 65, 81, 0.3);
  border-radius: 10px; padding: 14px 16px;
}
.card-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.card-title { font-size: 11px; color: #94a3b8; font-weight: 600; }
.card-value { font-size: 14px; font-weight: 700; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; }
.mini-chart { display: flex; gap: 6px; }
.mini-chart-area { flex: 1; position: relative; }
.request-line-svg { width: 100%; height: 80px; }
.token-bars-row { display: flex; align-items: flex-end; gap: 1px; height: 74px; }
.token-bar-col { flex: 1; display: flex; align-items: flex-end; justify-content: center; min-width: 0; }
.token-bar {
  width: 100%; max-width: 6px; min-height: 2px;
  background: linear-gradient(to top, #38bdf8, #7dd3fc); border-radius: 1px 1px 0 0;
  transition: height 0.3s ease; cursor: pointer;
}
.token-bar:hover { filter: brightness(1.25); }
.x-axis-mini { display: flex; justify-content: space-between; padding-top: 4px; margin-top: 2px; border-top: 1px solid rgba(55, 65, 81, 0.25); }
.x-axis-mini span { font-size: 9px; color: #475569; font-family: 'JetBrains Mono', monospace; }

/* Session Detail Table */
.session-detail-section { background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(55, 65, 81, 0.4); border-radius: 12px; padding: 20px 24px; }
.section-title { font-size: 15px; font-weight: 700; color: #e2e8f0; margin: 0 0 16px 0; }
.session-averages {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 8px 12px; margin-bottom: 12px;
  background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px; font-size: 12px;
}
.avg-label { font-weight: 700; color: #60a5fa; white-space: nowrap; }
.avg-item { color: #e2e8f0; font-family: 'JetBrains Mono', monospace; }
.avg-item + .avg-label { margin-left: 4px; }
.session-records-table-wrapper { overflow-x: auto; }
.session-records-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.session-records-table thead th {
  text-align: right; padding: 8px 12px; font-weight: 600; color: #94a3b8;
  border-bottom: 1px solid rgba(55, 65, 81, 0.4); white-space: nowrap; font-family: 'JetBrains Mono', monospace;
}
.session-records-table thead th:first-child { text-align: left; }
.session-records-table tbody td { text-align: right; padding: 6px 12px; color: #e2e8f0; border-bottom: 1px solid rgba(55, 65, 81, 0.15); }
.session-records-table tbody td:first-child { text-align: left; }
.session-records-table tbody tr:hover td { background: rgba(59, 130, 246, 0.08); }
.cell-time { font-family: 'JetBrains Mono', monospace; color: #94a3b8; font-size: 11px; white-space: nowrap; }
.cell-num { font-family: 'JetBrains Mono', monospace; color: #e2e8f0; }
.cell-cost { font-family: 'JetBrains Mono', monospace; color: #fbbf24; }

/* View Toggle */
.view-toggle { display: flex; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(55, 65, 81, 0.6); border-radius: 8px; overflow: hidden; }
.toggle-btn { padding: 5px 14px; border: none; background: transparent; color: #64748b; font-size: 12px; cursor: pointer; transition: all 0.2s; font-weight: 500; white-space: nowrap; }
.toggle-btn.active { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.toggle-btn:hover:not(.active) { color: #94a3b8; }

.report-body::-webkit-scrollbar { width: 5px; }
.report-body::-webkit-scrollbar-track { background: transparent; }
.report-body::-webkit-scrollbar-thumb { background: rgba(55, 65, 81, 0.5); border-radius: 3px; }
</style>
