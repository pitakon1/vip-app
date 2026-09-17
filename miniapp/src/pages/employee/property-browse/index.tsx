import { useMemo, useState } from 'react'
import { View, Text, Input, Image, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi, favoritesApi, viewingsApi } from '@/services/api'
import { AREA_GROUPS } from '@/data/locationArea'
import BottomNav from '@/components/BottomNav'
import { usePaginatedList } from '@/hooks/usePaginatedList'
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
  apartment: '公寓',
  condo: '公寓',
  house: '住宅',
  villa: '别墅',
  shop: '商铺',
  commercial: '商铺',
  office: '写字楼'
}

const PAGE_SIZE = 10

// 筛选 Tab（区域 / 租金 / 户型 / 排序）
type FilterTab = null | 'region' | 'price' | 'layout' | 'sort'

const PRICE_PRESETS = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u3000', label: '≤3000', min: 0, max: 3000 },
  { key: '3-6', label: '3000-6000', min: 3000, max: 6000 },
  { key: '6-10', label: '6000-10000', min: 6000, max: 10000 },
  { key: 'g10', label: '≥10000', min: 10000, max: Infinity }
]

const BEDROOM_OPTIONS = [
  { key: '', label: '不限' },
  { key: '1', label: '1室' },
  { key: '2', label: '2室' },
  { key: '3', label: '3室' },
  { key: '4', label: '4室+' }
]

