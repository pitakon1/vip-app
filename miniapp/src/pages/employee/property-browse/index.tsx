import { useMemo, useState } from 'react'
import { View, Text, Input, Image, Picker, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi, favoritesApi, viewingsApi } from '@/services/api'
import { publicApi, type PublicSchool } from '@/services/publicApi'
import { AREA_GROUPS } from '@/data/locationArea'
import BottomNav from '@/components/BottomNav'
import { useI18n } from '@/i18n'
import '@/styles/filter-panel.scss'
import './index.scss'

interface Property {
  id: string
  room_number?: string
  address?: string
  floor?: string | number
  building?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  status?: string
  photos?: string[]
  furnished?: boolean
  available_from?: string
  video_url?: string
  [key: string]: any
}

const TYPE_LABELS: Record<string, string> = {
  apartment: 'prop.typeApartment',
  condo: 'prop.typeApartment',
  house: 'prop.typeHouse',
  villa: 'prop.typeVilla',
  shop: 'prop.typeCommercial',
  commercial: 'prop.typeCommercial',
  office: 'prop.typeOffice'
}

const PAGE_SIZE = 10

// 单行筛选 tab：区域 / 价格 / 更多 / 排序（对齐 App 图二）；状态 / 房型 / 户型 / 面积 / 学校收进「更多」
type FilterTab = null | 'region' | 'price' | 'more' | 'sort'

const STATUS_OPTIONS = [
  { key: '', label: 'common.all' },
  { key: 'rented', label: 'prop.statusRented' },
  { key: 'vacant', label: 'prop.statusVacant' },
  { key: 'renewing', label: 'prop.statusRenewing' },
  { key: 'maintenance', label: 'prop.statusMaintenance' }
]

const TYPE_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'apartment', label: 'prop.typeApartment' },
  { key: 'house', label: 'prop.typeVilla' },
  { key: 'shop', label: 'prop.typeCommercial' },
  { key: 'office', label: 'prop.typeOffice' }
]

const SORT_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'latest', label: 'prop.sortLatest' },
  { key: 'price_asc', label: 'prop.sortPriceAsc' },
  { key: 'price_desc', label: 'prop.sortPriceDesc' },
  { key: 'area_desc', label: 'prop.sortAreaDesc' }
]

const BED_OPTIONS = [
  { key: '', label: 'prop.bedroomAny' },
  { key: '0', label: 'prop.bedroom0' },
  { key: '1', label: 'prop.bedroom1' },
  { key: '2', label: 'prop.bedroom2' },
  { key: '3', label: 'prop.bedroom3' },
  { key: '4', label: 'prop.bedroom4' }
]

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

const RADII = [1, 3, 5, 10]

