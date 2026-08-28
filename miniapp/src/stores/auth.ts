import { create } from 'zustand'
import Taro from '@tarojs/taro'
import type { User } from '@/types'

interface AuthState {
  token: string | null
  user: User | null
  login: (token: string, user: User) => void
  logout: () => void
  loadFromStorage: () => void
}

const TOKEN_KEY = 'token'
const USER_KEY = 'user'

const useAuthStore = create<AuthState>((set) => ({
  token: Taro.getStorageSync(TOKEN_KEY) || null,
  user: (() => {
    try {
      const raw = Taro.getStorageSync(USER_KEY)
      return raw ? (JSON.parse(raw) as User) : null
    } catch {
      return null
    }
  })(),

  login: (token, user) => {
    Taro.setStorageSync(TOKEN_KEY, token)
    Taro.setStorageSync(USER_KEY, JSON.stringify(user))
    set({ token, user })
  },

  logout: () => {
    Taro.removeStorageSync(TOKEN_KEY)
    Taro.removeStorageSync(USER_KEY)
    set({ token: null, user: null })
  },

  loadFromStorage: () => {
    const token = Taro.getStorageSync(TOKEN_KEY) || null
    let user: User | null = null
    try {
      const raw = Taro.getStorageSync(USER_KEY)
      user = raw ? (JSON.parse(raw) as User) : null
    } catch {
      user = null
    }
    set({ token, user })
  }
}))

export default useAuthStore
