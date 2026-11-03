import type { EmployeeFormValues } from './types'

// 与设计稿一致：6 色循环（默认主色 → info → success → warning → 默认 → neutral）
export const AVATAR_COLORS = ['', 'rent-avatar--info', 'rent-avatar--success', 'rent-avatar--warning', '', 'rent-avatar--neutral']

export const emptyEmployeeForm: EmployeeFormValues = {
  fullName: '',
  email: '',
  phone: '',
  department: '',
  position: '',
  password: '',
  isActive: true,
}
