<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { UserFilled, Tools, CollectionTag, Warning } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useConnectionStore } from '../stores/connectionStore'
import { useChatStore } from '../stores/chatStore'
import { getMindXClient } from '../services/websocket'
import type { AgentInfo } from '../stores/connectionStore'
import type { SkillInfo } from '../types/websocket'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible'])

const { t, locale } = useI18n()
const connectionStore = useConnectionStore()
const chatStore = useChatStore()

// ── 硬编码工具定义 name + description(英文来自 Go 源码) ──
// label 通过 i18n 翻译，description 来自 Go 代码保持英文
interface ToolDef {
  name: string
  desc: string
}
const TOOLS: ToolDef[] = [
  { name: 'Grep', desc: 'A powerful search tool built on ripgrep' },
  { name: 'Glob', desc: 'Find files by glob patterns' },
  { name: 'Read', desc: 'Reads a file from the local filesystem' },
  { name: 'Write', desc: 'Write content to a file. Creates parent directories automatically' },
  { name: 'Edit', desc: 'Edit files by replacing exact strings' },
  { name: 'Bash', desc: 'Execute a POSIX shell command in the workspace environment' },
  { name: 'WebSearch', desc: 'Search the web for real-time information' },
  { name: 'WebFetch', desc: 'Fetch and extract content from a web page' },
  { name: 'Ls', desc: 'List directory contents with file metadata' },
  { name: 'CollectResults', desc: 'Wait for async tasks to complete and return results' },
  { name: 'TaskCreate', desc: 'Create a task in the task list for tracking work' },
  { name: 'TaskList', desc: 'List all tasks with their status and dependency information' },
  { name: 'TaskGet', desc: 'Get detailed information about a specific task' },
  { name: 'TaskUpdate', desc: 'Advance a task through its lifecycle or update its metadata' },
  { name: 'SubAgent', desc: 'Spawn a sub-agent for a task and collect results later' },
  { name: 'TeamCreate', desc: 'Create a team of agents that work together on a task' },
  { name: 'TeamDelete', desc: 'Delete a team and clean up its associated data' },
  { name: 'TeamList', desc: 'List all teams with their members and status' },
  { name: 'TeamGetTasks', desc: 'Get all tasks assigned to a team' },
  { name: 'Cron', desc: 'Schedule tasks to run at specified times using cron expressions' },
  { name: 'SendMessage', desc: 'Send notifications or messages to users' },
]

// ── 工具组定义（用户看到的抽象能力） ──
interface ToolGroup {
  key: string
  members: string[]
}
const TOOL_GROUPS: ToolGroup[] = [
  { key: 'task', members: ['TaskCreate', 'TaskList', 'TaskGet', 'TaskUpdate'] },
  { key: 'team', members: ['TeamCreate', 'TeamDelete', 'TeamList', 'TeamGetTasks'] },
  { key: 'subagent', members: ['SubAgent', 'CollectResults'] },
]
// 被分组的工具名集合，用于判断某个工具是否属于组
const GROUPED_TOOL_NAMES = new Set(TOOL_GROUPS.reduce((acc: string[], g) => acc.concat(g.members), []))
// 独立工具列表（不在任何组中的）
const STANDALONE_TOOLS = TOOLS.filter(t => !GROUPED_TOOL_NAMES.has(t.name))

// ── 当前选中的 Agent ──
const selectedAgentName = ref('')
const editorTab = ref<'tools' | 'skills'>('skills')

// ── 编辑中的本地状态 ──
const localSkills = ref<string[]>([])
const localEnabledTools = ref<Set<string>>(new Set())

// ── 所有可用技能（从 RPC 加载） ──
const allSkills = ref<SkillInfo[]>([])
const skillsLoading = ref(false)

// ── License 阅读器 ──
const licenseDialogVisible = ref(false)
const licenseDialogTitle = ref('')
const licenseDialogContent = ref('')
function openLicense(title: string, content: string) {
  licenseDialogTitle.value = title
  licenseDialogContent.value = content
  licenseDialogVisible.value = true
}

// ── "选择困难？" → 关闭对话框、填入输入框 ──
function selectDifficulty() {
  const prompt = t('agentEditor.skillTipPrompt')
  chatStore.pendingInputText = prompt
  emit('update:visible', false)
}

// ── "员工不足？" → 关闭对话框、填入输入框 ──
function hirePrompt() {
  const prompt = t('agentEditor.hirePrompt')
  chatStore.pendingInputText = prompt
  emit('update:visible', false)
}

// ── "技能不足？" → 关闭对话框、填入输入框 ──
function skillShortage() {
  const prompt = t('agentEditor.skillShortagePrompt')
  chatStore.pendingInputText = prompt
  emit('update:visible', false)
}

// ── 从 meta 提取中文字段 ──
function getMetaVal(meta: Record<string, any> | undefined, key: string): string {
  if (!meta) return ''
  if (typeof meta === 'object' && !Array.isArray(meta)) {
    const v = meta[key]
    return v != null ? String(v) : ''
  }
  if (Array.isArray(meta)) {
    const entry = meta.find((m: Record<string, any>) => key in m)
    return entry?.[key] != null ? String(entry[key]) : ''
  }
  return ''
}

