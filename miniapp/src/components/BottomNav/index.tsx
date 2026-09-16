import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { NAV_ICONS, type NavIconKey } from './icons'
import './index.scss'

/** 角色化底部导航的角色键 */
export type NavRole = 'admin' | 'employee' | 'owner' | 'tenant'

interface NavItem {
  /** 与 prototype `data-nav-key` 对应的标识，页面用它标记当前选中项 */
  key: string
  label: string
  icon: NavIconKey
  path: string
}

/**
 * 各角色底部导航项。
 * 顺序与标签严格取自原型底部导航（`rent-mobile__tab` 的 `data-nav-key` 序列）：
 *   管理端 = 首页 / 房源 / 客户 / 收款 / 我的
 *   员工端 = 首页 / 房源 / 考勤 / 业绩 / 通讯录
 *   业主端 = 首页 / 收益 / 服务 / 我的
 *   租客端 = 首页 / 找房 / 消息 / 我的
 */
const NAV_MAP: Record<NavRole, NavItem[]> = {
  admin: [
    { key: 'dashboard', label: '首页', icon: 'home', path: '/pages/admin/home/index' },
    { key: 'properties', label: '房源', icon: 'building', path: '/pages/admin/properties/index' },
    { key: 'crm', label: '客户', icon: 'users', path: '/pages/admin/crm/index' },
    { key: 'payments', label: '收款', icon: 'card', path: '/pages/admin/payments/index' },
    { key: 'settings', label: '我的', icon: 'gear', path: '/pages/profile/index' },
  ],
  employee: [
    { key: 'dashboard', label: '首页', icon: 'home', path: '/pages/employee/home/index' },
    { key: 'properties', label: '房源', icon: 'building', path: '/pages/employee/property-browse/index' },
    { key: 'attendance', label: '考勤', icon: 'calendar', path: '/pages/attendance/index' },
    { key: 'performance', label: '业绩', icon: 'chart', path: '/pages/employee/performance/index' },
    { key: 'contacts', label: '通讯录', icon: 'users', path: '/pages/employee/contacts/index' },
  ],
  owner: [
    { key: 'dashboard', label: '首页', icon: 'home', path: '/pages/owner/home/index' },
    { key: 'income', label: '收益', icon: 'money', path: '/pages/owner/income/index' },
    { key: 'services', label: '服务', icon: 'briefcase', path: '/pages/owner/services/index' },
    { key: 'settings', label: '我的', icon: 'user', path: '/pages/profile/index' },
  ],
  tenant: [
    { key: 'dashboard', label: '首页', icon: 'home', path: '/pages/tenant/home/index' },
    { key: 'browse', label: '找房', icon: 'search', path: '/pages/tenant/listings/index' },
    { key: 'messages', label: '消息', icon: 'message', path: '/pages/chat/list/index' },
    { key: 'profile', label: '我的', icon: 'user', path: '/pages/profile/index' },
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
            <Text className='bottom-nav__label'>{item.label}</Text>
          </View>
        )
      })}
    </View>
  )
}