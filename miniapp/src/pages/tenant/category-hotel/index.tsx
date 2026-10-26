/**
 * 酒店分类页（贝壳式）· 小程序。
 *
 * 沿用厂房/商办骨架，业务固定 `property_type=['hotel']`，Tab = 租酒店 / 买酒店。
 * 卡片为横向卡：面积 / 商圈·位置 / 标签 / 单价，缺失字段不渲染。
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
import { CommercialRow } from '@/components/CategoryKit/cards'
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

type TabKey = 'rent-hotel' | 'sell-hotel'

export default function CategoryHotelPage() {
  const { t } = useI18n()
  const city = useLocationStore((s) => s.selection.cityLabel)
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const [tab, setTab] = useState<TabKey>('rent-hotel')
  const districtNodes = useDistrictNodes({
    city: cityKey,
    listingType: tab === 'rent-hotel' ? 'rent' : 'sell',
    propertyType: ['hotel']
  })

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })
  }

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'select', label: t('category.hotelGridSelect'), icon: 'star', onPress: () => notAvailable(t('category.hotelGridSelect')) },
      { key: 'rent', label: t('category.hotelTabRent'), icon: 'home', onPress: () => setTab('rent-hotel') },
      { key: 'sell', label: t('category.hotelTabSell'), icon: 'tag', onPress: () => setTab('sell-hotel') },
      { key: 'project', label: t('category.hotelGridProject'), icon: 'building', onPress: () => Taro.navigateTo({ url: '/pages/public/communities/index' }) },
      { key: 'subway', label: t('category.hotelGridSubway'), icon: 'train', onPress: () => notAvailable(t('category.hotelGridSubway')) },
      { key: 'vr', label: t('category.hotelGridVr'), icon: 'maximize', onPress: () => notAvailable(t('category.hotelGridVr')) },
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
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' },
      { key: 'vr', label: t('category.tagVr'), group: 'has_vr', value: '1' },
      { key: 'featured', label: t('category.tagFeatured'), group: 'is_featured', value: '1' }
    ],
    [t]
  )

  const buildQuery = useCallback((state: any) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      listing_type: (state.tab ?? 'rent-hotel') === 'rent-hotel' ? 'rent' : 'sell',
      property_type: ['hotel'],
      // 城市统一传定位 cityKey（后端做 slug 归一化）
      city: cityKey,
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
        title={t('category.hotelBannerTitle')}
        sub={t('category.hotelBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(t('category.hotelBannerTitle'))}
      />
    </View>
  )

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.hotelTitle')}
      city={city}
      onCityPress={() => Taro.navigateTo({ url: '/pages/location/index' })}
      searchPlaceholder={t('category.hotelSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'rent-hotel', label: t('category.hotelTabRent') },
        { key: 'sell-hotel', label: t('category.hotelTabSell') }
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <CommercialRow
          item={item}
          mode={tab.startsWith('rent') ? 'rent' : 'sell'}
          onPress={() => goDetail(item.id)}
        />
      )}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyHotel')}
      emptySub={t('category.emptySub')}
      emptyIcon='building'
    />
  )
}
