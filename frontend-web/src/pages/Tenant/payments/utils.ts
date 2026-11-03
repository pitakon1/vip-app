import dayjs from 'dayjs'
import type { PaymentVoucher } from './types'

/** 与 useCachedQuery / setQueryData 共用的查询键 */
export const tenantPaymentsKey = (uid: string) => ['tenant-payments', 'mine', uid]

/** 按月分组（倒序），月份文案由调用方按当前语言传入 */
export const groupByMonth = (
  bills: PaymentVoucher[],
  monthFormat: string,
): [string, PaymentVoucher[]][] => {
  const map = new Map<string, PaymentVoucher[]>()
  for (const d of bills) {
    const key = dayjs(d.payment_date || d.created_at || dayjs()).format(monthFormat)
    const arr = map.get(key) || []
    arr.push(d)
    map.set(key, arr)
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

/** 滚动到凭证上传表单（Hero 按钮与记录卡片「重新上传」共用） */
export const scrollToUpload = () => {
  const el = document.getElementById('pay-upload')
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

/** 凭证原件走鉴权端点（receipts 目录不对外静态托管），用 query token 兜底预览 */
export const openReceiptFile = (bill: PaymentVoucher) => {
  const token = localStorage.getItem('token') || ''
  window.open(`/api/v1/payments/${bill.id}/proof-file?token=${encodeURIComponent(token)}`, '_blank')
}
