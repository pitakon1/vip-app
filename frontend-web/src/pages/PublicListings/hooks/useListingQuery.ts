import { useCallback, useMemo, useState } from 'react'
import api from '@/lib/api'
import { useCachedQuery } from '@/lib/queryCache'
import { BACKEND_STATUS, PAGE_SIZE, PROPERTY_TYPE_GROUPS } from '../constants'
import type { ListingFilters } from './useListingFilters'

/**
 * 公开列表页的服务端查询编排：筛选签名 / 页码 / 查询参数 / 数据与分页派生。
 *
 * 所有筛选维度（状态白名单、价格、面积、户型、学校、区域/地铁、排序）
 * 一律拼进 `/public/listings` 的查询参数下推后端，本文件不做任何本地过滤。
 */
export function useListingQuery(f: ListingFilters) {
  const {
    keyword, districtSel, backendDistrict, metroSel, activeLocationKw, globalCityKw,
    roomType, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax,
    statusSel, sort, biz, videoOnly, vrSel, featuredSel, ownerDirectSel, debouncedKw,
    schoolId, schoolKm, orientationSel, floorLevelSel, decorSel, amenitySel,
    citySel, propertyTypeSel,
  } = f

  // 分页状态与「筛选签名」成对存放：筛选一变，page 立刻按签名归 1。
  // 之前是「page 单独存 + useEffect 归 1」，导致筛选变化那一帧先用旧 page
  // 发一次请求、再由 effect 归 1 补第二次——同一筛选打两次接口。
  const filterSig = useMemo(
    () =>
      JSON.stringify([
        keyword, districtSel, backendDistrict, metroSel, activeLocationKw, globalCityKw,
        roomType, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax,
        statusSel, sort, biz, videoOnly, vrSel, featuredSel, ownerDirectSel, debouncedKw,
        schoolId, schoolKm, propertyTypeSel,
      ]),
    [keyword, districtSel, backendDistrict, metroSel, activeLocationKw, globalCityKw,
      roomType, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax,
      statusSel, sort, biz, videoOnly, vrSel, featuredSel, ownerDirectSel, debouncedKw,
      schoolId, schoolKm, propertyTypeSel],
  )
  const [pageState, setPageState] = useState<{ sig: string; page: number }>({ sig: filterSig, page: 1 })
  const page = pageState.sig === filterSig ? pageState.page : 1
  const setPage = useCallback(
    (next: number) => setPageState({ sig: filterSig, page: next }),
    [filterSig],
  )

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
      // 城市作用域：统一传定位 Store 的 cityKey（后端做 slug 归一化），不再传中文 cityLabel
      city: citySel.cityKey,
    }
    // 业务线：租房 / 二手房 / 新房；二手房与新房共用 listing_type=sell，
    // 再用 is_new_development 区分（不新增后端参数）
    if (biz === 'rent') {
      params.listing_type = 'rent'
    } else if (biz === 'resale') {
      params.listing_type = 'sell'
      params.is_new_development = false
    } else if (biz === 'new') {
      params.listing_type = 'sell'
      params.is_new_development = true
    }
    // 关键词：小区名/地址/商圈（后端 q 做 OR 匹配）
    const kw = debouncedKw.trim()
    if (kw) params.q = kw
    // 类型筛选：公寓 = apartment + condo，商铺办公 = office + shop（多值任一命中）
    const typeGroup = propertyTypeSel ? PROPERTY_TYPE_GROUPS[propertyTypeSel] : undefined
    if (typeGroup?.length) params.property_type = typeGroup
    // 区域筛选：
    // - 命中后端真实区域时用精确 district 参数（避免与城市同义词 AND 互斥）
    // - 未命中（后端无数据回退静态清单）时沿用区域/地铁多关键词同义词
    if (backendDistrict) {
      params.district = backendDistrict
    } else {
      const locScopedKw = activeLocationKw.length ? activeLocationKw : globalCityKw
      if (locScopedKw.length) params.keywords = locScopedKw
    }
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
    // VR 看房 / 优选 / 房东直租（服务端布尔筛选）
    if (vrSel === '1') params.has_vr = true
    if (featuredSel === '1') params.is_featured = true
    if (ownerDirectSel === '1') params.owner_direct = true
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
  }, [page, biz, citySel.cityKey, backendDistrict, debouncedKw, activeLocationKw, globalCityKw, statusSel, sort, videoOnly, vrSel, featuredSel, ownerDirectSel, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax, roomType, schoolId, schoolKm, orientationSel, floorLevelSel, decorSel, amenitySel, propertyTypeSel])

  // 数据获取（公开接口，不需要 auth）：queryKey 含当前页与筛选参数，
  // 缓存优先渲染 + 后台刷新；总数以服务端返回的 total 为准。
  const listQueryKey = useMemo(() => ['public-listings', JSON.stringify(queryParams)], [queryParams])
  const listQ = useCachedQuery<{ items: any[]; total: number }>({
    queryKey: listQueryKey,
    cacheKey: `public-listings:${JSON.stringify(queryParams)}`,
    queryFn: async () => {
      // 走公开接口：原来打 /properties（强制鉴权），匿名访问必然 401，
      // 于是列表页对未登录访客始终是空的——等于墙建在接口层。
      // 出错不再吞成空数组：吞掉会把「请求失败」写进磁盘缓存，
      // 下次进页面先渲染一个假的「0 套房源」。
      const res = await api.get('/public/listings', { params: { ...queryParams } })
      const payload = res.data?.data ?? res.data
      const items = payload?.items ?? []
      return {
        items: Array.isArray(items) ? items : [],
        total: Number(payload?.total ?? 0),
      }
    },
  })
  const pagedItems = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const loading = listQ.isPending && !listQ.data
  const hasActiveFilter = Boolean(
    debouncedKw.trim() || districtSel || backendDistrict || metroSel.length ||
    roomType || priceRange || customMin || customMax ||
    areaRange || areaCustomMin || areaCustomMax || statusSel || videoOnly ||
    vrSel === '1' || featuredSel === '1' || ownerDirectSel === '1' ||
    orientationSel || floorLevelSel || decorSel || amenitySel.length || schoolId || propertyTypeSel ||
    biz !== 'all',
  )

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // 分页页码（首尾 + 当前 ±1，中间省略号）
  const pageNumbers = useMemo(() => {
    const pages = new Set<number>([1, pageCount])
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) pages.add(i)
    return Array.from(pages).sort((a, b) => a - b)
  }, [page, pageCount])

  return { queryParams, listQ, pagedItems, total, loading, hasActiveFilter, page, setPage, pageCount, pageNumbers }
}

export type ListingQuery = ReturnType<typeof useListingQuery>
