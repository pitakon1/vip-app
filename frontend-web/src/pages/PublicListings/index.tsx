import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Dropdown,
  Popover,
  Spin,
} from 'antd'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import GoogleMapView, { type MapMarker } from '@/components/GoogleMap'
import { METRO_LINES } from '@/data/locationMetro'
import { useLocationStore, findCityByKey } from '@/stores/location'
import brandLogo from '@/assets/haofang-logo.jpg'
import './public-listings.css'


// ==================== 常量（对齐原型 tenant-property-browse.html）====================

const PAGE_SIZE = 10

// 后端 PropertyStatus 枚举取值（不含前端展示用的 `reserved`）。
// 直接下发非法枚举会让接口 422，整个列表变空，故先做白名单校验。
const BACKEND_STATUS = new Set(['vacant', 'rented', 'renewing', 'maintenance'])

// 卡片 banner 主题色（使用设计令牌 CSS 变量）
const BANNER_COLORS = [
  'var(--rent-primary)',
  'var(--state-info)',
  'var(--state-success)',
  'var(--state-purple)',
  'var(--state-warning)',
  'var(--state-error)',
]
const bannerColorFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  return BANNER_COLORS[h % BANNER_COLORS.length]
}

// 状态标签样式类（对应 CSS modifier 类）
const STATUS_CLASS: Record<string, string> = {
  vacant: 'rent-status-tag--vacant',
  rented: 'rent-status-tag--rented',
  reserved: 'rent-status-tag--reserved',
  maintenance: 'rent-status-tag--maintenance',
}

// 户型类型图标（lucide 路径，对齐原型 type-badge）
const TYPE_ICON_PATH = (pt: string): string => {
  switch (pt) {
    case 'villa':
    case 'house':
      return 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
    case 'shop':
    case 'commercial':
      return 'M3 9l1-5h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M9 21v-6h6v6'
    case 'office':
      return 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20'
    default: // apartment / condo
      return 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4'
  }
}

// 买卖挂牌总价（币种随挂牌；MYR 与公共模块 RM 键对齐）
const formatTotal = (v: any, currency?: string) => formatMoney(Number(v || 0), currency === 'MYR' ? 'RM' : currency)

// 业务 Tab（整租 / 合租 / 买房）
// - 买房：数据源为真实在售挂牌 /sale-listings（按 property_id 关联房源）
// - 合租：房源表没有整租/合租字段，无法真实区分 → 空态，不做伪分类

// 按区域 / 按地铁找房（对齐贝壳「区域 | 地铁」下拉面板）

// 区域数据集中于 src/data/locationArea.ts 与 locationMetro.ts
// 接口 DistrictNode / CityGroup 亦在数据文件中定义

// 轨交数据集中在 src/data/locationMetro.ts（METRO_LINES），上方已 import
// 接口 MetroStation / MetroLine 亦在数据文件中定义

// ==================== 组件 ====================

