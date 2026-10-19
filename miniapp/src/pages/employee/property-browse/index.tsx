/**
 * 员工端 - 房源浏览（纯浏览）。
 *
 * UI 1:1 复用 C 端「找房」信息流组件 `<ListingsFeed/>`：同一套 hero / 筛选 Tab / 房源卡片。
 * 本页只负责数据：`propertiesApi.list`（buildParams 组装查询）+ 收藏 + 定位 + 客户端筛选排序。
 * 已移除分享 / 预约带看 / 上架等员工侧操作，卡片点击进入房源详情。
 */
import { useEffect, useMemo, useState } from 'react'
import { View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi, favoritesApi } from '@/services/api'
import { METRO_LINES } from '@/data/locationMetro'
import { useLocationStore, findCityByKey } from '@/stores/location'
import BottomNav from '@/components/BottomNav'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useDistrictNodes } from '@/lib/categoryShared'
import ListingsFeed, {
  selectVisibleListings,
  type BizKey,
  type Listing,
  type ListingsFilters
} from '@/components/ListingsFeed'
import { useI18n } from '@/i18n'
import '@/styles/filter-panel.scss'
import './index.scss'

const PAGE_SIZE = 20

const RECENT_SEARCHES_KEY = 'recent_searches'
const RECENT_SEARCHES_MAX = 10

const DEFAULT_FILTERS: ListingsFilters = {
  districtSel: null,
  metroSel: [],
  pricePreset: '',
  customMin: '',
  customMax: '',
  bedroomSel: '',
  areaPreset: '',
  areaCustomMin: '',
  areaCustomMax: '',
  statusSel: '',
  orientationSel: '',
  floorSel: '',
  decorSel: '',
  amenitySel: [],
  sortKey: 'default'
}

