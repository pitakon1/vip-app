import { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { dashboardApi } from '@/services/api'
import { request } from '@/lib/api'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface PaymentItem {
  id: string
  payer_id?: string
  payee_id?: string
  amount?: number
  currency?: string
  payment_type?: string
  status?: string
  channel?: string
  due_date?: string
  paid_at?: string
  created_at?: string
  description?: string
  [key: string]: any
}

const STATUS_META: Record<string, { text: string; badge: string }> = {
  succeeded: { text: '已收', badge: 'badge--success' },
  pending: { text: '待收', badge: 'badge--info' },
  processing: { text: '处理中', badge: 'badge--info' },
  failed: { text: '失败', badge: 'badge--error' },
  refunded: { text: '已退款', badge: 'badge--neutral' },
  disputed: { text: '争议', badge: 'badge--error' },
  expired: { text: '已过期', badge: 'badge--neutral' }
}

const TYPE_LABELS: Record<string, string> = {
  rent: '租金',
  deposit: '押金',
  commission: '佣金',
  service_fee: '服务费',
  utility: '水电',
  tax: '税费',
  refund: '退款'
}

const CHANNEL_LABELS: Record<string, string> = {
  promptpay: 'PromptPay',
  stripe: 'Stripe',
  wechat: '微信支付',
  alipay: '支付宝',
  wise: 'Wise',
  paypal: 'PayPal',
  bank_transfer: '银行转账'
}

// 渠道 → 图标键 + 配色（用于左侧圆角图标容器）
const CHANNEL_META: Record<string, { icon: IconKey; tone: string }> = {
  promptpay: { icon: 'card', tone: 'primary' },
  stripe: { icon: 'card', tone: 'info' },
  wechat: { icon: 'wechat', tone: 'success' },
  alipay: { icon: 'alipay', tone: 'info' },
  wise: { icon: 'bank', tone: 'warning' },
  paypal: { icon: 'bank', tone: 'info' },
  bank_transfer: { icon: 'bank', tone: 'warning' }
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'succeeded', label: '已收款' },
  { key: 'pending', label: '待收款' },
  { key: 'overdue', label: '逾期' },
  { key: 'refunded', label: '已退款' }
]

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  THB: '฿',
  EUR: '€',
  USD: '$'
}

const PAGE_SIZE = 100

const fmtMoney = (v?: number, currency?: string) =>
  `${CURRENCY_SYMBOL[currency || 'THB'] || ''}${Number(v || 0).toLocaleString()}`

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-')

// 逾期判定：待收且已过缴费截止日
const isOverdue = (p: PaymentItem) =>
  p.status === 'pending' && !!p.due_date && new Date(p.due_date).getTime() < Date.now()

