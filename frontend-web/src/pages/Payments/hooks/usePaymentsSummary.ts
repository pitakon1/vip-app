import { useMemo } from 'react'
import { buildPageNumbers, toDisplayStatus } from '../utils'
import type { Payment } from '@/types'
import type { PaymentSummary } from '../types'

/** 顶部统计卡片 + 分页页码 */
export function usePaymentsSummary(
  data: Payment[],
  total: number,
  page: number,
  pageSize: number,
) {
  const summary = useMemo<PaymentSummary>(() => {
    const succeeded = data.filter((p) => toDisplayStatus(p) === 'completed')
    const pending = data.filter((p) => toDisplayStatus(p) === 'pending')
    const overdue = data.filter((p) => toDisplayStatus(p) === 'overdue')
    const refunds = data.filter((p) => p.payment_type === 'refund')
    const totalAmount = succeeded.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    )
    const pendingAmount = pending.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    )
    const overdueAmount = overdue.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    )
    const expenseAmount = refunds.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    )
    return {
      totalAmount,
      pendingAmount,
      overdueAmount,
      expenseAmount,
      count: succeeded.length,
      pendingCount: pending.length,
      overdueCount: overdue.length,
    }
  }, [data])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageNumbers = useMemo(
    () => buildPageNumbers(totalPages, page),
    [page, totalPages],
  )

  return {
    summary,
    totalPages,
    pageNumbers,
    statIncome: summary.totalAmount,
    statExpense: summary.expenseAmount,
    statPending: summary.pendingAmount,
    statOverdue: summary.overdueAmount,
    statTotal: total,
  }
}
