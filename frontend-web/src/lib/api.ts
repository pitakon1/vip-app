import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { REFRESH_TOKEN_KEY, useAuthStore } from '@/stores/auth'

/**
 * 单次请求能取回的最大条数，与后端 `app/core/pagination.py` 的 `MAX_PAGE_SIZE` 保持一致。
 *
 * 后端对 `page_size` 是**硬截断**（不是报错）。传超过这个值的请求不会失败，
 * 只会安静地少拿数据，表现为「下拉少选项 / 总数偏小 / 筛选不全」——
 * 这类静默错误排查成本极高，所以前端侧一律用这个常量，不要再手写大数字。
 *
 * ⚠️ 已知技术债：`pages/Properties` 与 `pages/Tenant/Dashboard` 目前是
 * 「拉全量 → 前端筛选 → 前端切片」的假分页。改成真·服务端分页需要把
 * 20+ 个筛选条件一起下推后端，属独立一轮的改造，此处仅先把取值收敛到上限内。
 */
export const MAX_PAGE_SIZE = 100

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
  // axios 默认把数组序列化成 `keywords[]=a&keywords[]=b`，FastAPI 的 `List[str]` 只认
  // 重复键 `keywords=a&keywords=b`，不改的话区域/地铁的关键词筛选会被后端静默忽略。
  paramsSerializer: { indexes: null },
})

/**
 * 查询参数键统一转成 snake_case。
 *
 * 后端是 FastAPI，查询参数一律 snake_case（`page_size`），而前端习惯写 `pageSize`。
 * axios 不做键名转换，多余的键会被后端**静默忽略**：`pageSize=100` 实际只拿回默认
 * 20 条，表现为「分页每页条数不对 / 下拉选项少 / 总数偏小」这类无报错的错数据。
 * 在请求层收敛比在几十个页面里逐处改名可靠。
 */
const toSnakeKey = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

const normalizeParams = (params: unknown) => {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    out[toSnakeKey(k)] = v
  }
  return out
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    config.params = normalizeParams(config.params)
    return config
  },
  (error) => Promise.reject(error),
)

// 并发请求同时 401 时共用一个刷新 Promise，避免打出刷新风暴
let refreshing: Promise<string> | null = null

/**
 * 用刷新令牌换新的访问令牌。
 *
 * 后端每次刷新都会同时下发新的 refresh_token（轮换），两个都要写回。
 * 这里用裸 axios 而非 `api` 实例发起，否则刷新请求自身 401 时又会回到拦截器里递归。
 */
const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) throw new Error('no refresh token')
  const res = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
  const payload = res.data?.data ?? res.data
  const token: string | undefined = payload?.access_token
  if (!token) throw new Error('refresh response has no access_token')
  localStorage.setItem('token', token)
  if (payload?.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, payload.refresh_token)
  }
  useAuthStore.getState().setToken(token)
  return token
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

/**
 * 匿名可访问的路由。401 时不对这些路径做重定向，交给页面自行降级。
 *
 * 拆成「精确匹配 / 前缀匹配」两张表：原先是一长串 `||` 手写条件，
 * 新增公开路由极易漏配，而漏配的后果是**匿名用户访问公开页时被误踢回登录页**，
 * 且只在未登录态复现，最容易漏测。改成数组后新增路由只需加一行。
 */
const PUBLIC_EXACT_ROUTES = ['/', '/login', '/register']
const PUBLIC_PREFIX_ROUTES = [
  '/listings',
  '/listing/',
  '/schools',
  '/school/',
  '/communities',
  '/community/',
  '/properties/detail',
]

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    // 访问令牌过期（默认 30 分钟）先尝试静默续期再重放原请求，
    // 否则用户每次 token 过期都会被弹回登录页丢掉当前操作。
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true
      try {
        refreshing = refreshing ?? refreshAccessToken().finally(() => { refreshing = null })
        const token = await refreshing
        original.headers.Authorization = `Bearer ${token}`
        return await api(original)
      } catch {
        // 刷新令牌也失效（过期 / 已登出）：继续走下面的清态跳登录
      }
    }

    if (error.response?.status === 401) {
      const pathname = window.location.pathname
      const isPublicRoute =
        PUBLIC_EXACT_ROUTES.includes(pathname) ||
        PUBLIC_PREFIX_ROUTES.some((prefix) => pathname.startsWith(prefix))
      if (!isPublicRoute) {
        useAuthStore.getState().logout()
        // 避免已在 /login 时重复跳转
        if (pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  },
)

export default api