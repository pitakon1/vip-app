import { useMemo, useState } from 'react'
import { View, Text, ScrollView, Image, Input } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi, favoritesApi } from '@/services/api'
import { fmtMoney as formatRent } from '@/utils/format'
import { METRO_LINES } from '@/data/locationMetro'
import { useLocationStore, findCityByKey } from '@/stores/location'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import './index.scss'
import { useI18n } from '@/i18n'

interface Listing {
  id: string
  title?: string
  room_number?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  bedrooms?: number
  size_sqm?: number
  status?: string
  description?: string
  photos?: string[]
  [key: string]: any
}

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
    office: t('prop.typeOffice')
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

// ==================== 业务类型：整租 / 合租 / 买房（对齐原型业务栏） ====================
type BizKey = 'rent' | 'share' | 'sale'
const BIZ_OPTIONS: { key: BizKey; label: string }[] = [
  { key: 'rent', label: 'tl.bizWhole' },
  { key: 'share', label: 'tl.bizShare' },
  { key: 'sale', label: 'pub.typeSell' }
]
// 合租无独立字段，以房号/标题/描述/类型中的关键词命中判断
const SHARE_KEYWORDS = ['合租', '单间', 'share', 'shared']
const PAGE_SIZE = 20

const matchBiz = (item: Listing, biz: BizKey): boolean => {
  const isSale = Number(item.sale_price) > 0
  if (biz === 'sale') return isSale
  if (isSale) return false
  if (!Number(item.monthly_rent)) return false
  if (biz === 'share') {
    const text = [item.title, item.room_number, item.address, item.description, item.property_type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return SHARE_KEYWORDS.some((k) => text.includes(k))
  }
  return true
}

// ==================== 排序（贝壳式下拉 Tab） ====================
const SORT_OPTIONS = [
  { key: 'default', label: 'prop.sortDefault' },
  { key: 'latest', label: 'tl.sortLatest' },
  { key: 'price_asc', label: 'prop.sortPriceAsc' },
  { key: 'price_desc', label: 'prop.sortPriceDesc' },
  { key: 'area_desc', label: 'prop.sortAreaDesc' }
]

// ==================== 价格筛选（对齐贝壳「价格」弹层：预设区间 + 自定义最低/最高 + 重置/确定） ====================
interface PricePreset { key: string; label: string; min: number; max: number }
const PRICE_PRESETS: PricePreset[] = [
  { key: '', label: 'pub.filterAny', min: 0, max: Infinity },
  { key: 'u3', label: 'tl.priceU3', min: 0, max: 30000 },
  { key: '3-5', label: 'pub.range.35', min: 30000, max: 50000 },
  { key: '5-8', label: 'tl.price58', min: 50000, max: 80000 },
  { key: 'g8', label: 'tl.priceG8', min: 80000, max: Infinity }
]
const matchPrice = (rent: number, min: number, max: number): boolean => {
  if (min != null && !Number.isNaN(min) && min > 0 && rent < min) return false
  if (max != null && !Number.isNaN(max) && max > 0 && rent > max) return false
  return true
}

// 户型 / 面积 / 状态（与价格同构的贝壳式快捷选项）
const BEDROOM_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: '1', label: 'pub.bed.1' },
  { key: '2', label: 'pub.bed.2' },
  { key: '3', label: 'pub.bed.3' },
  { key: '4', label: 'tl.bed4' },
  { key: '5', label: 'tl.bed5p' }
]

// 朝向筛选（贝壳式 8 向；东南亚西晒极强，朝向是硬决策因素）
const ORIENTATION_OPTIONS = [
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
const FLOOR_LEVEL_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'low', label: 'tl.floorLow' },
  { key: 'mid', label: 'tl.floorMid' },
  { key: 'high', label: 'tl.floorHigh' }
]

// 装修筛选（东南亚口径：带家具家电是最常见出租形态）
const DECORATION_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'bare', label: 'pub.decoration.bare' },
  { key: 'simple', label: 'pub.decoration.simple' },
  { key: 'standard', label: 'pub.decoration.standard' },
  { key: 'luxury', label: 'pub.decoration.luxury' },
  { key: 'fully_furnished', label: 'pub.decoration.fully_furnished' }
]

