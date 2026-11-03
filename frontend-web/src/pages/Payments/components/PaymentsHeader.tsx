import { useTranslation } from 'react-i18next'

interface Props {
  onExport: () => void
  onManual: () => void
}

/** 页头：导出流水 + 手动记账 */
export default function PaymentsHeader({ onExport, onManual }: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-page-header">
      <div>
        <h2 className="rent-page-header__title">{t('payments.title')}</h2>
        <p className="rent-page-header__subtitle">{t('payments.subtitle')}</p>
      </div>
      <div className="rent-page-header__actions">
        <button className="rent-btn rent-btn--secondary" onClick={onExport}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t('payments.btnExport')}
        </button>
        <button className="rent-btn rent-btn--primary" onClick={onManual}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('payments.btnManual')}
        </button>
      </div>
    </div>
  )
}
