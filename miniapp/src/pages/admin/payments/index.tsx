import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { dashboardApi, paymentsApi } from '@/services/api'
import { fmtMoney } from '@/utils/format'
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

// 手动记账：可选币种 / 类型 / 渠道（对齐后端枚举与收款页文案）
const CURRENCY_OPTIONS: string[] = ['THB', 'CNY', 'EUR']
const TYPE_OPTIONS: string[] = ['rent', 'deposit', 'commission', 'service_fee', 'utility', 'tax', 'refund']
const CHANNEL_OPTIONS: string[] = ['promptpay', 'stripe', 'wechat', 'alipay', 'wise', 'paypal', 'bank_transfer']

const PAGE_SIZE = 100

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

  // 手动记账弹层
  const [showCreate, setShowCreate] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [form, setForm] = useState<{
    amount: string
    currency: string
    payment_type: string
    channel: string
    due_date: string
    payer_id: string
    description: string
  }>({ amount: '', currency: 'THB', payment_type: 'rent', channel: '', due_date: '', payer_id: '', description: '' })
  const setFormField = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  // 「确认到账」note 弹层
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null)
  const [note, setNote] = useState('')

  // 详情弹层
  const [detail, setDetail] = useState<PaymentItem | null>(null)

  const openCreate = () => {
    setForm({ amount: '', currency: 'THB', payment_type: 'rent', channel: '', due_date: '', payer_id: '', description: '' })
    setShowCreate(true)
  }

  const closeCreate = () => setShowCreate(false)

  const submitCreate = async () => {
    if (!form.amount || Number(form.amount) <= 0)
      return Taro.showToast({ title: '请输入正确的金额', icon: 'none' })
    setCreateBusy(true)
    try {
      const payload: Record<string, unknown> = {
        amount: Number(form.amount),
        currency: form.currency,
        payment_type: form.payment_type
      }
      if (form.channel) payload.channel = form.channel
      if (form.due_date) payload.due_date = `${form.due_date}T00:00:00`
      if (form.description) payload.description = form.description
      if (form.payer_id) payload.payer_id = form.payer_id
      await paymentsApi.create(payload)
      Taro.showToast({ title: '已记账', icon: 'success' })
      closeCreate()
      fetchList()
      fetchPayerNames()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '记账失败', icon: 'none' })
    } finally {
      setCreateBusy(false)
    }
  }

  const openConfirm = (p: PaymentItem) => {
    setConfirmTarget({ id: p.id, name: payerMap[String(p.id)] || '该收款' })
    setNote('')
  }

  const runConfirm = async () => {
    if (!confirmTarget) return
    try {
      await paymentsApi.confirm(confirmTarget.id, { note: note.trim() || undefined })
      Taro.showToast({ title: '已确认到账', icon: 'success' })
      setConfirmTarget(null)
      fetchList()
      fetchPayerNames()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '确认失败', icon: 'none' })
    }
  }

  const openDetail = async (p: PaymentItem) => {
    try {
      const res: any = await paymentsApi.get(p.id)
      setDetail(res?.data ?? res ?? p)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '获取详情失败', icon: 'none' })
    }
  }

  const pickOption = (
    options: string[],
    labels: Record<string, string>,
    onPick: (v: string) => void
  ) =>
    Taro.showActionSheet({ itemList: options.map((o) => labels[o] || o) }).then((r) => {
      const opt = options[r.tapIndex]
      if (opt) onPick(opt)
    }).catch(() => {})

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
          <View className='apay-section-head__right'>
            <Text className='apay-section-head__count'>共 {visible.length} 笔</Text>
            <View className='apay-addbox' onClick={openCreate}>
              <Text className='apay-addbox__text'>+ 手动记账</Text>
            </View>
          </View>
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
              <View className='apay-item__row'>
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

              <View className='apay-item__actions'>
                {(p.status === 'pending' || p.status === 'processing') && (
                  <View className='apay-act apay-act--primary' onClick={() => openConfirm(p)}>
                    确认到账
                  </View>
                )}
                <View className='apay-act' onClick={() => openDetail(p)}>查看详情</View>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* 手动记账弹层 */}
      {showCreate && (
        <>
          <View className='apay-mask' onClick={closeCreate} />
          <View className='apay-sheet'>
            <Text className='apay-sheet__title'>手动记账</Text>

            <View className='apay-field'>
              <Text className='apay-field__label apay-field__label--req'>金额</Text>
              <Input
                className='apay-field__input'
                type='digit'
                value={form.amount}
                placeholder='请输入金额'
                onInput={(e) => setFormField('amount', e.detail.value)}
              />
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label apay-field__label--req'>币种</Text>
              <View
                className='apay-field__select'
                onClick={() => pickOption(CURRENCY_OPTIONS, CURRENCY_SYMBOL, (v) => setFormField('currency', v))}
              >
                <Text>{CURRENCY_SYMBOL[form.currency] || ''} {form.currency}</Text>
                <Text className='apay-field__tag'>▾</Text>
              </View>
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label apay-field__label--req'>类型</Text>
              <View
                className='apay-field__select'
                onClick={() => pickOption(TYPE_OPTIONS, TYPE_LABELS, (v) => setFormField('payment_type', v))}
              >
                <Text>{TYPE_LABELS[form.payment_type] || form.payment_type}</Text>
                <Text className='apay-field__tag'>▾</Text>
              </View>
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label'>收款渠道</Text>
              <View
                className='apay-field__select'
                onClick={() => pickOption(CHANNEL_OPTIONS, CHANNEL_LABELS, (v) => setFormField('channel', v))}
              >
                <Text className={form.channel ? '' : 'apay-field__select--placeholder'}>
                  {form.channel ? CHANNEL_LABELS[form.channel] : '请选择渠道'}
                </Text>
                <Text className='apay-field__tag'>▾</Text>
              </View>
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label'>应付日期</Text>
              <Input
                className='apay-field__input'
                type='text'
                value={form.due_date}
                placeholder='YYYY-MM-DD'
                onInput={(e) => setFormField('due_date', e.detail.value)}
              />
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label'>付款人ID（选填）</Text>
              <Input
                className='apay-field__input'
                type='text'
                value={form.payer_id}
                placeholder='后端要求，用于指定 payer'
                onInput={(e) => setFormField('payer_id', e.detail.value)}
              />
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label'>备注</Text>
              <Input
                className='apay-field__input'
                value={form.description}
                placeholder='交易备注（选填）'
                onInput={(e) => setFormField('description', e.detail.value)}
              />
            </View>

            <View className='apay-submit' onClick={submitCreate}>
              {createBusy ? '提交中...' : '保存'}
            </View>
          </View>
        </>
      )}

      {/* 确认到账弹层 */}
      {confirmTarget && (
        <>
          <View className='apay-mask' onClick={() => setConfirmTarget(null)} />
          <View className='apay-sheet'>
            <Text className='apay-sheet__title'>确认到账</Text>
            <Text className='apay-sheet__desc'>确认「{confirmTarget.name}」已收到款项？</Text>
            <View className='apay-field'>
              <Text className='apay-field__label'>到账备注（选填）</Text>
              <Input
                className='apay-field__input'
                value={note}
                placeholder='填写备注，将追加到该笔记录'
                onInput={(e) => setNote(e.detail.value)}
              />
            </View>
            <View className='apay-submit' onClick={runConfirm}>确认到账</View>
          </View>
        </>
      )}

      {/* 详情弹层 */}
      {detail && (
        <>
          <View className='apay-mask' onClick={() => setDetail(null)} />
          <View className='apay-sheet'>
            <Text className='apay-sheet__title'>收款详情</Text>
            <View className='apay-detail'>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>金额</Text>
                <Text className='apay-detail__v'>{fmtMoney(detail.amount, detail.currency)}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>类型</Text>
                <Text className='apay-detail__v'>{TYPE_LABELS[detail.payment_type || ''] || detail.payment_type || '-'}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>渠道</Text>
                <Text className='apay-detail__v'>{CHANNEL_LABELS[detail.channel || ''] || detail.channel || '-'}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>状态</Text>
                <Text className='apay-detail__v'>{(STATUS_META[detail.status || ''] || {}).text || detail.status || '-'}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>应付日期</Text>
                <Text className='apay-detail__v'>{fmtDate(detail.due_date)}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>实收日期</Text>
                <Text className='apay-detail__v'>{fmtDate(detail.paid_at)}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>付款人ID</Text>
                <Text className='apay-detail__v'>{detail.payer_id || '-'}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>备注</Text>
                <Text className='apay-detail__v'>{detail.description || '-'}</Text>
              </View>
            </View>
            <View className='apay-submit' onClick={() => setDetail(null)}>关闭</View>
          </View>
        </>
      )}

      {/* 底部导航：收款 */}
      <BottomNav role='admin' active='payments' />
    </View>
  )
}