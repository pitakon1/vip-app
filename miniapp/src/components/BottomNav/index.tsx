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
 * C 端（业主 + 租客 + 未登录访客）统一底部导航：与 App `MainTabNavigator` 的 C 端 Tab
 * 一致 —— 首页 / 发现 / 消息 / 我的。找房列表不再占用底部 Tab（由首页搜索与分类磁贴进入），
 * 与 App 的「浏览无需注册」结构对齐。
 */
const C_NAV: NavItem[] = [
  { key: 'dashboard', label: 'tab.home', icon: 'home', path: '/pages/tenant/home/index' },
  { key: 'discover', label: 'tab.discover', icon: 'compass', path: '/pages/public/discover/index' },
  { key: 'messages', label: 'tab.messages', icon: 'message', path: '/pages/chat/list/index' },
  { key: 'profile', label: 'tab.profile', icon: 'user', path: '/pages/profile/index' },
]

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
  // 业主与租客共用同一组 C 端导航，但业主「首页」指向业主工作台
  // （pages/owner/home）：名下房源 / 待收租金 / 空置提醒都在这里，
  // 否则业主点「首页」会落到租客找房首页，看不到自己的资产。
  owner: [
    { key: 'dashboard', label: 'tab.home', icon: 'home', path: '/pages/owner/home/index' },
    ...C_NAV.slice(1),
  ],
  tenant: C_NAV,
  // 未登录访客与登录用户使用同一组 C 端 Tab（对齐 App：访客同样看到 首页/发现/消息/我的，
  // 只有「我的」和需要写操作的动作才要求登录）。
  guest: C_NAV,
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