/**
 * 新房分类页（贝壳式）· 小程序 = 楼盘（项目）视角，数据面 `/public/projects`。
 *
 * 数据胶囊 5 格、榜单行（= 排序）、楼盘卡（在售徽标 / 建面区间 / 户型 / 成交动态）
 * 全部来自后端实时聚合；dev 库楼盘极少时相应模块留空，不注入占位数据。
 * 注意：`/projects` 的 sort 只接受 hot / price_asc / price_desc / open_date_desc，
 * 故 `defaultFilterValues` 把默认排序设为 hot（CategoryShell 的默认值 latest 会 422）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, ScrollView, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/i18n'
import { useLocationStore } from '@/stores/location'
import { publicApi, unwrapPage, type PublicProject } from '@/services/publicApi'
import {
  CapsuleRow,
  CategoryListScreen,
  EntryGrid,
  type CapsuleItem,
  type FilterGroup,
  type GridItem,
  type QuickTag
} from '@/components/CategoryKit'
import { ProjectRailCard, ProjectRow } from '@/components/CategoryKit/cards'
import {
  AVG_PRICE_RANGES,
  districtGroup,
  districtOptions,
  notAvailable,
  parseRange,
  projectSortGroup,
  rangeOptions,
  useCategorySummary,
  useDistrictNodes
} from '@/lib/categoryShared'
import './index.scss'

const PAGE_SIZE = 20

export default function CategoryNewPage() {
  const { t } = useI18n()
  const city = useLocationStore((s) => s.selection.cityLabel)
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const summary = useCategorySummary()
  const [rail, setRail] = useState<PublicProject[]>([])
  // 楼盘视角按「售」口径取区域（新房业务）
  const districtNodes = useDistrictNodes({ city: cityKey, listingType: 'sell' })

  useEffect(() => {
    publicApi
      .projects({ sort: 'hot', page_size: 6 })
      .then((res: any) => setRail(unwrapPage<PublicProject>((res as any)?.data ?? res).items))
      .catch(() => setRail([]))
  }, [])

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/public/community-detail/index?id=${id}` })
  }

  const capsules: CapsuleItem[] = useMemo(
    () => [
      { key: 'on_sale', value: summary?.on_sale_projects ?? 0, label: t('category.capOnSaleProjects') },
      { key: 'units', value: summary?.sell_count ?? 0, label: t('category.capOnSaleUnits') },
      { key: 'opened', value: summary?.opened_this_month ?? 0, label: t('category.capOpenedThisMonth') },
      { key: 'new7d', value: summary?.new_projects_7d ?? 0, label: t('category.capNewProjects') },
      { key: 'unsold', value: summary?.unsold_projects ?? 0, label: t('category.capUnsoldProjects') }
    ],
    [summary, t]
  )

  const grid: GridItem[] = useMemo(() => {
    const mk = (key: string, label: string, icon: GridItem['icon']): GridItem => ({
      key,
      label,
      icon,
      onPress: () => notAvailable(label)
    })
    return [
      mk('brand', t('category.newGridBrand'), 'award'),
      mk('land', t('category.newGridLand'), 'map'),
      mk('broker', t('category.findBroker'), 'users'),
      mk('ready', t('category.newGridReady'), 'home'),
      mk('small', t('category.newGridSmall'), 'maximize'),
      mk('rank', t('category.newGridRank'), 'chart'),
      mk('vr', t('category.newGridVr'), 'cube'),
      mk('live', t('category.newGridLive'), 'video'),
      mk('three', t('category.newGridThree'), 'users'),
      mk('subway', t('category.newGridSubway'), 'train')
    ]
  }, [t])

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districtNodes), t),
      { key: 'price', label: t('category.filterAvgPrice'), options: rangeOptions(t, AVG_PRICE_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          {
            key: 'sale_status',
            label: t('category.filterSaleStatus'),
            options: [
              { value: 'on_sale', label: t('category.saleOnSale') },
              { value: 'pre_sale', label: t('category.salePreSale') },
              { value: 'sold_out', label: t('category.saleSoldOut') }
            ]
          },
          {
            key: 'has_listings',
            label: t('category.filterHasListings'),
            options: [
              { value: '1', label: t('category.onlyOnSale') },
              { value: '0', label: t('category.onlyUnsold') }
            ]
          },
          {
            key: 'tenure',
            label: t('category.filterTenure'),
            options: [
              { value: 'freehold', label: t('pub.tenure.freehold') },
              { value: 'leasehold', label: t('pub.tenure.leasehold') },
              { value: 'mixed', label: t('pub.tenure.mixed') }
            ]
          }
        ]
      },
      projectSortGroup(t)
    ],
    [districtNodes, t]
  )

  const quickTags: QuickTag[] = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'onsale', label: t('category.onlyOnSale'), group: 'has_listings', value: '1' },
      { key: 'unsold', label: t('category.onlyUnsold'), group: 'has_listings', value: '0' }
    ],
    [t]
  )

  const buildQuery = useCallback((state: any) => {
    const price = parseRange(state.values.price)
    return {
      q: state.keyword || undefined,
      district: state.values.district || undefined,
      // 城市统一传定位 cityKey（后端做 slug 归一化）
      city: cityKey,
      price_min: price.min,
      price_max: price.max,
      sale_status: state.values.sale_status || undefined,
      has_listings:
        state.values.has_listings === '1' ? true : state.values.has_listings === '0' ? false : undefined,
      tenure: state.values.tenure || undefined,
      sort: state.sort
    }
  }, [cityKey])

  const fetchPage = useCallback(async (page: number, query: any) => {
    const res: any = await publicApi.projects({ page, page_size: PAGE_SIZE, ...query })
    return unwrapPage<PublicProject>((res as any)?.data ?? res)
  }, [])

  const top = (
    <View className='cat-top'>
      {summary ? <CapsuleRow items={capsules} /> : null}
      <EntryGrid items={grid} />
      {rail.length > 0 ? (
        <View>
          <Text className='ck-section-title'>{t('category.hotProjects')}</Text>
          <ScrollView scrollX className='ck-rail' showScrollbar={false}>
            {rail.map((it) => (
              <ProjectRailCard key={it.id} item={it} onPress={() => goDetail(it.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  )

  return (
    <CategoryListScreen<PublicProject>
      title={t('category.newTitle')}
      city={city}
      onCityPress={() => Taro.navigateTo({ url: '/pages/location/index' })}
      searchPlaceholder={t('category.newSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'hot', label: t('category.newRankDeal') },
        { key: 'price_asc', label: t('category.newRankPriceLow') },
        { key: 'price_desc', label: t('category.newRankPriceHigh') },
        { key: 'open_date_desc', label: t('category.newRankOpen') }
      ]}
      tabGroup='sort'
      defaultFilterValues={{ sort: 'hot' }}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <ProjectRow item={item} onPress={() => goDetail(item.id)} />}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyNew')}
      emptySub={t('category.emptySub')}
      emptyIcon='building'
    />
  )
}
