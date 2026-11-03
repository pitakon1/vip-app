import dayjs from 'dayjs'
import type { Lease } from '@/types'
import type { DisplayStatus } from './types'

// 根据租约数据计算显示状态
export const getDisplayStatus = (lease: Lease): DisplayStatus => {
  const explicit = (lease as any).display_status as DisplayStatus | undefined
  if (explicit) return explicit
  if (lease.status === 'terminated') return 'terminated'
  if (lease.status === 'expired') return 'expired'
  // active - 检查是否即将到期（60天内）
  const endDate = (lease as any).end_date
  if (endDate) {
    const days = dayjs(endDate).diff(dayjs(), 'day')
    if (days >= 0 && days <= 60) return 'expiring'
  }
  return 'active'
}

// 分页页码（对齐原型 rent-pagination 结构）
export const buildPageNumbers = (totalPages: number, page: number): (number | string)[] => {
  const nums: (number | string)[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) nums.push(i)
  } else {
    nums.push(1)
    if (page > 4) nums.push('prev-ellipsis')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) nums.push(i)
    if (page < totalPages - 3) nums.push('next-ellipsis')
    nums.push(totalPages)
  }
  return nums
}
