/**
 * 房源管理（管理端）
 * 原型：admin-mobile-properties.html
 * 区块：搜索 → 状态筛选 → 统计行（总/空置/已出租/维护中）→ 房源列表（管理 + 删除）
 * 数据源：/properties（分页 + 状态筛选 + 关键词）
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';
import { propertiesApi } from '@/services/api';

const PAGE_SIZE = 10;

interface PropertyItem {
  id: string;
  room_number?: string | null;
  building?: string | null;
  address?: string | null;
  property_type?: string | null;
  monthly_rent?: number;
  currency?: string;
  status?: string | null;
  size_sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnished?: boolean;
  photos?: unknown[] | null;
}

const TYPE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  apartment: { label: '公寓', icon: 'business-outline', color: colors.primary },
  condo: { label: '公寓', icon: 'business-outline', color: colors.primary },
  house: { label: '别墅', icon: 'home-outline', color: colors.success },
  commercial: { label: '商铺', icon: 'storefront-outline', color: colors.warning },
  office: { label: '写字楼', icon: 'briefcase-outline', color: colors.info },
};

const STATUS_META: Record<string, { label: string; color: string; rgb: string }> = {
  vacant: { label: '空置中', color: colors.warning, rgb: colors.warningRgb },
  rented: { label: '已出租', color: colors.success, rgb: colors.successRgb },
  maintenance: { label: '维护中', color: colors.info, rgb: colors.infoRgb },
  renewing: { label: '续约中', color: colors.primary, rgb: colors.primaryRgb },
};

const CHIPS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'vacant', label: '空置中' },
  { key: 'rented', label: '已出租' },
  { key: 'maintenance', label: '维护中' },
];

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

export default function AdminPropertiesScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<PropertyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);

  // 状态计数与列表共用同一批查询（统计行数字与列表口径一致）
  const fetchCounts = useCallback(async () => {
    const res = await Promise.allSettled(
      ['vacant', 'rented', 'maintenance'].map((s) =>
        propertiesApi.list({ status: s, page: 1, page_size: 1 }),
      ),
    );
    const next: Record<string, number> = {};
    ['vacant', 'rented', 'maintenance'].forEach((s, i) => {
      const r = res[i];
      if (r.status === 'fulfilled') {
        const d = (r.value as any)?.data ?? {};
        next[s] = typeof d.total === 'number' ? d.total : 0;
      } else {
        next[s] = 0;
      }
    });
    setCounts(next);
  }, []);

  const load = useCallback(
    async (options?: { nextPage?: number; keywordOverride?: string }) => {
      const kw = options?.keywordOverride ?? keyword;
      const targetPage = options?.nextPage ?? 1;
      try {
        const params: Record<string, unknown> = {
          page: targetPage,
          page_size: PAGE_SIZE,
          sort: 'latest',
        };
        if (kw.trim()) params.q = kw.trim();
        if (status) params.status = status;
        const res = await propertiesApi.list(params);
        const d = (res as any)?.data ?? {};
        const list = (Array.isArray(d) ? d : d.items ?? []) as PropertyItem[];
        setItems((prev) => (targetPage === 1 ? list : [...prev, ...list]));
        setTotal(typeof d.total === 'number' ? d.total : list.length);
        setTotalPages(typeof d.total_pages === 'number' ? d.total_pages : 1);
        setPage(targetPage);
      } catch {
        if (targetPage === 1) {
          setItems([]);
          setTotal(0);
          setTotalPages(1);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [keyword, status],
  );

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      fetchCounts();
      load();
      return;
    }
    const timer = setTimeout(() => {
      fetchCounts();
      load({ nextPage: 1 });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, status]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchCounts(), load({ nextPage: 1 })]);
  }, [fetchCounts, load]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await load({ nextPage: page + 1 });
  }, [load, loadingMore, page, totalPages]);

  const doDelete = (p: PropertyItem) => {
    const title = [p.room_number, p.building].filter(Boolean).join(' · ') || p.address || '该房源';
    Alert.alert('删除房源', `确定删除「${title}」吗？删除后不可恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/properties/${p.id}`);
            setItems((prev) => prev.filter((it) => it.id !== p.id));
            setTotal((t) => Math.max(0, t - 1));
            fetchCounts();
          } catch (e: any) {
            Alert.alert('删除失败', e?.response?.data?.detail || '请稍后重试');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onScroll={({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 80) onLoadMore();
      }}
      scrollEventThrottle={100}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      {/* 搜索 */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索房源名称/地址"
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
        {keyword ? (
          <TouchableOpacity onPress={() => setKeyword('')} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={16} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 状态筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {CHIPS.map((c) => (
          <TouchableOpacity
            key={c.key || 'all'}
            style={[styles.chip, status === c.key && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => setStatus(c.key)}
          >
            <Text style={[styles.chipText, status === c.key && styles.chipTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 统计行 */}
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>总房源</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{total}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>空置</Text>
          <Text style={[styles.statValue, { color: colors.warning }]}>{counts.vacant ?? 0}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>已出租</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>{counts.rented ?? 0}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>维护中</Text>
          <Text style={[styles.statValue, { color: colors.info }]}>{counts.maintenance ?? 0}</Text>
        </View>
      </View>

      {/* 房源列表 */}
      <Text style={styles.sectionTitle}>房源列表</Text>
      {items.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title={keyword ? '没有找到房源' : '暂无房源'}
          sub={keyword ? '换个名称或地址试试' : '新增房源后会展示在这里'}
        />
      ) : (
        items.map((p) => {
          const type = TYPE_META[p.property_type ?? 'apartment'] ?? TYPE_META.apartment;
          const meta = STATUS_META[p.status ?? 'vacant'] ?? {
            label: p.status ?? '未知',
            color: colors.ink2,
            rgb: colors.primaryRgb,
          };
          const spec = [
            p.size_sqm ? `${p.size_sqm}㎡` : null,
            p.bedrooms ? `${p.bedrooms} 卧` : null,
            p.bathrooms ? `${p.bathrooms} 浴` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={p.id} style={styles.card}>
              <View style={styles.banner}>
                <View style={styles.bannerIcon}>
                  <Ionicons name={type.icon} size={26} color={colors.primaryForeground} />
                </View>
                <View style={[styles.typeBadge, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.typeBadgeText, { color: type.color }]}>{type.label}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: colors.alpha(meta.rgb, 0.14) }]}>
                  <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {[p.room_number, p.building].filter(Boolean).join(' · ') || '未命名房源'}
                </Text>
                <View style={styles.addrRow}>
                  <Ionicons name="location-outline" size={13} color={colors.ink3} />
                  <Text style={styles.addr} numberOfLines={1}>{p.address || '暂无地址'}</Text>
                </View>
                {!!spec && <Text style={styles.spec}>{spec}</Text>}
                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {symOf(p.currency)}
                    {Number(p.monthly_rent || 0).toLocaleString()}
                    <Text style={styles.priceUnit}> /月</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.cardFoot}>
                <TouchableOpacity
                  style={styles.manageBtn}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('AdminPropertyDetail', { id: p.id })}
                >
                  <Text style={styles.manageText}>管理</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.7} onPress={() => doDelete(p)}>
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {loadingMore && (
        <View style={styles.moreWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },

  chipScroll: { flexGrow: 0, marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  statRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20 },
  statCell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: 11, color: colors.ink3 },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: -0.2,
  },

  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.card,
  },
  banner: {
    height: 96,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerIcon: { opacity: 0.95 },
  typeBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadge: {
    position: 'absolute',
    right: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  cardBody: { padding: 14 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  addr: { flex: 1, fontSize: 12, color: colors.ink3 },
  spec: { fontSize: 12, color: colors.ink2, marginTop: 6 },
  priceRow: { marginTop: 8 },
  price: { fontSize: 16, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  priceUnit: { fontSize: 11, fontWeight: '500', color: colors.ink3 },

  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  manageBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
  },
  manageText: { fontSize: 13, fontWeight: '700', color: colors.primaryForeground },
  deleteBtn: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: colors.radius.lg,
    backgroundColor: colors.alpha(colors.errorRgb, 0.1),
  },

  moreWrap: { paddingVertical: 16, alignItems: 'center' },
});