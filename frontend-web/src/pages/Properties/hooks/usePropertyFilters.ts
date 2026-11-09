/**
 * 房源列表筛选状态（关键词 / 状态 / 类型 / 户型 / 价格 / 面积 / 排序 / 分页 + 区域·地铁定位）。
 *
 * 纯结构拆分自 pages/Properties/index.tsx：状态与查询参数构造逻辑原样迁移，
 * 查询参数语义、回到第 1 页的触发条件均保持不变。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LIST_PAGE_SIZE } from '@/lib/pagination'
import type { QueryParams } from '@/services/api'
import { AREA_GROUPS } from '@/data/locationArea'
import { METRO_LINES } from '@/data/locationMetro'
import { SORT_MAP, parseRange } from '../filterWidgets'

const PAGE_SIZE = LIST_PAGE_SIZE

/**
 * 销售端房产类型大类 → 后端 property_type 取值。
 * 与 C 端分类页完全同口径：
 * - 公寓 = apartment + condo（C 端「公寓」Tab 用的就是这两值）
 * - 商铺办公 = office + shop（C 端 Commercial 的写字楼/商铺）
 */
export const TYPE_CLASS_MAP: Record<string, string[]> = {
  apartment: ['apartment', 'condo'],
  villa: ['villa', 'house'],
  commercial: ['office', 'shop'],
  factory: ['factory'],
  hotel: ['hotel'],
  land: ['land'],
}

