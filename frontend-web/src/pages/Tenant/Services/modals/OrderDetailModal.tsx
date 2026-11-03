/**
 * 服务订单详情弹窗。
 * 纯结构拆分自 pages/Tenant/Services.tsx，字段、格式化与只读展示保持不变。
 */
import { useTranslation } from 'react-i18next'
import { Modal, Rate } from 'antd'
import { formatAmount, formatDateTime } from '../constants'
import type { Booking } from '../types'

export default function OrderDetailModal({
  order,
  statusLabelMap,
  onCancel,
}: {
  order: Booking | null
  statusLabelMap: Record<Booking['status'], string>
  onCancel: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      title={t('tenantServices.detailTitle')}
      open={!!order}
      onCancel={onCancel}
      footer={null}
      width={520}
    >
      {order && (
        <div className="mt-detail__rows">
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailNo')}</span>
            <span className="mt-detail__value">#{order.id.slice(-6)}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
            <span className="mt-detail__value">{order.serviceName}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailStatus')}</span>
            <span className="mt-detail__value">{statusLabelMap[order.status]}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailCreated')}</span>
            <span className="mt-detail__value">{formatDateTime(order.createdAt)}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailScheduled')}</span>
            <span className="mt-detail__value">{formatDateTime(order.preferredDate)}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailCompleted')}</span>
            <span className="mt-detail__value">{formatDateTime(order.completedAt)}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailAmount')}</span>
            <span className="mt-detail__value">{formatAmount(order.amount)}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailNotes')}</span>
            <span className="mt-detail__value">{order.notes || '—'}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.myReview')}</span>
            <span className="mt-detail__value">
              {order.rating ? (
                <Rate disabled value={Number(order.rating)} style={{ fontSize: 14 }} />
              ) : (
                t('tenantServices.notReviewed')
              )}
            </span>
          </div>
          {order.reviewComment && (
            <div className="mt-detail__block">
              <div className="mt-detail__label">{t('tenantServices.detailFeedback')}</div>
              <p className="mt-detail__desc">{order.reviewComment}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
