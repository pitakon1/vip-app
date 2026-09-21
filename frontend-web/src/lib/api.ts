import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { REFRESH_TOKEN_KEY, useAuthStore } from '@/stores/auth'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
  // axios 默认把数组序列化成 `keywords[]=a&keywords[]=b`，FastAPI 的 `List[str]` 只认
  // 重复键 `keywords=a&keywords=b`，不改的话区域/地铁的关键词筛选会被后端静默忽略。
  paramsSerializer: { indexes: null },
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
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
      // 公共页面（首页、房源浏览、学校、小区、登录、注册）不因 401 重定向，让组件自行降级处理
      const pathname = window.location.pathname
      const isPublicRoute =
        pathname === '/' ||
        pathname === '/login' ||
        pathname === '/register' ||
        pathname.startsWith('/listings') ||
        pathname.startsWith('/listing/') ||
        pathname.startsWith('/schools') ||
        pathname.startsWith('/school/') ||
        pathname.startsWith('/communities') ||
        pathname.startsWith('/community/') ||
        pathname.startsWith('/properties/detail')
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