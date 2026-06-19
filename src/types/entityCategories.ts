// ── 实体标签分类定义（中英双语） ─────────────────────────────────

export interface EntityType {
  label: string
  value: string
  desc: string
}

export interface EntityCategory {
  name: string
  label: string
  types: EntityType[]
}

export const presetCategories: EntityCategory[] = [
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
    name: 'project',
    label: '项目',
    types: [
      { label: '需求', value: 'Requirement', desc: 'functional requirement, user story, feature request' },
      { label: '任务', value: 'Task', desc: 'task, action item, to-do, assignment' },
      { label: '计划', value: 'Plan', desc: 'plan, roadmap, schedule, timeline' },
      { label: '风险', value: 'Risk', desc: 'risk, threat, vulnerability, concern' },
      { label: '决策', value: 'Decision', desc: 'decision, conclusion, resolution, outcome' },
      { label: '反馈', value: 'Feedback', desc: 'feedback, review, comment, suggestion' },
      { label: '质效', value: 'Quality', desc: 'quality, standard, requirement, criteria' },
      { label: '测评', value: 'Evaluation', desc: 'evaluation, assessment, result, report' },
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
  },
]

/** 根据英文 value 查找中文 label */
export function getChineseLabel(value: string): string {
  for (const cat of presetCategories) {
    for (const t of cat.types) {
      if (t.value === value) return t.label
    }
  }
  return value // fallback
}

// ── 实体类别颜色映射（每个 value 一个有区分度的颜色） ──
export const ENTITY_COLORS: Record<string, string> = {
  Concept: '#06b6d4',
  Term: '#0ea5e9',
  Method: '#3b82f6',
  Resource: '#6366f1',
  Tool: '#8b5cf6',
  Person: '#a855f7',
  Work: '#d946ef',
  Event: '#ec4899',
  Topic: '#f43f5e',
  Metric: '#ef4444',
  Customer: '#f97316',
  Order: '#eab308',
  Supplier: '#84cc16',
  Contract: '#22c55e',
  Project: '#10b981',
  Department: '#14b8a6',
  Employee: '#2dd4bf',
  Invoice: '#0d9488',
  CoreTheory: '#2563eb',
  Definition: '#7c3aed',
  KnowledgeUnit: '#0891b2',
  Step: '#059669',
  Problem: '#dc2626',
  Solution: '#16a34a',
  Document: '#9333ea',
  Reference: '#818cf8',
  Version: '#ca8a04',
  Tag: '#0e7490',
  Requirement: '#f59e0b',
  Task: '#d97706',
  Plan: '#65a30d',
  Risk: '#b91c1c',
  Decision: '#92400e',
  Feedback: '#6d28d9',
  Quality: '#15803d',
  Evaluation: '#1e40af',
  Platform: '#0f766e',
  Format: '#0369a1',
  Audience: '#6b21a8',
  Genre: '#b45309',
  Theme: '#9a3412',
  Character: '#c2410c',
  Setting: '#4d7c0f',
  Plot: '#a21caf',
  Style: '#be123c',
  Structure: '#1d4ed8',
  Technique: '#5b21b6',
  Market: '#0284c7',
  Product: '#0d9488',
  Competitor: '#ef4444',
  CustomerSegment: '#ea580c',
  Trend: '#0891b2',
  Organization: '#4f46e5',
  Asset: '#65a30d',
  Indicator: '#0e7490',
  Strategy: '#4338ca',
  Regulation: '#991b1b',
  Institution: '#1d4ed8',
  Disease: '#991b1b',
  Symptom: '#9f1239',
  Treatment: '#15803d',
  Drug: '#166534',
  Anatomy: '#7e22ce',
  Procedure: '#1e3a8a',
  Diagnosis: '#581c87',
  Prevention: '#065f46',
  Source: '#0f766e',
  Figure: '#9d174d',
  Location: '#4338ca',
  Claim: '#b91c1c',
  Fact: '#a3e635',
  Bias: '#ea580c',
  Timeline: '#2dd4bf',
}

/** 根据英文 value 获取颜色 */
export function getEntityColor(value: string): string {
  return ENTITY_COLORS[value] || '#64748b'
}