// ── 根据当前语言选择 meta 中的对应字段 ──
// fieldBase e.g. 'name' → 查找 name_zh / name_zh-tw
function localeMetaValue(
  meta: Record<string, any> | undefined,
  fieldBase: string,
  fallback: string
): string {
  if (!meta) return fallback
  const loc = locale.value
  let key: string
  if (loc === 'zh') key = `${fieldBase}_zh`
  else if (loc === 'zh-TW') key = `${fieldBase}_zh-tw`
  else return fallback
  const v = meta[key]
  return v != null ? String(v) : fallback
}

// ── 内联编辑状态 ──
const editingField = ref<'role' | 'name' | 'description' | null>(null)
const editValue = ref('')
const roleInputRef = ref<any>(null)
const nameInputRef = ref<any>(null)
const descInputRef = ref<any>(null)

function getLocaleMetaKey(fieldBase: string): string {
  const loc = locale.value
  if (loc === 'zh') return `${fieldBase}_zh`
  if (loc === 'zh-TW') return `${fieldBase}_zh-tw`
  return fieldBase
}

function startEdit(field: 'role' | 'name' | 'description') {
  const agent = selectedAgent.value
  if (!agent) return
  editingField.value = field
  if (field === 'role') {
    editValue.value = localeMetaValue(agent.meta, 'role', agent.name)
  } else if (field === 'name') {
    editValue.value = localeMetaValue(agent.meta, 'name', agent.name)
  } else {
    editValue.value = localeMetaValue(agent.meta, 'description', agent.description)
  }
  nextTick(() => {
    const ref = field === 'role' ? roleInputRef.value : field === 'name' ? nameInputRef.value : descInputRef.value
    ref?.focus?.()
  })
}

async function saveMetaField(field: 'role' | 'name' | 'description') {
  editingField.value = null
  const agent = selectedAgent.value
  if (!agent) return
  const key = getLocaleMetaKey(field)
  const fallback = field === 'name' ? agent.name : field === 'role' ? agent.role : agent.description
  const current = localeMetaValue(agent.meta, field, fallback)
  if (editValue.value === current) return

  // Update local meta
  if (!agent.meta) {
    agent.meta = {}
  }
  // agent.meta might be an array — handle both cases
  if (Array.isArray(agent.meta)) {
    const entry = agent.meta.find((m: Record<string, any>) => key in m)
    if (entry) {
      entry[key] = editValue.value
    } else {
      agent.meta.push({ [key]: editValue.value })
    }
  } else {
    agent.meta[key] = editValue.value
  }

  // Sync to server
  const client = getMindXClient()
  if (!client) return
  try {
    await client.call('agent.update', {
      name: agent.name,
      meta: agent.meta
    })
  } catch (err: any) {
    console.warn('[AgentEditor] Failed to save meta:', err)
  }
}

// ── 只读/编辑模式 ──
const isEditing = ref(false)

// 只读模式下已选技能
const assignedSkills = computed(() => {
  return allSkills.value.filter(s => localSkills.value.includes(s.name))
})

// 只读模式下已启用工具组（全部成员都已启用才算完整组）
const enabledToolGroups = computed(() => {
  return TOOL_GROUPS.filter(g => g.members.every(m => localEnabledTools.value.has(m)))
})

// 只读模式下已启用独立工具（不在任何已启用组中）
const enabledStandaloneTools = computed(() => {
  const groupedMemberSet = new Set(TOOL_GROUPS.reduce((acc: string[], g) => acc.concat(g.members), []))
  return STANDALONE_TOOLS.filter(t => localEnabledTools.value.has(t.name))
})

// 只读模式下工具组完整信息（含 i18n label 和描述）
interface ReadonlyToolGroup {
  key: string
  label: string
  desc: string
  memberCount: number
}
const readonlyToolGroups = computed<ReadonlyToolGroup[]>(() => {
  return enabledToolGroups.value.map(g => ({
    key: g.key,
    label: t(`agentEditor.groupNames.${g.key}`),
    desc: t(`agentEditor.groupDescs.${g.key}`),
    memberCount: g.members.length
  }))
})

function startEditing() {
  isEditing.value = true
}

function cancelEditing() {
  // 重置为当前 Agent 的原始状态
  initEditor(selectedAgentName.value)
  isEditing.value = false
}
const selectedAgent = computed(() => {
  return connectionStore.agents.find(a => a.name === selectedAgentName.value)
})

// ── 左侧 Agent 列表 ──
interface AgentCard {
  name: string
  nameZh: string
  roleZh: string
  descZh: string
  model: string
  isActive: boolean
  ratings: number
}
const agentCards = computed<AgentCard[]>(() => {
  return connectionStore.agents.map((a: AgentInfo) => ({
    name: a.name,
    nameZh: localeMetaValue(a.meta, 'name', a.name),
    roleZh: localeMetaValue(a.meta, 'role', a.role),
    descZh: localeMetaValue(a.meta, 'description', a.description),
    model: a.model,
    isActive: a.name === (connectionStore.currentAgent?.name || connectionStore.primaryAgent?.name),
    ratings: a.meta?.ratings ?? 0
  }))
})

