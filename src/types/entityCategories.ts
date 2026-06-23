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

/** 根据英文 value 查找中文 label（实体类型值，如 Concept → 概念） */
export function getChineseLabel(value: string): string {
  for (const cat of presetCategories) {
    for (const t of cat.types) {
      if (t.value === value) return t.label
    }
  }
  return value // fallback
}

// ── Schema 属性 key 中文映射 ──────────────────────────────────────

/** Schema 属性 key → 中文显示名称 */
export const PROPERTY_LABELS: Record<string, string> = {
  // ── 通用语义属性 ──
  'name': '名称',
  'description': '描述',
  'definition': '定义',
  'summary': '摘要',
  'detail': '详情',
  'category': '分类',
  'parent_topic': '上级主题',
  'keywords': '关键词',
  'related_concepts': '相关概念',
  'related_topics': '相关主题',
  'sub_topics': '子主题',
  'topic_type': '主题类型',
  'trending': '是否热门',
  'status': '状态',
  'state': '状态',
  'level': '层级',
  'priority': '优先级',
  'confidence': '置信度',
  'score': '评分',
  'weight': '权重',
  'importance': '重要度',
  'example': '示例',
  'note': '备注',
  'remark': '说明',

  // ── 方法 / 流程 ──
  'steps': '步骤',
  'prerequisites': '前置条件',
  'tools_used': '使用工具',
  'inputs': '输入',
  'outputs': '输出',
  'duration': '时长',
  'complexity': '复杂度',

  // ── 文档 / 资源 ──
  'title': '标题',
  'author': '作者',
  'url': '链接',
  'type': '类型',
  'format': '格式',
  'language': '语言',
  'version': '版本',
  'publish_date': '发布日期',
  'created_at': '创建时间',
  'updated_at': '更新时间',
  'source': '来源',
  'references': '引用',
  'tags': '标签',

  // ── 人物 ──
  'email': '邮箱',
  'role': '角色',
  'speciality': '专业领域',
  'organization': '组织机构',
  'affiliation': '所属单位',
  'title_pos': '职位',

  // ── 事件 ──
  'date': '日期',
  'location': '地点',
  'event_type': '事件类型',
  'participants': '参与方',
  'outcome': '结果',
  'impact': '影响',

  // ── 指标 / 度量 ──
  'value': '值',
  'unit': '单位',
  'metric_type': '指标类型',
  'period': '周期',
  'target': '目标',
  'baseline': '基线',

  // ── 企业 ──
  'order_id': '订单号',
  'customer': '客户',
  'customer_name': '客户名称',
  'amount': '金额',
  'items': '项目',
  'parties': '签约方',
  'effective_date': '生效日期',
  'expiry_date': '到期日期',
  'key_terms': '关键条款',
  'contract_type': '合同类型',
  'supplier': '供应商',
  'department': '部门',
  'employee_id': '员工编号',
  'invoice_number': '发票号',
  'project_name': '项目名称',
  'manager': '负责人',
  'deadline': '截止日期',
  'budget': '预算',
  'progress': '进度',

  // ── 金融 ──
  'ticker': '代码/ ticker',
  'currency': '货币',
  'market': '市场',
  'asset_type': '资产类型',
  'risk_level': '风险等级',
  'return_rate': '收益率',
  'volatility': '波动率',
  'indicator': '指标',
  'strategy': '策略',
  'regulation': '监管要求',
  'institution': '机构',

  // ── 媒体 / 内容 ──
  'platform': '平台',
  'platform_type': '平台类型',
  'region': '地区',
  'user_base_size': '用户规模',
  'tool_type': '工具类型',
  'pricing_model': '定价模式',
  'features': '功能特性',
  'format_type': '格式类型',
  'typical_duration': '典型时长',
  'trend_direction': '趋势方向',
  'demographics': '人群特征',
  'size_estimate': '规模估算',
  'interests': '兴趣偏好',
  'creator': '创作者',
  'performance_metrics': '表现数据',
  'views': '播放量',
  'likes': '点赞数',
  'shares': '分享数',
  'comments': '评论数',
  'strategy_type': '策略类型',
  'effectiveness': '效果评估',

  // ── 医疗 ──
  'treatment_type': '治疗类型',
  'indications': '适应症',
  'side_effects': '副作用',
  'symptoms': '症状',
  'severity': '严重程度',
  'prevalence': '发病率',
  'prognosis': '预后',
  'drug_name': '药物名称',
  'dosage': '剂量',
  'anatomy_part': '解剖部位',
  'diagnostic_criteria': '诊断标准',
  'prevention_method': '预防方式',

  // ── 新闻 ──
  'source_name': '来源名称',
  'source_type': '来源类型',
  'claim_content': '声称内容',
  'fact_detail': '事实细节',
  'bias_description': '倾向描述',
  'timeline_point': '时间线节点',
  'figure_role': '人物角色',

  // ── 研究 ──
  'market_segment': '细分市场',
  'product_name': '产品名称',
  'competitor_name': '竞品名称',
  'customer_segment': '客户细分',
  'trend_pattern': '趋势形态',
  'research_method': '研究方法',
  'sample_size': '样本量',
  'finding': '发现',
  'recommendation': '建议',

  // ── 写作 ──
  'genre': '体裁',
  'theme': '主题',
  'character_name': '角色名',
  'character_role': '角色定位',
  'setting_desc': '设定描述',
  'plot_summary': '情节概要',
  'narrative_style': '叙事风格',
  'structure_type': '结构类型',
  'technique_name': '技法名称',

  // ── 技术 ──
  'framework': '框架',
  'language_tech': '编程语言',
  'api_endpoint': 'API 端点',
  'dependency': '依赖',
  'license': '许可证',
  'compatibility': '兼容性',
  'difficulty': '难度',

  // ── 通用扩展属性（多 Schema 共用） ──
  'owner': '负责人',
  'start_date': '开始日期',
  'end_date': '结束日期',
  'created_date': '创建日期',
  'published_date': '发布日期',
  'publication_date': '出版日期',
  'industry': '行业',
  'contact': '联系方式',
  'contact_person': '联系人',
  'benchmark': '基准值/对标值',
  'direction': '方向',
  'evidence': '证据',
  'impact_level': '影响程度',
  'function': '功能',
  'size': '规模/大小',

  // ── 企业扩展 ──
  'division': '分部/科室',
  'head': '负责人',
  'headcount': '人数/编制',
  'products_services': '产品/服务',

  // ── 金融扩展 ──
  'regulatory_body': '监管机构',
  'jurisdiction': '管辖范围',
  'affected_sectors': '受影响行业',

  // ── 媒体扩展 ──
  'followers_count': '粉丝数',
  'niche': '细分领域',
  'account_handle': '账号标识',

  // ── 写作扩展 ──
  'technique_type': '技法类型',
  'effect': '效果',
  'example_usage': '使用示例',
  'genre_type': '体裁类型',
  'examples': '示例',
  'conventions': '惯例/规范',
  'work_type': '作品类型',
  'synopsis': '简介',
  'characters': '角色列表',
  'nationality': '国籍',
  'story': '故事内容',
  'conflict_type': '冲突类型',
  'structure_beat': '结构节拍',
  'resolution': '结局',
  'archetype': '原型',
  'traits': '性格特征',
  'motivation': '动机',
  'arc_description': '角色弧描述',
  'perspective': '叙事视角',
  'voice_tone': '语调语气',
  'stylistic_markers': '文体标记',
  'influences': '影响来源',
  'related_themes': '相关主题',
  'significance': '意义',
  'works': '相关作品',

  // ── 医疗扩展 ──
  'anatomy_type': '解剖类型',
  'related_structures': '相关结构',
  'associated_diseases': '相关疾病',
  'severity_range': '严重程度范围',
  'body_system': '身体系统',
  'org_type': '组织类型',
  'specialties': '专科专长',
  'diagnosis_type': '诊断类型',
  'conditions_diagnosed': '诊断疾病',
  'accuracy': '准确度',
  'procedure_type': '手术/操作类型',
  'recovery_time': '恢复时间',
  'risks': '风险项',
  'applicable_to': '适用对象',


  // ── 技术 / 实际数据中的自定义属性 ──
  '4d-matrix': '四维矩阵',
  'isFromOpen': '是否开源',
  'urlTemplate': 'URL模板',
  'jsonSchema': 'JSON模式',
  'Compliance': '合规性',
  'ownerName': '所有者名称',
  'customer_type': '客户类型',

  // ── 通用 Schema 遗漏 ──
  'domain': '领域',
  'synonyms': '同义词',
  'expertise': '专业技能/专长',
  'purpose': '用途/目的',
  'vendor': '厂商/供应商',

  // ── 金融 Schema 遗漏 ──
  'affected_assets': '受影响资产',
  'details': '详情',
  'frequency': '频率',
  'institution_type': '机构类型',
  'assets_under_management': '管理资产规模(AUM)',
  'specializations': '专长领域',
  'market_type': '市场类型',
  'operating_hours': '交易时间',
  'index_tickers': '指数代码',
  'interpretation': '解读/释义',
  'reputation': '声誉',
  'risk_type': '风险类型',
  'mitigation_methods': '缓解措施',
  'time_horizon': '投资期限',
  'asset_classes': '资产类别',

  // ── 新闻 Schema 遗漏 ──
  'bias_type': '偏见类型',
  'claim_text': '声称内容',
  'claimant': '声称人',
  'context': '背景/上下文',
  'verification_status': '核实状态',
  'statement': '陈述/声明',
  'date_verified': '核实日期',
  'methodology': '方法论',
  'related_claims': '相关声称',
  'relevance': '相关性',
  'statements': '声明列表',
  'location_type': '地点类型',
  'coordinates': '坐标',
  'sector': '行业/板块',
  'headquarters': '总部地址',
  'leadership': '领导层',
  'reliability_rating': '可靠性评级',
  'political_lean': '政治倾向',
  'entries': '条目列表',

  // ── 医疗 Schema 遗漏 ──
  'icd_code': 'ICD编码',
  'risk_factors': '风险因素',
  'common_treatments': '常见治疗',
  'generic_name': '通用名',
  'drug_class': '药物分类',
  'dosage_forms': '剂型',
  'administration_route': '给药途径',
  'target_conditions': '目标疾病',
  'credentials': '资质证书',

  // ── 研究 Schema 遗漏 ──
  'market_position': '市场定位',
  'strengths': '优势',
  'weaknesses': '劣势',
  'market_share': '市场份额',
  'products': '产品列表',
  'needs': '需求',
  'pain_points': '痛点',
  'behavior_patterns': '行为模式',
  'financial_details': '财务详情',
  'growth_rate': '增长率',
  'key_players': '主要参与者',
  'method_type': '方法类型',
  'when_to_use': '适用时机',

  // ── 技术 Schema 遗漏 ──
  'related_principles': '相关原理',
  'term': '术语',
  'document_type': '文档类型',
  'sections': '章节/分节',
  'applications': '应用场景',
  'affected_component': '受影响组件',
  'workaround': '临时方案',
  'access_date': '访问日期',
  'citation': '引用格式',
  'step_number': '步骤序号',
  'duration_estimate': '预估时长',
  'depends_on': '依赖项',
  'color': '颜色标签',
  'group': '标签分组',
  'related_tags': '相关标签',
  'version_number': '版本号',
  'changes': '变更内容',

  // ── 写作 Schema 遗漏 ──
  'style_type': '风格类型',
  'characteristics': '特征',
  'components': '组成部分',
  'time_period': '时间段',
  'culture': '文化背景',
  'atmosphere': '氛围',
  'plot_type': '情节类型',
  'motivations': '动机列表',
  'related_techniques': '相关技法',

  // ── 企业/研究 Schema 遗漏补全 ──
  'issue_date': '开票日期',
  'due_date': '到期付款日',
  'line_items': '明细项目',
  'pricing': '定价',
  'stage': '生命周期阶段',
  'competitors': '竞品列表',
}

/** 根据 Schema 属性 key 获取中文标签 */
export function getPropertyLabel(key: string): string {
  return PROPERTY_LABELS[key] || key
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
