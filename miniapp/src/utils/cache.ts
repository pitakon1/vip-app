import Taro from '@tarojs/taro'

const PREFIX = 'cache:'
const DEFAULT_TTL = 3 * 60 * 1000

interface Envelope<T> {
  t: number
  data: T
}

/** 同步读缓存（小程序 setStorageSync 为同步操作，可做到「秒开」渲染） */
export function getCacheSync<T>(key: string): T | null {
  try {
    const raw = Taro.getStorageSync(PREFIX + key)
    if (!raw) return null
    const env = JSON.parse(raw) as Envelope<T>
    if (!env || typeof env.t !== 'number') return null
    return env.data
  } catch {
    return null
  }
}

/** 缓存是否在 TTL 内（新鲜） */
export function isFreshSync(key: string, ttl: number = DEFAULT_TTL): boolean {
  try {
    const raw = Taro.getStorageSync(PREFIX + key)
    if (!raw) return false
    const env = JSON.parse(raw) as Envelope<unknown>
    return typeof env.t === 'number' && Date.now() - env.t < ttl
  } catch {
    return false
  }
}

/** 写缓存（失败静默，不影响主流程） */
export function setCache(key: string, data: unknown): void {
  try {
    Taro.setStorageSync(PREFIX + key, JSON.stringify({ t: Date.now(), data }))
  } catch {
    /* ignore */
  }
}
