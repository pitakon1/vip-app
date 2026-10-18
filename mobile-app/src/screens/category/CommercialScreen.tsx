/**
 * 商铺办公分类页（贝壳式）。
 *
 * Tab = 租写字楼 / 买写字楼 / 租商铺 / 买商铺，正是
 * `listing_type(rent|sell) × property_type(office|shop)` 四组合。
 * 卡片为横向卡：面积 / 商圈·楼盘 / 标签 / 月租 + 元/㎡/天。
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
import { CommercialRow } from './categoryCards';
import {
  usePublicDistricts,
  districtOptions,
  fallbackDistrictLabels,
  districtGroup,
  decorationGroup,
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

type TabKey = 'rent-office' | 'sell-office' | 'rent-shop' | 'sell-shop';

const TAB_PARAMS: Record<TabKey, { listing_type: 'rent' | 'sell'; property_type: string[] }> = {
  'rent-office': { listing_type: 'rent', property_type: ['office'] },
  'sell-office': { listing_type: 'sell', property_type: ['office'] },
  'rent-shop': { listing_type: 'rent', property_type: ['shop'] },
  'sell-shop': { listing_type: 'sell', property_type: ['shop'] },
};

export default function CommercialScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const city = useLocationStore((s) => s.selection.cityLabel);
  const cityKey = useLocationStore((s) => s.selection.cityKey);
  const [tab, setTab] = useState<TabKey>('rent-office');
  // 区域下拉：随 Tab 的 listing_type × property_type 口径走后端真实区域
  const districts = usePublicDistricts(
    cityKey,
    TAB_PARAMS[tab].listing_type,
    TAB_PARAMS[tab].property_type,
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
      mk('select', t('category.commGridSelect'), 'star-outline', colors.primary, colors.primaryRgb, () => notAvailable(navigation, t('category.commGridSelect'))),
      mk('rent-office', t('category.commTabRentOffice'), 'business-outline', colors.info, colors.infoRgb, () => setTab('rent-office')),
      mk('sell-office', t('category.commTabSellOffice'), 'briefcase-outline', colors.warning, colors.warningRgb, () => setTab('sell-office')),
      mk('rent-shop', t('category.commTabRentShop'), 'storefront-outline', colors.success, colors.successRgb, () => setTab('rent-shop')),
      mk('sell-shop', t('category.commTabSellShop'), 'pricetags-outline', colors.error, colors.errorRgb, () => setTab('sell-shop')),
      mk('project', t('category.commGridProject'), 'business-outline', colors.primary, colors.primaryRgb, () => navigation.navigate('PublicCommunities')),
      mk('broker', t('category.findBroker'), 'people-outline', colors.info, colors.infoRgb, () => notAvailable(navigation, t('category.findBroker'))),
      mk('subway', t('category.commGridSubway'), 'subway-outline', colors.warning, colors.warningRgb, () => notAvailable(navigation, t('category.commGridSubway'))),
      mk('vr', t('category.commGridVr'), 'cube-outline', colors.success, colors.successRgb, () => notAvailable(navigation, t('category.commGridVr'))),
      mk('assist', t('category.helpFind'), 'hand-left-outline', colors.error, colors.errorRgb, () => notAvailable(navigation, t('category.helpFind'))),
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
          boolGroup('whole_floor_only', t('category.filterWholeFloor'), t),
          boolGroup('whole_building_only', t('category.filterWholeBuilding'), t),
          boolGroup('company_registrable', t('category.filterRegistrable'), t),
          decorationGroup(t),
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
      { key: 'floor', label: t('category.tagWholeFloor'), group: 'whole_floor_only', value: '1' },
      { key: 'building', label: t('category.tagWholeBuilding'), group: 'whole_building_only', value: '1' },
      { key: 'reg', label: t('category.tagRegistrable'), group: 'company_registrable', value: '1' },
      { key: 'deco', label: t('pub.decoration.standard'), group: 'decoration', value: 'standard' },
    ],
    [t],
  );

  const buildQuery = useCallback(
    (state: any) => {
      const tabKey = (state.tab ?? 'rent-office') as TabKey;
      const base = TAB_PARAMS[tabKey] ?? TAB_PARAMS['rent-office'];
      const price = parseRange(state.values.price);
      const area = parseRange(state.values.area);
      return {
        listing_type: base.listing_type,
        property_type: base.property_type,
        q: state.keyword || undefined,
        city: cityKey || undefined,
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
        title={t('category.commBannerTitle')}
        sub={t('category.commBannerSub')}
        actionLabel={t('category.helpFind')}
        onPress={() => notAvailable(navigation, t('category.commBannerTitle'))}
      />
    </View>
  );

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.commTitle')}
      city={city}
      onCityPress={() => navigation.navigate('LocationPicker')}
      searchPlaceholder={t('category.commSearchPlaceholder')}
      rightActions={<CategoryRightActions navigation={navigation} />}
      top={top}
      tabs={[
        { key: 'rent-office', label: t('category.commTabRentOffice') },
        { key: 'sell-office', label: t('category.commTabSellOffice') },
        { key: 'rent-shop', label: t('category.commTabRentShop') },
        { key: 'sell-shop', label: t('category.commTabSellShop') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as TabKey)}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <CommercialRow item={item} t={t} onPress={() => navigation.navigate('PublicListingDetail', { id: item.id })} />
      )}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyCommerce')}
      emptySub={t('category.emptySub')}
      emptyIcon="storefront-outline"
    />
  );
}
