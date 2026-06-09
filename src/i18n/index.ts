import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import en from './locales/en.json'
import zhTW from './locales/zh-TW.json'

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('mindx-locale') || 'zh',
  fallbackLocale: 'zh',
  messages: {
    zh,
    en,
    'zh-TW': zhTW
  }
})

export default i18n

/** Supported locales for UI switching */
export const supportedLocales = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' }
] as const

export type LocaleType = (typeof supportedLocales)[number]['value']
