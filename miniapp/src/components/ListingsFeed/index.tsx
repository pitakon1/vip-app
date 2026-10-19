/**
 * 房源信息流（C 端「找房」/ 员工端「房源」共用）。
 *
 * 纯展示组件：按 1:1 复刻原型渲染 hero-band / hero-card / 贝壳式筛选 Tab 下拉 /
 * 房源卡片 / 空态 / 加载更多。仅自持「面板开合 (openTab) 与草稿值」等纯 UI 状态，
 * 筛选提交统一经 onFiltersChange 上抛；列表数据、分页、搜索词、定位与收藏均由调用页负责。
 *
 * 同时导出筛选选项常量与 selectVisibleListings 供调用页做客户端筛选/排序复用。
 */
import { useMemo, useState } from 'react'
import { View, Text, ScrollView, Image, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { iconStyle } from '@/utils/icons'
import { fmtMoney as formatRent } from '@/utils/format'
import StateBlock from '@/components/StateBlock'
import type { MetroLine } from '@/data/locationMetro'
import type { DistrictOptionNode } from '@/lib/categoryShared'
import { useI18n } from '@/i18n'

// ==================== 类型 ====================
export interface Listing {
  id: string
  title?: string
  room_number?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  sale_price?: number
  currency?: string
  bedrooms?: number
  size_sqm?: number
  status?: string
  description?: string
  photos?: string[]
  [key: string]: any
}

export type BizKey = 'rent' | 'sale'

/** 受控筛选状态：由调用页持有，组件仅提交增量。 */
export interface ListingsFilters {
  districtSel: string | null
  metroSel: string[]
  pricePreset: string
  customMin: string
  customMax: string
  bedroomSel: string
  areaPreset: string
  areaCustomMin: string
  areaCustomMax: string
  statusSel: string
  orientationSel: string
  floorSel: string
  decorSel: string
  amenitySel: string[]
  sortKey: string
}

export interface ListingsFeedProps {
  // 列表数据与分页
  items: Listing[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  error: boolean
  onLoadMore: () => void
  onRetry: () => void
  // 筛选（受控）与提交
  filters: ListingsFilters
  onFiltersChange: (patch: Partial<ListingsFilters>) => void
  // 区域面板数据（当前定位城市的区/街道 + 轨交线路）
  cityDistricts: DistrictOptionNode[]
  metroLines: MetroLine[]
  // 顶部城市定位胶囊
  cityLabel: string
  onPickCity: () => void
  // 搜索
  keyword: string
  onKeywordChange: (v: string) => void
  onSearch: () => void
  recentSearches: string[]
  onPickRecent: (word: string) => void
  onClearRecent: () => void
  // 「附近」：按离我最近排序
  nearby: boolean
  onToggleNearby: () => void
  // 业务 Tab（整租 / 买房）
  biz: BizKey
  onBizChange: (biz: BizKey) => void
  // 收藏
  favSet: Set<string>
  favPending: Set<string>
  onToggleFavorite: (e: any, item: Listing) => void
  // 结果数（「查看 N 套房源」）
  resultCount: number
  // 去地图看
  onGoMap: () => void
  // 打开详情
  onOpenDetail: (item: Listing) => void
}

// ==================== 业务类型：整租 / 买房（对齐原型业务栏） ====================
export const BIZ_OPTIONS: { key: BizKey; label: string }[] = [
  { key: 'rent', label: 'tl.bizWhole' },
  { key: 'sale', label: 'pub.typeSell' }
]

// 顶部找房卡「居室」快选：不限 / 1居 / 2居 / 3居+（3居+ = 3 室及以上）
export const HERO_BED_OPTIONS: { key: string; label: string }[] = [
  { key: '', label: 'pub.filterAny' },
  { key: '1', label: 'pub.bed.1' },
  { key: '2', label: 'pub.bed.2' },
  { key: '3p', label: 'tl.bed3plus' }
]

// ==================== 排序（贝壳式下拉 Tab） ====================
export const SORT_OPTIONS = [
  { key: 'default', label: 'prop.sortDefault' },
  { key: 'latest', label: 'tl.sortLatest' },
  { key: 'price_asc', label: 'prop.sortPriceAsc' },
  { key: 'price_desc', label: 'prop.sortPriceDesc' },
  { key: 'area_desc', label: 'prop.sortAreaDesc' }
]

// ==================== 价格筛选（对齐贝壳「价格」弹层：预设区间 + 自定义最低/最高 + 重置/确定） ====================
export interface PricePreset { key: string; label: string; min: number; max: number }
export const PRICE_PRESETS: PricePreset[] = [
  { key: '', label: 'pub.filterAny', min: 0, max: Infinity },
  { key: 'u3', label: 'tl.priceU3', min: 0, max: 30000 },
  { key: '3-5', label: 'pub.range.35', min: 30000, max: 50000 },
  { key: '5-8', label: 'tl.price58', min: 50000, max: 80000 },
  { key: 'g8', label: 'tl.priceG8', min: 80000, max: Infinity }
]

// 户型 / 面积 / 状态（与价格同构的贝壳式快捷选项）
export const BEDROOM_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: '1', label: 'pub.bed.1' },
  { key: '2', label: 'pub.bed.2' },
  { key: '3', label: 'pub.bed.3' },
  { key: '4', label: 'tl.bed4' },
  { key: '5', label: 'tl.bed5p' }
]

