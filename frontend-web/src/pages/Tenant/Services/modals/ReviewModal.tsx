/**
 * 评价服务弹窗。
 * 纯结构拆分自 pages/Tenant/Services.tsx，评分与评语交互保持不变。
 */
import { useTranslation } from 'react-i18next'
import { Modal, Rate } from 'antd'
import type { Booking } from '../types'

export default function ReviewModal({
  order,
  rating,
  onRatingChange,
  comment,
  onCommentChange,
  submitting,
  onCancel,
  onOk,
}: {
  order: Booking | null
  rating: number
  onRatingChange: (value: number) => void
  comment: string
  onCommentChange: (value: string) => void
  submitting: boolean
  onCancel: () => void
  onOk: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      title={t('tenantServices.reviewTitle')}
      open={!!order}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={submitting}
      okText={t('tenantServices.reviewSubmit')}
      cancelText={t('tenantServices.cancel')}
    >
      {order && (
        <div className="mt-detail__rows">
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
            <span className="mt-detail__value">{order.serviceName}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.reviewRatingLabel')}</span>
            <span className="mt-detail__value">
              <Rate value={rating} onChange={onRatingChange} />
            </span>
          </div>
          <div className="mt-detail__block">
            <div className="mt-detail__label">{t('tenantServices.reviewFeedbackLabel')}</div>
            <textarea
              className="mt-detail__textarea"
              rows={3}
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder={t('tenantServices.reviewFeedbackPlaceholder')}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