export default function AdminPaymentsPage() {
  const [list, setList] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  // 付款人姓名：仅 /dashboard/recent-payments 附带，按 id 合并展示
  const [payerMap, setPayerMap] = useState<Record<string, string>>({})

  const fetchList = async () => {
    setLoading(true)
    try {
      const res: any = await request({
        url: '/payments',
        method: 'GET',
        data: { page: 1, page_size: PAGE_SIZE }
      })
      const d = res?.data ?? res
      setList(Array.isArray(d) ? d : d?.items || [])
    } catch (error) {
      console.error('[AdminPayments] 获取收款列表失败', error)
      Taro.showToast({ title: '加载收款失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchPayerNames = async () => {
    try {
      const res: any = await dashboardApi.recentPayments()
      const d = res?.data ?? res
      const items: any[] = d?.items || (Array.isArray(d) ? d : [])
      const map: Record<string, string> = {}
      items.forEach((p) => {
        if (p.id && p.payer_name) map[String(p.id)] = p.payer_name
      })
      setPayerMap(map)
    } catch (error) {
      console.error('[AdminPayments] 获取付款人姓名失败', error)
    }
  }

  useDidShow(() => {
    fetchList()
    fetchPayerNames()
  })

  const visible = useMemo(() => {
    if (!filter) return list
    if (filter === 'overdue') return list.filter(isOverdue)
    return list.filter((p) => p.status === filter)
  }, [list, filter])

  // 收入汇总：按已加载收款单实时计算
  const summary = useMemo(() => {
    const now = new Date()
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    let monthIncome = 0
    let received = 0
    let pending = 0
    list.forEach((p) => {
      const amount = Number(p.amount || 0)
      if (p.status === 'succeeded') {
        received += amount
        if (String(p.paid_at || '').startsWith(monthPrefix)) monthIncome += amount
      } else if (p.status === 'pending' || p.status === 'processing') {
        pending += amount
      }
    })
    const rate = received + pending > 0 ? Math.round((received / (received + pending)) * 100) : 0
    return { monthIncome, received, pending, rate }
  }, [list])

  const currency = list[0]?.currency || 'THB'

  return (
    <View className='apay-page'>
      <ScrollView scrollY className='apay-scroll'>
        {/* 收入汇总大卡 */}
        <View className='apay-hero'>
          <View className='apay-hero__top'>
            <View className='apay-hero__left'>
              <Text className='apay-hero__label'>本月总收入</Text>
              <Text className='apay-hero__value'>{fmtMoney(summary.monthIncome, currency)}</Text>
            </View>
            <View className='apay-hero__icon'>
              <View className='icon-svg icon-svg--lg' style={iconStyle('money', 56)} />
            </View>
          </View>

          <View className='apay-hero__split'>
            <View className='apay-hero__cell'>
              <Text className='apay-hero__cell-label'>已收</Text>
              <Text className='apay-hero__cell-value'>{fmtMoney(summary.received, currency)}</Text>
            </View>
            <View className='apay-hero__divider' />
            <View className='apay-hero__cell'>
              <Text className='apay-hero__cell-label'>待收</Text>
              <Text className='apay-hero__cell-value'>{fmtMoney(summary.pending, currency)}</Text>
            </View>
          </View>

          <View className='apay-hero__rate'>
            <View className='apay-hero__rate-head'>
              <Text className='apay-hero__rate-label'>收缴率</Text>
              <Text className='apay-hero__rate-value'>{summary.rate}%</Text>
            </View>
            <View className='apay-hero__bar'>
              <View className='apay-hero__bar-fill' style={{ width: `${summary.rate}%` }} />
            </View>
          </View>
        </View>

        {/* 状态筛选 */}
        <ScrollView scrollX className='apay-chips'>
          {FILTERS.map((f) => (
            <View
              key={f.key || 'all'}
              className={`apay-chip ${filter === f.key ? 'apay-chip--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              <Text className='apay-chip__text'>{f.label}</Text>
            </View>
          ))}
        </ScrollView>

        <View className='apay-section-head'>
          <Text className='apay-section-head__title'>交易记录</Text>
          <Text className='apay-section-head__count'>共 {visible.length} 笔</Text>
        </View>

        {loading && visible.length === 0 && (
          <View className='apay-state'>
            <Text className='apay-state__text'>加载中...</Text>
          </View>
        )}
        {!loading && visible.length === 0 && (
          <View className='apay-state'>
            <View className='icon-svg' style={iconStyle('card', 72)} />
            <Text className='apay-state__text'>暂无交易记录</Text>
            <Text className='apay-state__desc'>换个筛选条件试试</Text>
          </View>
        )}

        {visible.map((p) => {
          const meta = CHANNEL_META[p.channel || ''] || { icon: 'card' as IconKey, tone: 'neutral' }
          const status = STATUS_META[p.status || ''] || {
            text: p.status || '-',
            badge: 'badge--neutral'
          }
          const overdue = isOverdue(p)
          const payerName =
            payerMap[String(p.id)] || `付款方 ${String(p.payer_id || '').slice(0, 8)}`
          return (
            <View key={p.id} className='apay-item'>
              <View className={`apay-item__icon apay-item__icon--${meta.tone}`}>
                <View className='icon-svg' style={iconStyle(meta.icon, 40)} />
              </View>

              <View className='apay-item__body'>
                <Text className='apay-item__name'>{payerName}</Text>
                <Text className='apay-item__meta'>
                  {TYPE_LABELS[p.payment_type || ''] || p.payment_type || '收款'} ·{' '}
                  {CHANNEL_LABELS[p.channel || ''] || '未指定渠道'} · {fmtDate(p.created_at)}
                </Text>
              </View>

              <View className='apay-item__right'>
                <Text className='apay-item__amount'>{fmtMoney(p.amount, p.currency)}</Text>
                <Text className={`badge ${overdue ? 'badge--error' : status.badge}`}>
                  {overdue ? '逾期' : status.text}
                </Text>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* 底部导航：收款 */}
      <BottomNav role='admin' active='payments' />
    </View>
  )
}