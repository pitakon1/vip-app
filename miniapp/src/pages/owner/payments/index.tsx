import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi, paymentsApi } from '@/services/api'
import { fmtMoney as money } from '@/utils/format'
import './index.scss'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'

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

interface OwnerProp {
  id?: string | number
  room_number?: string
  display_name?: string
  address?: string
}

const pickList = (res: any): any[] => {
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

const TYPE_META: Record<string, { label: string; icon: IconKey }> = {
  rent: { label: '租金', icon: 'home' },
  deposit: { label: '押金', icon: 'bank' },
  commission: { label: '佣金', icon: 'money' },
  service_fee: { label: '服务费', icon: 'gear' },
  utility: { label: '物业费', icon: 'card' },
  tax: { label: '税费', icon: 'doc' },
  refund: { label: '退款', icon: 'money' }
}

// 缴费渠道（与后端 PaymentChannel 一致）
const CHANNELS: Array<{ channel: string; label: string }> = [
  { channel: 'promptpay', label: 'PromptPay QR' },
  { channel: 'bank_transfer', label: '银行转账' },
  { channel: 'stripe', label: '信用卡 / Stripe' },
  { channel: 'wechat', label: '微信支付' }
]

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'unpaid', label: '待缴' },
  { key: 'paid', label: '已缴' },
  { key: 'overdue', label: '逾期' }
]

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '—')

const todayStr = () => new Date().toISOString().slice(0, 10)

const isOverdue = (p: Payment) => {
  if (p.status === 'expired') return true
  if (p.status !== 'pending') return false
  const due = p.due_date ? String(p.due_date).replace('T', ' ').slice(0, 10) : ''
  return !!due && due < todayStr()
}

const isUnpaid = (p: Payment) =>
  ['pending', 'processing', 'expired'].includes(String(p.status || ''))

// 状态元信息：颜色语义交由 SCSS 徽章/图标类实现
const statusOf = (p: Payment): { text: string; cls: string } => {
  if (p.status === 'succeeded') return { text: '已缴', cls: 'success' }
  if (isOverdue(p)) return { text: '逾期', cls: 'error' }
  if (p.status === 'pending') return { text: '待缴', cls: 'warning' }
  if (p.status === 'processing') return { text: '处理中', cls: 'info' }
  if (p.status === 'failed' || p.status === 'disputed') return { text: '支付异常', cls: 'error' }
  return { text: '已关闭', cls: 'neutral' }
}

