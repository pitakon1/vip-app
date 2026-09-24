/**
 * 管理员工作台：运营概览 / 财务对账
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { useResponsive, useResponsiveContainerStyle } from '@/theme/responsive';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import BarChart from '@/components/charts/BarChart';
import { dashboardApi, employeesApi } from '@/services/api';
import api from '@/lib/api';

type Tab = 'overview';

interface ReconRow {
  property?: string | null;
  received: number;
  receivable: number;
  overdue: number;
  count: number;
}

interface TrendRow {
  month: string;
  revenue: number;
  leases_new?: number;
  leads_new?: number;
  viewings_new?: number;
}

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const fmtMoney = (v?: number, c?: string) => `${cur(c)}${Number(v ?? 0).toLocaleString()}`;

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: '运营概览', icon: 'grid-outline' },
];

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function AdminHomeScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const respContainer = useResponsiveContainerStyle();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [summary, setSummary] = useState<any>({});
  const [expiring, setExpiring] = useState<any[]>([]);
  const [totals, setTotals] = useState<{ received?: number; receivable?: number; overdue?: number }>({});
  const [byProperty, setByProperty] = useState<ReconRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  // 最近动态（取最近 4 笔付款记录）+ 员工规模（用于经营指标）
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const loadTab = useCallback(async (target: Tab) => {
    setLoading(true);
    try {
      if (target === 'overview') {
        const [sumRes, expRes, trendRes, reconRes, recentRes, staffRes]: any[] = await Promise.all([
          dashboardApi.summary().catch(() => ({ data: {} })),
          dashboardApi.expiringLeases().catch(() => ({ data: { items: [] } })),
          dashboardApi.trend({ months: 12 }).catch(() => ({ data: { series: [] } })),
          dashboardApi.financialReconciliation().catch(() => ({ data: { totals: {}, by_property: [] } })),
          api.get('/dashboard/recent-payments').catch(() => null),
          employeesApi.list({ page: 1, page_size: 100 }).catch(() => null),
        ]);
        setSummary(sumRes?.data ?? {});
        setExpiring((expRes?.data ?? {}).items ?? []);
        const trendD = trendRes?.data ?? {};
        const trendRows = Array.isArray(trendD.series) ? trendD.series : [];
        setTrend(trendRows);
        const reconD = reconRes?.data ?? {};
        setTotals((reconD.totals ?? {}) as { received?: number; receivable?: number; overdue?: number });
        setByProperty(reconD.by_property ?? []);
        const recentItems = recentRes?.data?.items;
        setRecentPayments(Array.isArray(recentItems) ? recentItems.slice(0, 4) : []);
        const staffD = staffRes?.data ?? {};
        setStaff(((staffD.items ?? staffD ?? []) as any[]).slice(0, 100));
      }
    } catch (e) {
      setLoading(false);
      setRefreshing(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTab('overview');
    }, [loadTab]),
  );

  const switchTab = (t: Tab) => {
    setTab(t);
    if (!dataLoaded()) loadTab(t);
  };

  const dataLoaded = () => {
    return Object.keys(summary).length > 0;
  };

  const reload = async () => {
    setRefreshing(true);
    await loadTab(tab);
  };

  // 近 7 个月营收（用于概览收入趋势图，对齐原型「近 7 月收入」）
  const revenueTrend = trend.slice(-7).map((row) => ({
    label: t('common.monthN', { n: Number(row.month?.slice(5)) }),
    value: row.revenue ?? 0,
  }));

  /* ===== 风险预警 / 待办汇总（全部由真实接口数据推导） ===== */
  const ratio = (n: number, d: number) => (d > 0 ? Math.max(0, Math.min(n / d, 1)) : 0);
  const num = (v: any) => Number(v ?? 0);
  const expiringCount = num(summary.expiring_leases ?? expiring.length);
  const vacant = num(summary.vacant);
  const totalProps = num(summary.total_properties);
  const vacantRate = totalProps > 0 ? Math.round((vacant / totalProps) * 100) : 0;
  const overdue = num(totals.overdue);
  const totalBilling = num(totals.received) + num(totals.receivable) + overdue;
  const reconDiff = byProperty.filter((r) => num(r.overdue) > 0).length;
  const hasRisk = expiringCount > 0 || overdue > 0 || vacant > 0;

  const risks = [
    {
      key: 'overdue',
      tone: colors.error,
      toneRgb: colors.errorRgb,
      icon: 'cash-outline' as IoniconName,
      title: '欠租与逾期',
      value: fmtMoney(overdue),
      unit: '',
      desc: `逾期占比 ${Math.round(ratio(overdue, totalBilling) * 100)}% · 待收款 ${num(summary.upcoming_payments)} 笔`,
      bar: ratio(overdue, totalBilling),
      onPress: () => navigation.navigate('AdminPayments'),
    },
    {
      key: 'vacancy',
      tone: colors.info,
      toneRgb: colors.infoRgb,
      icon: 'bar-chart-outline' as IoniconName,
      title: '空置率',
      value: `${vacantRate}`,
      unit: ' %',
      desc: `空置 ${vacant} 套 / 共 ${totalProps} 套 · 警戒线 10%`,
      bar: ratio(vacant, totalProps),
      onPress: () => navigation.navigate('AdminProperties'),
    },
  ];

  /* ===== 经营指标（4 项，徽标全部由真实数据推导） ===== */
  const lastTwo = trend.slice(-2);
  const momRevenue =
    lastTwo.length === 2 && num(lastTwo[0].revenue) > 0
      ? ((num(lastTwo[1].revenue) - num(lastTwo[0].revenue)) / num(lastTwo[0].revenue)) * 100
      : null;
  const newLeasesThisMonth = num(trend[trend.length - 1]?.leases_new);
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const newHiresThisMonth = staff.filter((e) => String(e.hire_date ?? '').startsWith(monthPrefix)).length;

  const statCards = [
    {
      key: 'revenue',
      label: '本月营收',
      value: fmtMoney(summary.monthly_revenue),
      badge: momRevenue === null ? '' : `${momRevenue >= 0 ? '+' : ''}${momRevenue.toFixed(1)}%`,
      tone: momRevenue !== null && momRevenue < 0 ? colors.error : colors.success,
    },
    {
      key: 'occupancy',
      label: '出租率',
      value: `${num(summary.occupancy_rate)}%`,
      badge: `空置 ${vacant} 套`,
      tone: colors.warning,
    },
    {
      key: 'leases',
      label: '在租合同',
      value: `${num(summary.rented)}`,
      badge: `+${newLeasesThisMonth} 本月`,
      tone: colors.success,
    },
    {
      key: 'staff',
      label: '员工数',
      value: `${staff.length}`,
      badge: `+${newHiresThisMonth} 本月`,
      tone: colors.success,
    },
  ];

  return (
    <View style={styles.container}>
      {/* 顶部欢迎区 */}
      <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroTitle}>管理员首页</Text>
          <Text style={styles.heroSub}>系统管理权限 · 全局数据概览</Text>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="shield" size={14} color="#fff" />
          <Text style={styles.heroBadgeText}>ADMIN</Text>
        </View>
      </View>

      {/* Tab 导航 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => switchTab(t.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={t.icon}
              size={18}
              color={tab === t.key ? '#fff' : colors.ink2}
            />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, respContainer]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reload}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.loadingWrap}>
            <LoadingState />
          </View>
        )}

        {/* ===== 运营概览 ===== */}
        {tab === 'overview' && (
          <View>
            {/* 风险预警（置顶 · 数字 + 占比可视化条并存；无风险数据不渲染） */}
            {hasRisk && (
              <View style={styles.riskList}>
                {risks.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={styles.riskItem}
                    activeOpacity={0.75}
                    onPress={r.onPress}
                  >
                    <View style={[styles.riskIcon, { backgroundColor: colors.alpha(r.toneRgb, 0.12) }]}>
                      <Ionicons name={r.icon} size={18} color={r.tone} />
                    </View>
                    <View style={styles.riskBody}>
                      <View style={styles.riskTitleRow}>
                        <Text style={styles.riskTitle} numberOfLines={1}>{r.title}</Text>
                        <Text style={[styles.riskValue, { color: r.tone }]}>
                          {r.value}
                          {!!r.unit && <Text style={styles.riskUnit}>{r.unit}</Text>}
                        </Text>
                      </View>
                      <Text style={styles.riskDesc} numberOfLines={1}>{r.desc}</Text>
                      <View style={styles.riskTrack}>
                        <View style={[styles.riskBar, { flex: Math.max(r.bar, 0.02), backgroundColor: r.tone }]} />
                        <View style={{ flex: Math.max(1 - r.bar, 0) }} />
                      </View>
                    </View>
                    <Text style={styles.riskCta}>去处理</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* 经营指标（4 项 + 徽标） */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>经营指标</Text>
              <Text style={styles.sectionHint}>实时汇总</Text>
            </View>
            <View style={styles.statRow}>
              {statCards.map((s) => (
                <View key={s.key} style={[styles.statCard, isTablet && styles.statCardWide]}>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={styles.statNum} numberOfLines={1}>{s.value}</Text>
                  {!!s.badge && (
                    <View style={[styles.statBadge, { backgroundColor: colors.alpha(s.tone === colors.error ? colors.errorRgb : s.tone === colors.warning ? colors.warningRgb : colors.successRgb, 0.12) }]}>
                      <Text style={[styles.statBadgeText, { color: s.tone }]}>{s.badge}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* 经营趋势 · 收入（近 7 个月营收） */}
            {revenueTrend.length > 0 && (
              <View style={styles.trendChartCard}>
                <View style={styles.chartHeaderRow}>
                  <View>
                    <Text style={styles.chartCardTitle}>经营趋势 · 收入</Text>
                    <Text style={styles.chartCardSub}>
                      近 7 个月营收 · 在租合同营收 {fmtMoney(summary.active_lease_revenue)}
                    </Text>
                  </View>
                  {momRevenue !== null && (
                    <View style={[styles.statBadge, { backgroundColor: colors.alpha(momRevenue < 0 ? colors.errorRgb : colors.successRgb, 0.12) }]}>
                      <Text style={[styles.statBadgeText, { color: momRevenue < 0 ? colors.error : colors.success }]}>
                        {momRevenue >= 0 ? '+' : ''}
                        {momRevenue.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>
                <BarChart
                  data={revenueTrend}
                  height={140}
                  activeIndex={revenueTrend.length - 1}
                />
              </View>
            )}

            {/* 待办汇总（数字与工单审核 / 财务对账 / 合同数据一致） */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>待办汇总</Text>
            </View>
            <View style={styles.todoRow}>
              <TouchableOpacity style={styles.todoCard} activeOpacity={0.7} onPress={() => navigation.navigate('AdminPayments')}>
                <Text style={styles.todoLabel}>对账差异</Text>
                <Text style={[styles.todoNum, { color: colors.error }]}>{reconDiff}</Text>
              </TouchableOpacity>
            </View>

            {/* 最近动态（取最近付款记录，无数据给空态） */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>最近动态</Text>
              <Text style={styles.sectionHint}>最近 4 条</Text>
            </View>
            {recentPayments.length === 0 && !loading && (
              <EmptyState icon="time-outline" title="暂无动态" sub="收款到账后这里会生成动态记录" />
            )}
            {recentPayments.map((p: any) => (
              <View key={p.id} style={styles.activityItem}>
                <View style={[styles.activityIcon, { backgroundColor: colors.alpha(colors.successRgb, 0.12) }]}>
                  <Ionicons name="cash-outline" size={16} color={colors.success} />
                </View>
                <View style={styles.activityBody}>
                  <Text style={styles.activityTitle} numberOfLines={1}>
                    {p.payer_name ? `${p.payer_name} 收款到账` : '收款到账'}
                  </Text>
                  <Text style={styles.activitySub} numberOfLines={1}>
                    {[p.description || '租金', String(p.paid_at || p.created_at || '').slice(0, 10)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Text style={styles.activityAmount}>{fmtMoney(p.amount, p.currency)}</Text>
              </View>
            ))}
          </View>
        )}

        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  /* ===== 顶部欢迎区 ===== */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  heroLeft: { flex: 1 },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroSub: { fontSize: 12, color: colors.ink3 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.lg,
    gap: 4,
    ...colors.shadow.primary,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryForeground,
    letterSpacing: 0.5,
  },

  /* ===== Tab 导航 ===== */
  tabScroll: {
    maxHeight: 72,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    paddingBottom: 12,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...colors.shadow.primary,
  },
  tabLabel: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  tabLabelActive: { color: '#fff', fontWeight: '700' },

  /* ===== 主体 ===== */
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 32 },
  loadingWrap: { paddingVertical: 32, alignItems: 'center' },

  /* ===== 核心数据卡（3列渐变） ===== */
  primaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  primaryCard: {
    flex: 1,
    borderRadius: colors.radius.xl,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.card,
  },
  cardPrimary: { backgroundColor: colors.primary },
  cardSuccess: { backgroundColor: colors.success },
  cardWarning: { backgroundColor: colors.warning },
  cardError: { backgroundColor: colors.error },
  primaryIcon: { marginBottom: 8 },
  primaryNum: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  primaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },

  /* ===== 次级数据（4列） ===== */
  miniRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  miniCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  miniNum: { fontSize: 18, fontWeight: '800', marginBottom: 3, fontVariant: ['tabular-nums'] },
  miniLabel: { fontSize: 10, color: colors.ink3, fontWeight: '500' },

  /* ===== 经营指标（手机 2×2 / 平板 4 列一行） ===== */
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  statCard: {
    flexBasis: '45%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    ...colors.shadow.sm,
  },
  statCardWide: { flexBasis: '23%' },
  statLabel: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  statNum: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    marginTop: 4,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  statBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.radius.full,
  },
  statBadgeText: { fontSize: 11, fontWeight: '700' },

  /* ===== 最近动态 ===== */
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    marginBottom: 8,
    ...colors.shadow.sm,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBody: { flex: 1, minWidth: 0 },
  activityTitle: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 3 },
  activitySub: { fontSize: 12, color: colors.ink3 },
  activityAmount: { fontSize: 14, fontWeight: '700', color: colors.success, fontVariant: ['tabular-nums'] },

  /* ===== 营收大卡 ===== */
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: colors.radius.xl,
    padding: 20,
    marginBottom: 8,
    ...colors.shadow.primary,
  },
  revenueLeft: { flex: 1 },
  revenueLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 6, fontWeight: '500' },
  revenueNum: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 4, fontVariant: ['tabular-nums'] },
  revenueSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  revenueIcon: { marginLeft: 12, opacity: 0.9 },

  /* ===== 财务对账概要卡 ===== */
  reconCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...colors.shadow.sm,
  },
  reconHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reconMore: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  reconRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  reconItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  reconDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  reconNum: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  reconLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },

  /* ===== 区块标题 ===== */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

  /* ===== 风险预警（数字 + 占比条） ===== */
  riskList: {
    marginTop: 8,
    gap: 8,
  },
  riskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 14,
    ...colors.shadow.sm,
  },
  riskIcon: {
    width: 34,
    height: 34,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskBody: { flex: 1, minWidth: 0 },
  riskTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  riskTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, flex: 1 },
  riskValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  riskUnit: { fontSize: 11, fontWeight: '600' },
  riskDesc: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  riskTrack: {
    flexDirection: 'row',
    height: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: 8,
  },
  riskBar: { height: 5, borderRadius: colors.radius.full },
  riskCta: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  /* ===== 待办汇总 ===== */
  todoRow: { flexDirection: 'row', gap: 8 },
  todoCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...colors.shadow.sm,
  },
  todoLabel: { fontSize: 13, color: colors.ink2 },
  todoNum: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },

  /* ===== 临期租约 ===== */
  expireCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  expireMain: { flex: 1, minWidth: 0 },
  expireTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  expireSub: { fontSize: 12, color: colors.ink3 },
  expireRight: { alignItems: 'flex-end', marginLeft: 12, gap: 6 },
  expireRent: { fontSize: 14, fontWeight: '700', color: colors.primary },

  /* ===== 表格 ===== */
  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableHead: { backgroundColor: colors.surface2 },
  tableRowAlt: { backgroundColor: `rgba(${colors.primaryRgb}, 0.03)` },
  cell: { flex: 1, fontSize: 12, color: colors.ink2, textAlign: 'center' },
  cellLeft: { flex: 1.4, textAlign: 'left', fontWeight: '600', color: colors.ink },
  cellError: { color: colors.error, fontWeight: '600' },

  /* ===== 趋势图表 ===== */
  trendChartCard: {
    marginTop: 6,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  chartCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  chartCardSub: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  chartLegend: { flexDirection: 'row', alignItems: 'center' },
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendDotLine: {
    width: 20,
    height: 2,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  legendText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  legendTextSm: { fontSize: 11, color: colors.ink3 },
  legendBarPair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendBar: { width: 8, height: 8, borderRadius: 2 },

  /* 双柱图 */
  dualBarWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingTop: 4,
  },
  dualBarCol: { flex: 1, alignItems: 'center', height: '100%' },
  dualBarValues: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  dualBarVal: { fontSize: 9, fontWeight: '600', color: colors.success },
  dualBarVal2: { fontSize: 9, fontWeight: '600', color: colors.warning },
  dualBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
  },
  dualBar: {
    width: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 3,
  },
  dualBarLeft: {},
  dualBarRight: {},
  dualBarLabel: { fontSize: 10, color: colors.ink3, marginTop: 6 },

  /* 趋势统计卡 */
  trendStatsGrid: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 14,
    gap: 8,
  },
  trendStatCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  trendStatLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },
  trendStatVal: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  trendStatBar: {
    height: 3,
    borderRadius: 2,
    marginTop: 10,
    width: '60%',
  },
});