export function usePropertyFilters() {
  const { t } = useTranslation()
  // 顶栏全局搜索会带 ?q=... 跳进来，这里作为关键词的初始值
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q')

  // 筛选参数
  const [keyword, setKeyword] = useState(qParam ?? '')
  const [status, setStatus] = useState('')
  // 房产类型大类：与 C 端口径一致（公寓=apartment+condo、商铺办公=office+shop），
  // 不再用单个 property_type 值，避免「公寓」漏掉 condo、「商铺办公」被拆成两个选项
  const [typeClass, setTypeClass] = useState('')
  // 业务线：''=全部 / rent=租房 / resale=二手房 / new=新房（后两者靠 is_new_development 区分）
  const [bizType, setBizType] = useState('')
  // 房间数：''=不限, '0'=单间, '1'/'2'=精确居室, '3'=3室及以上
  const [bedrooms, setBedrooms] = useState('')
  // 价格区间：''=不限, 预设区间 key（如 '5000-10000'/'50000+'）, 'custom'=自定义
  const [priceRange, setPriceRange] = useState('')
  const [priceCustomMin, setPriceCustomMin] = useState('')
  const [priceCustomMax, setPriceCustomMax] = useState('')
  // 面积区间：''=不限, 预设区间 key（如 '50-100'/'200+'）, 'custom'=自定义
  const [areaRange, setAreaRange] = useState('')
  const [areaCustomMin, setAreaCustomMin] = useState('')
  const [areaCustomMax, setAreaCustomMax] = useState('')
  const [sort, setSort] = useState('created')
  const [page, setPage] = useState(1)

  // 已在 /properties 页时再次从顶栏搜索（URL 的 q 变化）也要生效
  useEffect(() => {
    if (qParam == null) return
    setKeyword(qParam)
    setPage(1)
  }, [qParam])

  // 按区域 / 按地铁定位（与租客端 PublicListings 交互逻辑一致）
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area')
  const [locOpen, setLocOpen] = useState(false)                        // 面板开合
  const [districtSel, setDistrictSel] = useState<string | null>(null) // 已选城区 key
  const [metroSel, setMetroSel] = useState<string[]>([])              // 已选站点 name（已确认）
  const [metroDraft, setMetroDraft] = useState<string[]>([])          // 站点多选草稿（确定后提交）
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key)
  // 区域面板：国家 → 省市 → 城区 三级下钻（左栏只列国家，右栏先是省市列表，
  // 点省市后右栏换成它的城区）。此前国家/省市平铺在一列，混杂难找。
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country)
  const [areaDrill, setAreaDrill] = useState<string>('') // 已下钻的省市 cityKey，空 = 停在省市列表
  // 只看带视频
  const [onlyVideo, setOnlyVideo] = useState(false)

  // 已选区域/地铁的命中关键词（并入列表筛选）
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

  // 是否存在生效中的筛选条件（用于空态区分「筛选无结果」与「真没数据」）
  const isFiltering = !!keyword.trim() || !!status || !!typeClass || !!bizType || bedrooms !== '' || priceRange !== '' || areaRange !== '' || activeLocationKw.length > 0 || onlyVideo

  // 定位面板：区域点击即生效且与地铁互斥；地铁为草稿多选，确定后提交
  const applyDistrict = (key: string | null) => {
    if (districtSel === key) { setDistrictSel(null); return }
    setDistrictSel(key)
    setMetroSel([])
    setMetroDraft([])
  }
  const resetLoc = () => { setDistrictSel(null); setMetroSel([]); setMetroDraft([]); setAreaDrill('') }
  const onLocOpenChange = (open: boolean) => {
    if (open) {
      setMetroDraft(metroSel)
      // 回显：已选城区时直接下钻到它所在的省市，否则停在省市列表
      if (districtSel) {
        const g = AREA_GROUPS.find((x) => x.children.some((d) => d.key === districtSel))
        if (g) { setAreaCountry(g.country); setAreaDrill(g.cityKey) }
      }
    }
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
  const clearMetroDraft = () => { setMetroDraft([]); setMetroSel([]) }
  const activeLine = useMemo(() => METRO_LINES.find((l) => l.key === metroLine), [metroLine])
  // 左栏国家清单（按 AREA_GROUPS 出现顺序去重，保持业务顺序）
  const countryList = useMemo(() => Array.from(new Set(AREA_GROUPS.map((g) => g.country))), [])
  // 右栏未下钻时的数据源：当前国家下的省市
  const countryGroups = useMemo(
    () => AREA_GROUPS.filter((g) => g.country === areaCountry),
    [areaCountry],
  )
  // 右栏已下钻时的数据源：该省市的城区
  const activeAreaGroup = useMemo(
    () => AREA_GROUPS.find((g) => g.cityKey === areaDrill),
    [areaDrill],
  )

  // 定位 chip 文案
  const locLabel = (() => {
    if (districtSel) {
      const node = AREA_GROUPS.flatMap((g) => g.children).find((d) => d.key === districtSel)
      return node ? node.label : t('propertiesPage.byArea')
    }
    if (metroSel.length) {
      const first = metroSel[0]
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first
    }
    return t('propertiesPage.byArea')
  })()

  // 当前筛选 + 分页 → 后端查询参数
  const buildParams = useCallback((): QueryParams => {
    const params: QueryParams = {
      page,
      pageSize: PAGE_SIZE,
      sort: SORT_MAP[sort] || 'latest',
    }
    const kw = keyword.trim()
    if (kw) params.q = kw
    if (activeLocationKw.length) params.keywords = activeLocationKw
    if (status) params.status = status
    // 大类 → 后端 property_type 多值（同一个筛选条件内是 OR，跨条件仍是 AND）
    if (typeClass) params.property_type = TYPE_CLASS_MAP[typeClass] ?? [typeClass]
    // 业务线：租房只看有租金；二手房=在售且非新房；新房=在售且标记一手
    if (bizType === 'rent') {
      params.listing_type = 'rent'
    } else if (bizType === 'resale') {
      params.listing_type = 'sell'
      params.is_new_development = false
    } else if (bizType === 'new') {
      params.listing_type = 'sell'
      params.is_new_development = true
    }
    if (onlyVideo) params.has_video = true
    // 房间数：'0'=单间, '1'/'2'/'3' 精确, '4'=≥4
    if (bedrooms !== '') {
      const n = Number(bedrooms)
      params.bedrooms_min = n
      if (bedrooms !== '4') params.bedrooms_max = n
    }
    const price = parseRange(priceRange, priceCustomMin, priceCustomMax)
    if (price.min !== undefined) params.price_min = price.min
    if (price.max !== undefined) params.price_max = price.max
    const area = parseRange(areaRange, areaCustomMin, areaCustomMax)
    if (area.min !== undefined) params.area_min = area.min
    if (area.max !== undefined) params.area_max = area.max
    return params
  }, [page, keyword, activeLocationKw, status, typeClass, bizType, onlyVideo, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort])

  // 筛选/排序变化时回到第 1 页（服务端分页）
  useEffect(() => { setPage(1) }, [keyword, status, typeClass, bizType, activeLocationKw, onlyVideo, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort])

  return {
    keyword, setKeyword,
    status, setStatus,
    typeClass, setTypeClass,
    bizType, setBizType,
    bedrooms, setBedrooms,
    priceRange, setPriceRange,
    priceCustomMin, setPriceCustomMin,
    priceCustomMax, setPriceCustomMax,
    areaRange, setAreaRange,
    areaCustomMin, setAreaCustomMin,
    areaCustomMax, setAreaCustomMax,
    sort, setSort,
    page, setPage,
    locTab, setLocTab,
    locOpen, setLocOpen,
    districtSel,
    metroDraft,
    metroLine, setMetroLine,
    areaCountry, setAreaCountry,
    areaDrill, setAreaDrill,
    onlyVideo, setOnlyVideo,
    activeLocationKw,
    isFiltering,
    activeLine,
    countryList,
    countryGroups,
    activeAreaGroup,
    locLabel,
    applyDistrict,
    resetLoc,
    onLocOpenChange,
    toggleStation,
    confirmMetro,
    clearMetroDraft,
    buildParams,
  }
}

export type PropertyFilters = ReturnType<typeof usePropertyFilters>
