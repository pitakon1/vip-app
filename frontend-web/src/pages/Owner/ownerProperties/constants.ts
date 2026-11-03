import { LIST_PAGE_SIZE } from '@/lib/pagination'

export const PAGE_SIZE = LIST_PAGE_SIZE

// 卡片 banner 纯色主题（对齐管理员端 rent-prop-card；禁用渐变）
export const BANNER_COLORS = ['var(--rent-primary)', 'var(--rent-accent)', 'var(--state-success)']

export const bannerColorFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) {
    h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  }
  return BANNER_COLORS[h % BANNER_COLORS.length]
}

export const formatRent = (v: any) => Number(v || 0).toLocaleString()

// 与后端 PropertyStatus 对齐（vacant / rented / renewing / maintenance）
export const statusLabelMap: Record<string, string> = {
  vacant: 'ownerProperties.stVacant',
  rented: 'ownerProperties.stRented',
  renewing: 'ownerProperties.stRenewing',
  maintenance: 'ownerProperties.stMaintenance',
}

export const propertyTypeMap: Record<string, string> = {
  apartment: 'ownerProperties.typeApartment',
  condo: 'ownerProperties.typeApartment',
  villa: 'ownerProperties.typeVilla',
  house: 'ownerProperties.typeHouse',
  shop: 'ownerProperties.typeShop',
  commercial: 'ownerProperties.typeCommercial',
  office: 'ownerProperties.typeOffice',
  factory: 'ownerProperties.typeFactory',
  hotel: 'ownerProperties.typeHotel',
  land: 'ownerProperties.typeLand',
  townhouse: 'ownerProperties.typeTownhouse',
  warehouse: 'ownerProperties.typeWarehouse',
  coworking: 'ownerProperties.typeCoworking',
  homeoffice: 'ownerProperties.typeHomeOffice',
  showroom: 'ownerProperties.typeShowroom',
}

export const ownerPropertiesQueryKey = (uid: string): string[] => [
  'owner-properties',
  'list',
  uid,
]
