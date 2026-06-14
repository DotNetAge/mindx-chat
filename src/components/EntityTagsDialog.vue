<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CollectionTag } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { getMindXClient } from '../services/websocket'
import { useConnectionStore } from '../stores/connectionStore'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible'])

const { t } = useI18n()

const connectionStore = useConnectionStore()
const loading = ref(false)
const saving = ref(false)
const activeTab = ref(0)

// ── 预设实体标签分类 ──────────────────────────────────────────────
interface EntityType {
  label: string
  value: string
  desc: string
}

interface EntityCategory {
  name: string
  label: string
  types: EntityType[]
}

const presetCategories: EntityCategory[] = [
  {
    name: 'general',
    label: '通用',
    types: [
      { label: '概念', value: 'Concept', desc: 'core idea, theory, principle, paradigm' },
      { label: '术语', value: 'Term', desc: 'domain-specific term, jargon, noun' },
      { label: '方法论', value: 'Method', desc: 'methodology, process, technique, workflow' },
      { label: '资源', value: 'Resource', desc: 'document, book, article, webpage, reference' },
      { label: '工具', value: 'Tool', desc: 'software, platform, device, utility' },
      { label: '人物', value: 'Person', desc: 'author, expert, contributor, role' },
      { label: '成果', value: 'Work', desc: 'creative output (blog, video, story, artwork, code)' },
      { label: '事件', value: 'Event', desc: 'milestone, meeting, occurrence, historical event' },
      { label: '主题', value: 'Topic', desc: 'subject, domain, category, tag' },
      { label: '指标', value: 'Metric', desc: 'KPI, measurement, score, statistic' },
    ]
  },
  {
    name: 'enterprise',
    label: '企业',
    types: [
      { label: '客户', value: 'Customer', desc: 'customer, client, account, partner' },
      { label: '订单', value: 'Order', desc: 'order, purchase order, sales order, transaction' },
      { label: '供应商', value: 'Supplier', desc: 'supplier, vendor, distributor, subcontractor' },
      { label: '合同', value: 'Contract', desc: 'contract, agreement, SLA, terms, policy' },
      { label: '项目', value: 'Project', desc: 'project, initiative, program, milestone' },
      { label: '部门', value: 'Department', desc: 'department, team, division, business unit' },
      { label: '员工', value: 'Employee', desc: 'employee, staff, colleague, stakeholder' },
      { label: '发票', value: 'Invoice', desc: 'invoice, bill, receipt, payment record' },
    ]
  },
  {
    name: 'tech',
    label: '技术',
    types: [
      { label: '核心技术', value: 'CoreTheory', desc: 'abstract top-level knowledge: CoreTheory, Principle, Model' },
      { label: '定义', value: 'Definition', desc: 'formal definition, specification' },
      { label: '知识单元', value: 'KnowledgeUnit', desc: 'independent knowledge points: Method, Process, Technique, Formula, Framework' },
      { label: '步骤', value: 'Step', desc: 'step, stage, phase in a process' },
      { label: '问题', value: 'Problem', desc: 'problem, bug, issue, error' },
      { label: '解决方案', value: 'Solution', desc: 'solution, fix, workaround, answer' },
      { label: '文档', value: 'Document', desc: 'source document, section, chunk' },
      { label: '参考', value: 'Reference', desc: 'reference, citation, link, source' },
      { label: '版本', value: 'Version', desc: 'version, release, revision' },
      { label: '标签', value: 'Tag', desc: 'tag, label, category marker' },
    ]
  },
  {
    name: 'media',
    label: '媒体',
    types: [
      { label: '平台', value: 'Platform', desc: 'distribution channel: 抖音, 公众号, B站, YouTube' },
      { label: '格式', value: 'Format', desc: 'content format: 短视频, 图文, 直播, 播客, 长视频' },
      { label: '受众', value: 'Audience', desc: 'target audience, follower persona, demographics' },
      { label: '策略', value: 'Method', desc: 'operation strategies: 运营策略, 排版技巧, 文案套路' },
      { label: '创作者', value: 'Person', desc: 'key individuals: KOL, 竞品账号, 创作者' },
      { label: '作品', value: 'Work', desc: 'published content piece: 视频, 文章, 帖子' },
      { label: '话题', value: 'Topic', desc: 'subject, trend, content idea: 热点话题, 选题, 趋势' },
      { label: '指标', value: 'Metric', desc: 'performance metrics: 播放量, 点赞, 转化率, 粉丝数' },
      { label: '工具', value: 'Tool', desc: 'tools and software: 剪映, 编辑器, 数据分析工具' },
      { label: '活动', value: 'Event', desc: 'activities and releases: 活动, 发布, 热点事件' },
    ]
  },
  {
    name: 'writing',
    label: '写作',
    types: [
      { label: '体裁', value: 'Genre', desc: 'literary genre: 科幻, 言情, 悬疑, 现实主义, 奇幻' },
      { label: '主题', value: 'Theme', desc: 'central theme or motif: 爱, 自由, 科技与人, 成长' },
      { label: '角色', value: 'Character', desc: 'fictional character, role, archetype' },
      { label: '设定', value: 'Setting', desc: 'world-building: 时间, 地点, 社会背景, 世界观' },
      { label: '情节', value: 'Plot', desc: 'storyline, conflict, narrative arc' },
      { label: '风格', value: 'Style', desc: 'narrative voice, writing style, perspective' },
      { label: '结构', value: 'Structure', desc: 'narrative structure: 三幕式, 起承转合, 非线性' },
      { label: '技法', value: 'Technique', desc: 'literary device: 隐喻, 伏笔, 对话, 倒叙' },
      { label: '作家', value: 'Person', desc: 'real person: author, critic, editor' },
      { label: '作品', value: 'Work', desc: 'creative work: novel, poem, script, story' },
    ]
  },
  {
    name: 'research',
    label: '研究',
    types: [
      { label: '市场', value: 'Market', desc: 'industry, sector, market category' },
      { label: '产品', value: 'Product', desc: 'product, service, offering, feature' },
      { label: '竞品', value: 'Competitor', desc: 'competing company, product, or alternative' },
      { label: '客户细分', value: 'CustomerSegment', desc: 'customer group, user persona, demographic' },
      { label: '趋势', value: 'Trend', desc: 'market trend, pattern, direction' },
      { label: '组织', value: 'Organization', desc: 'company, institution, brand, agency' },
      { label: '研究方法', value: 'Method', desc: 'research or analysis method: SWOT, 波特五力, 问卷' },
      { label: '指标', value: 'Metric', desc: 'business metrics: market share, growth rate, DAU, NPS' },
      { label: '商业事件', value: 'Event', desc: 'business event: funding, launch, policy change' },
      { label: '关键人物', value: 'Person', desc: 'key individual: analyst, executive, influencer' },
    ]
  },
  {
    name: 'finance',
    label: '金融',
    types: [
      { label: '资产', value: 'Asset', desc: 'financial asset: stock, bond, real estate, commodity, crypto' },
      { label: '市场', value: 'Market', desc: 'financial market or exchange: A股, NYSE, 债券市场' },
      { label: '指标', value: 'Indicator', desc: 'economic or technical indicator: K线, PE, GDP, CPI' },
      { label: '策略', value: 'Strategy', desc: 'investment or trading strategy: 定投, 对冲, 价值投资' },
      { label: '风险', value: 'Risk', desc: 'risk factor: volatility, credit risk, inflation' },
      { label: '监管', value: 'Regulation', desc: 'regulatory body or policy: SEC, 央行, 货币政策' },
      { label: '机构', value: 'Institution', desc: 'financial institution: bank, fund, brokerage' },
      { label: '人物', value: 'Person', desc: 'key figure: analyst, economist, fund manager' },
      { label: '事件', value: 'Event', desc: 'market event: rate decision, earnings report, IPO' },
      { label: '绩效指标', value: 'Metric', desc: 'performance metric: 收益率, 夏普比率, ROI, 波动率' },
    ]
  },
  {
    name: 'medical',
    label: '医疗',
    types: [
      { label: '疾病', value: 'Disease', desc: 'disease, disorder, condition: 糖尿病, hypertension, COVID-19' },
      { label: '症状', value: 'Symptom', desc: 'sign, symptom, clinical presentation' },
      { label: '治疗', value: 'Treatment', desc: 'treatment, therapy, regimen, medication class' },
      { label: '药物', value: 'Drug', desc: 'specific drug, dosage, formulation' },
      { label: '解剖', value: 'Anatomy', desc: 'anatomical structure, organ, body system' },
      { label: '手术', value: 'Procedure', desc: 'medical procedure, surgery, examination' },
      { label: '诊断', value: 'Diagnosis', desc: 'diagnostic criteria, test, biomarker' },
      { label: '预防', value: 'Prevention', desc: 'prevention method, vaccine, lifestyle measure' },
      { label: '组织', value: 'Organization', desc: 'healthcare organization: hospital, WHO, FDA' },
      { label: '专业人士', value: 'Person', desc: 'healthcare professional: doctor, researcher, specialist' },
    ]
  },
  {
    name: 'journalism',
    label: '新闻',
    types: [
      { label: '来源', value: 'Source', desc: 'information source, news outlet, media: Reuters, 新华社' },
      { label: '事件', value: 'Event', desc: 'news event, incident, development' },
      { label: '人物', value: 'Figure', desc: 'person or entity involved: politician, celebrity, witness' },
      { label: '话题', value: 'Topic', desc: 'news topic, issue, beat: 外交, 经济, 科技' },
      { label: '地点', value: 'Location', desc: 'geographic location, region, country' },
      { label: '组织', value: 'Organization', desc: 'organization, government, NGO, company' },
      { label: '声称', value: 'Claim', desc: 'statement, allegation, assertion by a figure' },
      { label: '事实', value: 'Fact', desc: 'verified fact, data point, statistic' },
      { label: '倾向', value: 'Bias', desc: 'stated or observed bias, perspective, spin' },
      { label: '时间线', value: 'Timeline', desc: 'chronological marker, date, sequence' },
    ]
  }
]

