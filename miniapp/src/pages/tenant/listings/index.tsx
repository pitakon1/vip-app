import { useEffect, useMemo, useState } from 'react'
import { View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
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
import './index.scss'
import { useI18n } from '@/i18n'

const PAGE_SIZE = 20

// 搜索历史：Taro storage，去重置顶、上限 10 条、越界丢最旧
const RECENT_SEARCHES_KEY = 'recent_searches'
const RECENT_SEARCHES_MAX = 10

function pickList(res: any): Listing[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

// 受控筛选默认值（未选任何条件）
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

export default function TenantListingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  // 全局定位：城市作用域与「区域」筛选真实数据都以此为口径
  const locSel = useLocationStore((s) => s.selection)

  // 房源类型筛选（多值，逗号分隔）：商铺办公=office,shop、厂房=factory。
  // 由首页黄金导航入口带入，交由服务端过滤（不再本地逐条比对）。
  const filterTypes: string[] = String(router.params?.ptype ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // 新房/二手房（仅买房业务有效）：'1'/'true'=新房，'0'/'false'=二手房，其余=不限
  const newParam = router.params?.new
  const isNew: boolean | undefined =
    newParam === '1' || newParam === 'true'
      ? true
      : newParam === '0' || newParam === 'false'
      ? false
      : undefined

  const { list: listings, loading, loadingMore, hasMore, error: listError, fetch: fetchListings, fetchMore } =
    usePaginatedList<Listing>({
      pageSize: PAGE_SIZE,
      cacheKey: 'tenant-listings',
      fetcher: async (p, ps, params) => {
        const res: any = await propertiesApi.list({
          page: p,
          page_size: ps,
          // 城市统一传定位 cityKey（后端做 slug 归一化），不再传中文 cityLabel
          city: locSel.cityKey,
          ...((params as any)?.q ? { q: (params as any).q } : {}),
          // 房源类型多值经 propertiesApi.list 拼成重复键，与 FastAPI 的
          // List[str] Query 对齐；新房/二手房由上架单标记经 EXISTS 子查询过滤。
          ...(filterTypes.length ? { property_type: filterTypes } : {}),
          ...(isNew === undefined ? {} : { is_new_development: isNew })
        })
        return pickList(res)
      },
      onError: () => Taro.showToast({ title: t('tl.loadListingsFailed'), icon: 'none' })
    })
  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [favPending, setFavPending] = useState<Set<string>>(new Set())

  // 顶部搜索栏 + 业务栏（由首页「出租/买房」入口带入参数初始化）
  const initialBiz: BizKey = router.params?.biz === 'buy' ? 'sale' : 'rent'
  const [keyword, setKeyword] = useState<string>(router.params?.q ? decodeURIComponent(router.params.q) : '')
  const [query, setQuery] = useState<string>(router.params?.q ? decodeURIComponent(router.params.q) : '')
  // 最近搜索词（focus 且有历史词时展示）
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [biz, setBiz] = useState<BizKey>(initialBiz)
  // 「附近」：按离我最近排序（首次开启时才申请定位权限）
  const [nearby, setNearby] = useState(false)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)

  // 受控筛选状态（区域/价格/房型/更多/排序）；面板开合与草稿由 ListingsFeed 自持
  const [filters, setFilters] = useState<ListingsFilters>(DEFAULT_FILTERS)
  const patchFilters = (patch: Partial<ListingsFilters>) =>
    setFilters((cur) => ({ ...cur, ...patch }))

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
    } catch (e) {
      console.error('[Listings] 读取搜索历史失败', e)
    }
  }, [])

  // 区域面板真实数据（GET /public/districts，空则回退当前城市的静态区域清单）
  const locCity = useMemo(() => findCityByKey(locSel.cityKey), [locSel.cityKey])
  const cityDistricts = useDistrictNodes({
    city: locSel.cityKey,
    listingType: biz === 'sale' ? 'sell' : 'rent'
  })

  // 地铁仅列当前定位城市的线路
  const cityMetroLines = useMemo(
    () => METRO_LINES.filter((l) => l.cityKey === locSel.cityKey),
    [locSel.cityKey]
  )
  const distNode = (key: string) => cityDistricts.find((d) => d.key === key)

  // 已选区域/地铁的关键词（城市不参与：全局定位决定城市，找房页只做区/街道与地铁）
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

  // 全局城市作用域：当前定位城市下，房源必须命中该城任一城区关键词（链家式「定位城市看房」）
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

  const fetchFavorites = async () => {
    try {
      const res: any = await favoritesApi.list({ page: 1, limit: 1000 })
      const list = Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
        ? res
        : []
      setFavSet(
        new Set(
          list.map((f: any) => String(f.property_id ?? f.id)).filter(Boolean)
        )
      )
    } catch (error) {
      console.error('[Listings] 加载收藏状态失败', error)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchListings(1)
    fetchFavorites()
  })

  const handleSearch = () => {
    const q = keyword.trim()
    // 提交搜索时写入历史：去重置顶、上限 10 条、越界丢最旧
    if (q) {
      setRecentSearches((prev) => {
        const next = [q, ...prev.filter((k) => k !== q)].slice(0, RECENT_SEARCHES_MAX)
        try {
          Taro.setStorageSync(RECENT_SEARCHES_KEY, next)
        } catch (e) {
          console.error('[Listings] 保存搜索历史失败', e)
        }
        return next
      })
    }
    setQuery(q)
    fetchListings(1, { q })
  }

  const applyRecent = (word: string) => {
    setKeyword(word)
    setQuery(word)
    fetchListings(1, { q: word })
  }

  const clearRecent = () => {
    setRecentSearches([])
    try {
      Taro.setStorageSync(RECENT_SEARCHES_KEY, [])
    } catch (e) {
      console.error('[Listings] 清空搜索历史失败', e)
    }
  }

  const toggleFavorite = async (e: any, item: Listing) => {
    e.stopPropagation()
    const pid = String(item.id)
    if (favPending.has(pid)) return
    const willFav = !favSet.has(pid)
    setFavPending((s) => new Set(s).add(pid))
    setFavSet((prev) => {
      const next = new Set(prev)
      if (willFav) next.add(pid)
      else next.delete(pid)
      return next
    })
    try {
      if (willFav) await favoritesApi.add(pid)
      else await favoritesApi.remove(pid)
      Taro.showToast({ title: willFav ? t('prop.favOn') : t('tl.unfaved'), icon: 'none' })
    } catch (error) {
      console.error('[Listings] 收藏切换失败', error)
      setFavSet((prev) => {
        const next = new Set(prev)
        if (willFav) next.delete(pid)
        else next.add(pid)
        return next
      })
      Taro.showToast({ title: t('common.opFailed'), icon: 'none' })
    } finally {
      setFavPending((s) => {
        const next = new Set(s)
        next.delete(pid)
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
    } catch (e) {
      console.error('[Listings] 定位失败', e)
      Taro.showToast({ title: t('tl.nearbyDenied'), icon: 'none' })
    }
  }

  // 地图找房：跳转到地图页，带上当前业务/类型/新房口径
  const handleGoMap = () => {
    const ptype = filterTypes.join(',')
    const params = [
      `listing_type=${biz === 'sale' ? 'sell' : 'rent'}`,
      ptype ? `ptype=${encodeURIComponent(ptype)}` : '',
      isNew === undefined ? '' : `new=${isNew ? 1 : 0}`
    ]
      .filter(Boolean)
      .join('&')
    Taro.navigateTo({ url: `/pages/public/map/index?${params}` })
  }

  // 顶部城市胶囊：跳全局定位选择页（与主页左上角城市入口同一目标）
  const handlePickCity = () => {
    Taro.navigateTo({ url: '/pages/location/index' })
  }

  const openDetail = (item: Listing) => {
    Taro.navigateTo({ url: `/pages/tenant/property-detail/index?id=${item.id}` })
  }

  return (
    <View className='tenant-listings-page'>
      <ListingsFeed
        items={visibleList}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={listError}
        onLoadMore={fetchMore}
        onRetry={() => fetchListings(1, { q: query })}
        filters={filters}
        onFiltersChange={patchFilters}
        cityDistricts={cityDistricts}
        metroLines={cityMetroLines}
        cityLabel={locSel.cityLabel}
        onPickCity={handlePickCity}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onSearch={handleSearch}
        recentSearches={recentSearches}
        onPickRecent={applyRecent}
        onClearRecent={clearRecent}
        nearby={nearby}
        onToggleNearby={handleToggleNearby}
        biz={biz}
        onBizChange={setBiz}
        favSet={favSet}
        favPending={favPending}
        onToggleFavorite={toggleFavorite}
        resultCount={visibleList.length}
        onGoMap={handleGoMap}
        onOpenDetail={openDetail}
      />
      <BottomNav role='tenant' active='browse' />
    </View>
  )
}
