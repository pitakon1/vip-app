import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Dropdown,
  Popover,
  Spin,
} from 'antd'
import dayjs from 'dayjs'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import type { Property } from '@/types'
import { AREA_GROUPS } from '@/data/locationArea'
import { METRO_LINES } from '@/data/locationMetro'
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

const formatRent = (v: any) => `฿${Number(v || 0).toLocaleString()}`

// 买卖挂牌总价（币种随挂牌）
const formatTotal = (v: any, currency?: string) => {
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency === 'MYR' ? 'RM ' : '฿'
  return `${symbol}${Number(v || 0).toLocaleString()}`
}

// 业务 Tab（整租 / 合租 / 买房）
// - 买房：数据源为真实在售挂牌 /sale-listings（按 property_id 关联房源）
// - 合租：房源表没有整租/合租字段，无法真实区分 → 空态，不做伪分类

// 按区域 / 按地铁找房（对齐贝壳「区域 | 地铁」下拉面板）

// 区域数据集中在 src/data/locationArea.ts（AREA_GROUPS），上方已 import
// 接口 DistrictNode / CityGroup 亦在数据文件中定义

// 轨交数据集中在 src/data/locationMetro.ts（METRO_LINES），上方已 import
// 接口 MetroStation / MetroLine 亦在数据文件中定义