// ── 工具列表（含 i18n label，混合独立工具与工具组） ──
interface ToolItem {
  type: 'tool' | 'group'
  key: string
  name: string
  label: string
  desc: string
  enabled: boolean
  indeterminate?: boolean
  members?: string[]
}
const toolsList = computed<ToolItem[]>(() => {
  // 独立工具
  const standalone: ToolItem[] = STANDALONE_TOOLS.map(tool => ({
    type: 'tool' as const,
    key: tool.name,
    name: tool.name,
    label: t(`agentEditor.tools.${tool.name}`),
    desc: t(`agentEditor.toolDescs.${tool.name}`),
    enabled: localEnabledTools.value.has(tool.name)
  }))
  // 工具组
  const groups: ToolItem[] = TOOL_GROUPS.map(g => {
    const enabledCount = g.members.filter(m => localEnabledTools.value.has(m)).length
    const all = enabledCount === g.members.length
    return {
      type: 'group' as const,
      key: g.key,
      name: g.key,
      label: t(`agentEditor.groupNames.${g.key}`),
      desc: t(`agentEditor.groupDescs.${g.key}`),
      enabled: all,
      indeterminate: enabledCount > 0 && !all,
      members: g.members
    }
  })
  return [...standalone, ...groups]
})

// ── 技能列表（含 i18n label，从 SKILL.md 的 description 字段显示） ──
interface SkillItem {
  name: string
  origName: string
  desc: string
  assigned: boolean
  author: string
  version: string
  license: string
}
const skillsList = computed<SkillItem[]>(() => {
  return allSkills.value.map(s => ({
    name: localeMetaValue(s.metadata, 'name', s.name),
    origName: s.name,
    desc: localeMetaValue(s.metadata, 'description', s.description || ''),
    assigned: localSkills.value.includes(s.name),
    author: s.metadata?.author || '',
    version: s.metadata?.version || '',
    license: s.license || ''
  }))
})

// ── 切换独立工具启用/禁用 ──
function toggleTool(name: string, enable: boolean) {
  if (enable) {
    localEnabledTools.value.add(name)
  } else {
    localEnabledTools.value.delete(name)
  }
  localEnabledTools.value = new Set(localEnabledTools.value)
}

// ── 切换工具组启用/禁用 ──
function toggleGroup(members: string[], enable: boolean) {
  for (const m of members) {
    if (enable) localEnabledTools.value.add(m)
    else localEnabledTools.value.delete(m)
  }
  localEnabledTools.value = new Set(localEnabledTools.value)
}

// ── 全选/取消全选工具 ──
function toggleAllTools(enable: boolean) {
  if (enable) {
    for (const t of TOOLS) localEnabledTools.value.add(t.name)
  } else {
    localEnabledTools.value.clear()
  }
  localEnabledTools.value = new Set(localEnabledTools.value)
}

// ── 全选/取消全选技能 ──
function toggleAllSkills(assign: boolean) {
  if (assign) {
    localSkills.value = allSkills.value.map(s => s.name)
  } else {
    localSkills.value = []
  }
}

function toggleSkill(name: string, assign: boolean) {
  if (assign) {
    if (!localSkills.value.includes(name)) localSkills.value.push(name)
  } else {
    localSkills.value = localSkills.value.filter(s => s !== name)
  }
}

function allToolsEnabled(): boolean {
  return TOOLS.every(t => localEnabledTools.value.has(t.name))
}

function someToolsEnabled(): boolean {
  return localEnabledTools.value.size > 0 && localEnabledTools.value.size < TOOLS.length
}

function allSkillsAssigned(): boolean {
  return allSkills.value.length > 0 && localSkills.value.length === allSkills.value.length
}

function someSkillsAssigned(): boolean {
  return localSkills.value.length > 0 && localSkills.value.length < allSkills.value.length
}

// ── 选择 Agent ──
function selectAgent(name: string) {
  selectedAgentName.value = name
  initEditor(name)
}

// ── 初始化编辑器状态 ──
function initEditor(name: string) {
  const agent = connectionStore.agents.find(a => a.name === name)
  if (!agent) return

  // 技能 = agent.skills
  localSkills.value = [...(agent.skills || [])]

  // 工具：enabled = NOT in exclude_tools
  const excluded = new Set(agent.exclude_tools || [])
  localEnabledTools.value = new Set(TOOLS.map(t => t.name).filter(n => !excluded.has(n)))
}

// ── 加载所有技能 ──
async function loadSkills() {
  if (allSkills.value.length > 0) return
  skillsLoading.value = true
  try {
    const client = getMindXClient()
    if (!client) throw new Error('WebSocket client not initialized')
    const result = await connectionStore.fetchSkills()
    allSkills.value = result
  } catch (err) {
    console.warn('[AgentEditor] Failed to load skills:', err)
  } finally {
    skillsLoading.value = false
  }
}

// ── 保存 ──
async function handleSave() {
  if (!selectedAgentName.value) {
    ElMessage.warning(t('agentEditor.noSelection'))
    return
  }
  const client = getMindXClient()
  if (!client) {
    ElMessage.warning(t('common.notConnected'))
    return
  }

  // 计算 exclude_tools = 所有工具 - enabled 工具
  const enabledSet = localEnabledTools.value
  const excludeTools = TOOLS.map(t => t.name).filter(n => !enabledSet.has(n))

  try {
    await client.call('agent.update', {
      name: selectedAgentName.value,
      skills: localSkills.value,
      exclude_tools: excludeTools
    })
    ElMessage.success(t('agentEditor.saveSuccess'))
    isEditing.value = false
  } catch (err: any) {
    ElMessage.error(err.message || t('agentEditor.saveFailed'))
  }
}

// ── 对话框打开时初始化 ──
watch(() => props.visible, (val) => {
  if (val) {
    isEditing.value = false
    const first = connectionStore.agents[0]
    if (first) {
      selectAgent(first.name)
    }
    editorTab.value = 'skills'
    loadSkills()
  }
})

