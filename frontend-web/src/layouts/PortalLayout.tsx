import { useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import NotificationsBell from '@/components/NotificationsBell'
import { ROLE_SECTIONS, C_PORTAL_NAV_KEYS, resolveLabelKey } from '@/config/roleMenus'
import brandLogo from '@/assets/haofang-logo.jpg'
import './PortalLayout.css'

interface PortalNavItem {
  key: string
  label: string
  icon: React.ReactNode
}

// 顶栏导航图标（对齐 tenant-*.html 原型 rent-portal__nav）
const navIcon = (d: string, extra?: React.ReactNode) => (
  <svg className="rent-portal__nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
)

/**
 * 顶栏 6 项：首页 / 找房 / 我的房源 / 收益 / 文档 / 我的。
 * 从共享 C 端菜单（ROLE_SECTIONS.tenant）按 C_PORTAL_NAV_KEYS 抽取——
 * 业主与租客同一份菜单，功能一致；其余入口收进「我的」宫格。
 */
const buildNav = (t: (k: string) => string): PortalNavItem[] => {
  const byKey = new Map(
    (ROLE_SECTIONS.tenant ?? []).flatMap((s) => s.items).map((it) => [it.key, it]),
  )
  const items: PortalNavItem[] = []
  for (const key of C_PORTAL_NAV_KEYS) {
    const it = byKey.get(key)
    if (!it) continue
    items.push({ key: it.key, label: t(resolveLabelKey(it)), icon: navIcon(it.icon) })
  }
  return items
}

/**
 * PortalLayout — C 端（业主 + 租客）顶栏门户布局（对齐 rental-full-draft 原型 rent-portal）
 * 顶部导航：logo + 首页/找房/我的房源/收益/文档/我的；无侧边栏。
 * 业主与租客共用同一份菜单（功能一致）。admin/employee 的 MainLayout 保持不变。
 */
const PortalLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { t } = useTranslation()

  const nav = useMemo(() => buildNav(t), [t])

  const selectedKey = useMemo(() => {
    const path = location.pathname
    const exact = nav.find((n) => path === n.key)
    if (exact) return exact.key
    const prefix = nav.find((n) => path.startsWith(n.key + '/'))
    return prefix?.key || null
  }, [location.pathname, nav])

  const handleNav = (key: string) => navigate(key)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleGoHome = () => {
    navigate('/tenant/dashboard')
  }

  const userMenu: MenuProps['items'] = [
    {
      key: 'logout',
      label: t('common.logout'),
      onClick: handleLogout,
    },
  ]

  const displayName = user?.full_name || user?.name || t('welcome')
  const avatarChar = (displayName || '我').charAt(0).toUpperCase()

  return (
    <div className="rent-portal">
      {/* ===== 顶栏 ===== */}
      <header className="rent-portal__header">
        <div className="rent-portal__brand" style={{ cursor: 'pointer' }} onClick={handleGoHome}>
          <img className="rent-portal__logo" src={brandLogo} alt="HaoFang.World" />
          <span className="rent-portal__name">{t('portal.center')}</span>
        </div>

        <nav className="rent-portal__nav no-scrollbar">
          {nav.map((item) => (
            <a
              key={item.key}
              className="rent-portal__nav-item"
              data-active={selectedKey === item.key}
              onClick={(e) => {
                e.preventDefault()
                handleNav(item.key)
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="rent-portal__actions">
          <NotificationsBell />
          <LanguageSwitcher compact />
          <Dropdown menu={{ items: userMenu }} placement="bottomRight">
            <div className="rent-portal__user">
              <div className="rent-avatar">{avatarChar}</div>
              <div className="rent-portal__user-meta">
                <div className="rent-text-sm rent-text-bold">{displayName}</div>
                <div className="rent-text-sm rent-text-muted">{user?.email || t(`role.tenant`)}</div>
              </div>
            </div>
          </Dropdown>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={handleLogout}>
            {t('topbar.logoutShort')}
          </button>
        </div>
      </header>

      {/* ===== 内容区 ===== */}
      <main className="rent-portal__main">
        <Outlet />
      </main>
    </div>
  )
}

export default PortalLayout
