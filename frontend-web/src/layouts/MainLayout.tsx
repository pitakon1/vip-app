import { useState, useMemo } from 'react'
import { Dropdown, Input } from 'antd'
import type { MenuProps } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TFunction } from 'i18next'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import brandLogo from '@/assets/haofang-logo.jpg'
import './MainLayout.css'

interface NavItem {
  key: string
  label: string
  icon: React.ReactNode
}

interface NavSection {
  label?: string
  items: NavItem[]
}

const icon = (d: string) => (
  <svg className="rent-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const infoIcon = icon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01')

// 各角色侧栏导航（含分组标签，与设计稿一致）
const buildSections = (role: string, t: TFunction): NavSection[] => {
  const s = (k: string) => t(`menu.section.${k}`) as string
  switch (role) {
    case 'owner':
      return [
        {
          label: s('overview'),
          items: [
            { key: '/owner/dashboard', label: t('menu.myHome'), icon: icon('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z') },
          ],
        },
        {
          label: s('assetManagement'),
          items: [
            { key: '/owner/properties', label: t('menu.myProperties'), icon: icon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22') },
            { key: '/owner/income', label: t('menu.income'), icon: icon('M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6') },
            { key: '/owner/payments', label: t('menu.myPayments'), icon: icon('M1 4h22v16H1z M1 10h23') },
            { key: '/owner/marketing', label: t('menu.marketing'), icon: icon('M3 21v-6M21 21v-6M7 21v-9M17 21v-9M3 17l3-2 4 1 4-3 3 2 4-4M5 7V3M19 10V3') },
            { key: '/owner/documents', label: t('menu.documents'), icon: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6') },
            { key: '/owner/services', label: t('menu.services'), icon: icon('M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z') },
            { key: '/company', label: t('menu.company'), icon: infoIcon },
          ],
        },
      ]
    case 'tenant':
      return [
        {
          label: s('overview'),
          items: [
            { key: '/tenant/dashboard', label: t('menu.myHome'), icon: icon('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z') },
            { key: '/tenant/listings', label: t('menu.browseProperties'), icon: icon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22') },
          ],
        },
        {
          label: s('myServices'),
          items: [
            { key: '/tenant/payments', label: t('menu.myPayments'), icon: icon('M1 4h22v16H1z M1 10h23') },
            { key: '/tenant/maintenance', label: t('menu.maintenance'), icon: icon('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z') },
            { key: '/tenant/documents', label: t('menu.documents'), icon: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6') },
            { key: '/tenant/services', label: t('menu.services'), icon: icon('M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z') },
            { key: '/company', label: t('menu.company'), icon: infoIcon },
          ],
        },
      ]
    case 'employee':
    case 'agent': // 经纪与员工同属销售工作台
      return [
        {
          label: s('overview'),
          items: [
            { key: '/employee/dashboard', label: t('menu.dashboard'), icon: icon('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z') },
          ],
        },
        {
          label: s('businessManagement'),
          items: [
            { key: '/properties', label: t('menu.properties'), icon: icon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22') },
            { key: '/listings', label: t('menu.propertySearch'), icon: icon('M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z') },
            { key: '/crm', label: t('menu.leads'), icon: icon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0') },
            { key: '/leases', label: t('menu.leases'), icon: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6') },
            { key: '/chat', label: t('menu.chat'), icon: icon('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z') },
            { key: '/contracts', label: t('menu.contracts'), icon: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13l2 2 4-4') },
          ],
        },
        {
          label: s('personal'),
          items: [
            { key: '/employee/attendance', label: t('menu.attendance'), icon: icon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2') },
            { key: '/employee/performance', label: t('menu.performance'), icon: icon('M12 15l3.5-3.5 M12 3v0 M2 12h2 M20 12h2 M12 22v0') },
            { key: '/employee/contacts', label: t('menu.contacts'), icon: icon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0') },
            { key: '/company', label: t('menu.company'), icon: infoIcon },
          ],
        },
      ]
    case 'admin': // 定位：系统管理、查看业绩、查看员工（不再展示宏观战略）
      return [
        {
          label: s('overview'),
          items: [
            { key: '/dashboard', label: t('menu.dashboard'), icon: icon('M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z') },
          ],
        },
        {
          label: s('businessManagement'),
          items: [
            { key: '/properties', label: t('menu.properties'), icon: icon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22') },
            { key: '/crm', label: t('menu.leads'), icon: icon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0') },
            { key: '/leases', label: t('menu.leases'), icon: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6') },
            { key: '/payments', label: t('menu.payments'), icon: icon('M1 4h22v16H1z M1 10h23') },
            { key: '/contracts', label: t('menu.contracts'), icon: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13l2 2 4-4') },
          ],
        },
        {
          label: s('performance'),
          items: [
            { key: '/operations', label: t('menu.operationsBoard'), icon: icon('M3 3v18h18 M7 14l4-5 3 3 5-7') },
            { key: '/viewings', label: t('menu.viewings'), icon: icon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2') },
            { key: '/reconciliation', label: t('menu.reconciliation'), icon: icon('M1 4h22v16H1z M1 10h23 M9 16l3 3 5-6') },
            { key: '/trend', label: t('menu.trend'), icon: icon('M18 20V10M12 20V4M6 20v-6') },
            { key: '/commission-rules', label: t('menu.commissionRules'), icon: icon('M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6') },
          ],
        },
        {
          label: s('system'),
          items: [
            { key: '/system/users', label: t('menu.accountUsers'), icon: icon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75') },
            { key: '/system/groups', label: t('menu.userGroups'), icon: icon('M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M18 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 21v-1a5 5 0 0 1 5-5 5 5 0 0 1 5 5v1 M21 16.5V21 M19.5 18.75h3') },
            { key: '/system/permissions', label: t('menu.rolePermissions'), icon: icon('M21 2l-2 2 M3 22l2-2 M5 20l-2-2 M3 6h4 M7 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0z M9.5 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z') },
            { key: '/system/review-center', label: t('menu.reviewCenter'), icon: icon('M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3') },
            { key: '/employees', label: t('menu.employees'), icon: icon('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z') },
            { key: '/settings', label: t('menu.settings'), icon: icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z') },
            { key: '/company', label: t('menu.company'), icon: infoIcon },
          ],
        },
      ]
    default: // 未知/缺失角色：不产出任何菜单（fail closed，避免误开管理端入口）
      return []
  }
}

const roleBrandKey: Record<string, string> = {
  admin: 'admin',
  agent: 'employee',
  owner: 'owner',
  tenant: 'tenant',
  employee: 'employee',
}

// 各角色移动端底部 Tab 栏（对应 rental-full-draft 的 mobile 形态）
const buildMobileTabs = (role: string, t: TFunction): NavItem[] => {
  switch (role) {
    case 'owner':
      return [
        { key: '/owner/dashboard', label: t('portal.home'), icon: icon('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z') },
        { key: '/owner/income', label: t('portal.income'), icon: icon('M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6') },
        { key: '/owner/marketing', label: t('portal.marketing'), icon: icon('M3 21v-6M21 21v-6M7 21v-9M17 21v-9M3 17l3-2 4 1 4-3 3 2 4-4') },
        { key: '/owner/services', label: t('portal.services'), icon: icon('M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z') },
        { key: '/company', label: t('portal.profile'), icon: icon('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z') },
      ]
    case 'tenant':
      return [
        { key: '/tenant/dashboard', label: t('portal.home'), icon: icon('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z') },
        { key: '/tenant/payments', label: t('portal.payments'), icon: icon('M1 4h22v16H1z M1 10h23') },
        { key: '/tenant/documents', label: t('portal.documents'), icon: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6') },
        { key: '/tenant/services', label: t('portal.services'), icon: icon('M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z') },
        { key: '/tenant/maintenance', label: t('portal.maintenance'), icon: icon('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z') },
      ]
    case 'employee':
    case 'agent': // 经纪与员工同属销售工作台
      return [
        { key: '/employee/dashboard', label: t('menu.dashboard'), icon: icon('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z') },
        { key: '/properties', label: t('menu.properties'), icon: icon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22') },
        { key: '/listings', label: t('menu.propertySearch'), icon: icon('M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z') },
        { key: '/employee/attendance', label: t('menu.attendance'), icon: icon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2') },
        { key: '/employee/performance', label: t('menu.performance'), icon: icon('M12 15l3.5-3.5 M12 3v0 M2 12h2 M20 12h2 M12 22v0') },
        { key: '/employee/contacts', label: t('menu.contacts'), icon: icon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0') },
      ]
    case 'admin':
      return [
        { key: '/dashboard', label: t('menu.dashboard'), icon: icon('M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z') },
        { key: '/properties', label: t('menu.properties'), icon: icon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22') },
        { key: '/crm', label: t('menu.leads'), icon: icon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0') },
        { key: '/payments', label: t('menu.payments'), icon: icon('M1 4h22v16H1z M1 10h23') },
        { key: '/settings', label: t('menu.settings'), icon: icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z') },
      ]
    default: // 未知/缺失角色：不产出底部 Tab
      return []
  }
}

const MainLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { t } = useTranslation()

  // 兜底为空角色而不是 admin：user 缺失（本地缓存被清、令牌与用户不同步）时
  // 不应拿到管理端菜单，菜单构建的 default 分支返回空即可。
  const role = user?.role || ''
  const isConsumer = role !== 'admin' && role !== 'agent'
  const sections = useMemo(() => buildSections(role, t), [role, t])
  const mobileTabs = useMemo(() => buildMobileTabs(role, t), [role, t])

  const allKeys = useMemo(
    () => sections.flatMap((s) => s.items.map((i) => i.key)),
    [sections],
  )

  const selectedKey = useMemo(() => {
    const path = location.pathname
    const exact = allKeys.find((k) => path === k)
    if (exact) return exact
    const prefix = allKeys.find((k) => path.startsWith(k + '/'))
    return prefix || allKeys[0] || '/dashboard'
  }, [location.pathname, allKeys])

  const currentTitle = useMemo(() => {
    for (const s of sections) {
      const found = s.items.find((i) => i.key === selectedKey)
      if (found) return found.label
    }
    return 'HaoFang.World'
  }, [sections, selectedKey])

  const handleNav = (key: string) => {
    navigate(key)
    setMobileOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleGoHome = () => {
    navigate('/')
  }

  const userMenu: MenuProps['items'] = [
    {
      key: 'logout',
      label: t('common.logout'),
      onClick: handleLogout,
    },
  ]

  const displayName = user?.full_name || user?.name || t('welcome')
  const avatarChar = (displayName || 'U').charAt(0).toUpperCase()
  const brandKey = roleBrandKey[role]
  // 侧边栏品牌标签：对齐设计稿仅显示角色名（logo 图已含 HaoFang.World 字标）
  const brandLabel = brandKey ? t(`role.${brandKey}`) : ''

  return (
    <div className="rent-app" data-ui={isConsumer ? 'consumer' : 'admin'}>
      {/* 移动端遮罩 */}
      <div
        className="rent-sidebar-overlay"
        data-open={mobileOpen}
        onClick={() => setMobileOpen(false)}
      />

      {/* ===== Sidebar ===== */}
      <aside
        className="rent-app__sidebar"
        data-mobile-open={mobileOpen}
      >
        <div className="rent-sidebar">
          <div className="rent-sidebar__brand" style={{ cursor: 'pointer' }} onClick={handleGoHome}>
            <img className="rent-sidebar__logo" src={brandLogo} alt="HaoFang.World" />
            <span className="rent-sidebar__name">{brandLabel}</span>
          </div>
          <nav className="rent-sidebar__nav no-scrollbar">
            {sections.map((section, si) => (
              <div key={si}>
                {section.label && (
                  <div className="rent-sidebar__section-label">{section.label}</div>
                )}
                {section.items.map((item) => (
                  <a
                    key={item.key}
                    className="rent-nav-item"
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
              </div>
            ))}
          </nav>
          <div className="rent-sidebar__footer">
            <div className="rent-flex rent-flex--between rent-gap-3">
              <div className="rent-flex rent-gap-2" style={{ alignItems: 'center', minWidth: 0 }}>
                <div className="rent-avatar rent-avatar--sm">{avatarChar}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.email || t(`role.${brandKey}`)}
                  </div>
                </div>
              </div>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={handleLogout}>
                {t('topbar.logoutShort')}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ===== Topbar ===== */}
      <header className="rent-app__topbar">
        <div className="rent-topbar">
          <div className="rent-topbar__left">
            <button
              className="rent-menu-toggle"
              onClick={() => setMobileOpen(true)}
              aria-label={t('topbar.openMenu')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-2)" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="rent-topbar__title">{currentTitle}</h1>
          </div>
          <div className="rent-topbar__right">
            <button className="rent-icon-btn" aria-label={t('home.backToHome')} onClick={handleGoHome}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>
            <div className="rent-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <Input
                variant="borderless"
                placeholder={t('topbar.searchPlaceholder')}
                style={{ background: 'none', padding: 0 }}
              />
            </div>
            <LanguageSwitcher />
            <button className="rent-icon-btn" aria-label={t('topbar.notifications')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="rent-icon-btn__badge">3</span>
            </button>
            <Dropdown menu={{ items: userMenu }} placement="bottomRight">
              <div className="rent-avatar" style={{ cursor: 'pointer' }}>{avatarChar}</div>
            </Dropdown>
          </div>
        </div>
      </header>

      {/* ===== Main Content ===== */}
      <main className="rent-app__main">
        <Outlet />
      </main>

      {/* ===== 移动端底部 Tab 栏（仅 ≤960px 显示）===== */}
      <nav className="rent-mobile-tabbar rent-mobile-nav">
        {mobileTabs.map((item) => {
          const active =
            selectedKey === item.key || location.pathname.startsWith(item.key + '/')
          return (
            <a
              key={item.key}
              className="rent-mobile-nav__item"
              data-active={active}
              onClick={(e) => {
                e.preventDefault()
                navigate(item.key)
                setMobileOpen(false)
              }}
            >
              <span className="rent-mobile-nav__icon">{item.icon}</span>
              <span className="rent-mobile-nav__label">{item.label}</span>
            </a>
          )
        })}
      </nav>
    </div>
  )
}

export default MainLayout
