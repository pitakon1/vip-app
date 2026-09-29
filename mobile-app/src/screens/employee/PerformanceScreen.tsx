import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, FlatList, TouchableOpacity } from 'react-native';
import dayjs from 'dayjs';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { useI18n } from '@/i18n';
import { useAuthStore } from '@/stores/auth';

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
  year_total?: number;
  month_total?: number;
  commission_total?: number;
  month_commission?: number;
  deals_total?: number;
  month_deals?: number;
  new_rentals?: number;
  renewals?: number;
  management?: number;
  currency?: string;
  breakdown?: { deal_type?: string; count?: number; revenue?: number }[];
}

interface MonthlyItem {
  year?: number;
  month?: number;
  revenue?: number;
  commission?: number;
  deals?: number;
}

interface AgentRow {
  employee_id?: string;
  employee_name?: string | null;
  total_commission?: number | null;
  total_revenue?: number | null;
  deals?: number;
}

interface PartnerRow {
  partner_id?: string;
  partner_name?: string | null;
  total_commission?: number | null;
  total_revenue?: number | null;
  deals?: number;
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

type ViewKey = 'mine' | 'agents' | 'partners';

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
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  // 合作公司分佣汇总（/performance/partners）仅管理员/合作公司管理员可见
  const canViewPartners = user?.role === 'admin' || user?.role === 'partner_admin';

