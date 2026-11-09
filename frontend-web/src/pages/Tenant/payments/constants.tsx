import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import type { FilterKey, StatusKey, StatusMeta, OnlinePayMethod } from './types'

type Translate = (key: string, options?: any) => string

// 接口状态（pending/processing/succeeded/failed/refunded/expired/disputed）→ 页面展示分组
export const normalizeStatus = (status?: string): StatusKey => {
  const v = String(status || '').toLowerCase()
  if (v === 'succeeded' || v === 'paid' || v === 'approved') return 'approved'
  if (v === 'failed' || v === 'expired' || v === 'disputed' || v === 'refunded' || v === 'rejected') {
    return 'rejected'
  }
  return 'pending'
}

export const CHIPS: FilterKey[] = ['all', 'pending', 'overdue', 'approved']

/**
 * 是否「未结清」。口径：只要还没有确认到账（pending/processing/rejected 等）
 * 都算待缴；`processing` 只是凭证已上传待核销，并未确认收款，必须继续计入，
 * 否则账单会从「待缴合计」里凭空消失（如逾期 ฿35,000 显示为 0）。
 */
export const isUnpaid = (status?: string): boolean =>
  normalizeStatus(status) !== 'approved'

/** 逾期唯一判定口径：未结清 + due_date 已过（按自然日比较，不含时分秒）。 */
export const isOverdue = (bill: { status?: string; due_date?: string }): boolean => {
  if (!isUnpaid(bill.status) || !bill.due_date) return false
  const due = dayjs(bill.due_date)
  return due.isValid() && due.startOf('day').isBefore(dayjs().startOf('day'))
}

export const fmtMoney = (v: number) =>
  `RM ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const makeChipLabelMap = (t: Translate): Record<FilterKey, string> => ({
  all: t('tenantPayments.chipAll'),
  pending: t('tenantPayments.chipPending'),
  overdue: t('tenantPayments.chipOverdue'),
  approved: t('tenantPayments.chipApproved'),
})

export const makeRecordStatusMap = (t: Translate): Record<StatusKey, StatusMeta> => ({
  pending: { label: t('tenantPayments.statusPending'), cls: 'rent-pay-record__status--warning' },
  approved: { label: t('tenantPayments.statusApproved'), cls: 'rent-pay-record__status--success' },
  rejected: { label: t('tenantPayments.statusRejected'), cls: 'rent-pay-record__status--error' },
})

export const makeMethodLabelMap = (t: Translate): Record<string, string> => ({
  bank_transfer: t('tenantPayments.methodBankTransfer'),
  cash: t('tenantPayments.methodCash'),
  alipay: t('tenantPayments.methodAlipay'),
  wechat: t('tenantPayments.methodWechat'),
  promptpay: t('tenantPayments.methodPromptpay'),
  credit_card: t('tenantPayments.methodCreditCard'),
})

export const methodIconMap: Record<string, ReactNode> = {
  bank_transfer: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/></svg>
  ),
  alipay: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3z"/><path d="M2 17a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3z"/></svg>
  ),
  wechat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 5-3.5 7.5-9 9-5.5-1.5-9-4-9-9V5l9-3 9 3z"/></svg>
  ),
  promptpay: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  credit_card: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  ),
}

export const defaultMethodIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
)

export const onlinePayMethods: OnlinePayMethod[] = [
  {
    id: 'qr',
    name: 'ownerPayments.pmQr',
    desc: 'ownerPayments.pmQrDesc',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3z" />
        <path d="M20 14v3" />
        <path d="M14 20h3" />
        <path d="M20 20v1" />
      </svg>
    ),
  },
  {
    id: 'card',
    name: 'Visa / Mastercard',
    desc: 'ownerPayments.pmCardDesc',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    id: 'alipay',
    name: 'ownerPayments.pmAlipay',
    desc: 'ownerPayments.pmAlipayDesc',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8" />
        <path d="M12 8v8" />
      </svg>
    ),
  },
  {
    id: 'wechat',
    name: 'ownerPayments.pmWechat',
    desc: 'WeChat Pay',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    id: 'wise',
    name: 'ownerPayments.pmWise',
    desc: 'ownerPayments.pmWiseDesc',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 7 9 7 7 9" />
        <polyline points="3 17 9 17 7 15" />
        <line x1="12" y1="7" x2="21" y2="7" />
        <line x1="12" y1="17" x2="21" y2="17" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    ),
  },
]
