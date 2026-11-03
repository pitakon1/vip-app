import { useTranslation } from 'react-i18next'

interface Props {
  exporting: boolean
  onExport: () => void
  onCreate: () => void
}

/** 页头：标题 / 导出 / 新增员工 */
export const EmployeesHeader = ({ exporting, onExport, onCreate }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-page-header">
      <div>
        <h2 className="rent-page-header__title">{t('employees.title')}</h2>
        <p className="rent-page-header__subtitle">{t('employees.subtitle')}</p>
      </div>
      <div className="rent-page-header__actions">
        <button
          className="rent-btn rent-btn--secondary"
          type="button"
          onClick={onExport}
          disabled={exporting}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          {exporting ? t('employees.exporting') : t('employees.btnExport')}
        </button>
        <button className="rent-btn rent-btn--primary" type="button" onClick={onCreate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {t('employees.btnAdd')}
        </button>
      </div>
    </div>
  )
}
