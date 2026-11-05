import { AREA_PRESETS, PRICE_PRESETS, type ListingsFilters } from '@/components/ListingsFeed'

/**
 * 把「业务类型 / 价格 / 面积 / 户型 / 状态 / 朝向 / 装修 / 楼层 / 配套 / 区域地铁关键词 /
 * 排序 / 附近坐标」转成 /properties 的服务端查询参数。
 *
 * 此前这些筛选都作用在「已加载的当前页」上：翻页后其他页的命中房源会漏掉，
 * 第 2 页起的筛选范围也与第 1 页不一致。业务类型（出租/买房）与「附近」排序
 * 现已由后端支持（`listing_type` / `sort=distance` + `lat`/`lng`）。
 */
export function buildListingsParams(
  filters: ListingsFilters,
  opts: {
    locationKw: string[]
    cityKw: string[]
    /** 业务类型：出租 / 买房 */
    biz?: 'rent' | 'sale'
    /** 房产类型分类（员工找房页）：apartment / villa / commercial / factory / hotel / land */
    typeSel?: string
    /** 业务类型筛选（员工找房页）：rent / resale / new */
    bizSel?: string
    /** 「附近」开启时的用户坐标（未开启传 null/undefined） */
    nearbyPos?: { lat: number; lng: number } | null
  }
): Record<string, any> {
  const p: Record<string, any> = {}

  // 业务类型：rent=按租金判断，sell=存在在售上架单
  if (opts.biz) p.listing_type = opts.biz === 'sale' ? 'sell' : 'rent'

  // 房产类型分类 → property_type 多值（任一命中），与后端 /properties 口径一致
  const TYPE_CLASS_TYPES: Record<string, string[]> = {
    apartment: ['apartment', 'condo'],
    villa: ['villa', 'house'],
    commercial: ['office', 'shop'],
    factory: ['factory'],
    hotel: ['hotel'],
    land: ['land']
  }
  if (opts.typeSel) {
    const types = TYPE_CLASS_TYPES[opts.typeSel]
    if (types) p.property_type = types
  }

  // 业务类型筛选：租房 / 二手房（sell + 非新房）/ 新房（sell + 新房），覆盖上方 biz 推导
  if (opts.bizSel === 'rent') {
    p.listing_type = 'rent'
  } else if (opts.bizSel === 'resale') {
    p.listing_type = 'sell'
    p.is_new_development = false
  } else if (opts.bizSel === 'new') {
    p.listing_type = 'sell'
    p.is_new_development = true
  }

  // 价格：预设区间优先，自定义区间按「万」输入换算成实际金额
  if (filters.pricePreset) {
    const preset = PRICE_PRESETS.find((x) => x.key === filters.pricePreset)
    if (preset) {
      if (preset.min > 0) p.price_min = preset.min
      if (Number.isFinite(preset.max)) p.price_max = preset.max
    }
  } else if (filters.customMin || filters.customMax) {
    if (filters.customMin) p.price_min = (Number(filters.customMin) || 0) * 10000
    if (filters.customMax) p.price_max = (Number(filters.customMax) || 0) * 10000
  }

  // 面积
  if (filters.areaPreset) {
    const preset = AREA_PRESETS.find((x) => x.key === filters.areaPreset)
    if (preset) {
      if (preset.min > 0) p.area_min = preset.min
      if (Number.isFinite(preset.max)) p.area_max = preset.max
    }
  } else if (filters.areaCustomMin || filters.areaCustomMax) {
    if (filters.areaCustomMin) p.area_min = Number(filters.areaCustomMin) || 0
    if (filters.areaCustomMax) p.area_max = Number(filters.areaCustomMax) || 0
  }

  // 户型：5 = 5 室及以上，3p = 3 室及以上，其余为精确居室
  if (filters.bedroomSel === '5') {
    p.bedrooms_min = 5
  } else if (filters.bedroomSel === '3p') {
    p.bedrooms_min = 3
  } else if (filters.bedroomSel) {
    const n = Number(filters.bedroomSel)
    p.bedrooms_min = n
    p.bedrooms_max = n
  }

  if (filters.statusSel) p.status = filters.statusSel
  if (filters.orientationSel) p.orientation = filters.orientationSel
  if (filters.decorSel) p.decoration = filters.decorSel
  if (filters.floorSel) p.floor_level = filters.floorSel
  if (filters.amenitySel.length) p.amenity = filters.amenitySel

  // 城市作用域 + 区域/地铁同义词：合并去重后交给后端的 keywords（OR 命中）
  const terms = Array.from(
    new Set([...opts.cityKw, ...opts.locationKw].map((s) => String(s).trim()).filter(Boolean))
  ).slice(0, 20)
  if (terms.length) p.keywords = terms

  if (filters.sortKey === 'latest' || filters.sortKey === 'price_asc' ||
      filters.sortKey === 'price_desc' || filters.sortKey === 'area_desc') {
    p.sort = filters.sortKey
  }

  // 「附近」优先走服务端距离排序：翻页后整体顺序仍然正确，
  // 而不是各页各自排序。sort=distance 会覆盖上面的排序选项。
  if (opts.nearbyPos) {
    p.lat = opts.nearbyPos.lat
    p.lng = opts.nearbyPos.lng
    p.sort = 'distance'
  }

  return p
}
