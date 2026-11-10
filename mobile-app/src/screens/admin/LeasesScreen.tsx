import { OPTION_PAGE_SIZE } from '@/lib/pagination';
import { fetchAllPages } from '@/lib/fetchAll';
import { fmtDate } from '@/utils/format';
/**
 * 合同管理（管理端）
 * 原型：admin-mobile-leases.html
 * 区块：搜索 → 状态筛选 → 统计行（总/生效中/即将到期/已到期）→ 合同列表
 * 数据源：/leases（真实租约）、/properties（房源名称映射）
 * 注：后端 /leases 未返回合同编号与租客姓名，编号由租约 ID 派生、租客信息在合同详情查看
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import { leasesApi, propertiesApi } from '@/services/api';
import { useI18n } from '@/i18n';

const PAGE_SIZE = OPTION_PAGE_SIZE;
const EXPIRING_DAYS = 30;
const DAY_MS = 86400000;

interface LeaseRow {
  id: string;
  property_id?: string | null;
  tenant_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  monthly_rent?: number;
  currency?: string;
  deposit_amount?: number;
  status?: string | null;
}

interface PropertyRow {
  id: string;
  room_number?: string | null;
  building?: string | null;
  address?: string | null;
}

const STATUS_META: Record<string, { labelKey: string; color: string; rgb: string }> = {
  active: { labelKey: 'lease.status.active', color: colors.success, rgb: colors.successRgb },
  pending: { labelKey: 'lease.status.pending', color: colors.info, rgb: colors.infoRgb },
  expired: { labelKey: 'lease.status.expired', color: colors.ink2, rgb: colors.primaryRgb },
  terminated: { labelKey: 'lease.status.terminated', color: colors.error, rgb: colors.errorRgb },
};

type ChipKey = 'all' | 'active' | 'expiring' | 'expired' | 'terminated';
const CHIPS: { key: ChipKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'common.all' },
  { key: 'active', labelKey: 'lease.status.active' },
  { key: 'expiring', labelKey: 'leaseAdm.chipExpiring' },
  { key: 'expired', labelKey: 'lease.status.expired' },
  { key: 'terminated', labelKey: 'lease.status.terminated' },
];

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');
// 合同编号由租约 ID 前 6 位派生，保证同一合同在各端展示一致
const leaseNoOf = (id: string) => `LC-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

export default function AdminLeasesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [leases, setLeases] = useState<LeaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [propMap, setPropMap] = useState<Record<string, PropertyRow>>({});
  const [keyword, setKeyword] = useState('');
  const [chip, setChip] = useState<ChipKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const [leaseRes, propRes] = await Promise.allSettled([
      // 显式全量加载：本页的搜索与状态筛选都在本地做，只取第一页会漏掉后面页的合同
      fetchAllPages<LeaseRow>((page) => leasesApi.list({ page, page_size: PAGE_SIZE }), PAGE_SIZE),
      propertiesApi.list({ page: 1, page_size: OPTION_PAGE_SIZE }),
    ]);

    if (leaseRes.status === 'fulfilled') {
      const { items: rows, total: rowTotal } = leaseRes.value as { items: LeaseRow[]; total: number };
      setLeases(rows);
      setTotal(rowTotal);
    } else {
      setLoadError(t('leaseAdm.loadFail'));
    }

    if (propRes.status === 'fulfilled') {
      const d = (propRes.value as any)?.data ?? {};
      const rows = (Array.isArray(d) ? d : d.items ?? []) as PropertyRow[];
      setPropMap(rows.reduce<Record<string, PropertyRow>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {}));
    }

    setLoading(false);
    setRefreshing(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const daysLeftOf = (l: LeaseRow) => {
    if (!l.end_date) return null;
    const end = new Date(l.end_date).getTime();
    if (Number.isNaN(end)) return null;
    return Math.round((end - Date.now()) / DAY_MS);
  };
  const isExpiring = (l: LeaseRow) => {
    const d = daysLeftOf(l);
    return l.status === 'active' && d !== null && d >= 0 && d <= EXPIRING_DAYS;
  };

  const stat = useMemo(
    () => ({
      total,
      active: leases.filter((l) => l.status === 'active').length,
      expiring: leases.filter(isExpiring).length,
      expired: leases.filter((l) => l.status === 'expired').length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leases, total],
  );

  const propNameOf = (l: LeaseRow) => {
    const p = l.property_id ? propMap[l.property_id] : undefined;
    if (!p) return t('leaseAdm.propertyPending');
    return [p.room_number, p.building].filter(Boolean).join(' · ') || p.address || t('leaseAdm.propertyFallback');
  };

  const visible = leases.filter((l) => {
    const hitChip =
      chip === 'all'
        ? true
        : chip === 'expiring'
          ? isExpiring(l)
          : l.status === chip;
    if (!hitChip) return false;
    const kw = keyword.trim().toLowerCase();
    if (!kw) return true;
    return (
      leaseNoOf(l.id).toLowerCase().includes(kw) ||
      propNameOf(l).toLowerCase().includes(kw) ||
      (l.tenant_id || '').toLowerCase().includes(kw)
    );
  });

  const retry = () => {
    setLoading(true);
    load();
  };

  if (loading) {
    return <ListState loading />;
  }

  if (loadError && leases.length === 0) {
    return <ListState error={loadError} retryLabel={t('common.retry')} onRetry={retry} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* 搜索 */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder={t('leaseAdm.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
        {keyword ? (
          <TouchableOpacity
            onPress={() => setKeyword('')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('leaseAdm.clearSearch')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close-circle" size={18} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 状态筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {CHIPS.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.chip, chip === c.key && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => setChip(c.key)}
          >
            <Text style={[styles.chipText, chip === c.key && styles.chipTextActive]}>{t(c.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 统计行 */}
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel} numberOfLines={1}>{t('leaseAdm.statTotal')}</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stat.total}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel} numberOfLines={1}>{t('lease.status.active')}</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>{stat.active}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel} numberOfLines={1}>{t('leaseAdm.chipExpiring')}</Text>
          <Text style={[styles.statValue, { color: colors.warning }]}>{stat.expiring}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel} numberOfLines={1}>{t('lease.status.expired')}</Text>
          <Text style={[styles.statValue, { color: colors.error }]}>{stat.expired}</Text>
        </View>
      </View>

      {/* 合同列表 */}
      <Text style={styles.sectionTitle}>{t('leaseAdm.listTitle')}</Text>
      {loadError ? (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            padding: 10,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.alpha(colors.errorRgb, 0.08),
          }}
        >
          <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>{loadError}</Text>
          <TouchableOpacity onPress={retry} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, color: colors.primary }}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {visible.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={keyword ? t('leaseAdm.emptyNoResult') : t('leaseAdm.empty')}
          sub={keyword ? t('leaseAdm.emptyNoResultSub') : t('leaseAdm.emptySub')}
        />
      ) : (
        visible.map((l) => {
          const meta = STATUS_META[l.status ?? ''] ?? {
            labelKey: '',
            color: colors.ink2,
            rgb: colors.primaryRgb,
          };
          const statusLabel = meta.labelKey ? t(meta.labelKey) : l.status ?? t('common.unknown');
          const d = daysLeftOf(l);
          const expiring = isExpiring(l);
          return (
            <View key={l.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.leaseNo}>{leaseNoOf(l.id)}</Text>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.alpha(expiring ? colors.warningRgb : meta.rgb, 0.12) },
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: expiring ? colors.warning : meta.color }]} />
                  <Text
                    style={[styles.badgeText, { color: expiring ? colors.warning : meta.color }]}
                    numberOfLines={1}
                  >
                    {expiring ? t('leaseAdm.expiringDays', { n: d ?? 0 }) : statusLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="home-outline" size={13} color={colors.ink3} />
                <Text style={styles.metaText} numberOfLines={1}>{propNameOf(l)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={13} color={colors.ink3} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {t('leaseAdm.dateRange', { start: fmtDate(l.start_date), end: fmtDate(l.end_date) })}
                </Text>
              </View>

              <View style={styles.cardFoot}>
                <Text style={styles.rent}>
                  {t('leaseAdm.monthlyRent', {
                    sym: symOf(l.currency),
                    amount: Number(l.monthly_rent || 0).toLocaleString(),
                  })}
                </Text>
              </View>
            </View>
          );
        })
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
     minHeight: 44,
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
    paddingVertical: 12,
    alignItems: 'center',
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: colors.lineHeight.tight},
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
    padding: 14,
    ...colors.shadow.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  leaseNo: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
    flexShrink: 1,
  },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '700', lineHeight: colors.lineHeight.tight, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  metaText: { flex: 1, fontSize: 12, color: colors.ink2 },

  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rent: { fontSize: 14, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  detailBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.sidebarActive,
  },
  detailText: { fontSize: 12, fontWeight: '700', color: colors.primary },
});