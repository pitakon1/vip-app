import type { LeaseStatus } from '@/types'

export type DisplayStatus = 'active' | 'expiring' | 'expired' | 'terminated'

export interface QueryParams {
  page: number
  pageSize: number
  status?: LeaseStatus
  keyword?: string
  propertyType?: string
  dateFrom?: string
  dateTo?: string
  endingWithinDays?: number
}

export interface CreateFormValues {
  propertyId: string
  tenantName: string
  tenantPhone: string
  startDate: string
  endDate: string
  monthlyRent: string
  deposit: string
}

export interface RenewFormValues {
  startDate: string
  endDate: string
  monthlyRent: string
}

export interface LeaseStatusCounts {
  total: number
  active: number
  expiring: number
  expired: number
  terminated: number
}
