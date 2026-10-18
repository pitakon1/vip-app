/**
 * 租房分类页（贝壳式，Web）。对齐 App 端 RentCategoryScreen 的信息结构。
 *
 * 业务固定 `listing_type=rent`；Tab = 整租 / 公寓（仅保留这两类业务口径）。
 * 卡片以「月租」为主口径，附户型/面积/家具/装修/已核验等真实字段。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AppstoreOutlined,
  BankOutlined,
  ClockCircleOutlined,
  CrownOutlined,
  EnvironmentOutlined,
  ReadOutlined,
  StarOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons'
import api from '@/lib/api'
import { useDistricts } from '@/lib/publicDistricts'
import { useLocationStore } from '@/stores/location'
import {
  CategoryPage,
  EntryGrid,
  PAGE_SIZE,
  ServiceBar,
  type CategoryQueryState,
  type GridItem,
} from './CategoryShell'
import { ResidentialCard, type PublicListing } from './categoryCards'
import {
  AREA_RANGES,
  RENT_PRICE_RANGES,
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

const ICON_COLOR = (i: number) =>
  ['var(--rent-primary)', 'var(--state-info)', 'var(--state-warning)', 'var(--state-success)', 'var(--state-error)'][i % 5]

export default function RentCategory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const summary = useCategorySummary(cityKey)
  const [tab, setTab] = useState<'whole' | 'apartment'>('whole')
  const [rail, setRail] = useState<PublicListing[]>([])

  // 区域候选：真实「有房源的区域」；为空则回退聚合摘要里的区域均价清单
  const districts = useDistricts({
    city: cityKey,
    listingType: 'rent',
    propertyTypes: tab === 'apartment' ? ['apartment', 'condo'] : undefined,
  })

  // 「新上房源」rail：真实最新在租单，空则整块不渲染
  useEffect(() => {
    let alive = true
    api
      .get('/public/listings', { params: { listing_type: 'rent', sort: 'latest', page_size: 6 } })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        if (alive) setRail(Array.isArray(payload?.items) ? payload.items : [])
      })
      .catch(() => {
        if (alive) setRail([])
      })
    return () => {
      alive = false
    }
  }, [])

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'map', label: t('category.rentGridMap'), icon: <EnvironmentOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => notAvailable(t, t('category.rentGridMap')) },
      { key: 'commute', label: t('category.rentGridCommute'), icon: <ThunderboltOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => notAvailable(t, t('category.rentGridCommute')) },
      { key: 'selfrun', label: t('category.rentGridSelf'), icon: <StarOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => notAvailable(t, t('category.rentGridSelf')) },
      { key: 'newest', label: t('category.newListings'), icon: <ClockCircleOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => notAvailable(t, t('category.newListings')) },
      { key: 'assist', label: t('category.helpFind'), icon: <TeamOutlined style={{ color: ICON_COLOR(4) }} />, onPress: () => notAvailable(t, t('category.helpFind')) },
      { key: 'broker', label: t('category.findBroker'), icon: <UsergroupAddOutlined style={{ color: ICON_COLOR(1) }} />, onPress: () => notAvailable(t, t('category.findBroker')) },
      { key: 'all', label: t('category.allListings'), icon: <AppstoreOutlined style={{ color: ICON_COLOR(0) }} />, onPress: () => navigate('/listings') },
      { key: 'school', label: t('publicSite.navSchools'), icon: <ReadOutlined style={{ color: ICON_COLOR(2) }} />, onPress: () => navigate('/schools') },
      { key: 'community', label: t('publicSite.navCommunities'), icon: <BankOutlined style={{ color: ICON_COLOR(3) }} />, onPress: () => navigate('/communities') },
      { key: 'furnished', label: t('category.furnishedListings'), icon: <CrownOutlined style={{ color: ICON_COLOR(4) }} />, onPress: () => notAvailable(t, t('category.furnishedListings')) },
    ],
    [navigate, t],
  )

  const filterGroups = useMemo(
    () => [
      districtGroup(districts.length ? districts : districtOptions(summary), t),
      { key: 'price', label: t('category.filterPrice'), options: rangeOptions(t, RENT_PRICE_RANGES) },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          bedroomGroup(t),
          decorationGroup(t),
          boolGroup('has_video', t('category.filterHasVideo'), t),
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
      { key: 'b1', label: `1${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '1' },
      { key: 'b2', label: `2${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '2' },
      { key: 'b3', label: `3${t('category.bedroomUnit')}+`, group: 'bedrooms_min', value: '3' },
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' },
    ],
    [t],
  )

  const buildQuery = useCallback((state: CategoryQueryState) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      city: cityKey,
      listing_type: 'rent',
      property_type: state.tab === 'apartment' ? ['apartment', 'condo'] : undefined,
      q: state.keyword || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      area_min: area.min,
      area_max: area.max,
      bedrooms_min: state.values.bedrooms_min ? Number(state.values.bedrooms_min) : undefined,
      decoration: state.values.decoration || undefined,
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
      <ServiceBar
        text={t('category.rentServiceText')}
        actionLabel={t('category.helpFind')}
        onAction={() => notAvailable(t, t('category.helpFind'))}
      />
      {rail.length > 0 ? (
        <>
          <h2 className="cat-section-title">{t('category.newListings')}</h2>
          <div className="cat-rail">
            {rail.map((it) => (
              <div className="cat-rail-item" key={it.id}>
                <ResidentialCard item={it} mode="rent" onPress={() => navigate(`/listing/${it.id}`)} />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )

  return (
    <CategoryPage<PublicListing>
      title={t('category.rentTitle')}
      searchPlaceholder={t('category.rentSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'whole', label: t('category.rentTabWhole') },
        { key: 'apartment', label: t('category.rentTabApartment') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as 'whole' | 'apartment')}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <ResidentialCard item={item} mode="rent" onPress={() => navigate(`/listing/${item.id}`)} />}
      keyOf={(item) => item.id}
      emptyTitle={t('category.emptyRent')}
      emptySub={t('category.emptySub')}
      layout="grid"
    />
  )
}
