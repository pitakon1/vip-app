import type { PaymentDisplayStatus } from '@/types'

/* ===== 展示派生态（与设计稿徽章颜色一致） ===== */
export type DisplayStatus = PaymentDisplayStatus

/* ===== 类型显示元数据（收款/付款/退款） ===== */
export type DisplayType = 'income' | 'expense' | 'refund'

export type DetailType = 'detail' | 'receipt' | 'invoice'

export interface QueryParams {
  page: number
  pageSize: number
  status?: string
  keyword?: string
  payment_type?: string
  channel?: string
  date_from?: string
  date_to?: string
}

export interface ManualForm {
  payer_id: string
  payee_id: string
  amount: string
  currency: string
  payment_type: string
  channel: string
  due_date: string
  description: string
}

export interface PaymentSummary {
  totalAmount: number
  pendingAmount: number
  overdueAmount: number
  expenseAmount: number
  count: number
  pendingCount: number
  overdueCount: number
}

export type DocData = Record<string, any>
