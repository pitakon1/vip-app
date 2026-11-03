import { useTranslation } from 'react-i18next'
import type { NotifyRow } from '../types'

interface Props {
  rows: NotifyRow[]
  saving: boolean
  onToggle: (key: string, field: 'enabled' | 'email' | 'sms' | 'push') => void
  onSave: () => void
  onReset: () => void
}

/** Tab 3：通知设置 */
export const NotificationTab = ({ rows, saving, onToggle, onSave, onReset }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-tab-panel" data-active="true">
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('settings.notifyRules')}</h3>
          <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
            <span className="rent-text-sm rent-text-muted">{t('settings.channelsLabel')}</span>
            <span className="rent-badge rent-badge--primary">{t('settings.email')}</span>
            <span className="rent-badge rent-badge--primary">{t('settings.sms')}</span>
            <span className="rent-badge rent-badge--primary">{t('settings.push')}</span>
          </div>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {rows.map((row) => (
            <div key={row.key} className="rent-notify-row">
              <div className="rent-notify-row__info">
                <div className="rent-notify-row__title">{t(row.title)}</div>
                <div className="rent-notify-row__desc">{t(row.desc)}</div>
              </div>
              <div className="rent-notify-row__channels">
                <label className="rent-check">
                  <input type="checkbox" checked={row.channels.email} onChange={() => onToggle(row.key, 'email')} /> {t('settings.email')}
                </label>
                <label className="rent-check">
                  <input type="checkbox" checked={row.channels.sms} onChange={() => onToggle(row.key, 'sms')} /> {t('settings.sms')}
                </label>
                <label className="rent-check">
                  <input type="checkbox" checked={row.channels.push} onChange={() => onToggle(row.key, 'push')} /> {t('settings.push')}
                </label>
              </div>
              <div className="rent-notify-row__toggle">
                <label className="rent-switch">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={() => onToggle(row.key, 'enabled')}
                  />
                  <span className="rent-switch__track"></span>
                  <span className="rent-switch__thumb"></span>
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="rent-card__footer rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="rent-btn rent-btn--secondary" type="button" onClick={onReset}>{t('settings.reset')}</button>
          <button className="rent-btn rent-btn--primary" type="button" onClick={onSave} disabled={saving}>
            {saving ? t('settings.saving') : t('settings.saveNotifySettings')}
          </button>
        </div>
      </div>
    </div>
  )
}