// ── 扁平化所有预设类型 ──
const allPresetTypes = computed(() => {
  const map = new Map<string, { label: string; value: string; desc: string; categoryName: string }>()
  for (const cat of presetCategories) {
    for (const t of cat.types) {
      map.set(t.value, { ...t, categoryName: cat.name })
    }
  }
  return map
})

// ── 选中的 value 数组 ──
const selectedValues = ref<string[]>([])

// ── 当前 Tab 的选中/总数 ──
const currentCategory = computed(() => presetCategories[activeTab.value])

const currentSelectedCount = computed(() => {
  if (!currentCategory.value) return 0
  return currentCategory.value.types.filter(t => selectedValues.value.includes(t.value)).length
})

const currentTotalCount = computed(() => currentCategory.value?.types.length ?? 0)

const currentAllSelected = computed(() => currentSelectedCount.value === currentTotalCount.value)

function toggleCurrentAll() {
  if (!currentCategory.value) return
  const vals = currentCategory.value.types.map(t => t.value)
  if (currentAllSelected.value) {
    selectedValues.value = selectedValues.value.filter(v => !vals.includes(v))
  } else {
    const existing = new Set(selectedValues.value)
    for (const v of vals) existing.add(v)
    selectedValues.value = Array.from(existing)
  }
}

