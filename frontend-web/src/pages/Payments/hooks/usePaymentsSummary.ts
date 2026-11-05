import { useMemo } from 'react'
import { buildPageNumbers } from '../utils'
import type { PaymentSummary } from '../types'

const EMPTY_SUMMARY: PaymentSummary = {
  totalAmount: 0,
  pendingAmount: 0,
  overdueAmount: 0,
  expenseAmount: 0,
  count: 0,
  pendingCount: 0,
  overdueCount: 0,
}

/** 顶部统计卡片 + 分页页码（金额来自后端全局汇总，而非当前页 reduce） */
export function usePaymentsSummary(
  serverSummary: PaymentSummary | null,
  total: number,
  page: number,
  pageSize: number,
) {
  const summary = serverSummary ?? EMPTY_SUMMARY

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
