import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'

interface ServiceItem {
  id: string
  name: string
  description: string
  price: number
  unit: string
  badge: string
  badgeType: 'primary' | 'info' | 'success' | 'warning'
  iconBg: string
  iconColor: string
  iconType: 'cleaning' | 'ac' | 'wifi' | 'utility'
  free?: boolean
}

interface Booking {
  id: string
  serviceId: string
  serviceName: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: string
  preferredDate?: string
  orderNo?: string
  amount?: number
  rating?: number
  [key: string]: any
}

// 接口状态（pending/assigned/in_progress/completed/cancelled）→ 页面展示状态
const normalizeBookingStatus = (status?: string): Booking['status'] => {
  const v = String(status || '').toLowerCase()
  if (v === 'completed') return 'completed'
  if (v === 'cancelled') return 'cancelled'
  if (v === 'in_progress') return 'in_progress'
  return 'pending'
}

// 服务类型展示名（接口 service_type 字段，含目录外类型）
const SERVICE_TYPE_LABEL: Record<string, string> = {
  cleaning: '家政清洁',
  ac_cleaning: '空调清洗',
  wifi_install: 'WiFi安装',
  utility_payment: '水电费代付',
  insurance: '保险代办',
  tax_payment: '税务代缴',
  annual_management: '年度托管',
}

const statusLabelMap: Record<Booking['status'], string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

const statusClassMap: Record<Booking['status'], string> = {
  pending: 'svc-order-status--warning',
  in_progress: 'svc-order-status--info',
  completed: 'svc-order-status--success',
  cancelled: 'svc-order-status--neutral',
}

const ServiceIcon = ({ type }: { type: ServiceItem['iconType'] }) => {
  if (type === 'ac') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20"/><path d="M2 12h20"/><path d="M4.93 4.93l14.14 14.14"/><path d="M19.07 4.93L4.93 19.07"/></svg>
    )
  }
  if (type === 'wifi') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
    )
  }
  if (type === 'utility') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>
  )
}

const SERVICES: ServiceItem[] = [
  {
    id: 'cleaning',
    name: '家政清洁',
    description: '专业保洁团队上门，全屋深度清洁，厨房卫浴专项处理。',
    price: 120,
    unit: '次',
    badge: '热门',
    badgeType: 'primary',
    iconBg: 'rgba(20, 184, 166, 0.12)',
    iconColor: 'var(--rent-primary)',
    iconType: 'cleaning',
  },
  {
    id: 'ac_cleaning',
    name: '空调清洗',
    description: '拆机深度清洗，杀菌除味，延长空调使用寿命，改善制冷效果。',
    price: 80,
    unit: '台',
    badge: '推荐',
    badgeType: 'info',
    iconBg: 'rgba(14,165,233,0.12)',
    iconColor: 'var(--state-info)',
    iconType: 'ac',
  },
  {
    id: 'wifi_install',
    name: 'WiFi安装',
    description: '专业网络工程师上门安装调试路由器，覆盖检测与信号优化。',
    price: 150,
    unit: '次',
    badge: '新上',
    badgeType: 'success',
    iconBg: 'rgba(22,163,74,0.12)',
    iconColor: 'var(--state-success)',
    iconType: 'wifi',
  },
  {
    id: 'utility_payment',
    name: '水电费代付',
    description: '平台代缴水电网费，账单自动同步，省心省力，无需排队。',
    price: 0,
    unit: '次',
    badge: '免费',
    badgeType: 'warning',
    iconBg: 'rgba(217,119,6,0.12)',
    iconColor: 'var(--state-warning)',
    iconType: 'utility',
    free: true,
  },
]

