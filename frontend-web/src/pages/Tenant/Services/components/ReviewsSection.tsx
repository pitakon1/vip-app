/**
 * 服务评价展示区（只展示真实已评价订单）。
 * 纯结构拆分自 pages/Tenant/Services.tsx，类名与星标渲染保持不变。
 */
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../constants'
import type { Booking } from '../types'

export default function ReviewsSection({ ratedBookings }: { ratedBookings: Booking[] }) {
  const { t } = useTranslation()

  return (
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
  )
}
