import type { Payment } from '@/types'
import type { DisplayStatus, DisplayType } from './types'

// 后端枚举 → 展示派生态（后端只返回原始状态，聚合态由前端派生）
export const toDisplayStatus = (p: Payment): DisplayStatus => {
  const explicit = (p as any).display_status as DisplayStatus | undefined
  if (explicit) return explicit
  const s = p.status
  if (s === 'succeeded') return 'completed'
  if (s === 'refunded') return 'refunded'
  if (s === 'failed' || s === 'expired') return 'overdue'
  // 与后端 /payments?status=overdue 的派生口径一致：pending 且已过截止日
  if (s === 'pending' && p.due_date && new Date(p.due_date).getTime() < Date.now()) {
    return 'overdue'
  }
  return 'pending'
}

export const toDisplayType = (p: Payment): DisplayType => {
  const explicit = (p as any).display_type as DisplayType | undefined
  if (explicit) return explicit
  if (p.payment_type === 'refund') return 'refund'
  return 'income'
}

/** 后端日期是带微秒的 ISO 串，表格里直接展示会露出 `2026-09-23T02:49:50.547430`。 */
export const formatDateTime = (value?: string | null): string => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const formatAmount = (p: Payment) => {
  const amt = Number(p.amount || 0)
  // 与设计稿一致：单元格只展示金额，币种由表头“金额 (฿)”体现
  return amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 尚需缴纳的滞纳金（毛额扣除已减免）
export const lateFeeDue = (p: Payment) =>
  Math.max(Number(p.late_fee_accrued || 0) - Number(p.late_fee_waived || 0), 0)

export const formatFee = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 分页页码（对齐原型 rent-pagination 结构）
export const buildPageNumbers = (
  totalPages: number,
  page: number,
): (number | string)[] => {
  const nums: (number | string)[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) nums.push(i)
  } else {
    nums.push(1)
    if (page > 4) nums.push('prev-ellipsis')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) nums.push(i)
    if (page < totalPages - 3) nums.push('next-ellipsis')
    nums.push(totalPages)
  }
  return nums
}