// 朝向筛选（贝壳式 8 向；东南亚西晒极强，朝向是硬决策因素）
export const ORIENTATION_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'north', label: 'tl.dirNorth' },
  { key: 'south', label: 'tl.dirSouth' },
  { key: 'east', label: 'tl.dirEast' },
  { key: 'west', label: 'tl.dirWest' },
  { key: 'northeast', label: 'tl.dirNortheast' },
  { key: 'northwest', label: 'tl.dirNorthwest' },
  { key: 'southeast', label: 'tl.dirSoutheast' },
  { key: 'southwest', label: 'tl.dirSouthwest' }
]

// 楼层筛选（贝壳式低/中/高；低层 1-5 / 中层 6-15 / 高层 16+）
export const FLOOR_LEVEL_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'low', label: 'tl.floorLow' },
  { key: 'mid', label: 'tl.floorMid' },
  { key: 'high', label: 'tl.floorHigh' }
]

// 装修筛选（东南亚口径：带家具家电是最常见出租形态）
export const DECORATION_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'bare', label: 'pub.decoration.bare' },
  { key: 'simple', label: 'pub.decoration.simple' },
  { key: 'standard', label: 'pub.decoration.standard' },
  { key: 'luxury', label: 'pub.decoration.luxury' },
  { key: 'fully_furnished', label: 'pub.decoration.fully_furnished' }
]

// 配套设施筛选（东南亚口径，多选任一命中；无供暖/暖气/天然气——东南亚无冬季）
export const AMENITY_OPTIONS = [
  { key: 'aircon', label: 'tl.amenityAircon' },
  { key: 'pool', label: 'tl.amenityPool' },
  { key: 'gym', label: 'tl.amenityGym' },
  { key: 'parking', label: 'tl.amenityParking' },
  { key: 'elevator', label: 'tl.amenityElevator' },
  { key: 'balcony', label: 'tl.amenityBalcony' },
  { key: 'garden', label: 'tl.amenityGarden' }
]

export const AREA_PRESETS = [
  { key: '', label: 'pub.filterAny', min: 0, max: Infinity },
  { key: 'u50', label: 'pub.area.u50', min: 0, max: 50 },
  { key: '50-100', label: 'pub.area.50100', min: 50, max: 100 },
  { key: '100-150', label: 'pub.area.100150', min: 100, max: 150 },
  { key: '150-200', label: 'pub.area.150200', min: 150, max: 200 },
  { key: 'g200', label: 'pub.area.g200', min: 200, max: Infinity }
]

export const STATUS_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'vacant', label: 'pub.statusVacant' },
  { key: 'rented', label: 'pub.statusRented' },
  { key: 'reserved', label: 'pub.statusReserved' },
  { key: 'maintenance', label: 'pub.statusMaintenance' }
]

// ==================== 匹配 / 排序（客户端筛选，C 端与员工端共用） ====================
const matchBiz = (item: Listing, biz: BizKey): boolean => {
  const isSale = Number(item.sale_price) > 0
  if (biz === 'sale') return isSale
  if (isSale) return false
  return Number(item.monthly_rent) > 0
}

const matchPrice = (rent: number, min: number, max: number): boolean => {
  if (min != null && !Number.isNaN(min) && min > 0 && rent < min) return false
  if (max != null && !Number.isNaN(max) && max > 0 && rent > max) return false
  return true
}

const matchArea = (sqm: number, min: number, max: number): boolean => {
  if (min != null && !Number.isNaN(min) && min > 0 && sqm < min) return false
  if (max != null && !Number.isNaN(max) && max > 0 && sqm > max) return false
  return true
}

// 命中关键词：房源地址/标题任一包含即可
const matchLocation = (item: any, kws: string[]): boolean =>
  kws.some((k) =>
    [item.address, item.title, item.room_number, item.city, item.district, item.area]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase())
      .some((v) => v.includes(k))
  )

// 「附近」排序：用户定位与楼盘坐标之间的球面距离（km）；坐标缺失的房源排到最后
const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface ListingsMatchContext {
  biz: BizKey
  /** 全局定位城市作用域关键词 */
  cityKw: string[]
  /** 当前「区域/地铁」筛选命中的关键词 */
  locationKw: string[]
  /** 「附近」开启时的用户坐标（未开启传 null） */
  nearbyPos: { lat: number; lng: number } | null
}

/**
 * 客户端筛选 + 排序（与原「找房」页 L694-735 逻辑逐字一致）。
 * 调用页把已拉取的一页数据、受控 filters 与匹配上下文传入即可。
 */
