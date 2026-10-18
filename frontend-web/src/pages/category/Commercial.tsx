/**
 * 商铺办公分类页（贝壳式，Web）。对齐 App 端 CommercialScreen。
 *
 * Tab = 租写字楼 / 买写字楼 / 租商铺 / 买商铺，正是
 * `listing_type(rent|sell) × property_type(office|shop)` 四组合。
 * 卡片为横向卡：面积 / 商圈·楼盘 / 标签 / 月租 + 元/㎡/天。
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BankOutlined,
  BuildOutlined,
  ContainerOutlined,
  ShopOutlined,
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
import { CommercialCard, type PublicListing } from './categoryCards'
import {
  AREA_RANGES,
  RENT_PRICE_RANGES,
  SELL_PRICE_RANGES,
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

const ICON_COLOR = (i: number) =>
  ['var(--rent-primary)', 'var(--state-info)', 'var(--state-warning)', 'var(--state-success)', 'var(--state-error)'][i % 5]

type TabKey = 'rent-office' | 'sell-office' | 'rent-shop' | 'sell-shop'

const TAB_PARAMS: Record<TabKey, { listing_type: 'rent' | 'sell'; property_type: string[] }> = {
  'rent-office': { listing_type: 'rent', property_type: ['office'] },
  'sell-office': { listing_type: 'sell', property_type: ['office'] },
  'rent-shop': { listing_type: 'rent', property_type: ['shop'] },
  'sell-shop': { listing_type: 'sell', property_type: ['shop'] },
}

export default function Commercial() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const summary = useCategorySummary(cityKey)
  const [tab, setTab] = useState<TabKey>('rent-office')
  const districts = useDistricts({
    city: cityKey,
    listingType: TAB_PARAMS[tab].listing_type,
    propertyTypes: TAB_PARAMS[tab].property_type,
  })

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'select', label: t('category.commGridSelect'), icon: <StarOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => notAvailable(t, t('category.commGridSelect')) },
      { key: 'rent-office', label: t('category.commTabRentOffice'), icon: <BuildOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => setTab('rent-office') },
      { key: 'sell-office', label: t('category.commTabSellOffice'), icon: <BankOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => setTab('sell-office') },
      { key: 'rent-shop', label: t('category.commTabRentShop'), icon: <ShopOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => setTab('rent-shop') },
      { key: 'sell-shop', label: t('category.commTabSellShop'), icon: <ContainerOutlined style={{ color: ICON_COLOR(4) }} />, onPress: () => setTab('sell-shop') },
      { key: 'project', label: t('category.commGridProject'), icon: <BuildOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => navigate('/communities') },
      { key: 'broker', label: t('category.findBroker'), icon: <UsergroupAddOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => notAvailable(t, t('category.findBroker')) },
      { key: 'subway', label: t('category.commGridSubway'), icon: <ThunderboltOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => notAvailable(t, t('category.commGridSubway')) },
      { key: 'vr', label: t('category.commGridVr'), icon: <VideoCameraOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => notAvailable(t, t('category.commGridVr')) },
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
          boolGroup('whole_floor_only', t('category.filterWholeFloor'), t),
          boolGroup('whole_building_only', t('category.filterWholeBuilding'), t),
          boolGroup('company_registrable', t('category.filterRegistrable'), t),
          decorationGroup(t),
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
      { key: 'floor', label: t('category.tagWholeFloor'), group: 'whole_floor_only', value: '1' },
      { key: 'building', label: t('category.tagWholeBuilding'), group: 'whole_building_only', value: '1' },
      { key: 'reg', label: t('category.tagRegistrable'), group: 'company_registrable', value: '1' },
      { key: 'deco', label: t('publicSite.decoration.standard'), group: 'decoration', value: 'standard' },
    ],
    [t],
  )

  const buildQuery = useCallback((state: CategoryQueryState) => {
    const tabKey = (state.tab ?? 'rent-office') as TabKey
    const base = TAB_PARAMS[tabKey] ?? TAB_PARAMS['rent-office']
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      city: cityKey,
      listing_type: base.listing_type,
      property_type: base.property_type,
      q: state.keyword || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      area_min: area.min,
      area_max: area.max,
      whole_floor_only: state.values.whole_floor_only === '1' ? true : undefined,
      whole_building_only: state.values.whole_building_only === '1' ? true : undefined,
      company_registrable: state.values.company_registrable === '1' ? true : undefined,
      decoration: state.values.decoration || undefined,
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
        title={t('category.commBannerTitle')}
        sub={t('category.commBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(t, t('category.commBannerTitle'))}
      />
    </div>
  )

  return (
    <CategoryPage<PublicListing>
      title={t('category.commTitle')}
      searchPlaceholder={t('category.commSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'rent-office', label: t('category.commTabRentOffice') },
        { key: 'sell-office', label: t('category.commTabSellOffice') },
        { key: 'rent-shop', label: t('category.commTabRentShop') },
        { key: 'sell-shop', label: t('category.commTabSellShop') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <CommercialCard item={item} onPress={() => navigate(`/listing/${item.id}`)} />}
      keyOf={(item) => item.id}
      emptyTitle={t('category.emptyCommerce')}
      emptySub={t('category.emptySub')}
      layout="wide"
    />
  )
}
