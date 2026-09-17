/**
 * 员工首页：问候行 + 今日工作台（带看时间线）+ 待跟进客户 + 业绩摘要 + 快捷操作
 * 原型：employee-mobile-dashboard.html
 * 数据源：/auth/me、/employees/me、/viewings、/leads、/performance/me、/employees/leaderboard
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import colors from '@/theme/colors';
import {
  employeesApi,
  viewingsApi,
  performanceApi,
  leadsApi,
  authApi,
} from '@/services/api';

type IoniconName = keyof typeof Ionicons.glyphMap;

// 快捷操作：只放不在底部导航(Tab)里的功能；房源浏览/业绩/客户等已在 Tab，不再重复展示
const QUICK_ACTIONS: { key: string; label: string; icon: IoniconName; route: string }[] = [
  { key: 'attendance', label: '考勤打卡', icon: 'time-outline', route: 'Attendance' },
  { key: 'manageProperties', label: '房源管理', icon: 'business-outline', route: 'EmployeeProperties' },
];

interface ViewingItem {
  id: string;
  property_id?: string;
  property_title?: string | null;
  property_address?: string | null;
  scheduled_at?: string | null;
  visitor_name?: string | null;
  status?: string | null;
}

const VIEWING_STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: '待确认', bg: colors.alpha('148, 163, 184', 0.12), color: colors.ink2 },
  confirmed: { label: '待开始', bg: colors.alpha(colors.primaryRgb, 0.12), color: colors.primary },
  completed: { label: '已完成', bg: colors.alpha(colors.successRgb, 0.12), color: colors.success },
  cancelled: { label: '已取消', bg: colors.alpha('148, 163, 184', 0.12), color: colors.ink2 },
  no_show: { label: '爽约', bg: colors.alpha(colors.errorRgb, 0.12), color: colors.error },
};

const getStatusMeta = (status?: string | null) =>
  VIEWING_STATUS_META[status ?? ''] ?? {
    label: status || '-',
    bg: colors.alpha('148, 163, 184', 0.12),
    color: colors.ink2,
  };

const toTime = (dt: Date | null) =>
  dt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '--:--';

// 客户线索阶段（后端 LeadStage 枚举）
const LEAD_STAGE_META: Record<string, { label: string; bg: string; color: string }> = {
  inquiring: { label: '咨询中', bg: colors.alpha('148, 163, 184', 0.14), color: colors.ink2 },
  viewing_scheduled: { label: '看房中', bg: colors.alpha(colors.infoRgb, 0.12), color: colors.info },
  negotiating: { label: '谈判中', bg: colors.alpha(colors.warningRgb, 0.12), color: colors.warning },
  pending_contract: { label: '待签约', bg: colors.alpha(colors.primaryRgb, 0.12), color: colors.primary },
  closed: { label: '已完成', bg: colors.alpha(colors.successRgb, 0.12), color: colors.success },
};

const getLeadStageMeta = (stage?: string | null) =>
  LEAD_STAGE_META[stage ?? ''] ?? {
    label: stage || '未分阶段',
    bg: colors.alpha('148, 163, 184', 0.12),
    color: colors.ink2,
  };

interface LeadItem {
  id: string;
  name?: string | null;
  phone?: string | null;
  stage?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_currency?: string | null;
  source?: string | null;
  created_at?: string | null;
}

interface PerfSummary {
  month_deals?: number;
  month_total?: number;
  month_commission?: number;
  commission_total?: number;
  deals_total?: number;
}

interface MonthlyRow {
  year: number;
  month: number;
  revenue: number;
  commission: number;
  deals: number;
}

interface LeaderRow {
  id: string;
  is_self?: boolean;
  performance?: number;
  deals?: number;
}

const symOf = (c?: string | null) =>
  c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿';

const greetingOf = (hour: number) => {
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [viewings, setViewings] = useState<ViewingItem[]>([]);
  const [perf, setPerf] = useState<PerfSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [profile, setProfile] = useState<{ position?: string | null; department?: string | null } | null>(
    null,
  );
  const [currency, setCurrency] = useState('THB');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [vwRes, pfRes, ldRes, lbRes, meRes, auRes, wbRes] = await Promise.allSettled([
        viewingsApi.list({ pageSize: 100 }),
        performanceApi.mine(),
        leadsApi.list({ page: 1, page_size: 5 }),
        employeesApi.leaderboard(),
        employeesApi.mine(),
        authApi.me(),
        employeesApi.workbench(),
      ]);
      if (vwRes.status === 'fulfilled') {
        const data = vwRes.value.data;
        const items = Array.isArray(data) ? data : (data as any)?.items ?? (data as any)?.data ?? [];
        setViewings(items as ViewingItem[]);
      }
      if (pfRes.status === 'fulfilled') {
        const d = (pfRes.value as any)?.data;
        setPerf(d?.summary ?? null);
        setMonthly(Array.isArray(d?.monthly) ? (d.monthly as MonthlyRow[]) : []);
      }
      if (ldRes.status === 'fulfilled') {
        const data = (ldRes.value as any)?.data;
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setLeads((items as LeadItem[]).slice(0, 5));
      }
      if (lbRes.status === 'fulfilled') {
        const data = (lbRes.value as any)?.data;
        setLeaderboard(Array.isArray(data) ? (data as LeaderRow[]) : []);
      }
      if (meRes.status === 'fulfilled') {
        const d = (meRes.value as any)?.data;
        setProfile({ position: d?.position ?? null, department: d?.department ?? null });
      }
      if (auRes.status === 'fulfilled') {
        const d = (auRes.value as any)?.data;
        setUserName(d?.full_name ?? '');
      }
      if (wbRes.status === 'fulfilled') {
        const leaseCurrency = (wbRes.value as any)?.data?.follow_up_leases?.[0]?.currency;
        if (leaseCurrency) setCurrency(leaseCurrency);
      }
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取工作台数据');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const today = useMemo(() => new Date(), []);

  // 今日带看（按时间升序）
  const todaySchedule = useMemo(() => {
    return viewings
      .map((v) => ({ ...v, dt: v.scheduled_at ? new Date(v.scheduled_at) : null }))
      .filter((v) => v.dt && !Number.isNaN(v.dt.getTime()) && isSameDay(v.dt, today))
      .sort((a, b) => a.dt!.getTime() - b.dt!.getTime());
  }, [viewings, today]);

  // 「已过 / 下一场」提示：第一条尚未开始的带看标记为下一场
  const nextIndex = useMemo(
    () => todaySchedule.findIndex((v) => v.dt!.getTime() >= Date.now()),
    [todaySchedule],
  );

  const money = (v?: number | null, c?: string | null) =>
    `${symOf(c ?? currency)}${Number(v || 0).toLocaleString()}`;

  const myRank = useMemo(() => {
    const idx = leaderboard.findIndex((r) => r.is_self);
    return idx >= 0 ? idx + 1 : 0;
  }, [leaderboard]);

  // 业绩摘要环比：以上月月度序列为基数（无上月记录时不展示）
  const deltas = useMemo(() => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = monthly.find((m) => m.year === prevMonth.getFullYear() && m.month === prevMonth.getMonth() + 1);
    if (!prev) return { deals: null as string | null, commission: null as string | null };
    const deals = (perf?.month_deals ?? 0) - (prev.deals || 0);
    const commission =
      prev.commission > 0
        ? `${(((perf?.month_commission ?? 0) - prev.commission) / prev.commission) * 100 >= 0 ? '+' : ''}${(
            (((perf?.month_commission ?? 0) - prev.commission) / prev.commission) *
            100
          ).toFixed(1)}%`
        : null;
    return {
      deals: `${deals >= 0 ? '+' : ''}${deals} 较上月`,
      commission,
    };
  }, [monthly, perf]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  const roleLine = profile?.position || profile?.department || '经纪工作台';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* 问候行（品牌色底 + 白字 + 今日概览） */}
      <View style={styles.greeting}>
        <View style={styles.greetingLeft}>
          <Text style={styles.greetingHi}>
            {greetingOf(today.getHours())}
            {userName ? `，${userName}` : ''}
          </Text>
          <Text style={styles.greetingSub}>
            今日 {todaySchedule.length} 场带看 · 本月成交 {perf?.month_deals ?? 0} 单 · 佣金{' '}
            {money(perf?.month_commission)}
          </Text>
        </View>
        <View style={styles.greetingAvatar}>
          <Text style={styles.greetingAvatarText}>{(userName || roleLine).charAt(0)}</Text>
        </View>
      </View>

      {/* 今日工作台：带看时间线 */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>今日工作台</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{todaySchedule.length} 场带看</Text>
          </View>
        </View>
      </View>

      <View style={styles.timelineCard}>
        {todaySchedule.length === 0 ? (
          <View style={styles.scheduleEmpty}>
            <Text style={styles.scheduleEmptyText}>今天暂无带看安排</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Calendar')}>
              <Text style={styles.scheduleEmptyLink}>去日历页添加安排 ›</Text>
            </TouchableOpacity>
          </View>
        ) : (
          todaySchedule.map((item, idx) => {
            const meta = getStatusMeta(item.status);
            const hint = idx === nextIndex ? '下一场' : idx < nextIndex || nextIndex === -1 ? '已过' : '';
            return (
              <View
                key={item.id}
                style={[styles.timelineItem, idx > 0 && styles.timelineItemDivided]}
              >
                <View style={styles.timelineTime}>
                  <Text
                    style={[styles.timelineRange, idx === nextIndex && styles.timelineRangeActive]}
                  >
                    {toTime(item.dt)}
                  </Text>
                  <Text style={styles.timelineHint}>{hint}</Text>
                </View>
                <View style={styles.timelineBody}>
                  <Text style={styles.timelineName} numberOfLines={1}>
                    {item.visitor_name || '待定客户'}
                  </Text>
                  <Text style={styles.timelineProp} numberOfLines={1}>
                    {item.property_title || item.property_address || '房源'}
                  </Text>
                </View>
                <View style={[styles.stageBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.stageBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* 待跟进客户 */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>待跟进客户</Text>
          <View style={[styles.countBadge, styles.countBadgeWarn]}>
            <Text style={[styles.countBadgeText, { color: colors.warning }]}>
              {leads.length} 位
            </Text>
          </View>
        </View>
      </View>

      {leads.length === 0 ? (
        <EmptyState icon="people-outline" title="暂无待跟进客户" sub="分配给你的客户线索会展示在这里" />
      ) : (
        <View style={styles.listCard}>
          {leads.map((lead, idx) => {
            const meta = getLeadStageMeta(lead.stage);
            const budget =
              lead.budget_min || lead.budget_max
                ? `预算 ${money(lead.budget_max ?? lead.budget_min, lead.budget_currency)}`
                : lead.source || '未填预算';
            return (
              <View key={lead.id} style={[styles.listItem, idx > 0 && styles.listItemDivided]}>
                <View style={styles.listAvatar}>
                  <Text style={styles.listAvatarText}>{(lead.name || '?').charAt(0)}</Text>
                </View>
                <View style={styles.listBody}>
                  <View style={styles.listTop}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {lead.name || '未命名客户'}
                    </Text>
                    <View style={[styles.stageBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.stageBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.listMeta} numberOfLines={1}>
                    {budget}
                    {lead.phone ? ` · ${lead.phone}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.followBtn}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('CRM')}
                >
                  <Text style={styles.followBtnText}>去跟进</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* 业绩摘要（一行三格 + 环比） */}
      <Text style={styles.blockTitle}>业绩摘要</Text>
      <View style={styles.stripCard}>
        <View style={styles.stripCell}>
          <Text style={[styles.stripValue, { color: colors.primary }]}>
            {perf?.month_deals ?? 0}
            <Text style={styles.stripUnit}> 单</Text>
          </Text>
          <Text style={styles.stripLabel}>本月成交</Text>
          {deltas.deals ? <Text style={styles.stripDelta}>{deltas.deals}</Text> : null}
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripCell}>
          <Text style={styles.stripValue}>{money(perf?.month_commission)}</Text>
          <Text style={styles.stripLabel}>佣金收入</Text>
          {deltas.commission ? <Text style={styles.stripDelta}>{deltas.commission}</Text> : null}
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripCell}>
          <Text style={styles.stripValue}>{myRank > 0 ? `第 ${myRank}` : '—'}</Text>
          <Text style={styles.stripLabel}>团队排名</Text>
          <Text style={styles.stripDelta}>共 {leaderboard.length || 0} 人</Text>
        </View>
      </View>

      {/* 快捷操作 */}
      <Text style={styles.blockTitle}>快捷操作</Text>
      <View style={styles.actionGrid}>
        {QUICK_ACTIONS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.actionCell}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(item.route)}
          >
            <View style={styles.actionCellIcon}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
            </View>
            <Text style={styles.actionCellLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ===== 问候行（品牌色底 + 白字） ===== */
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  greetingLeft: { flex: 1, minWidth: 0 },
  greetingHi: { fontSize: 20, fontWeight: '700', color: colors.primaryForeground, letterSpacing: -0.2 },
  greetingSub: { fontSize: 13, color: colors.alpha('255, 255, 255', 0.85), marginTop: 2 },
  greetingAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.alpha('255, 255, 255', 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingAvatarText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },

  /* ===== 区块标题 ===== */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  blockTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
  },
  countBadge: {
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeWarn: { backgroundColor: colors.alpha(colors.warningRgb, 0.1) },
  countBadgeText: { fontSize: 11, fontWeight: '600', color: colors.primary, fontVariant: ['tabular-nums'] },
  newBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  newBtnText: { fontSize: 12, fontWeight: '700', color: colors.primaryForeground },

  /* ===== 今日工作台时间线 ===== */
  timelineCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingBottom: 4,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  timelineItemDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  timelineTime: { width: 56 },
  timelineRange: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  timelineRangeActive: { color: colors.primary },
  timelineHint: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  timelineBody: { flex: 1, minWidth: 0 },
  timelineName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  timelineProp: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  scheduleEmpty: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  scheduleEmptyText: { fontSize: 13, color: colors.ink3 },
  scheduleEmptyLink: { fontSize: 13, fontWeight: '600', color: colors.primary },

  /* ===== 待跟进客户列表 ===== */
  listCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  listItemDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  listAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  listAvatarText: { fontSize: 14, fontWeight: '700', color: colors.ink2 },
  listBody: { flex: 1, minWidth: 0 },
  listTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listName: { fontSize: 15, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  stageBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  stageBadgeText: { fontSize: 10, fontWeight: '600' },
  listMeta: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  followBtn: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
  },
  followBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  /* ===== 业绩摘要 ===== */
  stripCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  stripCell: { flex: 1, alignItems: 'center', gap: 4 },
  stripDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  stripValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  stripUnit: { fontSize: 13, fontWeight: '500', color: colors.ink3 },
  stripLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },
  stripDelta: { fontSize: 11, color: colors.ink3 },

  /* ===== 快捷入口宫格（一行 4 格） ===== */
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    marginBottom: 12,
  },
  actionCell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  actionCellIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCellLabel: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
});