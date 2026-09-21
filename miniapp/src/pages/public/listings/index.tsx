/**
 * C 端房源列表（匿名可浏览，无需注册）。
 *
 * 数据源是 `/public/listings`（不是站内 `/listings` 或 `/properties`——那两个强制鉴权，
 * 匿名请求直接 401，这就是此前「未登录什么都看不到」的根因）。
 *
 * 两个关键设计：
 * 1. **服务端分页 + 筛选**：不再把全量数据拉到前端过滤。后端 `PaginationParams`
 *    把 `page_size` 顶在 100，前端传 999 会被静默截断，于是总数按 100 条算、
 *    第 100 条之后永远翻不到。
 * 2. **按学校找房是空间筛选**：选一所学校 + 半径，后端用 haversine 算真实距离，
 *    结果按距离由近到远，卡片回显「距 XX 约 N 公里」。不做「学区房」布尔标签——
 *    泰国没有划片入学，国际学校是「付费 + 距离」逻辑。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, Image, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  publicApi,
  unwrapPage,
  type PublicListing,
  type PublicSchool
} from '@/services/publicApi'
import { coverOf, listingTypeLabel, loadRates } from '@/lib/publicSite'
import { fmtMoney } from '@/utils/format'
import { AREA_GROUPS } from '@/data/locationArea'
import { METRO_LINES } from '@/data/locationMetro'
import BottomNav from '@/components/BottomNav'
import './index.scss'

const PAGE_SIZE = 20
const RADII = [1, 3, 5, 10]
const SORTS: Array<[string, string]> = [
  ['latest', '最新'],
  ['price_asc', '价格从低到高'],
  ['price_desc', '价格从高到低'],
  ['area_desc', '面积从大到小'],
  ['distance', '距离最近']
]

// 价格 / 面积区间：预设快捷区间 + 自定义最低最高（与 Web、App 三端口径一致）
interface RangePreset {
  key: string
  label: string
  min: number
  max: number
}
const PRICE_RANGES: RangePreset[] = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u1', label: '≤1万', min: 0, max: 10000 },
  { key: '1-3', label: '1-3万', min: 10000, max: 30000 },
  { key: '3-5', label: '3-5万', min: 30000, max: 50000 },
  { key: 'g5', label: '≥5万', min: 50000, max: Infinity }
]
const AREA_PRESETS: RangePreset[] = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u50', label: '≤50㎡', min: 0, max: 50 },
  { key: '50-100', label: '50-100㎡', min: 50, max: 100 },
  { key: '100-150', label: '100-150㎡', min: 100, max: 150 },
  { key: '150-200', label: '150-200㎡', min: 150, max: 200 },
  { key: 'g200', label: '≥200㎡', min: 200, max: Infinity }
]
const BEDROOM_OPTIONS: Array<[string, string]> = [
  ['', '不限'],
  ['1', '1室'],
  ['2', '2室'],
  ['3', '3室'],
  ['4', '4室+']
]
const STATUS_FILTERS: Array<[string, string]> = [
  ['', '不限'],
  ['vacant', '空置'],
  ['rented', '已出租'],
  ['reserved', '已预订'],
  ['maintenance', '维护中']
]

type FilterTab = '' | 'region' | 'school' | 'price' | 'layout' | 'more' | 'sort'

export default function PublicListingsPage() {
  // ---- 基础筛选 ----
  const [type, setType] = useState('')
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState('latest')

  // ---- 价格 / 面积 / 户型 / 状态 ----
  const [priceRange, setPriceRange] = useState('')
  const [priceCustomMin, setPriceCustomMin] = useState('')
  const [priceCustomMax, setPriceCustomMax] = useState('')
  const [areaRange, setAreaRange] = useState('')
  const [areaCustomMin, setAreaCustomMin] = useState('')
  const [areaCustomMax, setAreaCustomMax] = useState('')
  const [bedsMin, setBedsMin] = useState('')
  const [statusSel, setStatusSel] = useState('')

  // ---- 区域 / 地铁（链家式两栏：左一级、右二级）----
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area')
  // 区域面板：国家 → 省市 → 城区 三级下钻（左栏只列国家，右栏先是省市列表，
  // 点省市后右栏换成它的城区）。此前国家/省市平铺在一列，混杂难找。
  const [areaCountry, setAreaCountry] = useState(AREA_GROUPS[0].country)
  const [areaDrill, setAreaDrill] = useState('') // 已下钻的省市 cityKey，空 = 停在省市列表
  const [districtSel, setDistrictSel] = useState<string | null>(null)
  const [metroSel, setMetroSel] = useState<string[]>([])
  const [metroDraft, setMetroDraft] = useState<string[]>([])
  const [metroLine, setMetroLine] = useState(METRO_LINES[0].key)

  // ---- 学校筛选（空间筛选）----
  const [schoolId, setSchoolId] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolKm, setSchoolKm] = useState(3)
  const [schools, setSchools] = useState<PublicSchool[]>([])
  const [schoolKw, setSchoolKw] = useState('')

  // ---- 下拉面板 ----
  const [openTab, setOpenTab] = useState<FilterTab>('')

  // ---- 列表状态 ----
  const [items, setItems] = useState<PublicListing[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    loadRates()
    // 学校清单只为筛选器备选，取前 100 条即可
    publicApi
      .schools({ page_size: 100 })
      .then((res) => setSchools(unwrapPage<PublicSchool>(res).items))
      .catch(() => setSchools([]))
  }, [])

  // 关键词防抖：输入时不打接口，停 350ms 再查
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350)
    return () => clearTimeout(timer)
  }, [keyword])

  // ---------- 区域 / 地铁 ----------
  const allDistricts = useMemo(() => AREA_GROUPS.flatMap((g) => g.children), [])
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
  const activeLine = useMemo(
    () => METRO_LINES.find((l) => l.key === metroLine),
    [metroLine]
  )
  // 已选城区 / 站点的同义词组，作为 keywords 交给后端任一命中
  const activeLocationKw = useMemo(() => {
    if (districtSel) return allDistricts.find((d) => d.key === districtSel)?.kws ?? []
    if (metroSel.length) {
      return METRO_LINES.flatMap((l) => l.stations)
        .filter((s) => metroSel.includes(s.name))
        .flatMap((s) => s.kws)
    }
    return []
  }, [districtSel, metroSel, allDistricts])
  const regionLabel = useMemo(() => {
    if (districtSel) return allDistricts.find((d) => d.key === districtSel)?.label ?? '区域'
    if (metroSel.length) {
      return metroSel.length > 1 ? `${metroSel[0]} +${metroSel.length - 1}` : metroSel[0]
    }
    return '区域'
  }, [districtSel, metroSel, allDistricts])

  // 城区实时单选，且与地铁互斥
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
    setMetroDraft((d) => (d.includes(name) ? d.filter((s) => s !== name) : [...d, name]))
  }

  // ---------- 学校 ----------
  const filteredSchools = schoolKw.trim()
    ? schools.filter((s) =>
        `${s.name ?? ''} ${s.name_en ?? ''} ${s.district ?? ''}`
          .toLowerCase()
          .includes(schoolKw.trim().toLowerCase())
      )
    : schools

  // ---------- 请求 ----------
  const fetchPage = useCallback(
    async (targetPage: number) => {
      if (targetPage === 1) setLoading(true)
      else setLoadingMore(true)
      // 预设区间优先；选了预设就忽略自定义输入（对齐 Web/App 的互斥语义）
      const pPreset = PRICE_RANGES.find((r) => r.key === priceRange)
      const aPreset = AREA_PRESETS.find((r) => r.key === areaRange)
      const priceMin = pPreset?.key
        ? pPreset.min
        : priceCustomMin
        ? Number(priceCustomMin)
        : undefined
      const priceMax = pPreset?.key
        ? isFinite(pPreset.max)
          ? pPreset.max
          : undefined
        : priceCustomMax
        ? Number(priceCustomMax)
        : undefined
      const areaMin = aPreset?.key
        ? aPreset.min
        : areaCustomMin
        ? Number(areaCustomMin)
        : undefined
      const areaMax = aPreset?.key
        ? isFinite(aPreset.max)
          ? aPreset.max
          : undefined
        : areaCustomMax
        ? Number(areaCustomMax)
        : undefined
      try {
        const res = await publicApi.listings({
          page: targetPage,
          page_size: PAGE_SIZE,
          listing_type: (type || undefined) as 'rent' | 'sell' | undefined,
          q: debounced || undefined,
          // 选了学校时默认按距离排序（学区找房的自然语义）
          sort: (schoolId && sort === 'latest' ? 'distance' : sort) as any,
          price_min: priceMin,
          price_max: priceMax,
          area_min: areaMin,
          area_max: areaMax,
          bedrooms_min: bedsMin ? Number(bedsMin) : undefined,
          status: statusSel || undefined,
          keywords: activeLocationKw.length ? activeLocationKw : undefined,
          school_id: schoolId || undefined,
          school_radius_km: schoolId ? schoolKm : undefined
        })
        const pageData = unwrapPage<PublicListing>(res)
        setTotal(pageData.total)
        setPage(targetPage)
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]))
      } catch (err) {
        console.error('[public listings] 加载失败', err)
        if (targetPage === 1) {
          setItems([])
          setTotal(0)
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [
      type,
      debounced,
      sort,
      priceRange,
      priceCustomMin,
      priceCustomMax,
      areaRange,
      areaCustomMin,
      areaCustomMax,
      bedsMin,
      statusSel,
      activeLocationKw,
      schoolId,
      schoolKm
    ]
  )

  // 筛选变化 → 回到第 1 页
  useEffect(() => {
    fetchPage(1)
  }, [fetchPage])

  const loadMore = () => {
    if (loading || loadingMore || items.length >= total) return
    fetchPage(page + 1)
  }

  // ---------- Tab 栏 ----------
  const hasPriceFilter = !!(priceRange || priceCustomMin || priceCustomMax)
  const hasAreaFilter = !!(areaRange || areaCustomMin || areaCustomMax)
  const moreBadge = (hasAreaFilter ? 1 : 0) + (statusSel ? 1 : 0)

  const tabs: Array<{ key: FilterTab; label: string; active: boolean; badge: number }> = [
    { key: 'region', label: activeLocationKw.length ? regionLabel : '区域', active: !!activeLocationKw.length, badge: 0 },
    { key: 'school', label: schoolId ? `${schoolName} · ${schoolKm}km` : '学校', active: !!schoolId, badge: 0 },
    { key: 'price', label: hasPriceFilter ? '已选价格' : '价格', active: hasPriceFilter, badge: 0 },
    { key: 'layout', label: bedsMin ? `${bedsMin}室+` : '户型', active: !!bedsMin, badge: 0 },
    { key: 'more', label: '更多', active: moreBadge > 0, badge: moreBadge },
    { key: 'sort', label: sort !== 'latest' ? SORTS.find(([k]) => k === sort)?.[1] ?? '排序' : '排序', active: sort !== 'latest', badge: 0 }
  ]

  const toggleTab = (key: FilterTab) => {
    if (openTab === key) {
      setOpenTab('')
      return
    }
    setOpenTab(key)
    if (key === 'region') {
      setMetroDraft(metroSel)
      if (!districtSel && metroSel.length) setLocTab('metro')
      // 回显：已选城区时直接下钻到它所在的省市，否则停在省市列表
      if (districtSel) {
        const g = AREA_GROUPS.find((x) => x.children.some((d) => d.key === districtSel))
        if (g) {
          setAreaCountry(g.country)
          setAreaDrill(g.cityKey)
        }
      }
    }
  }

  const resetCurrent = (key: FilterTab) => {
    if (key === 'region') {
      setDistrictSel(null)
      setMetroSel([])
      setMetroDraft([])
      setAreaDrill('')
    } else if (key === 'price') {
      setPriceRange('')
      setPriceCustomMin('')
      setPriceCustomMax('')
    } else if (key === 'layout') {
      setBedsMin('')
    } else if (key === 'more') {
      setAreaRange('')
      setAreaCustomMin('')
      setAreaCustomMax('')
      setStatusSel('')
    } else if (key === 'school') {
      setSchoolId('')
      setSchoolName('')
      setSchoolKm(3)
    }
  }

  const confirmCurrent = (key: FilterTab) => {
    if (key === 'region') setMetroSel(metroDraft)
    setOpenTab('')
  }

  const openDetail = (id: string) =>
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })

  return (
    <View className='pub-page'>
      <View className='pub-inner'>
        <View className='pub-head'>
          <Text className='pub-head__title'>房源</Text>
          <Text className='pub-head__hint'>
            全站房源公开浏览，无需注册；需要联系房东或经纪人时再登录。
          </Text>
          <Input
            className='pub-search'
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            placeholder='小区 / 地址 / 房号'
            confirmType='search'
          />
        </View>

        {/* 租 / 售 分段 */}
        <View className='pub-segment'>
          {[
            ['', '租售不限'],
            ['rent', '租房'],
            ['sell', '买房']
          ].map(([key, label]) => (
            <View
              key={key || 'all'}
              className={`pub-segment__item${type === key ? ' pub-segment__item--on' : ''}`}
              onClick={() => setType(key)}
            >
              <Text>{label}</Text>
            </View>
          ))}
        </View>

        {/* 链家式单行筛选栏：点 Tab 从下方展开面板，不做底部弹层 */}
        <View className='pub-filter'>
          <View className='pub-filter__tabs'>
            {tabs.map((tb) => (
              <View
                key={tb.key}
                className={`pub-filter__tab${tb.active ? ' pub-filter__tab--on' : ''}${
                  openTab === tb.key ? ' pub-filter__tab--open' : ''
                }`}
                onClick={() => toggleTab(tb.key)}
              >
                <Text className='pub-filter__tab-text'>{tb.label}</Text>
                {tb.badge > 0 ? <Text className='pub-filter__badge'>{tb.badge}</Text> : null}
                <Text className='pub-filter__caret'>{openTab === tb.key ? '▲' : '▼'}</Text>
              </View>
            ))}
          </View>

          {openTab === 'region' ? (
            <View className='pub-filter__panel'>
              <View className='pub-loc-tabs'>
                {(['area', 'metro'] as const).map((t) => (
                  <View
                    key={t}
                    className={`pub-loc-tab${locTab === t ? ' pub-loc-tab--on' : ''}`}
                    onClick={() => setLocTab(t)}
                  >
                    <Text>{t === 'area' ? '区域' : '地铁'}</Text>
                  </View>
                ))}
              </View>
              {locTab === 'area' ? (
                <View className='pub-twocol pub-twocol--area'>
                  <ScrollView className='pub-twocol__left' scrollY>
                    {countryList.map((c) => (
                      <View
                        key={c}
                        className={`pub-twocol__item${
                          areaCountry === c ? ' pub-twocol__item--on' : ''
                        }`}
                        onClick={() => {
                          setAreaCountry(c)
                          setAreaDrill('')
                        }}
                      >
                        <Text>{c}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  <ScrollView className='pub-twocol__right' scrollY>
                    {activeAreaGroup ? (
                      <>
                        <View className='pub-drill-head' onClick={() => setAreaDrill('')}>
                          <Text className='pub-drill-head__back'>← {areaCountry}</Text>
                          <Text className='pub-chips__label pub-chips__label--flat'>
                            {activeAreaGroup.cityLabel}
                          </Text>
                        </View>
                        <View className='pub-chips pub-chips--wrap'>
                          <View
                            className={`pub-chip${districtSel === null ? ' pub-chip--on' : ''}`}
                            onClick={() => applyDistrict(null)}
                          >
                            <Text>不限</Text>
                          </View>
                          {activeAreaGroup.children.map((d) => (
                            <View
                              key={d.key}
                              className={`pub-chip${districtSel === d.key ? ' pub-chip--on' : ''}`}
                              onClick={() => applyDistrict(d.key)}
                            >
                              <Text>{d.label}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    ) : (
                      <>
                        <Text className='pub-chips__label pub-chips__label--flat'>{areaCountry}</Text>
                        <View className='pub-chips pub-chips--wrap'>
                          {countryGroups.map((g) => (
                            <View
                              key={g.cityKey}
                              className={`pub-chip${areaDrill === g.cityKey ? ' pub-chip--on' : ''}`}
                              onClick={() => setAreaDrill(g.cityKey)}
                            >
                              <Text>{g.cityLabel}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                  </ScrollView>
                </View>
              ) : (
                <View className='pub-twocol'>
                  <ScrollView className='pub-twocol__left' scrollY>
                    {METRO_LINES.map((l) => (
                      <View
                        key={l.key}
                        className={`pub-twocol__item${
                          metroLine === l.key ? ' pub-twocol__item--on' : ''
                        }`}
                        onClick={() => setMetroLine(l.key)}
                      >
                        <Text>{l.name}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  <ScrollView className='pub-twocol__right' scrollY>
                    <Text className='pub-chips__label pub-chips__label--flat'>
                      {activeLine ? `${activeLine.cityLabel} · ${activeLine.name}` : ''}
                      {metroDraft.length ? ` · 已选 ${metroDraft.length}` : ''}
                    </Text>
                    <View className='pub-chips pub-chips--wrap'>
                      {activeLine?.stations.map((s) => (
                        <View
                          key={s.name}
                          className={`pub-chip${metroDraft.includes(s.name) ? ' pub-chip--on' : ''}`}
                          onClick={() => toggleStation(s.name)}
                        >
                          <Text>{s.name}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
              <View className='pub-filter__actions'>
                <View className='btn btn--secondary' onClick={() => resetCurrent('region')}>
                  <Text>重置</Text>
                </View>
                <View className='btn btn--primary' onClick={() => confirmCurrent('region')}>
                  <Text>确定</Text>
                </View>
              </View>
            </View>
          ) : null}

          {openTab === 'school' ? (
            <View className='pub-filter__panel'>
              <View className='pub-filter__pad'>
                <Text className='pub-chips__label pub-chips__label--flat'>距离范围</Text>
                <View className='pub-chips'>
                  {RADII.map((km) => (
                    <View
                      key={km}
                      className={`pub-chip${schoolKm === km ? ' pub-chip--on' : ''}`}
                      onClick={() => setSchoolKm(km)}
                    >
                      <Text>{km} 公里</Text>
                    </View>
                  ))}
                </View>
                <Input
                  className='pub-search pub-search--flat'
                  value={schoolKw}
                  onInput={(e) => setSchoolKw(e.detail.value)}
                  placeholder='学校名称 / 英文名'
                />
              </View>
              <ScrollView className='pub-filter__scroll' scrollY>
                {filteredSchools.length === 0 ? (
                  <View className='pub-empty'>暂无学校数据</View>
                ) : (
                  filteredSchools.map((school) => (
                    <View
                      key={school.id}
                      className={`pub-sheet__row${
                        schoolId === school.id ? ' pub-sheet__row--on' : ''
                      }`}
                      onClick={() => {
                        setSchoolId(school.id)
                        setSchoolName(school.name ?? '')
                        setOpenTab('')
                      }}
                    >
                      <View className='pub-row__main'>
                        <Text className='pub-row__title'>{school.name}</Text>
                        {school.name_en || school.district ? (
                          <Text className='pub-row__sub'>
                            {[school.name_en, school.district].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      {schoolId === school.id ? <Text className='pub-row__action'>已选</Text> : null}
                    </View>
                  ))
                )}
              </ScrollView>
              <View className='pub-filter__actions'>
                <View className='btn btn--secondary' onClick={() => resetCurrent('school')}>
                  <Text>不限学校</Text>
                </View>
                <View className='btn btn--primary' onClick={() => setOpenTab('')}>
                  <Text>确定</Text>
                </View>
              </View>
            </View>
          ) : null}

          {openTab === 'price' ? (
            <View className='pub-filter__panel'>
              <View className='pub-filter__pad'>
                <Text className='pub-chips__label pub-chips__label--flat'>快捷选择</Text>
                <View className='pub-chips pub-chips--wrap'>
                  {PRICE_RANGES.map((r) => (
                    <View
                      key={r.key || 'all'}
                      className={`pub-chip${priceRange === r.key ? ' pub-chip--on' : ''}`}
                      onClick={() => {
                        setPriceRange(r.key)
                        if (r.key) {
                          setPriceCustomMin('')
                          setPriceCustomMax('')
                        }
                      }}
                    >
                      <Text>{r.label}</Text>
                    </View>
                  ))}
                </View>
                <Text className='pub-chips__label'>自定义价格</Text>
                <View className='pub-range'>
                  <Input
                    className='pub-range__input'
                    type='number'
                    value={priceCustomMin}
                    onInput={(e) => {
                      const v = e.detail.value
                      if (v) setPriceRange('')
                      setPriceCustomMin(v)
                    }}
                    placeholder='最低'
                  />
                  <Text className='pub-range__to'>至</Text>
                  <Input
                    className='pub-range__input'
                    type='number'
                    value={priceCustomMax}
                    onInput={(e) => {
                      const v = e.detail.value
                      if (v) setPriceRange('')
                      setPriceCustomMax(v)
                    }}
                    placeholder='最高'
                  />
                  <Text className='pub-range__unit'>万/月</Text>
                </View>
              </View>
              <View className='pub-filter__actions'>
                <View className='btn btn--secondary' onClick={() => resetCurrent('price')}>
                  <Text>重置</Text>
                </View>
                <View className='btn btn--primary' onClick={() => setOpenTab('')}>
                  <Text>确定</Text>
                </View>
              </View>
            </View>
          ) : null}

          {openTab === 'layout' ? (
            <View className='pub-filter__panel'>
              <View className='pub-filter__pad'>
                <Text className='pub-chips__label pub-chips__label--flat'>户型</Text>
                <View className='pub-chips pub-chips--wrap'>
                  {BEDROOM_OPTIONS.map(([key, label]) => (
                    <View
                      key={key || 'any'}
                      className={`pub-chip${bedsMin === key ? ' pub-chip--on' : ''}`}
                      onClick={() => setBedsMin(key)}
                    >
                      <Text>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View className='pub-filter__actions'>
                <View className='btn btn--secondary' onClick={() => resetCurrent('layout')}>
                  <Text>重置</Text>
                </View>
                <View className='btn btn--primary' onClick={() => setOpenTab('')}>
                  <Text>确定</Text>
                </View>
              </View>
            </View>
          ) : null}

          {openTab === 'more' ? (
            <View className='pub-filter__panel'>
              <View className='pub-filter__pad'>
                <Text className='pub-chips__label pub-chips__label--flat'>面积</Text>
                <View className='pub-chips pub-chips--wrap'>
                  {AREA_PRESETS.map((r) => (
                    <View
                      key={r.key || 'all'}
                      className={`pub-chip${areaRange === r.key ? ' pub-chip--on' : ''}`}
                      onClick={() => {
                        setAreaRange(r.key)
                        if (r.key) {
                          setAreaCustomMin('')
                          setAreaCustomMax('')
                        }
                      }}
                    >
                      <Text>{r.label}</Text>
                    </View>
                  ))}
                </View>
                <Text className='pub-chips__label'>自定义面积</Text>
                <View className='pub-range'>
                  <Input
                    className='pub-range__input'
                    type='number'
                    value={areaCustomMin}
                    onInput={(e) => {
                      const v = e.detail.value
                      if (v) setAreaRange('')
                      setAreaCustomMin(v)
                    }}
                    placeholder='最低'
                  />
                  <Text className='pub-range__to'>至</Text>
                  <Input
                    className='pub-range__input'
                    type='number'
                    value={areaCustomMax}
                    onInput={(e) => {
                      const v = e.detail.value
                      if (v) setAreaRange('')
                      setAreaCustomMax(v)
                    }}
                    placeholder='最高'
                  />
                  <Text className='pub-range__unit'>㎡</Text>
                </View>
                <Text className='pub-chips__label'>房源状态</Text>
                <View className='pub-chips pub-chips--wrap'>
                  {STATUS_FILTERS.map(([key, label]) => (
                    <View
                      key={key || 'all'}
                      className={`pub-chip${statusSel === key ? ' pub-chip--on' : ''}`}
                      onClick={() => setStatusSel(key)}
                    >
                      <Text>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View className='pub-filter__actions'>
                <View className='btn btn--secondary' onClick={() => resetCurrent('more')}>
                  <Text>重置</Text>
                </View>
                <View className='btn btn--primary' onClick={() => setOpenTab('')}>
                  <Text>确定</Text>
                </View>
              </View>
            </View>
          ) : null}

          {openTab === 'sort' ? (
            <View className='pub-filter__panel'>
              {SORTS.filter(([key]) => key !== 'distance' || !!schoolId).map(([key, label]) => (
                <View
                  key={key}
                  className={`pub-sheet__row${sort === key ? ' pub-sheet__row--on' : ''}`}
                  onClick={() => {
                    setSort(key)
                    setOpenTab('')
                  }}
                >
                  <View className='pub-row__main'>
                    <Text className='pub-row__title'>{label}</Text>
                  </View>
                  {sort === key ? <Text className='pub-row__action'>已选</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <Text className='pub-count'>共 {total} 套房源</Text>

        {loading ? (
          <View className='pub-loading'>加载中...</View>
        ) : items.length === 0 ? (
          <View className='pub-empty'>暂无房源，试试放宽筛选条件</View>
        ) : (
          <>
            {items.map((item) => {
              const cover = coverOf(item)
              const isSell = item.listing_type === 'sell'
              const price = item.price ?? (isSell ? item.asking_price : item.monthly_rent)
              return (
                <View
                  key={item.id}
                  className='pub-listing'
                  onClick={() => openDetail(item.id)}
                >
                  <View className='pub-listing__media'>
                    {cover ? (
                      <Image className='pub-listing__img' src={cover} mode='aspectFill' />
                    ) : (
                      <View className='pub-listing__noimg'>
                        <Text>暂无图片</Text>
                      </View>
                    )}
                    {item.listing_type ? (
                      <View
                        className={`pub-listing__type${
                          isSell ? ' pub-listing__type--sell' : ''
                        }`}
                      >
                        <Text>{listingTypeLabel(item.listing_type)}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View className='pub-listing__body'>
                    <Text className='pub-listing__title'>
                      {item.project_name || item.room_number || '房源'}
                    </Text>
                    {item.room_number && item.project_name ? (
                      <Text className='pub-listing__unit'>{item.room_number}</Text>
                    ) : null}
                    {item.address ? (
                      <Text className='pub-listing__addr'>{item.address}</Text>
                    ) : null}

                    <View className='pub-listing__facts'>
                      {item.bedrooms != null ? <Text>{item.bedrooms} BED</Text> : null}
                      {item.bathrooms != null ? <Text>{item.bathrooms} BATH</Text> : null}
                      {item.size_sqm != null ? <Text>{item.size_sqm} ㎡</Text> : null}
                    </View>

                    <Text className='pub-listing__price'>
                      {fmtMoney(price, item.currency || 'THB')}
                      {isSell ? null : (
                        <Text className='pub-listing__price-sub'>/月</Text>
                      )}
                    </Text>

                    {/* 学区筛选生效的回显：不显示这行，用户选了学校也看不出筛在哪 */}
                    {item.nearest_school_km != null && item.nearest_school_name ? (
                      <Text className='pub-listing__school'>
                        距 {item.nearest_school_name} 约 {item.nearest_school_km} 公里
                      </Text>
                    ) : null}
                  </View>
                </View>
              )
            })}

            {loadingMore ? (
              <View className='pub-loading'>加载中...</View>
            ) : items.length < total ? (
              <View className='btn btn--secondary' onClick={loadMore}>
                <Text>加载更多</Text>
              </View>
            ) : (
              <View className='pub-footer-note'>没有更多了</View>
            )}
          </>
        )}
      </View>

      <BottomNav role='guest' active='browse' />
    </View>
  )
}
