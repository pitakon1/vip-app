import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { paymentsApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as formatMoney } from '@/utils/format'
import { iconStyle } from '@/utils/icons'
import './index.scss'
import { useI18n } from '@/i18n'

interface Payment {
  id: string
  amount?: number
  currency?: string
  payment_type?: string
  status?: string
  due_date?: string
  paid_at?: string
  description?: string
}

const buildTypeMap = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, string> => ({
  rent: t('pay.typeRent'),
  deposit: t('pay.typeDeposit'),
  commission: t('pay.typeCommission'),
  service_fee: t('pay.typeServiceFee'),
  utility: t('tpay.typeUtility'),
  tax: t('pay.typeTax'),
  refund: t('pay.typeRefund')
})

const buildStatusMap = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, { text: string; color: string }> => ({
  pending: { text: t('tpay.stPending'), color: 'var(--warning)' },
  processing: { text: t('pay.stProcessing'), color: 'var(--primary)' },
  succeeded: { text: t('tpay.stSucceeded'), color: 'var(--success)' },
  failed: { text: t('tpay.stFailed'), color: 'var(--error)' },
  refunded: { text: t('pay.stRefunded'), color: 'var(--info)' },
  disputed: { text: t('tpay.stDisputed'), color: 'var(--error)' },
  expired: { text: t('pay.stExpired'), color: 'var(--ink-3)' }
})

/** 状态对应的徽标配色（复用 app.scss 的 badge 修饰类） */
const STATUS_BADGE: Record<string, string> = {
  pending: 'badge--warning',
  processing: 'badge--info',
  succeeded: 'badge--success',
  failed: 'badge--error',
  refunded: 'badge--info',
  disputed: 'badge--error',
  expired: ''
}

/** 列表项标题：优先按账期显示为「YYYY年M月」，无日期时退回账单类型 */
const monthOf = (
  p: Payment,
  typeMap: Record<string, string>,
  t: (k: string, p?: Record<string, string | number>) => string
) => {
  const raw = p.due_date || p.paid_at
  if (!raw) return typeMap[p.payment_type || ''] || t('tpay.bill')
  const seg = String(raw).slice(0, 7).split('-')
  if (seg.length < 2) return String(raw)
  return t('tpay.yearMonth', { y: seg[0], m: Number(seg[1]) })
}

