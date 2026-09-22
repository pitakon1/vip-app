import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Modal, Rate } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'

/** GET /billing/pricing → service_catalog 的单项（真实价目，不含税） */
interface CatalogItem {
  code: string
  label_zh?: string
  label_en?: string
  label_th?: string
  unit?: string
  base_price?: number
}

interface Booking {
  id: string
  serviceId: string
  serviceName: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: string
  preferredDate?: string
  completedAt?: string
  amount?: number
  notes?: string
  rating?: number
  reviewComment?: string
}

type IconType = 'cleaning' | 'ac' | 'wifi' | 'utility' | 'other'

// 服务图标（按后端真实服务编码映射）
const ICON_TYPE: Record<string, IconType> = {
  cleaning: 'cleaning',
  ac_cleaning: 'ac',
  wifi_install: 'wifi',
  utility_payment: 'utility',
}

// 商品卡配色/角标（按编码，未列出走默认）
const CARD_META: Record<string, { badgeType: 'primary' | 'info' | 'success' | 'warning'; iconBg: string; iconColor: string }> = {
  cleaning: { badgeType: 'primary', iconBg: 'rgba(20, 184, 166, 0.12)', iconColor: 'var(--rent-primary)' },
  ac_cleaning: { badgeType: 'info', iconBg: 'rgba(14,165,233,0.12)', iconColor: 'var(--state-info)' },
  wifi_install: { badgeType: 'success', iconBg: 'rgba(22,163,74,0.12)', iconColor: 'var(--state-success)' },
  utility_payment: { badgeType: 'warning', iconBg: 'rgba(217,119,6,0.12)', iconColor: 'var(--state-warning)' },
}
const DEFAULT_CARD_META = { badgeType: 'info' as const, iconBg: 'rgba(14,165,233,0.12)', iconColor: 'var(--state-info)' }

// 年度服务套餐价（与下方 banner 展示价保持一致）
const PROMO_PRICE = 1288

// 接口状态（pending/assigned/in_progress/completed/cancelled）→ 页面展示状态
const normalizeBookingStatus = (status?: string): Booking['status'] => {
  const v = String(status || '').toLowerCase()
  if (v === 'completed') return 'completed'
  if (v === 'cancelled') return 'cancelled'
  if (v === 'in_progress') return 'in_progress'
  return 'pending'
}

const statusClassMap: Record<Booking['status'], string> = {
  pending: 'svc-order-status--warning',
  in_progress: 'svc-order-status--info',
  completed: 'svc-order-status--success',
  cancelled: 'svc-order-status--neutral',
}

