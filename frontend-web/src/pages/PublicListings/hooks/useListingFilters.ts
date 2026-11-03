import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import api from '@/lib/api'
import { OPTION_PAGE_SIZE } from '@/lib/pagination'
import { AREA_TIERS, PRICE_TIERS, SCHOOL_RADIUS_OPTIONS } from '@/constants/filters'
import { METRO_LINES } from '@/data/locationMetro'
import { useLocationStore, findCityByKey } from '@/stores/location'
import { useDistricts } from '@/lib/publicDistricts'
import { usePropertyStatusMap, useOrientationMap, useDecorationMap, useAmenityMap } from '@/lib/enumLabels'
import { AREA_LABEL_KEYS, PRICE_LABEL_KEYS } from '../constants'

/**
 * 公开列表页的全部筛选状态（含「区域 | 地铁」「按学校找房」面板）。
 *
 * 纯结构拆分：状态与派生值集中在此，页面主文件只做编排。
 * 所有筛选维度最终都由 useListingQuery 统一下推后端，不做本地过滤。
 */
export function useListingFilters() {
  const { t } = useTranslation()

  // 「视频看房」入口：首页/顶栏的导航项带 ?video=1 进来，只筛有视频的房源
  const [searchParams, setSearchParams] = useSearchParams()
  const videoOnly = searchParams.get('video') === '1'
  const toggleVideoOnly = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    if (next.get('video') === '1') next.delete('video')
    else next.set('video', '1')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

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
  // VR / 优选 / 房东直租（服务端布尔筛选，'1' 为仅收敛）
  const [vrSel, setVrSel] = useState('')
  const [featuredSel, setFeaturedSel] = useState('')
  const [ownerDirectSel, setOwnerDirectSel] = useState('')

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

  // 区域候选优先走真实数据 `/public/districts`（带当前城市 cityKey + 业务口径）；
  // 后端返回为空时回退到静态区域清单，避免筛选器变成只有一个「不限」的死面板。
  const listingType = biz === 'sale' ? 'sell' : 'rent'
  const backendDistricts = useDistricts({ city: citySel.cityKey, listingType })
  const usingBackendDistricts = backendDistricts.length > 0
  const [backendDistrict, setBackendDistrict] = useState<string | null>(null)
  // 地铁仅列当前定位城市的线路
  const cityMetroLines = useMemo(
    () => METRO_LINES.filter((l) => l.cityKey === citySel.cityKey),
    [citySel.cityKey],
  )
  const [view, setView] = useState('grid')
  const [mapOn, setMapOn] = useState(false)

  // 「按学校找房」筛选：选一所学校 + 半径，看它周边有哪些房源。
  // 这是空间筛选（后端算 haversine 距离），不是「学区房」布尔标签——
  // 泰国没有划片入学，国际学校是「付费 + 距离」逻辑，做标签无据可依。
  const schoolRadiusOptions = SCHOOL_RADIUS_OPTIONS
  const [schoolId, setSchoolId] = useState('')
  const [schoolKm, setSchoolKm] = useState(3)
  const [schoolOpen, setSchoolOpen] = useState(false)
  const [schoolKw, setSchoolKw] = useState('')
  const [schools, setSchools] = useState<any[]>([])

  // 「小区」筛选已移除：小区维度改由顶部搜索框承接（后端 q 已 OR 匹配小区名），
  // 少一个筛选入口，也避免与「区域」两个空间维度互相打架。

  // 选项（枚举 → 文案映射统一收敛到 lib/enumLabels）
  const statusLabelMap = usePropertyStatusMap()

  // 「更多」面板的朝向/装修/配套文案：字典优先、硬编码回落（见 lib/enumLabels）
  const orientationMap = useOrientationMap()
  const decorationMap = useDecorationMap()
  const amenityMap = useAmenityMap()

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
    if (backendDistrict) return backendDistrict
    if (districtSel) {
      const node = distNode(districtSel)
      return node ? node.label : t('locate.area')
    }
    if (metroSel.length) {
      const first = metroSel[0]
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first
    }
    return t('locate.area')
  }, [backendDistrict, districtSel, metroSel, cityDistricts, t])

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
    setBackendDistrict(null)
    setMetroSel([])
    setMetroDraft([])
  }
  const resetLoc = () => { setDistrictSel(null); setBackendDistrict(null); setMetroSel([]); setMetroDraft([]) }

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
    ...PRICE_TIERS.map((tier) => ({
      value: tier.max == null ? `${tier.min}-99999999` : tier.key,
      label: t(PRICE_LABEL_KEYS[tier.key]),
    })),
  ], [t])

  const areaOptions = useMemo(() => [
    { value: '', label: t('property.allAreas') },
    ...AREA_TIERS.map((tier) => ({
      value: tier.max == null ? `${tier.min}-999999` : tier.key,
      label: t(AREA_LABEL_KEYS[tier.key]),
    })),
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
      .get('/public/schools', { params: { page_size: OPTION_PAGE_SIZE } })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        const items = payload?.items ?? []
        if (!cancelled) setSchools(Array.isArray(items) ? items : [])
      })
      .catch(() => { if (!cancelled) setSchools([]) })
    return () => { cancelled = true }
  }, [])

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

  // 下拉 chips 转 antd menu items（key 用 'all' 表示清除）
  const toMenuItems = (options: { value: string; label: string }[]) =>
    options.map((o) => ({ key: o.value || 'all', label: o.label }))

  const statusOptions = [
    { value: '', label: t('priceRange.all') }, // 不限
    { value: 'vacant', label: statusLabelMap.vacant },
    { value: 'rented', label: statusLabelMap.rented },
    { value: 'renewing', label: statusLabelMap.renewing },
    { value: 'maintenance', label: statusLabelMap.maintenance },
  ]
  // 更多面板新增维度（东南亚口径，与 App / 小程序一致；无供暖——东南亚无冬季）
  // 文案一律走 i18n：此前这里的选项 label 硬编码中文，EN/TH 环境下整个
  // 「更多」面板与已选 chip 都还是中文（同文件其他筛选早已接了 t()）。
  const ANY = t('priceRange.all')
  const orientationOptions = [
    { value: '', label: ANY },
    ...Object.entries(orientationMap).map(([value, label]) => ({ value, label })),
  ]
  const floorLevelOptions = [
    { value: '', label: ANY },
    { value: 'low', label: t('publicSite.floorLevel.low') },
    { value: 'mid', label: t('publicSite.floorLevel.mid') },
    { value: 'high', label: t('publicSite.floorLevel.high') },
  ]
  const decorationOptions = [
    { value: '', label: ANY },
    ...Object.entries(decorationMap).map(([value, label]) => ({ value, label })),
  ]
  const amenityOptions = Object.entries(amenityMap).map(([value, label]) => ({ value, label }))

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

  const applyAreaPreset = (key: string) => {
    if (key === 'all') { setAreaRange(''); setAreaCustomMin(''); setAreaCustomMax(''); return }
    setAreaRange(key)
    setAreaCustomMin('')
    setAreaCustomMax('')
  }

  // 「更多」合并面板（对齐贝壳：面积 快捷区间+自定义 + 朝向/楼层/装修/配套 + 房源状态 + 重置/确定）
  const moreActive = !!(areaRange || areaCustomMin || areaCustomMax || statusSel || orientationSel || floorLevelSel || decorSel || amenitySel.length || vrSel || featuredSel || ownerDirectSel)
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
    if (vrSel) parts.push(t('browse.vr'))
    if (featuredSel) parts.push(t('browse.featured'))
    if (ownerDirectSel) parts.push(t('browse.ownerDirect'))
    return parts.length ? parts.join(' · ') : t('browse.filterMore')
  })()
  const resetMore = () => { setAreaRange(''); setAreaCustomMin(''); setAreaCustomMax(''); setStatusSel(''); setOrientationSel(''); setFloorLevelSel(''); setDecorSel(''); setAmenitySel([]); setVrSel(''); setFeaturedSel(''); setOwnerDirectSel('') }

  const schoolActive = !!schoolId

  return {
    // 业务 / 视图
    biz, setBiz,
    view, setView,
    mapOn, setMapOn,
    videoOnly, toggleVideoOnly,
    listingType,
    // 搜索
    keyword, setKeyword,
    debouncedKw,
    // 区域 / 地铁
    citySel, city, cityDistricts, cityMetroLines,
    backendDistricts, usingBackendDistricts,
    backendDistrict, setBackendDistrict,
    districtSel, setDistrictSel,
    metroSel, setMetroSel,
    metroDraft, setMetroDraft,
    metroLine, setMetroLine,
    locTab, setLocTab,
    locOpen, setLocOpen,
    applyDistrict, resetLoc, onLocOpenChange, toggleStation, confirmMetro, clearMetroDraft,
    activeLocationKw, globalCityKw, regionLabel, activeLine,
    // 价格 / 户型 / 面积 / 状态
    roomType, setRoomType,
    priceRange, setPriceRange,
    customMin, setCustomMin,
    customMax, setCustomMax,
    areaRange, setAreaRange,
    areaCustomMin, setAreaCustomMin,
    areaCustomMax, setAreaCustomMax,
    statusSel, setStatusSel,
    orientationSel, setOrientationSel,
    floorLevelSel, setFloorLevelSel,
    decorSel, setDecorSel,
    amenitySel, setAmenitySel,
    vrSel, setVrSel,
    featuredSel, setFeaturedSel,
    ownerDirectSel, setOwnerDirectSel,
    sort, setSort,
    // 弹层开合
    priceOpen, setPriceOpen,
    roomOpen, setRoomOpen,
    moreOpen, setMoreOpen,
    // 学校
    schoolId, setSchoolId,
    schoolKm, setSchoolKm,
    schoolOpen, setSchoolOpen,
    schoolKw, setSchoolKw,
    schools, selectedSchool, filteredSchools, schoolRadiusOptions,
    // 选项与文案
    statusLabelMap,
    roomTypeOptions, priceOptions, areaOptions, sortItems, bizTabs,
    statusOptions, orientationOptions, floorLevelOptions, decorationOptions, amenityOptions,
    priceActive, priceLabel, moreActive, moreLabel, schoolActive,
    // 行为
    applyPricePreset, resetPrice, applyAreaPreset, resetMore,
    toMenuItems,
  }
}

export type ListingFilters = ReturnType<typeof useListingFilters>
