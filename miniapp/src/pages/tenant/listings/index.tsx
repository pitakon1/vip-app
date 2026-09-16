import { useMemo, useState } from 'react'
import { View, Text, ScrollView, Image, Input } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi, favoritesApi } from '@/services/api'
import { AREA_GROUPS } from '@/data/locationArea'
import { METRO_LINES } from '@/data/locationMetro'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

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

const TYPE_LABELS: Record<string, string> = {
  apartment: '公寓',
  condo: '公寓',
  villa: '别墅',
  house: '别墅',
  shop: '商铺',
  commercial: '商铺',
  office: '写字楼'
}

const STATUS_META: Record<string, { text: string; color: string }> = {
  vacant: { text: '空置', color: 'var(--success)' },
  rented: { text: '已出租', color: 'var(--primary)' },
  reserved: { text: '已预订', color: 'var(--primary)' },
  maintenance: { text: '维护中', color: 'var(--warning)' }
}

// ==================== 业务类型：整租 / 合租 / 买房（对齐原型业务栏） ====================
type BizKey = 'rent' | 'share' | 'sale'
const BIZ_OPTIONS: { key: BizKey; label: string }[] = [
  { key: 'rent', label: '整租' },
  { key: 'share', label: '合租' },
  { key: 'sale', label: '买房' }
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
  { key: 'default', label: '默认排序' },
  { key: 'latest', label: '最新发布' },
  { key: 'price_asc', label: '价格从低到高' },
  { key: 'price_desc', label: '价格从高到低' },
  { key: 'area_desc', label: '面积从大到小' }
]

// ==================== 价格筛选（对齐贝壳「价格」弹层：预设区间 + 自定义最低/最高 + 重置/确定） ====================
interface PricePreset { key: string; label: string; min: number; max: number }
const PRICE_PRESETS: PricePreset[] = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u3', label: '≤3万', min: 0, max: 30000 },
  { key: '3-5', label: '3-5万', min: 30000, max: 50000 },
  { key: '5-8', label: '5-8万', min: 50000, max: 80000 },
  { key: 'g8', label: '≥8万', min: 80000, max: Infinity }
]
const matchPrice = (rent: number, min: number, max: number): boolean => {
  if (min != null && !Number.isNaN(min) && min > 0 && rent < min) return false
  if (max != null && !Number.isNaN(max) && max > 0 && rent > max) return false
  return true
}

