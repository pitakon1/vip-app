import { useCallback, useRef, useState } from 'react'
import { getCacheSync, isFreshSync, setCache } from '@/utils/cache'

type FetchParams = Record<string, unknown> | undefined

export interface UsePaginatedListOptions<T> {
  /** 每页数量 */
  pageSize: number
  /** 分页请求：返回已归一化的一页数据（数组，不含元信息） */
  fetcher: (page: number, pageSize: number, params?: FetchParams) => Promise<T[]>
  /** 自定义「是否还有更多」，默认 items.length >= pageSize */
  hasMore?: (items: T[]) => boolean
  /** 失败回调（可用于 toast） */
  onError?: (page: number) => void
  /** 首屏缓存 key：提供后首屏「缓存优先 + 后台刷新」（SWR），按 params 自动区分 */
  cacheKey?: string
  /** 缓存有效期（毫秒），默认 3 分钟 */
  cacheTtl?: number
}

/**
 * 列表分页 Hook：封装「分页 fetch + loading / loadingMore + hasMore + 触底加载」。
 * - fetch(nextPage, params)：nextPage<=1 视为刷新（loading），否则为加载更多（loadingMore）
 * - fetchMore()：触底加载下一页，内部自带 loading / hasMore 防重入守卫
 * - cacheKey 提供后：首屏同步读缓存先渲染（秒开），后台请求刷新并回写缓存；缓存新鲜且非强制时跳过请求
 */
export function usePaginatedList<T>({
  pageSize,
  fetcher,
  hasMore,
  onError,
  cacheKey,
  cacheTtl
}: UsePaginatedListOptions<T>) {
  const [list, setList] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [hasMoreState, setHasMoreState] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  // 用 ref 兜住可能每次渲染重建的回调，避免 useCallback 依赖抖动
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const cacheKeyRef = useRef(cacheKey)
  cacheKeyRef.current = cacheKey
  const cacheTtlRef = useRef(cacheTtl)
  cacheTtlRef.current = cacheTtl

  const isLastPage = (items: T[]): boolean => {
    const rule = hasMoreRef.current
    return rule ? rule(items) : items.length >= pageSize
  }

  const fullCacheKey = (params?: FetchParams): string | null => {
    const base = cacheKeyRef.current
    if (!base) return null
    const suffix = params ? JSON.stringify(params) : ''
    return `${base}:${suffix}`
  }

  const fetch = useCallback(
    async (nextPage = 1, params?: FetchParams) => {
      const cacheKeyFull = nextPage <= 1 ? fullCacheKey(params) : null
      if (nextPage <= 1) {
        // SWR：同步读缓存先渲染，避免白屏/转圈
        if (cacheKeyFull) {
          const cached = getCacheSync<T[]>(cacheKeyFull)
          if (cached && cached.length) {
            setList(cached)
            setHasMoreState(isLastPage(cached))
            setError(false)
            if (isFreshSync(cacheKeyFull, cacheTtlRef.current)) {
              setLoading(false)
              setLoadingMore(false)
              return
            }
          }
        }
        setLoading(true)
      } else {
        setLoadingMore(true)
      }
      setError(false)
      try {
        const items = await fetcherRef.current(nextPage, pageSize, params)
        setList((prev) => (nextPage <= 1 ? items : [...prev, ...items]))
        setPage(nextPage)
        setHasMoreState(isLastPage(items))
        if (cacheKeyFull && items.length) {
          setCache(cacheKeyFull, items)
        }
      } catch (err) {
        console.error('[usePaginatedList] 加载失败', err)
        if (nextPage <= 1) setError(true)
        onErrorRef.current?.(nextPage)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [pageSize]
  )

  const fetchMore = useCallback(() => {
    if (loading || loadingMore || !hasMoreState) return
    return fetch(page + 1)
  }, [loading, loadingMore, hasMoreState, page, fetch])

  return {
    list,
    setList,
    page,
    hasMore: hasMoreState,
    loading,
    loadingMore,
    error,
    fetch,
    fetchMore
  }
}