// ── 切换当前使用的 Agent（双击左侧卡片） ──
function switchActiveAgent(name: string) {
  connectionStore.setCurrentAgent(name)
  connectionStore.setLastAgent(name)
  ElMessage.success(t('agentSelector.selected', { name }))
  emit('update:visible', false)
}
</script>

<template>
  <div class="agent-editor-dialog-wrapper">
    <el-dialog
      :model-value="visible"
      @update:model-value="emit('update:visible', $event)"
    title=""
    width="1100px"
      class="agent-editor-dialog"
      append-to-body
      destroy-on-close
    >
      <template #header>
        <div class="dialog-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="dialog-header-icon">
              <path d="M9 15C8.44771 15 8 15.4477 8 16C8 16.5523 8.44771 17 9 17C9.55229 17 10 16.5523 10 16C10 15.4477 9.55229 15 9 15Z"/>
              <path d="M14 16C14 15.4477 14.4477 15 15 15C15.5523 15 16 15.4477 16 16C16 16.5523 15.5523 17 15 17C14.4477 17 14 16.5523 14 16Z"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12 1C10.8954 1 10 1.89543 10 3C10 3.74028 10.4022 4.38663 11 4.73244V7H6C4.34315 7 3 8.34315 3 10V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V10C21 8.34315 19.6569 7 18 7H13V4.73244C13.5978 4.38663 14 3.74028 14 3C14 1.89543 13.1046 1 12 1ZM5 10C5 9.44772 5.44772 9 6 9H7.38197L8.82918 11.8944C9.16796 12.572 9.86049 13 10.618 13H13.382C14.1395 13 14.832 12.572 15.1708 11.8944L16.618 9H18C18.5523 9 19 9.44772 19 10V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V10ZM13.382 11L14.382 9H9.61803L10.618 11H13.382Z"/>
              <path d="M1 14C0.447715 14 0 14.4477 0 15V17C0 17.5523 0.447715 18 1 18C1.55228 18 2 17.5523 2 17V15C2 14.4477 1.55228 14 1 14Z"/>
              <path d="M22 15C22 14.4477 22.4477 14 23 14C23.5523 14 24 14.4477 24 15V17C24 17.5523 23.5523 18 23 18C22.4477 18 22 17.5523 22 17V15Z"/>
            </svg>
            {{ t('agentEditor.title') }}
          </h2>
          <span class="header-hint">{{ t('agentEditor.hint') }} — {{ t('agentEditor.clickEditHint') }}</span>
        </div>
      </template>

      <div class="dialog-body">
        <div class="editor-layout">
          <!-- ── 左侧 Agent 列表 ── -->
          <div class="left-panel">
            <div class="panel-title">{{ t('agentEditor.agentList') }}</div>
            <div class="agent-list" v-if="agentCards.length > 0">
              <div
                v-for="agent in agentCards"
                :key="agent.name"
                class="agent-list-item"
                :class="{ selected: agent.name === selectedAgentName, active: agent.isActive }"
                @click="selectAgent(agent.name)"
                @dblclick="switchActiveAgent(agent.name)"
              >
                <div class="ali-avatar">
                  <el-icon v-if="agent.isActive" :size="18"><UserFilled /></el-icon>
                  <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="ali-avatar-icon">
                    <path d="M9 15C8.44771 15 8 15.4477 8 16C8 16.5523 8.44771 17 9 17C9.55229 17 10 16.5523 10 16C10 15.4477 9.55229 15 9 15Z"/>
                    <path d="M14 16C14 15.4477 14.4477 15 15 15C15.5523 15 16 15.4477 16 16C16 16.5523 15.5523 17 15 17C14.4477 17 14 16.5523 14 16Z"/>
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 1C10.8954 1 10 1.89543 10 3C10 3.74028 10.4022 4.38663 11 4.73244V7H6C4.34315 7 3 8.34315 3 10V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V10C21 8.34315 19.6569 7 18 7H13V4.73244C13.5978 4.38663 14 3.74028 14 3C14 1.89543 13.1046 1 12 1ZM5 10C5 9.44772 5.44772 9 6 9H7.38197L8.82918 11.8944C9.16796 12.572 9.86049 13 10.618 13H13.382C14.1395 13 14.832 12.572 15.1708 11.8944L16.618 9H18C18.5523 9 19 9.44772 19 10V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V10ZM13.382 11L14.382 9H9.61803L10.618 11H13.382Z"/>
                    <path d="M1 14C0.447715 14 0 14.4477 0 15V17C0 17.5523 0.447715 18 1 18C1.55228 18 2 17.5523 2 17V15C2 14.4477 1.55228 14 1 14Z"/>
                    <path d="M22 15C22 14.4477 22.4477 14 23 14C23.5523 14 24 14.4477 24 15V17C24 17.5523 23.5523 18 23 18C22.4477 18 22 17.5523 22 17V15Z"/>
                  </svg>
                </div>
                <div class="ali-info">
                  <div class="ali-name">{{ agent.roleZh || agent.nameZh }}</div>
                  <div class="ali-id">{{ agent.name }}</div>
                  <div class="ali-rating">
                    <span v-for="i in 5" :key="i" class="astar" :class="{ filled: i <= agent.ratings }">★</span>
                  </div>
                </div>
                <div v-if="agent.isActive" class="ali-badge">{{ t('common.current') }}</div>
              </div>
            </div>
            <div v-else class="empty-list">
              {{ t('agentSelector.empty') }}
            </div>
            <div class="left-footer">
              <span class="lf-link" @click="hirePrompt">{{ t('agentEditor.hireTip') }}</span>
            </div>
          </div>

          <!-- ── 右侧详情面板 ── -->
          <div class="right-panel" v-if="selectedAgent">
            <!-- 基本信息 -->
            <div class="detail-header">
              <div class="dh-top">
                <div class="dh-left">
                  <h3
                    v-if="editingField !== 'role'"
                    class="editable-field"
                    @click="startEdit('role')"
                  >{{ localeMetaValue(selectedAgent.meta, 'role', selectedAgent.role) }}</h3>
                  <el-input
                    v-else
                    ref="roleInputRef"
                    v-model="editValue"
                    size="small"
                    style="width: 300px;"
                    @blur="saveMetaField('role')"
                    @keydown.enter="saveMetaField('role')"
                  />
                </div>
                <div class="dh-actions">
                  <el-button
                    v-if="!isEditing"
                    size="small"
                    @click="startEditing"
                  >
                    {{ t('common.edit') }}
                  </el-button>
                  <template v-else>
                    <el-button
                      size="small"
                      @click="cancelEditing"
                    >
                      {{ t('common.cancel') }}
                    </el-button>
                    <el-button
                      size="small"
                      type="primary"
                      @click="handleSave"
                    >
                      {{ t('common.save') }}
                    </el-button>
                  </template>
                </div>
              </div>
              <div class="detail-meta">
                <span class="meta-role">{{ localeMetaValue(selectedAgent.meta, 'name', selectedAgent.name) }}</span>
                <span class="meta-model">{{ selectedAgent.model }}</span>
              </div>
              <div class="detail-rating">
                <span v-for="i in 5" :key="i" class="dstar" :class="{ filled: i <= (selectedAgent.meta?.ratings || 0) }">★</span>
              </div>
              <p
                v-if="editingField !== 'description'"
                class="detail-desc editable-field"
                @click="startEdit('description')"
              >{{ localeMetaValue(selectedAgent.meta, 'description', selectedAgent.description) }}</p>
              <el-input
                v-else
                ref="descInputRef"
                v-model="editValue"
                type="textarea"
                :rows="2"
                size="small"
                @blur="saveMetaField('description')"
                @keydown.enter.ctrl="saveMetaField('description')"
              />
            </div>

            <!-- ── 只读模式：已选技能与工具摘要 ── -->
            <div v-if="!isEditing" class="readonly-summary">
              <!-- 已选技能 -->
              <div class="summary-section">
                <div class="summary-section-title">
                  <el-icon><CollectionTag /></el-icon>
                  {{ t('agentEditor.tabSkills') }} ({{ assignedSkills.length }})
                </div>
                <div class="summary-list">
                  <div
                    v-for="sk in assignedSkills"
                    :key="sk.name"
                    class="summary-item"
                  >
                    <div class="si-title">{{ localeMetaValue(sk.metadata, 'name', sk.name) }}</div>
                    <div class="si-desc">{{ localeMetaValue(sk.metadata, 'description', sk.description || '') }}</div>
                    <div class="sk-meta">
                      <span v-if="sk.metadata?.author" class="sk-tag">{{ sk.metadata?.author }}</span>
                      <span v-if="sk.metadata?.version" class="sk-tag sk-version">v{{ sk.metadata?.version }}</span>
                      <span
                        v-if="sk.license"
                        class="sk-tag sk-license"
                        @click.stop="openLicense(sk.name, sk.license)"
                      >{{ t('agentEditor.licenseLink') }}</span>
                    </div>
                  </div>
                  <div v-if="assignedSkills.length === 0" class="summary-empty">{{ t('agentEditor.noSkills') }}</div>
                </div>
              </div>

              <!-- 已启用的工具 -->
              <div class="summary-section">
                <div class="summary-section-title">
                  <el-icon><Tools /></el-icon>
                  {{ t('agentEditor.tabTools') }} ({{ localEnabledTools.size }}/{{ TOOLS.length }})
                </div>
                <div class="summary-list">
                  <!-- 工具组 -->
                  <div
                    v-for="g in readonlyToolGroups"
                    :key="g.key"
                    class="summary-item summary-item-group"
                  >
                    <div class="si-title">{{ g.label }} <span class="si-badge">{{ g.memberCount }} tools</span></div>
                    <div class="si-desc">{{ g.desc }}</div>
                  </div>
                  <!-- 独立工具 -->
                  <div
                    v-for="tool in enabledStandaloneTools"
                    :key="tool.name"
                    class="summary-item"
                  >
                    <div class="si-title">{{ t(`agentEditor.tools.${tool.name}`) }}</div>
                    <div class="si-desc">{{ t(`agentEditor.toolDescs.${tool.name}`) }}</div>
                  </div>
                  <div v-if="localEnabledTools.size === 0" class="summary-empty">{{ t('agentEditor.noTools') }}</div>
                </div>
              </div>
            </div>

            <!-- ── 编辑模式：多选 Tab ── -->
            <template v-if="isEditing">
              <!-- Tab: 技能 / 基本能力 -->
              <div class="detail-tabs">
                <div
                  class="dt-tab"
                  :class="{ active: editorTab === 'skills' }"
                  @click="editorTab = 'skills'"
                >
                  <el-icon><CollectionTag /></el-icon>
                  {{ t('agentEditor.tabSkills') }} ({{ localSkills.length }}/{{ allSkills.length }})
                </div>
                <div
                  class="dt-tab"
                  :class="{ active: editorTab === 'tools' }"
                  @click="editorTab = 'tools'"
                >
                  <el-icon><Tools /></el-icon>
                  {{ t('agentEditor.tabTools') }} ({{ localEnabledTools.size }}/{{ TOOLS.length }})
                </div>
              </div>

              <!-- 技能列表 -->
              <div v-show="editorTab === 'skills'" class="tab-panel">
                <div v-loading="skillsLoading" class="tab-panel-inner">
                  <div class="tab-actions">
                    <el-checkbox
                      :model-value="allSkillsAssigned()"
                      :indeterminate="someSkillsAssigned()"
                      @change="toggleAllSkills"
                      :disabled="allSkills.length === 0"
                    >
                      {{ t('agentEditor.selectAll') }}
                    </el-checkbox>
                    <div class="tab-actions-right">
                        <span class="tab-summary">{{ t('agentEditor.skillsAssigned', { n: localSkills.length, total: allSkills.length }) }}</span>
                        <el-popover
                          placement="bottom-end"
                          :width="320"
                          trigger="click"
                          :show-arrow="false"
                          popper-class="skill-tip-popper"
                        >
                          <template #reference>
                            <span class="tip-link">{{ t('agentEditor.skillTip') }}</span>
                          </template>
                          <div class="tip-popover-body">
                            <p>{{ t('agentEditor.skillTipContent') }}</p>
                            <el-button size="small" @click="selectDifficulty">
                              <el-icon :size="14"><Warning /></el-icon>
                              {{ t('agentEditor.skillTipAction') }}
                            </el-button>
                          </div>
                        </el-popover>
                        <span class="sep">|</span>
                        <span class="tip-link" @click="skillShortage">{{ t('agentEditor.skillShortage') }}</span>
                      </div>
                  </div>
                  <div class="checkbox-list">
                    <div
                      v-for="sk in skillsList"
                      :key="sk.name"
                      class="checkbox-item"
                    >
                      <el-checkbox
                        :model-value="sk.assigned"
                        @change="toggleSkill(sk.origName, $event)"
                      >
                        <div class="skill-content">
                          <span class="sk-label">
                            {{ sk.name }}
                            <span v-if="sk.author || sk.license" class="sk-third-badge">{{ t('agentEditor.thirdParty') }}</span>
                          </span>
                          <span class="sk-desc">{{ sk.desc }}</span>
                          <div class="sk-meta">
                            <span v-if="sk.author" class="sk-tag">{{ sk.author }}</span>
                            <span v-if="sk.version" class="sk-tag sk-version">v{{ sk.version }}</span>
                            <span
                              v-if="sk.license"
                              class="sk-tag sk-license"
                              @click.stop="openLicense(sk.name, sk.license)"
                            >{{ t('agentEditor.licenseLink') }}</span>
                          </div>
                        </div>
                      </el-checkbox>
                    </div>
                    <div v-if="allSkills.length === 0 && !skillsLoading" class="empty-hint">
                      {{ t('agentEditor.noSkills') }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 基本能力列表 -->
              <div v-show="editorTab === 'tools'" class="tab-panel">
                <div class="tab-actions">
                  <el-checkbox
                    :model-value="allToolsEnabled()"
                    :indeterminate="someToolsEnabled()"
                    @change="toggleAllTools"
                  >
                    {{ t('agentEditor.selectAll') }}
                  </el-checkbox>
                  <span class="tab-summary">{{ t('agentEditor.toolsEnabled', { n: localEnabledTools.size, total: TOOLS.length }) }}</span>
                </div>
                <div class="checkbox-list">
                  <div
                    v-for="item in toolsList"
                    :key="item.key"
                    class="checkbox-item"
                  >
                    <el-checkbox
                      :model-value="item.enabled"
                      :indeterminate="item.type === 'group' ? item.indeterminate : undefined"
                      @change="item.type === 'group' ? toggleGroup(item.members || [], $event) : toggleTool(item.name, $event)"
                    >
                      <div class="ci-content">
                        <span class="ci-label">{{ item.label }}</span>
                        <span class="ci-id">{{ item.type === 'group' ? (item.key === 'task' ? 'Tasks' : 'Teams') : item.name }}</span>
                        <span class="ci-desc">{{ item.desc }}</span>
                      </div>
                    </el-checkbox>
                  </div>
                </div>
              </div>

              <!-- 底部提示 -->
              <div class="detail-footer">
                <span>{{ t('agentEditor.dblClickHint') }}</span>
              </div>
            </template>
          </div>

          <!-- 未选择 -->
          <div class="right-panel" v-else>
            <div class="no-selection">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="no-selection-icon">
                <path d="M9 15C8.44771 15 8 15.4477 8 16C8 16.5523 8.44771 17 9 17C9.55229 17 10 16.5523 10 16C10 15.4477 9.55229 15 9 15Z"/>
                <path d="M14 16C14 15.4477 14.4477 15 15 15C15.5523 15 16 15.4477 16 16C16 16.5523 15.5523 17 15 17C14.4477 17 14 16.5523 14 16Z"/>
                <path fill-rule="evenodd" clip-rule="evenodd" d="M12 1C10.8954 1 10 1.89543 10 3C10 3.74028 10.4022 4.38663 11 4.73244V7H6C4.34315 7 3 8.34315 3 10V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V10C21 8.34315 19.6569 7 18 7H13V4.73244C13.5978 4.38663 14 3.74028 14 3C14 1.89543 13.1046 1 12 1ZM5 10C5 9.44772 5.44772 9 6 9H7.38197L8.82918 11.8944C9.16796 12.572 9.86049 13 10.618 13H13.382C14.1395 13 14.832 12.572 15.1708 11.8944L16.618 9H18C18.5523 9 19 9.44772 19 10V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V10ZM13.382 11L14.382 9H9.61803L10.618 11H13.382Z"/>
                <path d="M1 14C0.447715 14 0 14.4477 0 15V17C0 17.5523 0.447715 18 1 18C1.55228 18 2 17.5523 2 17V15C2 14.4477 1.55228 14 1 14Z"/>
                <path d="M22 15C22 14.4477 22.4477 14 23 14C23.5523 14 24 14.4477 24 15V17C24 17.5523 23.5523 18 23 18C22.4477 18 22 17.5523 22 17V15Z"/>
              </svg>
              <p>{{ t('agentEditor.noSelection') }}</p>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="emit('update:visible', false)">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="switchActiveAgent(selectedAgentName)"
          :disabled="!selectedAgentName || selectedAgentName === (connectionStore.currentAgent?.name || connectionStore.primaryAgent?.name)"
        >
          {{ t('agentEditor.select') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ── License 阅读器 ── -->
    <el-dialog
      :model-value="licenseDialogVisible"
      @update:model-value="licenseDialogVisible = false"
      :title="t('agentEditor.licenseTitle', { name: licenseDialogTitle })"
      width="640px"
      class="license-dialog"
      append-to-body
      destroy-on-close
    >
      <pre class="license-body">{{ licenseDialogContent }}</pre>
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
  min-height: 400px;
}

/* ── 左右布局 ── */
.editor-layout {
  display: flex;
  gap: 16px;
  height: 580px;
}

/* ── 左侧面板 ── */
.left-panel {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(55, 65, 81, 0.4);
  padding-right: 12px;
}
.panel-title {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .8px;
  margin-bottom: 8px;
  padding: 0 4px;
}
.agent-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.agent-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all .15s;
  border: 1px solid transparent;
}
.agent-list-item:hover {
  background: rgba(55, 65, 81, 0.25);
}
.agent-list-item.selected {
  background: rgba(6, 182, 212, 0.08);
  border-color: rgba(6, 182, 212, 0.25);
}
.agent-list-item.active {
  border-color: rgba(6, 182, 212, 0.4);
}
.ali-avatar {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(55, 65, 81, 0.4);
  color: #64748b;
  flex-shrink: 0;
}
.agent-list-item.active .ali-avatar {
  background: rgba(6, 182, 212, 0.12);
  color: #06b6d4;
}
.ali-info {
  flex: 1;
  min-width: 0;
}
.ali-name {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1.3;
}
.ali-id {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: #64748b;
}
.ali-badge {
  font-size: 9px;
  font-weight: 700;
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.1);
  padding: 1px 6px;
  border-radius: 6px;
  white-space: nowrap;
}

