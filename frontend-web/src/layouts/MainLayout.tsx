import { useState, useMemo } from 'react'
import { Dropdown, Input } from 'antd'
import type { MenuProps } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TFunction } from 'i18next'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import brandLogo from '@/assets/haofang-logo.jpg'
import { ROLE_SECTIONS, ROLE_MOBILE_KEYS, resolveLabelKey } from '@/config/roleMenus'
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

// 消费端角色键 -> 菜单配置键（头像/代理与员工共用销售工作台菜单）
const SECTION_KEY: Record<string, string> = {
  owner: 'owner',
  tenant: 'tenant',
  agent: 'employee',
  employee: 'employee',
  admin: 'admin',
}

// 统一从配置源派生侧栏分组菜单与移动端底部 Tab，去除各角色的重复分支。
const buildSections = (role: string, t: TFunction): NavSection[] => {
  const sections = ROLE_SECTIONS[SECTION_KEY[role] ?? role]
  if (!sections) return []
  return sections.map((section) => ({
    label: section.labelKey ? (t(section.labelKey) as string) : undefined,
    items: section.items.map((it) => ({
      key: it.key,
      label: t(it.labelKey) as string,
      icon: icon(it.icon),
    })),
  }))
}

const buildMobileTabs = (role: string, t: TFunction): NavItem[] => {
  const sections = ROLE_SECTIONS[SECTION_KEY[role] ?? role]
  if (!sections) return []
  const keys = ROLE_MOBILE_KEYS[role] ?? []
  const byKey = new Map(sections.flatMap((s) => s.items).map((it) => [it.key, it]))
  const items: NavItem[] = []
  for (const k of keys) {
    const it = byKey.get(k)
    if (!it) continue
    items.push({ key: it.key, label: t(resolveLabelKey(it)) as string, icon: icon(it.icon) })
  }
  return items
}

const roleBrandKey: Record<string, string> = {
  admin: 'admin',
  agent: 'employee',
  owner: 'owner',
  tenant: 'tenant',
  employee: 'employee',
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
