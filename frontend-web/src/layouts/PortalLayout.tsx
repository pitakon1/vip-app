import { useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import NotificationsBell from '@/components/NotificationsBell'
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

const buildNav = (t: (k: string) => string): PortalNavItem[] => [
  {
    key: '/tenant/dashboard',
    label: t('portal.home'),
    icon: navIcon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', <polyline points="9 22 9 12 15 12 15 22" />),
  },
  {
    key: '/tenant/listings',
    label: t('browse.findTitle'),
    icon: navIcon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', <><circle cx="11" cy="13" r="3" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>),
  },
  {
    key: '/tenant/payments',
    label: t('portal.payments'),
    icon: navIcon('M1 4h22v16H1z', <line x1="1" y1="10" x2="23" y2="10" />),
  },
  {
    key: '/tenant/documents',
    label: t('portal.documents'),
    icon: navIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', <polyline points="14 2 14 8 20 8" />),
  },
  {
    key: '/tenant/services',
    label: t('portal.services'),
    icon: navIcon('M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'),
  },
  {
    key: '/tenant/maintenance',
    label: t('portal.maintenance'),
    icon: navIcon('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'),
  },
  {
    key: '/tenant/my',
    label: t('portal.profile'),
    icon: navIcon('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', <circle cx="12" cy="7" r="4" />),
  },
]

/**
 * PortalLayout — 租客端顶栏门户布局（对齐 rental-full-draft 原型 rent-portal）
 * 顶部导航：logo「租客中心」+ 首页/找房源/付款/文档/服务/报修；无侧边栏。
 * 服务 admin/owner/employee 的 MainLayout 保持不变。
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
  const avatarChar = (displayName || '租').charAt(0).toUpperCase()

  return (
    <div className="rent-portal">
      {/* ===== 顶栏 ===== */}
      <header className="rent-portal__header">
        <div className="rent-portal__brand" style={{ cursor: 'pointer' }} onClick={handleGoHome}>
          <img className="rent-portal__logo" src={brandLogo} alt="HaoFang.World" />
          <span className="rent-portal__name">{t('role.tenant')}中心</span>
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
