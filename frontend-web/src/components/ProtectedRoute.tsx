import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

/**
 * 路由守卫：未登录跳登录页。
 * denyRoles：命中角色时跳 /portal（由 RoleRedirect 送往该角色自己的首页），
 * 用于把租客挡在 B 端后台页面（如 /properties）之外。
 */
export function ProtectedRoute({
  children,
  denyRoles,
}: {
  children: ReactNode
  denyRoles?: string[]
}) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  if (!token) return <Navigate to="/login" replace />
  if (denyRoles && user && denyRoles.includes(user.role)) return <Navigate to="/portal" replace />
  return <>{children}</>
}
