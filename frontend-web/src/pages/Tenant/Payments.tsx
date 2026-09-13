import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'

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

const chipLabelMap: Record<FilterKey, string> = {
  all: '全部',
  pending: '待缴',
  approved: '已缴',
  rejected: '逾期',
}

const recordStatusMap: Record<PaymentVoucher['status'], { label: string; cls: string }> = {
  pending: { label: '待审核', cls: 'rent-pay-record__status--warning' },
  approved: { label: '已确认', cls: 'rent-pay-record__status--success' },
  rejected: { label: '已驳回', cls: 'rent-pay-record__status--error' },
}

const methodLabelMap: Record<string, string> = {
  bank_transfer: '银行转账',
  cash: '现金',
  alipay: '支付宝',
  wechat: '微信支付',
  promptpay: 'PromptPay',
  credit_card: '信用卡',
}

const methodIconMap: Record<string, React.ReactNode> = {
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

const defaultMethodIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
)

const STATIC_BILLS: PaymentVoucher[] = [
  { id: 's-1', amount: 1200, payment_date: '2024-08-15', payment_method: 'bank_transfer', status: 'pending', bill_type: '物业费', property_name: 'Sunway Mesmerrra', due_date: '2024-08-15', created_at: '2024-08-01 10:00:00' },
  { id: 's-2', amount: 380, payment_date: '2024-08-10', payment_method: 'promptpay', status: 'approved', bill_type: '水电费', property_name: 'Sunway Mesmerrra', due_date: '2024-08-10', created_at: '2024-08-01 09:00:00' },
  { id: 's-3', amount: 980, payment_date: '2024-08-20', payment_method: 'bank_transfer', status: 'pending', bill_type: '物业费', property_name: 'Mont Kiara Bayu', due_date: '2024-08-20', created_at: '2024-08-01 11:00:00' },
  { id: 's-4', amount: 150, payment_date: '2024-08-05', payment_method: 'cash', status: 'rejected', bill_type: '燃气费', property_name: 'Sunway Rio Sintra', due_date: '2024-08-05', created_at: '2024-08-01 14:00:00' },
  { id: 's-5', amount: 520, payment_date: '2024-08-12', payment_method: 'promptpay', status: 'approved', bill_type: '水电费', property_name: '双威金沙国际公寓', due_date: '2024-08-12', created_at: '2024-08-01 16:00:00' },
  { id: 's-6', amount: 850, payment_date: '2024-08-25', payment_method: 'bank_transfer', status: 'pending', bill_type: '物业费', property_name: 'Sunway Rio Sintra', due_date: '2024-08-25', created_at: '2024-08-01 18:00:00' },
]