function pickList(res: any): Property[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

function pickListPublic(res: any): PublicSchool[] {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

const formatRent = (v?: number, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', USD: '$', EUR: '€' }
  return `${sym[currency || 'THB'] || '฿'}${Number(v || 0).toLocaleString()}`
}

const pad = (n: number) => String(n).padStart(2, '0')
// 默认预约时间：下一个整点
const defaultSlot = () => {
  const d = new Date(Date.now() + 3600000)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:00`
  }
}

export default function EmployeePropertyBrowsePage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [listings, setListings] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

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
  // 区域：国家 → 省市 → 城区 三级下钻
  const [region, setRegion] = useState('')
  const [regionOpen, setRegionOpen] = useState(false)
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country)
  const [areaDrill, setAreaDrill] = useState<string>('')
  // 学校：空间筛选
  const [schoolId, setSchoolId] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolKm, setSchoolKm] = useState(3)
  const [schools, setSchools] = useState<PublicSchool[]>([])
  const [schoolKw, setSchoolKw] = useState('')

  const [openTab, setOpenTab] = useState<FilterTab>(null)

  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [favPending, setFavPending] = useState<Set<string>>(new Set())

  // 预约带看（真实写接口）
  const [bookingId, setBookingId] = useState<string>('')
  const [visitorName, setVisitorName] = useState('')
  const [slot, setSlot] = useState(defaultSlot())

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

  const fetchFavorites = async () => {
    try {
      const res: any = await favoritesApi.list({ page: 1, page_size: 100 })
      const items = pickList(res)
      setFavSet(new Set(items.map((f: any) => String(f.property_id ?? f.id)).filter(Boolean)))
    } catch (err) {
      console.error('[PropertyBrowse] 加载收藏状态失败', err)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchList(1)
    fetchFavorites()
  })

  if (schools.length === 0) {
    publicApi
      .schools({ page_size: 100 })
      .then((res: any) => setSchools(pickListPublic(res)))
      .catch(() => setSchools([]))
  }

  // 由筛选 state 构建后端查询参数（服务端过滤以保证正确分页）
  const buildParams = (over: Partial<{
    q: string; status: string; type: string; sort: string; bedrooms: string;
    priceRange: string; priceCustomMin: string; priceCustomMax: string;
    areaRange: string; areaCustomMin: string; areaCustomMax: string;
    region: string; schoolId: string; schoolKm: number
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
    if (bd !== '') {
      if (bd === '3' || bd === '4') p.bedrooms_min = Number(bd)
      else { p.bedrooms_min = Number(bd); p.bedrooms_max = Number(bd) }
    }
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
    if (rg) {
      const node = allDistricts.find((d) => d.key === rg)
      if (node && node.kws.length) p.keywords = node.kws
    }
    if (sid) {
      p.school_id = sid
      p.school_radius_km = skm
    }
    return p
  }

  const fetchList = async (nextPage: number, over: Parameters<typeof buildParams>[0] = {}) => {
    const isRefresh = nextPage <= 1
    if (isRefresh) setLoading(true)
    else setLoadingMore(true)
    setError(false)
    try {
      const params = buildParams(over)
      if (!isRefresh) params.page = nextPage
      const res: any = await propertiesApi.list(params)
      const items = pickList(res)
      setListings((prev) => (isRefresh ? items : [...prev, ...items]))
      setPage(nextPage)
      setHasMore(items.length >= PAGE_SIZE)
    } catch (err) {
      console.error('[PropertyBrowse] 获取房源失败', err)
      if (isRefresh) setError(true)
      Taro.showToast({ title: t('prop.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const onSearch = () => {
    const q = keyword.trim()
    setQuery(q)
    fetchList(1, { q })
  }

  const setWrapper = (key: keyof Parameters<typeof buildParams>[0], val: any) => {
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
    fetchList(1, { [key]: val } as any)
  }

  const pickRegion = (key: string | null) => {
    setRegion(key || '')
    fetchList(1, { region: key || '' })
  }

  const toggleSchool = (school: PublicSchool) => {
    if (schoolId === school.id) {
      setSchoolId('')
      setSchoolName('')
      fetchList(1, { schoolId: '' })
    } else {
      setSchoolId(school.id)
      setSchoolName(school.name ?? '')
      fetchList(1, { schoolId: school.id })
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
    fetchList(1, { bedrooms: '', priceRange: '', areaRange: '' })
    setOpenTab(null)
  }

  // 收藏切换（真实接口，失败回滚）
  const toggleFav = async (id: string) => {
    if (favPending.has(id)) return
    const willFav = !favSet.has(id)
    setFavPending((s) => new Set(s).add(id))
    setFavSet((prev) => {
      const next = new Set(prev)
      if (willFav) next.add(id)
      else next.delete(id)
      return next
    })
    try {
      if (willFav) await favoritesApi.add(id)
      else await favoritesApi.remove(id)
    } catch (err) {
      console.error('[PropertyBrowse] 收藏切换失败', err)
      setFavSet((prev) => {
        const next = new Set(prev)
        if (willFav) next.delete(id)
        else next.add(id)
        return next
      })
      Taro.showToast({ title: t('common.opFailed'), icon: 'none' })
    } finally {
      setFavPending((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  // 分享客户：无房源分享接口，跳转消息列表手动发送
  const onShare = () => {
    Taro.showToast({ title: t('crm.shareViaMessage'), icon: 'none' })
    setTimeout(() => Taro.navigateTo({ url: '/pages/chat/list/index' }), 600)
  }

  const openBooking = (p: Property) => {
    setBookingId(String(p.id))
    setVisitorName('')
    setSlot(defaultSlot())
  }

  const submitBooking = async (p: Property) => {
    if (!visitorName.trim()) {
      Taro.showToast({ title: t('crm.nameRequired'), icon: 'none' })
      return
    }
    try {
      await viewingsApi.create({
        property_id: p.id,
        scheduled_at: `${slot.date}T${slot.time}:00`,
        visitor_name: visitorName.trim()
      })
      Taro.showToast({ title: t('crm.booked'), icon: 'success' })
      setBookingId('')
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('prop.bookingFailed'), icon: 'none' })
    }
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

  // 由真实字段派生标签，无对应字段则不展示
  const tagsOf = (p: Property): string[] => {
    const tags: string[] = []
    if (p.furnished) tags.push(t('prop.furnishedTagLong'))
    if (p.video_url) tags.push(t('prop.videoTag'))
    if (Array.isArray(p.photos) && p.photos.length > 0) tags.push(t('prop.photoTag', { n: p.photos.length }))
    if (p.status === 'vacant') tags.push(t('prop.anytimeView'))
    return tags.slice(0, 3)
  }

  return (
    <View className='pb-page'>
      {/* 搜索区 */}
      <View className='pb-search-wrap'>
        <View className='pb-search'>
          <Input
            className='pb-search__input'
            value={keyword}
            placeholder={t('prop.browseSearchPlaceholder')}
            placeholderStyle='color:#98a1ab'
            confirmType='search'
            onInput={(e: any) => setKeyword(e.detail.value)}
            onConfirm={onSearch}
          />
          <View className='pb-search__btn' onClick={onSearch}>
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
                    onClick={() => { setSort(o.key); fetchList(1, { sort: o.key } as any); setOpenTab(null) }}
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

      <View className='pb-body'>
        <Text className='pb-count'>
          {t('prop.countTotal')} <Text className='pb-count__num'>{listings.length}</Text>{' '}
          {t('prop.countListingsSuffix')}
        </Text>

        {loading && listings.length === 0 ? (
          <View className='pb-state pb-state--loading'>
            <View className='pb-state__spinner' />
            <Text className='pb-state__title'>{t('common.loading')}</Text>
          </View>
        ) : error && listings.length === 0 ? (
          <View className='pb-state'>
            <Text className='pb-state__title'>{t('common.loadFailed')}</Text>
            <View className='pb-retry' onClick={() => fetchList(1)}>
              <Text className='pb-retry__text'>{t('common.tapRetry')}</Text>
            </View>
          </View>
        ) : listings.length === 0 ? (
          <View className='pb-state'>
            <Text className='pb-state__title'>{t('prop.emptyNoMatch')}</Text>
            <Text className='pb-state__desc'>{t('prop.emptyFiltered')}</Text>
          </View>
        ) : (
          listings.map((p) => {
            const photo = Array.isArray(p.photos) && p.photos.length ? p.photos[0] : ''
            const isFav = favSet.has(String(p.id))
            return (
              <View key={p.id} className='pb-card' hoverClass='pb-card--hover'>
                <View className='pb-card__thumb'>
                  {photo ? (
                    <Image className='pb-card__photo' src={photo} mode='aspectFill' lazyLoad />
                  ) : (
                    <Text className='pb-card__ph'>{t('prop.listing')}</Text>
                  )}
                  <View
                    className={`pb-fav ${isFav ? 'pb-fav--on' : ''}`}
                    onClick={() => toggleFav(String(p.id))}
                  >
                    <Text className='pb-fav__text'>{isFav ? t('prop.favOn') : t('prop.fav')}</Text>
                  </View>
                  <View className='pb-card__type'>
                    <Text>{t(TYPE_LABELS[String(p.property_type || '').toLowerCase()] || 'prop.listing')}</Text>
                  </View>
                </View>

                <View className='pb-card__body'>
                  <Text className='pb-card__name'>
                    {p.room_number || t('prop.unnamed')} {t('prop.bedroomUnit', { n: p.bedrooms || 0 })}{' '}
                    {t('prop.bathroomUnit', { n: p.bathrooms || 0 })} {p.size_sqm || 0}㎡
                  </Text>
                  <Text className='pb-card__addr'>
                    {p.address || t('prop.noAddress')}
                    {p.floor ? ` | ${p.floor}` : ''}
                  </Text>

                  {tagsOf(p).length > 0 && (
                    <View className='pb-card__tags'>
                      {tagsOf(p).map((tag) => (
                        <Text key={tag} className='pb-card__tag'>
                          {tag}
                        </Text>
                      ))}
                    </View>
                  )}

                  <View className='pb-card__bottom'>
                    <Text className='pb-card__price'>
                      {formatRent(p.monthly_rent, p.currency)}
                      <Text className='pb-card__price-unit'>{t('pub.perMonth')}</Text>
                    </Text>
                    <View className='pb-card__ops'>
                      <View className='pb-btn pb-btn--ghost' onClick={onShare}>
                        <Text className='pb-btn__text pb-btn__text--ghost'>{t('prop.shareToClient')}</Text>
                      </View>
                      <View className='pb-btn pb-btn--primary' onClick={() => openBooking(p)}>
                        <Text className='pb-btn__text'>{t('prop.bookViewing')}</Text>
                      </View>
                    </View>
                  </View>

                  {/* 预约带看表单（真实写接口） */}
                  {bookingId === String(p.id) && (
                    <View className='pb-book'>
                      <Input
                        className='pb-book__input'
                        value={visitorName}
                        placeholder={t('prop.clientName')}
                        placeholderStyle='color:#98a1ab'
                        onInput={(e: any) => setVisitorName(e.detail.value)}
                      />
                      <View className='pb-book__pickers'>
                        <Picker
                          mode='date'
                          value={slot.date}
                          onChange={(e: any) => setSlot((s) => ({ ...s, date: e.detail.value }))}
                        >
                          <View className='pb-book__picker'>
                            <Text className='pb-book__picker-text'>{slot.date}</Text>
                          </View>
                        </Picker>
                        <Picker
                          mode='time'
                          value={slot.time}
                          onChange={(e: any) => setSlot((s) => ({ ...s, time: e.detail.value }))}
                        >
                          <View className='pb-book__picker'>
                            <Text className='pb-book__picker-text'>{slot.time}</Text>
                          </View>
                        </Picker>
                      </View>
                      <View className='pb-book__foot'>
                        <View
                          className='pb-btn pb-btn--ghost'
                          onClick={() => setBookingId('')}
                        >
                          <Text className='pb-btn__text pb-btn__text--ghost'>{t('common.cancel')}</Text>
                        </View>
                        <View
                          className='pb-btn pb-btn--primary'
                          onClick={() => submitBooking(p)}
                        >
                          <Text className='pb-btn__text'>{t('prop.confirmBooking')}</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )
          })
        )}

        {/* 加载更多 */}
        {hasMore && listings.length > 0 && (
          <View className='pb-more' onClick={() => fetchList(page + 1)}>
            <Text className='pb-more__text'>
              {loadingMore ? t('common.loadingMore') : t('prop.loadMoreListings')}
            </Text>
          </View>
        )}
      </View>

      <BottomNav role='employee' active='properties' />
    </View>
  )
}