function pickList(res: any): Payment[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatDate = (x?: string) => (x ? x.replace('T', ' ').slice(0, 16) : '—')

export default function TenantPaymentsPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'

  const { data, setData, loading, refresh } = useSwrCache<Payment[]>({
    key: `tenant:payments:${uid}`,
    fetcher: async () => {
      const res = await paymentsApi.mine()
      return pickList(res)
    },
  })
  const payments = data ?? []
  const TYPE_MAP = buildTypeMap(t)
  const STATUS_MAP = buildStatusMap(t)

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  const pending = payments.filter((p) => p.status === 'pending')
  // 统计口径对齐 App：已支付（succeeded / paid）/ 待支付（pending）
  const isPaid = (p: Payment) => p.status === 'succeeded' || p.status === 'paid'
  const paidCount = payments.filter(isPaid).length
  const dueTotal = pending.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const currency = pending[0]?.currency || payments[0]?.currency || 'THB'

  const channelFor = (cur?: string) =>
    cur === 'CNY' ? 'wechat' : cur === 'USD' ? 'stripe' : 'promptpay'

  const handlePay = async (pay: Payment) => {
    Taro.showLoading({ title: t('tpay.processingEllipsis'), mask: true })
    try {
      const res: any = await paymentsApi.pay(pay.id, { channel: channelFor(pay.currency) })
      Taro.hideLoading()
      const data = res?.data || res
      const checkoutUrl = data?.checkout_url ?? data?.qr_code ?? data?.qr ?? data?.url
      setData(payments.map((p) => (p.id === pay.id ? { ...p, status: 'processing' } : p)))
      if (checkoutUrl) {
        Taro.showModal({
          title: t('tpay.startPay'),
          content: `${t('tpay.linkGenerated')}\n${checkoutUrl}`,
          showCancel: false,
          confirmText: t('common.gotIt')
        })
      } else {
        Taro.showToast({ title: t('tpay.submitted'), icon: 'success' })
      }
    } catch (error) {
      Taro.hideLoading()
      console.error('[Payments] 发起支付失败', error)
      Taro.showToast({ title: t('tpay.stFailed'), icon: 'none' })
    }
  }

  const handleReceipt = async (pay: Payment) => {
    try {
      const res: any = await paymentsApi.receipt(pay.id)
      const r = res?.data || res
      const content = [
        t('tpay.receiptNo', { v: (r.reference_no || pay.id).slice(0, 16) }),
        t('tpay.receiptAmount', { v: formatMoney(r.amount ?? pay.amount, r.currency ?? pay.currency) }),
        t('tpay.receiptType', { v: TYPE_MAP[r.payment_type || ''] || r.payment_type || '-' }),
        r.channel_transaction_id
          ? t('tpay.receiptChannelId', { v: r.channel || '-', id: r.channel_transaction_id })
          : t('tpay.receiptChannelPlain', { v: r.channel || '-' }),
        t('tpay.receiptPaidAt', { v: formatDate(r.paid_at ?? pay.paid_at) })
      ].join('\n')
      Taro.showModal({ title: t('tpay.receiptTitle'), content, showCancel: false, confirmText: t('common.gotIt') })
    } catch (error) {
      console.error('[Payments] 获取凭证失败', error)
      Taro.showToast({ title: t('tpay.receiptFailed'), icon: 'none' })
    }
  }

  const handleInvoice = async (pay: Payment) => {
    try {
      const res: any = await paymentsApi.invoice(pay.id)
      const inv = res?.data || res
      const cur = (inv.currency || pay.currency || 'THB') === 'CNY' ? '¥' : '฿'
      const tax = Number(inv.tax_amount || 0)
      const total = Number(inv.total_amount ?? inv.amount ?? pay.amount ?? 0)
      const net = Number(inv.net_amount ?? (total - tax))
      const content = [
        t('tpay.invoiceNo', { v: inv.invoice_no || '-' }),
        t('tpay.invoiceTotal', { v: `${cur}${total.toLocaleString()}` }),
        t('tpay.invoiceNet', { v: `${cur}${net.toLocaleString()}` }),
        // 对齐 App：税率直接展示 %（后端已为百分比值，不再 ×100）
        t('tpay.invoiceTax', { v: `${cur}${tax.toLocaleString()}`, rate: Number(inv.vat_rate || 0) }),
        // 对齐 App：开票抬头（bill_to）/ 项目（description）；小程序后端无 source 时留空展示占位，不编造
        t('tpay.invoiceBillTo', { v: inv?.bill_to?.name || '—' }),
        ...(inv?.bill_to?.email ? [t('tpay.invoiceEmail', { v: inv.bill_to.email })] : []),
        ...(inv?.description ? [t('tpay.invoiceItem', { v: inv.description })] : []),
        t('tpay.invoiceChannel', { v: inv.channel || '-' }),
        t('tpay.invoiceIssuedAt', { v: formatDate(inv.paid_at ?? pay.paid_at) })
      ].join('\n')
      Taro.showModal({ title: t('tpay.invoiceTitle'), content, showCancel: false, confirmText: t('common.gotIt') })
    } catch (error) {
      console.error('[Payments] 获取发票失败', error)
      Taro.showToast({ title: t('tpay.invoiceFailed'), icon: 'none' })
    }
  }

  return (
    <View className='tenant-payments-page'>
      <View className='page-container'>
        {pending.length > 0 && (
          <View className='pay-banner'>
            <Text className='pay-banner-label'>{t('tpay.monthRent')}</Text>
            <Text className='pay-banner-amount'>{formatMoney(dueTotal, currency)}</Text>
            <View className='pay-banner-badges'>
              <Text className='pay-banner-badge'>{t('tpay.stPending')}</Text>
            </View>
            <View className='pay-banner-actions'>
              <View className='pay-banner-btn pay-banner-btn--ghost' onClick={() => handlePay(pending[0])}>
                <Text className='pay-banner-btn-text'>{t('tpay.payNowCount', { n: pending.length })}</Text>
              </View>
            </View>
          </View>
        )}

        <View className='stat-row'>
          <View className='stat-item'>
            <Text className='stat-label'>{t('tpay.stSucceeded')}</Text>
            <Text className='stat-value'>{t('common.countBi', { n: paidCount })}</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-label'>{t('tpay.stPending')}</Text>
            <Text className='stat-value'>{t('common.countBi', { n: pending.length })}</Text>
          </View>
        </View>

        <View className='section-title'>
          <Text>{t('tpay.records')}</Text>
        </View>

        <ScrollView scrollY className='pay-list'>
          {loading && payments.length === 0 && (
            <View className='empty-state'>
              <Text>{t('common.loading')}</Text>
            </View>
          )}
          {!loading && payments.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('money', 80)} />
              <Text>{t('tpay.noBills')}</Text>
            </View>
          )}
          {payments.length > 0 && (
            <View className='pay-card'>
              {payments.map((pay) => {
                const statusInfo = STATUS_MAP[pay.status || 'pending'] || STATUS_MAP.pending
                const isPending = pay.status === 'pending'
                const isSucceeded = pay.status === 'succeeded'
                return (
                  <View key={pay.id} className='pay-item'>
                    <View className='pay-item-main'>
                      <View className='pay-item-left'>
                        <Text className='pay-item-month'>{monthOf(pay, TYPE_MAP, t)}</Text>
                        <Text className='pay-item-amount'>
                          {formatMoney(pay.amount, pay.currency)}
                        </Text>
                      </View>
                      <Text className={`badge pay-item-badge ${STATUS_BADGE[pay.status || 'pending'] || ''}`}>
                        {statusInfo.text}
                      </Text>
                    </View>
                    {!!pay.description && (
                      <Text className='pay-item-desc'>{pay.description}</Text>
                    )}
                    {(isPending || isSucceeded) && (
                      <View className='pay-item-actions'>
                        {isPending && (
                          <View className='pay-chip pay-chip--primary' onClick={() => handlePay(pay)}>
                            <Text className='pay-chip-text'>{t('tpay.goPay')}</Text>
                          </View>
                        )}
                        {isSucceeded && (
                          <View className='pay-chip' onClick={() => handleReceipt(pay)}>
                            <Text className='pay-chip-text'>{t('tpay.viewReceipt')}</Text>
                          </View>
                        )}
                        {isSucceeded && (
                          <View className='pay-chip' onClick={() => handleInvoice(pay)}>
                            <Text className='pay-chip-text'>{t('tpay.invoice')}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )
}