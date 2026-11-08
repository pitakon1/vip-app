import { LIST_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination'
import { useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { commissionRulesApi, employeesApi } from '@/services/api'
import api from '@/lib/api'
import { useCachedQuery } from '@/lib/queryCache'
import { errorText } from '@/lib/errorText'
import type { Broker, CommissionRule, Employee } from '../types'

/** 规则主列表 + 员工/分销商下拉数据，含本地分页与当前页回退 */
export function useCommissionRulesList() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)

  // 规则列表：服务端分页（FE-08：只消费服务端 total，不再用本页数组长度冒充总数）
  const rulesQ = useCachedQuery<{ items: CommissionRule[]; total: number }>({
    queryKey: ['commission-rules', 'list', String(page)],
    cacheKey: `commission-rules:list:${page}`,
    queryFn: async () => {
      const res = await commissionRulesApi.list({ page, page_size: LIST_PAGE_SIZE })
      const payload = res.data?.data ?? res.data
      const items: CommissionRule[] = payload?.items ?? payload ?? []
      const total = Number(payload?.total ?? items.length)
      return { items, total }
    },
  })
  // 员工 / 分销商下拉：非关键数据，失败静默降级为空
  const employeesQ = useCachedQuery<Employee[]>({
    queryKey: ['commission-rules', 'employees'],
    cacheKey: 'commission-rules:employees',
    queryFn: async () => {
      try {
        const res = await employeesApi.list({ page: 1, page_size: OPTION_PAGE_SIZE })
        const payload = res.data?.data ?? res.data
        return payload?.items ?? payload ?? []
      } catch {
        return []
      }
    },
  })
  const brokersQ = useCachedQuery<Broker[]>({
    queryKey: ['commission-rules', 'brokers'],
    cacheKey: 'commission-rules:brokers',
    queryFn: async () => {
      try {
        const res = await api.get('/brokers', { params: { page_size: OPTION_PAGE_SIZE } })
        const payload = res.data?.data ?? res.data
        return (payload?.items ?? []).map((b: Broker) => ({ id: b.id, partner_name: b.partner_name }))
      } catch {
        return []
      }
    },
  })

  const items = rulesQ.data?.items ?? []
  const total = rulesQ.data?.total ?? 0
  const employees = employeesQ.data ?? []
  const brokers = brokersQ.data ?? []
  const loading = rulesQ.isPending && !rulesQ.data
  const loadFailed = rulesQ.isError
  const refresh = () => { void rulesQ.refetch({ cancelRefetch: false }) }

  // 加载失败提示（保留原有 toast 行为）
  useEffect(() => {
    if (rulesQ.isError) {
      message.error(errorText((rulesQ.error as any), t('commissionRules.fetchFailed')))
    }
  }, [rulesQ.isError, rulesQ.error, t])

  // 服务端分页：本页即服务端返回的一页，页码/总数都来自服务端 total
  const pageSize = LIST_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const pagedItems = items

  // 删除/禁用后当前页可能超出范围，自动回退到可用的最后一页
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  return {
    items,
    total,
    employees,
    brokers,
    loading,
    loadFailed,
    refresh,
    page,
    setPage,
    pageSize,
    pageCount,
    pagedItems,
  }
}
