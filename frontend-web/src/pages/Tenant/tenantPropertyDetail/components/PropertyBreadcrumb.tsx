import { useTranslation } from 'react-i18next'
import { ICONS, Icon } from '../icons'

interface Props {
  current?: string
  ariaLabel?: string
  onHome: () => void
  onListings: () => void
}

/** 面包屑（详情页与空态共用；空态不传 ariaLabel 保持原 DOM） */
const PropertyBreadcrumb = ({ current, ariaLabel, onHome, onListings }: Props) => {
  const { t } = useTranslation()
  const keyHandler = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }

  return (
    <nav className="rent-detail-crumb" aria-label={ariaLabel}>
      <a
        role="button"
        tabIndex={0}
        onClick={onHome}
        onKeyDown={keyHandler(onHome)}
      >
        {t('tenantPropertyDetail.crumbHome')}
      </a>
      <Icon d={ICONS.chevron} />
      <a
        role="button"
        tabIndex={0}
        onClick={onListings}
        onKeyDown={keyHandler(onListings)}
      >
        {t('tenantPropertyDetail.crumbListings')}
      </a>
      {current ? (
        <>
          <Icon d={ICONS.chevron} />
          <span className="rent-detail-crumb__current">{current}</span>
        </>
      ) : null}
    </nav>
  )
}

export default PropertyBreadcrumb
