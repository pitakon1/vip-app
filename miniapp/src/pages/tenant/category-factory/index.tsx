/**
 * 厂房分类页（贝壳式）· 小程序。
 *
 * 沿用商铺办公骨架，业务固定 `property_type=['factory']`，Tab = 租厂房 / 买厂房。
 * 卡片为横向卡：土地面积 / 层高 / 荷载 / 柱距 / 电力 / 可环评 / 整栋等真实字段，
 * 无该字段的一律不渲染，绝不用占位数据补齐版面。
 */
import { useCallback, useMemo, useState } from 'react'
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/i18n'
import { useLocationStore } from '@/stores/location'
import { publicApi, unwrapPage, type PublicListing } from '@/services/publicApi'
import {
  BannerCard,
  CategoryListScreen,
  EntryGrid,
  type FilterGroup,
  type GridItem,
  type QuickTag
} from '@/components/CategoryKit'
import { FactoryRow } from '@/components/CategoryKit/cards'
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
  useDistrictNodes
} from '@/lib/categoryShared'
import './index.scss'

const PAGE_SIZE = 20

type TabKey = 'rent-factory' | 'sell-factory'

export default function CategoryFactoryPage() {
  const { t } = useI18n()
  const city = useLocationStore((s) => s.selection.cityLabel)
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const [tab, setTab] = useState<TabKey>('rent-factory')
  const districtNodes = useDistrictNodes({
    city: cityKey,
    listingType: tab === 'rent-factory' ? 'rent' : 'sell',
    propertyType: ['factory']
  })

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })
  }

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'select', label: t('category.factGridSelect'), icon: 'star', onPress: () => notAvailable(t('category.factGridSelect')) },
      { key: 'rent', label: t('category.factTabRent'), icon: 'cube', onPress: () => setTab('rent-factory') },
      { key: 'sell', label: t('category.factTabSell'), icon: 'tag', onPress: () => setTab('sell-factory') },
      { key: 'project', label: t('category.factGridProject'), icon: 'building', onPress: () => Taro.navigateTo({ url: '/pages/public/communities/index' }) },
      { key: 'land', label: t('category.factGridLand'), icon: 'map', onPress: () => notAvailable(t('category.factGridLand')) },
      { key: 'broker', label: t('category.findBroker'), icon: 'users', onPress: () => notAvailable(t('category.findBroker')) },
      { key: 'subway', label: t('category.factGridSubway'), icon: 'train', onPress: () => notAvailable(t('category.factGridSubway')) },
      { key: 'env', label: t('category.factGridEnv'), icon: 'leaf', onPress: () => notAvailable(t('category.factGridEnv')) },
      { key: 'vr', label: t('category.factGridVr'), icon: 'maximize', onPress: () => notAvailable(t('category.factGridVr')) },
      { key: 'assist', label: t('category.helpFind'), icon: 'help', onPress: () => notAvailable(t('category.helpFind')) }
    ],
    [t]
  )

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districtNodes), t),
      {
        key: 'price',
        label: t('category.filterPrice'),
        options: rangeOptions(t, tab.startsWith('rent') ? RENT_PRICE_RANGES : SELL_PRICE_RANGES)
      },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          boolGroup('environmental_permit', t('category.filterEnvPermit'), t),
          boolGroup('whole_building_only', t('category.filterWholeBuilding'), t),
          boolGroup('has_video', t('category.filterHasVideo'), t),
          boolGroup('has_vr', t('category.tagVr'), t),
          boolGroup('is_featured', t('category.tagFeatured'), t),
          boolGroup('owner_direct', t('category.tagOwnerDirect'), t)
        ]
      },
      listingSortGroup(t)
    ],
    [districtNodes, t, tab]
  )

  const quickTags: QuickTag[] = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'env', label: t('category.tagEnvPermit'), group: 'environmental_permit', value: '1' },
      { key: 'building', label: t('category.tagWholeBuilding'), group: 'whole_building_only', value: '1' },
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' }
    ],
    [t]
  )

  const buildQuery = useCallback((state: any) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      listing_type: (state.tab ?? 'rent-factory') === 'rent-factory' ? 'rent' : 'sell',
      property_type: ['factory'],
      // 城市统一传定位 cityKey（后端做 slug 归一化）
      city: cityKey,
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
      sort: state.sort
    }
  }, [cityKey])

  const fetchPage = useCallback(async (page: number, query: any) => {
    const res: any = await publicApi.listings({ page, page_size: PAGE_SIZE, ...query })
    return unwrapPage<PublicListing>((res as any)?.data ?? res)
  }, [])

  const top = (
    <View className='cat-top'>
      <EntryGrid items={grid} />
      <BannerCard
        title={t('category.factBannerTitle')}
        sub={t('category.factBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(t('category.factBannerTitle'))}
      />
    </View>
  )

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.factTitle')}
      city={city}
      onCityPress={() => Taro.navigateTo({ url: '/pages/location/index' })}
      searchPlaceholder={t('category.factSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'rent-factory', label: t('category.factTabRent') },
        { key: 'sell-factory', label: t('category.factTabSell') }
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <FactoryRow item={item} onPress={() => goDetail(item.id)} />}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyFactory')}
      emptySub={t('category.emptySub')}
      emptyIcon='cube'
    />
  )
}
