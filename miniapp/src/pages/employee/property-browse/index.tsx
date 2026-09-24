import { useMemo, useState } from 'react'
import { View, Text, Input, Image, Picker, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi, favoritesApi, viewingsApi } from '@/services/api'
import { AREA_GROUPS } from '@/data/locationArea'
import BottomNav from '@/components/BottomNav'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useI18n } from '@/i18n'
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

// 筛选 Tab（区域 / 租金 / 户型 / 排序）
type FilterTab = null | 'region' | 'price' | 'layout' | 'sort'

const PRICE_PRESETS = [
  { key: '', label: 'pub.filterAny', min: 0, max: Infinity },
  { key: 'u3000', label: '≤3000', min: 0, max: 3000 },
  { key: '3-6', label: '3000-6000', min: 3000, max: 6000 },
  { key: '6-10', label: '6000-10000', min: 6000, max: 10000 },
  { key: 'g10', label: '≥10000', min: 10000, max: Infinity }
]

const BEDROOM_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: '1', label: 'prop.layout1' },
  { key: '2', label: 'prop.layout2' },
  { key: '3', label: 'prop.layout3' },
  { key: '4', label: 'prop.layout4' }
]

const SORT_OPTIONS = [
  { key: 'default', label: 'prop.sortDefault' },
  { key: 'price_asc', label: 'prop.sortRentAsc' },
  { key: 'price_desc', label: 'prop.sortRentDesc' },
  { key: 'area_desc', label: 'prop.sortAreaDesc' }
]

