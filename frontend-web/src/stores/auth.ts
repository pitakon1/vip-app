import { create } from 'zustand'
import type { User } from '@/types'
import { clearCache, queryClient } from '@/lib/queryCache'
import { clearHttpCache } from '@/lib/httpCache'

interface AuthState {
  token: string | null
  user: User | null
  login: (token: string, user: User, refreshToken?: string) => void
  setToken: (token: string) => void
  logout: () => void
}

export const REFRESH_TOKEN_KEY = 'refresh_token'

/**
 * 本地令牌是否「可用」：存在且未过期。
 *
 * 公开页面（如房源详情）会在挂载时查收藏状态，若只判断 `!!token`，
 * 浏览器里残留一张过期令牌仍会发请求并稳定拿到 401（控制台报错）。
 * 这里按 JWT 的 exp 做一次廉价预检；非 JWT（拿不到 payload/exp）视为可用。
 */
export function isTokenFresh(token?: string | null): boolean {
  if (!token) return false
  try {
    const payload = token.split('.')[1]
    if (!payload) return true
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof json?.exp !== 'number') return true
    return json.exp * 1000 > Date.now() + 30 * 1000
  } catch {
    return true
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null') as User | null
    } catch {
      return null
    }
  })(),
  login: (token, user, refreshToken) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    // 刷新令牌用于访问令牌过期后的静默续期（见 lib/api.ts 的 401 处理）
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    }
    set({ token, user })
  },
  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    // 必须清缓存，否则上一个账号的数据会留在设备上：
    // `property-leases:<id>` / `property-docs:<id>` 这类按资源 id 存的 key
    // 含租约与财务明细，会以明文长期驻留 localStorage，同设备换账号即可读到。
    // 此前 `clearCache()` 只定义、从未被调用过。
    clearCache()
    queryClient.clear()
    // 请求级 GET 缓存同样含账号数据，登出必须一并清空
    clearHttpCache()
    set({ token: null, user: null })
  },
}))

export default useAuthStore