// 命中关键词：房源地址/城市/项目名任一包含即可
const matchLocation = (item: any, kws: string[]): boolean =>
  kws.some((k) =>
    [item.address, item.city, item.project_id, item.district, item.area]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(k))
  )

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

  // 数据
  const [allItems, setAllItems] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  // 买房业务栏数据源：真实在售挂牌（/sale-listings 需登录，未登录为空）
  const [saleListings, setSaleListings] = useState<any[]>([])

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
  const [sort, setSort] = useState('default')
  const [biz, setBiz] = useState('rent')

  // 按区域 / 按地铁找房面板状态（对齐贝壳「区域 | 地铁」）
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area')
  const [locOpen, setLocOpen] = useState(false)                        // 面板开合
  const [districtSel, setDistrictSel] = useState<string | null>(null) // 已选城区 key
  const [metroSel, setMetroSel] = useState<string[]>([])              // 已选站点 name（已确认）
  const [metroDraft, setMetroDraft] = useState<string[]>([])          // 站点多选草稿（确定后提交）
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key)
  const [view, setView] = useState('grid')
  const [mapOn, setMapOn] = useState(false)
  const [page, setPage] = useState(1)

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
  const activeLocationKw = useMemo<string[]>(() => {
    if (districtSel) {
      const node = AREA_GROUPS.flatMap((g) => g.children).find((d) => d.key === districtSel)
      return node ? node.kws : []
    }
    if (metroSel.length) {
      const lines = METRO_LINES.flatMap((l) => l.stations)
      return lines.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws)
    }
    return []
  }, [districtSel, metroSel])

  const regionLabel = useMemo(() => {
    if (districtSel) {
      const node = AREA_GROUPS.flatMap((g) => g.children).find((d) => d.key === districtSel)
      return node ? node.label : t('locate.area')
    }
    if (metroSel.length) {
      const first = metroSel[0]
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first
    }
    return t('locate.area')
  }, [districtSel, metroSel, t])

  const activeLine = useMemo(() => METRO_LINES.find((l) => l.key === metroLine), [metroLine])

  // 城市标题改用数据文件 locationArea.ts 的 country + cityLabel（覆盖新增城市，不再依赖 i18n region.*）

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

  // 服务端查询参数：关键词 / 区域同义词 / 价格 / 面积 / 户型 / 状态 / 排序都下推到后端，
  // 不再靠「拉 999 条再前端过滤」的假搜索（数据量大时既慢又搜不全）。
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { page_size: 999 }
    const kw = debouncedKw.trim()
    if (kw) params.q = kw
    // 区域/地铁是多关键词同义词，命中任一即算
    if (activeLocationKw.length) params.keywords = activeLocationKw
    if (statusSel && BACKEND_STATUS.has(statusSel)) params.status = statusSel
    if (sort !== 'default') params.sort = sort
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
    return params
  }, [debouncedKw, activeLocationKw, statusSel, sort, videoOnly, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax, roomType])

  // 数据获取（公开接口，不需要 auth）
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/properties', { params: { ...queryParams } })
      const payload = res.data?.data ?? res.data
      const items = payload?.items ?? []
      setAllItems(Array.isArray(items) ? items : [])
    } catch {
      setAllItems([])
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => { fetchData() }, [fetchData])

  // 在售挂牌（买房业务栏）：仅登录后拉取，失败按空态处理
  useEffect(() => {
    if (!token) {
      setSaleListings([])
      return
    }
    let cancelled = false
    api.get('/sale-listings', { params: { page: 1, page_size: 100 } })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        const items = payload?.items ?? []
        if (!cancelled) setSaleListings(Array.isArray(items) ? items : [])
      })
      .catch(() => { if (!cancelled) setSaleListings([]) })
    return () => { cancelled = true }
  }, [token])

  // ---------- 地图找房（Leaflet + OpenStreetMap 瓦片） ----------
  // 房源坐标来自所属项目（projects.lat/lng），项目未维护坐标的房源不在地图上出现。
  const mapRef = useRef<HTMLDivElement | null>(null)
  const leafletRef = useRef<any>(null)
  const markerLayerRef = useRef<any>(null)
  const [mapPoints, setMapPoints] = useState<any[]>([])
  const [mapLoading, setMapLoading] = useState(false)

  // 地图与列表共用同一套筛选（仅取地图接口支持的参数）
  const mapParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: 300 }
    ;(['q', 'keywords', 'status', 'price_min', 'price_max', 'has_video'] as const).forEach((k) => {
      if (queryParams[k] !== undefined) params[k] = queryParams[k]
    })
    return params
  }, [queryParams])

  const fetchMapPoints = useCallback(async () => {
    setMapLoading(true)
    try {
      const res = await api.get('/properties/map-points', { params: mapParams })
      setMapPoints(Array.isArray(res.data) ? res.data : [])
    } catch {
      setMapPoints([])
    } finally {
      setMapLoading(false)
    }
  }, [mapParams])

  useEffect(() => { if (mapOn) fetchMapPoints() }, [mapOn, fetchMapPoints])

  // 首次展开时才创建地图实例：隐藏容器的尺寸为 0，提前初始化会导致瓦片错位
  useEffect(() => {
    if (!mapOn || !mapRef.current || leafletRef.current) return
    const map = L.map(mapRef.current, {
      center: [13.7563, 100.5018],  // 曼谷默认中心，有点位时会被 fitBounds 覆盖
      zoom: 12,
      scrollWheelZoom: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    markerLayerRef.current = L.layerGroup().addTo(map)
    leafletRef.current = map
  }, [mapOn])

  useEffect(() => () => {
    leafletRef.current?.remove()
    leafletRef.current = null
    markerLayerRef.current = null
  }, [])

  // 前端筛选 + 排序 + 业务 Tab
  const filteredItems = useMemo(() => {
    let list = [...allItems]

    // 业务 Tab：合租无对应字段 → 诚实空态；买房改挂真实在售挂牌总价
    if (biz === 'share') return []
    if (biz === 'sale') {
      const saleMap = new Map(saleListings.map((s: any) => [String(s.property_id || ''), s]))
      list = list
        .filter((it: any) => saleMap.has(String(it.id)))
        .map((it: any) => {
          const s: any = saleMap.get(String(it.id))
          return { ...it, sale_price: s?.asking_price, currency: s?.currency || it.currency }
        })
    }
    // 价格口径：买房看总价，租房看月租
    const priceOf = (it: any) => Number(biz === 'sale' ? it.sale_price : it.monthly_rent || 0)

    const kw = keyword.trim().toLowerCase()
    if (kw) {
      list = list.filter((it: any) =>
        [it.room_number, it.address, it.project_id, it.building, it.city]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw))
      )
    }
    // 按区域 / 按地铁：命中已选城区/站点关键词
    if (activeLocationKw.length) {
      list = list.filter((it: any) => matchLocation(it, activeLocationKw))
    }
    if (roomType) {
      const n = Number(roomType)
      list = list.filter((it: any) => n >= 4 ? Number(it.bedrooms) >= 4 : Number(it.bedrooms) === n)
    }
    // 价格筛选（贝壳式：预设快捷区间 或 自定义最低/最高，THB）
    let pMin = 0, pMax = Infinity
    if (priceRange) {
      const [mn, mx] = priceRange.split('-').map(Number)
      if (!Number.isNaN(mn)) pMin = mn
      if (!Number.isNaN(mx) && isFinite(mx)) pMax = mx
    } else if (customMin || customMax) {
      const mn = Number(customMin), mx = Number(customMax)
      if (customMin && !Number.isNaN(mn)) pMin = mn
      if (customMax && !Number.isNaN(mx)) pMax = mx
    }
    list = list.filter((it: any) => {
      const r = priceOf(it)
      return r >= pMin && r <= pMax
    })
    if (areaRange) {
      const [min, max] = areaRange.split('-').map(Number)
      list = list.filter((it: any) => { const s = Number(it.size_sqm); return s >= min && s <= max })
    } else if (areaCustomMin || areaCustomMax) {
      const aMin = Number(areaCustomMin) || 0
      const aMax = Number(areaCustomMax) || 0
      list = list.filter((it: any) => {
        const s = Number(it.size_sqm)
        if (aMin > 0 && s < aMin) return false
        if (aMax > 0 && s > aMax) return false
        return true
      })
    }
    // 状态筛选（贝壳式）
    if (statusSel) {
      list = list.filter((it: any) => (it.status || 'vacant').toLowerCase() === statusSel)
    }
    // 业务 Tab 已在开头处理（合租空态 / 买房挂真实总价）
    switch (sort) {
      case 'price_asc': list.sort((a: any, b: any) => priceOf(a) - priceOf(b)); break
      case 'price_desc': list.sort((a: any, b: any) => priceOf(b) - priceOf(a)); break
      case 'area_desc': list.sort((a: any, b: any) => b.size_sqm - a.size_sqm); break
      case 'latest': list.sort((a: any, b: any) => dayjs(b.created_at || 0).valueOf() - dayjs(a.created_at || 0).valueOf()); break
    }
    return list
  }, [allItems, saleListings, keyword, activeLocationKw, roomType, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax, statusSel, sort, biz])

  useEffect(() => { setPage(1) }, [keyword, districtSel, metroSel, activeLocationKw, roomType, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax, statusSel, sort, biz])

  const total = filteredItems.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

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
    if (token) {
      // 租客走 C 端门户详情页（对齐 tenant-property-detail.html），其余角色走后台详情页
      navigate(
        user?.role === 'tenant'
          ? `/tenant/properties/${item.id}`
          : `/properties/detail/${item.id}`,
      )
    } else {
      navigate('/login')
    }
  }

  // 地图点位名称（点位来自 /properties/map-points，带 project_name）
  const mapPointName = (p: any): string =>
    p.project_name ? `${p.project_name} · ${p.room_number || ''}` : (p.address || p.room_number || '—')

  // 点位渲染：项目无坐标的房源不在地图上，故图例单独给出已定位数量
  useEffect(() => {
    const map = leafletRef.current
    const layer = markerLayerRef.current
    if (!map || !layer || !mapOn) return
    layer.clearLayers()
    const latlngs: [number, number][] = []
    mapPoints.forEach((p) => {
      const ll: [number, number] = [Number(p.lat), Number(p.lng)]
      if (Number.isNaN(ll[0]) || Number.isNaN(ll[1])) return
      latlngs.push(ll)
      L.circleMarker(ll, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        // 有视频看房的点位用蓝色区分，其余用品牌青绿
        fillColor: p.video_url ? '#0ea5e9' : '#14b8a6',
        fillOpacity: 1,
      })
        .bindPopup(
          `<div style="font-weight:600;color:#1c2733">${mapPointName(p)}</div>` +
            `<div style="font-weight:600;color:#14b8a6">${formatRent(Number(p.monthly_rent || 0))}</div>` +
            `<div style="font-size:12px;color:#64748b">${p.project_name || ''}</div>`
        )
        .on('click', () => handleCardClick(p))
        .addTo(layer)
    })
    if (latlngs.length) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 15 })
    }
    // 容器从隐藏切到显示后需要重算尺寸
    setTimeout(() => map.invalidateSize(), 0)
  }, [mapPoints, mapOn])

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
        <div className="rent-loc-panel__body">
          {AREA_GROUPS.map((g) => (
            <div className="rent-loc-panel__group" key={g.cityKey}>
              <div className="rent-loc-panel__group-title">{g.country} · {g.cityLabel}</div>
              <div className="rent-loc-panel__chips">
                <button
                  type="button"
                  className={`rent-loc-panel__chip ${districtSel === null ? 'rent-loc-panel__chip--active' : ''}`}
                  onClick={() => applyDistrict(null)}
                >
                  {t('locate.all')}
                </button>
                {g.children.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={`rent-loc-panel__chip ${districtSel === d.key ? 'rent-loc-panel__chip--active' : ''}`}
                    onClick={() => applyDistrict(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rent-loc-panel__metro">
          <div className="rent-loc-panel__lines">
            {METRO_LINES.map((l) => (
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
  const applyAreaPreset = (key: string) => {
    if (key === 'all') { setAreaRange(''); setAreaCustomMin(''); setAreaCustomMax(''); return }
    setAreaRange(key)
    setAreaCustomMin('')
    setAreaCustomMax('')
  }

  // 「更多」合并面板（对齐贝壳：面积 快捷区间+自定义 + 房源状态 + 重置/确定）
  const moreActive = !!(areaRange || areaCustomMin || areaCustomMax || statusSel)
  const moreLabel = (() => {
    const parts: string[] = []
    if (areaRange || areaCustomMin || areaCustomMax) {
      parts.push(areaRange ? (areaOptions.find((o) => o.value === areaRange)?.label || t('priceRange.custom')) : t('priceRange.custom'))
    }
    if (statusSel) parts.push(statusLabelMap[statusSel] || statusSel)
    return parts.length ? parts.join(' · ') : t('browse.filterMore')
  })()
  const resetMore = () => { setAreaRange(''); setAreaCustomMin(''); setAreaCustomMax(''); setStatusSel('') }

  const morePanelContent = (
    <div className="rent-loc-panel rent-price-panel">
      <div className="rent-loc-panel__body">
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
    const projectName = item.project_id || item.building || ''
    const title = projectName ? `${projectName} · ${item.room_number || ''}` : (item.address || item.room_number || '—')
    const ptype = propertyTypeMap[item.property_type] || item.property_type || t('propertyType.apartment')
    const ptypeKey = (propertyTypeMap[item.property_type] ? item.property_type : 'apartment') as string
    const statusKey = (item.status || 'vacant').toLowerCase()
    const beds = Number(item.bedrooms || 0)
    const baths = Number(item.bathrooms || 0)
    const size = Number(item.size_sqm || 0)
    const rent = Number(item.monthly_rent || 0)
    const seed = String(item.id || item.room_number || '')

    const tags: { label: string; type: string }[] = []
    if (item.furnished) tags.push({ label: t('browse.furnished'), type: 'primary' })
    tags.push({ label: t('browse.moveIn'), type: 'success' })

    return (
      <div className="rent-prop-search-card" key={item.id} onClick={() => handleCardClick(item)}>
        <div className="rent-prop-search-card__banner" style={{ background: bannerColorFor(seed) }}>
          <button
            className="rent-fav-btn"
            aria-label={t('property.followProperty')}
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          <svg className="rent-prop-search-card__banner-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={TYPE_ICON_PATH(ptypeKey)} />
          </svg>
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
                {biz === 'sale' ? formatTotal(item.sale_price, item.currency) : formatRent(rent)}
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
          <button className="rent-portal__nav-item" onClick={() => navigate('/')}>{t('browse.rent')}</button>
          <button className="rent-portal__nav-item" data-active="true" onClick={() => navigate('/listings')}>{t('browse.buy')}</button>
          <button className="rent-portal__nav-item" onClick={() => navigate('/listings')}>{t('browse.mapFind')}</button>
          <button className="rent-portal__nav-item" onClick={() => navigate('/listings?video=1')}>{t('browse.video')}</button>
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

        {/* ===== 地图模式（Leaflet 真实地图 + OpenStreetMap 瓦片） ===== */}
        <section className="rv17-map" data-active={mapOn}>
          <span className="rv17-map__legend">
            {t('browse.mapLegend')}
            {` · ${mapPoints.length} ${t('property.units')}`}
          </span>
          <div className="rv17-map__canvas" ref={mapRef} />
          {mapLoading && (
            <div className="rv17-map__loading">
              <Spin />
            </div>
          )}
          {!mapLoading && mapPoints.length === 0 && (
            <div className="rv17-map__empty">{t('browse.mapNoCoord')}</div>
          )}
          <div className="rv17-map__strip">
            {mapPoints.slice(0, 6).map((p: any) => (
              <div key={p.id} className="rv17-map__mini" onClick={() => handleCardClick(p)}>
                <div className="rv17-map__mini-name">{mapPointName(p)}</div>
                <div className="rv17-map__mini-price">{formatRent(Number(p.monthly_rent || 0))}</div>
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
                <button className="rent-page-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
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
                <button className="rent-page-btn" type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
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
