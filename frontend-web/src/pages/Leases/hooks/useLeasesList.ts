import { LIST_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { leasesApi, propertiesApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import { useCachedQuery } from '@/lib/queryCache'
import type { Lease, LeaseStatus, Property } from '@/types'
import { errorText, errorKind, type ErrorKind } from '@/lib/errorText'
import { buildPageNumbers } from '../utils'
import type { LeaseStatusCounts, QueryParams } from '../types'

/** 租约列表：查询参数、缓存查询、筛选/分页/导出、房源名兜底 */
export function useLeasesList() {
  const { t } = useTranslation()
  const [properties, setProperties] = useState<Property[]>([])
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: LIST_PAGE_SIZE,
  })
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterStart, setFilterStart] = useState<string>('')
  const [filterEnd, setFilterEnd] = useState<string>('')
  const [exporting, setExporting] = useState(false)

  // 列表查询走统一缓存（跨会话秒开 + 翻页/改筛选保留上一页结果）
  const listKey = [
    queryParams.page,
    queryParams.pageSize,
    queryParams.status ?? '',
    queryParams.keyword ?? '',
    queryParams.propertyType ?? '',
    queryParams.dateFrom ?? '',
    queryParams.dateTo ?? '',
    queryParams.endingWithinDays ?? '',
  ].join(':')
  const listQuery = useCachedQuery<{ items: Lease[]; total: number }>({
    queryKey: ['leases', listKey],
    cacheKey: `leases:${listKey}`,
    keepPreviousData: true,
    queryFn: async () => {
      const res = await leasesApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        status: queryParams.status,
        keyword: queryParams.keyword,
        property_type: queryParams.propertyType,
        date_from: queryParams.dateFrom,
        date_to: queryParams.dateTo,
        ending_within_days: queryParams.endingWithinDays,
      })
      const payload = res.data?.data ?? res.data
      return { items: (payload?.items ?? []) as Lease[], total: Number(payload?.total ?? 0) }
    },
  })

  const data = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const loading = listQuery.isFetching && !listQuery.data
  const loadError = listQuery.isError ? errorText(listQuery.error, t('common.loadFailed')) : null
  const loadErrorKind: ErrorKind = listQuery.isError ? errorKind(listQuery.error) : 'unknown'

  // 失败提示与旧行为一致：保留上一页数据，同时弹一次 toast
  useEffect(() => {
    if (listQuery.isError) message.error(errorText(listQuery.error, t('common.loadFailed')))
  }, [listQuery.isError, listQuery.error, t])

  const fetchProperties = useCallback(async () => {
    try {
      const res = await propertiesApi.list({ pageSize: OPTION_PAGE_SIZE })
      const payload = res.data?.data ?? res.data
      setProperties(payload?.items ?? [])
    } catch {
      // ignore
    }
  }, [])

  const fetchData = useCallback(async () => {
    await listQuery.refetch()
  }, [listQuery])

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  // 「即将到期」已改为服务端筛选（ending_within_days），页面直接渲染接口结果
  const displayData = data

  // 状态计数走服务端 total（只取 1 条），不再对当前页 reduce：
  // 此前翻页后「在租/即将到期/已终止」会随当前页内容跳动。
  const countFilterKey = [
    queryParams.status ?? '',
    queryParams.keyword ?? '',
    queryParams.propertyType ?? '',
    queryParams.dateFrom ?? '',
    queryParams.dateTo ?? '',
  ].join(':')
  const [statusCounts, setStatusCounts] = useState<LeaseStatusCounts | null>(null)
  useEffect(() => {
    let cancelled = false
    const base = {
      page: 1,
      pageSize: 1,
      property_type: queryParams.propertyType,
      keyword: queryParams.keyword,
      date_from: queryParams.dateFrom,
      date_to: queryParams.dateTo,
    }
    const readTotal = (res: any) => Number((res.data?.data ?? res.data)?.total ?? 0)
    Promise.allSettled([
      leasesApi.list({ ...base, status: 'active' as LeaseStatus }),
      leasesApi.list({
        ...base,
        status: 'active' as LeaseStatus,
        ending_within_days: 60,
      }),
      leasesApi.list({ ...base, status: 'expired' as LeaseStatus }),
      leasesApi.list({ ...base, status: 'terminated' as LeaseStatus }),
    ]).then((results) => {
      if (cancelled) return
      const activeTotal = results[0].status === 'fulfilled' ? readTotal(results[0].value) : 0
      const expiring = results[1].status === 'fulfilled' ? readTotal(results[1].value) : 0
      const expired = results[2].status === 'fulfilled' ? readTotal(results[2].value) : 0
      const terminated = results[3].status === 'fulfilled' ? readTotal(results[3].value) : 0
      setStatusCounts({
        total: 0,
        active: Math.max(0, activeTotal - expiring),
        expiring,
        expired,
        terminated,
      })
    })
    return () => {
      cancelled = true
    }
  }, [countFilterKey])

  // 顶部统计卡片数值（服务端全局口径；total 随筛选条件变化）
  const statTotal = total
  const statActive = statusCounts?.active ?? 0
  const statExpiring = statusCounts?.expiring ?? 0
  const statTerminated = statusCounts?.terminated ?? 0

  // 分页页码（对齐原型 rent-pagination 结构）
  const totalPages = Math.max(1, Math.ceil(total / queryParams.pageSize))
  const pageNumbers = useMemo(
    () => buildPageNumbers(totalPages, queryParams.page),
    [queryParams.page, totalPages],
  )

  const handleSearch = (value: string) => {
    setQueryParams((p) => ({ ...p, keyword: value || undefined, page: 1 }))
  }

  const handleStatusChange = (value: string | undefined) => {
    if (value === 'expiring') {
      // 即将到期 = 服务端按合同结束日筛选，不再只过滤当前页
      setQueryParams((p) => ({
        ...p,
        status: undefined,
        endingWithinDays: 60,
        page: 1,
      }))
      return
    }
    setQueryParams((p) => ({
      ...p,
      status: (value || undefined) as LeaseStatus | undefined,
      endingWithinDays: undefined,
      page: 1,
    }))
  }

  // 房源 / 租客显示名：列表接口已返回 property_name / tenant_name，缺失时用已加载房源兜底
  const propertyNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of properties) {
      map[String(p.id)] = p.room_number || p.address || String(p.id)
    }
    return map
  }, [properties])

  const resolvePropertyName = (lease: Lease) =>
    (lease as any).property_name || propertyNameMap[String(lease.property_id)] || '-'
  const resolveTenantName = (lease: Lease) => (lease as any).tenant_name || '-'

  // 筛选：把「合同类型 / 起始日区间」草稿条件提交给服务端（状态下拉为即时筛选）
  const handleApplyFilters = () => {
    if (filterStart && filterEnd && filterStart > filterEnd) {
      message.warning(t('leases.warnDateRange'))
      return
    }
    setQueryParams((p) => ({
      ...p,
      propertyType: filterType || undefined,
      dateFrom: filterStart || undefined,
      dateTo: filterEnd || undefined,
      page: 1,
    }))
  }

  const handleReset = () => {
    setFilterStatus('')
    setFilterType('')
    setFilterStart('')
    setFilterEnd('')
    handleStatusChange(undefined)
    handleSearch('')
    setQueryParams((p) => ({
      ...p,
      propertyType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      page: 1,
    }))
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      // 导出沿用当前筛选条件，避免「页面筛过、导出却是全量」
      await downloadReport(
        '/exports/leases',
        {
          status: queryParams.status,
          property_type: queryParams.propertyType,
          keyword: queryParams.keyword,
          date_from: queryParams.dateFrom,
          date_to: queryParams.dateTo,
          ending_within_days: queryParams.endingWithinDays,
        },
        `leases_${dayjs().format('YYYYMMDD')}.csv`,
      )
    } catch {
      message.error(t('leases.errExport'))
    } finally {
      setExporting(false)
    }
  }

  const setPage = (page: number) => setQueryParams((p) => ({ ...p, page }))

  return {
    t,
    properties,
    queryParams,
    displayData,
    total,
    loading,
    loadError,
    loadErrorKind,
    fetchData,
    statTotal,
    statActive,
    statExpiring,
    statTerminated,
    totalPages,
    pageNumbers,
    filterStatus,
    setFilterStatus,
    filterType,
    setFilterType,
    filterStart,
    setFilterStart,
    filterEnd,
    setFilterEnd,
    handleSearch,
    handleStatusChange,
    handleApplyFilters,
    handleReset,
    handleExport,
    exporting,
    resolvePropertyName,
    resolveTenantName,
    setPage,
  }
}
