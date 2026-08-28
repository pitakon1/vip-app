import { useCallback, useEffect, useState } from 'react'
import { message, Modal, Form, Select, DatePicker, InputNumber } from 'antd'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import api from '@/lib/api'
import './services.css'

interface ServiceItem {
  id: string
  name: string
  description: string
  priceLabel: string
  price: string
  priceUnit?: string
  priceColor?: string
  badge: { variant: 'primary' | 'info' | 'success' | 'warning'; label: string }
  icon: ReactNode
  iconStyle: { background: string; color: string }
}

interface BookedService {
  id: string
  service_name: string
  price: string
  booked_at: string
  status: string
}

interface PackageItem {
  id: string
  property_id: string
  type: 'annual_management' | 'full_service'
  commission_rate: number
  management_fee_rate: number
  amount: number
  currency: string
  start_date: string
  end_date: string
  status: string
}

interface PropertyOption {
  id: string
  room_number: string
  address: string
  monthly_rent: number
  currency: string
}

// 服务分类（设计稿静态数据）
const services: ServiceItem[] = [
  {
    id: 'cleaning',
    name: '家政清洁',
    description: '专业保洁团队上门，全屋深度清洁，厨房卫浴专项处理。',
    priceLabel: '起价',
    price: '฿ 1,200',
    priceUnit: '/次',
    badge: { variant: 'primary', label: '热门' },
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
      </svg>
    ),
    iconStyle: { background: 'rgba(66,99,235,0.12)', color: 'var(--rent-primary)' },
  },
  {
    id: 'ac',
    name: '空调清洗',
    description: '拆机深度清洗，杀菌除味，延长空调使用寿命，改善制冷效果。',
    priceLabel: '起价',
    price: '฿ 800',
    priceUnit: '/台',
    badge: { variant: 'info', label: '推荐' },
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20" />
        <path d="M2 12h20" />
        <path d="M4.93 4.93l14.14 14.14" />
        <path d="M19.07 4.93L4.93 19.07" />
      </svg>
    ),
    iconStyle: { background: 'rgba(14,165,233,0.12)', color: 'var(--state-info)' },
  },
  {
    id: 'wifi',
    name: 'WiFi安装',
    description: '专业网络工程师上门安装调试路由器，覆盖检测与信号优化。',
    priceLabel: '起价',
    price: '฿ 1,500',
    priceUnit: '/次',
    badge: { variant: 'success', label: '新上' },
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
    iconStyle: { background: 'rgba(22,163,74,0.12)', color: 'var(--state-success)' },
  },
  {
    id: 'utility',
    name: '水电费代付',
    description: '平台代缴水电网费，账单自动同步，省心省力，无需排队。',
    priceLabel: '服务费',
    price: '免费服务',
    priceColor: 'var(--state-success)',
    badge: { variant: 'warning', label: '免费' },
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    iconStyle: { background: 'rgba(217,119,6,0.12)', color: 'var(--state-warning)' },
  },
]

interface FallbackOrder {
  no: string
  name: string
  date: string
  amount: string
  status: 'warning' | 'info' | 'success' | 'neutral'
  statusLabel: string
  action: { label: string; variant: 'primary' | 'secondary' }
}

const FALLBACK_ORDERS: FallbackOrder[] = [
  { no: 'SV2026080301', name: '家政清洁', date: '2026-08-05 10:00', amount: '฿ 1,200', status: 'warning', statusLabel: '待处理', action: { label: '详情', variant: 'secondary' } },
  { no: 'SV2026080202', name: '空调清洗', date: '2026-08-04 14:00', amount: '฿ 1,600', status: 'info', statusLabel: '进行中', action: { label: '详情', variant: 'secondary' } },
  { no: 'SV2026072803', name: 'WiFi安装', date: '2026-07-28 09:00', amount: '฿ 1,500', status: 'success', statusLabel: '已完成', action: { label: '评价', variant: 'primary' } },
  { no: 'SV2026072504', name: '水电费代付', date: '2026-07-25 16:00', amount: '฿ 0', status: 'success', statusLabel: '已完成', action: { label: '评价', variant: 'primary' } },
  { no: 'SV2026072005', name: '家政清洁', date: '2026-07-20 11:00', amount: '฿ 1,200', status: 'neutral', statusLabel: '已取消', action: { label: '详情', variant: 'secondary' } },
]

