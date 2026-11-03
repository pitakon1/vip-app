/**
 * 租客「我的订单」列表。
 * 纯结构拆分自 pages/Tenant/Services.tsx，类名、状态样式与按钮逻辑保持不变。
 */
import { useTranslation } from 'react-i18next'
import { formatAmount, formatDateTime, statusClassMap } from '../constants'
import type { Booking } from '../types'

export default function TenantOrders({
  bookings,
  statusLabelMap,
  onReview,
  onDetail,
}: {
  bookings: Booking[]
  statusLabelMap: Record<Booking['status'], string>
  onReview: (item: Booking) => void
  onDetail: (item: Booking) => void
}) {
  const { t } = useTranslation()

  return (
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
                    <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => onReview(item)}>
                      {t('tenantServices.review')}
                    </button>
                  ) : (
                    <button className="rent-btn rent-btn--secondary rent-btn--sm" onClick={() => onDetail(item)}>
                      {t('tenantServices.detail')}
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
  )
}
