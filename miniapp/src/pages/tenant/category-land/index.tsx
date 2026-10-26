/**
 * 土地分类页（贝壳式）· 小程序。
 *
 * 沿用厂房骨架，业务固定 `property_type=['land']`，Tab = 租土地 / 买土地。
 * 卡片为横向卡：地块面积 / 位置 / 可环评 / 整块等真实字段，缺失字段不渲染。
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

type TabKey = 'rent-land' | 'sell-land'

export default function CategoryLandPage() {
  const { t } = useI18n()
  const city = useLocationStore((s) => s.selection.cityLabel)
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const [tab, setTab] = useState<TabKey>('rent-land')
  const districtNodes = useDistrictNodes({
    city: cityKey,
    listingType: tab === 'rent-land' ? 'rent' : 'sell',
    propertyType: ['land']
  })

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })
  }

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'select', label: t('category.landGridSelect'), icon: 'star', onPress: () => notAvailable(t('category.landGridSelect')) },
      { key: 'rent', label: t('category.landTabRent'), icon: 'map', onPress: () => setTab('rent-land') },
      { key: 'sell', label: t('category.landTabSell'), icon: 'tag', onPress: () => setTab('sell-land') },
      { key: 'project', label: t('category.landGridProject'), icon: 'building', onPress: () => Taro.navigateTo({ url: '/pages/public/communities/index' }) },
      { key: 'subway', label: t('category.landGridSubway'), icon: 'train', onPress: () => notAvailable(t('category.landGridSubway')) },
      { key: 'vr', label: t('category.landGridVr'), icon: 'maximize', onPress: () => notAvailable(t('category.landGridVr')) },
      { key: 'broker', label: t('category.findBroker'), icon: 'users', onPress: () => notAvailable(t('category.findBroker')) },
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
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' },
      { key: 'vr', label: t('category.tagVr'), group: 'has_vr', value: '1' }
    ],
    [t]
  )

  const buildQuery = useCallback((state: any) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      listing_type: (state.tab ?? 'rent-land') === 'rent-land' ? 'rent' : 'sell',
      property_type: ['land'],
      // 城市统一传定位 cityKey（后端做 slug 归一化）
      city: cityKey,
      q: state.keyword || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      area_min: area.min,
      area_max: area.max,
      environmental_permit: state.values.environmental_permit === '1' ? true : undefined,
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
        title={t('category.landBannerTitle')}
        sub={t('category.landBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(t('category.landBannerTitle'))}
      />
    </View>
  )

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.landTitle')}
      city={city}
      onCityPress={() => Taro.navigateTo({ url: '/pages/location/index' })}
      searchPlaceholder={t('category.landSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'rent-land', label: t('category.landTabRent') },
        { key: 'sell-land', label: t('category.landTabSell') }
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <FactoryRow
          item={item}
          mode={tab.startsWith('rent') ? 'rent' : 'sell'}
          onPress={() => goDetail(item.id)}
        />
      )}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyLand')}
      emptySub={t('category.emptySub')}
      emptyIcon='map'
    />
  )
}
