/**
 * 租房分类页（贝壳式）。
 *
 * 业务固定 `listing_type=rent`；Tab = 整租 / 公寓（仅保留这两类业务口径）。
 * 卡片以「月租」为主口径，附户型/面积/家具/装修/已核验等真实字段。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { useLocationStore } from '@/stores/location';
import { publicApi, unwrapPage, type PublicListing } from '@/services/publicApi';
import {
  CategoryListScreen,
  CategoryRightActions,
  EntryGrid,
  ServiceBar,
  type FilterGroup,
  type GridItem,
  type QuickTag,
} from './CategoryShell';
import { ResidentialRow } from './categoryCards';
import {
  usePublicDistricts,
  districtOptions,
  fallbackDistrictLabels,
  districtGroup,
  bedroomGroup,
  leaseTermGroup,
  floorLevelGroup,
  orientationGroup,
  decorationGroup,
  listingSortGroup,
  boolGroup,
  rangeOptions,
  parseRange,
  RENT_PRICE_RANGES,
  AREA_RANGES,
  notAvailable,
} from './categoryShared';

const PAGE_SIZE = 20;

export default function RentCategoryScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const city = useLocationStore((s) => s.selection.cityLabel);
  const cityKey = useLocationStore((s) => s.selection.cityKey);
  const [tab, setTab] = useState<'whole' | 'apartment'>('whole');
  const [rail, setRail] = useState<PublicListing[]>([]);
  // 区域下拉：走后端真实区域（带当前城市 + 租/公寓口径），无数据回退静态区域
  const districts = usePublicDistricts(cityKey, 'rent', tab === 'apartment' ? ['apartment', 'condo'] : undefined);

  // 「新上房源」rail：真实最新在租单，空则整块不渲染
  useEffect(() => {
    publicApi
      .listings({ listing_type: 'rent', city: cityKey || undefined, sort: 'latest', page_size: 6 })
      .then((res: any) => setRail(unwrapPage<PublicListing>(res?.data).items))
      .catch(() => setRail([]));
  }, [cityKey]);

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
      mk('map', t('category.rentGridMap'), 'map-outline', colors.primary, colors.primaryRgb, () => notAvailable(navigation, t('category.rentGridMap'))),
      mk('commute', t('category.rentGridCommute'), 'train-outline', colors.info, colors.infoRgb, () => notAvailable(navigation, t('category.rentGridCommute'))),
      mk('selfrun', t('category.rentGridSelf'), 'ribbon-outline', colors.warning, colors.warningRgb, () => notAvailable(navigation, t('category.rentGridSelf'))),
      mk('newest', t('category.newListings'), 'time-outline', colors.success, colors.successRgb, () => notAvailable(navigation, t('category.newListings'))),
      mk('assist', t('category.helpFind'), 'hand-left-outline', colors.error, colors.errorRgb, () => notAvailable(navigation, t('category.helpFind'))),
      mk('broker', t('category.findBroker'), 'people-outline', colors.info, colors.infoRgb, () => notAvailable(navigation, t('category.findBroker'))),
      mk('all', t('category.allListings'), 'grid-outline', colors.primary, colors.primaryRgb, () => navigation.navigate('PublicListings')),
      mk('school', t('pub.tabSchools'), 'school-outline', colors.warning, colors.warningRgb, () => navigation.navigate('PublicSchools')),
      mk('community', t('pub.tabCommunities'), 'business-outline', colors.success, colors.successRgb, () => navigation.navigate('PublicCommunities')),
      mk('furnished', t('category.furnishedListings'), 'sparkles-outline', colors.error, colors.errorRgb, () => notAvailable(navigation, t('category.furnishedListings'))),
    ];
  }, [t, navigation]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districts, fallbackDistrictLabels(cityKey)), t),
      { key: 'price', label: t('category.filterPrice'), options: rangeOptions(t, RENT_PRICE_RANGES) },
      bedroomGroup(t),
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          leaseTermGroup(t),
          { key: 'area', label: t('category.filterArea'), options: rangeOptions(t, AREA_RANGES) },
          floorLevelGroup(t),
          orientationGroup(t),
          decorationGroup(t),
          boolGroup('has_video', t('category.filterHasVideo'), t),
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
      { key: 'b1', label: `1${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '1' },
      { key: 'b2', label: `2${t('category.bedroomUnit')}`, group: 'bedrooms_min', value: '2' },
      { key: 'b3', label: `3${t('category.bedroomUnit')}+`, group: 'bedrooms_min', value: '3' },
      { key: 'video', label: t('category.filterHasVideo'), group: 'has_video', value: '1' },
    ],
    [t],
  );

  const buildQuery = useCallback((state: any) => {
    const price = parseRange(state.values.price);
    const area = parseRange(state.values.area);
    return {
      listing_type: 'rent',
      property_type: state.tab === 'apartment' ? ['apartment', 'condo'] : undefined,
      q: state.keyword || undefined,
      city: cityKey || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      area_min: area.min,
      area_max: area.max,
      bedrooms_min: state.values.bedrooms_min ? Number(state.values.bedrooms_min) : undefined,
      min_lease_months: state.values.min_lease_months ? Number(state.values.min_lease_months) : undefined,
      floor_level: state.values.floor_level || undefined,
      orientation: state.values.orientation || undefined,
      decoration: state.values.decoration || undefined,
      has_video: state.values.has_video === '1' ? true : undefined,
      has_vr: state.values.has_vr === '1' ? true : undefined,
      is_featured: state.values.is_featured === '1' ? true : undefined,
      owner_direct: state.values.owner_direct === '1' ? true : undefined,
      sort: state.sort,
    };
  }, [cityKey]);

  const fetchPage = useCallback(async (page: number, query: any) => {
    const res: any = await publicApi.listings({ page, page_size: PAGE_SIZE, ...query });
    return unwrapPage<PublicListing>(res?.data);
  }, []);

  const top = (
    <View>
      <EntryGrid items={grid} />
      <ServiceBar
        text={t('category.rentServiceText')}
        actionLabel={t('category.helpFind')}
        onAction={() => notAvailable(navigation, t('category.helpFind'))}
      />
      {rail.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>{t('category.newListings')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {rail.map((it) => (
              <View key={it.id} style={styles.railItem}>
                <ResidentialRow item={it} t={t} mode="rent" onPress={() => navigation.navigate('PublicListingDetail', { id: it.id })} />
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );

  return (
    <CategoryListScreen<PublicListing>
      title={t('category.rentTitle')}
      city={city}
      onCityPress={() => navigation.navigate('LocationPicker')}
      searchPlaceholder={t('category.rentSearchPlaceholder')}
      rightActions={<CategoryRightActions navigation={navigation} />}
      top={top}
      tabs={[
        { key: 'whole', label: t('category.rentTabWhole') },
        { key: 'apartment', label: t('category.rentTabApartment') },
      ]}
      tabValue={tab}
      onTabChange={(k) => setTab(k as 'whole' | 'apartment')}
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <ResidentialRow item={item} t={t} mode="rent" onPress={() => navigation.navigate('PublicListingDetail', { id: item.id })} />
      )}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyRent')}
      emptySub={t('category.emptySub')}
      emptyIcon="home-outline"
    />
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, paddingHorizontal: 16, marginTop: 16, marginBottom: 10 },
  rail: { gap: colors.spacing.md, paddingHorizontal: 16, paddingBottom: 4 },
  railItem: { width: 320 },
});
