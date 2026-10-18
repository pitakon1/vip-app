import { useNavigate } from 'react-router-dom'
import { useRef } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import useAuthStore from '@/stores/auth'
import { authApi, chatApi } from '@/services/api'
import LanguageSwitcher from '@/components/LanguageSwitcher'

/**
 * C 端「我的」页（/tenant/my，业主 + 租客共用）
 * 统一结构：用户卡 → 常用功能宫格（与 App C_FUNC_GRID 同构的全量入口）→ 设置 → 退出。
 * 业主与租客看到同一份入口清单，不做能力门槛；内容差异按名下房源 / 生效租约自然呈现。
 */

const APP_COMPANY = 'HaoFang.World'

const maskPhone = (p?: string) =>
  p && p.length >= 7 ? `${p.slice(0, 3)}****${p.slice(-4)}` : p || '—'

const TenantMy = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, token, login, logout } = useAuthStore()

  const displayName = user?.full_name || user?.name || '—'
  const avatarChar = (displayName || '租').charAt(0).toUpperCase()

  // 点击头像选图并上传：仅已登录可操作，未登录引导登录
  const fileRef = useRef<HTMLInputElement>(null)
  const pickAvatar = () => {
    if (!user) {
      navigate('/login')
      return
    }
    fileRef.current?.click()
  }
  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const res: any = await authApi.uploadAvatar(file)
      const updated = res?.data ?? res
      if (updated && updated.id && token) login(token, updated)
      message.success(t('tenantMy.msgAvatarUpdated'))
    } catch {
      message.error(t('tenantMy.errAvatarUpload'))
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 右上角客服入口：未登录引导登录，已登录进入「与平台客服」的 IM 会话
  const openSupport = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    try {
      const res = await chatApi.support()
      const conv = Array.isArray(res?.data) ? res.data[0] : res?.data
      if (!conv?.id) {
        message.warning(t('tenantMy.warnSupportUnavailable'))
        return
      }
      navigate(`/chat?id=${conv.id}`)
    } catch {
      message.warning(t('tenantMy.warnSupportUnavailable'))
    }
  }

  // ===== 常用功能宫格 =====
  // 与 App `C_FUNC_GRID` 同构：业主与租客看到同一份全量入口，不做能力门槛——
  // 登录后任意入口都可进入（数据按名下房源 / 生效租约自然呈现差异）。
  const C_FUNC_GRID = [
    { key: 'manageProperties', label: t('menu.myProperties'), route: '/tenant/my-properties', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg> },
    { key: 'myListings', label: t('menu.myListings'), route: '/tenant/my-listings', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
    { key: 'incomeDetail', label: t('menu.income'), route: '/tenant/income', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg> },
    { key: 'myLeases', label: t('menu.myLeases'), route: '/tenant/leases', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> },
    { key: 'myDeals', label: t('tenantMy.myDeals'), route: '/tenant/deals', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="10" y1="9" x2="8" y2="9" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> },
    { key: 'payments', label: t('menu.myPayments'), route: '/tenant/payments', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg> },
    { key: 'maintenance', label: t('menu.maintenance'), route: '/tenant/maintenance', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg> },
    { key: 'services', label: t('menu.services'), route: '/tenant/services', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg> },
    { key: 'contracts', label: t('menu.contracts'), route: '/tenant/contracts', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="9 13 11 15 15 11" /></svg> },
    { key: 'documents', label: t('menu.documents'), route: '/tenant/documents', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg> },
  ]

  return (
    <div className="rent-my">
      {/* ===== 顶部页头：右上角客服入口（与贝壳一致位于导航栏右上角，未登录引导登录） ===== */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('menu.profile')}</h2>
          <p className="rent-page-header__subtitle">
            {dayjs().format(t('tenantMy.dateFormat'))}
          </p>
        </div>
        <div className="rent-page-header__actions">
          <button
            type="button"
            className="rent-my__support"
            onClick={openSupport}
            aria-label={t('tenantMy.help')}
            title={t('tenantMy.help')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
              <path d="M21 11h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-5Z" />
              <path d="M3 11v-1a9 9 0 0 1 18 0v1" />
              <path d="M21 16v2a4 4 0 0 1-4 4h-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* ===== 用户信息卡 ===== */}
      <div className="rent-card rent-my__user">
        {user ? (
          <>
            <button
              type="button"
              className="rent-avatar rent-avatar--lg rent-avatar--upload"
              onClick={pickAvatar}
              title={t('tenantMy.changeAvatar')}
              aria-label={t('tenantMy.changeAvatar')}
            >
              {user?.avatar_url ? (
                <img className="rent-avatar__img" src={user.avatar_url} alt="avatar" />
              ) : (
                avatarChar
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onAvatarChange}
            />
            <div>
              <div className="rent-text-bold" style={{ fontSize: 18 }}>{displayName}</div>
              <div className="rent-text-sm rent-text-muted" style={{ marginTop: 2 }}>
                {user?.phone || user?.email || t('role.tenant')}
              </div>
            </div>
          </>
        ) : (
          <a
            className="rent-my__guest"
            href="/login"
            onClick={(e) => { e.preventDefault(); navigate('/login') }}
          >
            <div className="rent-my__guest-info">
              <div className="rent-text-bold" style={{ fontSize: 20 }}>{t('tenantMy.loginOrRegister')}</div>
            </div>
            <div className="rent-avatar rent-avatar--lg rent-avatar--guest">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
            </div>
          </a>
        )}
      </div>

      {/* ===== 常用功能 ===== */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.funcs')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 16 }}>
          <div className="rent-my__grid">
            {C_FUNC_GRID.map((c) => (
              <div key={c.key} className="rent-my__cell" onClick={() => navigate(c.route)}>
                <div className="rent-my__cell-icon">{c.icon}</div>
                <div className="rent-my__cell-label">{c.label}</div>
              </div>
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