.ali-rating {
  display: flex;
  gap: 1px;
  margin-top: 2px;
}
.ali-rating .astar {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.2);
}
.ali-rating .astar.filled {
  color: #f59e0b;
}

.detail-rating {
  display: flex;
  gap: 2px;
  margin-top: 4px;
}
.detail-rating .dstar {
  font-size: 14px;
  color: rgba(148, 163, 184, 0.2);
}
.detail-rating .dstar.filled {
  color: #f59e0b;
}
.empty-list {
  color: #64748b;
  font-size: 12px;
  padding: 20px 8px;
  text-align: center;
}
.left-footer {
  border-top: 1px solid rgba(55, 65, 81, 0.3);
  padding: 8px 4px 0;
  margin-top: 8px;
}
.lf-link {
  font-size: 11px;
  color: #06b6d4;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.lf-link:hover {
  color: #22d3ee;
}

/* ── 只读摘要 ── */
.readonly-summary {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.summary-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.summary-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.summary-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.summary-item {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.35);
  border: 1px solid rgba(55, 65, 81, 0.25);
}
.summary-item-group {
  border-color: rgba(6, 182, 212, 0.2);
  background: rgba(6, 182, 212, 0.04);
}
.si-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.si-badge {
  font-size: 10px;
  font-weight: 500;
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.1);
  padding: 0 6px;
  border-radius: 4px;
  line-height: 1.6;
}
.si-desc {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
  line-height: 1.5;
}
.summary-empty {
  font-size: 12px;
  color: #64748b;
  font-style: italic;
  padding: 6px 10px;
}