export function selectVisibleListings(
  listings: Listing[],
  filters: ListingsFilters,
  ctx: ListingsMatchContext
): Listing[] {
  const preset = PRICE_PRESETS.find((x) => x.key === filters.pricePreset)
  const activePrice = filters.pricePreset
    ? preset
      ? { min: preset.min, max: preset.max }
      : { min: 0, max: Infinity }
    : filters.customMin || filters.customMax
    ? { min: (Number(filters.customMin) || 0) * 10000, max: (Number(filters.customMax) || 0) * 10000 }
    : { min: 0, max: Infinity }

  const areaPreset = AREA_PRESETS.find((x) => x.key === filters.areaPreset)
  const activeArea = filters.areaPreset
    ? areaPreset
      ? { min: areaPreset.min, max: areaPreset.max }
      : { min: 0, max: Infinity }
    : filters.areaCustomMin || filters.areaCustomMax
    ? { min: Number(filters.areaCustomMin) || 0, max: Number(filters.areaCustomMax) || 0 }
    : { min: 0, max: Infinity }

  const list = listings.filter(
    (it) =>
      matchBiz(it, ctx.biz) &&
      matchLocation(it, ctx.cityKw) &&
      matchLocation(it, ctx.locationKw) &&
      matchPrice(Number(it.monthly_rent || 0), activePrice.min, activePrice.max) &&
      matchArea(Number(it.size_sqm || 0), activeArea.min, activeArea.max) &&
      (!filters.bedroomSel ||
        (filters.bedroomSel === '5'
          ? Number(it.bedrooms) >= 5
          : filters.bedroomSel === '3p'
          ? Number(it.bedrooms) >= 3
          : Number(it.bedrooms) === Number(filters.bedroomSel))) &&
      (!filters.statusSel || it.status === filters.statusSel) &&
      (!filters.orientationSel || it.orientation === filters.orientationSel) &&
      (!filters.floorSel ||
        (filters.floorSel === 'low'
          ? Number(it.floor || 0) >= 1 && Number(it.floor || 0) <= 5
          : filters.floorSel === 'mid'
          ? Number(it.floor || 0) >= 6 && Number(it.floor || 0) <= 15
          : Number(it.floor || 0) >= 16)) &&
      (!filters.decorSel || it.decoration === filters.decorSel) &&
      (!filters.amenitySel.length ||
        filters.amenitySel.some((a) => (Array.isArray(it.amenities) ? it.amenities : []).includes(a)))
  )

  const pos = ctx.nearbyPos
  if (pos) {
    return list.slice().sort((a, b) => {
      const da = a.lat != null && a.lng != null ? haversineKm(pos, { lat: a.lat, lng: a.lng }) : Infinity
      const db = b.lat != null && b.lng != null ? haversineKm(pos, { lat: b.lat, lng: b.lng }) : Infinity
      return da - db
    })
  }
  switch (filters.sortKey) {
    case 'latest': return list.slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    case 'price_asc': return list.slice().sort((a, b) => a.monthly_rent - b.monthly_rent)
    case 'price_desc': return list.slice().sort((a, b) => b.monthly_rent - a.monthly_rent)
    case 'area_desc': return list.slice().sort((a, b) => b.size_sqm - a.size_sqm)
    default: return list
  }
}

// ==================== 文案辅助 ====================
const typeLabelOf = (
  t: (k: string, p?: Record<string, string | number>) => string,
  type?: string
): string => {
  const map: Record<string, string> = {
    apartment: t('prop.typeApartment'),
    condo: t('prop.typeApartment'),
    villa: t('prop.typeVilla'),
    house: t('prop.typeVilla'),
    shop: t('prop.typeCommercial'),
    commercial: t('prop.typeCommercial'),
    office: t('prop.typeOffice'),
    factory: t('prop.typeFactory')
  }
  return map[type || ''] || t('prop.listing')
}

const statusMetaOf = (
  t: (k: string, p?: Record<string, string | number>) => string,
  s?: string
): { text: string; color: string } => {
  const map: Record<string, { text: string; color: string }> = {
    vacant: { text: t('pub.statusVacant'), color: 'var(--success)' },
    rented: { text: t('pub.statusRented'), color: 'var(--primary)' },
    reserved: { text: t('pub.statusReserved'), color: 'var(--primary)' },
    maintenance: { text: t('pub.statusMaintenance'), color: 'var(--warning)' }
  }
  return map[s || ''] || map.vacant
}

// 当前展开的筛选 Tab；null = 全部收起
type OpenTab = null | 'region' | 'price' | 'layout' | 'more' | 'sort'

