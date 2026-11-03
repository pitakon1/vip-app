import { useTranslation } from 'react-i18next'
import { ICONS, Icon } from '../icons'

/** 卖点与基础配套 */
const PropertySellingPoints = ({ chips }: { chips: string[] }) => {
  const { t } = useTranslation()

  return (
    <section className="rent-detail-card">
      <div className="rent-detail-title">{t('tenantPropertyDetail.sellingPoints')}</div>
      {chips.length ? (
        <div className="rent-detail-chips">
          {chips.map((c) => (
            <span className="rent-detail-chip" key={c}>
              <Icon d={ICONS.check} />
              {c}
            </span>
          ))}
        </div>
      ) : (
        <div className="rent-empty">{t('tenantPropertyDetail.emptyFacility')}</div>
      )}
    </section>
  )
}

export default PropertySellingPoints
