import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import zh from './locales/zh'
import en from './locales/en'
import th from './locales/th'

export const SUPPORTED_LANGS = ['zh', 'en', 'th'] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
      th: { translation: th },
    },
    fallbackLng: 'zh',
    supportedLngs: [...SUPPORTED_LANGS],
    interpolation: { escapeValue: false },
    detection: {
      // 只沿用用户持久化的语言选择；未选择时回落到 zh，不跟随浏览器/系统语言
      order: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  })

export default i18n
