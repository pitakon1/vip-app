import { LIST_PAGE_SIZE } from '@/lib/pagination'

export const PAGE_SIZE = LIST_PAGE_SIZE

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
