/**
 * 二手房分类页（贝壳式）。
 *
 * 业务固定 `listing_type=sell` + `is_new_development=false`。
 * 行情对比卡取聚合摘要里真实的区域均价两两对比（不足两个区域则整块不渲染）。
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { useLocationStore } from '@/stores/location';
import { publicApi, unwrapPage, type PublicListing } from '@/services/publicApi';
import {
  CategoryListScreen,
  CategoryRightActions,
  EntryGrid,
  MarketCompareCard,
  type FilterGroup,
  type GridItem,
  type QuickTag,
} from './CategoryShell';
import { ResidentialRow } from './categoryCards';
import {
  useCategorySummary,
  usePublicDistricts,
  districtOptions,
  fallbackDistrictLabels,
  districtGroup,
  bedroomGroup,
  decorationGroup,
  listingSortGroup,
  boolGroup,
  rangeOptions,
  parseRange,
  SELL_PRICE_RANGES,
  AREA_RANGES,
  notAvailable,
} from './categoryShared';
import { fmtMoney } from '@/utils/format';

const PAGE_SIZE = 20;

export default function ResaleScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const city = useLocationStore((s) => s.selection.cityLabel);
  const cityKey = useLocationStore((s) => s.selection.cityKey);
  const summary = useCategorySummary();
  const [tab, setTab] = useState<'recommend' | 'deal'>('recommend');
  // 区域下拉：走后端真实区域（当前城市 + 售口径）
  const districts = usePublicDistricts(cityKey, 'sell');

  const grid: GridItem[] = useMemo(() => {
    const mk = (
      key: string,
      label: string,
      icon: GridItem['icon'],
      color: string,
      rgb: string,
      onPress: () => void,
    ): GridItem => ({ key, label, icon, color, tint: colors.alpha(rgb, 0.1), onPress });
    return [
      mk('map', t('category.resaleGridMap'), 'map-outline', colors.primary, colors.primaryRgb, () => notAvailable(navigation, t('category.resaleGridMap'))),
      mk('community', t('pub.tabCommunities'), 'business-outline', colors.info, colors.infoRgb, () => navigation.navigate('PublicCommunities')),
      mk('deal', t('category.resaleGridDeal'), 'stats-chart-outline', colors.warning, colors.warningRgb, () => notAvailable(navigation, t('category.resaleGridDeal'))),
      mk('broker', t('category.findBroker'), 'people-outline', colors.success, colors.successRgb, () => notAvailable(navigation, t('category.findBroker'))),
      mk('all', t('category.allListings'), 'grid-outline', colors.error, colors.errorRgb, () => navigation.navigate('PublicListings')),
      mk('school', t('pub.tabSchools'), 'school-outline', colors.primary, colors.primaryRgb, () => navigation.navigate('PublicSchools')),
      mk('rank', t('category.resaleGridRank'), 'podium-outline', colors.info, colors.infoRgb, () => notAvailable(navigation, t('category.resaleGridRank'))),
      mk('live', t('category.resaleGridLive'), 'videocam-outline', colors.warning, colors.warningRgb, () => notAvailable(navigation, t('category.resaleGridLive'))),
      mk('subway', t('category.resaleGridSubway'), 'subway-outline', colors.success, colors.successRgb, () => notAvailable(navigation, t('category.resaleGridSubway'))),
      mk('owner', t('category.resaleGridOwner'), 'home-outline', colors.error, colors.errorRgb, () => notAvailable(navigation, t('category.resaleGridOwner'))),
    ];
  }, [t, navigation]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districts, fallbackDistrictLabels(cityKey)), t),
      { key: 'price', label: t('category.filterTotalPrice'), options: rangeOptions(t, SELL_PRICE_RANGES) },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          bedroomGroup(t),
          decorationGroup(t),
          boolGroup('has_vr', t('category.filterHasVr'), t),
          boolGroup('is_featured', t('category.filterFeatured'), t),
          boolGroup('owner_direct', t('category.filterOwnerDirect'), t),
        ],
      },
      listingSortGroup(t),
    ],
    [districts, cityKey, t],
  );

  const quickTags: QuickTag[] = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'b2', label: `2${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '2' },
      { key: 'b3', label: `3${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '3' },
      { key: 'b4', label: `4${t('category.bedroomUnit')}+`, group: 'bedrooms_min', value: '4' },
      { key: 'deco', label: t('pub.decoration.standard'), group: 'decoration', value: 'standard' },
    ],
    [t],
  );

  const buildQuery = useCallback(
    (state: any) => {
      const price = parseRange(state.values.price);
      const area = parseRange(state.values.area);
      return {
        listing_type: 'sell',
        is_new_development: false,
        q: state.keyword || undefined,
        city: cityKey || undefined,
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
        sort: state.tab === 'deal' ? 'price_asc' : state.sort,
      };
    },
    [cityKey],
  );

  const fetchPage = useCallback(async (page: number, query: any) => {
    const res: any = await publicApi.listings({ page, page_size: PAGE_SIZE, ...query });
    return unwrapPage<PublicListing>(res?.data);
  }, []);

  const pairs = summary?.district_price_pairs ?? [];

  const top = (
    <View>
      <EntryGrid items={grid} />
      {pairs.length >= 2 ? (
        <MarketCompareCard
          left={{ name: pairs[0].district, price: `${fmtMoney(pairs[0].avg_price, 'THB')}/${t('pub.sqm')}` }}
          right={{ name: pairs[1].district, price: `${fmtMoney(pairs[1].avg_price, 'THB')}/${t('pub.sqm')}` }}
          actionLabel={t('category.viewCompare')}
          onPress={() => notAvailable(navigation, t('category.viewCompare'))}
        />
      ) : null}
    </View>
  );

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.resaleTitle')}
      city={city}
      onCityPress={() => navigation.navigate('LocationPicker')}
      searchPlaceholder={t('category.resaleSearchPlaceholder')}
      rightActions={<CategoryRightActions navigation={navigation} />}
      top={top}
      tabs={[
        { key: 'recommend', label: t('category.resaleTabRecommend') },
        { key: 'deal', label: t('category.resaleTabDeal') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as 'recommend' | 'deal')}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <ResidentialRow item={item} t={t} mode="sell" onPress={() => navigation.navigate('PublicListingDetail', { id: item.id })} />
      )}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyResale')}
      emptySub={t('category.emptySub')}
      emptyIcon="pricetag-outline"
    />
  );
}
