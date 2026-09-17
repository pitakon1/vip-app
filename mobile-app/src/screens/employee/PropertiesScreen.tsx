/**
 * 房源台账：搜索 + 状态/排序筛选 + 结果统计 + 房源卡片（租客信息）+ 加载更多
 * 原型：employee-mobile-properties.html（房源浏览 · 台账）
 * 数据源：/properties（分页）、/properties/{id}/leases（租客姓名）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
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
  video_url?: string | null;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  vacant: { label: '空置', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.12) },
  rented: {
    label: '在租',
    color: colors.success,
    bg: colors.alpha(colors.successRgb, 0.12),
  },
  renewing: {
    label: '续约中',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
  maintenance: {
    label: '维修中',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
};

const TYPE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  apartment: { label: '公寓', icon: 'business-outline', color: colors.primary },
  condo: { label: '公寓', icon: 'business-outline', color: colors.primary },
  house: { label: '别墅', icon: 'home-outline', color: colors.success },
  commercial: { label: '商铺', icon: 'storefront-outline', color: colors.warning },
};

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'rented', label: '在租' },
  { key: 'vacant', label: '空置' },
  { key: 'maintenance', label: '维修' },
];

const SORTS: { key: string; label: string }[] = [
  { key: 'latest', label: '最新' },
  { key: 'price_asc', label: '租金从低到高' },
  { key: 'price_desc', label: '租金从高到低' },
  { key: 'area_desc', label: '面积从大到小' },
];

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

export default function PropertiesScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<PropertyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [vacantTotal, setVacantTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('latest');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);

  const fetchProperties = useCallback(
    async (targetPage: number, kw: string, st: string, so: string) => {
      const params: Record<string, unknown> = { page: targetPage, page_size: PAGE_SIZE, sort: so };
      if (kw.trim()) params.q = kw.trim();
      if (st) params.status = st;
      const res = await propertiesApi.list(params);
      const data = res.data as {
        items?: PropertyItem[];
        total?: number;
        total_pages?: number;
      };
      const list = Array.isArray(data)
        ? (data as unknown as PropertyItem[])
        : (data?.items ?? []);
      return {
        list,
        total: data?.total ?? list.length,
        totalPages: data?.total_pages ?? 1,
      };
    },
    [],
  );

  const load = useCallback(
    async (options?: { nextPage?: number; keywordOverride?: string }) => {
      const kw = options?.keywordOverride ?? keyword;
      const targetPage = options?.nextPage ?? 1;
      try {
        const [propRes, vacantRes] = await Promise.allSettled([
          fetchProperties(targetPage, kw, status, sort),
          propertiesApi.list({ status: 'vacant', page: 1, page_size: 1 }),
        ]);

        let pageItems: PropertyItem[] = [];
        if (propRes.status === 'fulfilled') {
          const { list, total: t, totalPages: tp } = propRes.value;
          pageItems = list;
          setTotal(t);
          setTotalPages(tp);
          setPage(targetPage);
          setItems((prev) => (targetPage === 1 ? list : [...prev, ...list]));
        } else if (targetPage === 1) {
          setItems([]);
          setTotal(0);
          setTotalPages(1);
        }

        if (vacantRes.status === 'fulfilled') {
          const vd = vacantRes.value.data as { total?: number };
          setVacantTotal(typeof vd?.total === 'number' ? vd.total : null);
        }

        // 在租房源补充租客姓名（接口 /properties/{id}/leases 是租客姓名的唯一来源）
        const rentedIds = pageItems.filter((p) => p.status === 'rented').map((p) => p.id);
        if (rentedIds.length > 0) {
          const leaseRes = await Promise.allSettled(
            rentedIds.map((id) => propertiesApi.leases(id)),
          );
          const next: Record<string, string> = {};
          leaseRes.forEach((r, idx) => {
            if (r.status !== 'fulfilled') return;
            const d = r.value.data as { items?: { tenant_name?: string | null; status?: string | null }[] };
            const active =
              (d?.items ?? []).find((l) => l.status === 'active') ?? (d?.items ?? [])[0];
            if (active?.tenant_name) next[rentedIds[idx]] = active.tenant_name;
          });
          setTenantMap((prev) => (targetPage === 1 ? next : { ...prev, ...next }));
        } else if (targetPage === 1) {
          setTenantMap({});
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [fetchProperties, keyword, status, sort],
  );

  // 关键词 / 筛选变化后重新查询（关键词做 400ms 防抖）
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      load();
      return;
    }
    const timer = setTimeout(() => load({ nextPage: 1 }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, status, sort]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ nextPage: 1 });
  }, [load]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await load({ nextPage: page + 1 });
  }, [load, loadingMore, page, totalPages]);

  // 租客行：有真实租客姓名则展示，无租约展示「无租约」
  const tenantLabel = useMemo(() => {
    return (propertyId: string) => {
      const name = tenantMap[propertyId];
      return name ? `租客: ${name}` : '无租约';
    };
  }, [tenantMap]);

  const renderCard = (p: PropertyItem) => {
    const st = p.status ?? 'vacant';
    const meta = STATUS_META[st] ?? { label: st, color: colors.ink2, bg: colors.surface2 };
    const type = TYPE_META[p.property_type ?? 'apartment'] ?? TYPE_META.apartment;
    const title = [p.room_number, p.building].filter(Boolean).join(' · ') || p.address || '房源';
    const spec = [
      p.size_sqm ? `${p.size_sqm}㎡` : null,
      p.bedrooms ? `${p.bedrooms}卧${p.bathrooms ?? 0}浴` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const tags = [
      p.furnished ? '精装' : null,
      p.video_url ? '视频看房' : null,
      Array.isArray(p.photos) && p.photos.length > 0 ? `${p.photos.length} 张照片` : null,
    ].filter(Boolean) as string[];

    return (
      <TouchableOpacity
        key={p.id}
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('PropertyEdit', { id: p.id })}
      >
        <View style={[styles.thumb, { backgroundColor: type.color }]}>
          <Ionicons name={type.icon} size={26} color={colors.primaryForeground} />
          <View style={styles.typeBadge}>
            <Text style={[styles.typeBadgeText, { color: type.color }]}>{type.label}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.addr} numberOfLines={1}>
            {p.address || '暂无地址'}
          </Text>
          {tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {spec ? <Text style={styles.spec}>{spec}</Text> : null}
          <View style={styles.leaseRow}>
            <Ionicons name="person-outline" size={13} color={colors.ink3} />
            <Text style={styles.leaseText} numberOfLines={1}>
              {tenantLabel(p.id)}
            </Text>
          </View>
          <View style={styles.bottom}>
            <Text style={styles.price}>
              {symOf(p.currency)}
              {Number(p.monthly_rent || 0).toLocaleString()}
              <Text style={styles.priceUnit}>/月</Text>
            </Text>
            <View style={styles.badgeGroup}>
              <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label="正在加载房源…" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* 搜索 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索房源名称、地址..."
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            activeOpacity={0.7}
            onPress={() => setStatus(f.key)}
            style={[styles.chip, status === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, status === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 排序 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {SORTS.map((s) => (
          <TouchableOpacity
            key={s.key}
            activeOpacity={0.7}
            onPress={() => setSort(s.key)}
            style={[styles.sortChip, sort === s.key && styles.sortChipActive]}
          >
            <Text style={[styles.sortChipText, sort === s.key && styles.sortChipTextActive]}>
              {s.label}
            </Text>
            {sort === s.key ? (
              <Ionicons name="chevron-down" size={12} color={colors.primary} />
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 结果统计 */}
      <Text style={styles.countRow}>
        共 <Text style={styles.countStrong}>{total}</Text> 套
        {vacantTotal !== null ? (
          <>
            {' · 空置 '}
            <Text style={styles.countVacant}>{vacantTotal}</Text> 套
          </>
        ) : null}
      </Text>

      {items.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="暂无房源"
          sub={keyword || status ? '换个关键词或筛选条件试试' : '可管理的房源会展示在这里'}
        />
      ) : (
        <View style={styles.list}>
          {items.map((p) => renderCard(p))}

          {page < totalPages ? (
            <TouchableOpacity
              style={styles.loadMore}
              activeOpacity={0.8}
              onPress={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>加载更多房源</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.full,
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: 9,
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },

  chipScroll: { marginTop: colors.spacing.md },
  chipRow: { gap: colors.spacing.sm, paddingHorizontal: colors.spacing.lg },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sortChipActive: { borderColor: colors.primary, backgroundColor: colors.alpha(colors.primaryRgb, 0.08) },
  sortChipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  sortChipTextActive: { color: colors.primary, fontWeight: '600' },

  countRow: {
    fontSize: 13,
    color: colors.ink3,
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.lg,
    marginBottom: colors.spacing.sm,
  },
  countStrong: { fontSize: 14, fontWeight: '700', color: colors.ink },
  countVacant: { fontSize: 14, fontWeight: '700', color: colors.info },

  list: { paddingHorizontal: colors.spacing.md, gap: colors.spacing.md },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: colors.spacing.md,
    ...colors.shadow.card,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: colors.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: colors.spacing.md,
  },
  typeBadge: {
    position: 'absolute',
    bottom: 6,
    backgroundColor: colors.alpha('255, 255, 255', 0.92),
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '700' },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  addr: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: colors.spacing.sm },
  tag: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontSize: colors.fontSize.xs, color: colors.ink2 },
  spec: { fontSize: 12, color: colors.ink2, marginTop: 6 },
  leaseRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  leaseText: { fontSize: 12, color: colors.ink3, flexShrink: 1 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: colors.spacing.sm,
    paddingTop: colors.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  priceUnit: { fontSize: 12, fontWeight: '500', color: colors.ink3 },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadge: { borderRadius: colors.radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },

  loadMore: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadMoreText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});