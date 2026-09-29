import { useMemo, useState } from 'react'
import { View, Text, Input, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi } from '@/services/api'
import { publicApi, type PublicSchool } from '@/services/publicApi'
import { AREA_GROUPS } from '@/data/locationArea'
import { useI18n } from '@/i18n'
import '@/styles/filter-panel.scss'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'

interface Property {
  id: string
  room_number?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  bedrooms?: number
  bathrooms?: number
  size_sqm?: number
  status?: string
  photos?: string[]
  furnished?: boolean
  video_url?: string
  [key: string]: any
}

// 状态标签（对齐后端 PropertyStatus: vacant/rented/renewing/maintenance）
const STATUS_META: Record<string, { label: string; cls: string }> = {
  vacant: { label: 'prop.statusVacant', cls: 'p-badge--info' },
  rented: { label: 'prop.statusRented', cls: 'p-badge--success' },
  renewing: { label: 'prop.statusRenewing', cls: 'p-badge--warning' },
  maintenance: { label: 'prop.statusMaintenance', cls: 'p-badge--warning' }
}
const getStatus = (s?: string) =>
  STATUS_META[s ?? ''] ?? { label: s || 'prop.unknown', cls: 'p-badge--neutral' }

const TYPE_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'apartment', label: 'prop.typeApartment' },
  { key: 'house', label: 'prop.typeVilla' },
  { key: 'shop', label: 'prop.typeCommercial' },
  { key: 'office', label: 'prop.typeOffice' }
]

const STATUS_OPTIONS = [
  { key: '', label: 'common.all' },
  { key: 'rented', label: 'prop.statusRented' },
  { key: 'vacant', label: 'prop.statusVacant' },
  { key: 'renewing', label: 'prop.statusRenewing' },
  { key: 'maintenance', label: 'prop.statusMaintenance' }
]

const BED_OPTIONS = [
  { key: '', label: 'prop.bedroomAny' },
  { key: '0', label: 'prop.bedroom0' },
  { key: '1', label: 'prop.bedroom1' },
  { key: '2', label: 'prop.bedroom2' },
  { key: '3', label: 'prop.bedroom3' },
  { key: '4', label: 'prop.bedroom4' }
]

// 价格区间（万/月 THB，语义对齐 C 端）：''=不限, 预设 key, 'custom'=自定义
const PRICE_OPTIONS = [
  { key: '', label: 'prop.priceAny' },
  { key: 'u3', label: 'prop.priceU3' },
  { key: '3-5', label: 'prop.price35' },
  { key: '5-8', label: 'prop.price58' },
  { key: 'g8', label: 'prop.priceG8' },
  { key: 'custom', label: 'prop.custom' }
]

const AREA_OPTIONS = [
  { key: '', label: 'prop.areaAny' },
  { key: '0-50', label: '≤50㎡' },
  { key: '50-100', label: '50-100㎡' },
  { key: '100-150', label: '100-150㎡' },
  { key: '150-200', label: '150-200㎡' },
  { key: '200+', label: '≥200㎡' },
  { key: 'custom', label: 'prop.custom' }
]

const SORT_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'latest', label: 'prop.sortLatest' },
  { key: 'price_asc', label: 'prop.sortPriceAsc' },
  { key: 'price_desc', label: 'prop.sortPriceDesc' },
  { key: 'area_desc', label: 'prop.sortAreaDesc' }
]

// 学校半径（与 C 端一致）：1 / 3 / 5 / 10 km
const RADII = [1, 3, 5, 10]

const TYPE_LABELS: Record<string, string> = {
  apartment: 'prop.typeApartment',
  condo: 'prop.typeApartment',
  house: 'prop.typeHouse',
  villa: 'prop.typeVilla',
  shop: 'prop.typeCommercial',
  commercial: 'prop.typeCommercial',
  office: 'prop.typeOffice'
}

const PAGE_SIZE = 100