interface FallbackReview {
  avatar: string
  avatarBg: string
  name: string
  meta: string
  score: string
  filled: number
  text: string
}

const FALLBACK_REVIEWS: FallbackReview[] = [
  { avatar: '王', avatarBg: 'var(--rent-primary)', name: '王租客', meta: '家政清洁 · 2026-07-18', score: '5.0', filled: 5, text: '保洁阿姨非常专业，全屋打扫得干干净净，厨房油污处理得很到位，预约流程也很顺畅，下次还会选择。' },
  { avatar: '林', avatarBg: 'var(--state-info)', name: 'Lim Wei', meta: '空调清洗 · 2026-07-15', score: '4.0', filled: 4, text: '师傅上门准时，两台空调清洗后制冷明显改善。就是工作时长比预期多了一点，总体满意。' },
  { avatar: '陈', avatarBg: 'var(--state-success)', name: 'Tan Mei', meta: 'WiFi安装 · 2026-07-10', score: '5.0', filled: 5, text: '网络工程师很专业，30分钟就完成安装调试，全屋信号覆盖无死角，体验非常棒，强烈推荐！' },
]

const starFilled = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)
const starOutline = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

const arrowIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

const plusIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const giftIcon = (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
    <path d="M20 12v9H4v-9" />
    <rect x="2" y="7" width="20" height="5" rx="1" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
)

const starEyebrow = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .587l3.668 7.431L24 9.75l-6 5.847 1.417 8.265L12 19.771l-7.417 4.091L6 15.597 0 9.75l8.332-1.732z" />
  </svg>
)

const packageTypeLabel = (t: string) =>
  t === 'full_service' ? '全托管套餐' : '年度托管套餐'
const packageStatusLabel = (s: string) => {
  const map: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
    active: { label: '生效中', tone: 'success' },
    pending: { label: '待生效', tone: 'warning' },
    expired: { label: '已到期', tone: 'neutral' },
    cancelled: { label: '已取消', tone: 'neutral' },
  }
  return map[s] || { label: s, tone: 'neutral' as const }
}
const fmtMoney = (v: number, currency = 'THB') => {
  const sym = currency === 'THB' ? '฿' : currency === 'MYR' ? 'RM' : currency
  return `${sym} ${Number(v || 0).toLocaleString()}`
}