const SORT_OPTIONS = [
  { key: 'default', label: '默认排序' },
  { key: 'price_asc', label: '租金从低到高' },
  { key: 'price_desc', label: '租金从高到低' },
  { key: 'area_desc', label: '面积从大到小' }
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
    onError: () => Taro.showToast({ title: '加载房源失败', icon: 'none' })
  })

  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')

  const [openTab, setOpenTab] = useState<FilterTab>(null)
  const [districtKey, setDistrictKey] = useState('')
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
      Taro.showToast({ title: '操作失败', icon: 'none' })
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
    Taro.showToast({ title: '请在消息中发送给客户', icon: 'none' })
    setTimeout(() => Taro.navigateTo({ url: '/pages/chat/list/index' }), 600)
  }

  const openBooking = (p: Property) => {
    setBookingId(String(p.id))
    setVisitorName('')
    setSlot(defaultSlot())
  }

  const submitBooking = async (p: Property) => {
    if (!visitorName.trim()) {
      Taro.showToast({ title: '请填写客户姓名', icon: 'none' })
      return
    }
    try {
      await viewingsApi.create({
        property_id: p.id,
        scheduled_at: `${slot.date}T${slot.time}:00`,
        visitor_name: visitorName.trim()
      })
      Taro.showToast({ title: '预约成功', icon: 'success' })
      setBookingId('')
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '预约失败', icon: 'none' })
    }
  }

  const allDistricts = useMemo(() => AREA_GROUPS.flatMap((g) => g.children), [])
  const activeKws = useMemo(() => {
    const node = allDistricts.find((d) => d.key === districtKey)
    return node ? node.kws : []
  }, [districtKey, allDistricts])
  const regionLabel = allDistricts.find((d) => d.key === districtKey)?.label || '区域'
  const priceLabel = PRICE_PRESETS.find((p) => p.key === priceKey)?.label || '租金'
  const bedroomLabel = BEDROOM_OPTIONS.find((b) => b.key === bedroomKey)?.label || '户型'
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label || '排序'

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

  const tabs: { key: Exclude<FilterTab, null>; label: string; active: boolean }[] = [
    { key: 'region', label: districtKey ? regionLabel : '区域', active: !!districtKey },
    { key: 'price', label: priceKey ? priceLabel : '租金', active: !!priceKey },
    { key: 'layout', label: bedroomKey ? bedroomLabel : '户型', active: !!bedroomKey },
    { key: 'sort', label: sortKey !== 'default' ? sortLabel : '排序', active: sortKey !== 'default' }
  ]

  // 由真实字段派生标签，无对应字段则不展示
  const tagsOf = (p: Property): string[] => {
    const tags: string[] = []
    if (p.furnished) tags.push('精装修')
    if (p.video_url) tags.push('视频看房')
    if (Array.isArray(p.photos) && p.photos.length > 0) tags.push('实拍图 ' + p.photos.length)
    if (p.status === 'vacant') tags.push('随时看房')
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
            placeholder='搜索小区、地址、地铁...'
            placeholderStyle='color:#98a1ab'
            confirmType='search'
            onInput={(e: any) => setKeyword(e.detail.value)}
            onConfirm={onSearch}
          />
          <View className='pb-search__btn' onClick={onSearch}>
            <Text className='pb-search__btn-text'>搜索</Text>
          </View>
        </View>
        <View className='pb-filters'>
          {tabs.map((t) => (
            <View
              key={t.key}
              className={`pb-chip ${openTab === t.key ? 'pb-chip--open' : ''} ${
                t.active ? 'pb-chip--active' : ''
              }`}
              onClick={() => setOpenTab(openTab === t.key ? null : t.key)}
            >
              <Text className='pb-chip__text'>{t.label}</Text>
              <Text className='pb-chip__arrow'>{openTab === t.key ? '▲' : '▼'}</Text>
            </View>
          ))}
        </View>

        {/* 下拉面板 */}
        {openTab !== null && (
          <View className='pb-panel'>
            {openTab === 'region' && (
              <View className='pb-panel__chips'>
                <View
                  className={`pb-opt ${!districtKey ? 'pb-opt--active' : ''}`}
                  onClick={() => {
                    setDistrictKey('')
                    setOpenTab(null)
                  }}
                >
                  <Text>不限</Text>
                </View>
                {allDistricts.map((d) => (
                  <View
                    key={d.key}
                    className={`pb-opt ${districtKey === d.key ? 'pb-opt--active' : ''}`}
                    onClick={() => {
                      setDistrictKey(d.key)
                      setOpenTab(null)
                    }}
                  >
                    <Text>{d.label}</Text>
                  </View>
                ))}
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
                    <Text>{p.label}</Text>
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
                    <Text>{b.label}</Text>
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
                    <Text className='pb-sort__text'>{s.label}</Text>
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
          共 <Text className='pb-count__num'>{visible.length}</Text> 套房源
        </Text>

        {loading && visible.length === 0 ? (
          <View className='pb-state pb-state--loading'>
            <View className='pb-state__spinner' />
            <Text className='pb-state__title'>正在加载</Text>
          </View>
        ) : error && visible.length === 0 ? (
          <View className='pb-state'>
            <Text className='pb-state__title'>加载失败</Text>
            <View className='pb-retry' onClick={() => fetchList(1)}>
              <Text className='pb-retry__text'>点击重试</Text>
            </View>
          </View>
        ) : visible.length === 0 ? (
          <View className='pb-state'>
            <Text className='pb-state__title'>暂无符合条件的房源</Text>
            <Text className='pb-state__desc'>可调整筛选条件后重试</Text>
          </View>
        ) : (
          visible.map((p) => {
            const photo = Array.isArray(p.photos) && p.photos.length ? p.photos[0] : ''
            const isFav = favSet.has(String(p.id))
            return (
              <View key={p.id} className='pb-card'>
                <View className='pb-card__thumb'>
                  {photo ? (
                    <Image className='pb-card__photo' src={photo} mode='aspectFill' />
                  ) : (
                    <Text className='pb-card__ph'>房源</Text>
                  )}
                  <View
                    className={`pb-fav ${isFav ? 'pb-fav--on' : ''}`}
                    onClick={() => toggleFav(String(p.id))}
                  >
                    <Text className='pb-fav__text'>{isFav ? '已收藏' : '收藏'}</Text>
                  </View>
                  <View className='pb-card__type'>
                    <Text>{TYPE_LABELS[p.property_type || ''] || '房源'}</Text>
                  </View>
                </View>

                <View className='pb-card__body'>
                  <Text className='pb-card__name'>
                    {p.room_number || '未命名房源'} {p.bedrooms || 0}室{p.bathrooms || 0}卫{' '}
                    {p.size_sqm || 0}㎡
                  </Text>
                  <Text className='pb-card__addr'>
                    {p.address || '暂无地址'}
                    {p.floor ? ` | ${p.floor}` : ''}
                  </Text>

                  {tagsOf(p).length > 0 && (
                    <View className='pb-card__tags'>
                      {tagsOf(p).map((t) => (
                        <Text key={t} className='pb-card__tag'>
                          {t}
                        </Text>
                      ))}
                    </View>
                  )}

                  <View className='pb-card__bottom'>
                    <Text className='pb-card__price'>
                      {formatRent(p.monthly_rent, p.currency)}
                      <Text className='pb-card__price-unit'>/月</Text>
                    </Text>
                    <View className='pb-card__ops'>
                      <View className='pb-btn pb-btn--ghost' onClick={onShare}>
                        <Text className='pb-btn__text pb-btn__text--ghost'>分享客户</Text>
                      </View>
                      <View className='pb-btn pb-btn--primary' onClick={() => openBooking(p)}>
                        <Text className='pb-btn__text'>预约带看</Text>
                      </View>
                    </View>
                  </View>

                  {/* 预约带看表单（真实写接口） */}
                  {bookingId === String(p.id) && (
                    <View className='pb-book'>
                      <Input
                        className='pb-book__input'
                        value={visitorName}
                        placeholder='客户姓名'
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
                          <Text className='pb-btn__text pb-btn__text--ghost'>取消</Text>
                        </View>
                        <View
                          className='pb-btn pb-btn--primary'
                          onClick={() => submitBooking(p)}
                        >
                          <Text className='pb-btn__text'>确认预约</Text>
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
              {loadingMore ? '加载中...' : '加载更多房源'}
            </Text>
          </View>
        )}
      </View>

      <BottomNav role='employee' active='properties' />
    </View>
  )
}