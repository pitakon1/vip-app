import { useTranslation } from 'react-i18next'
import { normalizeStatus } from '../constants'
import type { PaymentVoucher } from '../types'

/** 付款状态摘要条 */
const PaymentsSummary = ({ data }: { data: PaymentVoucher[] }) => {
  const { t } = useTranslation()

  return (
    <div className="rent-pay-summary">
      <div className="rent-pay-summary__item">
        <div><span className="rent-pay-summary__num">{data.length}</span><span className="rent-pay-summary__num-unit">{t('tenantPayments.uploadedCount')}</span></div>
        <div className="rent-pay-summary__label">{t('tenantPayments.uploadedVouchers')}</div>
      </div>
      <div className="rent-pay-summary__item">
        <div><span className="rent-pay-summary__num">{data.filter((d) => normalizeStatus(d.status) === 'pending').length}</span><span className="rent-pay-summary__num-unit">{t('tenantPayments.unitCount')}</span></div>
        <div className="rent-pay-summary__label">{t('tenantPayments.pendingReview')}</div>
      </div>
      <div className="rent-pay-summary__item">
        <div><span className="rent-pay-summary__num">{data.filter((d) => normalizeStatus(d.status) === 'approved').length}</span><span className="rent-pay-summary__num-unit">{t('tenantPayments.unitCount')}</span></div>
        <div className="rent-pay-summary__label">{t('tenantPayments.confirmed')}</div>
      </div>
    </div>
  )
}

export default PaymentsSummary
