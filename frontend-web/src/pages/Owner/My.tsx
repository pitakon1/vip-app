import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'

/**
 * 业主端「我的」页（/owner/my）
 * 统一结构：用户卡 → 常用功能宫格(房源管理/收益明细) → 设置 → 退出。
 * 业主资产信息已并入「房源管理」；对齐租客端「我的」与 App/小程序端结构。
 */

const APP_COMPANY = 'HaoFang.World'

const maskPhone = (p?: string) =>
  p && p.length >= 7 ? `${p.slice(0, 3)}****${p.slice(-4)}` : p || '—'

const OwnerMy = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()

  const displayName = user?.full_name || user?.name || '—'
  const avatarChar = (displayName || '主').charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 常用功能宫格（对齐三端业主「我的」：房源管理/收益明细）
  const gridCards = [
    {
      key: 'props',
      label: t('ownerMy.myProps'),
      go: () => navigate('/owner/properties'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>
      ),
    },
    {
      key: 'income',
      label: t('ownerMy.income'),
      go: () => navigate('/owner/income'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>
      ),
    },
  ]

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('menu.profile')}</h2>
          <p className="rent-page-header__subtitle">
            {dayjs().format('YYYY年M月D日')}
          </p>
        </div>
      </div>

      {/* ===== 用户卡 ===== */}
      <div className="rent-card rent-my__user" style={{ marginBottom: 16 }}>
        <div className="rent-avatar rent-avatar--lg">{avatarChar}</div>
        <div>
          <div className="rent-text-bold" style={{ fontSize: 18 }}>{displayName}</div>
          <div className="rent-text-sm rent-text-muted" style={{ marginTop: 2 }}>
            {user?.phone || user?.email || t('role.owner')}
          </div>
        </div>
      </div>

      {/* ===== 常用功能宫格 ===== */}
      <div className="rent-card" style={{ marginBottom: 16 }}>
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.funcs')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 16 }}>
          <div className="rent-my__grid">
            {gridCards.map((c) => (
              <div key={c.key} className="rent-my__cell" onClick={c.go}>
                <div className="rent-my__cell-icon">{c.icon}</div>
                <div className="rent-my__cell-label">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 设置 ===== */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.settings')}</h3>
        </div>
        <div className="rent-card__body rent-my__settings">
          <div className="rent-my__row">
            <span className="rent-text-sm">{t('tenantMy.account')}</span>
            <span className="rent-text-sm rent-text-muted">{user?.phone ? maskPhone(user.phone) : user?.email || '—'}</span>
          </div>
          <div className="rent-my__row">
            <span className="rent-text-sm">{t('language.switch')}</span>
            <LanguageSwitcher />
          </div>
          <div className="rent-my__row">
            <span className="rent-text-sm">{t('tenantMy.notify')}</span>
            <span className="rent-text-sm" style={{ color: 'var(--state-success)' }}>{t('tenantMy.notifyOn')}</span>
          </div>
          <div className="rent-my__row">
            <span className="rent-text-sm">{t('tenantMy.help')}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--rent-ink-3)' }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div className="rent-my__row">
            <span className="rent-text-sm">{t('tenantMy.about')}</span>
            <span className="rent-text-sm rent-text-muted">{APP_COMPANY}</span>
          </div>
          <div className="rent-my__row">
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={handleLogout}>
              {t('common.logout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OwnerMy
