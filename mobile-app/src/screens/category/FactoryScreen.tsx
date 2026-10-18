/**
 * 厂房分类页（贝壳式）。
 *
 * 沿用商铺办公骨架，业务固定 `property_type=['factory']`，Tab = 租厂房 / 买厂房。
 * 卡片为横向卡：土地面积 / 层高 / 荷载 / 柱距 / 电力 / 可环评 / 整栋等真实字段，
 * 无该字段的一律不渲染，绝不用占位数据补齐版面。
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
import { FactoryRow } from './categoryCards';
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

type TabKey = 'rent-factory' | 'sell-factory';

export default function FactoryScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const city = useLocationStore((s) => s.selection.cityLabel);
  const cityKey = useLocationStore((s) => s.selection.cityKey);
  const [tab, setTab] = useState<TabKey>('rent-factory');
  // 区域下拉：随 Tab 的租/售口径 + 厂房类型走后端真实区域
  const districts = usePublicDistricts(
    cityKey,
    tab === 'rent-factory' ? 'rent' : 'sell',
    ['factory'],
  );

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
      mk('select', t('category.factGridSelect'), 'star-outline', colors.primary, colors.primaryRgb, () => notAvailable(navigation, t('category.factGridSelect'))),
      mk('rent', t('category.factTabRent'), 'cube-outline', colors.info, colors.infoRgb, () => setTab('rent-factory')),
      mk('sell', t('category.factTabSell'), 'pricetags-outline', colors.warning, colors.warningRgb, () => setTab('sell-factory')),
      mk('project', t('category.factGridProject'), 'business-outline', colors.success, colors.successRgb, () => navigation.navigate('PublicCommunities')),
      mk('land', t('category.factGridLand'), 'map-outline', colors.error, colors.errorRgb, () => notAvailable(navigation, t('category.factGridLand'))),
      mk('broker', t('category.findBroker'), 'people-outline', colors.info, colors.infoRgb, () => notAvailable(navigation, t('category.findBroker'))),
      mk('subway', t('category.factGridSubway'), 'subway-outline', colors.warning, colors.warningRgb, () => notAvailable(navigation, t('category.factGridSubway'))),
      mk('env', t('category.factGridEnv'), 'leaf-outline', colors.success, colors.successRgb, () => notAvailable(navigation, t('category.factGridEnv'))),
      mk('vr', t('category.factGridVr'), 'cube-outline', colors.error, colors.errorRgb, () => notAvailable(navigation, t('category.factGridVr'))),
      mk('assist', t('category.helpFind'), 'hand-left-outline', colors.primary, colors.primaryRgb, () => notAvailable(navigation, t('category.helpFind'))),
    ];
  }, [t, navigation]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districts, fallbackDistrictLabels(cityKey)), t),
      {
        key: 'price',
        label: t('category.filterPrice'),
        options: rangeOptions(t, tab.startsWith('rent') ? RENT_PRICE_RANGES : SELL_PRICE_RANGES),
      },
      { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          boolGroup('environmental_permit', t('category.filterEnvPermit'), t),
          boolGroup('whole_building_only', t('category.filterWholeBuilding'), t),
          boolGroup('has_video', t('category.filterHasVideo'), t),
          boolGroup('has_vr', t('category.filterHasVr'), t),
          boolGroup('is_featured', t('category.filterFeatured'), t),
          boolGroup('owner_direct', t('category.filterOwnerDirect'), t),
        ],
      },
      listingSortGroup(t),
    ],
    [districts, cityKey, t, tab],
  );

  const quickTags: QuickTag[] = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'env', label: t('category.tagEnvPermit'), group: 'environmental_permit', value: '1' },
      { key: 'building', label: t('category.tagWholeBuilding'), group: 'whole_building_only', value: '1' },
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' },
    ],
    [t],
  );

  const buildQuery = useCallback(
    (state: any) => {
      const price = parseRange(state.values.price);
      const area = parseRange(state.values.area);
      return {
        listing_type: (state.tab ?? 'rent-factory') === 'rent-factory' ? 'rent' : 'sell',
        property_type: ['factory'],
        q: state.keyword || undefined,
        city: cityKey || undefined,
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
        title={t('category.factBannerTitle')}
        sub={t('category.factBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(navigation, t('category.factBannerTitle'))}
      />
    </View>
  );

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.factTitle')}
      city={city}
      onCityPress={() => navigation.navigate('LocationPicker')}
      searchPlaceholder={t('category.factSearchPlaceholder')}
      rightActions={<CategoryRightActions navigation={navigation} />}
      top={top}
      tabs={[
        { key: 'rent-factory', label: t('category.factTabRent') },
        { key: 'sell-factory', label: t('category.factTabSell') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <FactoryRow item={item} t={t} onPress={() => navigation.navigate('PublicListingDetail', { id: item.id })} />
      )}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyFactory')}
      emptySub={t('category.emptySub')}
      emptyIcon="cube-outline"
    />
  );
}
