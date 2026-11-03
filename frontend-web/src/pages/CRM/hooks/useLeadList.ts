import { LIST_PAGE_SIZE } from '@/lib/pagination'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { leadsApi } from '@/services/api'
import type { Lead, LeadStatus } from '@/types'
import { useCachedQuery } from '@/lib/queryCache'
import { errorText } from '@/lib/errorText'
import { statusToColumn } from '../constants'
import type { KanbanColumnKey, QueryParams } from '../types'

/** 线索列表：筛选/分页状态、缓存查询、看板分组与统计派生 */
export function useLeadList() {
  const { t } = useTranslation()
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: LIST_PAGE_SIZE,
  })

  // 列表查询走统一缓存（跨会话秒开 + 翻页/改筛选保留上一页结果）
  const listKey = [
    queryParams.page,
    queryParams.pageSize,
    queryParams.stage ?? '',
    queryParams.keyword ?? '',
  ].join(':')
  const listQuery = useCachedQuery<{ items: Lead[]; total: number }>({
    queryKey: ['crm-leads', listKey],
    cacheKey: `crm-leads:${listKey}`,
    keepPreviousData: true,
    queryFn: async () => {
      const res = await leadsApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        stage: queryParams.stage,
        keyword: queryParams.keyword,
      })
      const payload = res.data?.data ?? res.data
      return { items: (payload?.items ?? []) as Lead[], total: Number(payload?.total ?? 0) }
    },
  })

  const data = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const loading = listQuery.isFetching && !listQuery.data
  const loadError = listQuery.isError ? errorText(listQuery.error, t('common.loadFailed')) : null

  useEffect(() => {
    if (listQuery.isError) message.error(errorText(listQuery.error, t('common.loadFailed')))
  }, [listQuery.isError, listQuery.error, t])

  const fetchData = useCallback(async () => {
    await listQuery.refetch()
  }, [listQuery])

  const displayData = data
  // 有已加载数据时即使刷新失败也继续展示，避免失败把列表替换成空态
  const showDataView = displayData.length > 0 || (!loading && !loadError)

  // 按看板列分组
  const kanbanGroups = useMemo(() => {
    const groups: Record<KanbanColumnKey, Lead[]> = {
      new: [],
      contacted: [],
      viewed: [],
      negotiating: [],
      closed: [],
    }
    for (const lead of displayData) {
      const col = statusToColumn[lead.stage as LeadStatus] || 'new'
      groups[col].push(lead)
    }
    return groups
  }, [displayData])

  // 统计指标（基于真实数据计算，无数据时展示空态）
  const pipelineStats = useMemo(() => {
    const totalLeads = displayData.length
    const closedCount = kanbanGroups.closed.length
    const conversionRate = totalLeads > 0 ? Math.round((closedCount / totalLeads) * 1000) / 10 : 0
    return { totalLeads, closedCount, conversionRate }
  }, [displayData, kanbanGroups])

  const hasLeads = displayData.length > 0

  const handleSearch = (value: string) => {
    setQueryParams((p) => ({ ...p, keyword: value || undefined, page: 1 }))
  }

  const handleStageChange = (value: LeadStatus | undefined) => {
    setQueryParams((p) => ({ ...p, stage: value, page: 1 }))
  }

  const goPrevPage = () => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
  const goNextPage = () => setQueryParams((p) => ({ ...p, page: p.page + 1 }))

  return {
    queryParams,
    loading,
    loadError,
    fetchData,
    displayData,
    showDataView,
    kanbanGroups,
    pipelineStats,
    hasLeads,
    total,
    handleSearch,
    handleStageChange,
    goPrevPage,
    goNextPage,
  }
}
