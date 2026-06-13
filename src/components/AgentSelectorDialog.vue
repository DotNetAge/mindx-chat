<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UserFilled, Monitor, Tools, CollectionTag } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useConnectionStore } from '../stores/connectionStore'
import { getMindXClient } from '../services/websocket'
import type { AgentInfo } from '../stores/connectionStore'
import type { SkillInfo } from '../types/websocket'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible'])

const { t } = useI18n()
const connectionStore = useConnectionStore()

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
  { name: 'FileEdit', desc: 'Edit files by replacing exact strings' },
  { name: 'Bash', desc: 'Execute a POSIX shell command in the workspace environment' },
  { name: 'RunScript', desc: 'Execute a script file from a skill\'s scripts/ directory' },
  { name: 'WebSearch', desc: 'Search the web for real-time information' },
  { name: 'WebFetch', desc: 'Fetch and extract content from a web page' },
  { name: 'AskUser', desc: 'Ask the user a question to gather information or make decisions' },
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
  { name: 'AgentTalk', desc: 'Send a message to another agent and get a reply' },
]

// ── 当前选中的 Agent ──
const selectedAgentName = ref('')
const editorTab = ref<'tools' | 'skills'>('tools')

// ── 编辑中的本地状态 ──
const localSkills = ref<string[]>([])
const localEnabledTools = ref<Set<string>>(new Set())

// ── 所有可用技能（从 RPC 加载） ──
const allSkills = ref<SkillInfo[]>([])
const skillsLoading = ref(false)

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

// ── 当前选中的 Agent 对象 ──
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
}
const agentCards = computed<AgentCard[]>(() => {
  return connectionStore.agents.map((a: AgentInfo) => ({
    name: a.name,
    nameZh: getMetaVal(a.meta, 'name_zh') || a.name,
    roleZh: getMetaVal(a.meta, 'role_zh') || a.role,
    descZh: getMetaVal(a.meta, 'description_zh') || a.description,
    model: a.model,
    isActive: a.name === (connectionStore.currentAgent?.name || connectionStore.primaryAgent?.name)
  }))
})

// ── 工具列表（含 i18n label） ──
interface ToolItem {
  name: string
  label: string
  desc: string
  enabled: boolean
}
const toolsList = computed<ToolItem[]>(() => {
  return TOOLS.map(tool => ({
    name: tool.name,
    label: t(`agentEditor.tools.${tool.name}`),
    desc: t(`agentEditor.toolDescs.${tool.name}`),
    enabled: localEnabledTools.value.has(tool.name)
  }))
})

// ── 技能列表（含 i18n label，从 SKILL.md 的 description 字段显示） ──
interface SkillItem {
  name: string
  desc: string
  assigned: boolean
}
const skillsList = computed<SkillItem[]>(() => {
  return allSkills.value.map(s => ({
    name: s.name,
    desc: s.description || '',
    assigned: localSkills.value.includes(s.name)
  }))
})

// ── 切换工具启用/禁用 ──
function toggleTool(name: string, enable: boolean) {
  if (enable) {
    localEnabledTools.value.add(name)
  } else {
    localEnabledTools.value.delete(name)
  }
  // 触发响应式更新
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
    emit('update:visible', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('agentEditor.saveFailed'))
  }
}

