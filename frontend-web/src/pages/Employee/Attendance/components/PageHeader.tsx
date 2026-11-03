import { useTranslation } from 'react-i18next'

/** 页面头部：标题 + 导出考勤明细。 */
const PageHeader = ({ onExport }: { onExport: () => void }) => {
  const { t } = useTranslation()
  return (
    <div className="rent-page-header">
      <div>
        <h2 className="rent-page-header__title">{t('attendance.title')}</h2>
        <p className="rent-page-header__subtitle">{t('attendance.subtitle')}</p>
      </div>
      <div className="rent-page-header__actions">
        <button className="rent-btn rent-btn--secondary" type="button" onClick={onExport}>
          {t('attendance.export')}
        </button>
      </div>
    </div>
  )
}

export default PageHeader
