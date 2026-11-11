import { LIST_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { propertiesApi, dashboardApi, listingApi } from '@/services/api'
import { publicApi, type PublicSchool } from '@/services/publicApi'
import { fmtMoney as fmtRent } from '@/utils/format'
import { request } from '@/lib/api'
import { buildListingPayload } from '@/lib/listingPayload'
import { iconStyle } from '@/utils/icons'
import { AREA_GROUPS } from '@/data/locationArea'
import { AREA_TIERS_5, PRICE_TIERS, SCHOOL_RADIUS_OPTIONS } from '@/constants/filters'
import BottomNav from '@/components/BottomNav'
import StatusTop from '@/components/StatusTop'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import '@/styles/filter-panel.scss'
import './index.scss'
import { errorText } from '@/lib/errorText'

interface PropertyItem {
  id: string
  room_number?: string
  building?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  bedrooms?: number
  bathrooms?: number
  size_sqm?: number
  status?: string
  photos?: string[]
  [key: string]: any
}

const TYPE_LABELS: Record<string, string> = {
  apartment: 'prop.typeApartment',
  condo: 'prop.typeApartment',
  house: 'prop.typeHouse',
  villa: 'prop.typeVilla',
  commercial: 'prop.typeCommercial',
  shop: 'prop.typeCommercial',
  office: 'prop.typeOffice'
}

const STATUS_LABELS: Record<string, string> = {
  vacant: 'prop.statusVacant',
  rented: 'prop.statusRented',
  renewing: 'prop.statusRenewing',
  maintenance: 'prop.statusMaintenance'
} as const

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'common.all' },
  { key: 'vacant', label: 'prop.statusVacant' },
  { key: 'rented', label: 'prop.statusRented' },
  { key: 'renewing', label: 'prop.statusRenewing' },
  { key: 'maintenance', label: 'prop.statusMaintenance' }
]

const PAGE_SIZE = LIST_PAGE_SIZE

// 房型选项：''=不限, '0'=单间, '1'/'2'=精确居室, '3'=3室及以上, '4'=4室及以上（对齐租客端 4室+）
const BEDROOM_OPTIONS = [
  { key: '', label: 'prop.bedroomAny' },
  { key: '0', label: 'prop.bedroom0' },
  { key: '1', label: 'prop.bedroom1' },
  { key: '2', label: 'prop.bedroom2' },
  { key: '3', label: 'prop.bedroom3' },
  { key: '4', label: 'prop.bedroom4' }
]

// 价格区间（单位 万/月 THB，语义与租客端对齐）：''=不限, 预设 key, 'custom'=自定义
const PRICE_LABELS: Record<string, string> = {
  u3: 'prop.priceU3',
  '3-5': 'prop.price35',
  '5-8': 'prop.price58',
  g8: 'prop.priceG8'
}
const PRICE_OPTIONS = [
  { key: '', label: 'prop.priceAny' },
  ...PRICE_TIERS.map((tier) => ({ key: tier.key, label: PRICE_LABELS[tier.key] })),
  { key: 'custom', label: 'prop.custom' }
]

// 面积区间（对齐租客端）：''=不限, 预设 key, 'custom'=自定义
const AREA_LABELS: Record<string, string> = {
  '0-50': '≤50㎡',
  '50-100': '50-100㎡',
  '100-150': '100-150㎡',
  '150-200': '150-200㎡',
  '200+': '≥200㎡'
}
const AREA_OPTIONS = [
  { key: '', label: 'prop.areaAny' },
  ...AREA_TIERS_5.map((tier) => ({ key: tier.key, label: AREA_LABELS[tier.key] })),
  { key: 'custom', label: 'prop.custom' }
]

const SORT_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'latest', label: 'prop.sortLatest' },
  { key: 'price_asc', label: 'prop.sortPriceAsc' },
  { key: 'price_desc', label: 'prop.sortPriceDesc' },
  { key: 'area_desc', label: 'prop.sortAreaDesc' }
]

// 学校半径（与 C 端一致）
const RADII = SCHOOL_RADIUS_OPTIONS

// 筛选 chip：状态 / 房型 / 学校 / 更多 / 区域 / 排序（对齐浏览页）+ 只看视频
type FilterTab = null | 'region' | 'price' | 'more' | 'sort'