// ── 从服务端加载保存的 EntityTags ──
async function loadSaved() {
  if (!connectionStore.isConnected) return
  loading.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')
    const result = await client.call<{ types: { name: string; title: string; desc: string }[] }>('entity_tags.get', {})
    if (result?.types) {
      selectedValues.value = result.types.map(t => t.name)
    }
  } catch (err: any) {
    // 文件不存在属于正常情况，使用空选择
    if (!err.message?.includes('not found')) {
      console.warn('[EntityTags] load failed:', err)
    }
  } finally {
    loading.value = false
  }
}

// ── 保存到服务端 ──
async function handleSave() {
  if (!connectionStore.isConnected) {
    ElMessage.warning(t('entityTags.notConnected'))
    return
  }

  saving.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')

    // 从 selectedValues 构建保存数据
    const selectedTypes: { name: string; title: string; desc: string; category: string }[] = []
    for (const val of selectedValues.value) {
      const preset = allPresetTypes.value.get(val)
      if (preset) {
        selectedTypes.push({
          name: preset.value,
          title: preset.label,
          desc: preset.desc,
          category: preset.categoryName
        })
      }
    }

    await client.call('entity_tags.save', { types: selectedTypes })
    ElMessage.success(t('entityTags.saveSuccess', { n: selectedTypes.length }))
    emit('update:visible', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('entityTags.saveFailed'))
  } finally {
    saving.value = false
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    activeTab.value = 0
    loadSaved()
  }
})
</script>

