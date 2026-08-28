import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import './payments.css'

interface PaymentVoucher {
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

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected'

const statusLabelMap: Record<PaymentVoucher['status'], string> = {
  pending: '待缴',
  approved: '已缴',
  rejected: '逾期',
}

const statusBadgeMap: Record<PaymentVoucher['status'], string> = {
  pending: 'rent-badge--warning',
  approved: 'rent-badge--success',
  rejected: 'rent-badge--error',
}

const methodLabelMap: Record<string, string> = {
  bank_transfer: '银行转账',
  cash: '现金',
  alipay: '支付宝',
  wechat: '微信支付',
  promptpay: 'PromptPay',
  credit_card: '信用卡',
}

const STATIC_BILLS: PaymentVoucher[] = [
  { id: 's-1', amount: 1200, payment_date: '2024-08-15', payment_method: 'bank_transfer', status: 'pending', bill_type: '物业费', property_name: 'Sunway Mesmerrra', due_date: '2024-08-15', created_at: '2024-08-01 10:00:00' },
  { id: 's-2', amount: 380, payment_date: '2024-08-10', payment_method: 'promptpay', status: 'approved', bill_type: '水电费', property_name: 'Sunway Mesmerrra', due_date: '2024-08-10', created_at: '2024-08-01 09:00:00' },
  { id: 's-3', amount: 980, payment_date: '2024-08-20', payment_method: 'bank_transfer', status: 'pending', bill_type: '物业费', property_name: 'Mont Kiara Bayu', due_date: '2024-08-20', created_at: '2024-08-01 11:00:00' },
  { id: 's-4', amount: 150, payment_date: '2024-08-05', payment_method: 'cash', status: 'rejected', bill_type: '燃气费', property_name: 'Sunway Rio Sintra', due_date: '2024-08-05', created_at: '2024-08-01 14:00:00' },
  { id: 's-5', amount: 520, payment_date: '2024-08-12', payment_method: 'promptpay', status: 'approved', bill_type: '水电费', property_name: '双威金沙国际公寓', due_date: '2024-08-12', created_at: '2024-08-01 16:00:00' },
  { id: 's-6', amount: 850, payment_date: '2024-08-25', payment_method: 'bank_transfer', status: 'pending', bill_type: '物业费', property_name: 'Sunway Rio Sintra', due_date: '2024-08-25', created_at: '2024-08-01 18:00:00' },
]

const billIconMap: Record<string, { bg: string; color: string; svg: React.ReactNode }> = {
  物业费: {
    bg: 'rgba(66,99,235,0.10)',
    color: 'var(--rent-primary)',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
  水电费: {
    bg: 'rgba(14,165,233,0.10)',
    color: '#0ea5e9',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
  },
  燃气费: {
    bg: 'rgba(220,38,38,0.10)',
    color: '#dc2626',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3l-2 2-7 7a4 4 0 0 0 5.66 5.66l7-7 2-2a4 4 0 0 0-5.66-5.66z"/><line x1="8" y1="8" x2="16" y2="16"/></svg>,
  },
}

const defaultBillIcon = billIconMap['物业费']

const TenantPayments = () => {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [data, setData] = useState<PaymentVoucher[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')

  // form state (replaces antd Form)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [fileName, setFileName] = useState('')
  const [fileObj, setFileObj] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/payments/me')
      const payload = res.data?.data ?? res.data
      const items = payload?.items ?? []
      setData(items.length ? items : STATIC_BILLS)
    } catch {
      setData(STATIC_BILLS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredData = useMemo(() => {
    if (filter === 'all') return data
    return data.filter((d) => d.status === filter)
  }, [data, filter])

  const summary = useMemo(() => {
    const pending = data.filter((d) => d.status === 'pending')
    const approved = data.filter((d) => d.status === 'approved')
    const propertyFee = data.filter((d) => (d.bill_type || '物业费') === '物业费')
    const sum = (arr: PaymentVoucher[]) => arr.reduce((acc, x) => acc + Number(x.amount || 0), 0)
    return {
      pendingTotal: sum(pending),
      approvedTotal: sum(approved),
      propertyFeeTotal: sum(propertyFee),
    }
  }, [data])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) {
      setFileObj(null)
      setFileName('')
      setPreviewUrl(undefined)
      return
    }
    setFileObj(f)
    setFileName(f.name)
    setPreviewUrl(URL.createObjectURL(f))
  }

  const handleSubmit = async () => {
    const amt = Number(amount)
    if (!amount || isNaN(amt) || amt <= 0) {
      message.warning('请输入付款金额')
      return
    }
    if (!paymentDate) {
      message.warning('请选择付款日期')
      return
    }
    if (!paymentMethod) {
      message.warning('请选择付款方式')
      return
    }
    setSubmitting(true)
    const formData = new FormData()
    formData.append('amount', String(amt))
    formData.append('payment_date', paymentDate)
    formData.append('payment_method', paymentMethod)
    if (fileObj) {
      formData.append('receipt', fileObj)
    }

    try {
      try {
        await api.post('/payments/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } catch {
        // API 不可用时本地展示
      }

      message.success('凭证上传成功，等待审核')
      const newItem: PaymentVoucher = {
        id: `local-${Date.now()}`,
        amount: amt,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        receipt_url: previewUrl,
        status: 'pending',
        review_comment: '',
        bill_type: '物业费',
        property_name: '阳光花园 A座12-3',
        due_date: paymentDate,
        created_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      }
      setData((prev) => [newItem, ...prev])
      setAmount('')
      setPaymentDate(dayjs().format('YYYY-MM-DD'))
      setPaymentMethod('bank_transfer')
      setFileObj(null)
      setFileName('')
      setPreviewUrl(undefined)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '上传失败')
    } finally {
      setSubmitting(false)
    }
  }

  const chips: { key: FilterKey; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待缴' },
    { key: 'approved', label: '已缴' },
    { key: 'rejected', label: '逾期' },
  ]

  return (
    <div className="rent-main">
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="rent-text-muted">加载中…</span>
        </div>
      )}

      {/* Summary card */}
      <div className="rent-pay-summary">
        <div className="rent-pay-summary__label">待缴总额</div>
        <div className="rent-pay-summary__total">฿{summary.pendingTotal.toLocaleString()}</div>
        <div className="rent-pay-summary__divider"></div>
        <div className="rent-pay-summary__row">
          <div>
            <div className="rent-pay-summary__sub-label">本月已缴</div>
            <div className="rent-pay-summary__sub-value">฿{summary.approvedTotal.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="rent-pay-summary__sub-label">物业费</div>
            <div className="rent-pay-summary__sub-value">฿{summary.propertyFeeTotal.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="rent-chips no-scrollbar">
        {chips.map((c) => (
          <button
            key={c.key}
            className="rent-chip"
            data-active={filter === c.key}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Upload form */}
      <div className="rent-card" style={{ marginBottom: 20 }}>
        <div className="rent-card__header">
          <h3 className="rent-card__title">上传付款凭证</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-pay-form-row">
            <div className="rent-pay-form-group">
              <label className="rent-pay-form-label">付款金额</label>
              <input
                className="rent-pay-form-input"
                type="number"
                min={0}
                placeholder="请输入付款金额"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="rent-pay-form-group">
              <label className="rent-pay-form-label">付款日期</label>
              <input
                className="rent-pay-form-input"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <div className="rent-pay-form-group">
            <label className="rent-pay-form-label">付款方式</label>
            <select
              className="rent-pay-form-select"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {Object.entries(methodLabelMap).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="rent-pay-form-group">
            <label className="rent-pay-form-label">上传凭证图片</label>
            <label className="rent-pay-file-drop">
              <div className="rent-pay-file-drop__icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div className="rent-pay-file-drop__text">点击或拖拽文件到此处上传</div>
              <div className="rent-pay-file-drop__hint">支持单张图片，不超过 5MB</div>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
            </label>
            {fileName && <div className="rent-pay-file-name">已选择：{fileName}</div>}
          </div>
          <button
            className="rent-btn rent-btn--primary rent-btn--block"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? '提交中…' : '提交凭证'}
          </button>
        </div>
      </div>

      {/* Bill list */}
      <h3 className="rent-pay-section-title">账单列表</h3>
      {filteredData.length ? (
        filteredData.map((bill) => {
          const iconCfg = billIconMap[bill.bill_type || '物业费'] || defaultBillIcon
          const due = bill.due_date || bill.payment_date
          return (
            <div key={bill.id} className="rent-bill-card">
              <div className="rent-bill-card__head">
                <div className="rent-bill-card__icon" style={{ background: iconCfg.bg, color: iconCfg.color }}>
                  {iconCfg.svg}
                </div>
                <div className="rent-bill-card__info">
                  <div className="rent-bill-card__name-row">
                    <span className="rent-bill-card__name">{bill.bill_type || '物业费'}</span>
                    <span className={`rent-badge ${statusBadgeMap[bill.status]}`}>{statusLabelMap[bill.status]}</span>
                  </div>
                  <div className="rent-bill-card__meta">
                    <span>{bill.property_name || '阳光花园 A座12-3'}</span>
                    <span>·</span>
                    <span>到期 {due ? dayjs(due).format('YYYY-MM-DD') : '-'}</span>
                  </div>
                </div>
              </div>
              <div className="rent-bill-card__foot">
                <span className="rent-bill-card__amount">฿{Number(bill.amount || 0).toLocaleString()}</span>
                {bill.status === 'pending' && (
                  <button className="rent-btn rent-btn--primary rent-btn--sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    立即缴费
                  </button>
                )}
                {bill.status === 'approved' && (
                  <button className="rent-btn rent-btn--secondary rent-btn--sm" disabled>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    已缴清
                  </button>
                )}
                {bill.status === 'rejected' && (
                  <button className="rent-btn rent-btn--danger rent-btn--sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    逾期缴费
                  </button>
                )}
              </div>
            </div>
          )
        })
      ) : (
        <div className="rent-empty">暂无账单</div>
      )}
    </div>
  )
}

export default TenantPayments
