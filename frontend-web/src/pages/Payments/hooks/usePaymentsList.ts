import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { LIST_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination'
import { leasesApi, paymentsApi } from '@/services/api'
import { useCachedQuery } from '@/lib/queryCache'
import { downloadReport } from '@/lib/download'
import { errorText } from '@/lib/errorText'
import type { Payment } from '@/types'
import type { QueryParams } from '../types'

/** 收付款列表：筛选/分页/缓存查询 + 租约租客姓名解析 + 导出 */
export function usePaymentsList() {
  const { t } = useTranslation()
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: LIST_PAGE_SIZE,
  })
  const [filterType, setFilterType] = useState<string>('')
  const [filterMethod, setFilterMethod] = useState<string>('')
  const [filterStart, setFilterStart] = useState<string>('')
  const [filterEnd, setFilterEnd] = useState<string>('')

  // 列表查询走统一缓存（跨会话秒开 + 翻页/改筛选保留上一页结果）
  const listKey = [
    queryParams.page,
    queryParams.pageSize,
    queryParams.status ?? '',
    queryParams.keyword ?? '',
    queryParams.payment_type ?? '',
    queryParams.channel ?? '',
    queryParams.date_from ?? '',
    queryParams.date_to ?? '',
  ].join(':')
  const listQuery = useCachedQuery<{ items: Payment[]; total: number }>({
    queryKey: ['payments', listKey],
    cacheKey: `payments:${listKey}`,
    keepPreviousData: true,
    queryFn: async () => {
      const res = await paymentsApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        status: queryParams.status,
        keyword: queryParams.keyword,
        payment_type: queryParams.payment_type,
        channel: queryParams.channel,
        date_from: queryParams.date_from,
        date_to: queryParams.date_to,
      })
      const payload = res.data?.data ?? res.data
      return { items: (payload?.items ?? []) as Payment[], total: Number(payload?.total ?? 0) }
    },
  })

  const data = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const loading = listQuery.isFetching && !listQuery.data
  const loadError = listQuery.isError ? errorText(listQuery.error, t('common.loadFailed')) : null

  useEffect(() => {
    if (listQuery.isError) message.error(errorText(listQuery.error, t('common.loadFailed')))
  }, [listQuery.isError, listQuery.error, t])

  // 租约 ID → 租客姓名。后端 /payments 只回 lease_id，直接展示会露出数据库主键；
  // 这里用 /leases 的 tenant_name 做一次解析，解析不到时显示占位符而非 UUID。
  const [leaseTenantMap, setLeaseTenantMap] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    leasesApi
      .list({ pageSize: OPTION_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return
        const items = res.data?.data?.items ?? res.data?.items ?? []
        const map: Record<string, string> = {}
        for (const l of items as any[]) {
          if (l?.id && l.tenant_name) map[String(l.id)] = String(l.tenant_name)
        }
        setLeaseTenantMap(map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const resolveTenantName = (p: Payment) =>
    (p as any).tenant_name || leaseTenantMap[String(p.lease_id ?? '')] || '-'

  const fetchData = useCallback(async () => {
    await listQuery.refetch()
  }, [listQuery])

  // 导出当前筛选条件下的收付款流水（后端生成 CSV，见 /api/v1/exports/payments）
  const handleExport = async () => {
    try {
      await downloadReport(
        '/exports/payments',
        {
          status: queryParams.status || undefined,
          payment_type: filterType || undefined,
          channel: filterMethod || undefined,
          date_from: filterStart || undefined,
          date_to: filterEnd || undefined,
        },
        'payments.csv',
      )
      message.success(t('payments.msgExported'))
    } catch {
      message.error(t('payments.errExport'))
    }
  }

  const handleSearch = (value: string) => {
    setQueryParams((p) => ({ ...p, keyword: value || undefined, page: 1 }))
  }

  const handleStatusChange = (value: string | undefined) => {
    setQueryParams((p) => ({ ...p, status: value, page: 1 }))
  }

  // 类型/方式/日期筛选：点击「筛选」后统一应用到列表查询
  const handleApplyFilter = () => {
    setQueryParams((p) => ({
      ...p,
      payment_type: filterType || undefined,
      channel: filterMethod || undefined,
      date_from: filterStart || undefined,
      date_to: filterEnd || undefined,
      page: 1,
    }))
  }

  const hasFilters = useMemo(
    () =>
      !!(
        queryParams.status ||
        queryParams.keyword ||
        queryParams.payment_type ||
        queryParams.channel ||
        queryParams.date_from ||
        queryParams.date_to
      ),
    [queryParams],
  )

  return {
    data,
    total,
    loading,
    loadError,
    fetchData,
    queryParams,
    setQueryParams,
    filterType,
    setFilterType,
    filterMethod,
    setFilterMethod,
    filterStart,
    setFilterStart,
    filterEnd,
    setFilterEnd,
    handleExport,
    handleSearch,
    handleStatusChange,
    handleApplyFilter,
    resolveTenantName,
    hasFilters,
  }
}
