/**
 * 厂房分类页（贝壳式，Web）。对齐 App 端 FactoryScreen。
 *
 * 沿用商铺办公骨架，业务固定 `property_type=['factory']`，Tab = 租厂房 / 买厂房。
 * 卡片为横向卡：土地面积 / 层高 / 荷载 / 柱距 / 电力 / 可环评 / 整栋等真实字段，
 * 无该字段的一律不渲染，绝不用占位数据补齐版面。
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BuildOutlined,
  ContainerOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  StarOutlined,
  TeamOutlined,
  ThunderboltOutlined,
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
import { FactoryCard, type PublicListing } from './categoryCards'
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

type TabKey = 'rent-factory' | 'sell-factory'

export default function Factory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const summary = useCategorySummary(cityKey)
  const [tab, setTab] = useState<TabKey>('rent-factory')
  const districts = useDistricts({
    city: cityKey,
    listingType: tab === 'rent-factory' ? 'rent' : 'sell',
    propertyTypes: ['factory'],
  })

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'select', label: t('category.factGridSelect'), icon: <StarOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => notAvailable(t, t('category.factGridSelect')) },
      { key: 'rent', label: t('category.factTabRent'), icon: <ContainerOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => setTab('rent-factory') },
      { key: 'sell', label: t('category.factTabSell'), icon: <BuildOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => setTab('sell-factory') },
      { key: 'project', label: t('category.factGridProject'), icon: <BuildOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => navigate('/communities') },
      { key: 'land', label: t('category.factGridLand'), icon: <EnvironmentOutlined style={{ color: ICON_COLOR(4) }} />, onPress: () => notAvailable(t, t('category.factGridLand')) },
      { key: 'broker', label: t('category.findBroker'), icon: <UsergroupAddOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => notAvailable(t, t('category.findBroker')) },
      { key: 'subway', label: t('category.factGridSubway'), icon: <ThunderboltOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => notAvailable(t, t('category.factGridSubway')) },
      { key: 'env', label: t('category.factGridEnv'), icon: <ExperimentOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => notAvailable(t, t('category.factGridEnv')) },
      { key: 'vr', label: t('category.factGridVr'), icon: <VideoCameraOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => notAvailable(t, t('category.factGridVr')) },
      { key: 'assist', label: t('category.helpFind'), icon: <TeamOutlined style={{ color: ICON_COLOR(4) }} />, onPress: () => notAvailable(t, t('category.helpFind')) },
    ],
    [navigate, t],
  )

  const filterGroups = useMemo(
    () => [
      districtGroup(districts.length ? districts : districtOptions(summary), t),
      {
        key: 'price',
        label: t('category.filterPrice'),
        options: rangeOptions(t, tab.startsWith('rent') ? RENT_PRICE_RANGES : SELL_PRICE_RANGES),
      },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          boolGroup('environmental_permit', t('category.filterEnvPermit'), t),
          boolGroup('whole_building_only', t('category.filterWholeBuilding'), t),
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
      { key: 'env', label: t('category.tagEnvPermit'), group: 'environmental_permit', value: '1' },
      { key: 'building', label: t('category.tagWholeBuilding'), group: 'whole_building_only', value: '1' },
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' },
    ],
    [t],
  )

  const buildQuery = useCallback((state: CategoryQueryState) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      city: cityKey,
      listing_type: (state.tab ?? 'rent-factory') === 'rent-factory' ? 'rent' : 'sell',
      property_type: ['factory'],
      q: state.keyword || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      area_min: area.min,
      area_max: area.max,
      environmental_permit: state.values.environmental_permit === '1' ? true : undefined,
      whole_building_only: state.values.whole_building_only === '1' ? true : undefined,
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
        title={t('category.factBannerTitle')}
        sub={t('category.factBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(t, t('category.factBannerTitle'))}
      />
    </div>
  )

  return (
    <CategoryPage<PublicListing>
      title={t('category.factTitle')}
      searchPlaceholder={t('category.factSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'rent-factory', label: t('category.factTabRent') },
        { key: 'sell-factory', label: t('category.factTabSell') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <FactoryCard item={item} onPress={() => navigate(`/listing/${item.id}`)} />}
      keyOf={(item) => item.id}
      emptyTitle={t('category.emptyFactory')}
      emptySub={t('category.emptySub')}
      layout="wide"
    />
  )
}