/* ── 右侧面板 ── */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.detail-header {
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.3);
  margin-bottom: 8px;
}
.dh-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.dh-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.dh-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.dh-top h3 {
  font-size: 18px;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0;
}
.detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.meta-role {
  font-size: 12px;
  color: #06b6d4;
  font-weight: 500;
}
.meta-model {
  font-size: 10px;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.1);
  padding: 1px 7px;
  border-radius: 6px;
}
.detail-desc {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
  word-break: break-word;
}
.editable-field {
  cursor: pointer;
  transition: background .12s;
  border-radius: 4px;
  padding: 1px 4px;
  margin: -1px -4px;
}
.editable-field:hover {
  background: rgba(6, 182, 212, 0.06);
}

/* ── Tab 栏 ── */
.detail-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.35);
}
.dt-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all .15s;
  user-select: none;
}
.dt-tab:hover {
  color: #94a3b8;
}
.dt-tab.active {
  color: #06b6d4;
  border-bottom-color: #06b6d4;
}

/* ── Tab 内容 ── */
.tab-panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.tab-panel-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tab-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin: 8px 0;
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
.tab-actions-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tip-link {
  font-size: 11px;
  color: #06b6d4;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  white-space: nowrap;
}
.tip-link:hover {
  color: #22d3ee;
}
.sep {
  font-size: 11px;
  color: rgba(55, 65, 81, 0.6);
}