// 统一解析列表响应（Page[Property] / 直接数组 两种形态）
function pickList(res: any): PropertyItem[] {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

function pickListPublic(res: any): PublicSchool[] {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

export default function AdminPropertiesPage() {
  const { t } = useI18n()
  const [list, setList] = useState<PropertyItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  // 分页
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  // 状态计数随列表响应返回（后端 status_counts），与列表同源、不受分页影响
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [priceCustomMin, setPriceCustomMin] = useState('')
  const [priceCustomMax, setPriceCustomMax] = useState('')
  const [areaRange, setAreaRange] = useState('')
  const [areaCustomMin, setAreaCustomMin] = useState('')
  const [areaCustomMax, setAreaCustomMax] = useState('')
  const [region, setRegion] = useState('') // 选中的城区，存「省市:城区」复合键
  const [hasVideo, setHasVideo] = useState(false)
  const [sort, setSort] = useState('')
  // 学校：空间筛选（半径内按距离）
  const [schoolId, setSchoolId] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolKm, setSchoolKm] = useState(3)
  const [schools, setSchools] = useState<PublicSchool[]>([])
  const [schoolKw, setSchoolKw] = useState('')
  const [openTab, setOpenTab] = useState<FilterTab>(null)
  // 区域面板：国家 → 省市 → 城区 三级下钻（左栏只列国家，右栏先是该国家的省市列表，
  // 点省市后右栏换成它的城区）。此前把国家/省市/城区拍平成一条 Picker 选项，混杂难找。
  const [regionOpen, setRegionOpen] = useState(false)
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country)
  const [areaDrill, setAreaDrill] = useState<string>('') // 已下钻的省市 cityKey，空 = 停在省市列表
  // 城市级筛选（只选了省市、未选城区时也下发服务端 city）
  const [citySel, setCitySel] = useState<string>('')

  // 城区扁平表：key 沿用「省市:城区」复合键（不同省市下存在同名城区，如 laguna），
  // 仅用于按选中项反查关键词与展示文案。
  const allDistricts = useMemo(
    () => AREA_GROUPS.flatMap((g) => g.children.map((d) => ({ ...d, key: `${g.cityKey}:${d.key}` }))),
    []
  )
  // 左栏国家清单（按 AREA_GROUPS 出现顺序去重，保持业务顺序）
  const countryList = useMemo(() => Array.from(new Set(AREA_GROUPS.map((g) => g.country))), [])
  // 右栏未下钻时的数据源：当前国家下的省市
  const countryGroups = useMemo(
    () => AREA_GROUPS.filter((g) => g.country === areaCountry),
    [areaCountry]
  )
  // 右栏已下钻时的数据源：该省市的城区
  const activeAreaGroup = useMemo(
    () => AREA_GROUPS.find((g) => g.cityKey === areaDrill),
    [areaDrill]
  )
  const regionLabel = useMemo(
    () =>
      allDistricts.find((d) => d.key === region)?.label ||
      (citySel ? AREA_GROUPS.find((g) => g.cityKey === citySel)?.cityLabel : '') ||
      t('prop.regionAny'),
    [region, citySel, allDistricts, t]
  )
  const filteredSchools = schoolKw.trim()
    ? schools.filter((s) =>
        `${s.name ?? ''} ${s.name_en ?? ''} ${s.district ?? ''}`
          .toLowerCase()
          .includes(schoolKw.trim().toLowerCase())
      )
    : schools

  const fetchSummary = async () => {
    try {
      const res: any = await dashboardApi.summary()
      setSummary(res?.data ?? res)
    } catch (error) {
      console.error('[AdminProperties] 获取房源统计失败', error)
    }
  }

  // 由筛选 state 构建后端查询参数（服务端过滤以保证正确分页）。overrides 用于状态尚未更新时传本次变更。
  const buildParams = (over: Partial<{
    status: string; q: string; bedrooms: string; priceRange: string;
    priceCustomMin: string; priceCustomMax: string; areaRange: string;
    areaCustomMin: string; areaCustomMax: string; region: string; citySel: string;
    hasVideo: boolean; sort: string; schoolId: string; schoolKm: number
  }> = {}, pg: number = 1) => {
    const p: Record<string, any> = { page: pg, page_size: PAGE_SIZE, sort: 'latest' }
    const st = over.status ?? status
    const q = over.q ?? query
    const bd = over.bedrooms ?? bedrooms
    const pr = over.priceRange ?? priceRange
    const pcMin = over.priceCustomMin ?? priceCustomMin
    const pcMax = over.priceCustomMax ?? priceCustomMax
    const ar = over.areaRange ?? areaRange
    const acMin = over.areaCustomMin ?? areaCustomMin
    const acMax = over.areaCustomMax ?? areaCustomMax
    const rg = over.region ?? region
    const cs = over.citySel ?? citySel
    const hv = over.hasVideo ?? hasVideo
    const so = over.sort ?? sort
    const sid = over.schoolId ?? schoolId
    const skm = over.schoolKm ?? schoolKm

    if (q) p.q = q
    if (st) p.status = st
    if (so) p.sort = so
    // 房型：单间=>0,0；3室以上/4室以上=>min=key 不设上限
    if (bd !== '') {
      if (bd === '3' || bd === '4') p.bedrooms_min = Number(bd)
      else { p.bedrooms_min = Number(bd); p.bedrooms_max = Number(bd) }
    }
    // 价格区间：按预设（万→THB）/自定义按需设 min/max
    if (pr) {
      if (pr === 'custom') {
        if (pcMin) p.price_min = Number(pcMin) * 10000
        if (pcMax) p.price_max = Number(pcMax) * 10000
      } else {
        const tier = PRICE_TIERS.find((x) => x.key === pr)
        if (tier) {
          if (tier.min > 0) p.price_min = tier.min
          if (tier.max != null) p.price_max = tier.max
        }
      }
    }
    // 面积区间
    if (ar) {
      if (ar === 'custom') {
        if (acMin) p.area_min = Number(acMin)
        if (acMax) p.area_max = Number(acMax)
      } else {
        const tier = AREA_TIERS_5.find((x) => x.key === ar)
        if (tier) {
          p.area_min = tier.min
          if (tier.max != null) p.area_max = tier.max
        }
      }
    }
    // 区域/位置：选中的城区关键词走后端 keywords（与租客端同语义）
    if (rg) {
      const node = allDistricts.find((d) => d.key === rg)
      if (node && node.kws.length) p.keywords = node.kws
    } else if (cs) {
      // 只选到省市：下推 city，由服务端按 projects.city 过滤（slug 大小写/连字符不敏感）
      p.city = cs
    }
    // 只看带视频
    if (hv) p.has_video = true
    // 学校：空间筛选
    if (sid) {
      p.school_id = sid
      p.school_radius_km = skm
    }
    return p
  }

  const fetchList = useCallback(async (over: Parameters<typeof buildParams>[0] = {}, pg: number = 1, append: boolean = false) => {
    if (append && loadingMore) return
    if (!append) { setLoading(true); setHasMore(true) }
    else setLoadingMore(true)
    try {
      const res: any = await propertiesApi.list(buildParams(over, pg))
      const d = res?.data ?? res
      const items = Array.isArray(d) ? d : d?.items || []
      const t = Number(d?.total ?? items.length)
      const sc = d?.status_counts as Record<string, number> | undefined
      if (sc) setStatusCounts(sc)
      if (append) {
        setList((prev) => [...prev, ...items])
      } else {
        setList(items)
      }
      setTotal(t)
      setPage(pg)
      // 刷新第 1 页时闭包里的 list.length 是上一批数据，不能拿来判断"还有下一页"
      const loadedCount = append ? list.length + items.length : items.length
      setHasMore(loadedCount < t)
    } catch (error) {
      console.error('[AdminProperties] 获取房源失败', error)
      if (!append) Taro.showToast({ title: t('prop.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [loadingMore, list.length, t])

  useReachBottom(() => {
    if (hasMore && !loading && !loadingMore) {
      fetchList({}, page + 1, true)
    }
  })

  useDidShow(() => {
    fetchSummary()
    fetchList()
  })

  // 学校清单只为筛选器备选：必须放在 effect 里，且只请求一次；
  // 放在渲染体内会在数据返回前被每次渲染重复触发。
  const schoolsRequestedRef = useRef(false)
  useEffect(() => {
    if (schoolsRequestedRef.current) return
    schoolsRequestedRef.current = true
    publicApi
      .schools({ page_size: OPTION_PAGE_SIZE })
      .then((res: any) => setSchools(pickListPublic(res)))
      .catch(() => setSchools([]))
  }, [])

  const handleSearch = () => {
    const q = keyword.trim()
    setQuery(q)
    fetchList({ q })
  }

  const changeStatus = (key: string) => {
    setStatus(key)
    fetchList({ status: key })
  }

  // 筛选项变更：重置到第 1 页（page 恒为 1）并重新请求
  const changeBedrooms = (key: string) => {
    setBedrooms(key)
    fetchList({ bedrooms: key })
  }
  const changePriceRange = (key: string) => {
    setPriceRange(key)
    fetchList({ priceRange: key })
  }
  const changePriceCustom = (which: 'min' | 'max', val: string) => {
    if (which === 'min') { setPriceCustomMin(val); fetchList({ priceCustomMin: val }) }
    else { setPriceCustomMax(val); fetchList({ priceCustomMax: val }) }
  }
  const changeAreaRange = (key: string) => {
    setAreaRange(key)
    fetchList({ areaRange: key })
  }
  const changeAreaCustom = (which: 'min' | 'max', val: string) => {
    if (which === 'min') { setAreaCustomMin(val); fetchList({ areaCustomMin: val }) }
    else { setAreaCustomMax(val); fetchList({ areaCustomMax: val }) }
  }
  const changeSort = (key: string) => {
    setSort(key)
    fetchList({ sort: key })
  }
  const pickRegion = (key: string | null) => {
    setRegion(key || '')
    // 清空区域时一并清掉下钻/城市状态，下次打开回到省市列表
    if (!key) { setAreaDrill(''); setCitySel('') }
    fetchList({ region: key || '', citySel: key ? citySel : '' })
  }
  // 选中省市：立即下发城市级筛选，同时下钻展示城区
  const pickCity = (key: string) => {
    setAreaDrill(key)
    setCitySel(key)
    setRegion('')
    fetchList({ citySel: key, region: '' })
  }
  const toggleSchool = (school: PublicSchool) => {
    if (schoolId === school.id) {
      setSchoolId('')
      setSchoolName('')
      fetchList({ schoolId: '' })
    } else {
      setSchoolId(school.id)
      setSchoolName(school.name ?? '')
      fetchList({ schoolId: school.id })
    }
    setOpenTab(null)
  }
  const resetMore = () => {
    setBedrooms('')
    setPriceRange('')
    setPriceCustomMin('')
    setPriceCustomMax('')
    setAreaRange('')
    setAreaCustomMin('')
    setAreaCustomMax('')
    fetchList({ bedrooms: '', priceRange: '', areaRange: '' })
    setOpenTab(null)
  }
  const toggleHasVideo = () => {
    setHasVideo(!hasVideo)
    fetchList({ hasVideo: !hasVideo })
  }

  const openDetail = (item: PropertyItem) => {
    Taro.navigateTo({ url: `/pages/admin/property-detail/index?id=${item.id}` })
  }

  // 一键上架：由房源档案直接派生上架单（不填表），提交后等待平台审核
  const publishProperty = (item: PropertyItem) => {
    if (Number(item.monthly_rent || 0) <= 0) {
      Taro.showToast({ title: t('listing.listManualRent'), icon: 'none' })
      return
    }
    Taro.showModal({
      title: t('listing.confirmListTitle'),
      content: t('listing.confirmListBody'),
      success: async (r) => {
        if (!r.confirm) return
        try {
          await listingApi.create(buildListingPayload(item))
          Taro.showToast({ title: t('listing.listedOk'), icon: 'success' })
        } catch (err: any) {
          Taro.showToast({ title:errorText(err, t('common.saveFailed')), icon: 'none' })
        }
      }
    })
  }

  // 软删除房源：后端 DELETE /properties/{id}（require_agent）。删除即下架，前台天然隐藏。
  const removeProperty = (item: PropertyItem) => {
    Taro.showModal({
      title: t('prop.deleteTitle'),
      content: t('prop.deleteContent', { name: item.room_number || item.address || t('prop.propertyFallback') }),
      success: async (r) => {
        if (!r.confirm) return
        try {
          await request({ url: `/properties/${item.id}`, method: 'DELETE' })
          Taro.showToast({ title: t('common.deleted'), icon: 'none' })
          fetchList()
          fetchSummary()
        } catch (error) {
          console.error('[AdminProperties] 删除房源失败', error)
          Taro.showToast({ title: t('common.deleteFailed'), icon: 'none' })
        }
      }
    })
  }

  const labels: Record<string, string> = {
    region: regionLabel,
    sort: t(sort ? (SORT_OPTIONS.find((o) => o.key === sort)?.label || 'pub.filterAny') : 'prop.sortLabel'),
    price: t(priceRange === 'custom'
      ? (priceCustomMin || priceCustomMax ? `${priceCustomMin || '…'} - ${priceCustomMax || '…'}` : 'prop.custom')
      : (priceRange ? (PRICE_OPTIONS.find((o) => o.key === priceRange)?.label || 'prop.priceAny') : 'pub.filterPrice'))
  }
  const activeSet: Record<string, boolean> = {
    region: !!(region || citySel),
    sort: !!sort,
    price: !!(priceRange || priceCustomMin || priceCustomMax),
    more: !!(status || bedrooms !== '' || schoolId || areaRange || areaCustomMin || areaCustomMax || hasVideo)
  }

  const tabs: { key: Exclude<FilterTab, null>; label: string; active: boolean }[] = [
    { key: 'region', label: labels.region, active: activeSet.region },
    { key: 'price', label: labels.price, active: activeSet.price },
    { key: 'more', label: t('pub.filterMore'), active: activeSet.more },
    { key: 'sort', label: labels.sort, active: activeSet.sort }
  ]

  const stats = [
    { key: 'total', label: 'prop.statTotal', value: summary?.total_properties, tone: 'primary' },
    { key: 'vacant', label: 'prop.statVacant', value: summary?.vacant, tone: 'warning' },
    { key: 'rented', label: 'prop.statusRented', value: summary?.rented, tone: 'success' },
    { key: 'maintenance', label: 'prop.statusMaintenance', value: summary?.maintenance, tone: 'info' }
  ]

  // 状态徽标：'' 表示全部，取各状态之和；其余按键取数（缺键按 0）
  const countsReady = Object.keys(statusCounts).length > 0
  const countOf = (key: string) =>
    key
      ? Number(statusCounts[key] ?? 0)
      : Object.values(statusCounts).reduce((a, b) => a + Number(b || 0), 0)

  return (
    <View className='ap-page'>
      <StatusTop />
      {/* 搜索 + 筛选区（对齐浏览页：pb-search-wrap > pb-search / pb-filters / pb-panel） */}
      <View className='pb-search-wrap'>
        <View className='pb-search'>
          <Input
            className='pb-search__input'
            value={keyword}
            placeholder={t('prop.searchPlaceholder')}
            placeholderStyle='color:#858d94'
            confirmType='search'
            onInput={(e: any) => setKeyword(e.detail.value)}
            onConfirm={handleSearch}
          />
          <View className='pb-search__btn' onClick={handleSearch}>
            <Text className='pb-search__btn-text'>{t('common.search')}</Text>
          </View>
        </View>

        {/* 单行筛选 tab：区域 / 价格 / 更多 / 排序（对齐 App 图二，纯文字+下划线） */}
        <View className='pb-filters'>
          {tabs.map((tb) => (
            <View
              key={tb.key}
              className={`pb-tab ${openTab === tb.key ? 'pb-tab--open' : ''} ${tb.active ? 'pb-tab--active' : ''}`}
              onClick={() => {
                if (openTab === tb.key) { setOpenTab(null); return }
                if (tb.key === 'region') {
                  setRegionOpen(true)
                  // 回显：已选城区 → 定位到其所属省市；只选了城市 → 定位到该城市
                  setAreaDrill(region ? region.split(':')[0] : citySel)
                }
                setOpenTab(tb.key)
              }}
            >
              <Text className='pb-tab__text'>{tb.label}</Text>
              <Text className='pb-tab__arrow'>{openTab === tb.key ? '▲' : '▼'}</Text>
            </View>
          ))}
        </View>

        {openTab !== null && (
          <View className='pb-panel'>
            {openTab === 'sort' && (
              <View className='pb-panel__chips'>
                {SORT_OPTIONS.map((o) => (
                  <View
                    key={o.key}
                    className={`pb-opt ${sort === o.key ? 'pb-opt--active' : ''}`}
                    onClick={() => { changeSort(o.key); setOpenTab(null) }}
                  >
                    <Text>{t(o.label)}</Text>
                  </View>
                ))}
              </View>
            )}

            {openTab === 'price' && (
              <>
                <View className='pb-panel__chips'>
                  {PRICE_OPTIONS.map((o) => (
                    <View
                      key={o.key}
                      className={`pb-opt ${priceRange === o.key ? 'pb-opt--active' : ''}`}
                      onClick={() => changePriceRange(o.key)}
                    >
                      <Text>{t(o.label)}</Text>
                    </View>
                  ))}
                </View>
                {priceRange === 'custom' && (
                  <View className='pb-range'>
                    <Input className='pb-range__input' type='number' value={priceCustomMin} onInput={(e: any) => changePriceCustom('min', e.detail.value)} placeholder={t('prop.min')} />
                    <Text className='pb-range__sep'>-</Text>
                    <Input className='pb-range__input' type='number' value={priceCustomMax} onInput={(e: any) => changePriceCustom('max', e.detail.value)} placeholder={t('prop.max')} />
                  </View>
                )}
                <View className='pb-panel__actions'>
                  <View className='pb-act pb-act--ghost' onClick={resetMore}>
                    <Text>{t('pub.reset')}</Text>
                  </View>
                  <View className='pb-act pb-act--primary' onClick={() => setOpenTab(null)}>
                    <Text>{t('pub.apply')}</Text>
                  </View>
                </View>
              </>
            )}

            {openTab === 'more' && (
              <>
                <View className='pb-group-label'>{t('prop.statusLabel')}</View>
                <View className='pb-panel__chips'>
                  {FILTERS.map((o) => (
                    <View
                      key={o.key || 'all'}
                      className={`pb-opt ${status === o.key ? 'pb-opt--active' : ''}`}
                      onClick={() => changeStatus(o.key)}
                    >
                      <Text>{t(o.label)}</Text>
                      {countsReady && <Text className='pb-opt__count'>{countOf(o.key)}</Text>}
                    </View>
                  ))}
                </View>

                <View className='pb-group-label'>{t('pub.filterBeds')}</View>
                <View className='pb-panel__chips'>
                  {BEDROOM_OPTIONS.map((o) => (
                    <View
                      key={o.key}
                      className={`pb-opt ${bedrooms === o.key ? 'pb-opt--active' : ''}`}
                      onClick={() => changeBedrooms(o.key)}
                    >
                      <Text>{t(o.label)}</Text>
                    </View>
                  ))}
                </View>

                <View className='pb-group-label'>{t('pub.filterArea')}</View>
                <View className='pb-panel__chips'>
                  {AREA_OPTIONS.map((o) => (
                    <View
                      key={o.key}
                      className={`pb-opt ${areaRange === o.key ? 'pb-opt--active' : ''}`}
                      onClick={() => changeAreaRange(o.key)}
                    >
                      <Text>{t(o.label)}</Text>
                    </View>
                  ))}
                </View>
                {areaRange === 'custom' && (
                  <View className='pb-range'>
                    <Input className='pb-range__input' type='number' value={areaCustomMin} onInput={(e: any) => changeAreaCustom('min', e.detail.value)} placeholder={t('prop.minArea')} />
                    <Text className='pb-range__sep'>-</Text>
                    <Input className='pb-range__input' type='number' value={areaCustomMax} onInput={(e: any) => changeAreaCustom('max', e.detail.value)} placeholder={t('prop.maxArea')} />
                  </View>
                )}

                {/* 只看带视频（收进更多面板） */}
                <View className='pb-opt pb-opt--row' onClick={toggleHasVideo}>
                  <Text>{t('prop.onlyVideo')}</Text>
                  {hasVideo && <Text className='pb-opt__check'>✓</Text>}
                </View>

                <View className='pb-group-label'>{t('pub.filterSchool')}</View>
                <View className='pb-school'>
                  <View className='pb-panel__chips'>
                    {RADII.map((km) => (
                      <View
                        key={km}
                        className={`pb-opt ${schoolKm === km ? 'pb-opt--active' : ''}`}
                        onClick={() => { setSchoolKm(km); fetchList({ schoolKm: km }) }}
                      >
                        <Text>{km}km</Text>
                      </View>
                    ))}
                  </View>
                  <View className='pb-search pb-search--sm'>
                    <Input
                      className='pb-search__input'
                      value={schoolKw}
                      onInput={(e: any) => setSchoolKw(e.detail.value)}
                      placeholder={t('pub.schoolSearchPlaceholder')}
                    />
                  </View>
                  <ScrollView scrollY className='pb-school__list'>
                    {filteredSchools.length === 0 ? (
                      <View className='pb-state__desc'>{t('pub.schoolFilterEmpty')}</View>
                    ) : (
                      filteredSchools.map((s) => (
                        <View
                          key={s.id}
                          className={`pb-opt pb-opt--row ${schoolId === s.id ? 'pb-opt--active' : ''}`}
                          onClick={() => toggleSchool(s)}
                        >
                          <Text>{s.name}</Text>
                          {schoolId === s.id && <Text className='pb-opt__check'>✓</Text>}
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>

                <View className='pb-panel__actions'>
                  <View className='pb-act pb-act--ghost' onClick={resetMore}>
                    <Text>{t('pub.reset')}</Text>
                  </View>
                  <View className='pb-act pb-act--primary' onClick={() => setOpenTab(null)}>
                    <Text>{t('pub.apply')}</Text>
                  </View>
                </View>
              </>
            )}

            {openTab === 'region' && regionOpen && (
              <View className='pb-region'>
                <View className='pb-region__cols'>
                  <View className='pb-region__col pb-region__col--countries'>
                    {countryList.map((c) => (
                      <View
                        key={c}
                        className={`pb-region__line ${areaCountry === c ? 'pb-region__line--active' : ''}`}
                        onClick={() => {
                          setAreaCountry(c)
                          setAreaDrill('')
                          // 切国家清掉旧城市/城区筛选，避免旧条件继续生效
                          if (citySel || region) {
                            setCitySel('')
                            setRegion('')
                            fetchList({ citySel: '', region: '' })
                          }
                        }}
                      >
                        <Text>{c}</Text>
                      </View>
                    ))}
                  </View>
                  <View className='pb-region__col'>
                    {activeAreaGroup ? (
                      <>
                        <View className='pb-region__head'>
                          <Text className='pb-region__back' onClick={() => setAreaDrill('')}>← {areaCountry}</Text>
                          <Text className='pb-region__title'>{activeAreaGroup.cityLabel}</Text>
                        </View>
                        <View className='pb-panel__chips'>
                          <View
                            className={`pb-opt ${region === '' && citySel === activeAreaGroup.cityKey ? 'pb-opt--active' : ''}`}
                            onClick={() => {
                              // 城市内选「不限」= 保留城市级筛选，只清城区
                              setRegion('')
                              setCitySel(activeAreaGroup.cityKey)
                              fetchList({ region: '', citySel: activeAreaGroup.cityKey })
                            }}
                          >
                            <Text>{t('pub.filterAny')}</Text>
                          </View>
                          {activeAreaGroup.children.map((d) => (
                            <View
                              key={d.key}
                              className={`pb-opt ${region === `${activeAreaGroup.cityKey}:${d.key}` ? 'pb-opt--active' : ''}`}
                              onClick={() => pickRegion(`${activeAreaGroup.cityKey}:${d.key}`)}
                            >
                              <Text>{d.label}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    ) : (
                      <>
                        <Text className='pb-region__title'>{areaCountry}</Text>
                        <View className='pb-panel__chips'>
                          {countryGroups.map((g) => (
                            <View
                              key={g.cityKey}
                              className={`pb-opt ${areaDrill === g.cityKey ? 'pb-opt--active' : ''}`}
                              onClick={() => pickCity(g.cityKey)}
                            >
                              <Text>{g.cityLabel}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 统计（来源：/dashboard/summary） */}
      <View className='ap-stats'>
        {stats.map((s) => (
          <View key={s.key} className={`ap-stat ap-stat--${s.tone}`}>
            <Text className='ap-stat__value'>{s.value ?? '-'}</Text>
            <Text className='ap-stat__label'>{t(s.label)}</Text>
          </View>
        ))}
      </View>

      <View className='ap-section-head'>
        <Text className='ap-section-head__title'>{t('prop.listTitle')}</Text>
        {/* 口径以服务端 total 为准：list.length 只是已加载的第一页条数，
            直接拿它显示「共 N 套」会和上方的总房源统计互相矛盾。 */}
        <Text className='ap-section-head__count'>{t('prop.countUnit', { n: total || list.length })}</Text>
      </View>

      <ScrollView scrollY className='ap-list'>
        {loading && list.length === 0 && (
          <StateBlock loading text={t('pub.loading')} />
        )}
        {!loading && list.length === 0 && (
          <StateBlock
            empty
            filtered={Boolean(query || status)}
            icon='home'
            text={query || status ? t('prop.emptyFiltered') : t('prop.emptyNone')}
          />
        )}

        {list.map((item) => (
          <View key={item.id} className='ap-card' onClick={() => openDetail(item)}>
            {/* 头图占位（后端 photos 为空时展示类型徽章底色块） */}
            <View className='ap-card__banner'>
              {Array.isArray(item.photos) && item.photos.length > 0 ? null : (
                <Text className='ap-card__banner-ph'>{t('prop.listing')}</Text>
              )}
              <Text className='ap-card__type'>
                {t(TYPE_LABELS[item.property_type || ''] || 'prop.listing')}
              </Text>
              <Text className={`ap-card__status ap-card__status--${item.status || 'vacant'}`}>
                {t(STATUS_LABELS[item.status || ''] || 'prop.unknown')}
              </Text>
            </View>

            <View className='ap-card__body'>
              <Text className='ap-card__name'>
                {item.room_number || item.address || t('prop.unnamed')}
              </Text>
              <View className='ap-card__addr'>
                <Text className='icon-svg icon-svg--sm' style={iconStyle('home', 26)} />
                <Text className='ap-card__addr-text'>{item.address || t('prop.noAddress')}</Text>
              </View>
              <View className='ap-card__meta'>
                {item.size_sqm != null && (
                  <Text className='ap-card__meta-item'>{item.size_sqm}㎡</Text>
                )}
                {item.bedrooms != null && (
                  <Text className='ap-card__meta-item'>{t('prop.bedroomUnit', { n: item.bedrooms })}</Text>
                )}
                {item.bathrooms != null && (
                  <Text className='ap-card__meta-item'>{t('prop.bathroomUnit', { n: item.bathrooms })}</Text>
                )}
              </View>
              <View className='ap-card__price-row'>
                <Text className='ap-card__price'>
                  {fmtRent(item.monthly_rent, item.currency)}
                  <Text className='ap-card__price-unit'>{t('pub.perMonth')}</Text>
                </Text>
              </View>
            </View>

            <View className='ap-card__footer'>
              <View
                className='ap-card__list'
                hoverClass='ap-card__btn--hover'
                onClick={(e) => {
                  e.stopPropagation()
                  publishProperty(item)
                }}
              >
                <Text className='ap-card__list-text'>{t('listing.actionList')}</Text>
              </View>
              <View
                className='ap-card__manage'
                onClick={(e) => {
                  e.stopPropagation()
                  openDetail(item)
                }}
              >
                <Text className='ap-card__manage-text'>{t('prop.manage')}</Text>
              </View>
              <View
                className='ap-card__del'
                onClick={(e) => {
                  e.stopPropagation()
                  removeProperty(item)
                }}
              >
                <Text className='icon-svg icon-svg--sm' style={iconStyle('close', 28)} />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 底部导航：房源 */}
      <BottomNav role='admin' active='properties' />
    </View>
  )
}