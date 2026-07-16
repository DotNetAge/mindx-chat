<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConnectionStore } from '../stores/connectionStore'
import { useMarkdown } from '../composables/useMarkdown'
import { useEditorPreferences } from '../composables/useEditorPreferences'
import CodemirrorEditor from './CodemirrorEditor.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const connectionStore = useConnectionStore()
const { md, renderMermaidInRoot } = useMarkdown()
const editorPrefs = useEditorPreferences()
const mdPreviewRef = ref<HTMLElement | null>(null)

// ── Loading ──
const loading = ref(false)
const saving = ref(false)
const loadingFile = ref(false)

// ── Skill list ──
const skills = ref<Array<{
  name: string
  description: string
  root_dir: string
  source: string
  instructions: string
  paths: string[]
  metadata: Record<string, any>
  license: string
}>>([])

const selectedSkill = ref<string | null>(null)

const selectedSkillData = computed(() => {
  if (!selectedSkill.value) return null
  return skills.value.find(s => s.name === selectedSkill.value) || null
})

// ── File tree for selected skill ──
interface FileNode {
  name: string
  path: string
  is_dir: boolean
  isLeaf: boolean
  children?: FileNode[]
}

const skillFiles = ref<FileNode[]>([])
const selectedFilePath = ref<string | null>(null)
const selectedFileName = ref<string>('')

// Determine the language for CodeMirror based on file extension
function detectLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    md: 'markdown',
    markdown: 'markdown',
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    jsx: 'jsx',
    tsx: 'tsx',
    go: 'go',
    rs: 'rust',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    lua: 'lua',
    swift: 'swift',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    dockerfile: 'dockerfile',
    toml: 'toml',
    conf: 'properties',
    ini: 'properties',
    cfg: 'properties',
    gitignore: 'properties',
  }
  return langMap[ext] || 'markdown'
}

const fileContent = ref('')
const originalContent = ref('')
const storedFrontmatter = ref('') // YAML frontmatter stripped from SKILL.md
const isDirty = computed(() => fileContent.value !== originalContent.value)

// ── Preview mode toggle ──
const previewMode = ref<'editor' | 'preview'>('preview')

// ── Load skills ──
async function loadSkills() {
  loading.value = true
  try {
    const result: any = await connectionStore.fetchSkills()
    skills.value = (Array.isArray(result) ? result : []).map((s: any) => ({
      name: s.name || '',
      description: s.description || '',
      root_dir: s.root_dir || '',
      source: s.source || '',
      instructions: s.instructions || '',
      paths: s.paths || [],
      metadata: s.metadata || {},
      license: s.license || '',
    }))
  } catch (err: any) {
    ElMessage.error('加载技能列表失败: ' + (err?.message || ''))
    skills.value = []
  } finally {
    loading.value = false
  }
}

// ── Load file tree for selected skill ──
async function loadSkillFiles(rootDir: string) {
  skillFiles.value = []
  selectedFilePath.value = null
  fileContent.value = ''
  originalContent.value = ''

  if (!rootDir) return

  loadingFile.value = true
  try {
    // List the skill root directory
    const entries: any = await connectionStore.fetchFSList(rootDir)
    const entriesArr = Array.isArray(entries) ? entries : []

    // Ensure references/ and scripts/ exist
    const hasRefs = entriesArr.some((e: any) => e.name === 'references' && e.is_dir)
    const hasScripts = entriesArr.some((e: any) => e.name === 'scripts' && e.is_dir)

    const promises: Promise<void>[] = []
    if (!hasRefs) {
      promises.push(connectionStore.fetchFSMkdir(rootDir + '/references'))
    }
    if (!hasScripts) {
      promises.push(connectionStore.fetchFSMkdir(rootDir + '/scripts'))
    }
    if (promises.length > 0) {
      await Promise.all(promises)
    }

    // Build tree: SKILL.md + references/ + scripts/
    const tree: FileNode[] = []

    // SKILL.md at root
    tree.push({
      name: 'SKILL.md',
      path: rootDir + '/SKILL.md',
      is_dir: false,
      isLeaf: true,
    })

    // references/
    const refsNode: FileNode = {
      name: 'references',
      path: rootDir + '/references',
      is_dir: true,
      isLeaf: false,
      children: [],
    }
    tree.push(refsNode)

    // scripts/
    const scriptsNode: FileNode = {
      name: 'scripts',
      path: rootDir + '/scripts',
      is_dir: true,
      isLeaf: false,
      children: [],
    }
    tree.push(scriptsNode)

    // Load children for references and scripts
    const [refEntries, scriptEntries] = await Promise.all([
      connectionStore.fetchFSList(rootDir + '/references'),
      connectionStore.fetchFSList(rootDir + '/scripts'),
    ])

    const refArr = Array.isArray(refEntries) ? refEntries : []
    const scriptArr = Array.isArray(scriptEntries) ? scriptEntries : []

    refArr.sort((a: any, b: any) => a.name.localeCompare(b.name))
    for (const e of refArr) {
      if (!e.is_dir) {
        refsNode.children.push({
          name: e.name,
          path: e.path || (rootDir + '/references/' + e.name),
          is_dir: false,
          isLeaf: true,
        })
      }
    }

    scriptArr.sort((a: any, b: any) => a.name.localeCompare(b.name))
    for (const e of scriptArr) {
      if (!e.is_dir) {
        scriptsNode.children.push({
          name: e.name,
          path: e.path || (rootDir + '/scripts/' + e.name),
          is_dir: false,
          isLeaf: true,
        })
      }
    }

    skillFiles.value = tree
  } catch (err: any) {
    ElMessage.error('加载技能文件失败: ' + (err?.message || ''))
    skillFiles.value = []
  } finally {
    loadingFile.value = false
  }
}

