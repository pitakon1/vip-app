import { useTranslation } from 'react-i18next'
import { SETTINGS_TABS } from '../constants'

interface Props {
  activeTab: string
  onChangeTab: (key: string) => void
  updatedAt: string
}

/** 页头 + Tab 切换 */
export const SettingsHeader = ({ activeTab, onChangeTab, updatedAt }: Props) => {
  const { t } = useTranslation()
  return (
    <>
      {/* Page header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('settings.title')}</h2>
          <p className="rent-page-header__subtitle">{t('settings.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <span className="rent-badge rent-badge--neutral">
            {t('settings.lastUpdated', { date: updatedAt ? updatedAt.slice(0, 10) : '—' })}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="rent-tabs">
        {SETTINGS_TABS.map((tab) => (
          <div
            key={tab.key}
            className="rent-tab"
            data-active={activeTab === tab.key ? 'true' : 'false'}
            onClick={() => onChangeTab(tab.key)}
          >
            {t(tab.label)}
          </div>
        ))}
      </div>
    </>
  )
}
