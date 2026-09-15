import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { paymentsApi } from '@/services/api'
import './index.scss'
import { iconStyle } from '@/utils/icons'

interface Payment {
  id: string
  amount?: number
  currency?: string
  payment_type?: string
  status?: string
  due_date?: string
  paid_at?: string
  created_at?: string
  description?: string
  property_id?: string
  lease_id?: string
}

const pickList = (res: any): Payment[] => {
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
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

const fmtMoney = (v?: number, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '฿'
  return `${cur}${Number(v || 0).toLocaleString()}`
}

const fmtDate = (x?: string) => (x ? x.replace('T', ' ').slice(0, 16) : '-')

// 状态元信息：颜色语义交由 CSS.badge 类实现
const statusOf = (p: Payment): { text: string; cls: string } => {
  const status = p.status || ''
  if (status === 'succeeded') return { text: '已支付', cls: 'badge--success' }
  if (status === 'pending') {
    const overdue = !!p.due_date && p.due_date.replace('T', ' ').slice(0, 10) < new Date().toISOString().slice(0, 10)
    return overdue
      ? { text: '已逾期', cls: 'badge--error' }
      : { text: '待支付', cls: 'badge--warning' }
  }
  if (status === 'processing') return { text: '处理中', cls: 'badge--info' }
  if (status === 'failed' || status === 'disputed') return { text: '支付异常', cls: 'badge--error' }
  return { text: '已关闭', cls: 'badge--neutral' }
}

export default function OwnerPaymentsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetch = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await paymentsApi.mine()
      setPayments(pickList(res))
    } catch (e) {
      console.error('[OwnerPayments] 获取付款失败', e)
      setError(true)
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
    fetch()
  })

  const succeeded = payments.filter((p) => p.status === 'succeeded').length

  return (
    <View className='owner-payments-page'>
      <View className='page-container'>
        <View className='summary-header'>
          <Text className='summary-label'>已收款笔数</Text>
          <Text className='summary-amount'>{succeeded}</Text>
        </View>

        <View className='section-title'>
          <Text>付款记录</Text>
        </View>

        {loading && payments.length === 0 && (
          <View className='state state--loading'>
            <View className='state__spinner' />
            <Text className='state__title'>正在加载</Text>
          </View>
        )}

        {!loading && error && payments.length === 0 && (
          <View className='state'>
            <View className='state__icon'>!</View>
            <Text className='state__title'>加载失败</Text>
            <Text className='state__desc'>未能获取付款记录，请重试</Text>
            <View className='state__btn' onClick={fetch} hoverClass='state__btn--hover'>
              <Text>重新加载</Text>
            </View>
          </View>
        )}

        {!loading && !error && payments.length === 0 && (
          <View className='state'>
            <View className='state__icon icon-svg' style={iconStyle('card')} />
            <Text className='state__title'>暂无付款记录</Text>
            <Text className='state__desc'>收款到账后在此展示</Text>
          </View>
        )}

        {!loading && payments.length > 0 && (
          <View className='pay-list'>
            {payments.map((p) => {
              const st = statusOf(p)
              const related = p.property_id
                ? `房号 ${String(p.property_id).slice(0, 6).toUpperCase()}`
                : p.lease_id
                  ? `租约 ${String(p.lease_id).slice(0, 6).toUpperCase()}`
                  : '关联收支'
              return (
                <View key={p.id} className='pay-card'>
                  <View className='pay-card__head'>
                    <View className='pay-card__type-wrap'>
                      <Text className='pay-card__type'>
                        {TYPE_MAP[p.payment_type || ''] || p.payment_type || '账单'}
                      </Text>
                      <Text className='pay-card__related'>{related}</Text>
                    </View>
                    <View className={`badge ${st.cls}`}>
                      <Text>{st.text}</Text>
                    </View>
                  </View>
                  {!!p.description && (
                    <Text className='pay-card__desc'>{p.description}</Text>
                  )}
                  <Text className='pay-card__amount'>{fmtMoney(p.amount, p.currency)}</Text>
                  <Text className='pay-card__time'>
                    截止 {fmtDate(p.due_date)} · 到账 {fmtDate(p.paid_at ?? p.created_at)}
                  </Text>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </View>
  )
}