// ── Select a skill ──
async function selectSkill(name: string) {
  if (selectedSkill.value === name) return
  // Confirm unsaved changes
  if (isDirty.value) {
    try {
      await ElMessageBox.confirm(
        '当前文件有未保存的更改，是否放弃？',
        '未保存的更改',
        { confirmButtonText: '放弃', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
  }
  selectedSkill.value = name
  const skill = selectedSkillData.value
  if (skill?.root_dir) {
    await loadSkillFiles(skill.root_dir)
    // Auto-open SKILL.md
    if (skillFiles.value.length > 0) {
      await openFile(skillFiles.value[0])
    }
  }
}

// ── Open a file ──
async function openFile(node: FileNode) {
  if (node.is_dir) return
  if (isDirty.value) {
    try {
      await ElMessageBox.confirm(
        '当前文件有未保存的更改，是否放弃？',
        '未保存的更改',
        { confirmButtonText: '放弃', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
  }

  selectedFilePath.value = node.path
  selectedFileName.value = node.name

  loadingFile.value = true
  try {
    const content = await connectionStore.readFile(node.path)
    // For SKILL.md, strip the YAML frontmatter and store it separately
    if (node.name === 'SKILL.md') {
      const match = content.match(/^---\n([\s\S]*?)\n---\n?/)
      if (match) {
        storedFrontmatter.value = match[0]
        fileContent.value = content.slice(match[0].length)
      } else {
        storedFrontmatter.value = ''
        fileContent.value = content
      }
    } else {
      storedFrontmatter.value = ''
      fileContent.value = content
    }
    originalContent.value = fileContent.value
    previewMode.value = 'preview'
  } catch (err: any) {
    ElMessage.error('读取文件失败: ' + (err?.message || ''))
    fileContent.value = ''
    originalContent.value = ''
    storedFrontmatter.value = ''
  } finally {
    loadingFile.value = false
  }
}

// ── Save file ──
async function saveFile() {
  if (!selectedFilePath.value) return
  saving.value = true
  try {
    const isSkillMd = selectedFilePath.value.endsWith('/SKILL.md')
    const contentToWrite = isSkillMd && storedFrontmatter.value
      ? storedFrontmatter.value + fileContent.value
      : fileContent.value
    await connectionStore.writeFile(selectedFilePath.value, contentToWrite)
    originalContent.value = fileContent.value
    ElMessage.success('已保存')
    // Reload skills list to refresh instructions
    if (isSkillMd) {
      await loadSkills()
    }
  } catch (err: any) {
    ElMessage.error('保存失败: ' + (err?.message || ''))
  } finally {
    saving.value = false
  }
}

function handleEditorSave(val: string) {
  saveFile()
}

// ── Create a new file ──
const newFileName = ref('')
const creatingIn = ref<string | null>(null) // 'references' or 'scripts'

function startCreateFile(dir: 'references' | 'scripts') {
  newFileName.value = ''
  creatingIn.value = dir
  nextTick(() => {
    const input = document.querySelector('.se-new-file-input') as HTMLInputElement
    input?.focus()
  })
}

async function confirmCreateFile() {
  const name = newFileName.value.trim()
  if (!name || !selectedSkillData.value?.root_dir || !creatingIn.value) return

  const dir = creatingIn.value === 'references' ? 'references' : 'scripts'
  const filePath = selectedSkillData.value.root_dir + '/' + dir + '/' + name

  try {
    // Check if file exists first by trying to stat it
    const exists = await connectionStore.fetchFSStat(filePath)
    if (exists) {
      ElMessage.warning('文件已存在')
      return
    }
    // Create empty file by writing empty content
    await connectionStore.writeFile(filePath, '')
    ElMessage.success('已创建 ' + name)
    newFileName.value = ''
    creatingIn.value = null
    // Reload file tree
    await loadSkillFiles(selectedSkillData.value.root_dir!)
  } catch (err: any) {
    ElMessage.error('创建文件失败: ' + (err?.message || ''))
  }
}

function cancelCreateFile() {
  newFileName.value = ''
  creatingIn.value = null
}

// ── Delete a file ──
async function handleDeleteFile(node: FileNode) {
  if (node.is_dir) return
  try {
    await ElMessageBox.confirm(
      '确定要删除 ' + node.name + ' 吗？',
      '删除文件',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning', confirmButtonClass: 'el-button--danger' }
    )
    await connectionStore.fetchFSRemove(node.path)
    ElMessage.success('已删除')
    if (selectedFilePath.value === node.path) {
      selectedFilePath.value = null
      fileContent.value = ''
      originalContent.value = ''
    }
    await loadSkillFiles(selectedSkillData.value!.root_dir)
  } catch {
    // cancelled
  }
}

// ── Toggle file tree expand ──
const expandedDirs = ref<Set<string>>(new Set(['references', 'scripts']))

function toggleDir(name: string) {
  if (expandedDirs.value.has(name)) {
    expandedDirs.value.delete(name)
  } else {
    expandedDirs.value = new Set([...expandedDirs.value, name])
  }
}

// ── Fullscreen toggle ──
const isFullscreen = ref(false)

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  // Force the dialog body to recalc height after transition
  nextTick(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

// ── Markdown preview ──
function togglePreview() {
  if (previewMode.value === 'editor') {
    previewMode.value = 'preview'
    nextTick(() => renderMermaid())
  } else {
    previewMode.value = 'editor'
  }
}

async function renderMermaid() {
  const el = document.querySelector('.se-preview-content') as HTMLElement
  if (el) await renderMermaidInRoot(el)
}

// ── Watch dialog visibility ──
watch(() => props.visible, (v) => {
  if (v) {
    loadSkills()
  } else {
    selectedSkill.value = null
    skillFiles.value = []
    selectedFilePath.value = null
    fileContent.value = ''
    originalContent.value = ''
    storedFrontmatter.value = ''
    previewMode.value = 'preview'
  }
})
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    @update:model-value="emit('close')"
    :fullscreen="isFullscreen"
    title="技能编辑器"
    width="1400px"
    class="skill-editor-dialog"
    append-to-body
    destroy-on-close
    top="3vh"
  >
    <button class="se-fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
      <svg v-if="!isFullscreen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
      </svg>
    </button>
    <div class="se-body" v-loading="loading">
      <!-- Empty state: no skills -->
      <div v-if="skills.length === 0 && !loading" class="se-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="se-empty-icon">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        <p class="se-empty-text">暂无技能</p>
      </div>

      <!-- Two-column layout -->
      <div v-else class="se-layout">
        <!-- ── Left: Skill list ── -->
        <div class="se-sidebar">
          <div class="se-sidebar-header">
            <span class="se-sidebar-title">技能列表</span>
            <el-button size="small" text @click="loadSkills" :loading="loading">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </el-button>
          </div>
          <div class="se-list">
            <div
              v-for="skill in skills"
              :key="skill.name"
              class="se-skill-item"
              :class="{ active: selectedSkill === skill.name }"
              @click="selectSkill(skill.name)"
            >
              <div class="se-skill-name">
                <span class="se-skill-name-zh">{{ skill.metadata?.name_zh || skill.name }}</span>
                <span class="se-skill-name-en" v-if="skill.metadata?.name_zh">{{ skill.name }}</span>
              </div>
              <div class="se-skill-desc">{{ skill.description || '(无描述)' }}</div>
              <div class="se-skill-meta">
                <span class="se-skill-source">{{ skill.source || 'filesystem' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Right: File tree + Editor ── -->
        <div class="se-main">
          <template v-if="!selectedSkill">
            <div class="se-placeholder">
              <p>选择左侧技能查看详情</p>
            </div>
          </template>
          <template v-else-if="!selectedSkillData?.root_dir">
            <div class="se-placeholder">
              <p>该技能没有文件系统路径，无法编辑</p>
            </div>
          </template>
          <template v-else>
            <div class="se-main-layout">
              <!-- Sub-sidebar: File tree -->
              <div class="se-file-tree" v-loading="loadingFile">
                <div class="se-file-tree-header">
                  <span class="se-file-tree-title">{{ selectedSkill }}</span>
                </div>
                <div class="se-tree-nodes">
                  <div
                    v-for="node in skillFiles"
                    :key="node.path"
                    class="se-tree-node"
                  >
                    <!-- Root files (SKILL.md) -->
                    <div
                      v-if="!node.is_dir"
                      class="se-tree-file"
                      :class="{ active: selectedFilePath === node.path }"
                      @click="openFile(node)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span>{{ node.name }}</span>
                    </div>
                    <!-- Directory -->
                    <template v-if="node.is_dir">
                      <div class="se-tree-dir" @click="toggleDir(node.name)">
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                          stroke-linecap="round" stroke-linejoin="round"
                          class="se-tree-arrow"
                          :class="{ expanded: expandedDirs.has(node.name) }"
                        >
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span>{{ node.name }}</span>
                        <button class="se-tree-add-btn" @click.stop="startCreateFile(node.name as 'references' | 'scripts')" title="新建文件">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                        </button>
                      </div>
                      <div v-if="expandedDirs.has(node.name)" class="se-tree-children">
                        <!-- New file input -->
                        <div v-if="creatingIn === node.name" class="se-new-file-row">
                          <input
                            v-model="newFileName"
                            class="se-new-file-input"
                            placeholder="文件名"
                            @keydown.enter="confirmCreateFile"
                            @keydown.esc="cancelCreateFile"
                            @blur="cancelCreateFile"
                          />
                          <button class="se-new-file-confirm" @click="confirmCreateFile" title="确认">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </button>
                        </div>
                        <div
                          v-for="child in node.children"
                          :key="child.path"
                          class="se-tree-file"
                          :class="{ active: selectedFilePath === child.path }"
                          @click="openFile(child)"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          <span>{{ child.name }}</span>
                          <button class="se-tree-del-btn" @click.stop="handleDeleteFile(child)" title="删除">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <!-- Editor panel -->
              <div class="se-editor-panel" v-loading="loadingFile">
                <template v-if="!selectedFilePath">
                  <div class="se-editor-placeholder">
                    <p>选择文件开始编辑</p>
                  </div>
                </template>
                <template v-else>
                  <div class="se-editor-header">
                    <span class="se-editor-filename">{{ selectedFileName }}</span>
                    <div class="se-editor-actions">
                      <el-button size="small" text @click="togglePreview">
                        {{ previewMode === 'editor' ? '预览' : '编辑' }}
                      </el-button>
                      <el-button
                        size="small"
                        type="primary"
                        :disabled="!isDirty"
                        :loading="saving"
                        @click="saveFile"
                      >保存</el-button>
                    </div>
                  </div>
                  <div class="se-editor-content">
                    <!-- CodeMirror editor -->
                    <div v-show="previewMode === 'editor'" class="se-cm-wrapper">
                      <CodemirrorEditor
                        v-model="fileContent"
                        :language="detectLanguage(selectedFileName)"
                        :theme="editorPrefs.theme.value"
                        :font-family="editorPrefs.fontFamily.value"
                        :font-size="editorPrefs.fontSize.value"
                        @save="handleEditorSave"
                      />
                    </div>
                    <!-- Markdown preview -->
                    <div v-show="previewMode === 'preview'" class="se-preview-content markdown-body" ref="mdPreviewRef" v-html="md.render(fileContent)"></div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.se-body {
  min-height: 200px;
  max-height: 82vh;
  overflow: hidden;
}

/* ── Empty state ── */
.se-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  gap: 12px;
}
.se-empty-icon {
  color: #475569;
}
.se-empty-text {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

/* ── Two-column layout ── */
.se-layout {
  display: flex;
  height: 75vh;
  gap: 0;
}

/* ── Left sidebar: skill list ── */
.se-sidebar {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid rgba(55, 65, 81, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.se-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.se-sidebar-title {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.se-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
.se-skill-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  margin-bottom: 2px;
}
.se-skill-item:hover {
  background: rgba(139, 92, 246, 0.04);
  border-color: rgba(139, 92, 246, 0.1);
}
.se-skill-item.active {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.25);
}
.se-skill-name {
  margin-bottom: 2px;
  line-height: 1.4;
}
.se-skill-name-zh {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}
.se-skill-name-en {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: #64748b;
  margin-top: 1px;
}
.se-skill-desc {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.se-skill-meta {
  margin-top: 4px;
}
.se-skill-source {
  font-size: 10px;
  color: #475569;
  background: rgba(71, 85, 105, 0.2);
  padding: 1px 6px;
  border-radius: 4px;
}

/* ── Right main area ── */
.se-main {
  flex: 1;
  overflow: hidden;
}
.se-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  font-size: 14px;
}
.se-main-layout {
  display: flex;
  height: 100%;
}

/* ── File tree ── */
.se-file-tree {
  width: 220px;
  min-width: 220px;
  border-right: 1px solid rgba(55, 65, 81, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.se-file-tree-header {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.se-file-tree-title {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}
.se-tree-nodes {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
.se-tree-node {
  margin-bottom: 1px;
}
.se-tree-dir {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #94a3b8;
  transition: all 0.15s ease;
}
.se-tree-dir:hover {
  background: rgba(255, 255, 255, 0.04);
}
.se-tree-arrow {
  transition: transform 0.15s ease;
}
.se-tree-arrow.expanded {
  transform: rotate(90deg);
}
.se-tree-add-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}
.se-tree-add-btn:hover {
  background: rgba(6, 182, 212, 0.1);
  color: #22d3ee;
}
.se-tree-children {
  padding-left: 20px;
}
.se-tree-file {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #94a3b8;
  transition: all 0.15s ease;
}
.se-tree-file:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #e2e8f0;
}
.se-tree-file.active {
  background: rgba(139, 92, 246, 0.1);
  color: #a78bfa;
}
.se-tree-del-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0;
}
.se-tree-file:hover .se-tree-del-btn {
  opacity: 1;
}
.se-tree-del-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* ── New file input ── */
.se-new-file-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
}
.se-new-file-input {
  flex: 1;
  padding: 4px 6px;
  font-size: 11px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 4px;
  outline: none;
}
.se-new-file-input:focus {
  border-color: #8b5cf6;
}
.se-new-file-confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  cursor: pointer;
}
.se-new-file-confirm:hover {
  background: rgba(16, 185, 129, 0.25);
}

/* ── Editor panel ── */
.se-editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.se-editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  font-size: 14px;
}
.se-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
  background: rgba(15, 23, 42, 0.4);
}
.se-editor-filename {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', monospace;
}
.se-editor-actions {
  display: flex;
  gap: 6px;
}
.se-editor-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}
.se-cm-wrapper,
.se-preview-content {
  position: absolute;
  inset: 0;
  overflow: auto;
}
.se-preview-content {
  padding: 20px;
}
</style>

<style>
/* Dialog overrides */
.skill-editor-dialog .el-overlay {
  background: rgba(0, 0, 0, 0.65);
}
.skill-editor-dialog .el-dialog {
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.8);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}
.skill-editor-dialog .el-dialog__header {
  padding: 16px 24px 12px;
  margin: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.skill-editor-dialog .el-dialog__title {
  font-size: 15px;
  font-weight: 700;
  color: #e2e8f0;
}
.skill-editor-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8;
  font-size: 18px;
}
.skill-editor-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f87171;
}
.skill-editor-dialog .el-dialog__body {
  padding: 12px 16px 8px;
}
.skill-editor-dialog .el-dialog__footer {
  padding: 10px 24px 14px;
  border-top: 1px solid rgba(55, 65, 81, 0.5);
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.skill-editor-dialog .el-button--primary {
  --el-button-bg-color: #8b5cf6;
  --el-button-border-color: #8b5cf6;
  --el-button-hover-bg-color: #7c3aed;
  --el-button-hover-border-color: #7c3aed;
}

/* Header fullscreen button */
.se-fullscreen-btn {
  position: absolute;
  right: 52px;
  top: 16px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
}
.se-fullscreen-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

/* ── Markdown preview theme ── */
.skill-editor-dialog .se-preview-content {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.7;
  color: #e2e8f0;
  word-wrap: break-word;
  padding: 24px 28px;
}
.skill-editor-dialog .se-preview-content h1,
.skill-editor-dialog .se-preview-content h2,
.skill-editor-dialog .se-preview-content h3,
.skill-editor-dialog .se-preview-content h4 {
  margin-top: 20px;
  margin-bottom: 10px;
  font-weight: 600;
  line-height: 1.3;
  color: #f1f5f9;
}
.skill-editor-dialog .se-preview-content h1 { font-size: 20px; padding-bottom: 8px; border-bottom: 1px solid rgba(55,65,81,0.6); }
.skill-editor-dialog .se-preview-content h2 { font-size: 17px; padding-bottom: 6px; border-bottom: 1px solid rgba(55,65,81,0.4); }
.skill-editor-dialog .se-preview-content h3 { font-size: 15px; }
.skill-editor-dialog .se-preview-content h4 { font-size: 14px; }
.skill-editor-dialog .se-preview-content p {
  margin-top: 0;
  margin-bottom: 12px;
}
.skill-editor-dialog .se-preview-content a {
  color: #818cf8;
  text-decoration: none;
}
.skill-editor-dialog .se-preview-content a:hover {
  text-decoration: underline;
}
.skill-editor-dialog .se-preview-content strong {
  font-weight: 600;
  color: #f1f5f9;
}
.skill-editor-dialog .se-preview-content ul,
.skill-editor-dialog .se-preview-content ol {
  padding-left: 22px;
  margin-bottom: 12px;
}
.skill-editor-dialog .se-preview-content li {
  margin-bottom: 4px;
}
.skill-editor-dialog .se-preview-content li > ul,
.skill-editor-dialog .se-preview-content li > ol {
  margin-top: 4px;
  margin-bottom: 0;
}
.skill-editor-dialog .se-preview-content blockquote {
  margin: 0 0 12px;
  padding: 6px 14px;
  border-left: 3px solid #8b5cf6;
  background: rgba(139, 92, 246, 0.06);
  border-radius: 0 6px 6px 0;
  color: #cbd5e1;
}
.skill-editor-dialog .se-preview-content code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.6);
  color: #f472b6;
}
.skill-editor-dialog .se-preview-content pre {
  margin: 0 0 14px;
  padding: 14px 16px;
  border-radius: 8px;
  background: #0f172a;
  border: 1px solid rgba(55, 65, 81, 0.5);
  overflow-x: auto;
}
.skill-editor-dialog .se-preview-content pre code {
  padding: 0;
  background: none;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.5;
}
.skill-editor-dialog .se-preview-content table {
  width: 100%;
  margin-bottom: 14px;
  border-collapse: collapse;
  font-size: 13px;
}
.skill-editor-dialog .se-preview-content table th,
.skill-editor-dialog .se-preview-content table td {
  padding: 8px 12px;
  border: 1px solid rgba(55, 65, 81, 0.6);
  text-align: left;
}
.skill-editor-dialog .se-preview-content table th {
  background: rgba(15, 23, 42, 0.5);
  font-weight: 600;
  color: #f1f5f9;
}
.skill-editor-dialog .se-preview-content table tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.02);
}
.skill-editor-dialog .se-preview-content hr {
  margin: 20px 0;
  border: none;
  border-top: 1px solid rgba(55, 65, 81, 0.6);
}
.skill-editor-dialog .se-preview-content img {
  max-width: 100%;
  border-radius: 8px;
}
.skill-editor-dialog .se-preview-content .mermaid {
  margin: 14px 0;
  padding: 14px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 8px;
  text-align: center;
}
.skill-editor-dialog .se-preview-content > *:first-child {
  margin-top: 0;
}
.skill-editor-dialog .se-preview-content > *:last-child {
  margin-bottom: 0;
}
</style>
