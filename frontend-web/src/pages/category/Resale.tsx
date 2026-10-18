/**
 * 二手房分类页（贝壳式，Web）。对齐 App 端 ResaleScreen。
 *
 * 业务固定 `listing_type=sell` + `is_new_development=false`。
 * 行情对比卡取聚合摘要里真实的区域均价两两对比（不足两个区域则整块不渲染）。
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AppstoreOutlined,
  BankOutlined,
  BarChartOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  ReadOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  UsergroupAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import api from '@/lib/api'
import { useDistricts } from '@/lib/publicDistricts'
import { useLocationStore } from '@/stores/location'
import {
  CategoryPage,
  EntryGrid,
  MarketCompareCard,
  PAGE_SIZE,
  type CategoryQueryState,
  type GridItem,
} from './CategoryShell'
import { ResidentialCard, type PublicListing } from './categoryCards'
import {
  AREA_RANGES,
  SELL_PRICE_RANGES,
  bedroomGroup,
  boolGroup,
  decorationGroup,
  districtGroup,
  districtOptions,
  listingSortGroup,
  notAvailable,
  parseRange,
  rangeOptions,
  useCategorySummary,
} from './categoryShared'
import { formatMoney } from '@/lib/money'

const ICON_COLOR = (i: number) =>
  ['var(--rent-primary)', 'var(--state-info)', 'var(--state-warning)', 'var(--state-success)', 'var(--state-error)'][i % 5]

export default function Resale() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const summary = useCategorySummary(cityKey)
  const [tab, setTab] = useState<'recommend' | 'deal'>('recommend')
  const districts = useDistricts({ city: cityKey, listingType: 'sell' })

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'map', label: t('category.resaleGridMap'), icon: <EnvironmentOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => notAvailable(t, t('category.resaleGridMap')) },
      { key: 'community', label: t('publicSite.navCommunities'), icon: <BankOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => navigate('/communities') },
      { key: 'deal', label: t('category.resaleGridDeal'), icon: <BarChartOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => notAvailable(t, t('category.resaleGridDeal')) },
      { key: 'broker', label: t('category.findBroker'), icon: <UsergroupAddOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => notAvailable(t, t('category.findBroker')) },
      { key: 'all', label: t('category.allListings'), icon: <AppstoreOutlined style={{ color: ICON_COLOR(4) }} />, onPress: () => navigate('/listings') },
      { key: 'school', label: t('publicSite.navSchools'), icon: <ReadOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => navigate('/schools') },
      { key: 'rank', label: t('category.resaleGridRank'), icon: <TrophyOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => notAvailable(t, t('category.resaleGridRank')) },
      { key: 'live', label: t('category.resaleGridLive'), icon: <VideoCameraOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => notAvailable(t, t('category.resaleGridLive')) },
      { key: 'subway', label: t('category.resaleGridSubway'), icon: <ThunderboltOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => notAvailable(t, t('category.resaleGridSubway')) },
      { key: 'owner', label: t('category.resaleGridOwner'), icon: <HomeOutlined style={{ color: ICON_COLOR(4) }} />, onPress: () => notAvailable(t, t('category.resaleGridOwner')) },
    ],
    [navigate, t],
  )

  const filterGroups = useMemo(
    () => [
      districtGroup(districts.length ? districts : districtOptions(summary), t),
      { key: 'price', label: t('category.filterTotalPrice'), options: rangeOptions(t, SELL_PRICE_RANGES) },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          bedroomGroup(t),
          decorationGroup(t),
          boolGroup('has_vr', t('category.filterVr'), t),
          boolGroup('is_featured', t('category.filterFeatured'), t),
          boolGroup('owner_direct', t('category.filterOwnerDirect'), t),
        ],
      },
      listingSortGroup(t),
    ],
    [summary, districts, t],
  )

  const quickTags = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'b2', label: `2${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '2' },
      { key: 'b3', label: `3${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '3' },
      { key: 'b4', label: `4${t('category.bedroomUnit')}+`, group: 'bedrooms_min', value: '4' },
      { key: 'deco', label: t('publicSite.decoration.standard'), group: 'decoration', value: 'standard' },
    ],
    [t],
  )

  const buildQuery = useCallback((state: CategoryQueryState) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      city: cityKey,
      listing_type: 'sell',
      is_new_development: false,
      q: state.keyword || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      area_min: area.min,
      area_max: area.max,
      bedrooms_min: state.values.bedrooms_min ? Number(state.values.bedrooms_min) : undefined,
      decoration: state.values.decoration || undefined,
      has_vr: state.values.has_vr === '1' ? true : undefined,
      is_featured: state.values.is_featured === '1' ? true : undefined,
      owner_direct: state.values.owner_direct === '1' ? true : undefined,
      // 「捡漏榜」= 按总价升序（真实排序口径，非编造榜单）
      sort: state.tab === 'deal' ? 'price_asc' : state.values.sort,
    }
  }, [cityKey])

  const fetchPage = useCallback(async (page: number, query: Record<string, unknown>) => {
    const res = await api.get('/public/listings', { params: { page, page_size: PAGE_SIZE, ...query } })
    const payload = res.data?.data ?? res.data
    const items = Array.isArray(payload?.items) ? payload.items : []
    return { items: items as PublicListing[], total: Number(payload?.total ?? 0) }
  }, [])

  const pairs = summary?.district_price_pairs ?? []

  const top = (
    <div>
      <EntryGrid items={grid} />
      {pairs.length >= 2 ? (
        <MarketCompareCard
          left={{ name: pairs[0].district, price: `${formatMoney(pairs[0].avg_price, 'THB')}/${t('publicSite.sqm')}` }}
          right={{ name: pairs[1].district, price: `${formatMoney(pairs[1].avg_price, 'THB')}/${t('publicSite.sqm')}` }}
          actionLabel={t('category.viewCompare')}
          onPress={() => notAvailable(t, t('category.viewCompare'))}
        />
      ) : null}
    </div>
  )

  return (
    <CategoryPage<PublicListing>
      title={t('category.resaleTitle')}
      searchPlaceholder={t('category.resaleSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'recommend', label: t('category.resaleTabRecommend') },
        { key: 'deal', label: t('category.resaleTabDeal') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as 'recommend' | 'deal')}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <ResidentialCard item={item} mode="sell" onPress={() => navigate(`/listing/${item.id}`)} />}
      keyOf={(item) => item.id}
      emptyTitle={t('category.emptyResale')}
      emptySub={t('category.emptySub')}
      layout="grid"
    />
  )
}