const ServiceIcon = ({ type }: { type: IconType }) => {
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

interface ServicesPayload {
  catalog: CatalogItem[]
  orders: any[]
  leasePropertyId: string
}

const TenantServices = () => {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const lang = (i18n.language || 'zh').slice(0, 2)

  // 下单确认弹窗 / 详情弹窗 / 评价弹窗
  const [bookItem, setBookItem] = useState<CatalogItem | null>(null)
  const [detailOrder, setDetailOrder] = useState<Booking | null>(null)
  const [reviewOrder, setReviewOrder] = useState<Booking | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const statusLabelMap: Record<Booking['status'], string> = {
    pending: t('tenantServices.bookStatus.pending'),
    in_progress: t('tenantServices.bookStatus.in_progress'),
    completed: t('tenantServices.bookStatus.completed'),
    cancelled: t('tenantServices.bookStatus.cancelled'),
  }

  // 服务展示名：优先语言包（服务名已本地化），退回价目表标签，最后退回编码
  const serviceNameOf = useCallback(
    (code: string, catalog: CatalogItem[]) => {
      const key = `tenantServices.serviceType.${code}`
      const translated = t(key)
      if (translated && translated !== key) return translated
      const item = catalog.find((c) => c.code === code)
      const label = lang === 'en' ? item?.label_en : lang === 'th' ? item?.label_th : item?.label_zh
      return label || code || t('tenantServices.otherService')
    },
    [t, lang],
  )

  const unitOf = useCallback(
    (code: string, catalog: CatalogItem[]) => {
      const key = `tenantServices.serviceUnit.${code}`
      const unit = catalog.find((c) => c.code === code)?.unit || ''
      return t(key, { defaultValue: unit })
    },
    [t],
  )

  const q = useCachedQuery<ServicesPayload>({
    queryKey: ['tenant-services', uid],
    cacheKey: `tenant-services:${uid}`,
    queryFn: async () => {
      const [cRes, oRes, lRes] = await Promise.allSettled([
        api.get('/billing/pricing'),
        api.get('/service-orders'),
        api.get('/leases'),
      ])

      // 真实价目表（不含税基准价），页面不再使用硬编码假价格
      let catalog: CatalogItem[] = []
      if (cRes.status === 'fulfilled') {
        const cPayload = cRes.value.data?.data ?? cRes.value.data
        const cat: Record<string, any> = cPayload?.service_catalog ?? {}
        catalog = Object.entries(cat).map(([code, v]) => ({ code, ...(v as object) }))
      }

      let orders: any[] = []
      if (oRes.status === 'fulfilled') {
        const payload = oRes.value.data?.data ?? oRes.value.data
        orders = payload?.items ?? []
      }

      // 服务订单必须挂到具体 property_id，取当前生效租约的房源
      let leasePropertyId = ''
      if (lRes.status === 'fulfilled') {
        const lPayload = lRes.value.data?.data ?? lRes.value.data
        const leases: any[] = lPayload?.items ?? []
        const lease = leases.find((l) => l.status === 'active') || leases[0]
        leasePropertyId = lease?.property_id || lease?.property?.id || ''
      }

      return { catalog, orders, leasePropertyId }
    },
  })

  const catalog = q.data?.catalog ?? []
  const leasePropertyId = q.data?.leasePropertyId ?? ''
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  const bookings: Booking[] = useMemo(
    () =>
      (q.data?.orders ?? []).map((o: any) => ({
        id: o.id,
        serviceId: o.service_type,
        serviceName: serviceNameOf(o.service_type, catalog),
        status: normalizeBookingStatus(o.status),
        createdAt: o.created_at,
        preferredDate: o.scheduled_at,
        completedAt: o.completed_at,
        amount: Number(o.amount || 0),
        notes: o.notes,
        rating: typeof o.rating === 'number' ? o.rating : undefined,
        reviewComment: o.review_comment,
      })),
    [q.data?.orders, catalog, serviceNameOf],
  )

  // 真实下单：POST /service-orders（必须关联生效租约的房源，失败即失败，不伪造本地记录）
  const submitBooking = async () => {
    if (!bookItem) return
    if (!user?.id) {
      message.warning(t('tenantServices.loginWarn'))
      return
    }
    if (!leasePropertyId) {
      message.warning(t('tenantServices.noLeaseWarn'))
      return
    }
    setSubmitting(true)
    try {
      await api.post('/service-orders', {
        orderer_id: user.id,
        orderer_type: (user as any).role === 'owner' ? 'owner' : 'tenant',
        property_id: leasePropertyId,
        service_type: bookItem.code,
        amount: Number(bookItem.base_price || 0),
        currency: 'THB',
        notes: t('tenantServices.bookNotes'),
        billing_model: 'per_use',
        billing_amount: Number(bookItem.base_price || 0),
      })
      message.success(t('tenantServices.bookedSuccess'))
      setBookItem(null)
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('tenantServices.bookFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // 年度服务套餐：同样落到真实服务订单（annual_management），不再只弹「购买成功」
  const buyPromo = async () => {
    if (!user?.id) {
      message.warning(t('tenantServices.loginWarn'))
      return
    }
    if (!leasePropertyId) {
      message.warning(t('tenantServices.noLeaseWarn'))
      return
    }
    try {
      await api.post('/service-orders', {
        orderer_id: user.id,
        orderer_type: (user as any).role === 'owner' ? 'owner' : 'tenant',
        property_id: leasePropertyId,
        service_type: 'annual_management',
        amount: PROMO_PRICE,
        currency: 'THB',
        notes: t('tenantServices.promoTitle'),
      })
      message.success(t('tenantServices.purchaseSuccess'))
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('tenantServices.bookFailed'))
    }
  }

  const openReview = (item: Booking) => {
    setReviewOrder(item)
    setReviewRating(5)
    setReviewComment('')
  }

  const submitReview = async () => {
    if (!reviewOrder) return
    setSubmitting(true)
    try {
      await api.post(`/service-orders/${reviewOrder.id}/review`, {
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      })
      message.success(t('tenantServices.reviewSuccess'))
      setReviewOrder(null)
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('tenantServices.reviewFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const formatAmount = (amount?: number) => `฿${Number(amount || 0).toLocaleString()}`
  const formatDateTime = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—')

  const completedCount = bookings.filter((b) => b.status === 'completed').length
  const ratedBookings = bookings.filter((b) => typeof b.rating === 'number' && Number(b.rating) > 0)
  const avgRating = ratedBookings.length
    ? (ratedBookings.reduce((sum, b) => sum + Number(b.rating), 0) / ratedBookings.length).toFixed(1)
    : null

  const heroStats = [
    { value: String(catalog.length), label: t('tenantServices.itemCount') },
    { value: String(completedCount), label: t('tenantServices.completedOrders') },
    { value: avgRating ?? '—', label: t('tenantServices.avgRating') },
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
            {t('tenantServices.tenantExclusive')}
          </span>
          <h2 className="svc-hero__title">{t('tenantServices.recommendedTitle')}</h2>
          <p className="svc-hero__subtitle">{t('tenantServices.recommendedSubtitle')}</p>
          <button
            className="svc-hero__action"
            onClick={() => {
              const el = document.getElementById('svc-categories')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('tenantServices.startBooking')}
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

      {/* Service Categories（真实价目表） */}
      <section className="svc-section" id="svc-categories">
        <div className="svc-section__head">
          <h3 className="svc-section__title">{t('tenantServices.categoryTitle')}</h3>
          <span className="svc-section__hint">{t('tenantServices.categoryHint')}</span>
        </div>
        {catalog.length === 0 ? (
          <div className="rent-empty">{t('tenantServices.emptyCatalog')}</div>
        ) : (
          <div className="svc-category-grid">
            {catalog.map((item) => {
              const meta = CARD_META[item.code] ?? DEFAULT_CARD_META
              const badge = t(`tenantServices.serviceBadge.${item.code}`, { defaultValue: '' })
              const desc = t(`tenantServices.serviceDesc.${item.code}`, { defaultValue: '' })
              const price = Number(item.base_price || 0)
              return (
                <div key={item.code} className="svc-category-card">
                  <div className="svc-category-card__top">
                    <div className="svc-category-card__icon" style={{ background: meta.iconBg, color: meta.iconColor }}>
                      <ServiceIcon type={ICON_TYPE[item.code] ?? 'other'} />
                    </div>
                    {badge && <span className={`svc-pill-badge svc-pill-badge--${meta.badgeType}`}>{badge}</span>}
                  </div>
                  <h4 className="svc-category-card__title">{serviceNameOf(item.code, catalog)}</h4>
                  {desc && <p className="svc-category-card__desc">{desc}</p>}
                  <div className="svc-category-card__footer">
                    <div>
                      <span className="svc-category-card__price-label">
                        {price > 0 ? t('tenantServices.priceFrom') : t('tenantServices.priceLabel')}
                      </span>
                      {price > 0 ? (
                        <span className="svc-category-card__price">
                          ฿{price.toLocaleString()}
                          <span className="svc-category-card__price-unit">
                            /{unitOf(item.code, catalog)}
                          </span>
                        </span>
                      ) : (
                        <span className="svc-category-card__price" style={{ color: 'var(--state-success)' }}>
                          {t('tenantServices.freeService')}
                        </span>
                      )}
                    </div>
                    <button className="svc-category-card__btn" onClick={() => setBookItem(item)}>
                      {t('tenantServices.bookService')}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* My Service Orders */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">{t('tenantServices.myOrders')}</h3>
          <span className="svc-section__hint">{t('tenantServices.orderCount', { count: bookings.length })}</span>
        </div>
        <div className="svc-order-list">
          {bookings.length ? (
            bookings.map((item) => {
              const dateStr = item.preferredDate
                ? formatDateTime(item.preferredDate)
                : formatDateTime(item.createdAt)
              const stClass = statusClassMap[item.status]
              const stLabel = statusLabelMap[item.status]
              return (
                <div key={item.id} className="svc-order-item">
                  <div className="svc-order-item__left">
                    <span className="svc-order-item__no">#{item.id.slice(-6)}</span>
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
                    {item.status === 'completed' && !item.rating ? (
                      <button
                        className="rent-btn rent-btn--primary rent-btn--sm"
                        onClick={() => openReview(item)}
                      >
                        {t('tenantServices.review')}
                      </button>
                    ) : (
                      <button
                        className="rent-btn rent-btn--secondary rent-btn--sm"
                        onClick={() => setDetailOrder(item)}
                      >
                        {t('tenantServices.detail')}
                      </button>
                    )}
                    {item.status === 'completed' && !!item.rating && (
                      <button
                        className="rent-btn rent-btn--secondary rent-btn--sm"
                        onClick={() => setDetailOrder(item)}
                      >
                        {t('tenantServices.reviewed')} · {item.rating}★
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rent-empty">{t('tenantServices.emptyOrders')}</div>
          )}
        </div>
      </section>

      {/* Service Reviews（只展示真实已评价订单） */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">{t('tenantServices.reviewsTitle')}</h3>
          <span className="svc-section__hint">{t('tenantServices.reviewCount', { count: ratedBookings.length })}</span>
        </div>
        <div className="svc-reviews">
          {ratedBookings.length ? (
            ratedBookings.map((item) => (
              <div key={item.id} className="svc-review">
                <div className="svc-review__head">
                  <div className="svc-review__user">
                    <div className="svc-review__avatar" style={{ background: 'var(--rent-primary)' }}>
                      {item.serviceName.slice(0, 1)}
                    </div>
                    <div>
                      <div className="svc-review__name">{item.serviceName}</div>
                      <div className="svc-review__meta">
                        {t('tenantServices.myReview')} · {formatDateTime(item.completedAt || item.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="svc-review__rating">
                    <span className="svc-review__stars">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} style={{ opacity: n <= Number(item.rating) ? 1 : 0.25 }}>★</span>
                      ))}
                    </span>
                    <span className="svc-review__score">{Number(item.rating).toFixed(1)}</span>
                  </div>
                </div>
                {item.reviewComment && <p className="svc-review__text">{item.reviewComment}</p>}
              </div>
            ))
          ) : (
            <div className="rent-empty">{t('tenantServices.emptyReviews')}</div>
          )}
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
            <h3 className="svc-promo__title">{t('tenantServices.promoTitle')}</h3>
            <p className="svc-promo__desc">{t('tenantServices.promoDesc')}</p>
            <div className="svc-promo__price-row">
              <span className="svc-promo__price">฿{PROMO_PRICE.toLocaleString()}</span>
              <span className="svc-promo__price-old">฿1,680</span>
              <span className="svc-promo__save">{t('tenantServices.saveLabel')}</span>
            </div>
          </div>
        </div>
        <button
          className="svc-promo__btn"
          onClick={() =>
            Modal.confirm({
              title: t('tenantServices.promoTitle'),
              content: t('tenantServices.promoConfirm', { price: formatAmount(PROMO_PRICE) }),
              okText: t('tenantServices.buyNow'),
              cancelText: t('tenantServices.cancel'),
              onOk: buyPromo,
            })
          }
        >
          {t('tenantServices.buyNow')}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </section>

      {/* 下单确认（真实创建服务订单） */}
      <Modal
        title={t('tenantServices.bookTitle')}
        open={!!bookItem}
        onCancel={() => setBookItem(null)}
        onOk={submitBooking}
        confirmLoading={submitting}
        okText={t('tenantServices.bookConfirm')}
        cancelText={t('tenantServices.cancel')}
      >
        <div className="mt-detail__rows">
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
            <span className="mt-detail__value">{bookItem ? serviceNameOf(bookItem.code, catalog) : '—'}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.bookUnitPrice')}</span>
            <span className="mt-detail__value">
              {formatAmount(Number(bookItem?.base_price || 0))}
              {bookItem ? ` / ${unitOf(bookItem.code, catalog)}` : ''}
            </span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.bookTotal')}</span>
            <span className="mt-detail__value">{formatAmount(Number(bookItem?.base_price || 0))}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.bookTax')}</span>
            <span className="mt-detail__value">{t('tenantServices.bookTaxNote')}</span>
          </div>
        </div>
        {!leasePropertyId && <p className="mt-detail__desc">{t('tenantServices.noLeaseWarn')}</p>}
      </Modal>

      {/* 订单详情 */}
      <Modal
        title={t('tenantServices.detailTitle')}
        open={!!detailOrder}
        onCancel={() => setDetailOrder(null)}
        footer={null}
        width={520}
      >
        {detailOrder && (
          <div className="mt-detail__rows">
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailNo')}</span>
              <span className="mt-detail__value">#{detailOrder.id.slice(-6)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
              <span className="mt-detail__value">{detailOrder.serviceName}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailStatus')}</span>
              <span className="mt-detail__value">{statusLabelMap[detailOrder.status]}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailCreated')}</span>
              <span className="mt-detail__value">{formatDateTime(detailOrder.createdAt)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailScheduled')}</span>
              <span className="mt-detail__value">{formatDateTime(detailOrder.preferredDate)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailCompleted')}</span>
              <span className="mt-detail__value">{formatDateTime(detailOrder.completedAt)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailAmount')}</span>
              <span className="mt-detail__value">{formatAmount(detailOrder.amount)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailNotes')}</span>
              <span className="mt-detail__value">{detailOrder.notes || '—'}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.myReview')}</span>
              <span className="mt-detail__value">
                {detailOrder.rating ? (
                  <Rate disabled value={Number(detailOrder.rating)} style={{ fontSize: 14 }} />
                ) : (
                  t('tenantServices.notReviewed')
                )}
              </span>
            </div>
            {detailOrder.reviewComment && (
              <div className="mt-detail__block">
                <div className="mt-detail__label">{t('tenantServices.detailFeedback')}</div>
                <p className="mt-detail__desc">{detailOrder.reviewComment}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 评价服务 */}
      <Modal
        title={t('tenantServices.reviewTitle')}
        open={!!reviewOrder}
        onCancel={() => setReviewOrder(null)}
        onOk={submitReview}
        confirmLoading={submitting}
        okText={t('tenantServices.reviewSubmit')}
        cancelText={t('tenantServices.cancel')}
      >
        {reviewOrder && (
          <div className="mt-detail__rows">
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
              <span className="mt-detail__value">{reviewOrder.serviceName}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.reviewRatingLabel')}</span>
              <span className="mt-detail__value">
                <Rate value={reviewRating} onChange={setReviewRating} />
              </span>
            </div>
            <div className="mt-detail__block">
              <div className="mt-detail__label">{t('tenantServices.reviewFeedbackLabel')}</div>
              <textarea
                className="mt-detail__textarea"
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={t('tenantServices.reviewFeedbackPlaceholder')}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default TenantServices