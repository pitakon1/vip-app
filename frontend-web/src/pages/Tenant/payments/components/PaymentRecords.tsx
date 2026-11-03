import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import DataState from '@/components/DataState'
import {
  defaultMethodIcon,
  makeMethodLabelMap,
  makeRecordStatusMap,
  methodIconMap,
  normalizeStatus,
} from '../constants'
import type { FilterKey, PaymentVoucher } from '../types'
import { scrollToUpload } from '../utils'

interface Props {
  monthGroups: [string, PaymentVoucher[]][]
  filter: FilterKey
  keyword: string
  isError: boolean
  onRetry: () => void
  onView: (bill: PaymentVoucher) => void
}

/** 付款记录：按月分组 + 凭证卡片 + 空态/失败态 */
const PaymentRecords = ({ monthGroups, filter, keyword, isError, onRetry, onView }: Props) => {
  const { t } = useTranslation()
  const methodLabelMap = makeMethodLabelMap(t)
  const recordStatusMap = makeRecordStatusMap(t)

  return (
    <div className="rent-pay-section">
      <h3 className="rent-pay-section__title">{t('tenantPayments.recordsTitle')}</h3>
      {isError ? (
        <DataState
          error={t('common.loadFailed')}
          retryText={t('common.retry')}
          onRetry={onRetry}
        />
      ) : monthGroups.length ? (
        monthGroups.map(([month, bills]) => (
          <div key={month} className="rent-pay-month">
            <div className="rent-pay-month__header">
              <h4 className="rent-pay-month__title">{month}</h4>
              <span className="rent-pay-month__count">{bills.length} {t('tenantPayments.countUnit')}</span>
            </div>
            {bills.map((bill, idx) => {
              const statusKey = normalizeStatus(bill.status)
              const st = recordStatusMap[statusKey]
              const method = methodLabelMap[bill.payment_method] || bill.payment_method || t('tenantPayments.otherMethod')
              const uploadDate = dayjs(bill.created_at || bill.payment_date).format('YYYY-MM-DD')
              const recordNo = `PAY-${dayjs(bill.payment_date || bill.created_at).format('YYYY-MM')}${String(idx + 1).padStart(2, '0')}`
              return (
                <div key={bill.id} className="rent-pay-record">
                  <div className="rent-pay-record__method">
                    {methodIconMap[bill.payment_method] || defaultMethodIcon}
                  </div>
                  <div className="rent-pay-record__main">
                    <div className="rent-pay-record__id">{bill.id.startsWith('local-') ? recordNo : bill.id}</div>
                    <div className="rent-pay-record__meta">
                      <span>{method}</span>
                      <span className="rent-pay-record__meta-sep"></span>
                      <span>{t('tenantPayments.uploadedAt', { date: uploadDate })}</span>
                    </div>
                  </div>
                  <div className="rent-pay-record__amount">฿{Number(bill.amount || 0).toLocaleString()}</div>
                  <div className={`rent-pay-record__status ${st.cls}`}>
                    <span className="rent-pay-record__status-dot"></span>{st.label}
                  </div>
                  <div className="rent-pay-record__actions">
                    {statusKey === 'rejected' ? (
                      <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={scrollToUpload}>{t('tenantPayments.reupload')}</button>
                    ) : (
                      <button
                        className="rent-btn rent-btn--secondary rent-btn--sm"
                        onClick={() => onView(bill)}
                      >
                        {t('tenantPayments.view')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))
      ) : (
        <DataState
          empty
          filtered={filter !== 'all' || !!keyword.trim()}
          emptyTitle={t('tenantPayments.empty')}
        />
      )}
    </div>
  )
}

export default PaymentRecords
