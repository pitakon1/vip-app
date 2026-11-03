import type { CreateFormValues, DisplayStatus, RenewFormValues } from './types'

export const displayStatusMeta: Record<DisplayStatus, { label: string; badge: string; dot: string }> = {
  active: { label: 'leases.stActive', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  expiring: { label: 'leases.stExpiring', badge: 'rent-badge--warning', dot: 'var(--state-warning)' },
  expired: { label: 'leases.stExpired', badge: 'rent-badge--error', dot: 'var(--state-error)' },
  terminated: { label: 'leases.stTerminated', badge: 'rent-badge--neutral', dot: 'var(--rent-ink-3)' },
}

// 房源类型取值与后端 Property.property_type 对齐（apartment/house/condo/commercial）
export const PROPERTY_TYPE_OPTIONS = [
  { value: 'apartment', label: 'leases.typeApartment' },
  { value: 'house', label: 'leases.typeHouse' },
  { value: 'condo', label: 'leases.typeCondo' },
  { value: 'commercial', label: 'leases.typeCommercial' },
]

// 押金状态取值（后端 deposit_status：held/refunded/forfeited）
export const depositStatusLabel: Record<string, string> = {
  held: 'leases.depHeld',
  refunded: 'leases.depRefunded',
  forfeited: 'leases.depForfeited',
}

export const emptyCreateForm: CreateFormValues = {
  propertyId: '',
  tenantName: '',
  tenantPhone: '',
  startDate: '',
  endDate: '',
  monthlyRent: '',
  deposit: '',
}

export const emptyRenewForm: RenewFormValues = {
  startDate: '',
  endDate: '',
  monthlyRent: '',
}