// 户型 / 面积 / 状态（与价格同构的贝壳式快捷选项）
const BEDROOM_OPTIONS = [
  { key: '', label: '不限' },
  { key: '1', label: '1室' },
  { key: '2', label: '2室' },
  { key: '3', label: '3室' },
  { key: '4', label: '4室+' }
]
const AREA_PRESETS = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u50', label: '≤50㎡', min: 0, max: 50 },
  { key: '50-100', label: '50-100㎡', min: 50, max: 100 },
  { key: '100-150', label: '100-150㎡', min: 100, max: 150 },
  { key: '150-200', label: '150-200㎡', min: 150, max: 200 },
  { key: 'g200', label: '≥200㎡', min: 200, max: Infinity }
]
const STATUS_OPTIONS = [
  { key: '', label: '不限' },
  { key: 'vacant', label: '空置' },
  { key: 'rented', label: '已出租' },
  { key: 'reserved', label: '已预订' },
  { key: 'maintenance', label: '维护中' }
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

const formatRent = (v?: number, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '฿'
  return `${cur}${Number(v || 0).toLocaleString()}`
}

// 当前展开的筛选 Tab；null = 全部收起
type OpenTab = null | 'region' | 'price' | 'layout' | 'more' | 'sort'

export default function TenantListingsPage() {
  const router = useRouter()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [favPending, setFavPending] = useState<Set<string>>(new Set())

  // 顶部搜索栏 + 业务栏（由首页「出租/买房」入口带入参数初始化）
  const initialBiz: BizKey = router.params?.biz === 'buy' ? 'sale' : 'rent'
  const [keyword, setKeyword] = useState<string>(router.params?.q ? decodeURIComponent(router.params.q) : '')
  const [query, setQuery] = useState<string>(router.params?.q ? decodeURIComponent(router.params.q) : '')
  const [biz, setBiz] = useState<BizKey>(initialBiz)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  // 按区域 / 按地铁（对齐贝壳「区域 | 地铁」下拉面板）
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area')
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

  const fetchListings = async (nextPage = 1, q = query) => {
    if (nextPage === 1) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await propertiesApi.list({
        page: nextPage,
        page_size: PAGE_SIZE,
        ...(q ? { q } : {})
      })
      const list = pickList(res)
      setListings((prev) => (nextPage === 1 ? list : [...prev, ...list]))
      setPage(nextPage)
      setHasMore(list.length >= PAGE_SIZE)
    } catch (error) {
      console.error('[Listings] 获取房源失败', error)
      Taro.showToast({ title: '加载房源失败', icon: 'none' })
    } finally {
      setLoading(false)
      setLoadingMore(false)
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
    fetchListings(1, q)
  }

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return
    fetchListings(page + 1)
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
      Taro.showToast({ title: willFav ? '已收藏' : '已取消收藏', icon: 'none' })
    } catch (error) {
      console.error('[Listings] 收藏切换失败', error)
      setFavSet((prev) => {
        const next = new Set(prev)
        if (willFav) next.delete(pid)
        else next.add(pid)
        return next
      })
      Taro.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      setFavPending((s) => {
        const next = new Set(s)
        next.delete(pid)
        return next
      })
    }
  }

  const allDistricts = useMemo(() => AREA_GROUPS.flatMap((g) => g.children), [])
  const activeLine = useMemo(
    () => METRO_LINES.find((l) => l.key === metroLine),
    [metroLine]
  )

  // 已选区域/地铁的关键词与展示文案
  const activeLocationKw = useMemo(() => {
    if (districtSel) {
      const node = allDistricts.find((d) => d.key === districtSel)
      return node ? node.kws : []
    }
    if (metroSel.length) {
      const stations = METRO_LINES.flatMap((l) => l.stations)
      return stations.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws)
    }
    return []
  }, [districtSel, metroSel, allDistricts])

  const regionLabel = useMemo(() => {
    if (districtSel) {
      const node = allDistricts.find((d) => d.key === districtSel)
      return node ? node.label : '区域'
    }
    if (metroSel.length) {
      const first = metroSel[0]
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first
    }
    return '区域'
  }, [districtSel, metroSel, allDistricts])

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
    if (p && p.key) return p.label
    if (customMin || customMax) return `自定义`
    return '价格'
  }, [pricePreset, customMin, customMax])

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
        Taro.showToast({ title: '最高价需 ≥ 最低价', icon: 'none' })
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
    () => BEDROOM_OPTIONS.find((b) => b.key === bedroomSel)?.label || '房型',
    [bedroomSel]
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
        Taro.showToast({ title: '最高面积需 ≥ 最低面积', icon: 'none' })
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
      matchLocation(it, activeLocationKw) &&
      matchPrice(Number(it.monthly_rent || 0), activePrice.min, activePrice.max) &&
      matchArea(Number(it.size_sqm || 0), activeArea.min, activeArea.max) &&
      (!bedroomSel || Number(it.bedrooms) >= Number(bedroomSel === '4' ? 4 : bedroomSel)) &&
      (!statusSel || it.status === statusSel)
    )
    switch (sortKey) {
      case 'latest': return list.slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      case 'price_asc': return list.slice().sort((a, b) => a.monthly_rent - b.monthly_rent)
      case 'price_desc': return list.slice().sort((a, b) => b.monthly_rent - a.monthly_rent)
      case 'area_desc': return list.slice().sort((a, b) => b.size_sqm - a.size_sqm)
      default: return list
    }
  }, [listings, biz, activeLocationKw, activePrice, activeArea, bedroomSel, statusSel, sortKey])

  const sortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label || '排序'
  const moreBadge = (hasAreaFilter ? 1 : 0) + (statusSel ? 1 : 0)

  const filterTabs = [
    { key: 'region', label: activeLocationKw.length ? regionLabel : '区域', active: activeLocationKw.length > 0, badge: 0 },
    { key: 'price', label: hasPriceFilter ? priceLabel : '价格', active: hasPriceFilter, badge: 0 },
    { key: 'layout', label: bedroomSel ? bedroomLabel : '房型', active: !!bedroomSel, badge: 0 },
    { key: 'more', label: '更多', active: moreBadge > 0, badge: moreBadge },
    { key: 'sort', label: sortKey !== 'default' ? sortLabel : '排序', active: sortKey !== 'default', badge: 0 }
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
            <Text>{tab === 'area' ? '区域' : '地铁'}</Text>
          </View>
        ))}
      </View>

      <View className='filter-drop__body'>
        {locTab === 'area' ? (
          <ScrollView scrollY className='filter-region-scroll'>
            {AREA_GROUPS.map((g) => (
              <View key={g.cityKey} className='loc-group'>
                <Text className='loc-group__title'>{g.cityLabel}</Text>
                <View className='filter-chips'>
                  <View
                    className={`filter-chip ${districtSel === null ? 'filter-chip--active' : ''}`}
                    onClick={() => applyDistrict(null)}
                  >
                    <Text>不限</Text>
                  </View>
                  {g.children.map((d) => (
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
            ))}
          </ScrollView>
        ) : (
          <View className='filter-metro'>
            <ScrollView scrollX className='filter-metro__lines'>
              {METRO_LINES.map((l) => (
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
          <Text>重置</Text>
        </View>
        <View className='loc-btn loc-btn--primary' onClick={() => confirmCurrent('region')}>
          <Text>确定</Text>
        </View>
      </View>
    </>
  )

  const renderPricePanel = () => (
    <>
      <Text className='filter-group__title'>快捷选择</Text>
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

      <Text className='filter-group__title'>自定义价格</Text>
      <View className='price-custom'>
        <View className='price-input'>
          <Text className='price-input__cur'>฿</Text>
          <Input
            className='price-input__field'
            type='number'
            value={priceDraftMin}
            placeholder='最低价'
            placeholderStyle='color:#9ca3af'
            onInput={(e: any) => setPriceDraftMin(e.detail.value)}
          />
          <Text className='price-input__unit'>万/月</Text>
        </View>
        <Text className='price-custom__divider'>至</Text>
        <View className='price-input'>
          <Text className='price-input__cur'>฿</Text>
          <Input
            className='price-input__field'
            type='number'
            value={priceDraftMax}
            placeholder='最高价'
            placeholderStyle='color:#9ca3af'
            onInput={(e: any) => setPriceDraftMax(e.detail.value)}
          />
          <Text className='price-input__unit'>万/月</Text>
        </View>
      </View>
      <Text className='price-custom__hint'>单位：万/月，填写其一或两项均可，留空表示不限</Text>

      <View className='filter-drop__footer'>
        <View className='loc-btn loc-btn--ghost' onClick={() => resetCurrent('price')}>
          <Text>重置</Text>
        </View>
        <View className='loc-btn loc-btn--primary' onClick={() => confirmCurrent('price')}>
          <Text>确定</Text>
        </View>
      </View>
    </>
  )

  const renderLayoutPanel = () => (
    <>
      <Text className='filter-group__title'>户型</Text>
      <View className='filter-chips'>
        {BEDROOM_OPTIONS.map((b) => (
          <View
            key={b.key}
            className={`filter-chip ${bedroomDraft === b.key ? 'filter-chip--active' : ''}`}
            onClick={() => setBedroomDraft(b.key)}
          >
            <Text>{b.label}</Text>
          </View>
        ))}
      </View>

      <View className='filter-drop__footer'>
        <View className='loc-btn loc-btn--ghost' onClick={() => resetCurrent('layout')}>
          <Text>重置</Text>
        </View>
        <View className='loc-btn loc-btn--primary' onClick={() => confirmCurrent('layout')}>
          <Text>确定</Text>
        </View>
      </View>
    </>
  )

  const renderMorePanel = () => (
    <>
      <Text className='filter-group__title'>面积</Text>
      <View className='filter-chips'>
        {AREA_PRESETS.map((p) => (
          <View
            key={p.key}
            className={`filter-chip ${areaPreset === p.key ? 'filter-chip--active' : ''}`}
            onClick={() => applyAreaPreset(p.key)}
          >
            <Text>{p.label}</Text>
          </View>
        ))}
      </View>

      <Text className='filter-group__title'>自定义面积</Text>
      <View className='price-custom'>
        <View className='price-input'>
          <Input
            className='price-input__field'
            type='number'
            value={areaDraftMin}
            placeholder='最低㎡'
            placeholderStyle='color:#9ca3af'
            onInput={(e: any) => setAreaDraftMin(e.detail.value)}
          />
          <Text className='price-input__unit'>㎡</Text>
        </View>
        <Text className='price-custom__divider'>至</Text>
        <View className='price-input'>
          <Input
            className='price-input__field'
            type='number'
            value={areaDraftMax}
            placeholder='最高㎡'
            placeholderStyle='color:#9ca3af'
            onInput={(e: any) => setAreaDraftMax(e.detail.value)}
          />
          <Text className='price-input__unit'>㎡</Text>
        </View>
      </View>

      <Text className='filter-group__title'>房源状态</Text>
      <View className='filter-chips'>
        {STATUS_OPTIONS.map((s) => (
          <View
            key={s.key}
            className={`filter-chip ${statusDraft === s.key ? 'filter-chip--active' : ''}`}
            onClick={() => setStatusDraft(s.key)}
          >
            <Text>{s.label}</Text>
          </View>
        ))}
      </View>

      <View className='filter-drop__footer'>
        <View className='loc-btn loc-btn--ghost' onClick={() => resetCurrent('more')}>
          <Text>重置</Text>
        </View>
        <View className='loc-btn loc-btn--primary' onClick={() => confirmCurrent('more')}>
          <Text>确定</Text>
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
          <Text>{s.label}</Text>
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
            placeholder='输入区域、小区名...'
            confirmType='search'
            onInput={(e: any) => setKeyword(e.detail.value)}
            onConfirm={handleSearch}
          />
          <View className='list-search__btn' onClick={handleSearch}>
            <Text className='list-search__btn-text'>搜索</Text>
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
              <Text className='biz-bar__text'>{b.label}</Text>
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
          <Text className='result-count'>
            共 <Text className='result-count__num'>{visibleList.length}</Text> 套房源
          </Text>
        </View>

        <ScrollView scrollY className='list-scroll'>
          {loading && visibleList.length === 0 && (
            <View className='empty-state'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && visibleList.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('home', 80)} />
              <Text>{activeLocationKw.length ? '该区域/地铁暂无房源' : '暂无房源'}</Text>
            </View>
          )}
          {visibleList.map((item) => {
            const photo = Array.isArray(item.photos) && item.photos.length ? item.photos[0] : ''
            const statusMeta = STATUS_META[item.status || 'vacant'] || STATUS_META.vacant
            const isSaleItem = Number(item.sale_price) > 0
            const isFaved = favSet.has(String(item.id))
            // 卡片标签：房型 / 面积 / 装修，最多 3 个（对齐原型标签行）
            const cardTags = [
              Number(item.bedrooms) ? `${item.bedrooms}室` : '',
              Number(item.size_sqm) ? `${item.size_sqm}㎡` : '',
              item.furnished ? '拎包入住' : ''
            ].filter(Boolean) as string[]
            return (
              <View key={item.id} className='house-card' onClick={() => openDetail(item)}>
                <View className='house-thumb'>
                  {photo ? (
                    <Image className='house-img' src={photo} mode='aspectFill' />
                  ) : (
                    <View className='house-thumb-ph'>
                      <Text>房源</Text>
                    </View>
                  )}
                  <Text className='house-type'>{TYPE_LABELS[item.property_type || ''] || '房源'}</Text>
                  <View className='house-fav' onClick={(e) => toggleFavorite(e, item)}>
                    <View className='icon-svg' style={iconStyle(isFaved ? 'heartFill' : 'heart', 34)} />
                  </View>
                </View>
                <View className='house-info'>
                  <Text className='house-title'>{item.title || item.room_number || '未命名房源'}</Text>
                  <Text className='house-addr'>{item.address || '暂无地址'}</Text>
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
                      <Text className='house-rent-unit'>{isSaleItem ? ' 总价' : '/月'}</Text>
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
            <View className='load-more' onClick={handleLoadMore}>
              <Text className='load-more__text'>
                {loadingMore ? '加载中...' : '加载更多房源'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      <BottomNav role='tenant' active='browse' />
    </View>
  )
}