export default function OwnerPaymentsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [payments, setPayments] = useState<Payment[]>([])
  const [properties, setProperties] = useState<OwnerProp[]>([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [paying, setPaying] = useState<string | null>(null)

  const fetch = async () => {
    setLoading(true)
    setError(false)
    try {
      const [payRes, propRes]: [any, any] = await Promise.all([
        paymentsApi.mine(),
        ownerApi.properties().catch(() => null)
      ])
      setPayments(pickList(payRes) as Payment[])
      setProperties(pickList(propRes) as OwnerProp[])
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

  const propertyName = (id?: string) => {
    if (!id) return ''
    const p = properties.find((x) => String(x.id) === String(id))
    return p?.display_name || p?.room_number || p?.address || ''
  }

  const thisMonth = new Date().toISOString().slice(0, 7)
  const pendingAmount = payments
    .filter(isUnpaid)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const monthPaid = payments
    .filter((p) => p.status === 'succeeded' && String(p.paid_at || '').slice(0, 7) === thisMonth)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const utilityAmount = payments
    .filter((p) => p.payment_type === 'utility')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)

  const filtered = payments.filter((p) => {
    if (activeFilter === 'unpaid') return isUnpaid(p)
    if (activeFilter === 'paid') return p.status === 'succeeded'
    if (activeFilter === 'overdue') return isOverdue(p)
    return true
  })

  const handlePay = (p: Payment) => {
    Taro.showActionSheet({
      itemList: CHANNELS.map((c) => c.label),
      success: async (res) => {
        const ch = CHANNELS[res.tapIndex]
        setPaying(p.id)
        Taro.showLoading({ title: '发起支付...', mask: true })
        try {
          const r: any = await paymentsApi.pay(p.id, { channel: ch.channel })
          const d: any = r?.data ?? r ?? {}
          Taro.hideLoading()
          Taro.showModal({
            title: '支付已发起',
            content:
              d.checkout_url || d.qr_code || d.qr_url
                ? `${ch.label}｜${d.checkout_url || d.qr_url || d.qr_code}`
                : `${ch.label} 支付已发起，请按渠道提示完成付款。`,
            showCancel: false
          })
          fetch()
        } catch (e) {
          console.error('[OwnerPayments] 发起支付失败', e)
          Taro.hideLoading()
          Taro.showToast({ title: '发起支付失败，请重试', icon: 'none' })
        } finally {
          setPaying(null)
        }
      }
    })
  }

  return (
    <View className='owner-payments-page'>
      <View className='page-container'>
        {/* 账单摘要（渐变卡） */}
        <View className='summary-header'>
          <Text className='summary-label'>待缴总额</Text>
          <Text className='summary-amount'>{money(pendingAmount)}</Text>
          <View className='summary-divider' />
          <View className='summary-stats'>
            <View className='summary-stat'>
              <Text className='summary-stat__label'>本月已缴</Text>
              <Text className='summary-stat__value'>{money(monthPaid)}</Text>
            </View>
            <View className='summary-stat summary-stat--right'>
              <Text className='summary-stat__label'>物业费</Text>
              <Text className='summary-stat__value'>{money(utilityAmount)}</Text>
            </View>
          </View>
        </View>

        {/* 筛选 */}
        <View className='chips'>
          {FILTERS.map((f) => (
            <View
              key={f.key}
              className={`chips__item ${activeFilter === f.key ? 'chips__item--active' : ''}`}
              onClick={() => setActiveFilter(f.key)}
            >
              <Text>{f.label}</Text>
            </View>
          ))}
        </View>

        <View className='section-title'>
          <Text>账单列表</Text>
          <Text className='section-hint'>{filtered.length} 笔</Text>
        </View>

        {loading && payments.length === 0 && (
          <View className='empty-tip'>
            <Text>加载中...</Text>
          </View>
        )}

        {!loading && error && payments.length === 0 && (
          <View className='empty-tip'>
            <Text>加载失败，请重试</Text>
            <View className='retry-btn' onClick={fetch} hoverClass='retry-btn--hover'>
              <Text>重新加载</Text>
            </View>
          </View>
        )}

        {!loading && !error && filtered.length === 0 && (
          <View className='empty-tip'>
            <View className='empty-tip__icon icon-svg' style={iconStyle('card', 48)} />
            <Text>{payments.length === 0 ? '暂无账单记录' : '该筛选下暂无账单'}</Text>
          </View>
        )}

        {!loading && filtered.length > 0 && (
          <View className='bill-list'>
            {filtered.map((p) => {
              const meta = TYPE_META[p.payment_type || ''] || { label: '账单', icon: 'card' as IconKey }
              const st = statusOf(p)
              const overdue = isOverdue(p)
              const unpaid = isUnpaid(p)
              return (
                <View key={p.id} className='bill'>
                  <View className='bill__head'>
                    <View className={`bill__icon bill__icon--${st.cls}`}>
                      <View className='icon-svg' style={iconStyle(meta.icon, 40)} />
                    </View>
                    <View className='bill__title-wrap'>
                      <View className='bill__title-row'>
                        <Text className='bill__title'>{meta.label}</Text>
                        <Text className={`bill__badge bill__badge--${st.cls}`}>{st.text}</Text>
                      </View>
                      <Text className='bill__meta'>
                        {[propertyName(p.property_id) || '关联房源', `到期 ${fmtDate(p.due_date)}`].join(' · ')}
                      </Text>
                    </View>
                  </View>
                  {!!p.description && <Text className='bill__desc'>{p.description}</Text>}
                  <View className='bill__foot'>
                    <Text className='bill__amount'>{money(p.amount, p.currency)}</Text>
                    {unpaid ? (
                      <View
                        className={`bill__btn ${overdue ? 'bill__btn--danger' : ''}`}
                        hoverClass='bill__btn--hover'
                        onClick={() => handlePay(p)}
                      >
                        <Text>{paying === p.id ? '处理中...' : overdue ? '逾期缴费' : '立即缴费'}</Text>
                      </View>
                    ) : (
                      <View className='bill__btn bill__btn--done'>
                        <Text>已缴清</Text>
                      </View>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      <BottomNav role='owner' active='dashboard' />
    </View>
  )
}