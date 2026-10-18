/**
 * 二手房分类页（贝壳式）· 小程序。
 *
 * 业务固定 `listing_type=sell` + `is_new_development=false`。
 * 行情对比卡取聚合摘要里真实的区域均价两两对比（不足两个区域则整块不渲染）。
 */
import { useCallback, useMemo, useState } from 'react'
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/i18n'
import { useLocationStore } from '@/stores/location'
import { publicApi, unwrapPage, type PublicListing } from '@/services/publicApi'
import {
  CategoryListScreen,
  EntryGrid,
  MarketCompareCard,
  type FilterGroup,
  type GridItem,
  type QuickTag
} from '@/components/CategoryKit'
import { ResidentialRow } from '@/components/CategoryKit/cards'
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
  useDistrictNodes
} from '@/lib/categoryShared'
import { fmtMoney } from '@/utils/format'
import './index.scss'

const PAGE_SIZE = 20

export default function CategoryResalePage() {
  const { t } = useI18n()
  const city = useLocationStore((s) => s.selection.cityLabel)
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const summary = useCategorySummary()
  const [tab, setTab] = useState<'recommend' | 'deal'>('recommend')
  const districtNodes = useDistrictNodes({ city: cityKey, listingType: 'sell' })

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })
  }

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'map', label: t('category.resaleGridMap'), icon: 'map', onPress: () => Taro.navigateTo({ url: '/pages/public/map/index?listing_type=sell' }) },
      { key: 'community', label: t('pub.tabCommunities'), icon: 'building', onPress: () => Taro.navigateTo({ url: '/pages/public/communities/index' }) },
      { key: 'deal', label: t('category.resaleGridDeal'), icon: 'chart', onPress: () => notAvailable(t('category.resaleGridDeal')) },
      { key: 'broker', label: t('category.findBroker'), icon: 'users', onPress: () => notAvailable(t('category.findBroker')) },
      { key: 'all', label: t('category.allListings'), icon: 'grid', onPress: () => Taro.navigateTo({ url: '/pages/public/listings/index' }) },
      { key: 'school', label: t('pub.tabSchools'), icon: 'school', onPress: () => Taro.navigateTo({ url: '/pages/public/schools/index' }) },
      { key: 'rank', label: t('category.resaleGridRank'), icon: 'award', onPress: () => notAvailable(t('category.resaleGridRank')) },
      { key: 'live', label: t('category.resaleGridLive'), icon: 'video', onPress: () => notAvailable(t('category.resaleGridLive')) },
      { key: 'subway', label: t('category.resaleGridSubway'), icon: 'train', onPress: () => notAvailable(t('category.resaleGridSubway')) },
      { key: 'owner', label: t('category.resaleGridOwner'), icon: 'home', onPress: () => notAvailable(t('category.resaleGridOwner')) }
    ],
    [t]
  )

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districtNodes), t),
      { key: 'price', label: t('category.filterTotalPrice'), options: rangeOptions(t, SELL_PRICE_RANGES) },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          bedroomGroup(t),
          decorationGroup(t),
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
      { key: 'b2', label: `2${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '2' },
      { key: 'b3', label: `3${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '3' },
      { key: 'b4', label: `4${t('category.bedroomUnit')}+`, group: 'bedrooms_min', value: '4' },
      { key: 'deco', label: t('pub.decoration.standard'), group: 'decoration', value: 'standard' }
    ],
    [t]
  )

  const buildQuery = useCallback((state: any) => {
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      listing_type: 'sell',
      is_new_development: false,
      // 城市统一传定位 cityKey（后端做 slug 归一化）
      city: cityKey,
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
      sort: state.tab === 'deal' ? 'price_asc' : state.sort
    }
  }, [cityKey])

  const fetchPage = useCallback(async (page: number, query: any) => {
    const res: any = await publicApi.listings({ page, page_size: PAGE_SIZE, ...query })
    return unwrapPage<PublicListing>((res as any)?.data ?? res)
  }, [])

  const pairs = summary?.district_price_pairs ?? []

  const top = (
    <View className='cat-top'>
      <EntryGrid items={grid} />
      {pairs.length >= 2 ? (
        <MarketCompareCard
          left={{ name: String(pairs[0].district), price: `${fmtMoney(pairs[0].avg_price, 'THB')}/${t('pub.sqm')}` }}
          right={{ name: String(pairs[1].district), price: `${fmtMoney(pairs[1].avg_price, 'THB')}/${t('pub.sqm')}` }}
          actionLabel={t('category.viewCompare')}
          onPress={() => notAvailable(t('category.viewCompare'))}
        />
      ) : null}
    </View>
  )

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.resaleTitle')}
      city={city}
      onCityPress={() => Taro.navigateTo({ url: '/pages/location/index' })}
      searchPlaceholder={t('category.resaleSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'recommend', label: t('category.resaleTabRecommend') },
        { key: 'deal', label: t('category.resaleTabDeal') }
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as 'recommend' | 'deal')}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <ResidentialRow item={item} mode='sell' onPress={() => goDetail(item.id)} />}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyResale')}
      emptySub={t('category.emptySub')}
      emptyIcon='tag'
    />
  )
}