function pickList(res: any): Listing[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function EmployeePropertyBrowsePage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const locSel = useLocationStore((s) => s.selection)

  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [biz, setBiz] = useState<BizKey>('rent')
  const [nearby, setNearby] = useState(false)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)

  const [filters, setFilters] = useState<ListingsFilters>(DEFAULT_FILTERS)
  const patchFilters = (patch: Partial<ListingsFilters>) =>
    setFilters((cur) => ({ ...cur, ...patch }))

  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [favPending, setFavPending] = useState<Set<string>>(new Set())

  // 后端查询参数（服务端只按关键词 + 定位城市收敛，其余维度客户端筛选，与 C 端口径一致）
  const buildParams = (over: { q?: string } = {}): Record<string, any> => {
    const q = over.q ?? query
    const p: Record<string, any> = { page: 1, page_size: PAGE_SIZE }
    if (q) p.q = q
    if (locSel.cityKey) p.city = locSel.cityKey
    return p
  }

  const { list: listings, loading, loadingMore, hasMore, error, fetch: fetchList, fetchMore } =
    usePaginatedList<Listing>({
      pageSize: PAGE_SIZE,
      cacheKey: 'employee-property-browse',
      fetcher: async (p, ps, params) => {
        const res: any = await propertiesApi.list({
          ...buildParams(params as { q?: string }),
          page: p,
          page_size: ps
        })
        return pickList(res)
      },
      onError: () => Taro.showToast({ title: t('prop.loadFailed'), icon: 'none' })
    })

  // 区域面板真实数据（GET /public/districts，空则回退当前城市的静态区域清单）
  const locCity = useMemo(() => findCityByKey(locSel.cityKey), [locSel.cityKey])
  const cityDistricts = useDistrictNodes({
    city: locSel.cityKey,
    listingType: biz === 'sale' ? 'sell' : 'rent'
  })
  const cityMetroLines = useMemo(
    () => METRO_LINES.filter((l) => l.cityKey === locSel.cityKey),
    [locSel.cityKey]
  )
  const distNode = (key: string) => cityDistricts.find((d) => d.key === key)

  const activeLocationKw = useMemo(() => {
    if (filters.districtSel) {
      const node = distNode(filters.districtSel)
      return node ? node.kws : []
    }
    if (filters.metroSel.length) {
      const stations = cityMetroLines.flatMap((l) => l.stations)
      return stations.filter((s) => filters.metroSel.includes(s.name)).flatMap((s) => s.kws)
    }
    return []
  }, [filters.districtSel, filters.metroSel, cityMetroLines, cityDistricts])

  const globalCityKw = useMemo(
    () => (locCity ? locCity.children.flatMap((d) => d.kws) : []),
    [locCity]
  )

  const visibleList = useMemo(
    () =>
      selectVisibleListings(listings, filters, {
        biz,
        cityKw: globalCityKw,
        locationKw: activeLocationKw,
        nearbyPos: nearby ? userPos : null
      }),
    [listings, filters, biz, globalCityKw, activeLocationKw, nearby, userPos]
  )

  // 进入页面时读取本地搜索历史
  useEffect(() => {
    try {
      const stored = Taro.getStorageSync(RECENT_SEARCHES_KEY)
      setRecentSearches(
        Array.isArray(stored)
          ? stored
              .filter((k: unknown) => typeof k === 'string' && k.trim())
              .slice(0, RECENT_SEARCHES_MAX)
          : []
      )
    } catch (err) {
      console.error('[PropertyBrowse] 读取搜索历史失败', err)
    }
  }, [])

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
    // 提交搜索时写入历史：去重置顶、上限 10 条、越界丢最旧
    if (q) {
      setRecentSearches((prev) => {
        const next = [q, ...prev.filter((k) => k !== q)].slice(0, RECENT_SEARCHES_MAX)
        try {
          Taro.setStorageSync(RECENT_SEARCHES_KEY, next)
        } catch (err) {
          console.error('[PropertyBrowse] 保存搜索历史失败', err)
        }
        return next
      })
    }
    setQuery(q)
    fetchList(1, { q })
  }

  const applyRecent = (word: string) => {
    setKeyword(word)
    setQuery(word)
    fetchList(1, { q: word })
  }

  const clearRecent = () => {
    setRecentSearches([])
    try {
      Taro.setStorageSync(RECENT_SEARCHES_KEY, [])
    } catch (err) {
      console.error('[PropertyBrowse] 清空搜索历史失败', err)
    }
  }

  // 收藏切换（真实接口，失败回滚）
  const toggleFav = async (e: any, item: Listing) => {
    e.stopPropagation()
    const id = String(item.id)
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

  // 「附近」开关：开启时取一次定位并切到「离我最近」排序
  const handleToggleNearby = async () => {
    if (nearby) {
      setNearby(false)
      return
    }
    try {
      const loc = await Taro.getLocation({ type: 'gcj02' })
      if (!listings.some((it) => it.lat != null && it.lng != null)) {
        Taro.showToast({ title: t('tl.nearbyNoData'), icon: 'none' })
        return
      }
      setUserPos({ lat: loc.latitude, lng: loc.longitude })
      setNearby(true)
    } catch (err) {
      console.error('[PropertyBrowse] 定位失败', err)
      Taro.showToast({ title: t('tl.nearbyDenied'), icon: 'none' })
    }
  }

  const handlePickCity = () => {
    Taro.navigateTo({ url: '/pages/location/index' })
  }

  const handleGoMap = () => {
    Taro.navigateTo({
      url: `/pages/public/map/index?listing_type=${biz === 'sale' ? 'sell' : 'rent'}`
    })
  }

  const openDetail = (item: Listing) => {
    Taro.navigateTo({ url: `/pages/tenant/property-detail/index?id=${item.id}` })
  }

  return (
    <View className='pb-page'>
      <ListingsFeed
        items={visibleList}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        onLoadMore={fetchMore}
        onRetry={() => fetchList(1, { q: query })}
        filters={filters}
        onFiltersChange={patchFilters}
        cityDistricts={cityDistricts}
        metroLines={cityMetroLines}
        cityLabel={locSel.cityLabel}
        onPickCity={handlePickCity}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onSearch={onSearch}
        recentSearches={recentSearches}
        onPickRecent={applyRecent}
        onClearRecent={clearRecent}
        nearby={nearby}
        onToggleNearby={handleToggleNearby}
        biz={biz}
        onBizChange={setBiz}
        favSet={favSet}
        favPending={favPending}
        onToggleFavorite={toggleFav}
        resultCount={visibleList.length}
        onGoMap={handleGoMap}
        onOpenDetail={openDetail}
      />
      <BottomNav role='employee' active='properties' />
    </View>
  )
}
