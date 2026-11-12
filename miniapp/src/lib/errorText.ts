/**
 * 把接口错误归一化成可直接 toast 的本地化文案（三语 i18n）。
 *
 * 小程序请求层会把后端 `detail` 压进 `Error.message`，但后端 detail 多为英文
 * （Pydantic 422 尤其如此），直接 toast 用户看不懂。这里按状态码分类兜底；
 * 只有带中文的业务提示才原样展示。
 *
 * 注意：请求层抛出的 Error 不一定带 statusCode，所以还会尝试从
 * 「请求失败，状态码：409」这类兜底文案里解析状态码。
 *
 * i18n 通过 `useI18n.getState().t()` 在组件外调用，与 zustand store 方案对齐。
 */
import { useI18n } from '@/i18n'

type ErrorLike = {
  status?: number
  statusCode?: number
  response?: { status?: number; statusCode?: number; data?: { detail?: unknown } }
  data?: { detail?: unknown; message?: unknown; msg?: unknown }
  detail?: unknown
  code?: string
  message?: string
  errMsg?: string
}

/** 是否包含 CJK 字符：带中文的 detail 才是写给用户看的业务提示 */
const hasCjk = (text: string) => /[\u4e00-\u9fff]/.test(text)

const STATUS_TEXT_RE = /状态码[：:]\s*(\d{3})/

function t(key: string): string {
  try {
    return useI18n.getState().t(key)
  } catch {
    return key
  }
}

const readStatus = (e: ErrorLike): number | undefined => {
  const direct = e.status ?? e.statusCode ?? e.response?.status ?? e.response?.statusCode
  if (typeof direct === 'number') return direct
  const text = `${e.message ?? ''} ${e.errMsg ?? ''}`
  const hit = text.match(STATUS_TEXT_RE)
  return hit ? Number(hit[1]) : undefined
}

export function errorText(err: unknown, fallback?: string): string {
  const e = (err ?? {}) as ErrorLike
  const status = readStatus(e)
  const message = typeof e.message === 'string' ? e.message : ''
  const errMsg = typeof e.errMsg === 'string' ? e.errMsg : ''
  const detail =
    e.data?.detail ??
    e.response?.data?.detail ??
    e.detail ??
    e.data?.message ??
    e.data?.msg

  if (!status) {
    // Taro 网络失败/超时
    if (/request:fail|network|timeout|超时|网络/i.test(`${message} ${errMsg}`)) {
      return t('error.network')
    }
    // 后端业务提示本身是中文（如「该时段已被预约」），对用户有效
    if (typeof detail === 'string' && hasCjk(detail)) return detail
    if (hasCjk(message)) return message
    return fallback ?? t('error.unknown')
  }

  if (status === 401) return t('error.loginExpired')
  if (status === 403) return t('error.noPermission')
  if (status === 404) return t('error.notFound')
  if (status === 409) return t('error.conflict')
  if (status === 410) return t('error.gone')
  if (status === 429) return t('error.tooFrequent')
  if (status >= 500) return t('error.server')

  if (status === 400 || status === 422) {
    if (Array.isArray(detail)) return t('error.validation')
    if (typeof detail === 'string' && hasCjk(detail)) return detail
    if (!detail && hasCjk(message) && !STATUS_TEXT_RE.test(message)) return message
    return t('error.validation')
  }

  return fallback ?? t('error.unknown')
}
