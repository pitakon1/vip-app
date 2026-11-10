import { BROWSE_PAGE_SIZE } from '@/lib/pagination';
/**
 * 小区（楼盘）列表（匿名可看）。
 *
 * 楼盘字典的对外展示面。卡片带「在售 N 套 / 在租 N 套 + 价格区间」聚合——
 * 这是用户判断一个小区"有没有货"的最快方式，也是老站的做法。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import RemoteImage from '@/components/RemoteImage';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import BeikeHeader from '@/components/BeikeHeader';
import { publicApi, unwrapPage, type PublicProject } from '@/services/publicApi';
import { convertFromThb, loadRates, tenureLabel, type TFunction } from '@/lib/publicSite';
import { fmtMoney } from '@/utils/format';
import ListState from '@/components/ListState';
import { Badge } from './PublicFilterChip';
import { notifyError } from '@/utils/feedback';
const PAGE_SIZE = BROWSE_PAGE_SIZE;

export default function PublicCommunitiesScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<PublicProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // 请求序列守卫：连续输入时丢弃仍在途的旧响应，避免旧结果覆盖新关键字
  const requestSeq = useRef(0);

  useEffect(() => {
    void loadRates();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => clearTimeout(timer);
  }, [keyword]);

  const params = useMemo(() => ({ page_size: PAGE_SIZE, q: debounced || undefined }), [debounced]);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      if (targetPage === 1) {
        setLoading(true);
        setLoadError(null);
      } else {
        setLoadingMore(true);
      }
      const seq = ++requestSeq.current;
      try {
        const res: any = await publicApi.projects({ page: targetPage, ...params });
        if (seq !== requestSeq.current) return;
        const pageData = unwrapPage<PublicProject>(res?.data);
        setTotal(pageData.total);
        setPage(targetPage);
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]));
      } catch {
        if (seq !== requestSeq.current) return;
        if (targetPage === 1) setLoadError(t('loadFailed'));
        // 第 2 页起失败此前无任何提示，列表只是停住
        else notifyError(t('common.hint'), new Error(t('loadFailedSub')));
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [params, t],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  return (
    <View style={styles.container}>
      <BeikeHeader title={t('pub.communitiesTitle')} hideHome />
      <View style={styles.header}>
        <Text style={styles.hint}>{t('pub.communitiesHint')}</Text>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={keyword}
            onChangeText={setKeyword}
            placeholder={t('pub.communitySearchPlaceholder')}
            placeholderTextColor={colors.ink3}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            accessibilityLabel={t('pub.communitySearchPlaceholder')}
          />
          {keyword ? (
            <TouchableOpacity
              style={styles.searchClear}
              onPress={() => setKeyword('')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('pub.clearSearch')}
            >
              <Ionicons name="close-circle" size={18} color={colors.ink3} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Text style={styles.count}>{t('pub.totalCount', { n: total })}</Text>

      {loading || loadError || items.length === 0 ? (
        <ListState
          loading={loading}
          loadingLabel={t('pub.loading')}
          error={loadError}
          empty={items.length === 0}
          filtered={!!debounced}
          emptyTitle={t('pub.communitiesEmpty')}
          emptySub={debounced ? t('pub.emptyFilteredSub') : t('pub.communitiesHint')}
          emptyActionLabel={debounced ? t('pub.clearFilters') : undefined}
          onEmptyAction={
            debounced
              ? () => {
                  setKeyword('');
                  setDebounced('');
                }
              : undefined
          }
          retryLabel={t('retry')}
          onRetry={() => {
            setLoadError(null);
            void fetchPage(1);
          }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loading || loadingMore || items.length >= total) return;
            void fetchPage(page + 1);
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await fetchPage(1);
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <ProjectCard
              item={item}
              t={t}
              onPress={() => navigation.navigate('PublicCommunityDetail', { id: item.id })}
            />
          )}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.primary} />
            ) : items.length > 0 && items.length >= total ? (
              <Text style={styles.noMore}>{t('pub.noMore')}</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

function ProjectCard({
  item,
  t,
  onPress,
}: {
  item: PublicProject;
  t: TFunction;
  onPress: () => void;
}) {
  const saleRange = priceRange(item.sale_price_min, item.sale_price_max);
  const rentRange = priceRange(item.rent_price_min, item.rent_price_max);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.name ?? undefined}
    >
      {item.cover ? (
        <RemoteImage
          uri={item.cover}
          style={styles.cover}
          resizeMode="cover"
          fallback={
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={styles.coverPlaceholderText}>{t('pub.noPhoto')}</Text>
            </View>
          }
        />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>{t('pub.noPhoto')}</Text>
        </View>
      )}

      <View style={styles.cardBody}>
        <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
        {item.district || item.city ? (
          <Text style={styles.projectSub} numberOfLines={1}>
            {[item.district, item.city].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

        <View style={styles.badgeRow}>
          <Badge text={t('pub.saleCount', { n: item.sale_count ?? 0 })} primary />
          <Badge text={t('pub.rentCount', { n: item.rent_count ?? 0 })} />
          {item.tenure ? <Badge text={tenureLabel(item.tenure, t)} /> : null}
        </View>

        {saleRange ? (
          <Text style={styles.priceLine}>
            {t('pub.salePrice')}{t('common.colon')}{saleRange}
            {item.sale_price_min ? (
              <Text style={styles.priceSub}>
                {'  '}≈ {fmtMoney(convertFromThb(item.sale_price_min), 'CNY')}
                {t('pub.upto')}
              </Text>
            ) : null}
          </Text>
        ) : null}
        {rentRange ? (
          <Text style={styles.priceLine}>
            {t('pub.rentPrice')}{t('common.colon')}{rentRange}
            <Text style={styles.priceSub}>{t('pub.perMonth')}</Text>
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function priceRange(min?: number | null, max?: number | null): string {
  if (!min && !max) return '';
  if (min && max) {
    if (min === max) return fmtMoney(min, 'THB');
    return `${fmtMoney(min, 'THB')} - ${fmtMoney(max, 'THB')}`;
  }
  return fmtMoney(min ?? max ?? 0, 'THB');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  backWrap: { paddingHorizontal: 16 },
  header: { paddingHorizontal: 16 },
  title: { fontSize: colors.fontSize['2xl'], fontWeight: '800', color: colors.ink },
  hint: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 4, lineHeight: 19 },
  searchWrap: { position: 'relative' },
  search: {
    height: 44,
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.fieldFillBorder,
    paddingLeft: 16,
    paddingRight: 40,
    fontSize: colors.fontSize.base,
    color: colors.ink,
    marginTop: 10,
  },
  searchClear: { position: 'absolute', right: 14, top: 22 },
  noMore: {
    fontSize: colors.fontSize.xs,
    color: colors.ink3,
    textAlign: 'center',
    paddingVertical: 16,
  },
  count: { fontSize: colors.fontSize.sm, color: colors.ink3, paddingHorizontal: 16, marginTop: 12, marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    marginBottom: colors.spacing.md,
    overflow: 'hidden',
    ...colors.shadow.card,
  },
  cover: { width: '100%', height: 150 },
  coverPlaceholder: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderText: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  cardBody: { padding: colors.spacing.lg },
  projectName: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  projectSub: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  priceLine: { fontSize: colors.fontSize.base, color: colors.ink, marginTop: 8 },
  priceSub: { fontSize: colors.fontSize.sm, color: colors.ink3 },
});
