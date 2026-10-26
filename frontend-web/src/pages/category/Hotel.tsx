/**
 * 酒店分类页（贝壳式，Web）。
 *
 * 沿用厂房/商办分类页骨架，业务固定 `property_type=['hotel']`，
 * Tab = 租酒店 / 买酒店；卡片复用商办横向卡（面积/区域/价格均取真实字段）。
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AppstoreOutlined,
  EnvironmentOutlined,
  ShopOutlined,
  StarOutlined,
  UsergroupAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import api from '@/lib/api'
import { useDistricts } from '@/lib/publicDistricts'
import { useLocationStore } from '@/stores/location'
import {
  BannerCard,
  CategoryPage,
  EntryGrid,
  PAGE_SIZE,
  type CategoryQueryState,
  type GridItem,
} from './CategoryShell'
import { CommercialCard, type PublicListing } from './categoryCards'
import {
  AREA_RANGES,
  RENT_PRICE_RANGES,
  SELL_PRICE_RANGES,
  boolGroup,
  districtGroup,
  districtOptions,
  listingSortGroup,
  notAvailable,
  parseRange,
  rangeOptions,
  useCategorySummary,
} from './categoryShared'

const ICON_COLOR = (i: number) =>
  ['var(--rent-primary)', 'var(--state-info)', 'var(--state-warning)', 'var(--state-success)', 'var(--state-error)'][i % 5]

type TabKey = 'rent-hotel' | 'sell-hotel'

export default function Hotel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const summary = useCategorySummary(cityKey)
  const [tab, setTab] = useState<TabKey>('rent-hotel')
  const districts = useDistricts({
    city: cityKey,
    listingType: tab === 'rent-hotel' ? 'rent' : 'sell',
    propertyTypes: ['hotel'],
  })

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'select', label: t('category.hotelGridSelect'), icon: <StarOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => notAvailable(t, t('category.hotelGridSelect')) },
      { key: 'rent', label: t('category.hotelTabRent'), icon: <ShopOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => setTab('rent-hotel') },
      { key: 'sell', label: t('category.hotelTabSell'), icon: <VideoCameraOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => setTab('sell-hotel') },
      { key: 'map', label: t('category.rentGridMap'), icon: <EnvironmentOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => navigate('/map') },
      { key: 'broker', label: t('category.findBroker'), icon: <UsergroupAddOutlined style={{ color: ICON_COLOR(4) }} />, onPress: () => notAvailable(t, t('category.findBroker')) },
      { key: 'all', label: t('category.allListings'), icon: <AppstoreOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => navigate('/listings') },
    ],
    [navigate, t],
  )

  const filterGroups = useMemo(
    () => [
      districtGroup(districts.length ? districts : districtOptions(summary), t),
      {
        key: 'price',
        label: t('category.filterPrice'),
        options: rangeOptions(t, tab === 'rent-hotel' ? RENT_PRICE_RANGES : SELL_PRICE_RANGES),
      },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          boolGroup('has_video', t('category.filterHasVideo'), t),
          boolGroup('has_vr', t('category.filterVr'), t),
          boolGroup('is_featured', t('category.filterFeatured'), t),
          boolGroup('owner_direct', t('category.filterOwnerDirect'), t),
        ],
      },
      listingSortGroup(t),
    ],
    [summary, districts, t, tab],
  )

  const quickTags = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' },
      { key: 'vr', label: t('category.filterVr'), group: 'has_vr', value: '1' },
      { key: 'featured', label: t('category.filterFeatured'), group: 'is_featured', value: '1' },
    ],
    [t],
  )

  const buildQuery = useCallback((state: CategoryQueryState) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      city: cityKey,
      listing_type: (state.tab ?? 'rent-hotel') === 'rent-hotel' ? 'rent' : 'sell',
      property_type: ['hotel'],
      q: state.keyword || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      area_min: area.min,
      area_max: area.max,
      has_video: state.values.has_video === '1' ? true : undefined,
      has_vr: state.values.has_vr === '1' ? true : undefined,
      is_featured: state.values.is_featured === '1' ? true : undefined,
      owner_direct: state.values.owner_direct === '1' ? true : undefined,
      sort: state.values.sort,
    }
  }, [cityKey])

  const fetchPage = useCallback(async (page: number, query: Record<string, unknown>) => {
    const res = await api.get('/public/listings', { params: { page, page_size: PAGE_SIZE, ...query } })
    const payload = res.data?.data ?? res.data
    const items = Array.isArray(payload?.items) ? payload.items : []
    return { items: items as PublicListing[], total: Number(payload?.total ?? 0) }
  }, [])

  const top = (
    <div>
      <EntryGrid items={grid} />
      <BannerCard
        title={t('category.hotelBannerTitle')}
        sub={t('category.hotelBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(t, t('category.hotelBannerTitle'))}
      />
    </div>
  )

  return (
    <CategoryPage<PublicListing>
      title={t('category.hotelTitle')}
      searchPlaceholder={t('category.hotelSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'rent-hotel', label: t('category.hotelTabRent') },
        { key: 'sell-hotel', label: t('category.hotelTabSell') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <CommercialCard
          item={item}
          mode={tab.startsWith('rent') ? 'rent' : 'sell'}
          onPress={() => navigate(`/listing/${item.id}`)}
        />
      )}
      keyOf={(item) => item.id}
      emptyTitle={t('category.emptyHotel')}
      emptySub={t('category.emptySub')}
      layout="wide"
    />
  )
}
