import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import BarChart from '@/components/charts/BarChart';
import { ownerApi, ownersApi } from '@/services/api';
import { fmtMoney } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';

type IoniconName = keyof typeof Ionicons.glyphMap;
type IncomeStatus = 'received' | 'pending' | 'overdue';

interface IncomeRecord {
  id: string;
  property?: string | null;
  month: string;
  amount: number;
  status: IncomeStatus;
}

interface IncomeSummary {
  total_income?: number;
  receivable_total?: number;
  overdue_total?: number;
  currency?: string;
  records?: IncomeRecord[];
}

interface AnnualMonthly {
  month?: string | number;
  received?: number;
  pending?: number;
  overdue?: number;
  count?: number;
}

interface AnnualSummary {
  by_month?: AnnualMonthly[];
  totals?: { received?: number; pending?: number; overdue?: number; count?: number };
}

const statusMap: Record<IncomeStatus, { label: string; color: string; bg: string; icon: IoniconName }> = {
  received: { label: '已到账', color: colors.success, bg: colors.alpha(colors.successRgb, 0.1), icon: 'cash-outline' },
  pending: { label: '待收', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1), icon: 'time-outline' },
  overdue: { label: '逾期', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1), icon: 'alert-circle-outline' },
};

// 把月度字段转成 "N月"
const monthLabel = (m?: string | number) => {
  const nums = String(m ?? '').match(/\d+/g);
  const last = nums && nums.length ? nums[nums.length - 1] : '';
  return last ? `${last}月` : '-';
};

const FILTERS: { key: 'all' | IncomeStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'received', label: '已到账' },
  { key: 'pending', label: '待收' },
  { key: 'overdue', label: '逾期' },
];

interface IncomePayload {
  summary: IncomeSummary;
  annual: AnnualSummary | null;
}

