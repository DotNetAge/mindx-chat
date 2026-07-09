<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Connection, Search, Link } from '@element-plus/icons-vue'
import { useMCP } from '../composables/useMCP'
import { useConnectionStore } from '../stores/connectionStore'
import type { MCPServerListEntry, MCPServerConfig, MCPServerType, MCPToolDef, EnabledToolEntry } from '../types/mcp'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const connectionStore = useConnectionStore()

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const mcp = useMCP()

// --- Server Manager State ---
const servers = ref<MCPServerListEntry[]>([])
const serverConnStatus = ref<Record<string, 'unknown' | 'connected' | 'disconnected'>>({})
const showServerForm = ref(false)
const editingServer = ref<MCPServerListEntry | null>(null)
const serverForm = ref({
  name: '',
  type: 'stdio' as MCPServerType,
  command: '',
  args: '',
  url: '',
  idle_ttl_secs: 300,
})
const serverFormLoading = ref(false)

// --- Enabled Tools State ---
const tools = ref<EnabledToolEntry[]>([])
const toolsLoading = ref(false)
const savingManifest = ref(false)

// --- Computed ---
const connectedServers = computed(() => {
  return Object.values(serverConnStatus.value).filter(s => s === 'connected').length
})

const enabledCount = computed(() => {
  return tools.value.filter(t => t.enabled).length
})

const allSelected = computed(() => {
  return tools.value.length > 0 && tools.value.every(t => t.enabled)
})

const statusText = computed(() => {
  return t('mcp.status', { count: enabledCount.value, servers: connectedServers.value })
})

// --- Lifecycle ---
watch(() => props.visible, async (val) => {
  if (val) {
    await loadData()
  }
})

async function loadData() {
  await Promise.all([loadServers(), loadManifest()])
}

async function loadServers() {
  try {
    servers.value = await mcp.listServers()
  } catch (e: any) {
    console.error('[MCP] Failed to load servers:', e)
  }
}

async function loadManifest() {
  try {
    const manifest = await mcp.getManifest()
    if (manifest && manifest.tools) {
      tools.value = manifest.tools.map(entry => ({
        goharnessName: `mcp:${entry.server}:${entry.mcp_name}`,
        mcpName: entry.mcp_name,
        server: entry.server,
        description: entry.description,
        inputSchema: entry.input_schema,
        enabled: true,
        isNew: false,
      }))
    } else {
      tools.value = []
    }
  } catch (e: any) {
    console.error('[MCP] Failed to load manifest:', e)
    tools.value = []
  }
}

// --- Server CRUD ---
function openAddServer() {
  editingServer.value = null
  serverForm.value = {
    name: '',
    type: 'stdio',
    command: '',
    args: '',
    url: '',
    idle_ttl_secs: 300,
  }
  showServerForm.value = true
}

function openEditServer(server: MCPServerListEntry) {
  editingServer.value = server
  serverForm.value = {
    name: server.name,
    type: (server.type as MCPServerType) || 'stdio',
    command: server.command || '',
    args: server.args ? server.args.join(' ') : '',
    url: server.url || '',
    idle_ttl_secs: server.idle_ttl_secs || 300,
  }
  showServerForm.value = true
}

async function handleSaveServer() {
  const form = serverForm.value
  if (!form.name.trim()) {
    ElMessage.warning(t('mcp.serverName') + ' ' + t('common.error'))
    return
  }

  serverFormLoading.value = true
  try {
    const args = form.args ? form.args.split(/\s+/).filter(Boolean) : []
    const cfg: MCPServerConfig = {
      name: form.name.trim(),
      type: form.type,
      idle_ttl_secs: form.idle_ttl_secs,
    }
    if (form.type === 'stdio') {
      cfg.command = form.command
      cfg.args = args
    } else {
      cfg.url = form.url
    }
    await mcp.addServer(cfg)
    ElMessage.success(editingServer.value ? t('common.success') : t('common.success'))
    showServerForm.value = false
    await loadServers()
  } catch (e: any) {
    ElMessage.error(e?.message || t('common.error'))
  } finally {
    serverFormLoading.value = false
  }
}