// ── 对话框打开时初始化 ──
watch(() => props.visible, (val) => {
  if (val) {
    const first = connectionStore.agents[0]
    if (first) {
      selectAgent(first.name)
    }
    editorTab.value = 'tools'
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
  <div v-if="visible">
    <el-dialog
      :model-value="true"
      @update:model-value="emit('update:visible', false)"
      title=""
      width="1100px"
      class="agent-editor-dialog"
      append-to-body
      destroy-on-close
    >
      <template #header>
        <div class="dialog-header">
          <h2>
            <el-icon><Monitor /></el-icon>
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
                  <el-icon v-else :size="18"><Monitor /></el-icon>
                </div>
                <div class="ali-info">
                  <div class="ali-name">{{ agent.nameZh }}</div>
                  <div class="ali-id">{{ agent.name }}</div>
                </div>
                <div v-if="agent.isActive" class="ali-badge">{{ t('common.current') }}</div>
              </div>
            </div>
            <div v-else class="empty-list">
              {{ t('agentSelector.empty') }}
            </div>
          </div>

          <!-- ── 右侧详情面板 ── -->
          <div class="right-panel" v-if="selectedAgent">
            <!-- 基本信息 -->
            <div class="detail-header">
              <div class="dh-top">
                <h3>{{ getMetaVal(selectedAgent.meta, 'name_zh') || selectedAgent.name }}</h3>
                <el-button
                  size="small"
                  @click="handleSave"
                >
                  {{ t('common.save') }}
                </el-button>
              </div>
              <div class="detail-meta">
                <span class="meta-role">{{ getMetaVal(selectedAgent.meta, 'role_zh') || selectedAgent.role }}</span>
                <span class="meta-model">{{ selectedAgent.model }}</span>
              </div>
              <p class="detail-desc">{{ getMetaVal(selectedAgent.meta, 'description_zh') || selectedAgent.description }}</p>
            </div>

            <!-- Tab: 工具 / 技能 -->
            <div class="detail-tabs">
              <div
                class="dt-tab"
                :class="{ active: editorTab === 'tools' }"
                @click="editorTab = 'tools'"
              >
                <el-icon><Tools /></el-icon>
                {{ t('agentEditor.tabTools') }} ({{ localEnabledTools.size }}/{{ TOOLS.length }})
              </div>
              <div
                class="dt-tab"
                :class="{ active: editorTab === 'skills' }"
                @click="editorTab = 'skills'"
              >
                <el-icon><CollectionTag /></el-icon>
                {{ t('agentEditor.tabSkills') }} ({{ localSkills.length }}/{{ allSkills.length }})
              </div>
            </div>

            <!-- 工具列表 -->
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
                  v-for="tool in toolsList"
                  :key="tool.name"
                  class="checkbox-item"
                >
                  <el-checkbox
                    :model-value="tool.enabled"
                    @change="toggleTool(tool.name, $event)"
                  >
                    <div class="ci-content">
                      <span class="ci-label">{{ tool.label }}</span>
                      <span class="ci-id">{{ tool.name }}</span>
                      <span class="ci-desc">{{ tool.desc }}</span>
                    </div>
                  </el-checkbox>
                </div>
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
                  <span class="tab-summary">{{ t('agentEditor.skillsAssigned', { n: localSkills.length, total: allSkills.length }) }}</span>
                </div>
                <div class="checkbox-list">
                  <div
                    v-for="sk in skillsList"
                    :key="sk.name"
                    class="checkbox-item"
                  >
                    <el-checkbox
                      :model-value="sk.assigned"
                      @change="toggleSkill(sk.name, $event)"
                    >
                      <div class="skill-content">
                        <span class="sk-label">{{ sk.name }}</span>
                        <span class="sk-desc">{{ sk.desc }}</span>
                      </div>
                    </el-checkbox>
                  </div>
                  <div v-if="allSkills.length === 0 && !skillsLoading" class="empty-hint">
                    {{ t('agentEditor.noSkills') }}
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部提示 -->
            <div class="detail-footer">
              <span>{{ t('agentEditor.dblClickHint') }}</span>
            </div>
          </div>

          <!-- 未选择 -->
          <div class="right-panel" v-else>
            <div class="no-selection">
              <el-icon :size="40" color="#64748b"><Monitor /></el-icon>
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
.empty-list {
  color: #64748b;
  font-size: 12px;
  padding: 20px 8px;
  text-align: center;
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
}
.sk-desc {
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
  white-space: pre-line;
  word-break: break-word;
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
</style>