export default function IncomeScreen() {
  const user = useAuthStore((s) => s.user);
  const uid = user?.id ?? 'anon';
  const year = new Date().getFullYear();
  const [filter, setFilter] = useState<'all' | IncomeStatus>('all');

  const q = useCachedQuery<IncomePayload>({
    queryKey: ['owner-income', uid, String(year)],
    cacheKey: `owner-income:${uid}:${year}`,
    queryFn: async () => {
      const [incomeRes, annualRes] = await Promise.allSettled([
        ownerApi.income(),
        ownersApi.annualSummary(year),
      ]);
      const data = incomeRes.status === 'fulfilled' ? (incomeRes.value?.data as any) : null;
      return {
        summary: {
          total_income: data?.total_income,
          receivable_total: data?.receivable_total,
          overdue_total: data?.overdue_total,
          currency: data?.currency ?? 'THB',
          records: Array.isArray(data?.records) ? data.records : [],
        },
        annual:
          annualRes.status === 'fulfilled'
            ? ((annualRes.value?.data as AnnualSummary) ?? null)
            : null,
      };
    },
  });

  const summary = q.data?.summary ?? {};
  const annual = q.data?.annual ?? null;
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const onRefresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  const ccy = summary.currency;
  const fmt = (v?: number) => fmtMoney(v, ccy);
  const records = summary.records ?? [];

  /* ===== 月度趋势：真实 by_month 数据 ===== */
  const months = annual?.by_month ?? [];
  const trendData = useMemo(
    () =>
      months.slice(-6).map((m) => ({
        label: monthLabel(m.month),
        value: Number(m.received ?? 0),
      })),
    [months],
  );

  /* ===== Hero 口径 ===== */
  const currentBucket = months.length ? months[months.length - 1] : null;
  const prevBucket = months.length > 1 ? months[months.length - 2] : null;
  const monthIncome = Number(currentBucket?.received ?? 0);
  const prevIncome = Number(prevBucket?.received ?? 0);
  const momPct = prevIncome > 0 ? Math.round(((monthIncome - prevIncome) / prevIncome) * 100) : null;

  const yearTotal = Number(annual?.totals?.received ?? summary.total_income ?? 0);
  const dueTotal =
    Number(annual?.totals?.pending ?? summary.receivable_total ?? 0) +
    Number(annual?.totals?.overdue ?? summary.overdue_total ?? 0);

  const filtered = useMemo(
    () => (filter === 'all' ? records : records.filter((r) => r.status === filter)),
    [records, filter],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载收益…" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ===== Hero：本月收入 / 年累计 / 待收 ===== */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>本月收入</Text>
            <Text style={styles.heroAmount}>{fmt(monthIncome)}</Text>
          </View>
          {momPct != null && (
            <View style={styles.heroTrend}>
              <Ionicons
                name={momPct >= 0 ? 'trending-up' : 'trending-down'}
                size={13}
                color={colors.primaryForeground}
              />
              <Text style={styles.heroTrendText}>
                环比 {momPct > 0 ? '+' : ''}
                {momPct}%
              </Text>
            </View>
          )}
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatLabel}>年累计收入</Text>
            <Text style={styles.heroStatVal}>{fmt(yearTotal)}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatLabel}>待收金额</Text>
            <Text style={styles.heroStatVal}>{fmt(dueTotal)}</Text>
          </View>
        </View>
      </View>

      {/* ===== 月度收入趋势 ===== */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>月度收入趋势</Text>
        <Text style={styles.sectionHint}>近 6 个月</Text>
      </View>
      <View style={styles.card}>
        {trendData.length > 0 ? (
          <BarChart data={trendData} height={150} activeIndex={trendData.length - 1} />
        ) : (
          <EmptyState icon="bar-chart-outline" title="暂无月度数据" sub="产生租金流水后这里会展示逐月趋势" />
        )}
      </View>

      {/* ===== 筛选 chips ===== */}
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.8}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ===== 收入明细 ===== */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>收入明细</Text>
        <Text style={styles.sectionHint}>{filtered.length} 笔</Text>
      </View>
      <View style={styles.card}>
        {filtered.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="暂无收入明细"
            sub="租金到账后这里会按时间列出每一笔收款"
          />
        ) : (
          filtered.map((item, idx) => {
            const st = statusMap[item.status] ?? statusMap.pending;
            return (
              <View
                key={item.id}
                style={[styles.recordRow, idx === filtered.length - 1 && styles.recordRowLast]}
              >
                <View style={[styles.recordIcon, { backgroundColor: st.bg }]}>
                  <Ionicons name={st.icon} size={18} color={st.color} />
                </View>
                <View style={styles.recordBody}>
                  <Text style={styles.recordTitle} numberOfLines={1}>
                    {item.property || '租金收入'}
                  </Text>
                  <Text style={styles.recordSub} numberOfLines={1}>{item.month}</Text>
                </View>
                <View style={styles.recordRight}>
                  <Text style={[styles.recordAmount, { color: st.color }]}>{fmt(item.amount)}</Text>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  /* Hero */
  heroCard: {
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.md,
    padding: colors.spacing.xl,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { fontSize: colors.fontSize.base, color: colors.alpha('255, 255, 255', 0.75), fontWeight: '500' },
  heroAmount: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.primaryForeground,
    marginTop: 6,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  heroTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.alpha('255, 255, 255', 0.18),
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: colors.radius.full,
  },
  heroTrendText: { fontSize: colors.fontSize.base, color: colors.primaryForeground, fontWeight: '600' },
  heroStats: {
    flexDirection: 'row',
    marginTop: colors.spacing.lg,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.alpha('255, 255, 255', 0.2),
  },
  heroStatItem: { flex: 1, gap: 3 },
  heroStatLabel: { fontSize: colors.fontSize.sm, color: colors.alpha('255, 255, 255', 0.7) },
  heroStatVal: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryForeground,
    fontVariant: ['tabular-nums'],
  },
  heroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.alpha('255, 255, 255', 0.2), marginHorizontal: 12 },

  /* 区块标题 */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.xl,
    marginTop: colors.spacing.xl,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },

  /* 卡片 */
  card: {
    marginHorizontal: colors.spacing.lg,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },

  /* chips */
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.xl,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.base, fontWeight: '500', color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  /* 明细行 */
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  recordRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  recordIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBody: { flex: 1, minWidth: 0 },
  recordTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  recordSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  recordRight: { alignItems: 'flex-end', gap: 3 },
  recordAmount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: colors.radius.full },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
});