const Services = () => {
  const [bookedServices, setBookedServices] = useState<BookedService[]>([])
  const [packages, setPackages] = useState<PackageItem[]>([])
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const fetchPackages = useCallback(async () => {
    try {
      const res = await api.get('/service-packages/me')
      setPackages(Array.isArray(res.data) ? res.data : (res.data?.items ?? []))
    } catch {
      // 接口不可用或未订阅时保持空列表，使用静态兜底
    }
  }, [])

  const fetchProperties = useCallback(async () => {
    try {
      const res = await api.get('/owners/me/properties')
      const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? [])
      setProperties(items)
    } catch {
      setProperties([])
    }
  }, [])

  useEffect(() => {
    fetchPackages()
    fetchProperties()
  }, [fetchPackages, fetchProperties])

  const handleBook = (service: ServiceItem) => {
    setBookedServices((prev) => [
      {
        id: `${service.id}-${Date.now()}`,
        service_name: service.name,
        price: service.price,
        booked_at: dayjs().format('YYYY-MM-DD HH:mm'),
        status: 'pending',
      },
      ...prev,
    ])
    message.success('预约成功，工作人员将尽快联系您')
  }

  const openSubscribe = () => {
    if (!properties.length) {
      message.warning('暂无可订阅的房源，请先在「我的房源」中添加')
      return
    }
    form.setFieldsValue({
      property_id: properties[0]?.id,
      type: 'annual_management',
      start_date: dayjs(),
      commission_rate: 1,
      management_fee_rate: 0.5,
    })
    setModalOpen(true)
  }

  const handleSubscribe = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        ...values,
        start_date: values.start_date.format('YYYY-MM-DDTHH:mm:ss'),
      }
      const res = await api.post('/service-packages', payload)
      message.success('套餐订阅成功')
      setModalOpen(false)
      setPackages((prev) => [res.data, ...prev])
      fetchPackages()
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.detail || '订阅失败')
      }
      // validateFields 失败时静默
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelPackage = async (pkg: PackageItem) => {
    try {
      await api.patch(`/service-packages/${pkg.id}`, { status: 'cancelled' })
      message.success('已取消订阅')
      fetchPackages()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '取消失败')
    }
  }

  // 订单展示：有预约记录则映射，否则用兜底
  const renderOrders = bookedServices.length
    ? bookedServices.map((b) => ({
        no: b.id,
        name: b.service_name,
        date: b.booked_at,
        amount: b.price,
        status: 'warning' as const,
        statusLabel: '待处理',
        action: { label: '详情', variant: 'secondary' as const },
      }))
    : FALLBACK_ORDERS

  return (
    <div className="rent-main">
      {/* ===== Hero ===== */}
      <section className="svc-hero">
        <div className="svc-hero__decor svc-hero__decor--1" />
        <div className="svc-hero__decor svc-hero__decor--2" />
        <div className="svc-hero__decor svc-hero__decor--3" />
        <div className="svc-hero__content">
          <span className="svc-hero__eyebrow">
            {starEyebrow}
            业主专享
          </span>
          <h2 className="svc-hero__title">增值托管服务</h2>
          <p className="svc-hero__subtitle">托管出租、代缴代付、维修清洁一站式省心服务</p>
          <button type="button" className="svc-hero__action" onClick={() => handleBook(services[0])}>
            {plusIcon}
            发起预约
          </button>
        </div>
        <div className="svc-hero__stats">
          <div className="svc-hero__stat">
            <div className="svc-hero__stat-value">{packages.length}</div>
            <div className="svc-hero__stat-label">托管套餐</div>
          </div>
          <div className="svc-hero__stat">
            <div className="svc-hero__stat-value">2,800+</div>
            <div className="svc-hero__stat-label">完成订单</div>
          </div>
          <div className="svc-hero__stat">
            <div className="svc-hero__stat-value">4.8</div>
            <div className="svc-hero__stat-label">平均评分</div>
          </div>
        </div>
      </section>

      {/* ===== Service Categories ===== */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">服务分类</h3>
          <span className="svc-section__hint">选择你需要的家居服务</span>
        </div>
        <div className="svc-category-grid">
          {services.map((s) => (
            <div className="svc-category-card" key={s.id}>
              <div className="svc-category-card__top">
                <div className="svc-category-card__icon" style={s.iconStyle}>
                  {s.icon}
                </div>
                <span className={`svc-pill-badge svc-pill-badge--${s.badge.variant}`}>{s.badge.label}</span>
              </div>
              <h4 className="svc-category-card__title">{s.name}</h4>
              <p className="svc-category-card__desc">{s.description}</p>
              <div className="svc-category-card__footer">
                <div>
                  <span className="svc-category-card__price-label">{s.priceLabel}</span>
                  <span
                    className="svc-category-card__price"
                    style={s.priceColor ? { color: s.priceColor } : undefined}
                  >
                    {s.price}
                    {s.priceUnit && <span className="svc-category-card__price-unit">{s.priceUnit}</span>}
                  </span>
                </div>
                <button
                  type="button"
                  className="svc-category-card__btn"
                  onClick={() => handleBook(s)}
                >
                  预约服务
                  {arrowIcon}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Annual Service Package ===== */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">我的托管套餐</h3>
          <button type="button" className="svc-section__link" onClick={openSubscribe} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            {plusIcon}
            订阅套餐
          </button>
        </div>

        {packages.length ? (
          <div className="svc-order-list">
            {packages.map((pkg) => {
              const st = packageStatusLabel(pkg.status)
              return (
                <div className="svc-order-item" key={pkg.id}>
                  <div className="svc-order-item__left">
                    <span className="svc-order-item__no">{pkg.property_id}</span>
                    <div className="svc-order-item__name">
                      {packageTypeLabel(pkg.type)}
                      <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 10 }}>
                        {dayjs(pkg.start_date).format('YYYY-MM-DD')} ~ {dayjs(pkg.end_date).format('YYYY-MM-DD')}
                      </span>
                    </div>
                  </div>
                  <div className="svc-order-item__mid">
                    <span className="svc-order-item__date">
                      佣金 {pkg.commission_rate} 个月 + 托管费 {pkg.management_fee_rate} 个月/年
                    </span>
                    <span className="svc-order-item__amount">{fmtMoney(pkg.amount, pkg.currency)}</span>
                  </div>
                  <div className="svc-order-item__right">
                    <span className={`svc-order-status svc-order-status--${st.tone}`}>
                      <span className="svc-order-status__dot" />
                      {st.label}
                    </span>
                    {pkg.status === 'active' && (
                      <button
                        type="button"
                        className="rent-btn rent-btn--secondary rent-btn--sm"
                        onClick={() => handleCancelPackage(pkg)}
                      >
                        取消订阅
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="svc-promo">
            <div className="svc-promo__decor" />
            <div className="svc-promo__decor svc-promo__decor--2" />
            <div className="svc-promo__body">
              <div className="svc-promo__icon">{giftIcon}</div>
              <div>
                <h3 className="svc-promo__title">年度托管套餐 · 省心更省心</h3>
                <p className="svc-promo__desc">
                  佣金（{properties[0]?.monthly_rent ? fmtMoney(properties[0].monthly_rent, properties[0].currency) : '1 个月租金'}）一次性收取
                  + 托管费（半个月租金）按在租月份收取，全年无忧
                </p>
                <div className="svc-promo__price-row">
                  <span className="svc-promo__price">一键订阅</span>
                  <span className="svc-promo__save">自动续费提醒</span>
                </div>
              </div>
            </div>
            <button type="button" className="svc-promo__btn" onClick={openSubscribe}>
              立即订阅套餐
              {arrowIcon}
            </button>
          </div>
        )}
      </section>

      {/* ===== My Service Orders ===== */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">我的服务订单</h3>
          <a href="#" className="svc-section__link">查看全部</a>
        </div>
        <div className="svc-order-list">
          {renderOrders.map((o) => (
            <div className="svc-order-item" key={o.no}>
              <div className="svc-order-item__left">
                <span className="svc-order-item__no">{o.no}</span>
                <div className="svc-order-item__name">{o.name}</div>
              </div>
              <div className="svc-order-item__mid">
                <span className="svc-order-item__date">{o.date}</span>
                <span className="svc-order-item__amount">{o.amount}</span>
              </div>
              <div className="svc-order-item__right">
                <span className={`svc-order-status svc-order-status--${o.status}`}>
                  <span className="svc-order-status__dot" />
                  {o.statusLabel}
                </span>
                <button
                  type="button"
                  className={`rent-btn rent-btn--${o.action.variant === 'primary' ? 'primary' : 'secondary'} rent-btn--sm`}
                >
                  {o.action.label}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Service Reviews ===== */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">服务评价</h3>
          <a href="#" className="svc-section__link">更多评价</a>
        </div>
        <div className="svc-reviews">
          {FALLBACK_REVIEWS.map((r) => (
            <div className="svc-review" key={r.name}>
              <div className="svc-review__head">
                <div className="svc-review__user">
                  <div className="svc-review__avatar" style={{ background: r.avatarBg }}>{r.avatar}</div>
                  <div>
                    <div className="svc-review__name">{r.name}</div>
                    <div className="svc-review__meta">{r.meta}</div>
                  </div>
                </div>
                <div className="svc-review__rating">
                  <div className="svc-review__stars">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i}>{i < r.filled ? starFilled : starOutline}</span>
                    ))}
                  </div>
                  <span className="svc-review__score">{r.score}</span>
                </div>
              </div>
              <p className="svc-review__text">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Subscribe Modal ===== */}
      <Modal
        title="订阅年度托管套餐"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubscribe}
        confirmLoading={submitting}
        okText="确认订阅"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="property_id" label="选择房源" rules={[{ required: true, message: '请选择房源' }]}>
            <Select
              placeholder="请选择房源"
              options={properties.map((p) => ({
                value: p.id,
                label: `${p.room_number} · ${fmtMoney(p.monthly_rent, p.currency)}/月`,
              }))}
            />
          </Form.Item>
          <Form.Item name="type" label="套餐类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'annual_management', label: '年度托管（收租 + 代缴 + 托管费）' },
                { value: 'full_service', label: '全托管（含维修/清洁等增值服务）' },
              ]}
            />
          </Form.Item>
          <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <div className="rent-grid rent-grid--2">
            <Form.Item name="commission_rate" label="佣金（个月租金）" rules={[{ required: true }]}>
              <InputNumber min={0.5} max={3} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="management_fee_rate" label="托管费（个月租金/年）" rules={[{ required: true }]}>
              <InputNumber min={0} max={3} step={0.25} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default Services
