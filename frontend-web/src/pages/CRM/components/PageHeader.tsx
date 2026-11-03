import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'

interface PageHeaderProps {
  importRef: RefObject<HTMLInputElement>
  importing: boolean
  onImportFile: (file?: File | null) => void
  onNewLead: () => void
}

export default function PageHeader({ importRef, importing, onImportFile, onNewLead }: PageHeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="rent-page-header">
      <div>
        <h2 className="rent-page-header__title">{t('crm.title')}</h2>
        <p className="rent-page-header__subtitle">{t('crm.subtitle')}</p>
      </div>
      <div className="rent-page-header__actions">
        <input
          ref={importRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => onImportFile(e.target.files?.[0])}
        />
        <button
          className="rent-btn rent-btn--secondary"
          disabled={importing}
          onClick={() => importRef.current?.click()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {importing ? t('crm.importing') : t('crm.importBtn')}
        </button>
        <button className="rent-btn rent-btn--primary" onClick={onNewLead}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('crm.newLead')}
        </button>
      </div>
    </div>
  )
}
