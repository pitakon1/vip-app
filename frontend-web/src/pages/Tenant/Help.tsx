import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

/** C 端「帮助中心」：静态 FAQ 页（D-08：原先该入口点击无响应，现补齐真实内容页） */
const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const

export default function TenantHelp() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div>
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('helpCenter.title')}</h2>
          <p className="rent-page-header__subtitle">{t('helpCenter.intro')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate(-1)}>
            {t('common.back')}
          </button>
        </div>
      </div>

      <div className="rent-card" style={{ marginBottom: 16 }}>
        <div className="rent-card__body">
          {FAQ_KEYS.map((k, i) => (
            <div
              key={k}
              style={{
                padding: '12px 0',
                borderBottom: i === FAQ_KEYS.length - 1 ? 'none' : '1px solid var(--rent-border, #eee)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t(`helpCenter.${k}`)}</div>
              <div className="rent-text-sm rent-text-muted">{t(`helpCenter.${k}a`)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__body">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('helpCenter.contactTitle')}</div>
          <div className="rent-text-sm rent-text-muted">{t('helpCenter.contactBody')}</div>
        </div>
      </div>
    </div>
  )
}
