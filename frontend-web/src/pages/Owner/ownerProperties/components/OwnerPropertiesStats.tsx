import { useTranslation } from 'react-i18next'
import type { OwnerPropertyStatusCounts } from '../types'

interface Props {
  statusCount: OwnerPropertyStatusCounts
  totalProps: number
  occupancyPct: number
}

/** 统计行（名下房源 / 在租 / 空置 / 在售） */
const OwnerPropertiesStats = ({ statusCount, totalProps, occupancyPct }: Props) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__body" style={{ padding: 12 }}>
        <div className="rent-grid rent-grid--4" style={{ gap: 12 }}>
          <div className="rent-stat-card">
            <div className="rent-stat-card__label">{t('ownerProperties.statTotal')}</div>
            <div className="rent-stat-card__value">
              {totalProps} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('ownerProperties.unitSuit')}</span>
            </div>
            <div className="rent-stat-card__delta">{statusCount.for_sale} {t('ownerProperties.onSaleSuffix')}</div>
          </div>
          <div className="rent-stat-card">
            <div className="rent-stat-card__label">{t('ownerProperties.statRented')}</div>
            <div className="rent-stat-card__value">
              {statusCount.rented} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('ownerProperties.unitSuit')}</span>
            </div>
            <div className="rent-stat-card__delta rent-stat-card__delta--up">{t('ownerProperties.occupancyPrefix')} {occupancyPct}%</div>
          </div>
          <div className="rent-stat-card">
            <div className="rent-stat-card__label">{t('ownerProperties.statVacant')}</div>
            <div className="rent-stat-card__value">
              {statusCount.vacant} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('ownerProperties.unitSuit')}</span>
            </div>
            <div className="rent-stat-card__delta">{t('ownerProperties.pendingList')}</div>
          </div>
          <div className="rent-stat-card">
            <div className="rent-stat-card__label">{t('ownerProperties.statEntrusted')}</div>
            <div className="rent-stat-card__value">
              {statusCount.rented + statusCount.vacant}{' '}
              <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('ownerProperties.unitSuit')}</span>
            </div>
            <div className="rent-stat-card__delta">{t('ownerProperties.includeOnSalePrefix')} {statusCount.for_sale} {t('ownerProperties.unitSuit')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OwnerPropertiesStats
