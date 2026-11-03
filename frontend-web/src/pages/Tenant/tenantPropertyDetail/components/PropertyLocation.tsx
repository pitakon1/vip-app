import { useTranslation } from 'react-i18next'
import { Icon } from '../icons'
import type { PoiItem } from '../types'

interface Props {
  pinLabel?: string
  pois: PoiItem[]
}

/** 位置与周边配套 */
const PropertyLocation = ({ pinLabel, pois }: Props) => {
  const { t } = useTranslation()

  return (
    <section className="rent-detail-card">
      <div className="rent-detail-title">{t('tenantPropertyDetail.location')}</div>
      <div className="rent-detail-map__canvas">
        <svg
          className="rent-detail-map__pin"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" fill="#fff" stroke="#fff" />
        </svg>
        <span className="rent-detail-map__pin-label">{pinLabel}</span>
      </div>
      {pois.length ? (
        <div className="rent-detail-map__pois">
          {pois.map((p) => (
            <div className="rent-detail-poi" key={p.key}>
              <span className="rent-detail-poi__icon">
                <Icon d={p.icon} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="rent-detail-poi__name">{p.name}</div>
                <div className="rent-detail-poi__dist">{p.label}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rent-empty">{t('tenantPropertyDetail.emptyPoi')}</div>
      )}
    </section>
  )
}

export default PropertyLocation