async function handleRemoveServer(server: MCPServerListEntry) {
  try {
    await ElMessageBox.confirm(
      t('mcp.confirmRemove', { name: server.name }),
      t('mcp.removeServer'),
      { confirmButtonText: t('common.delete'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
  } catch {
    return
  }

  try {
    await mcp.removeServer(server.name)
    // Remove tools from this server
    tools.value = tools.value.filter(t => t.server !== server.name)
    delete serverConnStatus.value[server.name]
    await loadServers()
    ElMessage.success(t('common.success'))
  } catch (e: any) {
    ElMessage.error(e?.message || t('common.error'))
  }
}

// --- Connection Test ---
async function handleTestConnection(name: string) {
  serverConnStatus.value[name] = 'unknown'
  try {
    const result = await mcp.testConnection(name)
    serverConnStatus.value[name] = result.ok ? 'connected' : 'disconnected'
    if (result.ok) {
      ElMessage.success(t('mcp.testSuccess'))
    } else {
      ElMessage.error(result.error || t('mcp.testFailed'))
    }
  } catch (e: any) {
    serverConnStatus.value[name] = 'disconnected'
    ElMessage.error(e?.message || t('mcp.testFailed'))
  }
}

// --- Discover Tools ---
async function handleDiscover(name: string) {
  toolsLoading.value = true
  try {
    const discovered: MCPToolDef[] = await mcp.discoverTools(name)
    serverConnStatus.value[name] = 'connected'

    // Dedup by goharnessName
    const existingNames = new Set(tools.value.map(t => t.goharnessName))
    const newTools: EnabledToolEntry[] = []
    for (const tool of discovered) {
      const goharnessName = `mcp:${name}:${tool.name}`
      if (!existingNames.has(goharnessName)) {
        newTools.push({
          goharnessName,
          mcpName: tool.name,
          server: name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          enabled: false,
          isNew: true,
        })
      }
    }
    tools.value = [...tools.value, ...newTools]
    ElMessage.success(t('mcp.discoverSuccess', { count: discovered.length }))
  } catch (e: any) {
    serverConnStatus.value[name] = 'disconnected'
    ElMessage.error(e?.message || t('mcp.testFailed'))
  } finally {
    toolsLoading.value = false
  }
}

// --- Tool Selection ---
function toggleTool(index: number) {
  tools.value[index].enabled = !tools.value[index].enabled
}

function selectAll() {
  tools.value.forEach(t => (t.enabled = true))
}

function deselectAll() {
  tools.value.forEach(t => (t.enabled = false))
}

// --- Save Manifest ---
async function handleSaveManifest() {
  savingManifest.value = true
  try {
    const enabled = tools.value.filter(t => t.enabled)
    const entries = enabled.map(t => ({
      name: t.goharnessName,
      server: t.server,
      mcp_name: t.mcpName,
      description: t.description,
      input_schema: t.inputSchema,
    }))
    const result = await mcp.saveManifest(entries)
    // Mark all as not new
    tools.value.forEach(t => (t.isNew = false))
    ElMessage.success(t('mcp.savedManifest', { count: result.tool_count }))
  } catch (e: any) {
    ElMessage.error(e?.message || t('common.error'))
  } finally {
    savingManifest.value = false
  }
}

async function handleReset() {
  await loadManifest()
}

function close() {
  emit('update:visible', false)
}

function getServerIcon(type: string) {
  if (type === 'sse' || type === 'http') return Link
  return Connection
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('mcp.title')"
    width="900px"
    :close-on-click-modal="false"
    class="mcp-explorer-dialog"
    append-to-body
    destroy-on-close
    @update:model-value="(v: boolean) => { if (!v) close() }"
  >
    <div class="mcp-explorer" v-if="visible">
      <!-- Left: Server Manager -->
      <div class="mcp-panel mcp-panel-left">
        <div class="panel-header">
          <span class="panel-title">{{ t('mcp.serverManager') }}</span>
          <el-button size="small" type="primary" @click="openAddServer">
            <el-icon><Plus /></el-icon>
            {{ t('mcp.addServer') }}
          </el-button>
        </div>

        <div class="server-list" v-if="servers.length > 0">
          <div
            v-for="server in servers"
            :key="server.name"
            class="server-card"
          >
            <div class="server-info">
              <div class="server-name-row">
                <span
                  class="server-status-dot"
                  :class="{
                    connected: serverConnStatus[server.name] === 'connected',
                    disconnected: serverConnStatus[server.name] === 'disconnected',
                  }"
                ></span>
                <span class="server-name">{{ server.name }}</span>
                <el-tag size="small" type="info">{{ server.type }}</el-tag>
              </div>
              <div class="server-meta" v-if="server.command || server.url">
                <el-icon :size="12"><component :is="getServerIcon(server.type)" /></el-icon>
                <span>{{ server.command || server.url }}</span>
              </div>
            </div>
            <div class="server-actions">
              <el-button
                size="small"
                text
                @click="handleTestConnection(server.name)"
              >
                {{ t('mcp.testConnection') }}
              </el-button>
              <el-button
                size="small"
                text
                type="primary"
                :loading="toolsLoading"
                @click="handleDiscover(server.name)"
              >
                {{ t('mcp.discoverTools') }}
              </el-button>
              <el-button
                size="small"
                text
                @click="openEditServer(server)"
              >
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button
                size="small"
                text
                type="danger"
                @click="handleRemoveServer(server)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>

        <div class="empty-state" v-else>
          <p>{{ t('mcp.noServers') }}</p>
        </div>
      </div>

      <!-- Right: Enabled Tools -->
      <div class="mcp-panel mcp-panel-right">
        <div class="panel-header">
          <span class="panel-title">{{ t('mcp.enabledTools') }}</span>
          <div class="panel-header-actions">
            <el-button size="small" text @click="selectAll">{{ t('mcp.selectAll') }}</el-button>
            <el-button size="small" text @click="deselectAll">{{ t('mcp.deselectAll') }}</el-button>
            <el-button size="small" text @click="handleReset">{{ t('mcp.reset') }}</el-button>
            <el-button
              size="small"
              type="primary"
              :loading="savingManifest"
              @click="handleSaveManifest"
            >
              {{ t('mcp.save') }}
            </el-button>
          </div>
        </div>

        <div class="tool-list" v-if="tools.length > 0">
          <div
            v-for="(tool, index) in tools"
            :key="tool.goharnessName"
            class="tool-item"
            :class="{ enabled: tool.enabled }"
          >
            <el-checkbox
              :model-value="tool.enabled"
              @change="toggleTool(index)"
            >
              <span class="tool-name">{{ tool.goharnessName }}</span>
            </el-checkbox>
            <p class="tool-desc">{{ tool.description }}</p>
            <span class="tool-server">
              {{ t('mcp.serverName').replace(' ', ': ') }}: {{ tool.server }}
              <el-tag v-if="tool.isNew" size="small" type="success" class="tool-new-tag">{{ t('mcp.new') }}</el-tag>
            </span>
          </div>
        </div>

        <div class="empty-state" v-else>
          <p>{{ t('mcp.emptyManifest') }}</p>
        </div>

        <div class="panel-footer">
          <span class="status-text">{{ statusText }}</span>
        </div>
      </div>
    </div>

    <!-- Server Form Dialog -->
    <el-dialog
      v-model="showServerForm"
      :title="editingServer ? t('mcp.editServer') : t('mcp.addServer')"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('mcp.serverName')">
          <el-input v-model="serverForm.name" :disabled="!!editingServer" />
        </el-form-item>
        <el-form-item :label="t('mcp.serverType')">
          <el-select v-model="serverForm.type" style="width: 100%">
            <el-option label="stdio" value="stdio" />
            <el-option label="sse" value="sse" />
            <el-option label="http" value="http" />
          </el-select>
        </el-form-item>
        <template v-if="serverForm.type === 'stdio'">
          <el-form-item :label="t('mcp.command')">
            <el-input v-model="serverForm.command" placeholder="e.g. npx, uvx, node" />
          </el-form-item>
          <el-form-item :label="t('mcp.args')">
            <el-input v-model="serverForm.args" placeholder="e.g. -y @modelcontextprotocol/server-filesystem /path" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="URL">
            <el-input v-model="serverForm.url" placeholder="http://localhost:8000/sse" />
          </el-form-item>
        </template>
        <el-form-item :label="t('mcp.idleTTL')">
          <el-input-number v-model="serverForm.idle_ttl_secs" :min="0" :step="60" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showServerForm = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="serverFormLoading" @click="handleSaveServer">
          {{ editingServer ? t('common.save') : t('common.create') }}
        </el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
.mcp-explorer {
  display: flex;
  gap: 0;
  height: 520px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.mcp-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mcp-panel-left {
  border-right: 1px solid var(--border-color);
  background: var(--bg-card);
}

.mcp-panel-right {
  background: var(--bg-card);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-header-actions {
  display: flex;
  gap: 4px;
}

.server-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.server-card {
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  transition: all 0.15s ease;
}

.server-card:hover {
  border-color: var(--accent-cyan);
}

.server-info {
  margin-bottom: 8px;
}

.server-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.server-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.server-status-dot.connected {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.server-status-dot.disconnected {
  background: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

.server-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.server-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-actions {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}

.server-actions .el-button {
  font-size: 12px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px;
}

.tool-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 0;
}

.tool-item {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  margin-bottom: 6px;
  transition: all 0.15s ease;
}

.tool-item:hover {
  border-color: var(--border-color);
  background: var(--bg-hover);
}

.tool-item.enabled {
  border-color: rgba(6, 182, 212, 0.2);
  background: rgba(6, 182, 212, 0.04);
}

.tool-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
}

.tool-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin: 4px 0 4px 24px;
  line-height: 1.4;
}

.tool-server {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 24px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-new-tag {
  font-size: 10px;
}

.panel-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.status-text {
  font-size: 12px;
  color: var(--text-muted);
}
</style>

<style>
.mcp-explorer-dialog .el-dialog {
  background: #111827;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.mcp-explorer-dialog .el-dialog__header {
  padding: 20px 24px 12px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

.mcp-explorer-dialog .el-dialog__title {
  color: #e2e8f0;
  font-size: 16px;
  font-weight: 700;
}

.mcp-explorer-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}

.mcp-explorer-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}

.mcp-explorer-dialog .el-dialog__body {
  padding: 0;
  color: #cbd5e1;
}

.mcp-explorer-dialog .el-checkbox__label {
  color: #e2e8f0;
}

.mcp-explorer {
  background: #111827;
}

.mcp-panel-left {
  border-right-color: rgba(55, 65, 81, 0.5) !important;
  background: rgba(15, 23, 42, 0.5) !important;
}

.mcp-panel-right {
  background: rgba(15, 23, 42, 0.3) !important;
}

.panel-header {
  border-bottom-color: rgba(55, 65, 81, 0.5) !important;
}

.panel-title {
  color: #e2e8f0 !important;
}

.server-card {
  background: rgba(15, 23, 42, 0.8) !important;
  border-color: rgba(55, 65, 81, 0.5) !important;
}

.tool-item:hover {
  border-color: rgba(55, 65, 81, 0.6) !important;
  background: rgba(30, 41, 59, 0.6) !important;
}

.tool-item.enabled {
  border-color: rgba(6, 182, 212, 0.3) !important;
  background: rgba(6, 182, 212, 0.06) !important;
}

.panel-footer {
  border-top-color: rgba(55, 65, 81, 0.5) !important;
}
</style>