  const [view, setView] = useState<ViewKey>('mine');
  const [leaderboard, setLeaderboard] = useState<RankItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyItem[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [me, setMe] = useState<MyEmployee | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [leaseMap, setLeaseMap] = useState<Record<string, LeaseRow>>({});
  const [propertyMap, setPropertyMap] = useState<Record<string, PropertyRow>>({});
  const [monthViewings, setMonthViewings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [lbRes, pfRes, meRes, leasesRes, propsRes, viewRes, agRes, ptRes] =
      await Promise.allSettled([
        employeesApi.leaderboard(),
        performanceApi.mine(),
        employeesApi.mine(),
        leasesApi.list({ page: 1, page_size: 100 }),
        propertiesApi.list({ page: 1, page_size: 100 }),
        viewingsApi.list({ page: 1, page_size: 100 }),
        performanceApi.agents(),
        canViewPartners ? performanceApi.partners() : Promise.resolve({} as any),
      ]);

    const pickItems = (res: PromiseSettledResult<any>): any[] => {
      if (res.status !== 'fulfilled') return [];
      const d = res.value?.data;
      return Array.isArray(d) ? d : (d?.items ?? []);
    };

    setLeaderboard(pickItems(lbRes) as RankItem[]);

    if (pfRes.status === 'fulfilled') {
      const pf = pfRes.value.data as { summary?: Summary; monthly?: MonthlyItem[] };
      setSummary(pf?.summary ?? null);
      setMonthly(Array.isArray(pf?.monthly) ? pf!.monthly! : []);
    }

    const employee = meRes.status === 'fulfilled' ? (meRes.value.data as MyEmployee) : null;
    setMe(employee ?? null);

    setAgents(pickItems(agRes) as AgentRow[]);
    if (canViewPartners) setPartners(pickItems(ptRes) as PartnerRow[]);

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
  }, [canViewPartners]);

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
        <LoadingState label={t('perf.loading')} />
      </View>
    );
  }

  const periodLabel = summary?.year
    ? `${summary.year}年${summary.month}月`
    : dayjs().format('YYYY年M月');

  // 年度汇总
  const yearRevenue = summary?.year_total ?? 0;
  const yearCommission = summary?.commission_total ?? 0;
  const yearDeals = summary?.deals_total ?? 0;
  const breakdown = [
    { key: 'new_rental', count: summary?.new_rentals },
    { key: 'renewal', count: summary?.renewals },
    { key: 'management', count: summary?.management },
  ].filter((b) => b.count != null && b.count! > 0);

  // 月度趋势（revenue 归一化高度）
  const trendMax = Math.max(1, ...monthly.map((m) => Number(m.revenue ?? 0)));
  const BAR_MAX_H = 84;

  const renderYearSummary = () => (
    <View style={styles.yearCard}>
      <View style={styles.sectionHeadInline}>
        <Ionicons name="trending-up" size={18} color={colors.primary} />
        <Text style={styles.yearTitle}>{t('perf.yearSection')}</Text>
      </View>
      <View style={styles.yearStats}>
        <View style={styles.yearStat}>
          <Text style={styles.yearStatLabel}>{t('perf.yearRevenue')}</Text>
          <Text style={styles.yearStatValue}>{fmtMoney(yearRevenue, summary?.currency)}</Text>
        </View>
        <View style={styles.yearStat}>
          <Text style={styles.yearStatLabel}>{t('perf.yearCommission')}</Text>
          <Text style={styles.yearStatValue}>{fmtMoney(yearCommission, summary?.currency)}</Text>
        </View>
        <View style={styles.yearStat}>
          <Text style={styles.yearStatLabel}>{t('perf.yearDeals')}</Text>
          <Text style={styles.yearStatValue}>{yearDeals}<Text style={styles.heroStatUnit}> 单</Text></Text>
        </View>
      </View>
      {breakdown.length > 0 && (
        <View style={styles.breakdownRow}>
          {breakdown.map((b) => (
            <View key={b.key} style={styles.breakdownChip}>
              <Text style={styles.breakdownChipText}>
                {DEAL_LABELS[b.key] ?? b.key} {b.count}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderMonthTrend = () => {
    if (monthly.length === 0) return null;
    return (
      <View style={styles.trendCard}>
        <Text style={styles.sectionTitleInline}>{t('perf.monthTrend')}</Text>
        <View style={styles.trendRow}>
          {monthly.map((m) => {
            const val = Number(m.revenue ?? 0);
            const h = Math.max(4, (val / trendMax) * BAR_MAX_H);
            const active = m.year === dayjs().year() && m.month === dayjs().month() + 1;
            return (
              <View key={`${m.year}-${m.month}`} style={styles.trendCol}>
                <View style={styles.trendBarTrack}>
                  <View
                    style={[
                      styles.trendBar,
                      { height: h },
                      active && styles.trendBarActive,
                    ]}
                  />
                </View>
                <Text style={styles.trendMonth} numberOfLines={1}>
                  {t('perf.monthLabel', { m: m.month ?? 0 })}
                </Text>
                <Text style={styles.trendDeals} numberOfLines={1}>{m.deals ?? 0}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const segBtn = (key: ViewKey, label: string, hidden = false) => {
    if (hidden) return null;
    const active = view === key;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.segBtn, active && styles.segBtnActive]}
        activeOpacity={0.8}
        onPress={() => setView(key)}
      >
        <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderMine = () => (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {renderYearSummary()}

      {/* 本月业绩总览 */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>{t('perf.monthPerf')}</Text>
        <Text style={styles.heroSub}>
          {periodLabel}
          {me?.position ? ` · ${me.position}` : ''}
          {me?.department ? ` · ${me.department}` : ''}
        </Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>{t('perf.monthDeals')}</Text>
            <Text style={styles.heroStatValue}>
              {summary?.month_deals ?? 0}
              <Text style={styles.heroStatUnit}> 单</Text>
            </Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>{t('perf.monthViewings')}</Text>
            <Text style={styles.heroStatValue}>
              {monthViewings}
              <Text style={styles.heroStatUnit}> 次</Text>
            </Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>{t('perf.monthPerf')}</Text>
            <Text style={styles.heroStatValue}>{fmtMoney(summary?.month_total)}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>{t('perf.myRank')}</Text>
            <Text style={styles.heroStatValue}>
              {myRank > 0 ? myRank : '—'}
              <Text style={styles.heroStatUnit}>/{rankTotal || '—'}</Text>
            </Text>
          </View>
        </View>
      </View>

      {renderMonthTrend()}

      {/* 佣金明细 */}
      <Text style={styles.sectionTitle}>{t('perf.commissionDetail')}</Text>
      {detailRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <EmptyState
            icon="receipt-outline"
            title={t('perf.noCommissions')}
            sub={t('perf.noCommissionsDesc')}
          />
        </View>
      ) : (
        detailRows.map((s) => renderSettlement(s))
      )}

      {/* 本月佣金合计 */}
      <View style={styles.totalCard}>
        <View style={styles.totalLeft}>
          <Text style={styles.totalLabel}>{t('perf.total')}</Text>
          <Text style={styles.totalSub}>
            {t('perf.stPaid')} {fmtMoney(settledAmount)} · {t('perf.stPending')}{' '}
            {fmtMoney(pendingAmount)}
          </Text>
        </View>
        <Text style={styles.totalAmount}>{fmtMoney(summary?.month_commission)}</Text>
      </View>
    </ScrollView>
  );

  const renderAgentRow = (a: AgentRow) => (
    <View key={a.employee_id ?? a.employee_name} style={styles.listCard}>
      <View style={styles.listHead}>
        <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.listName} numberOfLines={1}>{a.employee_name || '-'}</Text>
      </View>
      <View style={styles.listStats}>
        <View style={styles.listStat}>
          <Text style={styles.listStatLabel}>{t('perf.agentRevenue')}</Text>
          <Text style={styles.listStatValue}>{fmtMoney(a.total_revenue ?? 0)}</Text>
        </View>
        <View style={styles.listStat}>
          <Text style={styles.listStatLabel}>{t('perf.agentCommission')}</Text>
          <Text style={styles.listStatValue}>{fmtMoney(a.total_commission ?? 0)}</Text>
        </View>
        <View style={styles.listStat}>
          <Text style={styles.listStatLabel}>{t('perf.agentDeals')}</Text>
          <Text style={styles.listStatValue}>{Number(a.deals ?? 0)}</Text>
        </View>
      </View>
    </View>
  );

  const renderPartnerRow = (p: PartnerRow) => (
    <View key={p.partner_id ?? p.partner_name} style={styles.listCard}>
      <View style={styles.listHead}>
        <Ionicons name="business-outline" size={20} color={colors.primary} />
        <Text style={styles.listName} numberOfLines={1}>{p.partner_name || '-'}</Text>
      </View>
      <View style={styles.listStats}>
        <View style={styles.listStat}>
          <Text style={styles.listStatLabel}>{t('perf.partnerRevenue')}</Text>
          <Text style={styles.listStatValue}>{fmtMoney(p.total_revenue ?? 0)}</Text>
        </View>
        <View style={styles.listStat}>
          <Text style={styles.listStatLabel}>{t('perf.partnerCommission')}</Text>
          <Text style={styles.listStatValue}>{fmtMoney(p.total_commission ?? 0)}</Text>
        </View>
        <View style={styles.listStat}>
          <Text style={styles.listStatLabel}>{t('perf.agentDeals')}</Text>
          <Text style={styles.listStatValue}>{Number(p.deals ?? 0)}</Text>
        </View>
      </View>
    </View>
  );

  const renderAgents = () => (
    <FlatList
      data={agents}
      keyExtractor={(a) => a.employee_id ?? a.employee_name ?? String(Math.random())}
      renderItem={({ item }) => renderAgentRow(item)}
      contentContainerStyle={styles.listContent}
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.emptyCard}>
          <EmptyState icon="people-outline" title={t('perf.noAgents')} sub={t('perf.noAgentsDesc')} />
        </View>
      }
    />
  );

  const renderPartners = () => (
    <FlatList
      data={partners}
      keyExtractor={(p) => p.partner_id ?? p.partner_name ?? String(Math.random())}
      renderItem={({ item }) => renderPartnerRow(item)}
      contentContainerStyle={styles.listContent}
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.emptyCard}>
          <EmptyState icon="business-outline" title={t('perf.noPartners')} sub={t('perf.noPartnersDesc')} />
        </View>
      }
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.segRow}>
        {segBtn('mine', t('perf.viewMine'))}
        {segBtn('agents', t('perf.agentsView'))}
        {segBtn('partners', t('perf.partnersView'), !canViewPartners)}
      </View>
      <View style={styles.body}>
        {view === 'mine' ? renderMine() : view === 'agents' ? renderAgents() : renderPartners()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1 },

  /* 顶部 Tab 切换 */
  segRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: colors.spacing.md,
    paddingTop: colors.spacing.md,
    paddingBottom: 4,
  },
  segBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segBtnText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  segBtnTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  /* 年度汇总 */
  yearCard: {
    marginHorizontal: colors.spacing.md,
    marginTop: colors.spacing.md,
    padding: colors.spacing.lg,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  sectionHeadInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  yearTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  yearStats: { flexDirection: 'row', marginTop: colors.spacing.md, gap: colors.spacing.sm },
  yearStat: { flex: 1 },
  yearStatLabel: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  yearStatValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  breakdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: colors.spacing.md },
  breakdownChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha(colors.infoRgb, 0.1),
  },
  breakdownChipText: { fontSize: colors.fontSize.xs, color: colors.info, fontWeight: '600' },

  /* 月度趋势 */
  trendCard: {
    marginHorizontal: colors.spacing.md,
    marginTop: colors.spacing.md,
    padding: colors.spacing.lg,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  sectionTitleInline: { fontSize: 15, fontWeight: '700', color: colors.ink },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: colors.spacing.lg },
  trendCol: { flex: 1, alignItems: 'center' },
  trendBarTrack: {
    height: 96,
    width: 14,
    backgroundColor: colors.alpha(colors.primaryRgb ?? '37, 99, 235', 0.08),
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendBar: {
    width: '100%',
    borderRadius: 7,
    backgroundColor: colors.alpha('37, 99, 235', 0.35),
  },
  trendBarActive: { backgroundColor: colors.primary },
  trendMonth: { fontSize: 10, color: colors.ink3, marginTop: 6 },
  trendDeals: { fontSize: 10, color: colors.primary, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },

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
    marginTop: colors.spacing.sm,
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

  /* 全员 / 合作公司列表 */
  listContent: { padding: colors.spacing.md, paddingBottom: 32 },
  listCard: {
    marginBottom: colors.spacing.md,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  listStats: {
    flexDirection: 'row',
    marginTop: colors.spacing.md,
    paddingTop: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  listStat: { flex: 1 },
  listStatLabel: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  listStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
});