/* ── Checkbox 列表 ── */
.checkbox-list {
  flex: 1;
  overflow-y: auto;
}
.checkbox-item {
  padding: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.15);
  transition: background .12s;
}
.checkbox-item:hover {
  background: rgba(6, 182, 212, 0.03);
}
.checkbox-item:last-child {
  border-bottom: none;
}
.checkbox-item :deep(.el-checkbox) {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px 8px;
  height: auto;
}
.checkbox-item :deep(.el-checkbox__label) {
  width: 100%;
}
.ci-content {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.ci-label {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  min-width: 72px;
}
.ci-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #64748b;
  background: rgba(55, 65, 81, 0.25);
  padding: 1px 5px;
  border-radius: 3px;
  min-width: 70px;
  text-align: center;
}
.ci-desc {
  font-size: 11px;
  color: #64748b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-hint {
  color: #64748b;
  font-size: 12px;
  padding: 24px;
  text-align: center;
}

/* ── 技能列表两行布局 ── */
.skill-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
  width: 100%;
}
.sk-label {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sk-third-badge {
  font-size: 9px;
  font-weight: 700;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.5;
  letter-spacing: .3px;
}
.sk-desc {
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
  white-space: pre-line;
  word-break: break-word;
}
.sk-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  flex-wrap: wrap;
}
.sk-tag {
  font-size: 10px;
  color: #64748b;
  background: rgba(55, 65, 81, 0.25);
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.5;
}
.sk-version {
  color: #818cf8;
  background: rgba(99, 102, 241, 0.1);
}
.sk-license {
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.1);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: background .15s;
}
.sk-license:hover {
  background: rgba(6, 182, 212, 0.2);
}

