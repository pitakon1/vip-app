import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { PAGE_SIZE, ownerPropertiesQueryKey } from '../constants'
import { buildPageNumbers, computeStatusCounts, filterAndSortProperties } from '../utils'
import type { OwnerProperty, OwnerPropertyFilters } from '../types'

const INITIAL_FILTERS: OwnerPropertyFilters = {
  keyword: '',
  status: '',
  bedrooms: '',
  priceRange: '',
  priceCustomMin: '',
  priceCustomMax: '',
  areaRange: '',
  areaCustomMin: '',
  areaCustomMax: '',
  sort: 'created',
}

/** 名下房源列表：缓存查询、本地筛选/排序（保持原行为）、分页与统计 */
export function useOwnerPropertiesList() {
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryKey = useMemo(() => ownerPropertiesQueryKey(uid), [uid])

  const q = useCachedQuery<{ items: OwnerProperty[]; rentedCount?: number; occupancyRate?: number }>({
    queryKey,
    cacheKey: `owner-properties:list:${uid}`,
    queryFn: async () => {
      // 出租率统一取后端「有效租约 / 未软删房源」口径；房源列表本身仍用同一接口。
      const [propRes, incomeRes] = await Promise.allSettled([
        api.get('/owners/me/properties'),
        api.get('/owners/me/income'),
      ])
      const payload = propRes.status === 'fulfilled'
        ? (propRes.value.data?.data ?? propRes.value.data)
        : []
      const items: OwnerProperty[] = Array.isArray(payload) ? payload : (payload?.items ?? [])
      const income = incomeRes.status === 'fulfilled'
        ? (incomeRes.value.data?.data ?? incomeRes.value.data)
        : null
      return {
        items,
        rentedCount: typeof income?.rented_count === 'number' ? income.rented_count : undefined,
        occupancyRate: typeof income?.occupancy_rate === 'number' ? income.occupancy_rate : undefined,
      }
    },
  })
  const allItems = q.data?.items ?? []
  const loading = q.isPending && !q.data
  const showError = q.isError && !q.data
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  // 筛选参数（全部为客户端过滤）
  const [filters, setFilters] = useState<OwnerPropertyFilters>(INITIAL_FILTERS)
  const [page, setPage] = useState(1)

  const setFilter = useCallback(
    <K extends keyof OwnerPropertyFilters>(key: K, value: OwnerPropertyFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  // 统计（名下房源 / 在租 / 空置 / 在售）；在租与出租率以后端有效租约口径为准
  const rawStatusCount = useMemo(() => computeStatusCounts(allItems), [allItems])
  const statusCount = useMemo(
    () => ({
      ...rawStatusCount,
      rented: q.data?.rentedCount ?? rawStatusCount.rented,
    }),
    [rawStatusCount, q.data?.rentedCount],
  )
  const totalProps = allItems.length
  const occupancyPct = q.data?.occupancyRate != null
    ? Math.round(q.data.occupancyRate)
    : totalProps > 0
      ? Math.round((statusCount.rented / totalProps) * 100)
      : 0

  // 前端筛选 + 排序（客户端过滤，与管理员端一致）
  const filteredItems = useMemo(
    () => filterAndSortProperties(allItems, filters),
    [allItems, filters],
  )

  useEffect(() => {
    setPage(1)
  }, [
    filters.keyword,
    filters.status,
    filters.bedrooms,
    filters.priceRange,
    filters.priceCustomMin,
    filters.priceCustomMax,
    filters.areaRange,
    filters.areaCustomMin,
    filters.areaCustomMax,
    filters.sort,
  ])

  const total = filteredItems.length
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

  // 分页页码（对齐管理员端 rent-pagination 结构）
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageNumbers = useMemo(() => buildPageNumbers(totalPages, page), [page, totalPages])

  return {
    queryKey,
    allItems,
    loading,
    showError,
    refresh,
    filters,
    setFilter,
    page,
    setPage,
    statusCount,
    totalProps,
    occupancyPct,
    filteredItems,
    pagedItems,
    total,
    totalPages,
    pageNumbers,
  }
}
