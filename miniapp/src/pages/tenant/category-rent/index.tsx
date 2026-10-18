/**
 * 租房分类页（贝壳式）· 小程序。
 *
 * 与 App 端 `mobile-app/src/screens/category/RentCategoryScreen.tsx` 同一信息结构：
 * 业务固定 `listing_type=rent`；Tab = 整租 / 公寓；卡片以「月租」为主口径，
 * 附户型 / 面积 / 家具 / 装修 / 已核验等真实字段派生的标签。
 * 「新上房源」rail 走真实最新在租单，无数据时整块不渲染（绝不注入占位数据）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, ScrollView, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/i18n'
import { useLocationStore } from '@/stores/location'
import { publicApi, unwrapPage, type PublicListing } from '@/services/publicApi'
import {
  CategoryListScreen,
  EntryGrid,
  ServiceBar,
  type FilterGroup,
  type GridItem,
  type QuickTag
} from '@/components/CategoryKit'
import { ListingRailCard, ResidentialRow } from '@/components/CategoryKit/cards'
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
  useDistrictNodes
} from '@/lib/categoryShared'
import './index.scss'

const PAGE_SIZE = 20

export default function CategoryRentPage() {
  const { t } = useI18n()
  const city = useLocationStore((s) => s.selection.cityLabel)
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const [tab, setTab] = useState<'whole' | 'apartment'>('whole')
  const [rail, setRail] = useState<PublicListing[]>([])
  // 区域筛选走真实数据（后端 /public/districts，空则回退静态区域）
  const districtNodes = useDistrictNodes({
    city: cityKey,
    listingType: 'rent',
    propertyType: tab === 'apartment' ? ['apartment', 'condo'] : undefined
  })

  useEffect(() => {
    publicApi
      .listings({ listing_type: 'rent', sort: 'latest', page_size: 6 })
      .then((res: any) => setRail(unwrapPage<PublicListing>((res as any)?.data ?? res).items))
      .catch(() => setRail([]))
  }, [])

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })
  }

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'map', label: t('category.rentGridMap'), icon: 'map', onPress: () => Taro.navigateTo({ url: '/pages/public/map/index?listing_type=rent' }) },
      { key: 'commute', label: t('category.rentGridCommute'), icon: 'train', onPress: () => notAvailable(t('category.rentGridCommute')) },
      { key: 'selfrun', label: t('category.rentGridSelf'), icon: 'award', onPress: () => notAvailable(t('category.rentGridSelf')) },
      { key: 'newest', label: t('category.newListings'), icon: 'clock', onPress: () => notAvailable(t('category.newListings')) },
      { key: 'assist', label: t('category.helpFind'), icon: 'help', onPress: () => notAvailable(t('category.helpFind')) },
      { key: 'broker', label: t('category.findBroker'), icon: 'users', onPress: () => notAvailable(t('category.findBroker')) },
      { key: 'all', label: t('category.allListings'), icon: 'grid', onPress: () => Taro.navigateTo({ url: '/pages/public/listings/index' }) },
      { key: 'school', label: t('pub.tabSchools'), icon: 'school', onPress: () => Taro.navigateTo({ url: '/pages/public/schools/index' }) },
      { key: 'community', label: t('pub.tabCommunities'), icon: 'building', onPress: () => Taro.navigateTo({ url: '/pages/public/communities/index' }) },
      { key: 'furnished', label: t('category.furnishedListings'), icon: 'sparkles', onPress: () => notAvailable(t('category.furnishedListings')) }
    ],
    [t]
  )

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districtNodes), t),
      { key: 'price', label: t('category.filterPrice'), options: rangeOptions(t, RENT_PRICE_RANGES) },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          bedroomGroup(t),
          decorationGroup(t),
          boolGroup('has_video', t('category.filterHasVideo'), t),
          boolGroup('has_vr', t('category.tagVr'), t),
          boolGroup('is_featured', t('category.tagFeatured'), t),
          boolGroup('owner_direct', t('category.tagOwnerDirect'), t)
        ]
      },
      listingSortGroup(t)
    ],
    [districtNodes, t]
  )

  const quickTags: QuickTag[] = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'b1', label: `1${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '1' },
      { key: 'b2', label: `2${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '2' },
      { key: 'b3', label: `3${t('category.bedroomUnit')}+`, group: 'bedrooms_min', value: '3' },
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' }
    ],
    [t]
  )

  const buildQuery = useCallback((state: any) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      listing_type: 'rent',
      // 城市统一传定位 cityKey（后端做 slug 归一化），不再传中文 cityLabel
      city: cityKey,
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
      <ServiceBar
        text={t('category.rentServiceText')}
        actionLabel={t('category.helpFind')}
        onAction={() => notAvailable(t('category.helpFind'))}
      />
      {rail.length > 0 ? (
        <View>
          <Text className='ck-section-title'>{t('category.newListings')}</Text>
          <ScrollView scrollX className='ck-rail' showScrollbar={false}>
            {rail.map((it) => (
              <ListingRailCard key={it.id} item={it} onPress={() => goDetail(it.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  )

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.rentTitle')}
      city={city}
      onCityPress={() => Taro.navigateTo({ url: '/pages/location/index' })}
      searchPlaceholder={t('category.rentSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'whole', label: t('category.rentTabWhole') },
        { key: 'apartment', label: t('category.rentTabApartment') }
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as 'whole' | 'apartment')}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <ResidentialRow item={item} mode='rent' onPress={() => goDetail(item.id)} />}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyRent')}
      emptySub={t('category.emptySub')}
      emptyIcon='home'
    />
  )
}