// 配套设施筛选（东南亚口径，多选任一命中；无供暖/暖气/天然气——东南亚无冬季）
const AMENITY_OPTIONS = [
  { key: 'aircon', label: 'tl.amenityAircon' },
  { key: 'pool', label: 'tl.amenityPool' },
  { key: 'gym', label: 'tl.amenityGym' },
  { key: 'parking', label: 'tl.amenityParking' },
  { key: 'elevator', label: 'tl.amenityElevator' },
  { key: 'balcony', label: 'tl.amenityBalcony' },
  { key: 'garden', label: 'tl.amenityGarden' }
]
const AREA_PRESETS = [
  { key: '', label: 'pub.filterAny', min: 0, max: Infinity },
  { key: 'u50', label: 'pub.area.u50', min: 0, max: 50 },
  { key: '50-100', label: 'pub.area.50100', min: 50, max: 100 },
  { key: '100-150', label: 'pub.area.100150', min: 100, max: 150 },
  { key: '150-200', label: 'pub.area.150200', min: 150, max: 200 },
  { key: 'g200', label: 'pub.area.g200', min: 200, max: Infinity }
]
const STATUS_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'vacant', label: 'pub.statusVacant' },
  { key: 'rented', label: 'pub.statusRented' },
  { key: 'reserved', label: 'pub.statusReserved' },
  { key: 'maintenance', label: 'pub.statusMaintenance' }
]
const matchArea = (sqm: number, min: number, max: number): boolean => {
  if (min != null && !Number.isNaN(min) && min > 0 && sqm < min) return false
  if (max != null && !Number.isNaN(max) && max > 0 && sqm > max) return false
  return true
}

// ==================== 按区域 / 按地铁找房（对齐贝壳小程序「区域 | 地铁」；与 Web / App 端数据保持一致） ====================
// 区域/轨交数据集中于 src/data/locationArea.ts 与 locationMetro.ts
// （AREA_GROUPS / METRO_LINES 与接口已在文件顶部 import）

// 命中关键词：房源地址/标题任一包含即可
const matchLocation = (item: any, kws: string[]): boolean =>
  kws.some((k) =>
    [item.address, item.title, item.room_number, item.city, item.district, item.area]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase())
      .some((v) => v.includes(k))
  )