const PublicListings = ({ compact }: { compact?: boolean }) => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token, user } = useAuthStore()

  // 「视频看房」入口：首页/顶栏的导航项带 ?video=1 进来，只筛有视频的房源
  const [searchParams, setSearchParams] = useSearchParams()
  const videoOnly = searchParams.get('video') === '1'
  const toggleVideoOnly = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    if (next.get('video') === '1') next.delete('video')
    else next.set('video', '1')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // 数据：统一走 /public/listings（匿名可访问），租/售由 listing_type 区分。
  // 不再单独拉一份「在售挂牌」再与房源做前端 join——那是本地拼接，
  // 一旦分页下推就必然算错。

  // 筛选
  const [keyword, setKeyword] = useState('')
  const [roomType, setRoomType] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [customMin, setCustomMin] = useState('') // 自定义最低价（THB）
  const [customMax, setCustomMax] = useState('') // 自定义最高价（THB）
  const [priceOpen, setPriceOpen] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [areaCustomMin, setAreaCustomMin] = useState('') // 自定义最低面积（㎡）
  const [areaCustomMax, setAreaCustomMax] = useState('') // 自定义最高面积（㎡）
  const [statusSel, setStatusSel] = useState('')
  const [areaRange, setAreaRange] = useState('')
  // 「更多」面板新增维度：朝向 / 楼层 / 装修 / 配套（服务端筛选）
  const [orientationSel, setOrientationSel] = useState('')
  const [floorLevelSel, setFloorLevelSel] = useState('')
  const [decorSel, setDecorSel] = useState('')
  const [amenitySel, setAmenitySel] = useState<string[]>([])
  const [sort, setSort] = useState('default')
  const [biz, setBiz] = useState('rent')

  // 按区域 / 按地铁找房面板状态（对齐贝壳「区域 | 地铁」）
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area')
  const [locOpen, setLocOpen] = useState(false)                        // 面板开合
  const [districtSel, setDistrictSel] = useState<string | null>(null) // 已选城区 key
  const [metroSel, setMetroSel] = useState<string[]>([])              // 已选站点 name（已确认）
  const [metroDraft, setMetroDraft] = useState<string[]>([])          // 站点多选草稿（确定后提交）
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key)
  // 区域面板：定位城市在顶栏左上角「国家→城市」选择；找房页只列当前城市的 区/街道（链家样式），无国家/省市下钻
  const citySel = useLocationStore((s) => s.selection)
  const city = useMemo(() => findCityByKey(citySel.cityKey), [citySel.cityKey])
  const cityDistricts = city?.children ?? []
  // 地铁仅列当前定位城市的线路
  const cityMetroLines = useMemo(
    () => METRO_LINES.filter((l) => l.cityKey === citySel.cityKey),
    [citySel.cityKey],
  )
  const [view, setView] = useState('grid')
  const [mapOn, setMapOn] = useState(false)
  const [page, setPage] = useState(1)

  // 「按学校找房」筛选：选一所学校 + 半径，看它周边有哪些房源。
  // 这是空间筛选（后端算 haversine 距离），不是「学区房」布尔标签——
  // 泰国没有划片入学，国际学校是「付费 + 距离」逻辑，做标签无据可依。
  const schoolRadiusOptions = useMemo(() => [1, 3, 5, 10], [])
  const [schoolId, setSchoolId] = useState('')
  const [schoolKm, setSchoolKm] = useState(3)
  const [schoolOpen, setSchoolOpen] = useState(false)
  const [schoolKw, setSchoolKw] = useState('')
  const [schools, setSchools] = useState<any[]>([])

  // 「小区」筛选已移除：小区维度改由顶部搜索框承接（后端 q 已 OR 匹配小区名），
  // 少一个筛选入口，也避免与「区域」两个空间维度互相打架。

  // 选项
  const statusLabelMap = useMemo<Record<string, string>>(() => ({
    vacant: t('propertyStatus.vacant'),
    rented: t('propertyStatus.rented'),
    reserved: t('propertyStatus.reserved'),
    maintenance: t('propertyStatus.maintenance'),
  }), [t])

  const propertyTypeMap = useMemo<Record<string, string>>(() => ({
    apartment: t('propertyType.apartment'),
    condo: t('propertyType.condo'),
    villa: t('propertyType.villa'),
    house: t('propertyType.house'),
    shop: t('propertyType.shop'),
    commercial: t('propertyType.commercial'),
    office: t('propertyType.office'),
  }), [t])

  // 已选区域/地铁的展示文案（chip 标题，对齐贝壳：未选=「区域」，已选=具体城区/站点）
  const distNode = (key: string) => cityDistricts.find((d) => d.key === key)
  const activeLocationKw = useMemo<string[]>(() => {
    if (districtSel) {
      const node = distNode(districtSel)
      return node ? node.kws : []
    }
    if (metroSel.length) {
      const lines = cityMetroLines.flatMap((l) => l.stations)
      return lines.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws)
    }
    return []
  }, [districtSel, metroSel, cityDistricts, cityMetroLines])

  const regionLabel = useMemo(() => {
    if (districtSel) {
      const node = distNode(districtSel)
      return node ? node.label : t('locate.area')
    }
    if (metroSel.length) {
      const first = metroSel[0]
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first
    }
    return t('locate.area')
  }, [districtSel, metroSel, cityDistricts, t])

  const activeLine = useMemo(
    () => cityMetroLines.find((l) => l.key === metroLine),
    [cityMetroLines, metroLine],
  )

  // 全局城市作用域：当前定位城市下，房源必须命中该城任一城区关键词（链家式「定位城市看房」）
  const globalCityKw = useMemo(
    () => (city ? city.children.flatMap((d) => d.kws) : []),
    [city],
  )

  // ---------- 区域 / 地铁面板交互（对齐贝壳） ----------
  // 区域=实时单选：点击城区立即生效，城区与地铁互斥
  const applyDistrict = (key: string | null) => {
    if (districtSel === key) { setDistrictSel(null); return }
    setDistrictSel(key)
    setMetroSel([])
    setMetroDraft([])
  }
  const resetLoc = () => { setDistrictSel(null); setMetroSel([]); setMetroDraft([]) }

  // 地铁=草稿多选：跨线路累计，确定后提交；打开面板时以已选初始化草稿
  const onLocOpenChange = (open: boolean) => {
    if (open) setMetroDraft(metroSel)
    setLocOpen(open)
  }
  const toggleStation = (name: string) => {
    setMetroDraft((d) => (d.includes(name) ? d.filter((s) => s !== name) : [...d, name]))
  }
  const confirmMetro = () => {
    setMetroSel(metroDraft)
    if (metroDraft.length) setDistrictSel(null)
    setLocOpen(false)
  }
  // 地铁=重置：同时清空草稿与已确认选择，回退已应用的筛选
  const clearMetroDraft = () => { setMetroDraft([]); setMetroSel([]) }

  const roomTypeOptions = useMemo(() => [
    { value: '', label: t('property.allRoomTypes') },
    { value: '1', label: t('roomType.r1') },
    { value: '2', label: t('roomType.r2') },
    { value: '3', label: t('roomType.r3') },
    { value: '4', label: t('roomType.r4') },
  ], [t])

  const priceOptions = useMemo(() => [
    { value: '', label: t('property.allPrices') },
    { value: '0-5000', label: t('priceRange.below5k') },
    { value: '5000-10000', label: t('priceRange.r5k10k') },
    { value: '10000-20000', label: t('priceRange.r10k20k') },
    { value: '20000-50000', label: t('priceRange.r20k50k') },
    { value: '50000-99999999', label: t('priceRange.above50k') },
  ], [t])

  const areaOptions = useMemo(() => [
    { value: '', label: t('property.allAreas') },
    { value: '0-50', label: t('areaRange.below50') },
    { value: '50-100', label: t('areaRange.r50to100') },
    { value: '100-200', label: t('areaRange.r100to200') },
    { value: '200-999999', label: t('areaRange.above200') },
  ], [t])

  const sortItems = useMemo(() => [
    { value: 'default', label: t('property.defaultSort') },
    { value: 'latest', label: t('property.latest') },
    { value: 'price_asc', label: t('property.priceAsc') },
    { value: 'price_desc', label: t('property.priceDesc') },
    { value: 'area_desc', label: t('property.areaDesc') },
  ], [t])

  const bizTabs = useMemo(() => [
    { value: 'rent', label: t('browse.bizRent') },
    { value: 'share', label: t('browse.bizShare') },
    { value: 'sale', label: t('browse.buy') },
  ], [t])

  // 关键词输入防抖：避免每敲一个字就打一次后端
  const [debouncedKw, setDebouncedKw] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKw(keyword), 300)
    return () => clearTimeout(timer)
  }, [keyword])

  // 学校候选集：给「按学校找房」筛选器用。走公开接口，匿名可读。
  // 拉不到就没有这个筛选项——宁可少一个筛选，也不给一个点了没结果的空壳。
  useEffect(() => {
    let cancelled = false
    api
      .get('/public/schools', { params: { page_size: 100 } })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        const items = payload?.items ?? []
        if (!cancelled) setSchools(Array.isArray(items) ? items : [])
      })
      .catch(() => { if (!cancelled) setSchools([]) })
    return () => { cancelled = true }
  }, [])

  // 小区候选集已不再需要：小区筛选已移除，小区名走顶部搜索框（后端 q 参数）匹配。

  const selectedSchool = useMemo(
    () => schools.find((s) => String(s.id) === schoolId),
    [schools, schoolId],
  )

  // 学校多了以后，列表里直接找太费劲，面板内给一个即时过滤（纯本地，不发请求）
  const filteredSchools = useMemo(() => {
    const kw = schoolKw.trim().toLowerCase()
    if (!kw) return schools
    return schools.filter((s) =>
      [s.name, s.name_en, s.district, s.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw)),
    )
  }, [schools, schoolKw])

  // 服务端查询参数：关键词 / 区域同义词 / 价格 / 面积 / 户型 / 状态 / 学校 / 排序
  // 一律下推到后端，并且**分页也下推**。
  //
  // 为什么必须下推：后端 PaginationParams 把 page_size 顶在 100，
  // 前端再传 999 也只回 100 条——「本地切片 + 本地算总数」在这种约束下
  // 会给出一个假的总数，且第 100 条之后的房源永远翻不到。
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      page,
      page_size: PAGE_SIZE,
      // 买房看真实在售挂牌、租房看在租房源；合租无对应字段，走空态不走接口
      listing_type: biz === 'sale' ? 'sell' : 'rent',
    }
    const kw = debouncedKw.trim()
    if (kw) params.q = kw
    // 区域/地铁是多关键词同义词，命中任一即算；
    // 城市作用域：已选区/街道→用该区关键词（已属当前城市）；「不限」→用当前城市全部城区关键词，实现链家式「定位城市看房」
    const locScopedKw = activeLocationKw.length ? activeLocationKw : globalCityKw
    if (locScopedKw.length) params.keywords = locScopedKw
    if (statusSel && BACKEND_STATUS.has(statusSel)) params.status = statusSel
    // 按学校找房：空间筛选（学校半径内的房源），不是标签筛选
    if (schoolId) {
      params.school_id = schoolId
      params.school_radius_km = schoolKm
    }
    // 未显式排序时，按学校找房天然应按距离由近到远
    if (sort !== 'default') params.sort = sort
    else if (schoolId) params.sort = 'distance'
    // 视频看房入口：只返回有 video_url 的房源
    if (videoOnly) params.has_video = true
    // 价格：预设快捷区间优先，其次自定义最低/最高（上限取「无上限」哨兵值时不下发）
    if (priceRange) {
      const [mn, mx] = priceRange.split('-').map(Number)
      if (!Number.isNaN(mn)) params.price_min = mn
      if (!Number.isNaN(mx) && mx < 99999999) params.price_max = mx
    } else {
      if (customMin) params.price_min = Number(customMin)
      if (customMax) params.price_max = Number(customMax)
    }
    // 面积
    if (areaRange) {
      const [mn, mx] = areaRange.split('-').map(Number)
      if (!Number.isNaN(mn)) params.area_min = mn
      if (!Number.isNaN(mx) && mx < 999999) params.area_max = mx
    } else {
      if (areaCustomMin) params.area_min = Number(areaCustomMin)
      if (areaCustomMax) params.area_max = Number(areaCustomMax)
    }
    // 户型：4 表示「4 室及以上」
    if (roomType) {
      const n = Number(roomType)
      params.bedrooms_min = n
      if (n < 4) params.bedrooms_max = n
    }
    // 更多面板：朝向 / 装修（精确匹配）、楼层段、配套设施（多选任一命中）
    if (orientationSel) params.orientation = orientationSel
    if (decorSel) params.decoration = decorSel
    if (floorLevelSel) params.floor_level = floorLevelSel
    if (amenitySel.length) params.amenity = amenitySel
    return params
  }, [page, biz, debouncedKw, activeLocationKw, statusSel, sort, videoOnly, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax, roomType, schoolId, schoolKm, orientationSel, floorLevelSel, decorSel, amenitySel])

  // 数据获取（公开接口，不需要 auth）：queryKey 含当前页与筛选参数，
  // 缓存优先渲染 + 后台刷新；总数以服务端返回的 total 为准。
  const listQueryKey = useMemo(() => ['public-listings', JSON.stringify(queryParams)], [queryParams])
  const listQ = useCachedQuery<{ items: any[]; total: number }>({
    queryKey: listQueryKey,
    cacheKey: `public-listings:${JSON.stringify(queryParams)}`,
    queryFn: async () => {
      // 合租：房源表没有整租/合租字段，无法真实区分 → 诚实空态，不发请求伪造成果
      if (biz === 'share') return { items: [], total: 0 }
      try {
        // 走公开接口：原来打 /properties（强制鉴权），匿名访问必然 401，
        // 于是列表页对未登录访客始终是空的——等于墙建在接口层。
        const res = await api.get('/public/listings', { params: { ...queryParams } })
        const payload = res.data?.data ?? res.data
        const items = payload?.items ?? []
        return {
          items: Array.isArray(items) ? items : [],
          total: Number(payload?.total ?? 0),
        }
      } catch {
        return { items: [], total: 0 }
      }
    },
  })
  const pagedItems = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const loading = listQ.isPending && !listQ.data

  // ---------- 地图找房（Google Maps：搜索 / 路线 / 定位） ----------
  // 房源坐标来自所属项目（projects.lat/lng），项目未维护坐标的房源不在地图上出现。
  const [mapPoints, setMapPoints] = useState<any[]>([])
  const [mapLoading, setMapLoading] = useState(false)

  // 地图与列表共用同一套筛选（仅取地图接口支持的参数）
  const mapParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: 300 }
    ;(['q', 'keywords', 'price_min', 'price_max', 'has_video'] as const).forEach((k) => {
      if (queryParams[k] !== undefined) params[k] = queryParams[k]
    })
    return params
  }, [queryParams])

  // 地图点位名称（点位来自 /properties/map-points，带 project_name）
  const mapPointName = (p: any): string =>
    p.project_name ? `${p.project_name} · ${p.room_number || ''}` : (p.address || p.room_number || '—')

  const fetchMapPoints = useCallback(async () => {
    setMapLoading(true)
    try {
      // /properties/map-points 强制鉴权，匿名点「地图找房」必然 401，
      // 这是「浏览不需注册」在接口层漏掉的一处，改走公开点位接口。
      const res = await api.get('/public/map-points', { params: mapParams })
      setMapPoints(Array.isArray(res.data) ? res.data : [])
    } catch {
      setMapPoints([])
    } finally {
      setMapLoading(false)
    }
  }, [mapParams])

  useEffect(() => { if (mapOn) fetchMapPoints() }, [mapOn, fetchMapPoints])

  // 透传给 GoogleMap 组件的标注点（坐标转数字）
  const mapMarkers = useMemo<MapMarker[]>(
    () =>
      mapPoints
        .filter((p) => !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng)))
        .map((p) => ({ id: p.id, lat: Number(p.lat), lng: Number(p.lng), title: mapPointName(p) })),
    [mapPoints],
  )

  // 地图视图默认中心（曼谷）
  const GOOGLE_MAP_CENTER = useMemo(() => ({ lat: 13.7563, lng: 100.5018 }), [])

  // 排序与业务 Tab 都已在 queryParams 里下推给后端。
  // 这里不再做第二遍本地过滤——本地过滤只会作用于「当前这一页」，
  // 与分页叠加后结果必然错位（第 2 页筛出 3 条，总数却是全量）。

  // 筛选变化 → 回到第 1 页（否则会停在一个不存在的页码上，白屏）
  useEffect(() => { setPage(1) }, [keyword, districtSel, metroSel, activeLocationKw, globalCityKw, roomType, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax, statusSel, sort, biz, videoOnly, debouncedKw, schoolId, schoolKm])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // 分页页码（首尾 + 当前 ±1，中间省略号）
  const pageNumbers = useMemo(() => {
    const pages = new Set<number>([1, pageCount])
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) pages.add(i)
    return Array.from(pages).sort((a, b) => a - b)
  }, [page, pageCount])

  // 下拉 chips 转 antd menu items（key 用 'all' 表示清除）
  const toMenuItems = (options: { value: string; label: string }[]) =>
    options.map((o) => ({ key: o.value || 'all', label: o.label }))

  const handleCardClick = (item: any) => {
    // 浏览全开放：匿名与登录用户统一进 C 端公开详情页。
    // 此前未登录会直接被弹到登录页，等于把列表页的出口堵死；
    // 登录用户要看自己的租约 / 账单走门户菜单，不在这里按角色分流。
    navigate(`/listing/${item.id}`)
  }

  // 区域/地铁面板图标
  const LocIcon = ({ kind }: { kind: 'area' | 'metro' }) => (
    kind === 'area'
      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="12" rx="2" /><path d="M9 8h6M6 21l1.5-3h9L18 21M8 9v2M12 9v2M16 9v2" /></svg>
  )

  // 「区域 | 地铁」下拉面板（对齐贝壳交互）
  const locPanelContent = (
    <div className="rent-loc-panel">
      <div className="rent-loc-panel__tabs">
        {(['area', 'metro'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rent-loc-panel__tab ${locTab === tab ? 'rent-loc-panel__tab--active' : ''}`}
            onClick={() => setLocTab(tab)}
          >
            <LocIcon kind={tab} />
            {tab === 'area' ? t('locate.area') : t('locate.metro')}
          </button>
        ))}
      </div>

      {locTab === 'area' ? (
        // 链家样式：只列当前定位城市的 区/街道 chips（国家·城市在顶栏左上角定位器选择）
        <div className="rent-loc-panel__area rent-loc-panel__area--flat">
          <div className="rent-loc-panel__stations-title">{citySel.cityLabel} · 区/街道</div>
          <div className="rent-loc-panel__chips">
            <button
              type="button"
              className={`rent-loc-panel__chip ${districtSel === null ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => applyDistrict(null)}
            >
              {t('locate.all')}
            </button>
            {cityDistricts.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`rent-loc-panel__chip ${districtSel === d.key ? 'rent-loc-panel__chip--active' : ''}`}
                onClick={() => applyDistrict(d.key)}
              >
                {d.label}
              </button>
            ))}
            {!cityDistricts.length && (
              <span className="rent-loc-panel__empty">{t('common.noData')}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="rent-loc-panel__metro">
          <div className="rent-loc-panel__lines">
            {cityMetroLines.map((l) => (
              <button
                key={l.key}
                type="button"
                className={`rent-loc-panel__line ${metroLine === l.key ? 'rent-loc-panel__line--active' : ''}`}
                onClick={() => setMetroLine(l.key)}
              >
                {l.cityLabel} · {l.name}
              </button>
            ))}
          </div>
          <div className="rent-loc-panel__stations">
            <div className="rent-loc-panel__stations-title">{activeLine ? `${activeLine.cityLabel} · ${activeLine.name}` : ''}</div>
            <div className="rent-loc-panel__chips">
              {activeLine?.stations.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={`rent-loc-panel__chip ${metroDraft.includes(s.name) ? 'rent-loc-panel__chip--active' : ''}`}
                  onClick={() => toggleStation(s.name)}
                >
                  {s.name}
                </button>
              ))}
              {activeLine && !activeLine.stations.length && <span className="rent-loc-panel__empty">{t('common.noData')}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="rent-loc-panel__footer">
        {locTab === 'metro' && (
          <span className="rent-loc-panel__count">
            {t('locate.selectedCount')} <strong>{metroDraft.length}</strong>
          </span>
        )}
        <div className="rent-loc-panel__actions">
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
            onClick={() => (locTab === 'metro' ? clearMetroDraft() : resetLoc())}
          >
            {t('common.reset')}
          </button>
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--primary"
            onClick={() => (locTab === 'metro' ? confirmMetro() : setLocOpen(false))}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  // 「价格」弹层（对齐贝壳：快捷区间 chips + 自定义最低/最高 + 重置/确定）
  const priceActive = !!(priceRange || customMin || customMax)
  const priceLabel = (() => {
    if (priceRange) return priceOptions.find((o) => o.value === priceRange)?.label || t('browse.filterPrice')
    if (customMin || customMax) return t('priceRange.custom')
    return t('browse.filterPrice')
  })()
  const applyPricePreset = (key: string) => {
    if (key === 'all') { setPriceRange(''); setCustomMin(''); setCustomMax(''); return }
    setPriceRange(key)
    setCustomMin('')
    setCustomMax('')
  }
  const resetPrice = () => { setPriceRange(''); setCustomMin(''); setCustomMax('') }

  const pricePanelContent = (
    <div className="rent-loc-panel rent-price-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group">
          <div className="rent-loc-panel__group-title">{t('priceRange.quick')}</div>
          <div className="rent-loc-panel__chips">
            <button
              type="button"
              className={`rent-loc-panel__chip ${!priceRange ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => applyPricePreset('all')}
            >
              {t('priceRange.all')}
            </button>
            {priceOptions.filter((o) => o.value).map((o) => (
              <button
                key={o.value}
                type="button"
                className={`rent-loc-panel__chip ${priceRange === o.value ? 'rent-loc-panel__chip--active' : ''}`}
                onClick={() => applyPricePreset(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rent-loc-panel__group">
          <div className="rent-loc-panel__group-title">{t('priceRange.custom')}</div>
          <div className="rent-price-custom">
            <span className="rent-price-custom__cur">฿</span>
            <input
              className="rent-price-custom__input"
              type="number"
              min={0}
              value={customMin}
              placeholder={t('priceRange.minPlaceholder')}
              onChange={(e) => { const v = e.target.value; if (v) setPriceRange(''); setCustomMin(v.replace(/[^\d]/g, '')) }}
            />
            <span className="rent-price-custom__divider">{t('priceRange.to')}</span>
            <span className="rent-price-custom__cur">฿</span>
            <input
              className="rent-price-custom__input"
              type="number"
              min={0}
              value={customMax}
              placeholder={t('priceRange.maxPlaceholder')}
              onChange={(e) => { const v = e.target.value; if (v) setPriceRange(''); setCustomMax(v.replace(/[^\d]/g, '')) }}
            />
            <span className="rent-price-custom__unit">{t('priceRange.perMonth')}</span>
          </div>
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={resetPrice}>
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={() => setPriceOpen(false)}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  // 「户型 / 状态」共用的单选弹层：快捷 chips + 重置/确定
  const renderSinglePanel = (
    title: string,
    options: { value: string; label: string }[],
    activeKey: string,
    onPick: (v: string) => void,
    onClose: () => void,
  ) => (
    <div className="rent-loc-panel rent-quick-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group-title">{title}</div>
        <div className="rent-loc-panel__chips">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${activeKey === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => onPick(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={() => onPick('')}>
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={onClose}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  const statusOptions = [
    { value: '', label: t('priceRange.all') }, // 不限
    { value: 'vacant', label: statusLabelMap.vacant },
    { value: 'rented', label: statusLabelMap.rented },
    { value: 'reserved', label: statusLabelMap.reserved },
    { value: 'maintenance', label: statusLabelMap.maintenance },
  ]
  // 更多面板新增维度（东南亚口径，与 App / 小程序一致；无供暖——东南亚无冬季）
  const orientationOptions = [
    { value: '', label: '不限' },
    { value: 'north', label: '北' },
    { value: 'south', label: '南' },
    { value: 'east', label: '东' },
    { value: 'west', label: '西' },
    { value: 'northeast', label: '东北' },
    { value: 'northwest', label: '西北' },
    { value: 'southeast', label: '东南' },
    { value: 'southwest', label: '西南' },
  ]
  const floorLevelOptions = [
    { value: '', label: '不限' },
    { value: 'low', label: '低楼层(1-5层)' },
    { value: 'mid', label: '中楼层(6-15层)' },
    { value: 'high', label: '高楼层(16层+)' },
  ]
  const decorationOptions = [
    { value: '', label: '不限' },
    { value: 'bare', label: '毛坯' },
    { value: 'simple', label: '简装' },
    { value: 'standard', label: '精装' },
    { value: 'luxury', label: '豪装' },
    { value: 'fully_furnished', label: '带家具家电' },
  ]
  const amenityOptions = [
    { value: 'aircon', label: '空调' },
    { value: 'pool', label: '泳池' },
    { value: 'gym', label: '健身房' },
    { value: 'parking', label: '停车位' },
    { value: 'elevator', label: '电梯' },
    { value: 'balcony', label: '阳台' },
    { value: 'garden', label: '花园/庭院' },
  ]
  const applyAreaPreset = (key: string) => {
    if (key === 'all') { setAreaRange(''); setAreaCustomMin(''); setAreaCustomMax(''); return }
    setAreaRange(key)
    setAreaCustomMin('')
    setAreaCustomMax('')
  }

  // 「更多」合并面板（对齐贝壳：面积 快捷区间+自定义 + 朝向/楼层/装修/配套 + 房源状态 + 重置/确定）
  const moreActive = !!(areaRange || areaCustomMin || areaCustomMax || statusSel || orientationSel || floorLevelSel || decorSel || amenitySel.length)
  const moreLabel = (() => {
    const parts: string[] = []
    if (areaRange || areaCustomMin || areaCustomMax) {
      parts.push(areaRange ? (areaOptions.find((o) => o.value === areaRange)?.label || t('priceRange.custom')) : t('priceRange.custom'))
    }
    if (statusSel) parts.push(statusLabelMap[statusSel] || statusSel)
    if (orientationSel) parts.push(orientationOptions.find((o) => o.value === orientationSel)?.label || orientationSel)
    if (floorLevelSel) parts.push(floorLevelOptions.find((o) => o.value === floorLevelSel)?.label || floorLevelSel)
    if (decorSel) parts.push(decorationOptions.find((o) => o.value === decorSel)?.label || decorSel)
    if (amenitySel.length) parts.push(amenitySel.map((a) => amenityOptions.find((o) => o.value === a)?.label || a).join('/'))
    return parts.length ? parts.join(' · ') : t('browse.filterMore')
  })()
  const resetMore = () => { setAreaRange(''); setAreaCustomMin(''); setAreaCustomMax(''); setStatusSel(''); setOrientationSel(''); setFloorLevelSel(''); setDecorSel(''); setAmenitySel([]) }

  const morePanelContent = (
    <div className="rent-loc-panel rent-price-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group-title">朝向</div>
        <div className="rent-loc-panel__chips">
          {orientationOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${orientationSel === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setOrientationSel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">楼层</div>
        <div className="rent-loc-panel__chips">
          {floorLevelOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${floorLevelSel === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setFloorLevelSel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('browse.filterArea')}</div>
        <div className="rent-loc-panel__chips">
          {areaOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${(o.value ? areaRange === o.value : !areaRange && !areaCustomMin && !areaCustomMax) ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => (o.value ? applyAreaPreset(o.value) : (setAreaRange(''), setAreaCustomMin(''), setAreaCustomMax('')))}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('priceRange.custom')}</div>
        <div className="rent-price-custom">
          <input
            className="rent-price-custom__input"
            type="number"
            min={0}
            value={areaCustomMin}
            placeholder={t('areaRange.minPlaceholder')}
            onChange={(e) => { const v = e.target.value; if (v) setAreaRange(''); setAreaCustomMin(v.replace(/[^\d]/g, '')) }}
          />
          <span className="rent-price-custom__divider">{t('priceRange.to')}</span>
          <input
            className="rent-price-custom__input"
            type="number"
            min={0}
            value={areaCustomMax}
            placeholder={t('areaRange.maxPlaceholder')}
            onChange={(e) => { const v = e.target.value; if (v) setAreaRange(''); setAreaCustomMax(v.replace(/[^\d]/g, '')) }}
          />
          <span className="rent-price-custom__unit">{t('areaRange.unit')}</span>
        </div>
        <div className="rent-loc-panel__group-title">装修</div>
        <div className="rent-loc-panel__chips">
          {decorationOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${decorSel === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setDecorSel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">配套设施</div>
        <div className="rent-loc-panel__chips">
          {amenityOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${amenitySel.includes(o.value) ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() =>
                setAmenitySel((cur) =>
                  cur.includes(o.value) ? cur.filter((k) => k !== o.value) : [...cur, o.value],
                )
              }
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('browse.filterStatus')}</div>
        <div className="rent-loc-panel__chips">
          {statusOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${statusSel === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setStatusSel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={resetMore}>
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={() => setMoreOpen(false)}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  // 「学校」弹层：选一所学校 + 半径，只看它周边的房源。
  // 这是空间筛选（后端按 haversine 算真实距离），不是「学区房」布尔标签——
  // 泰国没有划片入学，国际学校是「付费 + 距离」逻辑，硬贴标签无据可依。
  const schoolActive = !!schoolId
  const schoolPanelContent = (
    <div className="rent-loc-panel rent-school-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group-title">{t('publicSite.schoolFilterHint')}</div>
        <input
          className="rent-price-custom__input"
          style={{ width: '100%', marginBottom: 10 }}
          value={schoolKw}
          onChange={(e) => setSchoolKw(e.target.value)}
          placeholder={t('publicSite.schoolSearchPlaceholder')}
        />
        <div className="rent-loc-panel__schools">
          <button
            type="button"
            className={`rent-loc-panel__chip ${!schoolId ? 'rent-loc-panel__chip--active' : ''}`}
            onClick={() => setSchoolId('')}
          >
            {t('publicSite.schoolFilterAny')}
          </button>
          {filteredSchools.map((s: any) => (
            <button
              key={s.id}
              type="button"
              className={`rent-loc-panel__chip ${String(s.id) === schoolId ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setSchoolId(String(s.id))}
            >
              {s.name}
            </button>
          ))}
        </div>
        {!filteredSchools.length && <div className="rent-loc-panel__empty">{t('publicSite.schoolFilterEmpty')}</div>}

        {schoolId && (
          <>
            <div className="rent-loc-panel__group-title" style={{ marginTop: 16 }}>
              {t('publicSite.schoolFilterRadius')}
            </div>
            <div className="rent-loc-panel__chips">
              {schoolRadiusOptions.map((km) => (
                <button
                  key={km}
                  type="button"
                  className={`rent-loc-panel__chip ${schoolKm === km ? 'rent-loc-panel__chip--active' : ''}`}
                  onClick={() => setSchoolKm(km)}
                >
                  {km} {t('publicSite.km')}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
            onClick={() => { setSchoolId(''); setSchoolKm(3); setSchoolKw('') }}
          >
            {t('common.reset')}
          </button>
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--primary"
            onClick={() => setSchoolOpen(false)}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  const enterSystem = useCallback(() => {
    if (!token) { navigate('/login'); return }
    const role = user?.role
    switch (role) {
      case 'owner': navigate('/owner/dashboard'); break
      case 'tenant': navigate('/tenant/dashboard'); break
      case 'employee': navigate('/employee/dashboard'); break
      default: navigate('/dashboard')
    }
  }, [token, user, navigate])

  const searchTags = [t('browse.nearMetro'), t('browse.furnished'), t('browse.moveIn'), t('browse.seaView'), t('browse.nearMall')]

  // 房源卡片（对齐原型 rent-prop-search-card）
  const renderCard = (item: any) => {
    // 公开接口的字段口径：项目名在 project_name，价格为统一后的 price
    // （租=月租、售=挂牌总价），不再需要前端按业务类型拼字段。
    const projectName = item.project_name || item.building || ''
    const title = projectName ? `${projectName} · ${item.room_number || ''}` : (item.address || item.room_number || '—')
    const ptype = propertyTypeMap[item.property_type] || item.property_type || t('propertyType.apartment')
    const ptypeKey = (propertyTypeMap[item.property_type] ? item.property_type : 'apartment') as string
    const statusKey = (item.status || 'vacant').toLowerCase()
    const beds = Number(item.bedrooms || 0)
    const baths = Number(item.bathrooms || 0)
    const size = Number(item.size_sqm || 0)
    const price = Number(item.price || item.monthly_rent || 0)
    const seed = String(item.id || item.room_number || '')
    const cover = typeof item.cover === 'string' ? item.cover : ''

    const tags: { label: string; type: string }[] = []
    if (item.furnished) tags.push({ label: t('browse.furnished'), type: 'primary' })
    tags.push({ label: t('browse.moveIn'), type: 'success' })

    return (
      <div className="rent-prop-search-card" key={item.id} onClick={() => handleCardClick(item)}>
        <div
          className="rent-prop-search-card__banner"
          data-photo={cover ? 'true' : 'false'}
          style={{ background: cover ? undefined : bannerColorFor(seed) }}
        >
          {/* 有实拍图就用图（贝壳式「图在前」），没有才回退到色块 + 户型图标 */}
          {cover ? <img className="rent-prop-search-card__cover" src={cover} alt={title} loading="lazy" /> : null}
          <button
            className="rent-fav-btn"
            aria-label={t('property.followProperty')}
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          {!cover && (
            <svg className="rent-prop-search-card__banner-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={TYPE_ICON_PATH(ptypeKey)} />
            </svg>
          )}
          <span className={`rent-prop-search-card__status-tag ${STATUS_CLASS[statusKey] || 'rent-status-tag--rented'}`}>
            {statusLabelMap[statusKey] || item.status}
          </span>
          {item.video_url && (
            <span className="rent-prop-search-card__video-tag">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="8 5 19 12 8 19" /></svg>
              {t('browse.video')}
            </span>
          )}
          <span className="rent-prop-search-card__type-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={TYPE_ICON_PATH(ptypeKey)} />
            </svg>
            {ptype}
          </span>
        </div>
        <div className="rent-prop-search-card__body">
          <h3 className="rent-prop-search-card__name">{title}</h3>
          <p className="rent-prop-search-card__address">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {item.address || '—'}
          </p>
          {/* 按学校找房时，卡片必须回显「离这所学校多远」——
              否则用户选了学校却看不出筛选生效在哪，等于白筛 */}
          {schoolId && item.nearest_school_name ? (
            <p className="rent-prop-search-card__school">
              {t('publicSite.distanceToSchool', {
                name: item.nearest_school_name,
                km: item.nearest_school_km ?? '-',
              })}
            </p>
          ) : null}
          <div className="rent-prop-search-card__tags">
            {tags.map((tag, i) => (
              <span key={i} className={`rent-badge rent-badge--${tag.type}`}>{tag.label}</span>
            ))}
          </div>
          <div className="rent-prop-search-card__stats">
            <span className="rent-prop-search-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="1" />
              </svg>
              {size}㎡
            </span>
            <span className="rent-prop-search-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
              </svg>
              {beds ? `${beds}${t('browse.statBed')}` : t('roomType.studio')}
            </span>
            <span className="rent-prop-search-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12V6a2 2 0 0 1 2-2h1M9 6.5 6.5 4M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM7 19l-1 2M18 19l1 2" />
              </svg>
              {baths}{t('browse.statBath')}
            </span>
          </div>
          <div className="rent-prop-search-card__foot">
            <div className="rent-prop-search-card__price">
              <span className="rent-prop-search-card__price-value">
                {biz === 'sale' ? formatTotal(price, item.currency) : formatMoney(price, item.currency)}
              </span>
              <span className="rent-prop-search-card__price-unit">
                {biz === 'sale' ? t('browse.saleUnit') : t('property.perMonth')}
              </span>
            </div>
            <button className="rent-prop-search-card__cta" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCardClick(item) }}>
              {t('property.viewDetail')}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={compact ? 'rent-portal rent-portal--compact' : 'rent-portal'}>
      {/* ===== 顶栏（对齐原型 rent-portal__header）——compact 模式由外层 PortalLayout 提供，此处跳过 ===== */}
      {!compact && (
      <header className="rent-portal__header">
        <div className="rent-portal__brand" onClick={() => navigate('/')}>
          <img className="rent-portal__logo" src={brandLogo} alt="HaoFang.World" />
          <span className="rent-portal__name">HaoFang.World</span>
        </div>
        <nav className="rent-portal__nav">
          {/* data-active 必须跟着真实状态走：此前「买房」被写死为高亮，
              即使用户停在「整租」页，顶栏也显示在买房——导航说谎比没有高亮更糟 */}
          <button className="rent-portal__nav-item" data-active={biz === 'rent'} onClick={() => navigate('/')}>{t('browse.rent')}</button>
          <button className="rent-portal__nav-item" data-active={biz === 'sale'} onClick={() => navigate('/listings')}>{t('browse.buy')}</button>
          <button className="rent-portal__nav-item" data-active={mapOn} onClick={() => navigate('/listings')}>{t('browse.mapFind')}</button>
          <button className="rent-portal__nav-item" data-active={videoOnly} onClick={() => navigate('/listings?video=1')}>{t('browse.video')}</button>
        </nav>
        <div className="rent-portal__actions">
          <LanguageSwitcher compact />
          {token ? (
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={enterSystem}>
              {t('home.enterSystem')}
            </button>
          ) : (
            <>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/login')}>
                {t('home.login')}
              </button>
              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => navigate('/register')}>
                {t('register.submit')}
              </button>
            </>
          )}
        </div>
      </header>
      )}

      <main className="rent-portal__main">
        {/* ===== 搜索 Hero（对齐原型 rent-search-hero） ===== */}
        <section className="rent-search-hero">
          <span className="rent-search-hero__decor rent-search-hero__decor--1"></span>
          <span className="rent-search-hero__decor rent-search-hero__decor--2"></span>
          <span className="rent-search-hero__decor rent-search-hero__decor--3"></span>
          <div className="rent-search-hero__inner">
            <h1 className="rent-search-hero__title">{t('browse.findTitle')}</h1>
            <p className="rent-search-hero__subtitle">{t('browse.findSubtitle')}</p>
            <div className="rent-search-hero__bar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder={t('browse.searchPlaceholder')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
              />
              <button className="rent-search-hero__search-btn" onClick={() => setPage(1)}>
                {t('common.search')}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
            <div className="rent-search-hero__tags">
              {searchTags.map((tag) => (
                <a className="rent-search-hero__tag" key={tag} onClick={() => setKeyword(tag)}>{tag}</a>
              ))}
            </div>
          </div>
        </section>

        {/* ===== 筛选栏（对齐原型 rent-filter-bar + rv17-bizbar + chips） ===== */}
        <div className="rent-filter-bar">
          <div className="rv17-bizbar">
            {bizTabs.map((b) => (
              <button
                key={b.value}
                className="rv17-bizbar__item"
                type="button"
                data-active={biz === b.value}
                onClick={() => setBiz(b.value)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="rent-filter-bar__chips">
            <Popover
              trigger="click"
              open={locOpen}
              onOpenChange={onLocOpenChange}
              placement="bottomLeft"
              overlayClassName="rent-loc-popover"
              content={locPanelContent}
            >
              <button
                className={`rent-filter-chip ${activeLocationKw.length ? 'rent-filter-chip--active' : ''}`}
                type="button"
              >
                {regionLabel}
                <span className="rent-filter-chip__chevron">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </button>
            </Popover>
            {/* 小区筛选已移除：小区名走顶部搜索框（后端 q 参数已 OR 匹配小区名） */}
            {/* 按学校找房：学校库有数据才出现这个筛选项 */}
            {schools.length > 0 && (
              <Popover
                trigger="click"
                open={schoolOpen}
                onOpenChange={setSchoolOpen}
                placement="bottomLeft"
                overlayClassName="rent-loc-popover"
                content={schoolPanelContent}
              >
                <button className={`rent-filter-chip ${schoolActive ? 'rent-filter-chip--active' : ''}`} type="button">
                  {selectedSchool ? selectedSchool.name : t('publicSite.filterSchool')}
                  <span className="rent-filter-chip__chevron">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </span>
                </button>
              </Popover>
            )}
            <Popover
              trigger="click"
              open={priceOpen}
              onOpenChange={setPriceOpen}
              placement="bottomLeft"
              overlayClassName="rent-loc-popover"
              content={pricePanelContent}
            >
              <button className={`rent-filter-chip ${priceActive ? 'rent-filter-chip--active' : ''}`} type="button">
                {priceLabel}
                <span className="rent-filter-chip__chevron">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </button>
            </Popover>
            <Popover
              trigger="click"
              open={roomOpen}
              onOpenChange={setRoomOpen}
              placement="bottomLeft"
              overlayClassName="rent-loc-popover"
              content={renderSinglePanel(
                t('browse.filterRoom'),
                roomTypeOptions,
                roomType,
                setRoomType,
                () => setRoomOpen(false),
              )}
            >
              <button className={`rent-filter-chip ${roomType ? 'rent-filter-chip--active' : ''}`} type="button">
                {roomType ? roomTypeOptions.find((o) => o.value === roomType)?.label : t('browse.filterRoom')}
                <span className="rent-filter-chip__chevron">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </button>
            </Popover>
            <Popover
              trigger="click"
              open={moreOpen}
              onOpenChange={setMoreOpen}
              placement="bottomLeft"
              overlayClassName="rent-loc-popover"
              content={morePanelContent}
            >
              <button className={`rent-filter-chip ${moreActive ? 'rent-filter-chip--active' : ''}`} type="button">
                {moreLabel}
                <span className="rent-filter-chip__chevron">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </button>
            </Popover>
            <Dropdown trigger={['click']} placement="bottomLeft" menu={{
              items: toMenuItems(sortItems),
              selectable: true,
              selectedKeys: [sort === 'default' ? 'all' : sort],
              onClick: ({ key }) => setSort(key === 'all' ? 'default' : key),
            }}>
              <button className={`rent-filter-chip ${sort !== 'default' ? 'rent-filter-chip--active' : ''}`} type="button">
                {sort !== 'default' ? sortItems.find((o) => o.value === sort)?.label : t('browse.filterSort')}
                <span className="rent-filter-chip__chevron">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </button>
            </Dropdown>
          </div>
          <div className="rent-filter-bar__right">
            <button className="rv17-map-btn" type="button" data-active={videoOnly} onClick={toggleVideoOnly}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="14" height="14" rx="2" />
                <polygon points="22 7 16 11 16 13 22 17 22 7" />
              </svg>
              {t('browse.video')}
            </button>
            <button className="rv17-map-btn" type="button" data-active={mapOn} onClick={() => setMapOn((v) => !v)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              {t('browse.mapView')}
            </button>
            <div className="rent-view-toggle">
              <button className="rent-view-toggle__btn" data-active={view === 'grid'} onClick={() => setView('grid')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
                {t('browse.viewGrid')}
              </button>
              <button className="rent-view-toggle__btn" data-active={view === 'list'} onClick={() => setView('list')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                {t('browse.viewList')}
              </button>
            </div>
            <span className="rent-filter-bar__count">
              {t('common.total')} <strong>{total}</strong> {t('property.units')}
            </span>
          </div>
        </div>

        {/* ===== 地图模式（Google Maps：搜索 / 路线 / 定位） ===== */}
        <section className="rv17-map" data-active={mapOn}>
          <div style={{
            position: 'absolute',
            bottom: 92,
            right: 12,
            zIndex: 5,
            padding: '4px 12px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.92)',
            fontSize: 11,
            color: 'var(--rent-ink-2, #64748b)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}>
            {t('browse.mapLegend')} · {mapMarkers.length} {t('property.units')}
          </div>
          <div className="rv17-map__canvas">
            {/* 地图按需挂载：`mapOn` 为真才创建 GoogleMapView。
                此前无条件挂载（只靠 CSS data-active 隐藏），意味着每次打开列表页
                都会初始化 Google Maps——没有可用 Key 时会在 mount 阶段抛错并把
                整页拖白。浏览入口不该由一个「可选的」功能决定能不能打开。 */}
            {mapOn && (
              <GoogleMapView
                center={GOOGLE_MAP_CENTER}
                zoom={11}
                markers={mapMarkers}
                onMarkerClick={(m) => {
                  const item = mapPoints.find((p) => String(p.id) === String(m?.id))
                  if (item) handleCardClick(item)
                }}
              />
            )}
          </div>
          {mapLoading && (
            <div className="rv17-map__loading">
              <Spin />
            </div>
          )}
          {!mapLoading && mapMarkers.length === 0 && (
            <div className="rv17-map__empty">{t('browse.mapNoCoord')}</div>
          )}
          <div className="rv17-map__strip">
            {mapPoints.slice(0, 6).map((p: any) => (
              <div key={p.id} className="rv17-map__mini" onClick={() => handleCardClick(p)}>
                <div className="rv17-map__mini-name">{mapPointName(p)}</div>
                <div className="rv17-map__mini-price">{formatMoney(Number(p.monthly_rent || 0))}</div>
                <span className="rv17-map__mini-tag">{p.video_url ? t('browse.video') : (p.project_name || '')}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ===== 房源卡片网格（对齐原型 rent-prop-grid） ===== */}
        <section className="rent-section">
          <Spin spinning={loading} tip={t('common.loading')}>
            {total === 0 && !loading ? (
              <div className="rent-empty">
                {biz === 'share' ? t('browse.shareUnavailable') : t('common.noData')}
              </div>
            ) : (
              <div className="rent-prop-grid">
                {pagedItems.map((item: any) => renderCard(item))}
              </div>
            )}
          </Spin>

          {/* ===== 自定义分页（对齐原型 rent-pagination） ===== */}
          {total > 0 && (
            <div className="rent-pagination">
              <span className="rent-pagination__count">
                {t('common.total')} {total} {t('property.units')}
              </span>
              <div className="rent-pagination__pages">
                <button className="rent-page-btn" type="button" aria-label="上一页" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                {pageNumbers.map((p, i) => {
                  const prev = pageNumbers[i - 1]
                  const gap = !!prev && p - prev > 1
                  return (
                    <Fragment key={p}>
                      {gap && <span className="rent-page-btn rent-page-btn--ellipsis">···</span>}
                      <button className="rent-page-btn" type="button" data-active={page === p} onClick={() => setPage(p)}>{p}</button>
                    </Fragment>
                  )
                })}
                <button className="rent-page-btn" type="button" aria-label="下一页" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ===== 底部 登录/注册 ===== */}
        <section className="rent-cta">
          <div className="rent-cta__inner">
            <div className="rent-cta__text">
              <div className="rent-cta__title">{t('home.ctaTitle')}</div>
              <div className="rent-cta__desc">{t('home.ctaDesc')}</div>
            </div>
            <div className="rent-cta__actions">
              {!token && (
                <button className="rent-btn rent-btn--ghost rent-cta__ghost" onClick={() => navigate('/login')}>
                  {t('home.login')}
                </button>
              )}
              <button className="rent-btn rent-btn--primary rent-btn--lg rent-cta__primary" onClick={token ? enterSystem : () => navigate('/register')}>
                {token ? t('home.enterSystem') : t('register.submit')}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ===== 页脚 ===== */}
      <footer className="rent-footer">
        <div className="rent-footer__inner">
          <div>
            <div className="rent-footer__brand-name">HaoFang.World</div>
            <div className="rent-footer__brand-desc">{t('login.subtagline')}</div>
          </div>
          <div className="rent-footer__col">
            <div className="rent-footer__col-title">{t('home.footerProduct')}</div>
            <a onClick={() => navigate('/listings')}>{t('browse.rent')}</a>
            <a onClick={() => navigate('/listings')}>{t('browse.buy')}</a>
            <a onClick={() => navigate('/listings')}>{t('browse.mapFind')}</a>
            <a onClick={() => navigate('/listings?video=1')}>{t('browse.video')}</a>
          </div>
          <div className="rent-footer__col">
            <div className="rent-footer__col-title">{t('home.footerAbout')}</div>
            <a onClick={() => navigate('/login')}>{t('home.login')}</a>
            <a onClick={() => navigate('/company')}>{t('menu.company')}</a>
          </div>
          <div className="rent-footer__col">
            <div className="rent-footer__col-title">{t('home.footerContact')}</div>
            <a>contact@rentflow.com</a>
            <a>+66 2 123 4567</a>
            <a>Bangkok, Thailand</a>
          </div>
        </div>
        <div className="rent-footer__bottom">
          © {new Date().getFullYear()} HaoFang.World · {t('common.appName')}
        </div>
      </footer>
    </div>
  )
}

export default PublicListings