function pickList(res: any): Property[] {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

const formatRent = (v?: number, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', USD: '$', EUR: '€' }
  return `${sym[currency || 'THB'] || '฿'}${Number(v || 0).toLocaleString()}`
}

type FilterTab = null | 'region' | 'price' | 'more' | 'sort'

export default function EmployeePropertiesPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [listings, setListings] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')

  // 筛选状态（全部下推后端做真·服务端筛选）
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [priceCustomMin, setPriceCustomMin] = useState('')
  const [priceCustomMax, setPriceCustomMax] = useState('')
  const [areaRange, setAreaRange] = useState('')
  const [areaCustomMin, setAreaCustomMin] = useState('')
  const [areaCustomMax, setAreaCustomMax] = useState('')
  // 区域：国家 → 省市 → 城区 三级下钻（存「省市:城区」复合键，避免同名城区冲突）
  const [region, setRegion] = useState('')
  const [regionOpen, setRegionOpen] = useState(false)
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country)
  const [areaDrill, setAreaDrill] = useState<string>('')
  // 学校：空间筛选（半径内按距离）
  const [schoolId, setSchoolId] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolKm, setSchoolKm] = useState(3)
  const [schools, setSchools] = useState<PublicSchool[]>([])
  const [schoolKw, setSchoolKw] = useState('')

  const [openTab, setOpenTab] = useState<FilterTab>(null)

  const allDistricts = useMemo(
    () => AREA_GROUPS.flatMap((g) => g.children.map((d) => ({ ...d, key: `${g.cityKey}:${d.key}` }))),
    []
  )
  const countryList = useMemo(() => Array.from(new Set(AREA_GROUPS.map((g) => g.country))), [])
  const countryGroups = useMemo(
    () => AREA_GROUPS.filter((g) => g.country === areaCountry),
    [areaCountry]
  )
  const activeAreaGroup = useMemo(() => AREA_GROUPS.find((g) => g.cityKey === areaDrill), [areaDrill])
  const regionLabel = useMemo(
    () => allDistricts.find((d) => d.key === region)?.label || t('prop.regionAny'),
    [region, allDistricts, t]
  )
  const filteredSchools = schoolKw.trim()
    ? schools.filter((s) =>
        `${s.name ?? ''} ${s.name_en ?? ''} ${s.district ?? ''}`
          .toLowerCase()
          .includes(schoolKw.trim().toLowerCase())
      )
    : schools

  // 学校清单只为筛选器备选
  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchList()
  })

  if (schools.length === 0) {
    publicApi
      .schools({ page_size: 100 })
      .then((res: any) => setSchools(pickListPublic(res)))
      .catch(() => setSchools([]))
  }

  // 由筛选 state 构建后端查询参数（overrides 用于状态尚未更新时传本次变更）
  const buildParams = (over: Partial<{
    status: string; type: string; sort: string; bedrooms: string;
    priceRange: string; priceCustomMin: string; priceCustomMax: string;
    areaRange: string; areaCustomMin: string; areaCustomMax: string;
    region: string; schoolId: string; schoolKm: number; q: string
  }> = {}) => {
    const p: Record<string, any> = { page: 1, page_size: PAGE_SIZE, sort: 'latest' }
    const q = over.q ?? query
    const st = over.status ?? status
    const tp = over.type ?? type
    const so = over.sort ?? sort
    const bd = over.bedrooms ?? bedrooms
    const pr = over.priceRange ?? priceRange
    const pcMin = over.priceCustomMin ?? priceCustomMin
    const pcMax = over.priceCustomMax ?? priceCustomMax
    const ar = over.areaRange ?? areaRange
    const acMin = over.areaCustomMin ?? areaCustomMin
    const acMax = over.areaCustomMax ?? areaCustomMax
    const rg = over.region ?? region
    const sid = over.schoolId ?? schoolId
    const skm = over.schoolKm ?? schoolKm

    if (q) p.q = q
    if (st) p.status = st
    if (tp) p.property_type = tp
    if (so) p.sort = so
    // 户型：单间=>0,0；3/4 及以上=>min=key 不设上限
    if (bd !== '') {
      if (bd === '3' || bd === '4') p.bedrooms_min = Number(bd)
      else { p.bedrooms_min = Number(bd); p.bedrooms_max = Number(bd) }
    }
    // 价格区间：按预设（万→THB）/自定义按需设 min/max
    if (pr) {
      if (pr === 'custom') {
        if (pcMin) p.price_min = Number(pcMin) * 10000
        if (pcMax) p.price_max = Number(pcMax) * 10000
      } else if (pr === 'u3') {
        p.price_max = 30000
      } else if (pr === 'g8') {
        p.price_min = 80000
      } else {
        const [mn, mx] = pr.split('-').map(Number)
        if (!Number.isNaN(mn)) p.price_min = mn * 10000
        if (!Number.isNaN(mx)) p.price_max = mx * 10000
      }
    }
    // 面积区间
    if (ar) {
      if (ar === 'custom') {
        if (acMin) p.area_min = Number(acMin)
        if (acMax) p.area_max = Number(acMax)
      } else if (ar === '200+') {
        p.area_min = 200
      } else {
        const [mn, mx] = ar.split('-').map(Number)
        if (!Number.isNaN(mn)) p.area_min = mn
        if (!Number.isNaN(mx)) p.area_max = mx
      }
    }
    // 区域：选中城区关键词走后端 keywords（与租客端同语义）
    if (rg) {
      const node = allDistricts.find((d) => d.key === rg)
      if (node && node.kws.length) p.keywords = node.kws
    }
    // 学校：空间筛选
    if (sid) {
      p.school_id = sid
      p.school_radius_km = skm
    }
    return p
  }

  const fetchList = async (over: Parameters<typeof buildParams>[0] = {}) => {
    setLoading(true)
    setError(false)
    try {
      const res: any = await propertiesApi.list(buildParams(over))
      setListings(pickList(res))
    } catch (err) {
      console.error('[Properties] 获取房源失败', err)
      setError(true)
      Taro.showToast({ title: t('prop.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    const q = keyword.trim()
    setQuery(q)
    fetchList({ q })
  }

  const setWrapper = (key: keyof Parameters<typeof buildParams>[0], val: any) => {
    // 统一入口：更新 state 并携带 overrides 立即重查，避免状态异步竞态
    if (key === 'q') setQuery(val)
    else {
      const setters: Record<string, (v: any) => void> = {
        status: setStatus, type: setType, sort: setSort, bedrooms: setBedrooms,
        priceRange: setPriceRange, priceCustomMin: setPriceCustomMin, priceCustomMax: setPriceCustomMax,
        areaRange: setAreaRange, areaCustomMin: setAreaCustomMin, areaCustomMax: setAreaCustomMax,
        region: setRegion, schoolId: setSchoolId, schoolKm: setSchoolKm
      }
      setters[key]?.(val)
    }
    fetchList({ [key]: val } as any)
  }

  const pickRegion = (key: string | null) => {
    setRegion(key || '')
    fetchList({ region: key || '' })
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

  const labels: Record<string, string> = {
    region: regionLabel,
    sort: t(sort ? (SORT_OPTIONS.find((o) => o.key === sort)?.label || 'pub.filterAny') : 'prop.sortLabel'),
    price: t(priceRange === 'custom'
      ? (priceCustomMin || priceCustomMax ? `${priceCustomMin || '…'} - ${priceCustomMax || '…'}` : 'prop.custom')
      : (priceRange ? (PRICE_OPTIONS.find((o) => o.key === priceRange)?.label || 'prop.priceAny') : 'pub.filterPrice'))
  }
  const activeSet: Record<string, boolean> = {
    region: !!region,
    sort: !!sort,
    price: !!(priceRange || priceCustomMin || priceCustomMax),
    more: !!(status || type || schoolId || bedrooms !== '' || areaRange || areaCustomMin || areaCustomMax)
  }

  const tabs: { key: Exclude<FilterTab, null>; label: string; active: boolean }[] = [
    { key: 'region', label: labels.region, active: activeSet.region },
    { key: 'price', label: labels.price, active: activeSet.price },
    { key: 'more', label: t('pub.filterMore'), active: activeSet.more },
    { key: 'sort', label: labels.sort, active: activeSet.sort }
  ]

  // 标签：由真实字段派生
  const tagsOf = (p: Property): string[] => {
    const tags: string[] = []
    if (p.furnished) tags.push(t('prop.furnishedTag'))
    if (p.video_url) tags.push(t('prop.videoTag'))
    if (Array.isArray(p.photos) && p.photos.length > 0) tags.push(t('prop.photoTag', { n: p.photos.length }))
    return tags.slice(0, 3)
  }

  // 点击卡片 → 操作面板（删除房源等同下架，前台天然隐藏）
  const onCardTap = (it: Property) => {
    Taro.showActionSheet({
      itemList: [t('prop.editListing')],
      success: (r) => {
        if (r.tapIndex === 0) {
          Taro.navigateTo({ url: `/pages/employee/property-edit/index?id=${it.id}` })
        }
      }
    })
  }

  return (
    <View className='p-page'>
      <ShellHeader title={t('nav.properties')} />
      {/* 搜索 + 筛选区（对齐浏览页：pb-search-wrap > pb-search / pb-filters / pb-panel） */}
      <View className='pb-search-wrap'>
        <View className='pb-search'>
          <Input
            className='pb-search__input'
            value={keyword}
            placeholder={t('prop.searchPlaceholder')}
            placeholderStyle='color:#98a1ab'
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
                if (tb.key === 'region') { setRegionOpen(true); setAreaDrill(''); }
                setOpenTab(tb.key as Exclude<FilterTab, null>)
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
                    onClick={() => { setSort(o.key); fetchList({ sort: o.key } as any); setOpenTab(null) }}
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
                      onClick={() => setWrapper('priceRange', o.key)}
                    >
                      <Text>{t(o.label)}</Text>
                    </View>
                  ))}
                </View>
                {priceRange === 'custom' && (
                  <View className='pb-range'>
                    <Input className='pb-range__input' type='number' value={priceCustomMin} onInput={(e: any) => setWrapper('priceCustomMin', e.detail.value)} placeholder={t('prop.min')} />
                    <Text className='pb-range__sep'>-</Text>
                    <Input className='pb-range__input' type='number' value={priceCustomMax} onInput={(e: any) => setWrapper('priceCustomMax', e.detail.value)} placeholder={t('prop.max')} />
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
                  {STATUS_OPTIONS.map((o) => (
                    <View
                      key={o.key}
                      className={`pb-opt ${status === o.key ? 'pb-opt--active' : ''}`}
                      onClick={() => setWrapper('status', o.key)}
                    >
                      <Text>{t(o.label)}</Text>
                    </View>
                  ))}
                </View>

                <View className='pb-group-label'>{t('prop.typeLabel')}</View>
                <View className='pb-panel__chips'>
                  {TYPE_OPTIONS.map((o) => (
                    <View
                      key={o.key}
                      className={`pb-opt ${type === o.key ? 'pb-opt--active' : ''}`}
                      onClick={() => setWrapper('type', o.key)}
                    >
                      <Text>{t(o.label)}</Text>
                    </View>
                  ))}
                </View>

                <View className='pb-group-label'>{t('pub.filterBeds')}</View>
                <View className='pb-panel__chips'>
                  {BED_OPTIONS.map((o) => (
                    <View
                      key={o.key}
                      className={`pb-opt ${bedrooms === o.key ? 'pb-opt--active' : ''}`}
                      onClick={() => setWrapper('bedrooms', o.key)}
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
                      onClick={() => setWrapper('areaRange', o.key)}
                    >
                      <Text>{t(o.label)}</Text>
                    </View>
                  ))}
                </View>
                {areaRange === 'custom' && (
                  <View className='pb-range'>
                    <Input className='pb-range__input' type='number' value={areaCustomMin} onInput={(e: any) => setWrapper('areaCustomMin', e.detail.value)} placeholder={t('prop.minArea')} />
                    <Text className='pb-range__sep'>-</Text>
                    <Input className='pb-range__input' type='number' value={areaCustomMax} onInput={(e: any) => setWrapper('areaCustomMax', e.detail.value)} placeholder={t('prop.maxArea')} />
                  </View>
                )}

                <View className='pb-group-label'>{t('pub.filterSchool')}</View>
                <View className='pb-school'>
                  <View className='pb-panel__chips'>
                    {RADII.map((km) => (
                      <View
                        key={km}
                        className={`pb-opt ${schoolKm === km ? 'pb-opt--active' : ''}`}
                        onClick={() => setWrapper('schoolKm', km)}
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
                      placeholderStyle='color:#98a1ab'
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
                        onClick={() => { setAreaCountry(c); setAreaDrill('') }}
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
                          <View className={`pb-opt ${region === '' ? 'pb-opt--active' : ''}`} onClick={() => pickRegion(null)}>
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
                              onClick={() => setAreaDrill(g.cityKey)}
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

      <View className='p-body'>
        {/* 结果统计行 */}
        <View className='p-count'>
          <Text className='p-count__text'>
            {t('prop.countTotal')}{' '}
            <Text className='p-count__strong'>{listings.length}</Text> {t('prop.countUnitShort')} ·{' '}
            {t('prop.countVacant')}{' '}
            <Text className='p-count__strong p-count__strong--vacant'>
              {listings.filter((it) => it.status === 'vacant').length}
            </Text>{' '}
            {t('prop.countUnitShort')}
          </Text>
        </View>

        {loading && listings.length === 0 ? (
          <View className='p-state p-state--loading'>
            <View className='p-state__spinner' />
            <Text className='p-state__title'>{t('prop.loadingList')}</Text>
          </View>
        ) : error ? (
          <View className='p-state'>
            <Text className='p-state__title'>{t('common.loadFailed')}</Text>
            <View className='p-retry' onClick={() => fetchList()}>
              <Text className='p-retry__text'>{t('common.tapRetry')}</Text>
            </View>
          </View>
        ) : listings.length === 0 ? (
          <View className='p-state'>
            <Text className='p-state__title'>{t('prop.empty')}</Text>
            <Text className='p-state__desc'>{t('prop.emptyFiltered')}</Text>
          </View>
        ) : (
          listings.map((it) => {
            const st = getStatus(it.status)
            const photo = Array.isArray(it.photos) && it.photos.length ? it.photos[0] : ''
            const tags = tagsOf(it)
            return (
              <View
                key={it.id}
                className='p-card'
                hoverClass='p-card--hover'
                onClick={() => onCardTap(it)}
              >
                <View className='p-card__thumb'>
                  {photo ? (
                    <Image className='p-card__photo' src={photo} mode='aspectFill' lazyLoad />
                  ) : (
                    <Text className='p-card__ph'>{t('prop.listing')}</Text>
                  )}
                  <View className='p-card__type'>
                    <Text>{t(TYPE_LABELS[String(it.property_type || '').toLowerCase()] || 'prop.listing')}</Text>
                  </View>
                </View>

                <View className='p-card__body'>
                  <Text className='p-card__name'>{it.room_number || t('prop.unnamed')}</Text>
                  <Text className='p-card__addr'>{it.address || t('prop.noAddress')}</Text>

                  {tags.length > 0 && (
                    <View className='p-card__tags'>
                      {tags.map((tag) => (
                        <Text key={tag} className='p-card__tag'>{tag}</Text>
                      ))}
                    </View>
                  )}

                  <Text className='p-card__stats'>
                    {it.size_sqm || 0}㎡ · {t('prop.bedroomUnit', { n: it.bedrooms || 0 })}{' '}
                    {t('prop.bathroomUnit', { n: it.bathrooms || 0 })}
                  </Text>

                  {it.status === 'vacant' && (
                    <Text className='p-card__tenant p-card__tenant--vacant'>{t('prop.noLease')}</Text>
                  )}

                  <View className='p-card__bottom'>
                    <Text className='p-card__rent'>
                      {formatRent(it.monthly_rent, it.currency)}
                      <Text className='p-card__unit'>{t('pub.perMonth')}</Text>
                    </Text>
                    <View className='p-card__badges'>
                      <View className={`p-badge ${st.cls}`}>
                        <Text>{t(st.label)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}

// publicApi.schools 响应用 unwrapPage 形态或直接数组
function pickListPublic(res: any): PublicSchool[] {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}