const TenantServices = () => {
  const [bookings, setBookings] = useState<Booking[]>([])

  const fetchBookings = useCallback(async () => {
    try {
      const res = await api.get('/service-orders')
      const payload = res.data?.data ?? res.data
      const items = payload?.items ?? []
      setBookings(
        items.map((o: any) => ({
          id: o.id,
          serviceId: o.service_type,
          serviceName: SERVICE_TYPE_LABEL[o.service_type] || o.service_type || '增值服务',
          status: normalizeBookingStatus(o.status),
          createdAt: o.created_at,
          preferredDate: o.scheduled_at,
          orderNo: o.order_no,
          amount: Number(o.amount || 0),
          rating: o.rating,
        })),
      )
    } catch {
      setBookings([])
    }
  }, [])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const handleBook = (service: ServiceItem) => {
    const newBooking: Booking = {
      id: `local-${Date.now()}`,
      serviceId: service.id,
      serviceName: service.name,
      status: 'pending',
      createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      amount: service.price,
    }
    setBookings((prev) => [newBooking, ...prev])
    message.success('预约成功')
  }

  const formatAmount = (amount?: number) => {
    if (!amount) return '฿0'
    return `฿${amount.toLocaleString()}`
  }

  const completedCount = bookings.filter((b) => b.status === 'completed').length
  const ratedBookings = bookings.filter((b) => typeof b.rating === 'number' && Number(b.rating) > 0)
  const avgRating = ratedBookings.length
    ? (ratedBookings.reduce((sum, b) => sum + Number(b.rating), 0) / ratedBookings.length).toFixed(1)
    : null

  const heroStats = [
    { value: String(SERVICES.length), label: '项服务' },
    { value: String(completedCount), label: '完成订单' },
    { value: avgRating ?? '—', label: '平均评分' },
  ]

  return (
    <>
      {/* Hero */}
      <section className="svc-hero">
        <div className="svc-hero__decor svc-hero__decor--1"></div>
        <div className="svc-hero__decor svc-hero__decor--2"></div>
        <div className="svc-hero__decor svc-hero__decor--3"></div>
        <div className="svc-hero__content">
          <span className="svc-hero__eyebrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .587l3.668 7.431L24 9.75l-6 5.847 1.417 8.265L12 19.771l-7.417 4.091L6 15.597 0 9.75l8.332-1.732z"/></svg>
            租客专享
          </span>
          <h2 className="svc-hero__title">推荐服务</h2>
          <p className="svc-hero__subtitle">一站式家居服务：清洁、维修、水电代付</p>
          <button
            className="svc-hero__action"
            onClick={() => {
              const el = document.getElementById('svc-categories')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            发起预约
          </button>
        </div>
        <div className="svc-hero__stats">
          {heroStats.map((s) => (
            <div key={s.label} className="svc-hero__stat">
              <div className="svc-hero__stat-value">{s.value}</div>
              <div className="svc-hero__stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Service Categories */}
      <section className="svc-section" id="svc-categories">
        <div className="svc-section__head">
          <h3 className="svc-section__title">服务分类</h3>
          <span className="svc-section__hint">选择你需要的家居服务</span>
        </div>
        <div className="svc-category-grid">
          {SERVICES.map((s) => (
            <div key={s.id} className="svc-category-card">
              <div className="svc-category-card__top">
                <div className="svc-category-card__icon" style={{ background: s.iconBg, color: s.iconColor }}>
                  <ServiceIcon type={s.iconType} />
                </div>
                <span className={`svc-pill-badge svc-pill-badge--${s.badgeType}`}>{s.badge}</span>
              </div>
              <h4 className="svc-category-card__title">{s.name}</h4>
              <p className="svc-category-card__desc">{s.description}</p>
              <div className="svc-category-card__footer">
                <div>
                  <span className="svc-category-card__price-label">{s.free ? '服务费' : '起价'}</span>
                  {s.free ? (
                    <span className="svc-category-card__price" style={{ color: 'var(--state-success)' }}>免费服务</span>
                  ) : (
                    <span className="svc-category-card__price">฿{s.price}<span className="svc-category-card__price-unit">/{s.unit}</span></span>
                  )}
                </div>
                <button className="svc-category-card__btn" onClick={() => handleBook(s)}>
                  预约服务
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* My Service Orders */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">我的服务订单</h3>
          <a className="svc-section__link">查看全部</a>
        </div>
        <div className="svc-order-list">
          {bookings.length ? (
            bookings.map((item) => {
              const dateStr = item.preferredDate
                ? `${dayjs(item.preferredDate).format('YYYY-MM-DD')} ${dayjs(item.createdAt).format('HH:mm')}`
                : dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')
              const stClass = statusClassMap[item.status]
              const stLabel = statusLabelMap[item.status]
              return (
                <div key={item.id} className="svc-order-item">
                  <div className="svc-order-item__left">
                    <span className="svc-order-item__no">{item.orderNo || `#${item.id.slice(-6)}`}</span>
                    <div className="svc-order-item__name">{item.serviceName}</div>
                  </div>
                  <div className="svc-order-item__mid">
                    <span className="svc-order-item__date">{dateStr}</span>
                    <span className="svc-order-item__amount">{formatAmount(item.amount)}</span>
                  </div>
                  <div className="svc-order-item__right">
                    <span className={`svc-order-status ${stClass}`}>
                      <span className="svc-order-status__dot"></span>
                      {stLabel}
                    </span>
                    {item.status === 'completed' ? (
                      <button className="rent-btn rent-btn--primary rent-btn--sm">评价</button>
                    ) : (
                      <button className="rent-btn rent-btn--secondary rent-btn--sm">详情</button>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rent-empty">暂无预约记录</div>
          )}
        </div>
      </section>

      {/* Service Reviews */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">服务评价</h3>
          <a className="svc-section__link">更多评价</a>
        </div>
        <div className="svc-reviews">
          <div className="rent-empty">暂无服务评价</div>
        </div>
      </section>

      {/* Promo Banner */}
      <section className="svc-promo">
        <div className="svc-promo__decor"></div>
        <div className="svc-promo__decor svc-promo__decor--2"></div>
        <div className="svc-promo__body">
          <div className="svc-promo__icon">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20 12v9H4v-9"/><rect x="2" y="7" width="20" height="5" rx="1"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
          </div>
          <div>
            <h3 className="svc-promo__title">年度服务套餐 · 省心更省钱</h3>
            <p className="svc-promo__desc">包含 6 次家政清洁 + 4 台空调清洗 + 免费水电代付，全年无忧</p>
            <div className="svc-promo__price-row">
              <span className="svc-promo__price">฿1,288</span>
              <span className="svc-promo__price-old">฿1,680</span>
              <span className="svc-promo__save">立省 ฿392</span>
            </div>
          </div>
        </div>
        <button className="svc-promo__btn" onClick={() => message.success('套餐购买成功')}>
          立即购买套餐
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </section>
    </>
  )
}

export default TenantServices
