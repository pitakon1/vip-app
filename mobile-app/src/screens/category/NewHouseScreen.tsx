/**
 * 新房分类页 = 楼盘（项目）视角，数据面是 `/public/projects`。
 *
 * 数据胶囊 5 格、榜单行（= 排序）、楼盘卡（在售徽标 / 建面区间 / 户型 / 成交动态）
 * 全部来自后端实时聚合；dev 库楼盘极少时相应模块留空，不注入占位数据。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { useLocationStore } from '@/stores/location';
import { publicApi, unwrapPage, type PublicProject } from '@/services/publicApi';
import {
  CategoryListScreen,
  CategoryRightActions,
  CapsuleRow,
  EntryGrid,
  type CapsuleItem,
  type FilterGroup,
  type GridItem,
  type QuickTag,
} from './CategoryShell';
import { ProjectRow, ProjectRailCard } from './categoryCards';
import {
  useCategorySummary,
  usePublicDistricts,
  districtOptions,
  fallbackDistrictLabels,
  districtGroup,
  projectSortGroup,
  rangeOptions,
  parseRange,
  AVG_PRICE_RANGES,
  notAvailable,
} from './categoryShared';

const PAGE_SIZE = 20;

export default function NewHouseScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const city = useLocationStore((s) => s.selection.cityLabel);
  const cityKey = useLocationStore((s) => s.selection.cityKey);
  const summary = useCategorySummary();
  const [rail, setRail] = useState<PublicProject[]>([]);
  // 区域下拉：走后端真实区域（当前城市；新房=售侧）
  const districts = usePublicDistricts(cityKey, 'sell');

  // 「近30天热销」rail：按后端 hot（近30天成交）排序的真实楼盘，空则整块不渲染
  useEffect(() => {
    publicApi
      .projects({ city: cityKey || undefined, sort: 'hot', page_size: 6 })
      .then((res: any) => setRail(unwrapPage<PublicProject>(res?.data).items))
      .catch(() => setRail([]));
  }, [cityKey]);

  const capsules: CapsuleItem[] = useMemo(
    () => [
      { key: 'on_sale', value: summary?.on_sale_projects ?? 0, label: t('category.capOnSaleProjects') },
      { key: 'units', value: summary?.sell_count ?? 0, label: t('category.capOnSaleUnits') },
      { key: 'opened', value: summary?.opened_this_month ?? 0, label: t('category.capOpenedThisMonth') },
      { key: 'new7d', value: summary?.new_projects_7d ?? 0, label: t('category.capNewProjects') },
      { key: 'unsold', value: summary?.unsold_projects ?? 0, label: t('category.capUnsoldProjects') },
    ],
    [summary, t],
  );

  const grid: GridItem[] = useMemo(() => {
    const mk = (key: string, label: string, icon: GridItem['icon'], color: string, rgb: string): GridItem => ({
      key,
      label,
      icon,
      color,
      tint: colors.alpha(rgb, 0.1),
      onPress: () => notAvailable(navigation, label),
    });
    return [
      mk('brand', t('category.newGridBrand'), 'ribbon-outline', colors.primary, colors.primaryRgb),
      mk('land', t('category.newGridLand'), 'map-outline', colors.info, colors.infoRgb),
      mk('broker', t('category.findBroker'), 'people-outline', colors.warning, colors.warningRgb),
      mk('ready', t('category.newGridReady'), 'home-outline', colors.success, colors.successRgb),
      mk('small', t('category.newGridSmall'), 'resize-outline', colors.error, colors.errorRgb),
      mk('rank', t('category.newGridRank'), 'podium-outline', colors.primary, colors.primaryRgb),
      mk('vr', t('category.newGridVr'), 'cube-outline', colors.info, colors.infoRgb),
      mk('live', t('category.newGridLive'), 'videocam-outline', colors.warning, colors.warningRgb),
      mk('three', t('category.newGridThree'), 'people-outline', colors.success, colors.successRgb),
      mk('subway', t('category.newGridSubway'), 'subway-outline', colors.error, colors.errorRgb),
    ];
  }, [t, navigation]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      districtGroup(districtOptions(districts, fallbackDistrictLabels(cityKey)), t),
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
              { value: 'sold_out', label: t('category.saleSoldOut') },
            ],
          },
          {
            key: 'has_listings',
            label: t('category.filterHasListings'),
            options: [
              { value: '1', label: t('category.onlyOnSale') },
              { value: '0', label: t('category.onlyUnsold') },
            ],
          },
          {
            key: 'tenure',
            label: t('category.filterTenure'),
            options: [
              { value: 'freehold', label: t('pub.tenure.freehold') },
              { value: 'leasehold', label: t('pub.tenure.leasehold') },
              { value: 'mixed', label: t('pub.tenure.mixed') },
            ],
          },
        ],
      },
      projectSortGroup(t),
    ],
    [districts, cityKey, t],
  );

  const quickTags: QuickTag[] = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'onsale', label: t('category.onlyOnSale'), group: 'has_listings', value: '1' },
      { key: 'unsold', label: t('category.onlyUnsold'), group: 'has_listings', value: '0' },
    ],
    [t],
  );

  const buildQuery = useCallback((state: any) => {
    const price = parseRange(state.values.price);
    return {
      q: state.keyword || undefined,
      city: cityKey || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      sale_status: state.values.sale_status || undefined,
      has_listings:
        state.values.has_listings === '1' ? true : state.values.has_listings === '0' ? false : undefined,
      tenure: state.values.tenure || undefined,
      sort: state.sort,
    };
  }, [cityKey]);

  const fetchPage = useCallback(async (page: number, query: any) => {
    const res: any = await publicApi.projects({ page, page_size: PAGE_SIZE, ...query });
    return unwrapPage<PublicProject>(res?.data);
  }, []);

  const top = (
    <View>
      {summary ? <CapsuleRow items={capsules} /> : null}
      <EntryGrid items={grid} />
      {rail.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>{t('category.hotProjects')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {rail.map((it) => (
              <ProjectRailCard
                key={it.id}
                item={it}
                t={t}
                onPress={() => navigation.navigate('PublicCommunityDetail', { id: it.id })}
              />
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );

  return (
    <CategoryListScreen<PublicProject>
      title={t('category.newTitle')}
      city={city}
      onCityPress={() => navigation.navigate('LocationPicker')}
      searchPlaceholder={t('category.newSearchPlaceholder')}
      rightActions={<CategoryRightActions navigation={navigation} />}
      top={top}
      tabs={[
        { key: 'hot', label: t('category.newRankDeal') },
        { key: 'price_asc', label: t('category.newRankPriceLow') },
        { key: 'price_desc', label: t('category.newRankPriceHigh') },
        { key: 'open_date_desc', label: t('category.newRankOpen') },
      ]}
      tabGroup="sort"
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => (
        <ProjectRow item={item} t={t} onPress={() => navigation.navigate('PublicCommunityDetail', { id: item.id })} />
      )}
      keyExtractor={(item) => item.id}
      emptyTitle={t('category.emptyNew')}
      emptySub={t('category.emptySub')}
      emptyIcon="business-outline"
    />
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, paddingHorizontal: 16, marginTop: 16, marginBottom: 10 },
  rail: { gap: colors.spacing.md, paddingHorizontal: 16, paddingBottom: 4 },
});
