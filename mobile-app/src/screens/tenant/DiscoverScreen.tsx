import { CAROUSEL_PAGE_SIZE } from '@/lib/pagination';

/**
 * 发现（C 端底部 Tab）：城市行情 + 热门小区 + 国际学校。
 *
 * 首页黄金导航已覆盖房源分类入口，这里不再重复「房源类型」导航，
 * 只提供决策前需要的市场信息，避免同一内容出现第二个入口。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { cityDisplayName } from '@/data/locationNames';
import { useLocationStore } from '@/stores/location';
import RemoteImage from '@/components/RemoteImage';
import { formatCompactNumber } from '@/utils/format';
import {
  publicApi,
  unwrapPage,
  type PublicCategorySummary,
  type PublicProject,
  type PublicSchool,
} from '@/services/publicApi';

export default function DiscoverScreen() {
  const { t, lang } = useI18n();
  const compact = (n?: number | null) => formatCompactNumber(n, lang);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const cityKey = useLocationStore((s) => s.selection.cityKey);
  const cityLabel = cityDisplayName(
    cityKey,
    useLocationStore((s) => s.selection.cityLabel),
    lang,
  );

  const [summary, setSummary] = useState<PublicCategorySummary | null>(null);
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [s, p, sc] = await Promise.allSettled([
      publicApi.listingCategorySummary({ city: cityKey || undefined }),
      publicApi.projects({ city: cityKey || undefined, page_size: CAROUSEL_PAGE_SIZE, sort: 'hot' }),
      publicApi.schools({ page_size: CAROUSEL_PAGE_SIZE }),
    ]);
    if (s.status === 'fulfilled') {
      setSummary((s.value as any)?.data ?? null);
    }
    setProjects(p.status === 'fulfilled' ? unwrapPage<PublicProject>((p.value as any)?.data).items : []);
    setSchools(sc.status === 'fulfilled' ? unwrapPage<PublicSchool>((sc.value as any)?.data).items : []);
  }, [cityKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const stats = useMemo(
    () => [
      { key: 'rent', label: t('discover.statRent'), value: summary?.rent_count ?? 0, icon: 'key-outline' as const, color: colors.primary },
      { key: 'sale', label: t('discover.statSale'), value: summary?.sell_count ?? 0, icon: 'pricetag-outline' as const, color: colors.primaryText },
      { key: 'new', label: t('discover.statNew'), value: summary?.new_count ?? 0, icon: 'business-outline' as const, color: colors.warning },
      { key: 'shop', label: t('discover.statShop'), value: summary?.office_shop_count ?? 0, icon: 'storefront-outline' as const, color: colors.info },
    ],
    [summary, t],
  );

  // 卡片价格按「数值大、单位小」拆开渲染；标签口径与首页分类一致
  const projectPrice = useCallback(
    (p: PublicProject) => {
      if (p.rent_price_min != null) {
        return { value: compact(p.rent_price_min), unit: t('discover.rentUnit'), tag: t('discover.tagRent') };
      }
      if (p.sale_price_min != null) {
        return { value: compact(p.sale_price_min), unit: t('discover.saleUnit'), tag: t('discover.tagSale') };
      }
      return null;
    },
    [t, lang],
  );

  // 区域均价：取均价最高的 5 个区做横向对比（数据缺失时整块不渲染）
  const districts = useMemo(() => {
    const rows = (summary?.district_price_pairs ?? [])
      .filter((d) => d.avg_price > 0)
      .sort((a, b) => b.avg_price - a.avg_price)
      .slice(0, 5);
    const max = rows.length ? rows[0].avg_price : 0;
    return rows.map((d) => ({ ...d, pct: max ? Math.max(0.08, d.avg_price / max) : 0 }));
  }, [summary]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.heroBand}>
        <View style={styles.heroRow}>
          <Text style={styles.heroTitle}>{t('discover.title')}</Text>
          <TouchableOpacity
            style={styles.cityChip}
            onPress={() => navigation.navigate('LocationPicker')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('home.selectCity')}
          >
            <Ionicons name="location" size={13} color={colors.primary} />
            <Text style={styles.cityText} numberOfLines={1}>
              {cityLabel || t('home.currentCity')}
            </Text>
            <Ionicons name="chevron-down" size={11} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.heroSub}>{t('discover.subtitle')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* 市场速览：在租 / 在售 / 新房 / 商铺办公 实时挂牌数 */}
        <Text style={styles.sectionTitle}>{t('discover.market')}</Text>
        <View style={styles.statGrid}>
          {stats.map((s) => (
            <View key={s.key} style={styles.statCard}>
              <View style={styles.statTop}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Ionicons name={s.icon} size={16} color={s.color} style={styles.statIcon} />
              </View>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* 区域均价对比 */}
        {districts.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('discover.districtPrice')}</Text>
              <Text style={styles.sectionHint}>{t('discover.perSqm')}</Text>
            </View>
            <View style={styles.priceCard}>
              {districts.map((d) => (
                <View key={d.district} style={styles.priceRow}>
                  <Text style={styles.priceDistrict} numberOfLines={1}>
                    {d.district}
                  </Text>
                  <View style={styles.priceTrack}>
                    <View style={[styles.priceFill, { width: `${Math.round(d.pct * 100)}%` }]} />
                  </View>
                  <Text style={styles.priceValue}>{compact(d.avg_price)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 热门小区 */}
        {projects.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('pub.tabCommunities')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('PublicCommunities')} activeOpacity={0.7}>
                <Text style={styles.moreLink}>{t('discover.viewAll')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {projects.map((p) => {
                const price = projectPrice(p);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.projectCard}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('PublicCommunityDetail', { id: p.id })}
                  >
                    <View style={styles.coverWrap}>
                      <RemoteImage uri={p.cover} style={styles.projectCover} iconSize={26} />
                      {price ? (
                        <View style={styles.coverTag}>
                          <Text style={styles.coverTagText}>{price.tag}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.projectBody}>
                      <Text style={styles.projectName} numberOfLines={2}>
                        {p.name || '—'}
                      </Text>
                      <Text style={styles.projectSub} numberOfLines={1}>
                        {p.district || p.city || ''}
                      </Text>
                      <View style={styles.projectPriceRow}>
                        <Text style={styles.projectPrice}>
                          {price ? price.value : t('discover.noPrice')}
                        </Text>
                        {price ? <Text style={styles.projectPriceUnit}>{price.unit}</Text> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* 国际学校 */}
        {schools.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('pub.tabSchools')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('PublicSchools')} activeOpacity={0.7}>
                <Text style={styles.moreLink}>{t('discover.viewAll')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {schools.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.projectCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('PublicSchoolDetail', { id: s.id })}
                >
                  <View style={styles.coverWrap}>
                    <RemoteImage uri={s.cover_url} style={styles.projectCover} iconSize={26} />
                    <View style={styles.coverTag}>
                      <Text style={styles.coverTagText}>{t('pub.tabSchools')}</Text>
                    </View>
                  </View>
                  <View style={styles.projectBody}>
                    <Text style={styles.projectName} numberOfLines={2}>
                      {s.name || s.name_en || '—'}
                    </Text>
                    <Text style={styles.projectSub} numberOfLines={1}>
                      {[s.district, s.curriculum].filter(Boolean).join(' · ') || ''}
                    </Text>
                    <View style={styles.projectPriceRow}>
                      <Text style={styles.projectPrice} numberOfLines={1}>
                        {s.tuition_range || t('discover.noPrice')}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heroBand: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: colors.text },
  heroSub: { marginTop: 4, fontSize: 12, color: colors.ink2 },
  cityChip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
  },
  cityText: { fontSize: colors.fontSize.caption, fontWeight: '600', color: colors.primary, maxWidth: 120 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionHead: {
    marginTop: 24,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHint: { fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: colors.lineHeight.tight },
  moreLink: { fontSize: 12, fontWeight: '600', color: colors.primary },
  statGrid: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  statCard: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statIcon: { opacity: 0.8 },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { marginTop: 2, fontSize: 11, color: colors.ink3 },
  priceCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 },
  priceDistrict: { flex: 1, fontSize: 12, color: colors.ink2 },
  priceTrack: { width: 118, height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  priceFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  priceValue: { width: 64, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  rail: { gap: 12, paddingRight: 16 },
  projectCard: {
    width: 168,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  coverWrap: { position: 'relative' },
  projectCover: { width: '100%', height: 112 },
  coverTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  coverTagText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF' },
  projectBody: { paddingHorizontal: 10, paddingVertical: 10, gap: 4 },
  projectName: { fontSize: 13, fontWeight: '600', color: colors.text, lineHeight: 18 },
  projectSub: { fontSize: 11, color: colors.ink3, lineHeight: 14 },
  projectPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  projectPrice: { fontSize: 14, fontWeight: '700', color: colors.primary },
  projectPriceUnit: { fontSize: 11, fontWeight: '500', color: colors.primary },
});