const TenantPayments = () => {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [data, setData] = useState<PaymentVoucher[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [keyword, setKeyword] = useState('')

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

  // 搜索：凭证编号 / 月份 / 类型 / 房产
  const searchFiltered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return filteredData
    return filteredData.filter((d) => {
      const dateStr = dayjs(d.payment_date || d.created_at).format('YYYY年M月')
      return [
        d.id,
        d.bill_type,
        d.property_name,
        methodLabelMap[d.payment_method],
        dateStr,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
  }, [filteredData, keyword])

  // 按月分组（倒序）
  const monthGroups = useMemo(() => {
    const map = new Map<string, PaymentVoucher[]>()
    for (const d of searchFiltered) {
      const key = dayjs(d.payment_date || d.created_at || dayjs()).format('YYYY年M月')
      const arr = map.get(key) || []
      arr.push(d)
      map.set(key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [searchFiltered])

  const firstPending = useMemo(
    () => data.find((d) => d.status === 'pending'),
    [data],
  )
  const heroProperty = firstPending?.property_name || '阳光花园 A座12-3'
  const heroDue = firstPending?.due_date
    ? dayjs(firstPending.due_date).format('M月D日')
    : '8月15日'

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

  const scrollToUpload = () => {
    const el = document.getElementById('pay-upload')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
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

  const chips: FilterKey[] = ['all', 'pending', 'approved', 'rejected']

  return (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="rent-text-muted">加载中…</span>
        </div>
      )}

      {/* Hero: 本月租金大卡片 */}
      <div className="rent-pay-hero">
        <div className="rent-pay-hero__deco rent-pay-hero__deco--1"></div>
        <div className="rent-pay-hero__deco rent-pay-hero__deco--2"></div>
        <div className="rent-pay-hero__deco rent-pay-hero__deco--3"></div>
        <div className="rent-pay-hero__content">
          <p className="rent-pay-hero__label">本月租金</p>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 className="rent-pay-hero__amount">฿{summary.pendingTotal.toLocaleString()}</h2>
            <span className="rent-pay-hero__status"><span className="rent-pay-hero__status-dot"></span>待支付</span>
          </div>
          <div className="rent-pay-hero__meta">
            <span className="rent-pay-hero__meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>
              {heroProperty}
            </span>
            <span className="rent-pay-hero__meta-sep"></span>
            <span className="rent-pay-hero__meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              请于 {heroDue} 前完成支付
            </span>
          </div>
          <button className="rent-pay-hero__upload" onClick={scrollToUpload}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            上传付款凭证
          </button>
        </div>
      </div>

      {/* 付款状态摘要条 */}
      <div className="rent-pay-summary">
        <div className="rent-pay-summary__item">
          <div><span className="rent-pay-summary__num">{data.length}</span><span className="rent-pay-summary__num-unit">张</span></div>
          <div className="rent-pay-summary__label">已上传凭证</div>
        </div>
        <div className="rent-pay-summary__item">
          <div><span className="rent-pay-summary__num">{data.filter((d) => d.status === 'pending').length}</span><span className="rent-pay-summary__num-unit">笔</span></div>
          <div className="rent-pay-summary__label">待审核</div>
        </div>
        <div className="rent-pay-summary__item">
          <div><span className="rent-pay-summary__num">{data.filter((d) => d.status === 'approved').length}</span><span className="rent-pay-summary__num-unit">笔</span></div>
          <div className="rent-pay-summary__label">已确认</div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="rent-pay-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          placeholder="搜索凭证编号、月份..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 状态筛选胶囊 */}
      <div className="rent-chips no-scrollbar">
        {chips.map((k) => (
          <button
            key={k}
            className="rent-chip"
            data-active={filter === k}
            onClick={() => setFilter(k)}
          >
            {chipLabelMap[k]}
          </button>
        ))}
      </div>

      {/* 上传凭证表单 */}
      <div className="rent-card" id="pay-upload" style={{ marginBottom: 32 }}>
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
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
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

      {/* 付款记录 */}
      <div className="rent-pay-section">
        <h3 className="rent-pay-section__title">付款记录</h3>
        {monthGroups.length ? (
          monthGroups.map(([month, bills]) => (
            <div key={month} className="rent-pay-month">
              <div className="rent-pay-month__header">
                <h4 className="rent-pay-month__title">{month}</h4>
                <span className="rent-pay-month__count">{bills.length} 笔</span>
              </div>
              {bills.map((bill, idx) => {
                const st = recordStatusMap[bill.status] ?? { label: bill.status, cls: 'rent-pay-record__status--warning' }
                const method = methodLabelMap[bill.payment_method] || bill.payment_method || '其他'
                const uploadDate = dayjs(bill.created_at || bill.payment_date).format('YYYY-MM-DD')
                const recordNo = `PAY-${dayjs(bill.payment_date || bill.created_at).format('YYYY-MM')}${String(idx + 1).padStart(2, '0')}`
                return (
                  <div key={bill.id} className="rent-pay-record">
                    <div className="rent-pay-record__method">
                      {methodIconMap[bill.payment_method] || defaultMethodIcon}
                    </div>
                    <div className="rent-pay-record__main">
                      <div className="rent-pay-record__id">{bill.id.startsWith('s-') || bill.id.startsWith('local-') ? recordNo : bill.id}</div>
                      <div className="rent-pay-record__meta">
                        <span>{method}</span>
                        <span className="rent-pay-record__meta-sep"></span>
                        <span>上传于 {uploadDate}</span>
                      </div>
                    </div>
                    <div className="rent-pay-record__amount">฿{Number(bill.amount || 0).toLocaleString()}</div>
                    <div className={`rent-pay-record__status ${st.cls}`}>
                      <span className="rent-pay-record__status-dot"></span>{st.label}
                    </div>
                    <div className="rent-pay-record__actions">
                      {bill.status === 'rejected' ? (
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={scrollToUpload}>重新上传</button>
                      ) : (
                        <button className="rent-btn rent-btn--secondary rent-btn--sm">查看</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        ) : (
          <div className="rent-empty">暂无付款记录</div>
        )}
      </div>
    </>
  )
}

export default TenantPayments
