import { ref, watch } from 'vue'

export type EditorTheme =
  | 'oneDark'
  | 'default'
  | 'monokai'
  | 'dracula'
  | 'nord'
  | 'githubLight'
  | 'githubDark'
  | 'sublime'
  | 'tokyoNight'

export type EditorFontFamily =
  | 'JetBrains Mono'
  | 'Fira Code'
  | 'Consolas'
  | 'Source Code Pro'
  | 'monospace'
  | 'SF Mono'
  | 'Menlo'
  | 'Monaco'
  | 'DejaVu Sans Mono'
  | 'Cascadia Code'
  | 'Ubuntu Mono'

export interface EditorPreferences {
  theme: EditorTheme
  fontFamily: EditorFontFamily
  fontSize: number
}

const STORAGE_KEY = 'fe-editor-preferences'

const defaultPrefs: EditorPreferences = {
  theme: 'oneDark',
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
}

function load(): EditorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultPrefs }
    const parsed = JSON.parse(raw)
    return {
      theme: parsed.theme || defaultPrefs.theme,
      fontFamily: parsed.fontFamily || defaultPrefs.fontFamily,
      fontSize: parsed.fontSize || defaultPrefs.fontSize,
    }
  } catch {
    return { ...defaultPrefs }
  }
}

function save(prefs: EditorPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch { /* ignore quota errors */ }
}

const preferences = ref<EditorPreferences>(load())

watch(preferences, (val) => {
  save(val)
}, { deep: true })

export function useEditorPreferences() {
  return preferences
}