export default function ListingsFeed(props: ListingsFeedProps) {
  const { t } = useI18n()
  const {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    onLoadMore,
    onRetry,
    filters,
    onFiltersChange: patch,
    cityDistricts,
    metroLines,
    cityLabel,
    onPickCity,
    keyword,
    onKeywordChange,
    onSearch,
    recentSearches,
    onPickRecent,
    onClearRecent,
    nearby,
    onToggleNearby,
    biz,
    onBizChange,
    favSet,
    favPending,
    onToggleFavorite,
    resultCount,
    onGoMap,
    onOpenDetail
  } = props

  // 当前展开的面板
  const [openTab, setOpenTab] = useState<OpenTab>(null)
  // 搜索框聚焦（纯 UI）
  const [searchFocused, setSearchFocused] = useState(false)
  // 收藏红心点击动效（仅视觉 class 切换）
  const [favAnim, setFavAnim] = useState<Set<string>>(new Set())

  // ---------- 区域 / 地铁 ----------
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area')
  const [metroDraft, setMetroDraft] = useState<string[]>([])
  const [metroLine, setMetroLine] = useState<string>(() => metroLines[0]?.key ?? '')

  const activeLine = useMemo(
    () => metroLines.find((l) => l.key === metroLine),
    [metroLines, metroLine]
  )
  const distNode = (key: string) => cityDistricts.find((d) => d.key === key)

  // 已选区域/地铁的关键词与展示文案（城市不参与：全局定位决定城市，找房页只做区/街道与地铁）
  const activeLocationKw = useMemo(() => {
    if (filters.districtSel) {
      const node = distNode(filters.districtSel)
      return node ? node.kws : []
    }
    if (filters.metroSel.length) {
      const stations = metroLines.flatMap((l) => l.stations)
      return stations.filter((s) => filters.metroSel.includes(s.name)).flatMap((s) => s.kws)
    }
    return []
  }, [filters.districtSel, filters.metroSel, metroLines, cityDistricts])

  const regionLabel = useMemo(() => {
    if (filters.districtSel) {
      const node = distNode(filters.districtSel)
      return node ? node.label : t('pub.district')
    }
    if (filters.metroSel.length) {
      const first = filters.metroSel[0]
      return filters.metroSel.length > 1 ? `${first} +${filters.metroSel.length - 1}` : first
    }
    return t('pub.district')
  }, [filters.districtSel, filters.metroSel, cityDistricts, t])

  // 区域=实时单选；城区与地铁互斥
  const applyDistrict = (key: string | null) => {
    if (filters.districtSel === key) {
      patch({ districtSel: null })
      return
    }
    setMetroDraft([])
    patch({ districtSel: key, metroSel: [] })
  }
  const toggleStation = (name: string) => {
    setMetroDraft((d) => (d.includes(name) ? d.filter((s) => s !== name) : [...d, name]))
  }
  const confirmMetro = () => {
    patch({ metroSel: metroDraft, ...(metroDraft.length ? { districtSel: null } : {}) })
    setOpenTab(null)
  }

  // ---------- 价格筛选：预设或自定义区间（万 → THB） ----------
  const [priceDraftMin, setPriceDraftMin] = useState('')
  const [priceDraftMax, setPriceDraftMax] = useState('')
  const hasPriceFilter = !!(filters.pricePreset || filters.customMin || filters.customMax)
  const priceLabel = useMemo(() => {
    const p = PRICE_PRESETS.find((x) => x.key === filters.pricePreset)
    if (p && p.key) return t(p.label)
    if (filters.customMin || filters.customMax) return t('prop.custom')
    return t('pub.filterPrice')
  }, [filters.pricePreset, filters.customMin, filters.customMax, t])

  const applyPricePreset = (key: string) => {
    patch({ pricePreset: key, ...(key ? { customMin: '', customMax: '' } : {}) })
  }
  const confirmPrice = () => {
    const min = priceDraftMin.trim()
    const max = priceDraftMax.trim()
    if (min || max) {
      const mn = Number(min)
      const mx = Number(max)
      if (min && max && mx < mn) {
        Taro.showToast({ title: t('tl.maxPriceError'), icon: 'none' })
        return
      }
      patch({ pricePreset: '', customMin: min, customMax: max })
    } else {
      patch({ pricePreset: '', customMin: '', customMax: '' })
    }
    setOpenTab(null)
  }

  // ---------- 房型 / 面积 / 状态 ----------
  const [bedroomDraft, setBedroomDraft] = useState('')
  const [areaDraftMin, setAreaDraftMin] = useState('')
  const [areaDraftMax, setAreaDraftMax] = useState('')
  const [statusDraft, setStatusDraft] = useState('')
  const [orientationDraft, setOrientationDraft] = useState('')
  const [floorDraft, setFloorDraft] = useState('')
  const [decorDraft, setDecorDraft] = useState('')
  const [amenityDraft, setAmenityDraft] = useState<string[]>([])

  const hasAreaFilter = !!(filters.areaPreset || filters.areaCustomMin || filters.areaCustomMax)
  const bedroomLabel = useMemo(
    () => t(BEDROOM_OPTIONS.find((b) => b.key === filters.bedroomSel)?.label || 'pub.filterBeds'),
    [filters.bedroomSel, t]
  )

  const applyAreaPreset = (key: string) => {
    patch({ areaPreset: key, ...(key ? { areaCustomMin: '', areaCustomMax: '' } : {}) })
  }
  const confirmBedroom = () => {
    patch({ bedroomSel: bedroomDraft })
    setOpenTab(null)
  }
  const confirmMore = () => {
    const min = areaDraftMin.trim()
    const max = areaDraftMax.trim()
    if (min || max) {
      const mn = Number(min)
      const mx = Number(max)
      if (min && max && mx < mn) {
        Taro.showToast({ title: t('tl.maxAreaError'), icon: 'none' })
        return
      }
      patch({ areaPreset: '', areaCustomMin: min, areaCustomMax: max })
    } else {
      patch({ areaPreset: '', areaCustomMin: '', areaCustomMax: '' })
    }
    patch({
      statusSel: statusDraft,
      orientationSel: orientationDraft,
      floorSel: floorDraft,
      decorSel: decorDraft,
      amenitySel: amenityDraft
    })
    setOpenTab(null)
  }

  // ---------- Tab 开合 ----------
  const toggleTab = (key: OpenTab) => {
    if (openTab === key) {
      setOpenTab(null)
      return
    }
    setOpenTab(key)
    if (key === 'region') {
      setMetroDraft(filters.metroSel)
      if (!filters.districtSel && filters.metroSel.length) setLocTab('metro')
    }
    if (key === 'price') {
      setPriceDraftMin(filters.customMin)
      setPriceDraftMax(filters.customMax)
    }
    if (key === 'layout') setBedroomDraft(filters.bedroomSel)
    if (key === 'more') {
      setAreaDraftMin(filters.areaCustomMin)
      setAreaDraftMax(filters.areaCustomMax)
      setStatusDraft(filters.statusSel)
      setOrientationDraft(filters.orientationSel)
      setFloorDraft(filters.floorSel)
      setDecorDraft(filters.decorSel)
      setAmenityDraft(filters.amenitySel)
    }
  }

  const resetCurrent = (key: OpenTab) => {
    if (key === 'region') {
      if (locTab === 'metro') {
        setMetroDraft([])
        patch({ metroSel: [] })
      } else {
        setMetroDraft([])
        patch({ districtSel: null, metroSel: [] })
      }
    } else if (key === 'price') {
      setPriceDraftMin('')
      setPriceDraftMax('')
      patch({ pricePreset: '', customMin: '', customMax: '' })
    } else if (key === 'layout') {
      setBedroomDraft('')
      patch({ bedroomSel: '' })
    } else if (key === 'more') {
      setAreaDraftMin('')
      setAreaDraftMax('')
      patch({ areaPreset: '', areaCustomMin: '', areaCustomMax: '' })
      setStatusDraft('')
      setOrientationDraft('')
      setFloorDraft('')
      setDecorDraft('')
      setAmenityDraft([])
      patch({
        statusSel: '',
        orientationSel: '',
        floorSel: '',
        decorSel: '',
        amenitySel: []
      })
    }
  }

  const confirmCurrent = (key: OpenTab) => {
    if (key === 'region') {
      if (locTab === 'metro') confirmMetro()
      else setOpenTab(null)
    } else if (key === 'price') confirmPrice()
    else if (key === 'layout') confirmBedroom()
    else if (key === 'more') confirmMore()
  }

  const sortLabel = t(SORT_OPTIONS.find((s) => s.key === filters.sortKey)?.label || 'pub.sort')
  const moreBadge =
    (hasAreaFilter ? 1 : 0) +
    (filters.statusSel ? 1 : 0) +
    (filters.orientationSel ? 1 : 0) +
    (filters.floorSel ? 1 : 0) +
    (filters.decorSel ? 1 : 0) +
    (filters.amenitySel.length ? 1 : 0)

  const filterTabs = [
    { key: 'region', label: activeLocationKw.length ? regionLabel : t('pub.district'), active: activeLocationKw.length > 0, badge: 0 },
    { key: 'price', label: hasPriceFilter ? priceLabel : t('pub.filterPrice'), active: hasPriceFilter, badge: 0 },
    { key: 'layout', label: filters.bedroomSel ? bedroomLabel : t('pub.filterBeds'), active: !!filters.bedroomSel, badge: 0 },
    { key: 'more', label: t('pub.filterMore'), active: moreBadge > 0, badge: moreBadge },
    { key: 'sort', label: filters.sortKey !== 'default' ? sortLabel : t('pub.sort'), active: filters.sortKey !== 'default', badge: 0 }
  ] as { key: OpenTab; label: string; active: boolean; badge: number }[]

  const bounceFav = (id: string) => {
    setFavAnim((s) => new Set(s).add(id))
    setTimeout(() => {
      setFavAnim((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }, 400)
  }

  // ============ 各 Tab 下拉面板内容 ============
  const renderRegionPanel = () => (
    <>
      <View className='filter-drop__tabs'>
        {(['area', 'metro'] as const).map((tab) => (
          <View
            key={tab}
            className={`filter-subtab ${locTab === tab ? 'filter-subtab--active' : ''}`}
            onClick={() => setLocTab(tab)}
          >
            <Text>{tab === 'area' ? t('pub.district') : t('pub.metro')}</Text>
          </View>
        ))}
      </View>

      <View className='filter-drop__body'>
        {locTab === 'area' ? (
          // 链家样式：只列当前定位城市的 区/街道 chips（国家·城市在主页左上角定位器选择）
          <View className='filter-region-scroll'>
            <Text className='loc-group__title'>{cityLabel} · {t('tl.districtsSuffix')}</Text>
            <View className='filter-chips'>
              <View
                className={`filter-chip ${filters.districtSel === null ? 'filter-chip--active' : ''}`}
                onClick={() => applyDistrict(null)}
              >
                <Text>{t('pub.filterAny')}</Text>
              </View>
              {cityDistricts.map((d) => (
                <View
                  key={d.key}
                  className={`filter-chip ${filters.districtSel === d.key ? 'filter-chip--active' : ''}`}
                  onClick={() => applyDistrict(d.key)}
                >
                  <Text>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View className='filter-metro'>
            <ScrollView scrollX className='filter-metro__lines'>
              {metroLines.map((l) => (
                <View
                  key={l.key}
                  className={`loc-line ${metroLine === l.key ? 'loc-line--active' : ''}`}
                  onClick={() => setMetroLine(l.key)}
                >
                  <Text>{l.name}</Text>
                </View>
              ))}
            </ScrollView>
            <ScrollView scrollY className='filter-metro__stations'>
              <Text className='loc-group__title'>{activeLine?.name}</Text>
              <View className='filter-chips'>
                {activeLine?.stations.map((s) => (
                  <View
                    key={s.name}
                    className={`filter-chip ${metroDraft.includes(s.name) ? 'filter-chip--active' : ''}`}
                    onClick={() => toggleStation(s.name)}
                  >
                    <Text>{s.name}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      <View className='filter-drop__footer'>
        <View className='loc-btn loc-btn--ghost' onClick={() => resetCurrent('region')}>
          <Text>{t('pub.reset')}</Text>
        </View>
        <View className='loc-btn loc-btn--primary' onClick={() => confirmCurrent('region')}>
          <Text>{t('pub.apply')}</Text>
        </View>
      </View>
    </>
  )

  const renderPricePanel = () => (
    <>
      <Text className='filter-group__title'>{t('pub.quickSelect')}</Text>
      <View className='filter-chips'>
        {PRICE_PRESETS.map((p) => (
          <View
            key={p.key}
            className={`filter-chip ${filters.pricePreset === p.key ? 'filter-chip--active' : ''}`}
            onClick={() => applyPricePreset(p.key)}
          >
            <Text>{t(p.label)}</Text>
          </View>
        ))}
      </View>

      <Text className='filter-group__title'>{t('pub.customPrice')}</Text>
      <View className='price-custom'>
        <View className='price-input'>
          <Text className='price-input__cur'>฿</Text>
          <Input
            className='price-input__field'
            type='number'
            value={priceDraftMin}
            placeholder={t('pub.filterMin')}
            placeholderStyle='color:#9ca3af'
            onInput={(e: any) => setPriceDraftMin(e.detail.value)}
          />
          <Text className='price-input__unit'>{t('pub.wanPerMonth')}</Text>
        </View>
        <Text className='price-custom__divider'>{t('pub.to')}</Text>
        <View className='price-input'>
          <Text className='price-input__cur'>฿</Text>
          <Input
            className='price-input__field'
            type='number'
            value={priceDraftMax}
            placeholder={t('pub.filterMax')}
            placeholderStyle='color:#9ca3af'
            onInput={(e: any) => setPriceDraftMax(e.detail.value)}
          />
          <Text className='price-input__unit'>{t('pub.wanPerMonth')}</Text>
        </View>
      </View>
      <Text className='price-custom__hint'>{t('tl.priceHint')}</Text>

      <View className='filter-drop__footer'>
        <View className='loc-btn loc-btn--ghost' onClick={() => resetCurrent('price')}>
          <Text>{t('pub.reset')}</Text>
        </View>
        <View className='loc-btn loc-btn--primary' onClick={() => confirmCurrent('price')}>
          <Text>{t('pub.apply')}</Text>
        </View>
      </View>
    </>
  )

  const renderLayoutPanel = () => (
    <>
      <Text className='filter-group__title'>{t('pub.filterBeds')}</Text>
      <View className='filter-chips'>
        {BEDROOM_OPTIONS.map((b) => (
          <View
            key={b.key}
            className={`filter-chip ${bedroomDraft === b.key ? 'filter-chip--active' : ''}`}
            onClick={() => setBedroomDraft(b.key)}
          >
            <Text>{t(b.label)}</Text>
          </View>
        ))}
      </View>

      <View className='filter-drop__footer'>
        <View className='loc-btn loc-btn--ghost' onClick={() => resetCurrent('layout')}>
          <Text>{t('pub.reset')}</Text>
        </View>
        <View className='loc-btn loc-btn--primary' onClick={() => confirmCurrent('layout')}>
          <Text>{t('pub.apply')}</Text>
        </View>
      </View>
    </>
  )

  const renderMorePanel = () => (
    <>
      <Text className='filter-group__title'>{t('pub.orientationLabel')}</Text>
      <View className='filter-chips'>
        {ORIENTATION_OPTIONS.map((o) => (
          <View
            key={o.key}
            className={`filter-chip ${orientationDraft === o.key ? 'filter-chip--active' : ''}`}
            onClick={() => setOrientationDraft(o.key)}
          >
            <Text>{t(o.label)}</Text>
          </View>
        ))}
      </View>

      <Text className='filter-group__title'>{t('pub.floor')}</Text>
      <View className='filter-chips'>
        {FLOOR_LEVEL_OPTIONS.map((fl) => (
          <View
            key={fl.key}
            className={`filter-chip ${floorDraft === fl.key ? 'filter-chip--active' : ''}`}
            onClick={() => setFloorDraft(fl.key)}
          >
            <Text>{t(fl.label)}</Text>
          </View>
        ))}
      </View>

      <Text className='filter-group__title'>{t('pub.filterArea')}</Text>
      <View className='filter-chips'>
        {AREA_PRESETS.map((p) => (
          <View
            key={p.key}
            className={`filter-chip ${filters.areaPreset === p.key ? 'filter-chip--active' : ''}`}
            onClick={() => applyAreaPreset(p.key)}
          >
            <Text>{t(p.label)}</Text>
          </View>
        ))}
      </View>

      <Text className='filter-group__title'>{t('pub.customArea')}</Text>
      <View className='price-custom'>
        <View className='price-input'>
          <Input
            className='price-input__field'
            type='number'
            value={areaDraftMin}
            placeholder={t('tl.areaMinPlaceholder')}
            placeholderStyle='color:#9ca3af'
            onInput={(e: any) => setAreaDraftMin(e.detail.value)}
          />
          <Text className='price-input__unit'>{t('pub.sqm')}</Text>
        </View>
        <Text className='price-custom__divider'>{t('pub.to')}</Text>
        <View className='price-input'>
          <Input
            className='price-input__field'
            type='number'
            value={areaDraftMax}
            placeholder={t('tl.areaMaxPlaceholder')}
            placeholderStyle='color:#9ca3af'
            onInput={(e: any) => setAreaDraftMax(e.detail.value)}
          />
          <Text className='price-input__unit'>{t('pub.sqm')}</Text>
        </View>
      </View>

      <Text className='filter-group__title'>{t('pub.decorationLabel')}</Text>
      <View className='filter-chips'>
        {DECORATION_OPTIONS.map((d) => (
          <View
            key={d.key}
            className={`filter-chip ${decorDraft === d.key ? 'filter-chip--active' : ''}`}
            onClick={() => setDecorDraft(d.key)}
          >
            <Text>{t(d.label)}</Text>
          </View>
        ))}
      </View>

      <Text className='filter-group__title'>{t('tl.amenities')}</Text>
      <View className='filter-chips'>
        {AMENITY_OPTIONS.map((a) => (
          <View
            key={a.key}
            className={`filter-chip ${amenityDraft.includes(a.key) ? 'filter-chip--active' : ''}`}
            onClick={() =>
              setAmenityDraft((cur) =>
                cur.includes(a.key) ? cur.filter((k) => k !== a.key) : [...cur, a.key]
              )
            }
          >
            <Text>{t(a.label)}</Text>
          </View>
        ))}
      </View>

      <Text className='filter-group__title'>{t('pub.listingStatus')}</Text>
      <View className='filter-chips'>
        {STATUS_OPTIONS.map((s) => (
          <View
            key={s.key}
            className={`filter-chip ${statusDraft === s.key ? 'filter-chip--active' : ''}`}
            onClick={() => setStatusDraft(s.key)}
          >
            <Text>{t(s.label)}</Text>
          </View>
        ))}
      </View>

      <View className='filter-drop__footer'>
        <View className='loc-btn loc-btn--ghost' onClick={() => resetCurrent('more')}>
          <Text>{t('pub.reset')}</Text>
        </View>
        <View className='loc-btn loc-btn--primary' onClick={() => confirmCurrent('more')}>
          <Text>{t('pub.apply')}</Text>
        </View>
      </View>
    </>
  )

  const renderSortPanel = () => (
    <View className='filter-sort'>
      {SORT_OPTIONS.map((s) => (
        <View
          key={s.key}
          className={`filter-sort__item ${filters.sortKey === s.key ? 'filter-sort__item--active' : ''}`}
          onClick={() => {
            patch({ sortKey: s.key })
            setOpenTab(null)
          }}
        >
          <Text>{t(s.label)}</Text>
          {filters.sortKey === s.key && <Text className='filter-sort__check'>✓</Text>}
        </View>
      ))}
    </View>
  )

  return (
    <View className='page-container'>
      {/* ===== 顶部头部区：浅 teal 实底 + 大标题 + 城市定位（对齐参考图顶部，给卡片留出呼吸间距） ===== */}
      <View className='hero-band'>
        <View className='hero-band__row'>
          <Text className='hero-band__title'>{t('tl.heroTitle')}</Text>
          <View className='hero-band__city' onClick={onPickCity}>
            <View className='icon-svg' style={iconStyle('location', 28)} />
            <Text className='hero-band__city-text'>{cityLabel}</Text>
            <Text className='hero-band__city-arrow'>▾</Text>
          </View>
        </View>
      </View>

      {/* ===== 顶部找房卡：业务 Tab（嵌入卡顶）/ 搜索行 / 分隔线 / 居室快选 / 查看N套 + 去地图看 ===== */}
      <View className='hero-card'>
        {/* 业务 Tab 嵌入卡顶：选中项为白色圆角块（对齐参考图） */}
        <View className='hero-tabs'>
          {BIZ_OPTIONS.map((b) => (
            <View
              key={b.key}
              className={`hero-tab ${biz === b.key ? 'hero-tab--on' : ''}`}
              onClick={() => {
                onBizChange(b.key)
                setOpenTab(null)
              }}
            >
              <Text className='hero-tab__text'>{t(b.label)}</Text>
            </View>
          ))}
        </View>

        <View className='hero-body'>
          {/* 搜索行：放大镜 + 占位符 + ｜ + 附近（切「离我最近」排序） */}
          <View className='hero-search'>
            <View className='icon-svg' style={iconStyle('search', 36)} />
            <Input
              className='hero-search__input'
              value={keyword}
              placeholder={t('tl.searchPlaceholder')}
              placeholderStyle='color:#9ca3af'
              confirmType='search'
              onInput={(e: any) => onKeywordChange(e.detail.value)}
              onConfirm={onSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                // 延迟收起，避免点击历史词条时面板先行消失
                setTimeout(() => setSearchFocused(false), 200)
              }}
            />
            <View className='hero-search__split' />
            <View className='hero-nearby' onClick={onToggleNearby}>
              <View className='icon-svg' style={iconStyle('crosshair', 32)} />
              <Text className={`hero-nearby__text ${nearby ? 'hero-nearby__text--on' : ''}`}>
                {t('tl.nearby')}
              </Text>
            </View>
          </View>

          {/* 最近搜索（输入框聚焦且有历史词时展示，普通 View 换行 chips） */}
          {searchFocused && recentSearches.length > 0 && (
            <View className='recent-searches'>
              <View className='recent-searches__head'>
                <Text className='recent-searches__title'>{t('search.recent')}</Text>
                <Text className='recent-searches__clear' onClick={onClearRecent}>{t('search.clearAll')}</Text>
              </View>
              <View className='recent-searches__chips'>
                {recentSearches.map((w) => (
                  <View key={w} className='recent-searches__chip' onClick={() => onPickRecent(w)}>
                    <Text>{w}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View className='hero-divider' />

          {/* 居室快选：不限 / 1居 / 2居 / 3居+（与「房型」面板共用同一个 bedroomSel） */}
          <View className='hero-beds'>
            {HERO_BED_OPTIONS.map((b) => (
              <View
                key={b.key || 'any'}
                className='hero-bed'
                onClick={() => patch({ bedroomSel: b.key })}
              >
                {filters.bedroomSel === b.key ? (
                  <View className='hero-bed__dot hero-bed__dot--on'>
                    <Text className='hero-bed__check'>✓</Text>
                  </View>
                ) : (
                  <View className='hero-bed__dot' />
                )}
                <Text className={`hero-bed__text ${filters.bedroomSel === b.key ? 'hero-bed__text--on' : ''}`}>
                  {t(b.label)}
                </Text>
              </View>
            ))}
          </View>

          {/* 主按钮：查看 N 套房源 / 去地图看 */}
          <View className='hero-actions'>
            <View className='hero-primary' onClick={() => setOpenTab(null)}>
              <Text className='hero-primary__text'>{t('tl.viewCount', { n: resultCount })}</Text>
            </View>
            <View className='hero-map' onClick={onGoMap}>
              <View className='icon-svg' style={iconStyle('location', 32)} />
              <Text className='hero-map__text'>{t('tl.goMap')}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ===== 贝壳式 Tab 筛选栏（点击从顶部下拉面板，非底部弹层）===== */}
      <View className='filter-zone'>
        <View className='filter-bar'>
          {filterTabs.map((tb) => (
            <View
              key={tb.key}
              className={`filter-tab ${openTab === tb.key ? 'filter-tab--open' : ''} ${tb.active ? 'filter-tab--active' : ''}`}
              onClick={() => toggleTab(tb.key)}
            >
              <Text className='filter-tab__label'>{tb.label}</Text>
              {tb.badge > 0 && <Text className='filter-tab__badge'>{tb.badge}</Text>}
              <Text className='filter-tab__arrow'>{openTab === tb.key ? '▲' : '▼'}</Text>
            </View>
          ))}
        </View>

        {openTab !== null && (
          <View className='filter-drop'>
            {openTab === 'region' && renderRegionPanel()}
            {openTab === 'price' && renderPricePanel()}
            {openTab === 'layout' && renderLayoutPanel()}
            {openTab === 'more' && renderMorePanel()}
            {openTab === 'sort' && renderSortPanel()}
          </View>
        )}
      </View>

      <ScrollView scrollY className='list-scroll'>
        {loading && items.length === 0 && (
          <StateBlock loading text={t('common.loading')} />
        )}
        {!loading && error && items.length === 0 && (
          <View className='empty-state'>
            <Text className='text-danger'>{t('tl.loadFailedRetry')}</Text>
            <View className='error-retry' onClick={onRetry}>
              <Text className='error-retry__text'>{t('common.tapRetry')}</Text>
            </View>
          </View>
        )}
        {!loading && !error && items.length === 0 && (
          <View className='empty-state'>
            <View className='empty-state__icon icon-svg' style={iconStyle('home', 80)} />
            <Text>{activeLocationKw.length ? t('tl.emptyRegion') : t('pub.emptyList')}</Text>
          </View>
        )}
        {items.map((item) => {
          const photo = Array.isArray(item.photos) && item.photos.length ? item.photos[0] : ''
          const statusMeta = statusMetaOf(t, item.status)
          const isSaleItem = Number(item.sale_price) > 0
          const isFaved = favSet.has(String(item.id))
          // 卡片标签：房型 / 面积 / 装修，最多 3 个（对齐原型标签行）
          const cardTags = [
            Number(item.bedrooms) ? t('tl.roomCount', { n: item.bedrooms }) : '',
            Number(item.size_sqm) ? t('tl.sizeSqm', { n: item.size_sqm }) : '',
            item.furnished ? t('tl.moveInReady') : ''
          ].filter(Boolean) as string[]
          return (
            <View key={item.id} className='house-card' onClick={() => onOpenDetail(item)}>
              <View className='house-thumb'>
                {photo ? (
                  <Image className='house-img' src={photo} mode='aspectFill' lazyLoad />
                ) : (
                  <View className='house-thumb-ph'>
                    <Text>{t('pub.listingItem')}</Text>
                  </View>
                )}
                <Text className='house-type'>{typeLabelOf(t, item.property_type)}</Text>
                <View
                  className='house-fav'
                  aria-label={isFaved ? t('tl.unfav') : t('prop.fav')}
                  onClick={(e) => {
                    if (favPending.has(String(item.id))) return
                    bounceFav(String(item.id))
                    onToggleFavorite(e, item)
                  }}
                >
                  <View
                    className={`icon-svg fav-bounce${favAnim.has(String(item.id)) ? ' fav-bounce--active' : ''}`}
                    style={iconStyle(isFaved ? 'heartFill' : 'heart', 34)}
                  />
                </View>
              </View>
              <View className='house-info'>
                <Text className='house-title'>{item.title || item.room_number || t('prop.unnamed')}</Text>
                <Text className='house-addr'>{item.address || t('tl.noAddress')}</Text>
                <View className='house-tags'>
                  {cardTags.map((tag) => (
                    <Text key={tag} className='house-tag'>{tag}</Text>
                  ))}
                </View>
                <View className='house-bottom'>
                  <Text className='house-rent'>
                    {isSaleItem
                      ? formatRent(item.sale_price, item.currency)
                      : formatRent(item.monthly_rent, item.currency)}
                    <Text className='house-rent-unit'>{isSaleItem ? ' ' + t('tl.totalPrice') : t('pub.perMonth')}</Text>
                  </Text>
                  <Text className='house-status' style={{ color: statusMeta.color }}>
                    {statusMeta.text}
                  </Text>
                </View>
              </View>
            </View>
          )
        })}

        {/* ===== 加载更多 ===== */}
        {hasMore && (
          <View className='load-more' onClick={onLoadMore}>
            <Text className='load-more__text'>
              {loadingMore ? t('common.loading') : t('tl.loadMoreListings')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
