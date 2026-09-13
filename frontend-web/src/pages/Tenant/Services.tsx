import { useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'

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
  [key: string]: any
}

interface Review {
  id: string
  name: string
  initial: string
  avatarBg: string
  service: string
  date: string
  score: number
  text: string
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

const Star = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
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

const STATIC_BOOKINGS: Booking[] = [
  {
    id: 'b-1',
    serviceId: 'cleaning',
    serviceName: '家政清洁',
    status: 'pending',
    createdAt: '2026-08-03 10:00:00',
    preferredDate: '2026-08-05',
    orderNo: 'SV2026080301',
    amount: 120,
  },
  {
    id: 'b-2',
    serviceId: 'ac_cleaning',
    serviceName: '空调清洗',
    status: 'in_progress',
    createdAt: '2026-08-02 14:00:00',
    preferredDate: '2026-08-04',
    orderNo: 'SV2026080202',
    amount: 160,
  },
  {
    id: 'b-3',
    serviceId: 'wifi_install',
    serviceName: 'WiFi安装',
    status: 'completed',
    createdAt: '2026-07-28 09:00:00',
    preferredDate: '2026-07-28',
    orderNo: 'SV2026072803',
    amount: 150,
  },
  {
    id: 'b-4',
    serviceId: 'utility_payment',
    serviceName: '水电费代付',
    status: 'completed',
    createdAt: '2026-07-25 16:00:00',
    preferredDate: '2026-07-25',
    orderNo: 'SV2026072504',
    amount: 0,
  },
  {
    id: 'b-5',
    serviceId: 'cleaning',
    serviceName: '家政清洁',
    status: 'cancelled',
    createdAt: '2026-07-20 11:00:00',
    preferredDate: '2026-07-20',
    orderNo: 'SV2026072005',
    amount: 120,
  },
]

const REVIEWS: Review[] = [
  {
    id: 'r-1',
    name: '王租客',
    initial: '王',
    avatarBg: 'var(--rent-primary)',
    service: '家政清洁',
    date: '2026-07-18',
    score: 5.0,
    text: '保洁阿姨非常专业，全屋打扫得干干净净，厨房油污处理得很到位，预约流程也很顺畅，下次还会选择。',
  },
  {
    id: 'r-2',
    name: 'Lim Wei',
    initial: '林',
    avatarBg: 'var(--state-info)',
    service: '空调清洗',
    date: '2026-07-15',
    score: 4.0,
    text: '师傅上门准时，两台空调清洗后制冷明显改善。就是工作时长比预期多了一点，总体满意。',
  },
  {
    id: 'r-3',
    name: 'Tan Mei',
    initial: '陈',
    avatarBg: 'var(--state-success)',
    service: 'WiFi安装',
    date: '2026-07-10',
    score: 5.0,
    text: '网络工程师很专业，30分钟就完成安装调试，全屋信号覆盖无死角，体验非常棒，强烈推荐！',
  },
]

const TenantServices = () => {
  const [bookings, setBookings] = useState<Booking[]>(STATIC_BOOKINGS)

  const handleBook = (service: ServiceItem) => {
    const orderNo = `SV${dayjs().format('YYYYMMDD')}${String(bookings.length + 1).padStart(2, '0')}`
    const newBooking: Booking = {
      id: `b-${Date.now()}`,
      serviceId: service.id,
      serviceName: service.name,
      status: 'pending',
      createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      orderNo,
      amount: service.price,
    }
    setBookings((prev) => [newBooking, ...prev])
    message.success('预约成功')
  }

  const formatAmount = (amount?: number) => {
    if (!amount) return '฿0'
    return `฿${amount.toLocaleString()}`
  }

  const heroStats = [
    { value: String(SERVICES.length), label: '项服务' },
    { value: '2,800+', label: '完成订单' },
    { value: '4.8', label: '平均评分' },
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
                    <span className="svc-order-item__no">{item.orderNo || item.id}</span>
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
          {REVIEWS.map((r) => (
            <div key={r.id} className="svc-review">
              <div className="svc-review__head">
                <div className="svc-review__user">
                  <div className="svc-review__avatar" style={{ background: r.avatarBg }}>{r.initial}</div>
                  <div>
                    <div className="svc-review__name">{r.name}</div>
                    <div className="svc-review__meta">{r.service} · {r.date}</div>
                  </div>
                </div>
                <div className="svc-review__rating">
                  <div className="svc-review__stars">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} filled={i <= Math.round(r.score)} />
                    ))}
                  </div>
                  <span className="svc-review__score">{r.score.toFixed(1)}</span>
                </div>
              </div>
              <p className="svc-review__text">{r.text}</p>
            </div>
          ))}
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
