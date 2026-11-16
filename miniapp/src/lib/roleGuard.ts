import Taro from '@tarojs/taro'
import useAuthStore from '@/stores/auth'

/** 角色首页落点：与 pages/index 登录后的重定向保持一致 */
export const roleHome = (role?: string | null) => {
  switch (role) {
    case 'admin':
      return '/pages/admin/home/index'
    case 'employee':
    case 'agent':
      return '/pages/employee/home/index'
    case 'partner_admin':
      return '/pages/admin/partner-members/index'
    case 'owner':
    case 'tenant':
      return '/pages/tenant/home/index'
    default:
      return '/pages/profile/index'
  }
}

/**
 * 页面级角色守卫（对齐 Web 路由 guard）：
 * - 未登录：跳登录页
 * - 角色不在允许列表：不渲染业务内容，直接重定向到该角色的首页
 * 返回 false 时调用方必须立即 return，且不要发起业务请求。
 */
export const guardRoles = (allowed: string[]) => {
  const { token, user } = useAuthStore.getState()
  if (!token) {
    Taro.redirectTo({ url: '/pages/login/index' })
    return false
  }
  const role = user?.role
  if (!role || !allowed.includes(role)) {
    Taro.redirectTo({ url: roleHome(role) })
    return false
  }
  return true
}