/* ── 底部 ── */
.detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 0;
  font-size: 10px;
  color: #475569;
  border-top: 1px solid rgba(55, 65, 81, 0.2);
  margin-top: 8px;
}

.no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
}
.no-selection-icon {
  color: #64748b;
}
.no-selection p {
  color: #64748b;
  font-size: 13px;
  margin: 0;
}
</style>

<style>
.agent-editor-dialog .el-overlay {
  background: rgba(0, 0, 0, 0.65);
}
.agent-editor-dialog .el-dialog {
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}
.agent-editor-dialog .el-dialog__header {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.agent-editor-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}
.agent-editor-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}
.agent-editor-dialog .el-dialog__body {
  padding: 16px 24px 12px;
  max-height: 70vh;
  overflow-y: auto;
}
.agent-editor-dialog .el-dialog__footer {
  padding: 8px 24px 16px;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
}
.agent-editor-dialog .el-button {
  --el-button-bg-color: rgba(55, 65, 81, 0.4);
  --el-button-border-color: rgba(55, 65, 81, 0.6);
  --el-button-hover-bg-color: rgba(55, 65, 81, 0.6);
  --el-button-hover-border-color: rgba(55, 65, 81, 0.8);
  --el-button-text-color: #94a3b8;
  --el-button-hover-text-color: #e2e8f0;
}
.agent-editor-dialog .el-button--primary {
  --el-button-bg-color: #06b6d4;
  --el-button-border-color: #06b6d4;
  --el-button-hover-bg-color: #0891b2;
  --el-button-hover-border-color: #0891b2;
  --el-button-text-color: #fff;
  --el-button-hover-text-color: #fff;
  color: #fff;
}

/* Checkbox styling to match theme */
.agent-editor-dialog .el-checkbox {
  color: #cbd5e1;
}
.agent-editor-dialog .el-checkbox.is-checked {
  color: #06b6d4;
}
.agent-editor-dialog .el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #06b6d4;
  border-color: #06b6d4;
}
.agent-editor-dialog .el-checkbox__input.is-indeterminate .el-checkbox__inner {
  background-color: #06b6d4;
  border-color: #06b6d4;
}
.agent-editor-dialog .el-checkbox__inner {
  background: rgba(15, 23, 42, 0.8);
  border-color: rgba(55, 65, 81, 0.6);
}

/* ── License Dialog ── */
.license-dialog .el-dialog__body {
  padding: 16px 24px;
  max-height: 60vh;
  overflow-y: auto;
}
.license-body {
  font-family: 'JetBrains Mono', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.6;
  color: #94a3b8;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  background: rgba(15, 23, 42, 0.6);
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid rgba(55, 65, 81, 0.3);
}

/* ── 技能提示 Popover ── */
.skill-tip-popper {
  background: #1e293b !important;
  border: 1px solid rgba(55, 65, 81, 0.6) !important;
  border-radius: 10px !important;
  padding: 16px !important;
}
.skill-tip-popper .tip-popover-body p {
  font-size: 12px;
  line-height: 1.7;
  color: #94a3b8;
  margin: 0 0 14px;
}
.skill-tip-popper .tip-popover-body .el-button {
  width: 100%;
}
</style>
