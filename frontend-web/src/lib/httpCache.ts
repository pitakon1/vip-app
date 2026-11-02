/**
 * GET 请求级 SWR 缓存（axios 自定义 adapter）。
 *
 * 目标：切回已访问过的页面时「先出内容，再后台刷新」，不整页转圈。
 *
 * 为什么不改页面：Web 端有几十个页面用 `useEffect + api.get` 手写请求，
 * 逐个改成 TanStack Query 风险大、收益重叠。这里在**唯一请求出口**做缓存：
 * - 命中且新鲜（30s 内）：直接返回缓存，不发网络请求；
 * - 命中但已过期（5min 内）：立即返回缓存，同时后台静默刷新，供下次切页使用；
 * - 未命中：正常请求；同一 URL 的并发请求合并为一次（去重）。
 *
 * 失效策略：任何非 GET 请求（创建/编辑/删除）都会清空本缓存，
 * 避免「改完数据切回列表仍是旧值」。登出时由 auth store 调用 clearHttpCache()。
 */
import axios, {
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

/** 缓存新鲜期：此期间切回页面不产生任何网络请求 */
const FRESH_MS = 30 * 1000
/** 缓存最长保留时间：超过则视为未命中（但请求回来后重新写入） */
const MAX_AGE_MS = 5 * 60 * 1000
/** 最多缓存条目数，超出按写入时间淘汰最旧的 */
const MAX_ENTRIES = 150

interface CacheEntry {
  at: number
  response: AxiosResponse
}

const entries = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<AxiosResponse>>()

/** 底层适配器（xhr/fetch），由 axios 按其运行环境选择 */
const baseAdapter = axios.getAdapter(axios.defaults.adapter)

const tokenTag = (config: InternalAxiosRequestConfig): string => {
  const headers = config.headers as unknown as Record<string, unknown> | undefined
  const raw = headers?.Authorization
  return typeof raw === 'string' ? raw.slice(-12) : ''
}

const keyOf = (config: InternalAxiosRequestConfig): string =>
  `${tokenTag(config)}|${config.url || ''}|${JSON.stringify(config.params ?? {})}`

const isCacheable = (config: InternalAxiosRequestConfig): boolean => {
  if ((config.method || 'get').toLowerCase() !== 'get') return false
  if ((config as { cacheable?: boolean }).cacheable === false) return false
  const rt = config.responseType
  return !rt || rt === 'json' || rt === 'text'
}

const clone = (
  response: AxiosResponse,
  config: InternalAxiosRequestConfig,
): AxiosResponse => ({
  ...response,
  config,
})

const store = (config: InternalAxiosRequestConfig, response: AxiosResponse) => {
  const contentType = String(response.headers?.['content-type'] ?? '')
  if (response.status !== 200 || (contentType && !contentType.includes('json'))) return
  const key = keyOf(config)
  if (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest !== undefined) entries.delete(oldest)
  }
  entries.set(key, { at: Date.now(), response })
}

/** 清空缓存（写操作后 / 登出时调用） */
export function clearHttpCache(): void {
  entries.clear()
}

const refreshInBackground = (config: InternalAxiosRequestConfig) => {
  const refreshConfig: InternalAxiosRequestConfig = {
    ...config,
    adapter: baseAdapter,
    // 后台刷新失败无需打扰用户：下一次切页仍会用旧缓存 + 继续尝试
  }
  baseAdapter(refreshConfig)
    .then((response) => store(config, response))
    .catch(() => {
      /* ignore */
    })
}

export const cachedGetAdapter: AxiosAdapter = (config) => {
  if (!isCacheable(config)) {
    // 写操作：清空读缓存，保证下一次读取拿到新数据
    if ((config.method || 'get').toLowerCase() !== 'get') clearHttpCache()
    return baseAdapter(config)
  }

  const key = keyOf(config)
  const hit = entries.get(key)
  const age = hit ? Date.now() - hit.at : Infinity

  if (hit && age <= MAX_AGE_MS) {
    if (age > FRESH_MS) refreshInBackground(config)
    return Promise.resolve(clone(hit.response, config))
  }

  const pending = inFlight.get(key)
  if (pending) return pending.then((response) => clone(response, config))

  const request = baseAdapter(config)
    .then((response) => {
      store(config, response)
      return response
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request.then((response) => clone(response, config))
}
