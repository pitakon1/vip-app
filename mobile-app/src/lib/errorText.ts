/**
 * 把接口错误归一化成可直接展示给用户的本地化文案（三语 i18n）。
 *
 * App 端走 axios，中心层会把 422 的 detail 数组压成字符串，但字符串本身多为
 * 英文（Pydantic 默认语言），直接塞进 Alert / Toast 用户看不懂。
 * 这里按 HTTP 状态分类兜底；只有 400/422 且后端提示本来就是中文时才原样展示。
 *
 * i18n 通过 `useI18n.getState().t()` 在组件外调用，与 zustand store 方案对齐。
 */
import { useI18n } from '@/i18n'

type ErrorLike = {
  response?: {
    status?: number
    data?: { detail?: unknown; message?: unknown; msg?: unknown }
  }
  status?: number
  statusCode?: number
  code?: string
  message?: string
  errMsg?: string
  data?: { detail?: unknown }
}

/** 是否包含 CJK 字符：带中文的 detail 才是写给用户看的业务提示 */
const hasCjk = (text: string) => /[\u4e00-\u9fff]/.test(text)

function t(key: string): string {
  try {
    return useI18n.getState().t(key)
  } catch {
    return key
  }
}

export type ErrorKind = 'forbidden' | 'notFound' | 'server' | 'network' | 'unknown'

/** 把错误归类到统一失败态类型（403/404 不应显示重试） */
export function errorKind(err: unknown): ErrorKind {
  const e = (err ?? {}) as ErrorLike
  const status = e.response?.status ?? e.status ?? e.statusCode
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 404) return 'notFound'
  if (status && status >= 500) return 'server'
  if (status) return 'unknown'
  return 'network'
}

export function errorText(err: unknown, fallback?: string): string {
  const e = (err ?? {}) as ErrorLike
  const status = e.response?.status ?? e.status ?? e.statusCode
  const message = typeof e.message === 'string' ? e.message : ''
  const code = String(e.code ?? '').toUpperCase()

  if (!status) {
    if (
      (!e.response && !message) ||
      code === 'ERR_NETWORK' ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      /timeout|network error|请求失败|网络/i.test(`${message} ${e.errMsg ?? ''}`)
    ) {
      return t('error.network')
    }
  }

  if (status === 401) return t('error.loginExpired')
  if (status === 403) return t('error.noPermission')
  if (status === 404) return t('error.notFound')
  if (status === 409) return t('error.conflict')
  if (status === 429) return t('error.tooFrequent')
  if (status && status >= 500) return t('error.server')

  if (status === 400 || status === 422) {
    const detail = e.response?.data?.detail ?? e.data?.detail
    if (Array.isArray(detail)) return t('error.validation')
    if (typeof detail === 'string' && hasCjk(detail)) return detail
    return t('error.validation')
  }

  return fallback ?? t('error.unknown')
}
