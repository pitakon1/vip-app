/**
 * 把接口错误归一化成可直接展示给用户的本地化文案。
 *
 * 后端的 detail 可能是英文（FastAPI / Pydantic 默认），也可能是中文业务提示。
 * 这里按 HTTP 状态分类兜底：
 *   - 网络/超时 → i18n `error.network`
 *   - 401       → i18n `error.loginExpired`
 *   - 403       → i18n `error.noPermission`
 *   - 404       → i18n `error.notFound`
 *   - 409       → i18n `error.conflict`
 *   - 429       → i18n `error.tooFrequent`
 *   - 5xx       → i18n `error.server`
 *   - 400/422   → detail 含中文时原样展示，否则 i18n `error.validation`
 *
 * 没有 response（断网）走 network。detail 为数组（Pydantic 校验错误）也走 validation。
 */
import i18next from 'i18next'

type ErrorLike = {
  response?: {
    status?: number
    data?: { detail?: unknown; message?: unknown; msg?: unknown }
  }
  code?: string
  message?: string
}

/** CJK 检测：detail 含中文 → 后端业务文案，原样展示 */
const hasCjk = (text: string) => /[\u4e00-\u9fff]/.test(text)

function t(key: string): string {
  try {
    return i18next.t(key)
  } catch {
    return key
  }
}

/** 错误分类：供 DataState 区分「无权限 / 不存在 / 服务异常 / 网络异常」 */
export type ErrorKind = 'forbidden' | 'notFound' | 'network' | 'server' | 'unknown'

export function errorKind(err: unknown): ErrorKind {
  const e = (err ?? {}) as ErrorLike
  const status = e.response?.status
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 404) return 'notFound'
  if (status && status >= 500) return 'server'
  if (status) return 'unknown'
  return 'network'
}

export function errorText(err: unknown, fallback?: string): string {
  const e = (err ?? {}) as ErrorLike
  const status = e.response?.status
  const message = typeof e.message === 'string' ? e.message : ''
  const code = String(e.code ?? '').toUpperCase()

  // ---- 无响应：网络层 ----
  if (!status) {
    if (
      code === 'ERR_NETWORK' ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      /timeout|network error/i.test(message) ||
      (!e.response && !message)
    ) {
      return t('error.network')
    }
  }

  // ---- HTTP 状态 ----
  if (status === 401) return t('error.loginExpired')
  if (status === 403) return t('error.noPermission')
  if (status === 404) return t('error.notFound')
  if (status === 409) return t('error.conflict')
  if (status === 429) return t('error.tooFrequent')
  if (status && status >= 500) return t('error.server')

  // ---- 400 / 422 ----
  if (status === 400 || status === 422) {
    const detail = e.response?.data?.detail
    if (Array.isArray(detail)) return t('error.validation')
    if (typeof detail === 'string' && hasCjk(detail)) return detail
    return t('error.validation')
  }

  // ---- 兜底 ----
  return fallback ?? t('error.unknown')
}
