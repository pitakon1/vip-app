import { LIST_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination'
import { useCallback, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { dashboardApi, paymentsApi } from '@/services/api'
import { fmtMoney } from '@/utils/format'
import { request } from '@/lib/api'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import StatusTop from '@/components/StatusTop'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'
import { errorText } from '@/lib/errorText'

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
  succeeded: { text: 'pay.stSucceeded', badge: 'badge--success' },
  pending: { text: 'pay.stPending', badge: 'badge--info' },
  processing: { text: 'pay.stProcessing', badge: 'badge--info' },
  failed: { text: 'pay.stFailed', badge: 'badge--error' },
  refunded: { text: 'pay.stRefunded', badge: 'badge--neutral' },
  disputed: { text: 'pay.stDisputed', badge: 'badge--error' },
  expired: { text: 'pay.stExpired', badge: 'badge--neutral' }
}

const TYPE_LABELS: Record<string, string> = {
  rent: 'pay.typeRent',
  deposit: 'pay.typeDeposit',
  commission: 'pay.typeCommission',
  service_fee: 'pay.typeServiceFee',
  utility: 'pay.typeUtility',
  tax: 'pay.typeTax',
  refund: 'pay.typeRefund'
}

const CHANNEL_LABELS: Record<string, string> = {
  promptpay: 'PromptPay',
  stripe: 'Stripe',
  wechat: 'pay.chWechat',
  alipay: 'pay.chAlipay',
  wise: 'Wise',
  paypal: 'PayPal',
  bank_transfer: 'pay.chBankTransfer'
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
  { key: '', label: 'common.all' },
  { key: 'succeeded', label: 'pay.filterSucceeded' },
  { key: 'pending', label: 'pay.filterPending' },
  { key: 'overdue', label: 'pay.filterOverdue' },
  { key: 'refunded', label: 'pay.filterRefunded' }
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

const PAGE_SIZE = LIST_PAGE_SIZE

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-')

// 逾期判定：未结清（pending / processing）且已过缴费截止日，与后端 overdue 派生状态同源
const isOverdue = (p: PaymentItem) =>
  (p.status === 'pending' || p.status === 'processing') &&
  !!p.due_date &&
  new Date(p.due_date).getTime() < Date.now()

export default function AdminPaymentsPage() {
  const { t } = useI18n()
  const [list, setList] = useState<PaymentItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState('')
  // 分页
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // 付款人姓名：仅 /dashboard/recent-payments 附带，按 id 合并展示
  const [payerMap, setPayerMap] = useState<Record<string, string>>({})
  // 收入汇总：来自 /payments/summary（服务端全量聚合，不受分页与状态筛选影响）
  const [summary, setSummary] = useState({
    monthIncome: 0,
    received: 0,
    pending: 0,
    rate: 0
  })

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
      return Taro.showToast({ title: t('pay.amountInvalid'), icon: 'none' })
    // 后端 PaymentCreate.payer_id 必填；此前表单标「选填」且空值不发送，
    // 提交后只拿到 422，toast 笼统显示「记账失败」，用户无法定位字段。
    if (!form.payer_id.trim())
      return Taro.showToast({ title: t('pay.payerRequired'), icon: 'none' })
    setCreateBusy(true)
    try {
      const payload: Record<string, unknown> = {
        amount: Number(form.amount),
        currency: form.currency,
        payment_type: form.payment_type,
        payer_id: form.payer_id.trim()
      }
      if (form.channel) payload.channel = form.channel
      if (form.due_date) payload.due_date = `${form.due_date}T00:00:00`
      if (form.description) payload.description = form.description
      await paymentsApi.create(payload)
      Taro.showToast({ title: t('pay.recorded'), icon: 'success' })
      closeCreate()
      fetchList()
      fetchPayerNames()
      fetchSummary()
    } catch (e: any) {
      Taro.showToast({ title:errorText(e, t('pay.recordFailed')), icon: 'none' })
    } finally {
      setCreateBusy(false)
    }
  }

  const openConfirm = (p: PaymentItem) => {
    setConfirmTarget({ id: p.id, name: payerMap[String(p.id)] || t('pay.thisPayment') })
    setNote('')
  }

  const runConfirm = async () => {
    if (!confirmTarget) return
    try {
      await paymentsApi.confirm(confirmTarget.id, { note: note.trim() || undefined })
      Taro.showToast({ title: t('pay.confirmed'), icon: 'success' })
      setConfirmTarget(null)
      fetchList()
      fetchPayerNames()
      fetchSummary()
    } catch (e: any) {
      Taro.showToast({ title:errorText(e, t('pay.confirmFailed')), icon: 'none' })
    }
  }

  const openDetail = async (p: PaymentItem) => {
    try {
      const res: any = await paymentsApi.get(p.id)
      setDetail(res?.data ?? res ?? p)
    } catch (e: any) {
      Taro.showToast({ title:errorText(e, t('pay.detailFailed')), icon: 'none' })
    }
  }

  const pickOption = (
    options: string[],
    labels: Record<string, string>,
    onPick: (v: string) => void
  ) =>
    Taro.showActionSheet({ itemList: options.map((o) => (labels[o] ? t(labels[o]) : o)) }).then((r) => {
      const opt = options[r.tapIndex]
      if (opt) onPick(opt)
    }).catch(() => {})

  const fetchList = useCallback(async (pg: number = 1, append: boolean = false, status: string = filter) => {
    if (append && loadingMore) return
    if (!append) { setLoading(true); setLoadError(false); setHasMore(true) }
    else setLoadingMore(true)
    try {
      const params: Record<string, unknown> = { page: pg, page_size: PAGE_SIZE }
      // 状态筛选交给服务端（overdue 为后端派生状态），保证分页后仍正确
      if (status) params.status = status
      const res: any = await request({
        url: '/payments',
        method: 'GET',
        data: params
      })
      const d = res?.data ?? res
      const items: PaymentItem[] = Array.isArray(d) ? d : d?.items || []
      const total = Number(d?.total ?? items.length)
      if (append) {
        setList((prev) => [...prev, ...items])
      } else {
        setList(items)
      }
      setTotal(total)
      setPage(pg)
      // 刷新第 1 页时闭包里的 list.length 是上一批数据，不能拿来判断"还有下一页"
      const loadedCount = append ? list.length + items.length : items.length
      setHasMore(loadedCount < total)
    } catch (error) {
      console.error('[AdminPayments] 获取收款列表失败', error)
      if (!append) {
        setLoadError(true)
        Taro.showToast({ title: t('pay.loadFailed'), icon: 'none' })
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filter, loadingMore, list.length, t])

  const fetchSummary = async () => {
    try {
      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth() + 1
      const pad = (n: number) => String(n).padStart(2, '0')
      const monthStart = `${y}-${pad(m)}-01`
      const monthEnd = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`
      const [allRes, monthRes]: any[] = await Promise.all([
        paymentsApi.summary(),
        paymentsApi.summary({ date_from: monthStart, date_to: monthEnd })
      ])
      const all = allRes?.data ?? allRes
      const mon = monthRes?.data ?? monthRes
      const received = Number(all?.received_amount || 0)
      // 未结清 = 未逾期待收 + 已逾期（与后端 bucket 同源）
      const pending = Number(all?.pending_amount || 0) + Number(all?.overdue_amount || 0)
      const rate = received + pending > 0 ? Math.round((received / (received + pending)) * 100) : 0
      setSummary({ monthIncome: Number(mon?.received_amount || 0), received, pending, rate })
    } catch (error) {
      console.error('[AdminPayments] 获取收入汇总失败', error)
    }
  }

  useReachBottom(() => {
    if (hasMore && !loading && !loadingMore) fetchList(page + 1, true)
  })

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
    fetchSummary()
  })

  // 列表已由服务端按状态筛选，前端不再二次过滤
  const visible = list

  const currency = list[0]?.currency || 'THB'

  return (
    <View className='apay-page'>
      <StatusTop />
      <ScrollView scrollY className='apay-scroll'>
        {/* 收入汇总大卡 */}
        <View className='apay-hero'>
          <View className='apay-hero__top'>
            <View className='apay-hero__left'>
              <Text className='apay-hero__label'>{t('pay.monthIncome')}</Text>
              <Text className='apay-hero__value'>{fmtMoney(summary.monthIncome, currency)}</Text>
            </View>
            <View className='apay-hero__icon'>
              <View className='icon-svg icon-svg--lg' style={iconStyle('money', 56)} />
            </View>
          </View>

          <View className='apay-hero__split'>
            <View className='apay-hero__cell'>
              <Text className='apay-hero__cell-label'>{t('pay.received')}</Text>
              <Text className='apay-hero__cell-value'>{fmtMoney(summary.received, currency)}</Text>
            </View>
            <View className='apay-hero__divider' />
            <View className='apay-hero__cell'>
              <Text className='apay-hero__cell-label'>{t('pay.pendingShort')}</Text>
              <Text className='apay-hero__cell-value'>{fmtMoney(summary.pending, currency)}</Text>
            </View>
          </View>

          <View className='apay-hero__rate'>
            <View className='apay-hero__rate-head'>
              <Text className='apay-hero__rate-label'>{t('pay.collectionRate')}</Text>
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
              onClick={() => {
                setFilter(f.key)
                fetchList(1, false, f.key)
              }}
            >
              <Text className='apay-chip__text'>{t(f.label)}</Text>
            </View>
          ))}
        </ScrollView>

        <View className='apay-section-head'>
          <Text className='apay-section-head__title'>{t('pay.txRecords')}</Text>
          <View className='apay-section-head__right'>
            <Text className='apay-section-head__count'>{t('pay.countUnit', { n: total })}</Text>
            <View className='apay-addbox' onClick={openCreate}>
              <Text className='apay-addbox__text'>{t('pay.manualAdd')}</Text>
            </View>
          </View>
        </View>

        {loading && visible.length === 0 && (
          <StateBlock loading text={t('pub.loading')} />
        )}
        {!loading && loadError && visible.length > 0 && (
          <View className='inline-error-bar' onClick={() => fetchList()}>
            <Text className='inline-error-bar__text'>{t('pay.loadFailed')}</Text>
            <Text className='inline-error-bar__retry'>{t('acc.retry')}</Text>
          </View>
        )}
        {!loading && loadError && list.length === 0 && (
          <StateBlock
            error
            text={t('pay.loadFailed')}
            retryText={t('acc.retry')}
            onRetry={fetchList}
          />
        )}
        {!loading && !loadError && visible.length === 0 && (
          <StateBlock
            empty
            icon='card'
            text={filter ? t('pay.emptyDesc') : t('pay.empty')}
          />
        )}

        {visible.map((p) => {
          const meta = CHANNEL_META[p.channel || ''] || { icon: 'card' as IconKey, tone: 'neutral' }
          const status = STATUS_META[p.status || ''] || {
            text: p.status || '',
            badge: 'badge--neutral'
          }
          const overdue = isOverdue(p)
          const payerName =
            payerMap[String(p.id)] || t('pay.payerUnknown')
          return (
            <View key={p.id} className='apay-item'>
              <View className='apay-item__row'>
                <View className={`apay-item__icon apay-item__icon--${meta.tone}`}>
                  <View className='icon-svg' style={iconStyle(meta.icon, 40)} />
                </View>

                <View className='apay-item__body'>
                  <Text className='apay-item__name'>{payerName}</Text>
                  <Text className='apay-item__meta'>
                    {t(TYPE_LABELS[p.payment_type || ''] || '') || p.payment_type || t('pay.receiptFallback')} ·{' '}
                    {t(CHANNEL_LABELS[p.channel || ''] || '') || t('pay.channelUnset')} ·{' '}
                    {fmtDate(p.created_at)}
                  </Text>
                </View>

                <View className='apay-item__right'>
                  <Text className='apay-item__amount'>{fmtMoney(p.amount, p.currency)}</Text>
                  <Text className={`badge ${overdue ? 'badge--error' : status.badge}`}>
                    {overdue ? t('pay.overdue') : t(status.text) || '-'}
                  </Text>
                </View>
              </View>

              <View className='apay-item__actions'>
                {(p.status === 'pending' || p.status === 'processing') && (
                  <View className='apay-act apay-act--primary' onClick={() => openConfirm(p)}>
                    {t('pay.confirmArrival')}
                  </View>
                )}
                <View className='apay-act' onClick={() => openDetail(p)}>
                  {t('pay.viewDetail')}
                </View>
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
            <Text className='apay-sheet__title'>{t('pay.manualTitle')}</Text>

            <View className='apay-field'>
              <Text className='apay-field__label apay-field__label--req'>{t('pay.fieldAmount')}</Text>
              <Input
                className='apay-field__input'
                type='digit'
                value={form.amount}
                placeholder={t('pay.amountPlaceholder')}
                onInput={(e) => setFormField('amount', e.detail.value)}
              />
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label apay-field__label--req'>{t('pay.fieldCurrency')}</Text>
              <View
                className='apay-field__select'
                onClick={() => pickOption(CURRENCY_OPTIONS, CURRENCY_SYMBOL, (v) => setFormField('currency', v))}
              >
                <Text>{CURRENCY_SYMBOL[form.currency] || ''} {form.currency}</Text>
                <Text className='apay-field__tag'>▾</Text>
              </View>
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label apay-field__label--req'>{t('pay.fieldType')}</Text>
              <View
                className='apay-field__select'
                onClick={() => pickOption(TYPE_OPTIONS, TYPE_LABELS, (v) => setFormField('payment_type', v))}
              >
                <Text>{t(TYPE_LABELS[form.payment_type] || form.payment_type)}</Text>
                <Text className='apay-field__tag'>▾</Text>
              </View>
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label'>{t('pay.fieldChannel')}</Text>
              <View
                className='apay-field__select'
                onClick={() => pickOption(CHANNEL_OPTIONS, CHANNEL_LABELS, (v) => setFormField('channel', v))}
              >
                <Text className={form.channel ? '' : 'apay-field__select--placeholder'}>
                  {form.channel ? t(CHANNEL_LABELS[form.channel]) : t('pay.channelPlaceholder')}
                </Text>
                <Text className='apay-field__tag'>▾</Text>
              </View>
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label'>{t('pay.fieldDueDate')}</Text>
              <Input
                className='apay-field__input'
                type='text'
                value={form.due_date}
                placeholder='YYYY-MM-DD'
                onInput={(e) => setFormField('due_date', e.detail.value)}
              />
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label'>{t('pay.fieldPayerId')}</Text>
              <Input
                className='apay-field__input'
                type='text'
                value={form.payer_id}
                placeholder={t('pay.payerPlaceholder')}
                onInput={(e) => setFormField('payer_id', e.detail.value)}
              />
            </View>

            <View className='apay-field'>
              <Text className='apay-field__label'>{t('pay.fieldNote')}</Text>
              <Input
                className='apay-field__input'
                value={form.description}
                placeholder={t('pay.notePlaceholder')}
                onInput={(e) => setFormField('description', e.detail.value)}
              />
            </View>

            <View className='apay-submit' onClick={submitCreate}>
              {createBusy ? t('common.submitting') : t('common.save')}
            </View>
          </View>
        </>
      )}

      {/* 确认到账弹层 */}
      {confirmTarget && (
        <>
          <View className='apay-mask' onClick={() => setConfirmTarget(null)} />
          <View className='apay-sheet'>
            <Text className='apay-sheet__title'>{t('pay.confirmArrival')}</Text>
            <Text className='apay-sheet__desc'>{t('pay.confirmDesc', { name: confirmTarget.name })}</Text>
            <View className='apay-field'>
              <Text className='apay-field__label'>{t('pay.confirmNoteLabel')}</Text>
              <Input
                className='apay-field__input'
                value={note}
                placeholder={t('pay.confirmNotePlaceholder')}
                onInput={(e) => setNote(e.detail.value)}
              />
            </View>
            <View className='apay-submit' onClick={runConfirm}>{t('pay.confirmArrival')}</View>
          </View>
        </>
      )}

      {/* 详情弹层 */}
      {detail && (
        <>
          <View className='apay-mask' onClick={() => setDetail(null)} />
          <View className='apay-sheet'>
            <Text className='apay-sheet__title'>{t('pay.detailTitle')}</Text>
            <View className='apay-detail'>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>{t('pay.detailAmount')}</Text>
                <Text className='apay-detail__v'>{fmtMoney(detail.amount, detail.currency)}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>{t('pay.detailType')}</Text>
                <Text className='apay-detail__v'>
                  {t(TYPE_LABELS[detail.payment_type || ''] || '') || detail.payment_type || '-'}
                </Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>{t('pay.detailChannel')}</Text>
                <Text className='apay-detail__v'>
                  {t(CHANNEL_LABELS[detail.channel || ''] || '') || detail.channel || '-'}
                </Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>{t('pay.detailStatus')}</Text>
                <Text className='apay-detail__v'>
                  {t((STATUS_META[detail.status || ''] || {}).text || '') || detail.status || '-'}
                </Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>{t('pay.detailDueDate')}</Text>
                <Text className='apay-detail__v'>{fmtDate(detail.due_date)}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>{t('pay.detailPaidDate')}</Text>
                <Text className='apay-detail__v'>{fmtDate(detail.paid_at)}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>{t('pay.detailPayerId')}</Text>
                <Text className='apay-detail__v'>{detail.payer_id || '-'}</Text>
              </View>
              <View className='apay-detail__line'>
                <Text className='apay-detail__k'>{t('pay.detailNote')}</Text>
                <Text className='apay-detail__v'>{detail.description || '-'}</Text>
              </View>
            </View>
            <View className='apay-submit' onClick={() => setDetail(null)}>{t('common.close')}</View>
          </View>
        </>
      )}

      {/* 底部导航：收款 */}
      <BottomNav role='admin' active='payments' />
    </View>
  )
}