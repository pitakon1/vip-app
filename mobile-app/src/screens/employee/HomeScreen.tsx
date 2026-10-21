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
import Ionicons from '@expo/vector-icons/Ionicons';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { useResponsiveContainerStyle } from '@/theme/responsive';
import {
  employeesApi,
  viewingsApi,
  performanceApi,
  leadsApi,
  authApi,
  calendarEventsApi,
} from '@/services/api';

interface ViewingItem {
  id: string;
  property_id?: string;
  property_title?: string | null;
  property_address?: string | null;
  scheduled_at?: string | null;
  visitor_name?: string | null;
  status?: string | null;
}

/* ===== 首页日历：按日汇总的行程（带看 / 租金 / 合同 / 自定义，不展示具体时间） ===== */
interface ReceivableItem {
  payment_id: string;
  amount?: number;
  currency?: string | null;
  due_date?: string | null;
  is_overdue?: boolean;
}

interface LeaseItem {
  lease_id: string;
  property_title?: string | null;
  monthly_rent?: number;
  currency?: string | null;
  end_date?: string | null;
}

interface CalendarEventItem {
  id: string;
  title?: string | null;
  note?: string | null;
  start_at?: string | null;
}

type AgendaKind = 'viewing' | 'rent' | 'contract' | 'user';

interface AgendaEvent {
  id: string;
  kind: AgendaKind;
  title: string;
  sub: string;
  date: Date;
}

