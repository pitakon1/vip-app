import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { NAV_ICONS, type NavIconKey } from './icons'
import { useI18n } from '@/i18n'
import './index.scss'

/** 角色化底部导航的角色键。`guest` 是未登录访客的 C 端导航。 */
export type NavRole = 'admin' | 'employee' | 'owner' | 'tenant' | 'guest'

interface NavItem {
  /** 与 prototype `data-nav-key` 对应的标识，页面用它标记当前选中项 */
  key: string
  label: string
  icon: NavIconKey
  path: string
}

/**
 * 各角色底部导航项。
 * `label` 为 i18n key（guest 用 pub.*，其余角色用 tab.*，均为三语字典已收录）。
 */
const NAV_MAP: Record<NavRole, NavItem[]> = {
  admin: [
    { key: 'dashboard', label: 'tab.home', icon: 'home', path: '/pages/admin/home/index' },
    { key: 'properties', label: 'tab.properties', icon: 'building', path: '/pages/admin/properties/index' },
    { key: 'crm', label: 'tab.customers', icon: 'users', path: '/pages/admin/crm/index' },
    { key: 'payments', label: 'tab.payments', icon: 'card', path: '/pages/admin/payments/index' },
    { key: 'settings', label: 'tab.profile', icon: 'gear', path: '/pages/profile/index' },
  ],
  employee: [
    { key: 'dashboard', label: 'tab.home', icon: 'home', path: '/pages/employee/home/index' },
    { key: 'properties', label: 'tab.properties', icon: 'building', path: '/pages/employee/property-browse/index' },
    { key: 'crm', label: 'tab.customers', icon: 'users', path: '/pages/employee/crm/index' },
    { key: 'messages', label: 'tab.messages', icon: 'message', path: '/pages/chat/list/index' },
    { key: 'settings', label: 'tab.profile', icon: 'user', path: '/pages/profile/index' },
  ],
  owner: [
    { key: 'dashboard', label: 'tab.home', icon: 'home', path: '/pages/owner/home/index' },
    { key: 'income', label: 'tab.income', icon: 'money', path: '/pages/owner/income/index' },
    { key: 'settings', label: 'tab.profile', icon: 'user', path: '/pages/profile/index' },
  ],
  tenant: [
    { key: 'dashboard', label: 'tab.home', icon: 'home', path: '/pages/tenant/home/index' },
    { key: 'browse', label: 'tab.listings', icon: 'search', path: '/pages/tenant/listings/index' },
    { key: 'messages', label: 'tab.messages', icon: 'message', path: '/pages/chat/list/index' },
    { key: 'profile', label: 'tab.profile', icon: 'user', path: '/pages/profile/index' },
  ],
  // 未登录访客：内容全部来自匿名接口 `/public/*`，四个 Tab 都不需要 token。
  // 「我的」与站内 profile 统一为同一访客态（对齐 App ProfileScreen 访客分支）。
  guest: [
    { key: 'browse', label: 'pub.tabListings', icon: 'search', path: '/pages/public/listings/index' },
    { key: 'schools', label: 'pub.tabSchools', icon: 'school', path: '/pages/public/schools/index' },
    { key: 'communities', label: 'pub.tabCommunities', icon: 'building', path: '/pages/public/communities/index' },
    { key: 'me', label: 'pub.tabMe', icon: 'user', path: '/pages/profile/index' },
  ],
}

interface BottomNavProps {
  role: NavRole
  /** 当前选中的导航项 key，取自本表 */
  active: string
}

/**
 * 角色化底部导航。
 *
 * 原型把底部导航画在页面内部（`rent-mobile__tab`），因此这里也做成页面级组件而非
 * 微信原生 tabBar —— 原生 tabBar 最多 5 项且无法按角色切换，四个角色共 18 项放不下。
 * 跳转用 `redirectTo`：导航语义是「切换主页面」，不应在返回栈里堆叠。
 */
export default function BottomNav({ role, active }: BottomNavProps) {
  const items = NAV_MAP[role]
  const { t } = useI18n()

  return (
    <View className='bottom-nav'>
      {items.map((item) => {
        const isActive = item.key === active
        return (
          <View
            key={item.key}
            className={`bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`}
            onClick={() => {
              if (isActive) return
              Taro.redirectTo({ url: item.path })
            }}
          >
            <View
              className='bottom-nav__icon'
              style={{
                backgroundImage: `url("${
                  isActive ? NAV_ICONS[item.icon].active : NAV_ICONS[item.icon].inactive
                }")`,
              }}
            />
            <Text className='bottom-nav__label'>{t(item.label)}</Text>
          </View>
        )
      })}
    </View>
  )
}