function pickList(res: any): Listing[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

// 当前展开的筛选 Tab；null = 全部收起
type OpenTab = null | 'region' | 'price' | 'layout' | 'more' | 'sort'

export default function TenantListingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const { list: listings, loading, loadingMore, hasMore, error: listError, fetch: fetchListings, fetchMore } =
    usePaginatedList<Listing>({
      pageSize: PAGE_SIZE,
      cacheKey: 'tenant-listings',
      fetcher: async (p, ps, params) => {
        const res: any = await propertiesApi.list({
          page: p,
          page_size: ps,
          ...((params as any)?.q ? { q: (params as any).q } : {})
        })
        return pickList(res)
      },
      onError: () => Taro.showToast({ title: t('tl.loadListingsFailed'), icon: 'none' })
    })
  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [favPending, setFavPending] = useState<Set<string>>(new Set())

  // 顶部搜索栏 + 业务栏（由首页「出租/买房」入口带入参数初始化）
  const initialBiz: BizKey = router.params?.biz === 'buy' ? 'sale' : 'rent'
  const [keyword, setKeyword] = useState<string>(router.params?.q ? decodeURIComponent(router.params.q) : '')
  const [query, setQuery] = useState<string>(router.params?.q ? decodeURIComponent(router.params.q) : '')
  const [biz, setBiz] = useState<BizKey>(initialBiz)

  // 按区域 / 按地铁（对齐贝壳「区域 | 地铁」下拉面板）
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area')
  // 区域面板：定位城市见主页左上角「国家 → 城市」；找房页只列当前城市的 区/街道（链家样式），无国家/省市下钻
  const locSel = useLocationStore((s) => s.selection)
  const locCity = useMemo(() => findCityByKey(locSel.cityKey), [locSel.cityKey])
  const cityDistricts = locCity?.children ?? []
  const [districtSel, setDistrictSel] = useState<string | null>(null)
  const [metroSel, setMetroSel] = useState<string[]>([])
  const [metroDraft, setMetroDraft] = useState<string[]>([])
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key)

  // 价格筛选（贝壳式弹层）
  const [pricePreset, setPricePreset] = useState<string>(PRICE_PRESETS[0].key)
  const [customMin, setCustomMin] = useState('')
  const [customMax, setCustomMax] = useState('')
  const [priceDraftMin, setPriceDraftMin] = useState('')
  const [priceDraftMax, setPriceDraftMax] = useState('')

  // 房型 / 更多(面积+状态) / 排序
  const [bedroomSel, setBedroomSel] = useState('')
  const [bedroomDraft, setBedroomDraft] = useState('')
  const [areaPreset, setAreaPreset] = useState('')
  const [areaCustomMin, setAreaCustomMin] = useState('')
  const [areaCustomMax, setAreaCustomMax] = useState('')
  const [areaDraftMin, setAreaDraftMin] = useState('')
  const [areaDraftMax, setAreaDraftMax] = useState('')
  const [statusSel, setStatusSel] = useState('')
  const [statusDraft, setStatusDraft] = useState('')
  // 更多面板新增维度：朝向 / 楼层 / 装修 / 配套（草稿 → 确认 模式，与面积/状态一致）
  const [orientationSel, setOrientationSel] = useState('')
  const [orientationDraft, setOrientationDraft] = useState('')
  const [floorSel, setFloorSel] = useState('')
  const [floorDraft, setFloorDraft] = useState('')
  const [decorSel, setDecorSel] = useState('')
  const [decorDraft, setDecorDraft] = useState('')
  const [amenitySel, setAmenitySel] = useState<string[]>([])
  const [amenityDraft, setAmenityDraft] = useState<string[]>([])
  const [sortKey, setSortKey] = useState('default')

  // 当前展开的面板
  const [openTab, setOpenTab] = useState<OpenTab>(null)

  const fetchFavorites = async () => {
    try {
      const res: any = await favoritesApi.list({ page: 1, limit: 1000 })
      const list = Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
        ? res
        : []
      setFavSet(
        new Set(
          list.map((f: any) => String(f.property_id ?? f.id)).filter(Boolean)
        )
      )
    } catch (error) {
      console.error('[Listings] 加载收藏状态失败', error)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchListings(1)
    fetchFavorites()
  })

  const handleSearch = () => {
    const q = keyword.trim()
    setQuery(q)
    fetchListings(1, { q })
  }

  const toggleFavorite = async (e: any, item: Listing) => {
    e.stopPropagation()
    const pid = String(item.id)
    if (favPending.has(pid)) return
    const willFav = !favSet.has(pid)
    setFavPending((s) => new Set(s).add(pid))
    setFavSet((prev) => {
      const next = new Set(prev)
      if (willFav) next.add(pid)
      else next.delete(pid)
      return next
    })
    try {
      if (willFav) await favoritesApi.add(pid)
      else await favoritesApi.remove(pid)
      Taro.showToast({ title: willFav ? t('prop.favOn') : t('tl.unfaved'), icon: 'none' })
    } catch (error) {
      console.error('[Listings] 收藏切换失败', error)
      setFavSet((prev) => {
        const next = new Set(prev)
        if (willFav) next.delete(pid)
        else next.add(pid)
        return next
      })
      Taro.showToast({ title: t('common.opFailed'), icon: 'none' })
    } finally {
      setFavPending((s) => {
        const next = new Set(s)
        next.delete(pid)
        return next
      })
    }
  }

  // 地铁仅列当前定位城市的线路
  const cityMetroLines = useMemo(
    () => METRO_LINES.filter((l) => l.cityKey === locSel.cityKey),
    [locSel.cityKey]
  )
  const activeLine = useMemo(
    () => cityMetroLines.find((l) => l.key === metroLine),
    [cityMetroLines, metroLine]
  )
  const distNode = (key: string) => cityDistricts.find((d) => d.key === key)

  // 已选区域/地铁的关键词与展示文案（城市不参与：全局定位决定城市，找房页只做区/街道与地铁）
  const activeLocationKw = useMemo(() => {
    if (districtSel) {
      const node = distNode(districtSel)
      return node ? node.kws : []
    }
    if (metroSel.length) {
      const stations = cityMetroLines.flatMap((l) => l.stations)
      return stations.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws)
    }
    return []
  }, [districtSel, metroSel, cityMetroLines, cityDistricts])

  const regionLabel = useMemo(() => {
    if (districtSel) {
      const node = distNode(districtSel)
      return node ? node.label : t('pub.district')
    }
    if (metroSel.length) {
      const first = metroSel[0]
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first
    }
    return t('pub.district')
  }, [districtSel, metroSel, cityDistricts, t])

  // 全局城市作用域：当前定位城市下，房源必须命中该城任一城区关键词（链家式「定位城市看房」）
  const globalCityKw = useMemo(
    () => (locCity ? locCity.children.flatMap((d) => d.kws) : []),
    [locCity]
  )

  // 区域=实时单选；城区与地铁互斥
  const applyDistrict = (key: string | null) => {
    if (districtSel === key) {
      setDistrictSel(null)
      return
    }
    setDistrictSel(key)
    setMetroSel([])
    setMetroDraft([])
  }
  const toggleStation = (name: string) => {
    setMetroDraft((d) =>
      d.includes(name) ? d.filter((s) => s !== name) : [...d, name]
    )
  }
  const confirmMetro = () => {
    setMetroSel(metroDraft)
    if (metroDraft.length) setDistrictSel(null)
    setOpenTab(null)
  }

  // ---------- 价格筛选：预设或自定义区间（万 → THB） ----------
  const activePrice = useMemo(() => {
    if (pricePreset) {
      const p = PRICE_PRESETS.find((x) => x.key === pricePreset)
      return p ? { min: p.min, max: p.max } : { min: 0, max: Infinity }
    }
    if (customMin || customMax) {
      return {
        min: (Number(customMin) || 0) * 10000,
        max: (Number(customMax) || 0) * 10000
      }
    }
    return { min: 0, max: Infinity }
  }, [pricePreset, customMin, customMax])

  const hasPriceFilter = !!(pricePreset || customMin || customMax)
  const priceLabel = useMemo(() => {
    const p = PRICE_PRESETS.find((x) => x.key === pricePreset)
    if (p && p.key) return t(p.label)
    if (customMin || customMax) return t('prop.custom')
    return t('pub.filterPrice')
  }, [pricePreset, customMin, customMax, t])

  const applyPricePreset = (key: string) => {
    setPricePreset(key)
    if (key) {
      setCustomMin('')
      setCustomMax('')
    }
  }
  const confirmPrice = () => {
    let min = priceDraftMin.trim()
    let max = priceDraftMax.trim()
    if (min || max) {
      const mn = Number(min)
      const mx = Number(max)
      if (min && max && mx < mn) {
        Taro.showToast({ title: t('tl.maxPriceError'), icon: 'none' })
        return
      }
      setPricePreset('')
      setCustomMin(min)
      setCustomMax(max)
    } else {
      setPricePreset('')
      setCustomMin('')
      setCustomMax('')
    }
    setOpenTab(null)
  }

  // ---------- 房型 / 面积 / 状态 ----------
  const activeArea = useMemo(() => {
    if (areaPreset) {
      const p = AREA_PRESETS.find((x) => x.key === areaPreset)
      return p ? { min: p.min, max: p.max } : { min: 0, max: Infinity }
    }
    if (areaCustomMin || areaCustomMax) {
      return { min: Number(areaCustomMin) || 0, max: Number(areaCustomMax) || 0 }
    }
    return { min: 0, max: Infinity }
  }, [areaPreset, areaCustomMin, areaCustomMax])
  const hasAreaFilter = !!(areaPreset || areaCustomMin || areaCustomMax)
  const bedroomLabel = useMemo(
    () => t(BEDROOM_OPTIONS.find((b) => b.key === bedroomSel)?.label || 'pub.filterBeds'),
    [bedroomSel, t]
  )

  const applyAreaPreset = (key: string) => {
    setAreaPreset(key)
    if (key) {
      setAreaCustomMin('')
      setAreaCustomMax('')
    }
  }
  const confirmBedroom = () => {
    setBedroomSel(bedroomDraft)
    setOpenTab(null)
  }
  const confirmMore = () => {
    let min = areaDraftMin.trim()
    let max = areaDraftMax.trim()
    if (min || max) {
      const mn = Number(min)
      const mx = Number(max)
      if (min && max && mx < mn) {
        Taro.showToast({ title: t('tl.maxAreaError'), icon: 'none' })
        return
      }
      setAreaPreset('')
      setAreaCustomMin(min)
      setAreaCustomMax(max)
    } else {
      setAreaPreset('')
      setAreaCustomMin('')
      setAreaCustomMax('')
    }
    setStatusSel(statusDraft)
    setOrientationSel(orientationDraft)
    setFloorSel(floorDraft)
    setDecorSel(decorDraft)
    setAmenitySel(amenityDraft)
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
      setMetroDraft(metroSel)
      if (!districtSel && metroSel.length) setLocTab('metro')
    }
    if (key === 'price') {
      setPriceDraftMin(customMin)
      setPriceDraftMax(customMax)
    }
    if (key === 'layout') setBedroomDraft(bedroomSel)
    if (key === 'more') {
      setAreaDraftMin(areaCustomMin)
      setAreaDraftMax(areaCustomMax)
      setStatusDraft(statusSel)
      setOrientationDraft(orientationSel)
      setFloorDraft(floorSel)
      setDecorDraft(decorSel)
      setAmenityDraft(amenitySel)
    }
  }

  const resetCurrent = (key: OpenTab) => {
    if (key === 'region') {
      if (locTab === 'metro') {
        setMetroDraft([])
        setMetroSel([])
      } else {
        setDistrictSel(null)
        setMetroSel([])
        setMetroDraft([])
      }
    } else if (key === 'price') {
      setPriceDraftMin('')
      setPriceDraftMax('')
      setPricePreset('')
      setCustomMin('')
      setCustomMax('')
    } else if (key === 'layout') {
      setBedroomDraft('')
      setBedroomSel('')
    } else if (key === 'more') {
      setAreaDraftMin('')
      setAreaDraftMax('')
      setAreaPreset('')
      setAreaCustomMin('')
      setAreaCustomMax('')
      setStatusDraft('')
      setStatusSel('')
      setOrientationDraft('')
      setOrientationSel('')
      setFloorDraft('')
      setFloorSel('')
      setDecorDraft('')
      setDecorSel('')
      setAmenityDraft([])
      setAmenitySel([])
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

  const visibleList = useMemo(() => {
    const list = listings.filter((it) =>
      matchBiz(it, biz) &&
      matchLocation(it, globalCityKw) &&
      matchLocation(it, activeLocationKw) &&
      matchPrice(Number(it.monthly_rent || 0), activePrice.min, activePrice.max) &&
      matchArea(Number(it.size_sqm || 0), activeArea.min, activeArea.max) &&
      (!bedroomSel ||
        (bedroomSel === '5'
          ? Number(it.bedrooms) >= 5
          : Number(it.bedrooms) === Number(bedroomSel))) &&
      (!statusSel || it.status === statusSel) &&
      (!orientationSel || it.orientation === orientationSel) &&
      (!floorSel ||
        (floorSel === 'low'
          ? Number(it.floor || 0) >= 1 && Number(it.floor || 0) <= 5
          : floorSel === 'mid'
          ? Number(it.floor || 0) >= 6 && Number(it.floor || 0) <= 15
          : Number(it.floor || 0) >= 16)) &&
      (!decorSel || it.decoration === decorSel) &&
      (!amenitySel.length ||
        amenitySel.some((a) => (Array.isArray(it.amenities) ? it.amenities : []).includes(a)))
    )
    switch (sortKey) {
      case 'latest': return list.slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      case 'price_asc': return list.slice().sort((a, b) => a.monthly_rent - b.monthly_rent)
      case 'price_desc': return list.slice().sort((a, b) => b.monthly_rent - a.monthly_rent)
      case 'area_desc': return list.slice().sort((a, b) => b.size_sqm - a.size_sqm)
      default: return list
    }
  }, [listings, globalCityKw, biz, activeLocationKw, activePrice, activeArea, bedroomSel, statusSel, orientationSel, floorSel, decorSel, amenitySel, sortKey])

  const sortLabel = t(SORT_OPTIONS.find((s) => s.key === sortKey)?.label || 'pub.sort')
  const moreBadge =
    (hasAreaFilter ? 1 : 0) +
    (statusSel ? 1 : 0) +
    (orientationSel ? 1 : 0) +
    (floorSel ? 1 : 0) +
    (decorSel ? 1 : 0) +
    (amenitySel.length ? 1 : 0)

  const filterTabs = [
    { key: 'region', label: activeLocationKw.length ? regionLabel : t('pub.district'), active: activeLocationKw.length > 0, badge: 0 },
    { key: 'price', label: hasPriceFilter ? priceLabel : t('pub.filterPrice'), active: hasPriceFilter, badge: 0 },
    { key: 'layout', label: bedroomSel ? bedroomLabel : t('pub.filterBeds'), active: !!bedroomSel, badge: 0 },
    { key: 'more', label: t('pub.filterMore'), active: moreBadge > 0, badge: moreBadge },
    { key: 'sort', label: sortKey !== 'default' ? sortLabel : t('pub.sort'), active: sortKey !== 'default', badge: 0 }
  ] as { key: OpenTab; label: string; active: boolean; badge: number }[]

  const openDetail = (item: Listing) => {
    Taro.navigateTo({ url: `/pages/tenant/property-detail/index?id=${item.id}` })
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
            <Text className='loc-group__title'>{locSel.cityLabel} · {t('tl.districtsSuffix')}</Text>
            <View className='filter-chips'>
              <View
                className={`filter-chip ${districtSel === null ? 'filter-chip--active' : ''}`}
                onClick={() => applyDistrict(null)}
              >
                <Text>{t('pub.filterAny')}</Text>
              </View>
              {cityDistricts.map((d) => (
                <View
                  key={d.key}
                  className={`filter-chip ${districtSel === d.key ? 'filter-chip--active' : ''}`}
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
              {cityMetroLines.map((l) => (
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
            className={`filter-chip ${pricePreset === p.key ? 'filter-chip--active' : ''}`}
            onClick={() => applyPricePreset(p.key)}
          >
            <Text>{p.label}</Text>
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
            className={`filter-chip ${areaPreset === p.key ? 'filter-chip--active' : ''}`}
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
          className={`filter-sort__item ${sortKey === s.key ? 'filter-sort__item--active' : ''}`}
          onClick={() => {
            setSortKey(s.key)
            setOpenTab(null)
          }}
        >
          <Text>{t(s.label)}</Text>
          {sortKey === s.key && <Text className='filter-sort__check'>✓</Text>}
        </View>
      ))}
    </View>
  )

  return (
    <View className='tenant-listings-page'>
      <View className='page-container'>
        {/* ===== 顶部搜索栏（对齐原型 Sticky Search）===== */}
        <View className='list-search'>
          <Input
            className='list-search__input'
            value={keyword}
            placeholder={t('tl.searchPlaceholder')}
            confirmType='search'
            onInput={(e: any) => setKeyword(e.detail.value)}
            onConfirm={handleSearch}
          />
          <View className='list-search__btn' onClick={handleSearch}>
            <Text className='list-search__btn-text'>{t('common.search')}</Text>
          </View>
        </View>

        {/* ===== 业务栏：整租 / 合租 / 买房 ===== */}
        <View className='biz-bar'>
          {BIZ_OPTIONS.map((b) => (
            <View
              key={b.key}
              className={`biz-bar__item ${biz === b.key ? 'biz-bar__item--active' : ''}`}
              onClick={() => setBiz(b.key)}
            >
              <Text className='biz-bar__text'>{t(b.label)}</Text>
            </View>
          ))}
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

        {/* ===== 结果计数 ===== */}
        <View className='result-row'>
          <Text className='result-count'>{t('pub.totalCount', { n: visibleList.length })}</Text>
        </View>

        <ScrollView scrollY className='list-scroll'>
          {loading && visibleList.length === 0 && (
            <View className='empty-state'>
              <Text>{t('common.loading')}</Text>
            </View>
          )}
          {!loading && listError && visibleList.length === 0 && (
            <View className='empty-state'>
              <Text className='text-danger'>{t('tl.loadFailedRetry')}</Text>
              <View className='error-retry' onClick={() => fetchListings(1, { q: query })}>
                <Text className='error-retry__text'>{t('common.tapRetry')}</Text>
              </View>
            </View>
          )}
          {!loading && !listError && visibleList.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('home', 80)} />
              <Text>{activeLocationKw.length ? t('tl.emptyRegion') : t('pub.emptyList')}</Text>
            </View>
          )}
          {visibleList.map((item) => {
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
              <View key={item.id} className='house-card' onClick={() => openDetail(item)}>
                <View className='house-thumb'>
                  {photo ? (
                    <Image className='house-img' src={photo} mode='aspectFill' lazyLoad />
                  ) : (
                    <View className='house-thumb-ph'>
                      <Text>{t('pub.listingItem')}</Text>
                    </View>
                  )}
                  <Text className='house-type'>{typeLabelOf(t, item.property_type)}</Text>
                  <View className='house-fav' aria-label={isFaved ? t('tl.unfav') : t('prop.fav')} onClick={(e) => toggleFavorite(e, item)}>
                    <View className='icon-svg' style={iconStyle(isFaved ? 'heartFill' : 'heart', 34)} />
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
            <View className='load-more' onClick={fetchMore}>
              <Text className='load-more__text'>
                {loadingMore ? t('common.loading') : t('tl.loadMoreListings')}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      <BottomNav role='tenant' active='browse' />
    </View>
  )
}