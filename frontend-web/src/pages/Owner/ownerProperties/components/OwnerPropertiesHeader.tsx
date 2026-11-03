import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

interface Props {
  onCreate: () => void
}

/** Page Header（对齐管理员端 admin-properties） */
const OwnerPropertiesHeader = ({ onCreate }: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="rent-page-header">
      <div>
        <h2 className="rent-page-header__title">{t('ownerProperties.title')}</h2>
        <p className="rent-page-header__subtitle">{t('ownerProperties.subtitle')}</p>
      </div>
      <div className="rent-page-header__actions">
        <button type="button" className="rent-btn rent-btn--primary" onClick={() => navigate('/tenant/marketing')}>
          {t('ownerProperties.entrustListing')}
        </button>
        <button type="button" className="rent-btn rent-btn--primary" onClick={onCreate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('ownerProperties.createTitle')}
        </button>
      </div>
    </div>
  )
}

export default OwnerPropertiesHeader
