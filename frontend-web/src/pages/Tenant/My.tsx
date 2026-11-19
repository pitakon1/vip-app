import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import useAuthStore from '@/stores/auth'
import { authApi, chatApi } from '@/services/api'
import api from '@/lib/api'
import LanguageSwitcher from '@/components/LanguageSwitcher'

/**
 * C 端「我的」页（/tenant/my，业主 + 租客共用）
 * 结构对齐贝壳「我的」：用户卡 → 个人内容宫格 → 设置 / 帮助与客服 / 关于 → 退出。
 * 「我的」只放个人身份与个人内容：账号资料、收藏、降价提醒、我的订单、设置类。
 * 房产 / 账单 / 报修 / 租约 / 合同 / 收益 / 委托 / 小区事务全部收敛到「我家」
 * （/tenant/my-home），禁止同一功能在两处出现。
 * 注：Web 端没有本地浏览足迹记录，故宫格不出现「浏览足迹」，不做无数据入口。
 */

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

  // 关于我们：公司与版本取公开接口真实值，不写死
  const [company, setCompany] = useState<{
    name?: string
    version?: string
    website?: string
    phone?: string
  }>({})
  useEffect(() => {
    api.get('/company/info')
      .then((res) => {
        const info = res.data?.data ?? res.data
        if (info) {
          setCompany({
            name: info.name,
            version: info.version,
            website: info.website,
            phone: info.phone,
          })
        }
      })
      .catch(() => {
        /* 读取失败保留空值，界面不渲染版本/官网 */
      })
  }, [])

  // 通知提醒：读真实偏好（邮件 / 推送），不写死「已开启」
  const [notify, setNotify] = useState<{ email: boolean; push: boolean } | null>(null)
  useEffect(() => {
    if (!token) {
      setNotify(null)
      return
    }
    api.get('/auth/me/preferences')
      .then((res) => {
        const p = res.data?.data ?? res.data
        setNotify({ email: p?.notify_email !== false, push: p?.notify_push !== false })
      })
      .catch(() => setNotify(null))
  }, [token])
  const notifySummary = notify
    ? [notify.email ? t('tenantMy.notifyEmail') : '', notify.push ? t('tenantMy.notifyPush') : '']
        .filter(Boolean)
        .join(' · ') || t('tenantMy.notifyAllOff')
    : '—'

  const openPrivacy = () => {
    const base = (company.website || '').trim().replace(/\/+$/, '')
    if (!base) {
      message.info(t('tenantMy.privacyUnset'))
      return
    }
    const url = /^https?:\/\//i.test(base) ? `${base}/privacy` : `https://${base}/privacy`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // ===== 个人内容宫格（贝壳首屏宫格：收藏 / 降价提醒 / 我的订单） =====
  type FuncItem = { key: string; label: string; route: string; icon: React.ReactNode }
  const C_FUNC_GRID: FuncItem[] = [
    {
      key: 'favorites',
      label: t('tenantMy.favorites'),
      route: '/tenant/favorites',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>,
    },
    {
      key: 'priceAlerts',
      label: t('tenantMy.priceAlerts'),
      route: '/tenant/price-alerts',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>,
    },
    {
      key: 'viewings',
      label: t('tenantViewing.title'),
      route: '/tenant/viewings',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>,
    },
    {
      key: 'orders',
      label: t('tenantMy.orders'),
      route: '/tenant/deals',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h6" /></svg>,
    },
  ]

  const openRoute = (route: string) => {
    if (!user) {
      navigate('/login')
      return
    }
    navigate(route)
  }

  const renderRow = (
    key: string,
    label: string,
    opts?: { value?: React.ReactNode; onClick?: () => void; muted?: boolean },
  ) => (
    <div
      key={key}
      className="rent-my__row"
      role={opts?.onClick ? 'button' : undefined}
      tabIndex={opts?.onClick ? 0 : undefined}
      style={opts?.onClick ? { cursor: 'pointer' } : undefined}
      onClick={opts?.onClick}
      onKeyDown={opts?.onClick
        ? (e) => { if (e.key === 'Enter' || e.key === ' ') opts.onClick?.() }
        : undefined}
    >
      <span className="rent-text-sm">{label}</span>
      {opts?.value !== undefined ? (
        <span className={`rent-text-sm${opts?.muted === false ? '' : ' rent-text-muted'}`}>{opts.value}</span>
      ) : opts?.onClick ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--rent-ink-2)' }}><polyline points="9 18 15 12 9 6" /></svg>
      ) : null}
    </div>
  )

  return (
    <div className="rent-my">
      {/* ===== 顶部页头：右上角客服入口（对齐贝壳导航栏右上角客服，未登录引导登录） ===== */}
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
                <img className="rent-avatar__img" src={user.avatar_url} alt="avatar" loading="lazy" decoding="async" />
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
                {user?.phone ? maskPhone(user.phone) : user?.email || t('role.tenant')}
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

      {/* ===== 个人内容宫格 ===== */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.funcs')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 16 }}>
          <div className="rent-my__grid">
            {C_FUNC_GRID.map((c) => (
              <div key={c.key} className="rent-my__cell" onClick={() => openRoute(c.route)}>
                <div className="rent-my__cell-icon">{c.icon}</div>
                <div className="rent-my__cell-label">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 设置（账号 / 语言 / 通知） ===== */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.settings')}</h3>
        </div>
        <div className="rent-card__body rent-my__settings">
          {renderRow('account', t('tenantMy.account'), {
            value: user?.phone ? maskPhone(user.phone) : user?.email || '—',
          })}
          <div className="rent-my__row">
            <span className="rent-text-sm">{t('language.switch')}</span>
            <LanguageSwitcher />
          </div>
          {renderRow('notify', t('tenantMy.notify'), { value: notifySummary })}
          {renderRow('identity', t('tenantMy.identity'), {
            onClick: () => navigate('/tenant/identity'),
          })}
          {renderRow('permissions', t('tenantMy.permissions'), {
            onClick: () => navigate('/tenant/permissions'),
          })}
        </div>
      </div>

      {/* ===== 帮助与客服 ===== */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.sectionHelp')}</h3>
        </div>
        <div className="rent-card__body rent-my__settings">
          {renderRow('onlineSupport', t('tenantMy.onlineSupport'), { onClick: openSupport })}
          {renderRow('help', t('tenantMy.help'), { onClick: () => navigate('/tenant/help') })}
        </div>
      </div>

      {/* ===== 关于（版本 / 官网 / 隐私 / 版权，均取公开接口真实值） ===== */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.about')}</h3>
        </div>
        <div className="rent-card__body rent-my__settings">
          {company.version
            ? renderRow('version', t('tenantMy.version'), { value: `v${company.version}` })
            : null}
          {company.website
            ? renderRow('website', t('tenantMy.website'), {
                value: company.website,
                onClick: () => window.open(
                  /^https?:\/\//i.test(company.website || '') ? company.website : `https://${company.website}`,
                  '_blank',
                  'noopener,noreferrer',
                ),
              })
            : null}
          {renderRow('privacy', t('tenantMy.privacyRules'), { onClick: openPrivacy })}
          {company.name
            ? renderRow('copyright', t('tenantMy.copyright'), {
                value: `© ${dayjs().year()} ${company.name}`,
              })
            : null}
        </div>
      </div>

      {user ? (
        <div className="rent-card">
          <div className="rent-card__body rent-my__settings">
            <div className="rent-my__row">
              <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={handleLogout}>
                {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default TenantMy
