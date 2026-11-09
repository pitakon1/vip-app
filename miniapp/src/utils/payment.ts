/**
 * 账单展示分桶，与后端 `app/core/payments.bill_bucket` 同口径：
 *  - received：已结清（succeeded）
 *  - pending：未结清（pending / processing / failed）且未过截止日
 *  - overdue：未结清且 due_date 已过（逾期只看 due_date，不看 status）
 *  - closed：已关闭（refunded / expired / disputed），不再催缴
 *
 * processing 必须计入待缴：用户可能已上传凭证或渠道处理中，但账单尚未结清。
 */
export type BillBucket = 'received' | 'pending' | 'overdue' | 'closed'

const UNPAID_STATUSES = ['pending', 'processing', 'failed']
const CLOSED_STATUSES = ['refunded', 'expired', 'disputed']

export function billBucket(
  p: { status?: string | null; due_date?: string | null },
  now: number = Date.now()
): BillBucket {
  const status = String(p.status ?? 'pending').toLowerCase()
  if (status === 'succeeded') return 'received'
  if (CLOSED_STATUSES.includes(status)) return 'closed'
  if (!UNPAID_STATUSES.includes(status)) return 'closed'
  const due = p.due_date ? new Date(p.due_date).getTime() : NaN
  return !Number.isNaN(due) && due < now ? 'overdue' : 'pending'
}

export const isUnpaid = (p: { status?: string | null; due_date?: string | null }) =>
  ['pending', 'overdue'].includes(billBucket(p))

export const isOverdue = (p: { status?: string | null; due_date?: string | null }) =>
  billBucket(p) === 'overdue'

/** processing 已提交渠道/凭证，不能重复发起扣款（后端会 409） */
export const canPayBill = (p: { status?: string | null; due_date?: string | null }) => {
  const status = String(p.status ?? '').toLowerCase()
  return status !== 'succeeded' && status !== 'processing' && isUnpaid(p)
}
