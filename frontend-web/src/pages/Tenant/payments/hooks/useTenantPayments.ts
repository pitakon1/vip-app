import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { makeMethodLabelMap, isOverdue, isUnpaid, normalizeStatus } from '../constants'
import { groupByMonth, tenantPaymentsKey } from '../utils'
import type { FilterKey, PaymentVoucher } from '../types'

/** 租客/业主共用的付款记录数据：拉取、筛选、汇总、按月分组 */
export const useTenantPayments = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'

  const [filter, setFilter] = useState<FilterKey>('all')
  const [keyword, setKeyword] = useState('')
  /** 查看凭证详情弹窗（数据来自 /payments/me 返回的支付单实体） */
  const [detailBill, setDetailBill] = useState<PaymentVoucher | null>(null)

  const q = useCachedQuery<PaymentVoucher[]>({
    queryKey: tenantPaymentsKey(uid),
    cacheKey: `tenant-payments:mine:${uid}`,
    queryFn: async () => {
      const res = await api.get('/payments/me')
      const payload = res.data?.data ?? res.data
      // 真实字段映射：接口使用 channel / payment_type
      return (payload?.items ?? []).map((p: any) => ({
        ...p,
        payment_method: p.payment_method ?? p.channel,
        bill_type: p.bill_type ?? p.payment_type,
      }))
    },
  })
  const data = q.data ?? []
  const loading = q.isPending && !q.data
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  const filteredData = useMemo(() => {
    if (filter === 'all') return data
    if (filter === 'pending') return data.filter((d) => isUnpaid(d.status) && !isOverdue(d))
    if (filter === 'overdue') return data.filter((d) => isOverdue(d))
    return data.filter((d) => normalizeStatus(d.status) === 'approved')
  }, [data, filter])

  // 待缴口径：未确认到账一律计入（含 processing 已上传待核销）；逾期是这组
  // 未结清账单里 due_date 已过的子集，不额外叠加，列表/汇总/逾期数才自洽。
  const rawPending = useMemo(
    () => data.filter((d) => isUnpaid(d.status)),
    [data],
  )
  const summary = useMemo(() => {
    const pending = rawPending
    const approved = data.filter((d) => normalizeStatus(d.status) === 'approved')
    const sum = (arr: PaymentVoucher[]) => arr.reduce((acc, x) => acc + Number(x.amount || 0), 0)
    return {
      pendingTotal: sum(pending),
      approvedTotal: sum(approved),
    }
  }, [data, rawPending])

  // 搜索：凭证编号 / 月份 / 类型
  const searchFiltered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return filteredData
    const methodLabelMap = makeMethodLabelMap(t)
    return filteredData.filter((d) => {
      const dateStr = dayjs(d.payment_date || d.created_at).format(t('tenantPayments.monthFormat'))
      return [
        d.id,
        d.bill_type,
        methodLabelMap[d.payment_method],
        dateStr,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
  }, [filteredData, keyword, t])

  // 按月分组（倒序）
  const monthGroups = useMemo(
    () => groupByMonth(searchFiltered, t('tenantPayments.monthFormat')),
    [searchFiltered, t],
  )

  const firstPending = rawPending[0]
  const heroCurrency = firstPending?.currency || 'THB'
  const heroProperty = firstPending?.property_name || firstPending?.description || ''
  const heroDue = firstPending?.due_date
    ? dayjs(firstPending.due_date).format(t('tenantPayments.dateDisplayFormat'))
    : ''

  return {
    data,
    loading,
    isError: q.isError && !q.data,
    refresh,
    filter,
    setFilter,
    keyword,
    setKeyword,
    detailBill,
    setDetailBill,
    summary,
    monthGroups,
    heroCurrency,
    heroProperty,
    heroDue,
  }
}
