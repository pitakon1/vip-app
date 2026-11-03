import { useTranslation } from 'react-i18next'
import type { PaymentChannel } from '../types'

interface Props {
  channels: PaymentChannel[]
  saving: boolean
  onToggleChannel: (key: string) => void
  onUpdateField: (chKey: string, index: number, value: string) => void
  onToggleCard: (chKey: string, name: string) => void
  onSave: () => void
  onReset: () => void
}

/** Tab 2：支付渠道 */
export const PaymentTab = ({ channels, saving, onToggleChannel, onUpdateField, onToggleCard, onSave, onReset }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-tab-panel" data-active="true">
      <p className="rent-body rent-mb-4">{t('settings.paymentIntro')}</p>
      <div className="rent-grid rent-grid--2" style={{ alignItems: 'start' }}>
        {channels.map((ch) => (
          <div key={ch.key} className="rent-channel-card" data-enabled={ch.enabled ? 'true' : 'false'}>
            <div className="rent-channel-card__header">
              <div className="rent-channel-card__head-left">
                <div className="rent-channel-card__icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ch.icon }} />
                </div>
                <div>
                  <div className="rent-channel-card__name">{t(ch.name)}</div>
                  <div className="rent-channel-card__desc">{t(ch.desc)}</div>
                </div>
              </div>
              <label className="rent-switch">
                <input
                  type="checkbox"
                  checked={ch.enabled}
                  onChange={() => onToggleChannel(ch.key)}
                />
                <span className="rent-switch__track"></span>
                <span className="rent-switch__thumb"></span>
              </label>
            </div>
            <div className="rent-channel-card__body">
              {ch.fields.map((f, i) => (
                <div key={i} className="rent-form-group" style={{ marginBottom: i === ch.fields.length - 1 && !ch.cards ? 0 : 20 }}>
                  <label className="rent-form-label">{t(f.label)}</label>
                  <input
                    className={`rent-form-input${f.mono ? ' rent-table__mono' : ''}`}
                    type={f.password ? 'password' : 'text'}
                    value={f.value}
                    onChange={(e) => onUpdateField(ch.key, i, e.target.value)}
                  />
                  {f.hint && <div className="rent-form-hint">{t(f.hint)}</div>}
                </div>
              ))}
              {ch.cards && (
                <div className="rent-form-group" style={{ marginBottom: 0 }}>
                  <label className="rent-form-label">{t('settings.supportedCards')}</label>
                  <div className="rent-flex rent-gap-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    {ch.cards.map((card) => (
                      <label key={card.name} className="rent-check">
                        <input
                          type="checkbox"
                          checked={card.checked}
                          onChange={() => onToggleCard(ch.key, card.name)}
                        /> {card.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="rent-settings-savebar">
        <button className="rent-btn rent-btn--secondary" type="button" onClick={onReset}>{t('settings.restoreDefault')}</button>
        <button className="rent-btn rent-btn--primary" type="button" onClick={onSave} disabled={saving}>
          {saving ? t('settings.saving') : t('settings.saveChannelConfig')}
        </button>
      </div>
    </div>
  )
}
