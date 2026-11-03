import { useTranslation } from 'react-i18next'
import { scrollToUpload } from '../utils'

interface Props {
  pendingTotal: number
  heroProperty: string
  heroDue: string
}

/** 本月租金 Hero 大卡片 */
const PaymentsHero = ({ pendingTotal, heroProperty, heroDue }: Props) => {
  const { t } = useTranslation()

  return (
    <div className="rent-pay-hero">
      <div className="rent-pay-hero__deco rent-pay-hero__deco--1"></div>
      <div className="rent-pay-hero__deco rent-pay-hero__deco--2"></div>
      <div className="rent-pay-hero__deco rent-pay-hero__deco--3"></div>
      <div className="rent-pay-hero__content">
        <p className="rent-pay-hero__label">{t('tenantPayments.monthRent')}</p>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 className="rent-pay-hero__amount">฿{pendingTotal.toLocaleString()}</h2>
          <span className="rent-pay-hero__status"><span className="rent-pay-hero__status-dot"></span>{t('tenantPayments.toPay')}</span>
        </div>
        {(heroProperty || heroDue) && (
          <div className="rent-pay-hero__meta">
            {heroProperty && (
              <span className="rent-pay-hero__meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>
                {heroProperty}
              </span>
            )}
            {heroProperty && heroDue && <span className="rent-pay-hero__meta-sep"></span>}
            {heroDue && (
              <span className="rent-pay-hero__meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {t('tenantPayments.payBefore', { date: heroDue })}
              </span>
            )}
          </div>
        )}
        <button className="rent-pay-hero__upload" onClick={scrollToUpload}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          {t('tenantPayments.uploadVoucher')}
        </button>
      </div>
    </div>
  )
}

export default PaymentsHero
