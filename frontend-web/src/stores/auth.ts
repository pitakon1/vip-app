import { create } from 'zustand'
import type { User } from '@/types'
import { clearCache, queryClient } from '@/lib/queryCache'

interface AuthState {
  token: string | null
  user: User | null
  login: (token: string, user: User, refreshToken?: string) => void
  setToken: (token: string) => void
  logout: () => void
}

export const REFRESH_TOKEN_KEY = 'refresh_token'

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
    set({ token: null, user: null })
  },
}))

export default useAuthStore