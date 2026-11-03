import { useTranslation } from 'react-i18next'

interface Props {
  onExport: () => void
  onSubmit: () => void
}

/** 页头：导出 / 提交报告 */
export const PerformanceHeader = ({ onExport, onSubmit }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-page-header">
      <div>
        <h2 className="rent-page-header__title">{t('employeePerformance.title')}</h2>
        <p className="rent-page-header__subtitle">{t('employeePerformance.subtitle')}</p>
      </div>
      <div className="rent-page-header__actions">
        <button className="rent-btn rent-btn--secondary" onClick={onExport}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t('employeePerformance.exportReport')}
        </button>
        <button className="rent-btn rent-btn--primary" onClick={onSubmit}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          {t('employeePerformance.submitReport')}
        </button>
      </div>
    </div>
  )
}
