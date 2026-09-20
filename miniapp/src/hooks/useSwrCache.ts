import { useCallback, useRef, useState } from 'react'
import { getCacheSync, isFreshSync, setCache } from '@/utils/cache'

interface SwrOptions<T> {
  /** 缓存键（自动带 cache: 前缀与 TTL 信封） */
  key: string
  /** 网络请求：返回归一化数据 */
  fetcher: () => Promise<T>
  /** 缓存有效期（毫秒），默认 3 分钟 */
  ttl?: number
}

/**
 * SWR 缓存 Hook：首帧同步读缓存先渲染（秒开），后台请求刷新并回写缓存；
 * 缓存新鲜时跳过请求；返回 setData 供提交后乐观更新。
 */
export function useSwrCache<T>({ key, fetcher, ttl }: SwrOptions<T>) {
  const [data, setData] = useState<T | null>(() => {
    try {
      return getCacheSync<T>(key)
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const dataRef = useRef(data)
  dataRef.current = data

  const refresh = useCallback(
    async (force = false) => {
      if (!force && dataRef.current !== null && isFreshSync(key, ttl)) return
      setLoading(true)
      setError(false)
      try {
        const d = await fetcherRef.current()
        dataRef.current = d
        setData(d)
        if (d !== null && d !== undefined) {
          setCache(key, d)
        }
      } catch (e) {
        console.error(`[useSwrCache] 加载失败 ${key}`, e)
        if (dataRef.current === null) setError(true)
      } finally {
        setLoading(false)
      }
    },
    [key, ttl]
  )

  return { data, setData, loading, error, refresh }
}
