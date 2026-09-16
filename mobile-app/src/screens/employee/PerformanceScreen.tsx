import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import colors from '../../theme/colors';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import api from '../../lib/api';
import {
  employeesApi,
  performanceApi,
  leasesApi,
  propertiesApi,
  viewingsApi,
} from '../../services/api';

interface RankItem {
  id: string;
  full_name?: string | null;
  department?: string | null;
  position?: string | null;
  performance: number;
  deals: number;
  is_self?: boolean;
}

interface Summary {
  year?: number;
  month?: number;
  month_deals: number;
  month_total: number;
  month_commission: number;
  commission_total: number;
  deals_total: number;
}

interface MyEmployee {
  id?: string;
  position?: string | null;
  department?: string | null;
}

interface Settlement {
  id: string;
  lease_id?: string | null;
  deal_type?: string | null;
  commission_base?: number;
  commission_rate?: number;
  commission_amount?: number;
  currency?: string;
  status?: string | null;
  created_at?: string | null;
  settled_at?: string | null;
}

interface LeaseRow {
  id: string;
  property_id?: string;
  monthly_rent?: number;
  currency?: string;
}

interface PropertyRow {
  id: string;
  room_number?: string | null;
  address?: string | null;
}

const DEAL_LABELS: Record<string, string> = {
  new_rental: '新租成交',
  renewal: '续约成交',
  management: '托管服务',
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: {
    label: '待结算',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
  approved: { label: '已审批', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.12) },
  paid: {
    label: '已结算',
    color: colors.success,
    bg: colors.alpha(colors.successRgb, 0.12),
  },
};

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');
const fmtMoney = (v: number | undefined, c = 'THB') =>
  `${symOf(c)}${Number(v || 0).toLocaleString()}`;

// 费率口径：rate>1 视为百分比（如 5 = 5%），否则视为月租倍数（兼容默认 1.0）
const rateLabel = (rate?: number) => {
  if (rate == null) return '佣金';
  return rate > 1 ? `佣金 (${rate}%)` : `佣金 (${rate} 个月租金)`;
};