function pickList(res: any): Property[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

const formatRent = (v?: number, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', USD: '$', EUR: '€' }
  return `${sym[currency || 'THB'] || '฿'}${Number(v || 0).toLocaleString()}`
}

const matchLocation = (item: Property, kws: string[]): boolean =>
  kws.some((k) =>
    [item.address, item.room_number, item.building]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase())
      .some((v) => v.includes(k))
  )

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
  const {
    list,
    loading,
    loadingMore,
    hasMore,
    error,
    fetch: fetchList,
    fetchMore
  } = usePaginatedList<Property>({
    pageSize: PAGE_SIZE,
    fetcher: async (p, ps, params) => {
      const res: any = await propertiesApi.list({
        page: p,
        page_size: ps,
        ...((params as any)?.q ? { q: (params as any).q } : {})
      })
      return pickList(res)
    },
    onError: () => Taro.showToast({ title: t('prop.loadFailed'), icon: 'none' })
  })

  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')

  const [openTab, setOpenTab] = useState<FilterTab>(null)
  const [districtKey, setDistrictKey] = useState('')
  // 区域面板：国家 → 省市 → 城区 三级下钻（左栏只列国家，右栏先是该国家的省市列表，
  // 点省市后右栏换成它的城区）。此前所有国家的城区平铺在一列，混杂难找。
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country)
  const [areaDrill, setAreaDrill] = useState<string>('') // 已下钻的省市 cityKey，空 = 停在省市列表
  const [priceKey, setPriceKey] = useState('')
  const [bedroomKey, setBedroomKey] = useState('')
  const [sortKey, setSortKey] = useState('default')

  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [favPending, setFavPending] = useState<Set<string>>(new Set())

  // 预约带看（真实写接口）：展开的表单 + 表单字段
  const [bookingId, setBookingId] = useState<string>('')
  const [visitorName, setVisitorName] = useState('')
  const [slot, setSlot] = useState(defaultSlot())

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

  const onSearch = () => {
    const q = keyword.trim()
    setQuery(q)
    fetchList(1, { q })
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
  const activeKws = useMemo(() => {
    const node = allDistricts.find((d) => d.key === districtKey)
    return node ? node.kws : []
  }, [districtKey, allDistricts])
  const regionLabel = allDistricts.find((d) => d.key === districtKey)?.label || 'prop.filterRegion'
  const priceLabel = PRICE_PRESETS.find((p) => p.key === priceKey)?.label || 'prop.filterRent'
  const bedroomLabel = BEDROOM_OPTIONS.find((b) => b.key === bedroomKey)?.label || 'prop.filterLayout'
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label || 'prop.sortLabel'

  const visible = useMemo(() => {
    const preset = PRICE_PRESETS.find((p) => p.key === priceKey) || PRICE_PRESETS[0]
    const filtered = list.filter((it) => {
      const rent = Number(it.monthly_rent || 0)
      if (activeKws.length && !matchLocation(it, activeKws)) return false
      if (preset.min && rent < preset.min) return false
      if (preset.max !== Infinity && rent > preset.max) return false
      if (bedroomKey && Number(it.bedrooms || 0) < Number(bedroomKey === '4' ? 4 : bedroomKey))
        return false
      return true
    })
    switch (sortKey) {
      case 'price_asc':
        return filtered.sort((a, b) => Number(a.monthly_rent || 0) - Number(b.monthly_rent || 0))
      case 'price_desc':
        return filtered.sort((a, b) => Number(b.monthly_rent || 0) - Number(a.monthly_rent || 0))
      case 'area_desc':
        return filtered.sort((a, b) => Number(b.size_sqm || 0) - Number(a.size_sqm || 0))
      default:
        return filtered
    }
  }, [list, activeKws, priceKey, bedroomKey, sortKey])

  // 筛选面板开合：打开区域面板时按已选城区回显下钻层级（否则停在省市列表）
  const toggleTab = (key: Exclude<FilterTab, null>) => {
    if (openTab === key) {
      setOpenTab(null)
      return
    }
    setOpenTab(key)
    if (key === 'region' && districtKey) {
      const g = AREA_GROUPS.find((x) => x.children.some((d) => d.key === districtKey))
      if (g) {
        setAreaCountry(g.country)
        setAreaDrill(g.cityKey)
      }
    }
  }
  // 选择城区：实时单选并收起面板；选「不限」时一并清掉下钻状态
  const pickDistrict = (key: string) => {
    setDistrictKey(key)
    if (!key) setAreaDrill('')
    setOpenTab(null)
  }

  const tabs: { key: Exclude<FilterTab, null>; label: string; active: boolean }[] = [
    { key: 'region', label: t(districtKey ? regionLabel : 'prop.filterRegion'), active: !!districtKey },
    { key: 'price', label: t(priceKey ? priceLabel : 'prop.filterRent'), active: !!priceKey },
    { key: 'layout', label: t(bedroomKey ? bedroomLabel : 'prop.filterLayout'), active: !!bedroomKey },
    { key: 'sort', label: t(sortKey !== 'default' ? sortLabel : 'prop.sortLabel'), active: sortKey !== 'default' }
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
        <View className='pb-filters'>
          {tabs.map((tab) => (
            <View
              key={tab.key}
              className={`pb-chip ${openTab === tab.key ? 'pb-chip--open' : ''} ${
                tab.active ? 'pb-chip--active' : ''
              }`}
              onClick={() => toggleTab(tab.key)}
            >
              <Text className='pb-chip__text'>{tab.label}</Text>
              <Text className='pb-chip__arrow'>{openTab === tab.key ? '▲' : '▼'}</Text>
            </View>
          ))}
        </View>

        {/* 下拉面板 */}
        {openTab !== null && (
          <View className='pb-panel'>
            {openTab === 'region' && (
              // 链家式两栏 + 国家→省市→城区三级下钻：左栏只列国家，
              // 右栏先是该国家的省市列表，点省市后右栏换成它的城区 chips
              <View className='filter-region-twocol'>
                <ScrollView scrollY className='filter-region-twocol__left'>
                  {countryList.map((c) => (
                    <View
                      key={c}
                      className={`loc-col-item ${areaCountry === c ? 'loc-col-item--active' : ''}`}
                      onClick={() => {
                        setAreaCountry(c)
                        setAreaDrill('')
                      }}
                    >
                      <Text>{c}</Text>
                    </View>
                  ))}
                </ScrollView>
                <ScrollView scrollY className='filter-region-twocol__right'>
                  {activeAreaGroup ? (
                    <>
                      <View className='filter-region-drill-head' onClick={() => setAreaDrill('')}>
                        <Text className='filter-region-drill-head__back'>← {areaCountry}</Text>
                        <Text className='loc-group__title loc-group__title--flat'>
                          {activeAreaGroup.cityLabel}
                        </Text>
                      </View>
                      <View className='pb-panel__chips'>
                        <View
                          className={`pb-opt ${!districtKey ? 'pb-opt--active' : ''}`}
                          onClick={() => pickDistrict('')}
                        >
                          <Text>{t('pub.filterAny')}</Text>
                        </View>
                        {activeAreaGroup.children.map((d) => (
                          <View
                            key={d.key}
                            className={`pb-opt ${districtKey === d.key ? 'pb-opt--active' : ''}`}
                            onClick={() => pickDistrict(d.key)}
                          >
                            <Text>{d.label}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <>
                      <Text className='loc-group__title loc-group__title--flat'>{areaCountry}</Text>
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
                </ScrollView>
              </View>
            )}

            {openTab === 'price' && (
              <View className='pb-panel__chips'>
                {PRICE_PRESETS.map((p) => (
                  <View
                    key={p.key}
                    className={`pb-opt ${priceKey === p.key ? 'pb-opt--active' : ''}`}
                    onClick={() => {
                      setPriceKey(p.key)
                      setOpenTab(null)
                    }}
                  >
                    <Text>{t(p.label)}</Text>
                  </View>
                ))}
              </View>
            )}

            {openTab === 'layout' && (
              <View className='pb-panel__chips'>
                {BEDROOM_OPTIONS.map((b) => (
                  <View
                    key={b.key}
                    className={`pb-opt ${bedroomKey === b.key ? 'pb-opt--active' : ''}`}
                    onClick={() => {
                      setBedroomKey(b.key)
                      setOpenTab(null)
                    }}
                  >
                    <Text>{t(b.label)}</Text>
                  </View>
                ))}
              </View>
            )}

            {openTab === 'sort' && (
              <View className='pb-panel__list'>
                {SORT_OPTIONS.map((s) => (
                  <View
                    key={s.key}
                    className={`pb-sort ${sortKey === s.key ? 'pb-sort--active' : ''}`}
                    onClick={() => {
                      setSortKey(s.key)
                      setOpenTab(null)
                    }}
                  >
                    <Text className='pb-sort__text'>{t(s.label)}</Text>
                    {sortKey === s.key && <Text className='pb-sort__check'>✓</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      <View className='pb-body'>
        <Text className='pb-count'>
          {t('prop.countTotal')} <Text className='pb-count__num'>{visible.length}</Text>{' '}
          {t('prop.countListingsSuffix')}
        </Text>

        {loading && visible.length === 0 ? (
          <View className='pb-state pb-state--loading'>
            <View className='pb-state__spinner' />
            <Text className='pb-state__title'>{t('common.loading')}</Text>
          </View>
        ) : error && visible.length === 0 ? (
          <View className='pb-state'>
            <Text className='pb-state__title'>{t('common.loadFailed')}</Text>
            <View className='pb-retry' onClick={() => fetchList(1)}>
              <Text className='pb-retry__text'>{t('common.tapRetry')}</Text>
            </View>
          </View>
        ) : visible.length === 0 ? (
          <View className='pb-state'>
            <Text className='pb-state__title'>{t('prop.emptyNoMatch')}</Text>
            <Text className='pb-state__desc'>{t('prop.emptyFiltered')}</Text>
          </View>
        ) : (
          visible.map((p) => {
            const photo = Array.isArray(p.photos) && p.photos.length ? p.photos[0] : ''
            const isFav = favSet.has(String(p.id))
            return (
              <View key={p.id} className='pb-card'>
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
                    <Text>{t(TYPE_LABELS[p.property_type || ''] || 'prop.listing')}</Text>
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
        {hasMore && visible.length > 0 && (
          <View className='pb-more' onClick={fetchMore}>
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