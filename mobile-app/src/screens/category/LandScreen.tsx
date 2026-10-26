/**
 * 土地分类页（贝壳式）。
 *
 * 沿用厂房/商办骨架，业务固定 `property_type=['land']`，Tab = 租土地 / 买土地。
 * 卡片只渲染公开接口真实返回的字段（土地面积 / 位置 / 标签 / 租金或售价）。
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
  BannerCard,
  EntryGrid,
  type FilterGroup,
  type GridItem,
  type QuickTag,
} from './CategoryShell';
import { LandRow } from './categoryCards';
import {
  usePublicDistricts,
  districtOptions,
  fallbackDistrictLabels,
  districtGroup,
  listingSortGroup,
  boolGroup,
  rangeOptions,
  parseRange,
  RENT_PRICE_RANGES,
  SELL_PRICE_RANGES,
  AREA_RANGES,
  notAvailable,
} from './categoryShared';

const PAGE_SIZE = 20;

type TabKey = 'rent-land' | 'sell-land';

export default function LandScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const city = useLocationStore((s) => s.selection.cityLabel);
  const cityKey = useLocationStore((s) => s.selection.cityKey);
  const [tab, setTab] = useState<TabKey>('rent-land');
  const isRent = tab === 'rent-land';
  // 区域下拉：随 Tab 的租/售口径 + 土地类型走后端真实区域
  const districts = usePublicDistricts(cityKey, isRent ? 'rent' : 'sell', ['land']);

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
      mk('select', t('category.landGridSelect'), 'star-outline', colors.primary, colors.primaryRgb, () => notAvailable(navigation, t('category.landGridSelect'))),
      mk('rent', t('category.landTabRent'), 'map-outline', colors.info, colors.infoRgb, () => setTab('rent-land')),
      mk('sell', t('category.landTabSell'), 'pricetags-outline', colors.warning, colors.warningRgb, () => setTab('sell-land')),
      mk('all', t('category.allListings'), 'grid-outline', colors.success, colors.successRgb, () => navigation.navigate('PublicListings')),
      mk('broker', t('category.findBroker'), 'people-outline', colors.info, colors.infoRgb, () => notAvailable(navigation, t('category.findBroker'))),
      mk('assist', t('category.helpFind'), 'hand-left-outline', colors.error, colors.errorRgb, () => notAvailable(navigation, t('category.helpFind'))),
    ];
  }, [t, navigation]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districts, fallbackDistrictLabels(cityKey)), t),
      {
        key: 'price',
        label: t('category.filterPrice'),
        options: rangeOptions(t, isRent ? RENT_PRICE_RANGES : SELL_PRICE_RANGES),
      },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          boolGroup('has_video', t('category.filterHasVideo'), t),
          boolGroup('has_vr', t('category.filterHasVr'), t),
          boolGroup('is_featured', t('category.filterFeatured'), t),
          boolGroup('owner_direct', t('category.filterOwnerDirect'), t),
        ],
      },
      listingSortGroup(t),
    ],
    [districts, cityKey, t, isRent],
  );

  const quickTags: QuickTag[] = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'featured', label: t('category.filterFeatured'), group: 'is_featured', value: '1' },
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' },
      { key: 'owner', label: t('category.filterOwnerDirect'), group: 'owner_direct', value: '1' },
    ],
    [t],
  );

  const buildQuery = useCallback(
    (state: any) => {
      const price = parseRange(state.values.price);
      const area = parseRange(state.values.area);
      return {
        listing_type: (state.tab ?? 'rent-land') === 'rent-land' ? 'rent' : 'sell',
        property_type: ['land'],
        q: state.keyword || undefined,
        city: cityKey || undefined,
        district: state.values.district || undefined,
        price_min: price.min,
        price_max: price.max,
        area_min: area.min,
        area_max: area.max,
        has_video: state.values.has_video === '1' ? true : undefined,
        has_vr: state.values.has_vr === '1' ? true : undefined,
        is_featured: state.values.is_featured === '1' ? true : undefined,
        owner_direct: state.values.owner_direct === '1' ? true : undefined,
        sort: state.sort,
      };
    },
    [cityKey],
  );

  const fetchPage = useCallback(async (page: number, query: any) => {
    const res: any = await publicApi.listings({ page, page_size: PAGE_SIZE, ...query });
    return unwrapPage<PublicListing>(res?.data);
  }, []);

  const top = (
    <View>
      <EntryGrid items={grid} />
      <BannerCard
        title={t('category.landBannerTitle')}
        sub={t('category.landBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(navigation, t('category.landBannerTitle'))}
      />
    </View>
  );

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.landTitle')}
      city={city}
      onCityPress={() => navigation.navigate('LocationPicker')}
      searchPlaceholder={t('category.landSearchPlaceholder')}
      rightActions={<CategoryRightActions navigation={navigation} />}
      top={top}
      tabs={[
        { key: 'rent-land', label: t('category.landTabRent') },
        { key: 'sell-land', label: t('category.landTabSell') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <LandRow
          item={item}
          t={t}
          mode={isRent ? 'rent' : 'sell'}
          onPress={() => navigation.navigate('PublicListingDetail', { id: item.id })}
        />
      )}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyLand')}
      emptySub={t('category.emptySub')}
      emptyIcon="map-outline"
    />
  );
}
