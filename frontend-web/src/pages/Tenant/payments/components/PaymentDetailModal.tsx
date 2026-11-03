import { useTranslation } from 'react-i18next'
import { Modal } from 'antd'
import dayjs from 'dayjs'
import { makeMethodLabelMap, makeRecordStatusMap, normalizeStatus } from '../constants'
import type { PaymentVoucher } from '../types'
import { openReceiptFile } from '../utils'

interface Props {
  bill: PaymentVoucher | null
  onClose: () => void
}

/** 凭证详情弹窗（字段全部来自支付单实体，不做臆造） */
const PaymentDetailModal = ({ bill, onClose }: Props) => {
  const { t } = useTranslation()
  const methodLabelMap = makeMethodLabelMap(t)
  const recordStatusMap = makeRecordStatusMap(t)

  return (
    <Modal
      title={t('tenantPayments.detailTitle')}
      open={!!bill}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {bill?.receipt_url && (
            <button
              type="button"
              className="rent-btn rent-btn--secondary"
              onClick={() => bill && openReceiptFile(bill)}
            >
              {t('tenantPayments.detailReceipt')}
            </button>
          )}
          <button
            type="button"
            className="rent-btn rent-btn--primary"
            onClick={onClose}
          >
            {t('tenantPayments.close')}
          </button>
        </div>
      }
    >
      {bill && (
        <div className="mt-detail">
          <div className="mt-detail__rows">
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantPayments.detailNo')}</span>
              <span className="mt-detail__value">{bill.id}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantPayments.detailAmount')}</span>
              <span className="mt-detail__value">
                ฿{Number(bill.amount || 0).toLocaleString()} {bill.currency || ''}
              </span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantPayments.detailDate')}</span>
              <span className="mt-detail__value">
                {bill.payment_date
                  ? dayjs(bill.payment_date).format(t('tenantPayments.dateDisplayFormat'))
                  : '—'}
              </span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantPayments.detailMethod')}</span>
              <span className="mt-detail__value">
                {methodLabelMap[bill.payment_method] || bill.payment_method || t('tenantPayments.otherMethod')}
              </span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantPayments.detailStatusCol')}</span>
              <span className="mt-detail__value">
                {recordStatusMap[normalizeStatus(bill.status)].label}
              </span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantPayments.detailUploadedAt')}</span>
              <span className="mt-detail__value">
                {bill.created_at
                  ? dayjs(bill.created_at).format('YYYY-MM-DD HH:mm')
                  : '—'}
              </span>
            </div>
            {bill.bill_type && (
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailBillType')}</span>
                <span className="mt-detail__value">{bill.bill_type}</span>
              </div>
            )}
            {bill.property_name && (
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailProperty')}</span>
                <span className="mt-detail__value">{bill.property_name}</span>
              </div>
            )}
            {bill.due_date && (
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailDue')}</span>
                <span className="mt-detail__value">
                  {dayjs(bill.due_date).format(t('tenantPayments.dateDisplayFormat'))}
                </span>
              </div>
            )}
            {bill.description && (
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailDesc')}</span>
                <span className="mt-detail__value">{bill.description}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

export default PaymentDetailModal
