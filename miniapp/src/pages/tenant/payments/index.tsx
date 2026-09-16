import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { paymentsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import './index.scss'

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

const TYPE_MAP: Record<string, string> = {
  rent: '租金',
  deposit: '押金',
  commission: '佣金',
  service_fee: '服务费',
  utility: '物业费',
  tax: '税费',
  refund: '退款'
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'var(--warning)' },
  processing: { text: '处理中', color: 'var(--primary)' },
  succeeded: { text: '已支付', color: 'var(--success)' },
  failed: { text: '支付失败', color: 'var(--error)' },
  refunded: { text: '已退款', color: 'var(--info)' },
  disputed: { text: '有争议', color: 'var(--error)' },
  expired: { text: '已过期', color: 'var(--ink-3)' }
}

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
const monthOf = (p: Payment) => {
  const raw = p.due_date || p.paid_at
  if (!raw) return TYPE_MAP[p.payment_type || ''] || '账单'
  const seg = String(raw).slice(0, 7).split('-')
  if (seg.length < 2) return String(raw)
  return `${seg[0]}年${Number(seg[1])}月`
}

function pickList(res: any): Payment[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatMoney = (v?: number, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '฿'
  return `${cur}${Number(v || 0).toLocaleString()}`
}

const formatDate = (x?: string) => (x ? x.replace('T', ' ').slice(0, 16) : '—')

export default function TenantPaymentsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(false)

  const fetchPayments = async () => {
    setLoading(true)
    try {
      const res = await paymentsApi.mine()
      setPayments(pickList(res))
    } catch (error) {
      console.error('[Payments] 获取账单失败', error)
      Taro.showToast({ title: '加载账单失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchPayments()
  })

  const pending = payments.filter((p) => p.status === 'pending')
  const dueTotal = pending.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const currency = pending[0]?.currency || payments[0]?.currency || 'THB'
  const uploadedCount = payments.filter((p) => !!p.paid_at).length
  const reviewingCount = payments.filter((p) => p.status === 'processing').length

  const goUploadVoucher = () => {
    Taro.navigateTo({ url: '/pages/tenant/documents/index' })
  }

  const channelFor = (cur?: string) =>
    cur === 'CNY' ? 'wechat' : cur === 'USD' ? 'stripe' : 'promptpay'

  const handlePay = async (pay: Payment) => {
    Taro.showLoading({ title: '处理中...', mask: true })
    try {
      const res: any = await paymentsApi.pay(pay.id, { channel: channelFor(pay.currency) })
      Taro.hideLoading()
      const data = res?.data || res
      const checkoutUrl = data?.checkout_url ?? data?.qr_code ?? data?.qr ?? data?.url
      setPayments((list) =>
        list.map((p) => (p.id === pay.id ? { ...p, status: 'processing' } : p))
      )
      if (checkoutUrl) {
        Taro.showModal({
          title: '发起支付',
          content: `支付链接已生成，请完成支付：\n${checkoutUrl}`,
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        Taro.showToast({ title: '支付单已提交', icon: 'success' })
      }
    } catch (error) {
      Taro.hideLoading()
      console.error('[Payments] 发起支付失败', error)
      Taro.showToast({ title: '支付失败', icon: 'none' })
    }
  }

  const handleReceipt = async (pay: Payment) => {
    try {
      const res: any = await paymentsApi.receipt(pay.id)
      const r = res?.data || res
      const content = [
        `单号：${(r.reference_no || pay.id).slice(0, 16)}`,
        `金额：${formatMoney(r.amount ?? pay.amount, r.currency ?? pay.currency)}`,
        `类型：${TYPE_MAP[r.payment_type || ''] || r.payment_type || '-'}`,
        `渠道：${r.channel || '-'}${r.channel_transaction_id ? `（${r.channel_transaction_id}）` : ''}`,
        `支付时间：${formatDate(r.paid_at ?? pay.paid_at)}`
      ].join('\n')
      Taro.showModal({ title: '缴费凭证', content, showCancel: false, confirmText: '知道了' })
    } catch (error) {
      console.error('[Payments] 获取凭证失败', error)
      Taro.showToast({ title: '获取凭证失败', icon: 'none' })
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
        `发票号：${inv.invoice_no || '-'}`,
        `价税合计：${cur}${total.toLocaleString()}`,
        `不含税额：${cur}${net.toLocaleString()}`,
        `税额：${cur}${tax.toLocaleString()}（税率 ${Number(inv.vat_rate || 0) * 100}%）`,
        `支付渠道：${inv.channel || '-'}`,
        `开票时间：${formatDate(inv.paid_at ?? pay.paid_at)}`
      ].join('\n')
      Taro.showModal({ title: '电子发票', content, showCancel: false, confirmText: '知道了' })
    } catch (error) {
      console.error('[Payments] 获取发票失败', error)
      Taro.showToast({ title: '获取发票失败', icon: 'none' })
    }
  }

  return (
    <View className='tenant-payments-page'>
      <View className='page-container'>
        {pending.length > 0 && (
          <View className='pay-banner'>
            <Text className='pay-banner-label'>本月租金</Text>
            <Text className='pay-banner-amount'>{formatMoney(dueTotal, currency)}</Text>
            <View className='pay-banner-badges'>
              <Text className='pay-banner-badge'>待支付</Text>
            </View>
            <View className='pay-banner-cta' onClick={goUploadVoucher}>
              <Text className='pay-banner-cta-text'>上传凭证</Text>
            </View>
            <View className='pay-banner-actions'>
              <View className='pay-banner-btn pay-banner-btn--ghost' onClick={() => handlePay(pending[0])}>
                <Text className='pay-banner-btn-text'>立即缴费（共 {pending.length} 笔）</Text>
              </View>
            </View>
          </View>
        )}

        <View className='stat-row'>
          <View className='stat-item'>
            <Text className='stat-label'>已上传</Text>
            <Text className='stat-value'>{uploadedCount} 张</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-label'>待审核</Text>
            <Text className='stat-value'>{reviewingCount} 笔</Text>
          </View>
        </View>

        <View className='section-title'>
          <Text>付款记录</Text>
        </View>

        <ScrollView scrollY className='pay-list'>
          {loading && payments.length === 0 && (
            <View className='empty-state'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && payments.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('money', 80)} />
              <Text>暂无账单</Text>
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
                        <Text className='pay-item-month'>{monthOf(pay)}</Text>
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
                            <Text className='pay-chip-text'>去支付</Text>
                          </View>
                        )}
                        {isSucceeded && (
                          <View className='pay-chip' onClick={() => handleReceipt(pay)}>
                            <Text className='pay-chip-text'>查看凭证</Text>
                          </View>
                        )}
                        {isSucceeded && (
                          <View className='pay-chip' onClick={() => handleInvoice(pay)}>
                            <Text className='pay-chip-text'>开发票</Text>
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

      <View className='pay-fab' onClick={goUploadVoucher}>
        <Text className='pay-fab-text'>上传</Text>
      </View>
    </View>
  )
}