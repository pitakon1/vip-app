export interface PropertyItem {
  id: string
  room_number: string
  project_id?: string | null
  project_name?: string | null
  owner_id?: string
  status: string
  monthly_rent: number
  currency?: string
  deposit_months?: number
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  floor?: number
  building?: string
  address?: string
  property_type?: string
  furnished?: boolean
  description?: string
  available_from?: string
  video_url?: string
  photos?: any[]
  [key: string]: any
}

export interface ProjectItem {
  id: string
  name?: string
  address?: string
  district?: string
  city?: string
  nearest_subway?: string
  developer?: string
  property_management_company?: string
  [key: string]: any
}

export interface SaleListingItem {
  id: string
  property_id?: string | null
  title?: string
  address?: string
  asking_price?: number
  currency?: string
  status?: string
  [key: string]: any
}

export interface DetailPayload {
  detail: PropertyItem | null
  project: ProjectItem | null
  saleListing: SaleListingItem | null
  peers: PropertyItem[]
}

export interface FactItem {
  key: string
  icon: string
  label: string
  value: string
}

export interface PoiItem {
  key: string
  icon: string
  name: string
  label: string
}

export interface Benchmark {
  avg: number
  pct: number
  lower: boolean
  currency?: string
}

export interface LoanResult {
  principal: number
  months: number
  monthly: number | null
}
