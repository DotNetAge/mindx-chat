<script setup lang="ts">
import { computed } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { StreamLanguage } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { monokai } from '@uiw/codemirror-theme-monokai'
import { dracula } from '@uiw/codemirror-theme-dracula'
import { nord } from '@uiw/codemirror-theme-nord'
import { githubLight, githubDark } from '@uiw/codemirror-theme-github'
import { sublime } from '@uiw/codemirror-theme-sublime'
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { go } from '@codemirror/lang-go'
import { rust } from '@codemirror/lang-rust'
import { java } from '@codemirror/lang-java'
import { php } from '@codemirror/lang-php'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { cpp } from '@codemirror/lang-cpp'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { diff } from '@codemirror/legacy-modes/mode/diff'
import { dockerFile as dockerfile } from '@codemirror/legacy-modes/mode/dockerfile'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import type { EditorTheme } from '../composables/useEditorPreferences'

const props = defineProps<{
  modelValue: string
  language: string
  readonly?: boolean
  theme?: EditorTheme
  fontFamily?: string
  fontSize?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
  (e: 'save', val: string): void
}>()

const themeMap: Record<string, any> = {
  default: [],
  oneDark,
  monokai,
  dracula,
  nord,
  githubLight,
  githubDark,
  sublime,
  tokyoNight,
}

function detectLangExtension(lang: string) {
  const ext = lang.toLowerCase().split('.').pop() || ''
  if (['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts'].includes(ext)) return javascript()
  if (['json'].includes(ext)) return json()
  if (['md', 'markdown'].includes(ext)) return markdown()
  if (['html', 'htm'].includes(ext)) return html()
  if (['xml', 'svg', 'xsd', 'xslt', 'xsl', 'plist'].includes(ext)) return xml()
  if (['css', 'scss', 'less', 'sass'].includes(ext)) return css()
  if (['py', 'python'].includes(ext)) return python()
  if (['go'].includes(ext)) return go()
  if (['rs'].includes(ext)) return rust()
  if (['java', 'class'].includes(ext)) return java()
  if (['php', 'phtml'].includes(ext)) return php()
  if (['c', 'cpp', 'cxx', 'cc', 'h', 'hpp', 'hxx'].includes(ext)) return cpp()
  if (['sql'].includes(ext)) return sql()
  if (['yaml', 'yml'].includes(ext)) return StreamLanguage.define(yaml)
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return StreamLanguage.define(shell)
  if (['rb', 'ruby'].includes(ext)) return StreamLanguage.define(ruby)
  if (['lua'].includes(ext)) return StreamLanguage.define(lua)
  if (['swift'].includes(ext)) return StreamLanguage.define(swift)
  if (['toml'].includes(ext)) return StreamLanguage.define(toml)
  if (['diff', 'patch'].includes(ext)) return StreamLanguage.define(diff)
  if (['dockerfile'].includes(ext) || lang.toLowerCase() === 'dockerfile') return StreamLanguage.define(dockerfile)
  if (['properties', 'ini', 'cfg', 'conf'].includes(ext)) return StreamLanguage.define(properties)
  // 未知语言不设高亮，避免 js 默认导致错误着色
  return []
}

const extensions = computed(() => {
  const extList: any[] = [
    themeMap[props.theme ?? 'oneDark'] ?? [],
    EditorView.lineWrapping,
    EditorView.theme({
      '&': { fontSize: `${props.fontSize ?? 13}px` },
      '.cm-scroller': { fontFamily: props.fontFamily || "'JetBrains Mono', monospace" },
    }),
    detectLangExtension(props.language),
  ]
  if (!props.readonly) {
    extList.push(keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          emit('save', props.modelValue)
          return true
        },
      },
    ]))
  }
  return extList
})

function onChange(val: string) {
  emit('update:modelValue', val)
}
</script>

<template>
  <div class="cm-editor-wrap">
    <Codemirror
      :model-value="modelValue"
      :extensions="extensions"
      :disabled="readonly"
      :style="{ height: '100%' }"
      :autofocus="!readonly"
      @change="onChange"
    />
  </div>
</template>

<style scoped>
.cm-editor-wrap {
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.cm-editor-wrap :deep(.cm-editor) {
  height: 100%;
}
.cm-editor-wrap :deep(.cm-gutters) {
  border-right: 1px solid rgba(255,255,255,.06);
  background: transparent;
}
.cm-editor-wrap :deep(.cm-activeLineGutter) {
  background: rgba(6,182,212,.08);
}
</style>