const AGENDA_META: Record<AgendaKind, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  viewing: { label: '带看', color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.12), icon: 'eye-outline' },
  rent: { label: '租金', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12), icon: 'wallet-outline' },
  contract: { label: '合同', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.12), icon: 'document-text-outline' },
  user: { label: '日程', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12), icon: 'calendar-outline' },
};

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const buildMonthDays = (year: number, month: number) => {
  const today = new Date();
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false, isToday: false });
  }
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i);
    cells.push({ date: d, isCurrentMonth: true, isToday: isSameDay(d, today) });
  }
  let i = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, i++), isCurrentMonth: false, isToday: false });
  }
  return cells;
};

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

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function HomeScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const respContainer = useResponsiveContainerStyle();
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
  const [receivables, setReceivables] = useState<ReceivableItem[]>([]);
  const [leases, setLeases] = useState<LeaseItem[]>([]);
  const [customEvents, setCustomEvents] = useState<CalendarEventItem[]>([]);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calSelected, setCalSelected] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [vwRes, pfRes, ldRes, lbRes, meRes, auRes, wbRes, ceRes] = await Promise.allSettled([
        viewingsApi.list({ pageSize: 100 }),
        performanceApi.mine(),
        leadsApi.list({ page: 1, page_size: 5 }),
        employeesApi.leaderboard(),
        employeesApi.mine(),
        authApi.me(),
        employeesApi.workbench(),
        calendarEventsApi.list({ page: 1, page_size: 100 }),
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
        const d = (wbRes.value as any)?.data;
        const leaseCurrency = d?.follow_up_leases?.[0]?.currency;
        if (leaseCurrency) setCurrency(leaseCurrency);
        const pending: ReceivableItem[] = d?.receivables?.pending ?? [];
        const overdue: ReceivableItem[] = d?.receivables?.overdue ?? [];
        setReceivables([...pending, ...overdue]);
        setLeases(Array.isArray(d?.follow_up_leases) ? (d.follow_up_leases as LeaseItem[]) : []);
      }
      if (ceRes.status === 'fulfilled') {
        const data = ceRes.value.data as any;
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setCustomEvents(items as CalendarEventItem[]);
      }
    } catch (err: any) {
      Alert.alert(t('loadFailed'), err?.response?.data?.message || t('emp.workbenchFail'));
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

  /* ---- 首页日历：把带看 / 租金 / 合同 / 自定义日程按日期汇总（不含具体时间） ---- */
  const agendaEvents = useMemo<AgendaEvent[]>(() => {
    const list: AgendaEvent[] = [];
    viewings.forEach((v) => {
      if (!v.scheduled_at) return;
      const d = new Date(v.scheduled_at);
      if (Number.isNaN(d.getTime())) return;
      list.push({
        id: `viewing-${v.id}`,
        kind: 'viewing',
        title: `${v.visitor_name || '待定客户'} 看房`,
        sub: v.property_title || v.property_address || '房源',
        date: d,
      });
    });
    receivables.forEach((r) => {
      if (!r.due_date) return;
      const d = new Date(r.due_date);
      if (Number.isNaN(d.getTime())) return;
      list.push({
        id: `rent-${r.payment_id}`,
        kind: 'rent',
        title: r.is_overdue ? '租金催收' : '租金到期',
        sub: `${symOf(r.currency)}${Number(r.amount || 0).toLocaleString()}`,
        date: d,
      });
    });
    leases.forEach((l) => {
      if (!l.end_date) return;
      const d = new Date(l.end_date);
      if (Number.isNaN(d.getTime())) return;
      list.push({
        id: `contract-${l.lease_id}`,
        kind: 'contract',
        title: '合同到期',
        sub: l.property_title || `${symOf(l.currency)}${Number(l.monthly_rent || 0).toLocaleString()}/月`,
        date: d,
      });
    });
    customEvents.forEach((u) => {
      if (!u.start_at) return;
      const d = new Date(u.start_at);
      if (Number.isNaN(d.getTime())) return;
      list.push({
        id: `user-${u.id}`,
        kind: 'user',
        title: u.title || '自定义日程',
        sub: u.note || '',
        date: d,
      });
    });
    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [viewings, receivables, leases, customEvents]);

  const agendaByDate = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    agendaEvents.forEach((e) => {
      const k = dateKey(e.date);
      (map[k] ||= []).push(e);
    });
    return map;
  }, [agendaEvents]);

  const calDays = useMemo(() => buildMonthDays(calYear, calMonth), [calYear, calMonth]);
  const calSelectedEvents = agendaByDate[dateKey(calSelected)] ?? [];
  const calMonthCount = useMemo(
    () =>
      agendaEvents.filter(
        (e) => e.date.getFullYear() === calYear && e.date.getMonth() === calMonth,
      ).length,
    [agendaEvents, calYear, calMonth],
  );

  const shiftCalendarMonth = (delta: number) => {
    const d = new Date(calYear, calMonth + delta, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  };

  const backToToday = () => {
    const t = new Date();
    setCalYear(t.getFullYear());
    setCalMonth(t.getMonth());
    setCalSelected(t);
  };

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

  // 业绩柱状图：近 6 个月佣金（纯 View 实现，无图表库依赖）
  const chartBars = useMemo(() => {
    const now = new Date();
    const months: { year: number; month: number; label: string; isCurrent: boolean }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: t('common.monthN', { n: d.getMonth() + 1 }),
        isCurrent: i === 0,
      });
    }
    const rows = months.map((m) => {
      const row = monthly.find((r) => r.year === m.year && r.month === m.month);
      return { ...m, commission: row?.commission ?? 0 };
    });
    const max = Math.max(...rows.map((r) => r.commission), 1);
    return rows.map((r) => ({
      ...r,
      height: r.commission > 0 ? Math.max(10, (r.commission / max) * 64) : 4,
      valueText:
        r.commission > 0
          ? r.commission >= 10000
            ? `${Math.round(r.commission / 1000)}k`
            : String(Math.round(r.commission))
          : '',
    }));
  }, [monthly]);

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
      contentContainerStyle={[styles.content, respContainer]}
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
      {/* 今日概览卡（品牌色底 + 白字） */}
      <View style={styles.greeting}>
        <View style={styles.greetingLeft}>
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

      {/* 我的日历：紧接今日工作台，按日期直接看每天行程（不展示具体时间） */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>我的日历</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{calMonthCount} 项安排</Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => navigation.navigate('Calendar')}
        >
          <Text style={styles.chartMore}>完整日历 ›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.calHead}>
          <TouchableOpacity style={styles.calNav} onPress={() => shiftCalendarMonth(-1)} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.calMonthBtn} onPress={backToToday} activeOpacity={0.7}>
            <Text style={styles.calMonthText}>
              {calYear} 年 {calMonth + 1} 月
            </Text>
            <Text style={styles.calTodayText}>回到今天</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.calNav} onPress={() => shiftCalendarMonth(1)} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.calWeekRow}>
          {WEEKDAY_LABELS.map((w, i) => (
            <Text key={i} style={[styles.calWeekDay, i === 0 || i === 6 ? styles.calWeekDayWeekend : null]}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.calGrid}>
          {calDays.map((cell, idx) => {
            const k = dateKey(cell.date);
            const dayEvents = agendaByDate[k] ?? [];
            const kinds = Array.from(new Set(dayEvents.map((e) => e.kind)));
            const selected = isSameDay(cell.date, calSelected);
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.calCell,
                  selected && styles.calCellSelected,
                  cell.isToday && !selected && styles.calCellToday,
                ]}
                activeOpacity={0.6}
                onPress={() => {
                  setCalSelected(cell.date);
                  // 点相邻月的日期时顺带翻到该月，避免标题与选中日不一致
                  if (!cell.isCurrentMonth) {
                    setCalYear(cell.date.getFullYear());
                    setCalMonth(cell.date.getMonth());
                  }
                }}
              >
                <Text
                  style={[
                    styles.calDayNum,
                    !cell.isCurrentMonth && styles.calDayNumMuted,
                    selected && styles.calDayNumSelected,
                    cell.isToday && !selected && styles.calDayNumToday,
                  ]}
                >
                  {cell.date.getDate()}
                </Text>
                {cell.isCurrentMonth && dayEvents.length > 0 ? (
                  <>
                    <View style={styles.calDots}>
                      {kinds.slice(0, 3).map((kind) => (
                        <View
                          key={kind}
                          style={[
                            styles.calDot,
                            {
                              backgroundColor: selected
                                ? colors.primaryForeground
                                : AGENDA_META[kind].color,
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text
                      style={[styles.calCountText, selected && styles.calCountTextSelected]}
                      numberOfLines={1}
                    >
                      {dayEvents.length}项
                    </Text>
                  </>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.calAgendaHead}>
          <Text style={styles.calAgendaTitle}>
            {calSelected.getMonth() + 1}月{calSelected.getDate()}日 · 行程
          </Text>
          <Text style={styles.calAgendaCount}>{calSelectedEvents.length} 项</Text>
        </View>

        {calSelectedEvents.length === 0 ? (
          <Text style={styles.calAgendaEmpty}>这一天暂无行程安排</Text>
        ) : (
          calSelectedEvents.map((e) => {
            const meta = AGENDA_META[e.kind];
            return (
              <View key={e.id} style={styles.calAgendaRow}>
                <View style={[styles.calAgendaIcon, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={15} color={meta.color} />
                </View>
                <View style={styles.calAgendaBody}>
                  <Text style={styles.calAgendaName} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={styles.calAgendaSub} numberOfLines={1}>
                    {meta.label}
                    {e.sub ? ` · ${e.sub}` : ''}
                  </Text>
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

      {/* 业绩摘要（图表卡片：关键指标 + 近 6 个月佣金柱状图 + 环比） */}
      <View style={styles.blockTitleRow}>
        <Text style={styles.blockTitle}>业绩摘要</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => navigation.navigate('Performance')}
        >
          <Text style={styles.chartMore}>查看详情 ›</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.chartCard}>
        <View style={styles.chartKeyRow}>
          <View style={styles.chartKeyCell}>
            <Text style={[styles.chartKeyValue, { color: colors.primary }]}>
              {perf?.month_deals ?? 0}
              <Text style={styles.chartKeyUnit}> 单</Text>
            </Text>
            <Text style={styles.chartKeyLabel}>本月成交</Text>
          </View>
          <View style={styles.chartKeyDivider} />
          <View style={styles.chartKeyCell}>
            <Text style={styles.chartKeyValue}>{money(perf?.month_commission)}</Text>
            <Text style={styles.chartKeyLabel}>佣金收入</Text>
          </View>
          <View style={styles.chartKeyDivider} />
          <View style={styles.chartKeyCell}>
            <Text style={styles.chartKeyValue}>{myRank > 0 ? `第 ${myRank}` : '—'}</Text>
            <Text style={styles.chartKeyLabel}>团队排名</Text>
          </View>
        </View>

        <View style={styles.chartDivider} />

        <View style={styles.chartTitleRow}>
          <Text style={styles.chartTitle}>近 6 个月佣金趋势</Text>
          {deltas.commission ? (
            <Text style={styles.chartTitleDelta}>{deltas.commission} 较上月</Text>
          ) : null}
        </View>

        <View style={styles.chartWrap}>
          {chartBars.map((b) => (
            <View key={b.label} style={styles.chartCol}>
              <Text style={[styles.chartBarValue, b.isCurrent && styles.chartBarValueActive]}>
                {b.valueText}
              </Text>
              <View style={styles.chartBarTrack}>
                <View
                  style={[
                    styles.chartBar,
                    { height: b.height, backgroundColor: b.isCurrent ? colors.primary : colors.alpha(colors.primaryRgb, 0.32) },
                  ]}
                />
              </View>
              <Text style={[styles.chartBarLabel, b.isCurrent && styles.chartBarLabelActive]}>
                {b.label}
              </Text>
            </View>
          ))}
        </View>

        {deltas.deals ? (
          <View style={styles.chartDeltaRow}>
            <Text style={styles.chartDelta}>{deltas.deals}</Text>
            <Text style={styles.chartDeltaMuted}>（以月度业绩为基数）</Text>
          </View>
        ) : null}
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
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
  },
  chartMore: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
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

  /* ===== 业绩摘要图表卡片 ===== */
  chartCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  chartKeyRow: { flexDirection: 'row', alignItems: 'stretch' },
  chartKeyCell: { flex: 1, alignItems: 'center', gap: 4 },
  chartKeyDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  chartKeyValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  chartKeyUnit: { fontSize: 13, fontWeight: '500', color: colors.ink3 },
  chartKeyLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },
  chartDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chartTitle: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  chartTitleDelta: { fontSize: 12, fontWeight: '600', color: colors.primary },
  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartBarValue: {
    fontSize: 11,
    color: colors.ink3,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chartBarValueActive: { color: colors.primary },
  chartBarTrack: {
    height: 64,
    width: 18,
    justifyContent: 'flex-end',
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  chartBar: {
    width: 18,
    borderTopLeftRadius: colors.radius.sm,
    borderTopRightRadius: colors.radius.sm,
  },
  chartBarLabel: { fontSize: 11, color: colors.ink3 },
  chartBarLabelActive: { color: colors.primary, fontWeight: '700' },
  chartDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  chartDelta: { fontSize: 12, fontWeight: '600', color: colors.success },
  chartDeltaMuted: { fontSize: 12, color: colors.ink3 },

  /* ===== 首页日历 ===== */
  calendarCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.sm,
  },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  calNav: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  calMonthBtn: { alignItems: 'center' },
  calMonthText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  calTodayText: { fontSize: 10, color: colors.primary, marginTop: 1 },
  calWeekRow: { flexDirection: 'row', paddingTop: 8, paddingHorizontal: 6 },
  calWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink3,
    paddingVertical: 4,
  },
  calWeekDayWeekend: { color: colors.ink2 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6, paddingBottom: 4 },
  calCell: {
    width: `${100 / 7}%`,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: colors.radius.md,
  },
  calCellSelected: { backgroundColor: colors.primary },
  calCellToday: { backgroundColor: colors.alpha(colors.primaryRgb, 0.08) },
  calDayNum: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  calDayNumMuted: { color: colors.ink3, opacity: 0.45 },
  calDayNumSelected: { color: colors.primaryForeground, fontWeight: '700' },
  calDayNumToday: { color: colors.primary, fontWeight: '800' },
  calDots: { flexDirection: 'row', gap: 2, marginTop: 3 },
  calDot: { width: 4, height: 4, borderRadius: 2 },
  calCountText: { fontSize: 9, color: colors.ink3, marginTop: 1 },
  calCountTextSelected: { color: colors.primaryForeground, opacity: 0.9 },
  calAgendaHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  calAgendaTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  calAgendaCount: { fontSize: 11, color: colors.ink3 },
  calAgendaEmpty: { fontSize: 12, color: colors.ink3, paddingHorizontal: 14, paddingVertical: 14 },
  calAgendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  calAgendaIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calAgendaBody: { flex: 1, minWidth: 0 },
  calAgendaName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  calAgendaSub: { fontSize: 11, color: colors.ink3, marginTop: 2 },
});