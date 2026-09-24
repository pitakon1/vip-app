import { useNavigate } from 'react-router-dom'
import { useRef } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import useAuthStore from '@/stores/auth'
import { authApi, chatApi } from '@/services/api'
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
  const { user, token, login, logout } = useAuthStore()

  const displayName = user?.full_name || user?.name || '—'
  const avatarChar = (displayName || '主').charAt(0).toUpperCase()

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
      message.success(t('ownerMy.msgAvatarUpdated'))
    } catch {
      message.error(t('ownerMy.errAvatarUpload'))
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
        message.warning(t('ownerMy.warnSupportUnavailable'))
        return
      }
      navigate(`/chat?id=${conv.id}`)
    } catch {
      message.warning(t('ownerMy.warnSupportUnavailable'))
    }
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
            {dayjs().format(t('ownerMy.dateFormat'))}
          </p>
        </div>
        <div className="rent-page-header__actions">
          {/* 顶部右上角客服入口：与贝壳一致位于导航栏右上角，未登录引导登录 */}
          <button
            type="button"
            className="rent-my__support"
            onClick={openSupport}
            aria-label={t('ownerMy.help')}
            title={t('ownerMy.help')}
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

      {/* ===== 用户卡 ===== */}
      <div className="rent-card rent-my__user" style={{ marginBottom: 16 }}>
        {user ? (
          <>
            <button
              type="button"
              className="rent-avatar rent-avatar--lg rent-avatar--upload"
              onClick={pickAvatar}
              title={t('ownerMy.changeAvatar')}
              aria-label={t('ownerMy.changeAvatar')}
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
                {user?.phone || user?.email || t('role.owner')}
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
              <div className="rent-text-bold" style={{ fontSize: 20 }}>{t('ownerMy.loginOrRegister')}</div>
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
