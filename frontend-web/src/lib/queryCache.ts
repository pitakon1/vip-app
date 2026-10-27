/**
 * Web 端缓存查询工具：TanStack Query + localStorage 磁盘缓存（SWR 秒开模式）。
 * 与 App 端 MMKV 方案语义一致：
 * - 会话内：staleTime 去重 / 后台刷新 / 失败重试由 TanStack Query 承担；
 * - 跨会话：mount 时读 localStorage 缓存 seed 进 Query Cache（updatedAt 对齐缓存
 *   时间戳，让 staleTime 与 TTL 语义一致）；
 * - 查询成功后自动回写 localStorage。
 */
import { useMemo } from 'react'
import { QueryClient, useQuery } from '@tanstack/react-query'

// 缓存结构版本：接口字段增删导致旧缓存「缺字段」时递增，
// 旧 key 自然失配，避免在 staleTime 内渲染出空区块。
const CACHE_VERSION = 'v2'
const CACHE_PREFIX = `vip-rental-cache:${CACHE_VERSION}:`

interface CacheEnvelope<T> {
  t: number
  data: T
}

function readCache<T>(key: string): CacheEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<T>
    if (!env || typeof env.t !== 'number') return null
    return env
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    const env: CacheEnvelope<T> = { t: Date.now(), data }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(env))
  } catch {
    /* 存储满/隐私模式禁用时忽略 */
  }
}

export function clearCache(key?: string): void {
  try {
    if (key) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return
    }
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 10 * 60 * 1000,
    },
  },
})

interface CachedQueryOptions<T> {
  queryKey: string[]
  cacheKey: string
  queryFn: () => Promise<T>
  /** 新鲜期（默认 3 分钟） */
  ttl?: number
  enabled?: boolean
}

export function useCachedQuery<T>({
  queryKey,
  cacheKey,
  queryFn,
  ttl = 3 * 60 * 1000,
  enabled = true,
}: CachedQueryOptions<T>) {
  // 同步读取磁盘缓存做 initialData：此前用 useEffect 异步 seed，
  // 时序晚于 useQuery 的首发请求——表现为「先发出请求，回来后被旧缓存覆盖」，
  // 也会白白多发一次网络请求。initialDataUpdatedAt 对齐缓存时间戳，
  // 让 staleTime 语义与缓存 TTL 一致（缓存过期就重新拉）。
  const seed = useMemo(
    () => (enabled ? readCache<T>(cacheKey) : null),
    [cacheKey, enabled],
  )

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await queryFn()
      // 只有成功才落盘：失败/异常不写缓存，避免下次mount直接渲染错误态
      writeCache(cacheKey, data)
      return data
    },
    staleTime: ttl,
    enabled,
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.t,
  })

  return query
}
