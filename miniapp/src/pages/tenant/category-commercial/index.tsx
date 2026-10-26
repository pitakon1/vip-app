/**
 * 商铺办公分类页（贝壳式）· 小程序。
 *
 * Tab = 租写字楼 / 买写字楼 / 租商铺 / 买商铺，正是
 * `listing_type(rent|sell) × property_type(office|shop)` 四组合
 * （多值参数在 publicApi.listings 里拼成重复键，交服务端过滤）。
 * 卡片为横向卡：面积 / 商圈·楼盘 / 标签 / 月租 + 日租金/㎡。
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

type TabKey = 'rent-office' | 'sell-office' | 'rent-shop' | 'sell-shop'

const TAB_PARAMS: Record<TabKey, { listing_type: 'rent' | 'sell'; property_type: string[] }> = {
  'rent-office': { listing_type: 'rent', property_type: ['office'] },
  'sell-office': { listing_type: 'sell', property_type: ['office'] },
  'rent-shop': { listing_type: 'rent', property_type: ['shop'] },
  'sell-shop': { listing_type: 'sell', property_type: ['shop'] }
}

export default function CategoryCommercialPage() {
  const { t } = useI18n()
  const city = useLocationStore((s) => s.selection.cityLabel)
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const [tab, setTab] = useState<TabKey>('rent-office')
  const tabParams = TAB_PARAMS[tab]
  const districtNodes = useDistrictNodes({
    city: cityKey,
    listingType: tabParams.listing_type,
    propertyType: tabParams.property_type
  })

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })
  }

  const grid: GridItem[] = useMemo(
    () => [
      { key: 'select', label: t('category.commGridSelect'), icon: 'star', onPress: () => notAvailable(t('category.commGridSelect')) },
      { key: 'rent-office', label: t('category.commTabRentOffice'), icon: 'briefcase', onPress: () => setTab('rent-office') },
      { key: 'sell-office', label: t('category.commTabSellOffice'), icon: 'award', onPress: () => setTab('sell-office') },
      { key: 'rent-shop', label: t('category.commTabRentShop'), icon: 'storefront', onPress: () => setTab('rent-shop') },
      { key: 'sell-shop', label: t('category.commTabSellShop'), icon: 'tag', onPress: () => setTab('sell-shop') },
      { key: 'project', label: t('category.commGridProject'), icon: 'building', onPress: () => Taro.navigateTo({ url: '/pages/public/communities/index' }) },
      { key: 'broker', label: t('category.findBroker'), icon: 'users', onPress: () => notAvailable(t('category.findBroker')) },
      { key: 'subway', label: t('category.commGridSubway'), icon: 'train', onPress: () => notAvailable(t('category.commGridSubway')) },
      { key: 'vr', label: t('category.commGridVr'), icon: 'cube', onPress: () => notAvailable(t('category.commGridVr')) },
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
          boolGroup('whole_floor_only', t('category.filterWholeFloor'), t),
          boolGroup('whole_building_only', t('category.filterWholeBuilding'), t),
          boolGroup('company_registrable', t('category.filterRegistrable'), t),
          decorationGroup(t),
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
      { key: 'floor', label: t('category.tagWholeFloor'), group: 'whole_floor_only', value: '1' },
      { key: 'building', label: t('category.tagWholeBuilding'), group: 'whole_building_only', value: '1' },
      { key: 'reg', label: t('category.tagRegistrable'), group: 'company_registrable', value: '1' },
      { key: 'deco', label: t('pub.decoration.standard'), group: 'decoration', value: 'standard' }
    ],
    [t]
  )

  const buildQuery = useCallback((state: any) => {
    const tabKey = (state.tab ?? 'rent-office') as TabKey
    const base = TAB_PARAMS[tabKey] ?? TAB_PARAMS['rent-office']
    const price = parseRange(state.values.price)
    const area = parseRange(state.values.area)
    return {
      listing_type: base.listing_type,
      property_type: base.property_type,
      // 城市统一传定位 cityKey（后端做 slug 归一化）
      city: cityKey,
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
        title={t('category.commBannerTitle')}
        sub={t('category.commBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(t('category.commBannerTitle'))}
      />
    </View>
  )

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.commTitle')}
      city={city}
      onCityPress={() => Taro.navigateTo({ url: '/pages/location/index' })}
      searchPlaceholder={t('category.commSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'rent-office', label: t('category.commTabRentOffice') },
        { key: 'sell-office', label: t('category.commTabSellOffice') },
        { key: 'rent-shop', label: t('category.commTabRentShop') },
        { key: 'sell-shop', label: t('category.commTabSellShop') }
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
      emptyTitle={t('category.emptyCommerce')}
      emptySub={t('category.emptySub')}
      emptyIcon='storefront'
    />
  )
}