<template>
  <div v-if="visible">
    <el-dialog
      :model-value="true"
      @update:model-value="emit('update:visible', false)"
      title=""
      width="680px"
      class="entity-tags-dialog"
      append-to-body
      destroy-on-close
    >
      <template #header>
        <div class="dialog-header">
          <h2>
            <el-icon><CollectionTag /></el-icon>
            {{ t('entityTags.title') }}
          </h2>
          <span class="header-hint">{{ t('entityTags.hint') }}</span>
        </div>
      </template>

      <div v-loading="loading" class="dialog-body">
        <!-- Tabs -->
        <el-tabs v-model="activeTab" class="category-tabs" tab-position="left">
          <el-tab-pane
            v-for="(cat, idx) in presetCategories"
            :key="cat.name"
            :label="cat.label"
            :name="idx"
          >
            <template #label>
              <div class="tab-label">
                <span>{{ t('entityTags.tabs.' + cat.name) }}</span>
                <el-tag size="small" class="tab-count" round>
                  {{ cat.types.filter(t => selectedValues.includes(t.value)).length }}/{{ cat.types.length }}
                </el-tag>
              </div>
            </template>

            <div class="tab-content">
              <div class="tab-actions">
                <el-checkbox
                  :model-value="currentAllSelected"
                  :indeterminate="currentSelectedCount > 0 && !currentAllSelected"
                  @change="toggleCurrentAll"
                >
                  {{ t('entityTags.selectAll') }}
                </el-checkbox>
                <span class="tab-summary">{{ t('entityTags.selected', { n: currentSelectedCount }) }} / {{ currentTotalCount }}</span>
              </div>

              <el-checkbox-group v-model="selectedValues" class="tag-checkbox-group">
                <div
                  v-for="et in cat.types"
                  :key="et.value"
                  class="tag-checkbox-item"
                >
                  <el-checkbox :value="et.value" :label="et.value" class="tag-checkbox">
                    <div class="tag-item-content">
                      <span class="tag-label">{{ t('entityTags.types.' + et.value) }}</span>
                      <span class="tag-value">{{ et.value }}</span>
                      <span class="tag-desc">{{ t('entityTags.descs.' + et.value) }}</span>
                    </div>
                  </el-checkbox>
                </div>
              </el-checkbox-group>
            </div>
          </el-tab-pane>
        </el-tabs>

        <!-- 底部统计 -->
        <div class="selection-footer">
          <el-tag type="info" round>
            {{ t('entityTags.selected', { n: selectedValues.length }) }}
          </el-tag>
        </div>
      </div>

      <template #footer>
        <el-button @click="emit('update:visible', false)">{{ t('entityTags.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ t('entityTags.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dialog-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dialog-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0;
}

.header-hint {
  font-size: 12px;
  color: #64748b;
  font-weight: 400;
}

.dialog-body {
  min-height: 360px;
}

.category-tabs {
  --el-tabs-header-height: auto;
}

.category-tabs :deep(.el-tabs__header) {
  margin-right: 0;
}

.category-tabs :deep(.el-tabs__nav-wrap) {
  padding: 0;
}

.category-tabs :deep(.el-tabs__item) {
  height: auto;
  padding: 8px 16px;
  line-height: 1.4;
  color: #94a3b8;
  border: none !important;
  transition: all 0.2s ease;
}

.category-tabs :deep(.el-tabs__item:hover) {
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.06);
}

.category-tabs :deep(.el-tabs__item.is-active) {
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.1);
  border-radius: 8px;
}

.category-tabs :deep(.el-tabs__active-bar) {
  display: none;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.tab-count {
  font-size: 10px;
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  background: rgba(55, 65, 81, 0.6);
  border: none;
  color: #94a3b8;
}

.tab-content {
  padding: 0 4px;
}

.tab-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 8px;
}

.tab-actions :deep(.el-checkbox__label) {
  font-size: 12px;
  color: #94a3b8;
}

.tab-summary {
  font-size: 11px;
  color: #64748b;
}

.tag-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tag-checkbox-item {
  padding: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.25);
  transition: background 0.15s ease;
}

.tag-checkbox-item:last-child {
  border-bottom: none;
}

.tag-checkbox-item:hover {
  background: rgba(6, 182, 212, 0.04);
}

.tag-checkbox {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  height: auto;
}

.tag-checkbox :deep(.el-checkbox__label) {
  width: 100%;
}

.tag-checkbox :deep(.el-checkbox__input) {
  margin-top: 2px;
}

.tag-item-content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.tag-label {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  min-width: 60px;
}

.tag-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #64748b;
  background: rgba(55, 65, 81, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
  min-width: 80px;
  text-align: center;
}

.tag-desc {
  font-size: 12px;
  color: #64748b;
  flex: 1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
  margin-top: 12px;
}
</style>

<style>
.entity-tags-dialog .el-overlay {
  background: rgba(0, 0, 0, 0.65);
}

.entity-tags-dialog .el-dialog {
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.entity-tags-dialog .el-dialog__header {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

.entity-tags-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}

.entity-tags-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}

.entity-tags-dialog .el-dialog__body {
  padding: 16px 24px 12px;
  max-height: 60vh;
  overflow-y: auto;
}

/* Checkbox styling */
.entity-tags-dialog .el-checkbox {
  color: #cbd5e1;
}

.entity-tags-dialog .el-checkbox.is-checked {
  color: #06b6d4;
}

.entity-tags-dialog .el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #06b6d4;
  border-color: #06b6d4;
}

.entity-tags-dialog .el-checkbox__input.is-indeterminate .el-checkbox__inner {
  background-color: #06b6d4;
  border-color: #06b6d4;
}

.entity-tags-dialog .el-checkbox__inner {
  background: rgba(15, 23, 42, 0.8);
  border-color: rgba(55, 65, 81, 0.6);
}

/* Tab pane */
.entity-tags-dialog .el-tabs__content {
  padding-left: 16px;
}

/* Tag styling */
.entity-tags-dialog .el-tag--info {
  --el-tag-bg-color: rgba(55, 65, 81, 0.4);
  --el-tag-border-color: rgba(55, 65, 81, 0.5);
  --el-tag-text-color: #94a3b8;
}
</style>
