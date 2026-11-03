import { useTranslation } from 'react-i18next'
import { formatMoney } from '@/lib/money'
import { ICONS, Icon } from '../icons'
import { makePropertyTypeLabel } from '../utils'
import type { PropertyItem, SaleListingItem } from '../types'

interface Props {
  biz: 'rent' | 'buy'
  onBizChange: (value: 'rent' | 'buy') => void
  detail: PropertyItem
  displayName: string
  saleListing: SaleListingItem | null
  buyPrice: number
  buyCurrency: string
  buyLoanAmount: number
  loanDownPct: number
  loanYears: number
}

/** 双业务价格区（出租 / 出售） */
const PropertyPriceSection = ({
  biz,
  onBizChange,
  detail,
  displayName,
  saleListing,
  buyPrice,
  buyCurrency,
  buyLoanAmount,
  loanDownPct,
  loanYears,
}: Props) => {
  const { t } = useTranslation()
  const currency = detail?.currency || 'THB'
  const PROPERTY_TYPE_LABEL = makePropertyTypeLabel(t)

  return (
    <section className="rent-detail-card rent-detail-price">
      <div className="rent-v17-tabs" role="tablist" aria-label={t('tenantPropertyDetail.ariaTabs')}>
        <button
          className="rent-v17-tab"
          type="button"
          role="tab"
          data-active={biz === 'rent'}
          onClick={() => onBizChange('rent')}
        >
          {t('tenantPropertyDetail.bizRent')}
        </button>
        <button
          className="rent-v17-tab"
          type="button"
          role="tab"
          data-active={biz === 'buy'}
          onClick={() => onBizChange('buy')}
        >
          {t('tenantPropertyDetail.bizBuy')}
        </button>
      </div>

      <div className="rent-v17-pane" hidden={biz !== 'rent'}>
        <div className="rent-detail-price__row">
          <div>
            <div className="rent-detail-price__value">
              {formatMoney(detail.monthly_rent, currency)}
              <small>{t('tenantPropertyDetail.perMonth')}</small>
            </div>
            <div className="rent-detail-price__tags">
              <span className="rent-badge rent-badge--primary">
                {PROPERTY_TYPE_LABEL[String(detail.property_type || '')] || t('tenantPropertyDetail.inRent')}
              </span>
              <span className="rent-badge rent-badge--primary">
                {detail.furnished ? t('tenantPropertyDetail.fullFurniture') : t('tenantPropertyDetail.selfFurniture')}
              </span>
            </div>
          </div>
          {detail.status === 'vacant' && (
            <span className="rent-badge rent-badge--success">{t('tenantPropertyDetail.canView')}</span>
          )}
        </div>
        <h1 className="rent-detail-price__name">{displayName}</h1>
        <p className="rent-detail-price__addr">
          <Icon d={ICONS.pin} />
          {[detail.project_name, detail.address].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      <div className="rent-v17-pane" hidden={biz !== 'buy'}>
        {saleListing ? (
          <>
            <div className="rent-detail-price__row">
              <div>
                <div className="rent-detail-price__value rent-v17-price--buy">
                  {formatMoney(buyPrice, buyCurrency)}
                  <small>{t('tenantPropertyDetail.totalPrice')}</small>
                </div>
                <div className="rent-detail-price__tags">
                  <span className="rent-badge rent-badge--primary">{t('tenantPropertyDetail.available')}</span>
                  {saleListing.title && (
                    <span className="rent-badge rent-badge--primary">{saleListing.title}</span>
                  )}
                </div>
              </div>
              <span className="rent-badge rent-badge--success">{t('tenantPropertyDetail.canView')}</span>
            </div>
            <div className="rent-v17-loan">
              <span className="rent-v17-loan__item">{t('tenantPropertyDetail.downPayment', { pct: loanDownPct })}</span>
              <span className="rent-v17-loan__sep">·</span>
              <span className="rent-v17-loan__item">
                {t('tenantPropertyDetail.loan')} <b>{formatMoney(buyLoanAmount, buyCurrency)}</b>
              </span>
              <span className="rent-v17-loan__sep">·</span>
              <span className="rent-v17-loan__item">{t('tenantPropertyDetail.yearTerm', { years: loanYears })}</span>
            </div>
            <h2 className="rent-detail-price__name">
              {saleListing.title || displayName}
            </h2>
            <p className="rent-detail-price__addr">
              <Icon d={ICONS.pin} />
              {saleListing.address || detail.address || '—'}
            </p>
          </>
        ) : (
          <div className="rent-empty">{t('tenantPropertyDetail.noSaleListing')}</div>
        )}
      </div>
    </section>
  )
}

export default PropertyPriceSection
