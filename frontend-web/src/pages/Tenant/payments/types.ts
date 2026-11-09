import type { ReactNode } from 'react'

export interface PaymentVoucher {
  id: string
  amount: number
  currency?: string
  payment_date: string
  payment_method: string
  receipt_url?: string
  status: 'pending' | 'approved' | 'rejected'
  review_comment?: string
  created_at: string
  bill_type?: string
  property_name?: string
  due_date?: string
  [key: string]: any
}

export type FilterKey = 'all' | 'pending' | 'overdue' | 'approved'
export type StatusKey = 'pending' | 'approved' | 'rejected'

export interface OnlinePayMethod {
  id: string
  name: string
  desc: string
  icon: ReactNode
}

export interface OwnerPropertyOption {
  id: string
  label: string
}

/** 页面状态映射：label 已按当前语言解析 */
export interface StatusMeta {
  label: string
  cls: string
}
