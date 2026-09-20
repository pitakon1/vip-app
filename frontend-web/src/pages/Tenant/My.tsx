import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'

/**
 * 租客端「我的」页（/tenant/my）
 * 统一结构：用户卡 → 常用功能宫格（含我的租约/交易订单入口）→ 设置 → 退出。
 * 租约与交易订单详情统一收敛到独立列表页，入口放入常用功能。
 */

const APP_COMPANY = 'HaoFang.World'

const maskPhone = (p?: string) =>
  p && p.length >= 7 ? `${p.slice(0, 3)}****${p.slice(-4)}` : p || '—'

const TenantMy = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()

  const displayName = user?.full_name || user?.name || '—'
  const avatarChar = (displayName || '租').charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // ===== 常用功能宫格（租客可用能力：租约/交易订单/付款/报修/服务/文档，对齐三端统一结构） =====
  const quickCards = [
    {
      key: 'leases',
      title: t('menu.myLeases'),
      desc: t('tenantMy.leaseDesc'),
      bg: 'rgba(20,184,166,0.12)',
      color: 'var(--rent-primary)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
      go: () => navigate('/tenant/leases'),
    },
    {
      key: 'deals',
      title: t('tenantMy.myDeals'),
      desc: t('tenantMy.dealDesc'),
      bg: 'rgba(14,165,233,0.12)',
      color: 'var(--state-info)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
      go: () => navigate('/tenant/deals'),
    },
    {
      key: 'pay',
      title: t('tenantDashboard.uploadPay'),
      desc: t('tenantDashboard.uploadPayDesc'),
      bg: 'rgba(22,163,74,0.12)',
      color: 'var(--state-success)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
      go: () => navigate('/tenant/payments'),
    },
    {
      key: 'mt',
      title: t('tenantDashboard.submitMaint'),
      desc: t('tenantDashboard.submitMaintDesc'),
      bg: 'rgba(217,119,6,0.12)',
      color: 'var(--state-warning)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
      go: () => navigate('/tenant/maintenance'),
    },
    {
      key: 'svc',
      title: t('tenantDashboard.bookService'),
      desc: t('tenantDashboard.bookServiceDesc'),
      bg: 'rgba(168,85,247,0.12)',
      color: 'var(--state-purple)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>,
      go: () => navigate('/tenant/services'),
    },
    {
      key: 'doc',
      title: t('portal.documents'),
      desc: t('tenantRemind.viewDetail'),
      bg: 'rgba(20,184,166,0.12)',
      color: 'var(--rent-primary)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
      go: () => navigate('/tenant/documents'),
    },
  ]

  return (
    <div className="rent-my">
      {/* ===== 用户信息卡 ===== */}
      <div className="rent-card rent-my__user">
        <div className="rent-avatar rent-avatar--lg">{avatarChar}</div>
        <div>
          <div className="rent-text-bold" style={{ fontSize: 18 }}>{displayName}</div>
          <div className="rent-text-sm rent-text-muted" style={{ marginTop: 2 }}>
            {user?.phone || user?.email || t('role.tenant')}
          </div>
        </div>
      </div>

      {/* ===== 常用功能 ===== */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.funcs')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 24 }}>
          <div className="rent-quick-grid">
            {quickCards.map((q) => (
              <a key={q.key} className="rent-quick-card" onClick={q.go} style={{ cursor: 'pointer' }}>
                <div className="rent-quick-card__icon" style={{ background: q.bg, color: q.color }}>
                  {q.icon}
                </div>
                <div className="rent-quick-card__body">
                  <div className="rent-quick-card__title">{q.title}</div>
                  <div className="rent-quick-card__desc">{q.desc}</div>
                </div>
                <svg className="rent-quick-card__arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 设置（账号/语言/通知/帮助/关于） ===== */}
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

export default TenantMy