export default function PerformanceScreen() {
  const [leaderboard, setLeaderboard] = useState<RankItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [me, setMe] = useState<MyEmployee | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [leaseMap, setLeaseMap] = useState<Record<string, LeaseRow>>({});
  const [propertyMap, setPropertyMap] = useState<Record<string, PropertyRow>>({});
  const [monthViewings, setMonthViewings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [lbRes, pfRes, meRes, leasesRes, propsRes, viewRes] = await Promise.allSettled([
      employeesApi.leaderboard(),
      performanceApi.mine(),
      employeesApi.mine(),
      leasesApi.list({ page: 1, page_size: 100 }),
      propertiesApi.list({ page: 1, page_size: 100 }),
      viewingsApi.list({ page: 1, page_size: 100 }),
    ]);

    const pickItems = (res: PromiseSettledResult<any>): any[] => {
      if (res.status !== 'fulfilled') return [];
      const d = res.value?.data;
      return Array.isArray(d) ? d : (d?.items ?? []);
    };

    setLeaderboard(pickItems(lbRes) as RankItem[]);

    if (pfRes.status === 'fulfilled') {
      const pf = pfRes.value.data as { summary?: Summary };
      setSummary(pf?.summary ?? null);
    }

    const employee = meRes.status === 'fulfilled' ? (meRes.value.data as MyEmployee) : null;
    setMe(employee ?? null);

    const leases = pickItems(leasesRes) as LeaseRow[];
    setLeaseMap(
      leases.reduce<Record<string, LeaseRow>>((acc, l) => {
        acc[l.id] = l;
        return acc;
      }, {}),
    );
    const props = pickItems(propsRes) as PropertyRow[];
    setPropertyMap(
      props.reduce<Record<string, PropertyRow>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {}),
    );

    const viewings = pickItems(viewRes) as { scheduled_at?: string | null }[];
    setMonthViewings(
      viewings.filter(
        (v) => v.scheduled_at && dayjs(v.scheduled_at).isSame(dayjs(), 'month'),
      ).length,
    );

    // 佣金结算明细（按员工维度，后端已有端点）
    if (employee?.id) {
      try {
        const r = await api.get(`/employees/${employee.id}/performance`);
        setSettlements(Array.isArray(r.data) ? (r.data as Settlement[]) : []);
      } catch {
        setSettlements([]);
      }
    } else {
      setSettlements([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const myRankIndex = leaderboard.findIndex((r) => r.is_self);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : 0;
  const rankTotal = leaderboard.length;

  const monthSettlements = useMemo(
    () => settlements.filter((s) => s.created_at && dayjs(s.created_at).isSame(dayjs(), 'month')),
    [settlements],
  );
  // 明细优先展示本月，本月无记录时回落到最近记录，避免空白
  const detailRows = useMemo(
    () => (monthSettlements.length > 0 ? monthSettlements : settlements).slice(0, 10),
    [monthSettlements, settlements],
  );

  const settledAmount = useMemo(
    () =>
      monthSettlements
        .filter((s) => s.status === 'paid')
        .reduce((sum, s) => sum + (s.commission_amount || 0), 0),
    [monthSettlements],
  );
  const pendingAmount = useMemo(
    () =>
      monthSettlements
        .filter((s) => s.status !== 'paid')
        .reduce((sum, s) => sum + (s.commission_amount || 0), 0),
    [monthSettlements],
  );

  const titleOf = (s: Settlement) => {
    const lease = s.lease_id ? leaseMap[s.lease_id] : undefined;
    const property = lease?.property_id ? propertyMap[lease.property_id] : undefined;
    if (!property) return '租赁成交';
    return [property.room_number, property.address].filter(Boolean).join(' · ') || '房源';
  };

  const renderSettlement = (s: Settlement) => {
    const meta = STATUS_META[s.status ?? 'pending'] ?? STATUS_META.pending;
    const lease = s.lease_id ? leaseMap[s.lease_id] : undefined;
    const sub = [
      DEAL_LABELS[s.deal_type ?? ''] ?? s.deal_type ?? '成交',
      lease ? `月租 ${fmtMoney(lease.monthly_rent, lease.currency || s.currency || 'THB')}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <View key={s.id} style={styles.detailCard}>
        <View style={styles.detailTop}>
          <View style={styles.detailInfo}>
            <Text style={styles.detailName} numberOfLines={1}>
              {titleOf(s)}
            </Text>
            <Text style={styles.detailSub} numberOfLines={1}>
              {sub}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.detailFooter}>
          <Text style={styles.detailFooterLabel}>{rateLabel(s.commission_rate)}</Text>
          <Text style={styles.detailAmount}>
            {fmtMoney(s.commission_amount, s.currency || 'THB')}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载业绩…" />
      </View>
    );
  }

  const periodLabel = summary?.year
    ? `${summary.year}年${summary.month}月`
    : dayjs().format('YYYY年M月');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* 本月业绩总览 */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>本月业绩</Text>
        <Text style={styles.heroSub}>
          {periodLabel}
          {me?.position ? ` · ${me.position}` : ''}
          {me?.department ? ` · ${me.department}` : ''}
        </Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>本月签约</Text>
            <Text style={styles.heroStatValue}>
              {summary?.month_deals ?? 0}
              <Text style={styles.heroStatUnit}> 单</Text>
            </Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>带看</Text>
            <Text style={styles.heroStatValue}>
              {monthViewings}
              <Text style={styles.heroStatUnit}> 次</Text>
            </Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>业绩</Text>
            <Text style={styles.heroStatValue}>{fmtMoney(summary?.month_total)}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>排名</Text>
            <Text style={styles.heroStatValue}>
              {myRank > 0 ? myRank : '—'}
              <Text style={styles.heroStatUnit}>/{rankTotal || '—'}</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* 佣金明细 */}
      <Text style={styles.sectionTitle}>佣金明细</Text>
      {detailRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <EmptyState
            icon="receipt-outline"
            title="暂无佣金记录"
            sub="签约或续约成交后，系统会自动生成佣金结算明细"
          />
        </View>
      ) : (
        detailRows.map((s) => renderSettlement(s))
      )}

      {/* 本月佣金合计 */}
      <View style={styles.totalCard}>
        <View style={styles.totalLeft}>
          <Text style={styles.totalLabel}>本月佣金合计</Text>
          <Text style={styles.totalSub}>
            已结算 {fmtMoney(settledAmount)} · 待结算 {fmtMoney(pendingAmount)}
          </Text>
        </View>
        <Text style={styles.totalAmount}>{fmtMoney(summary?.month_commission)}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },

  /* 本月业绩总览 */
  heroCard: {
    marginHorizontal: colors.spacing.md,
    marginTop: colors.spacing.md,
    padding: colors.spacing.xl,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  heroTitle: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.primaryForeground },
  heroSub: {
    fontSize: 12,
    color: colors.alpha('255, 255, 255', 0.8),
    marginTop: 4,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: colors.spacing.md,
    marginTop: colors.spacing.xl,
    paddingTop: colors.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.alpha('255, 255, 255', 0.25),
  },
  heroStat: { flexGrow: 1, flexBasis: '42%' },
  heroStatLabel: { fontSize: colors.fontSize.xs, color: colors.alpha('255, 255, 255', 0.7) },
  heroStatValue: {
    fontSize: colors.fontSize.xl,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  heroStatUnit: { fontSize: 13, fontWeight: '500', color: colors.alpha('255, 255, 255', 0.85) },

  sectionTitle: {
    fontSize: colors.fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.xxl,
    marginBottom: colors.spacing.md,
  },

  /* 佣金明细 */
  detailCard: {
    marginHorizontal: colors.spacing.md,
    marginBottom: colors.spacing.md,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  detailTop: { flexDirection: 'row', alignItems: 'flex-start' },
  detailInfo: { flex: 1, marginRight: colors.spacing.sm },
  detailName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  detailSub: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  badge: { borderRadius: colors.radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  detailFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: colors.spacing.md,
    paddingTop: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailFooterLabel: { fontSize: 13, color: colors.ink3 },
  detailAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  emptyCard: {
    marginHorizontal: colors.spacing.md,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  /* 本月佣金合计 */
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: colors.spacing.md,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  totalLeft: { flex: 1, marginRight: colors.spacing.md },
  totalLabel: { fontSize: 13, color: colors.ink3 },
  totalSub: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  totalAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
});