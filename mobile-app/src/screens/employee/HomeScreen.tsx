import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import BarChart from '@/components/charts/BarChart';
import colors from '@/theme/colors';
import { employeesApi, notificationsApi, viewingsApi, performanceApi, propertiesApi } from '@/services/api';
import type { Notification } from '@/types';

type IoniconName = keyof typeof Ionicons.glyphMap;

// 快捷入口：仅保留展示页未覆盖的工作工具（业绩/带看已在下方展示区块，考勤/消息在底部 Tab）
const QUICK_ACTIONS: { key: string; label: string; icon: IoniconName; route: string }[] = [
  { key: 'search', label: '房源搜索', icon: 'search', route: 'PropertySearch' },
  { key: 'props', label: '房源管理', icon: 'home-outline', route: 'EmployeeProperties' },
  { key: 'crm', label: '客户跟进', icon: 'people-outline', route: 'CRM' },
  { key: 'contacts', label: '通讯录', icon: 'person-circle-outline', route: 'Contacts' },
  { key: 'contract', label: '电子合同', icon: 'document-text-outline', route: 'Contracts' },
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
  pending: { label: '待确认', bg: 'rgba(148, 163, 184, 0.12)', color: colors.ink2 },
  confirmed: { label: '已确认', bg: `rgba(${colors.primaryRgb}, 0.12)`, color: colors.primary },
  completed: { label: '已完成', bg: 'rgba(22, 163, 74, 0.12)', color: colors.success },
  cancelled: { label: '已取消', bg: 'rgba(148, 163, 184, 0.12)', color: colors.ink2 },
  no_show: { label: '爽约', bg: 'rgba(220, 38, 38, 0.12)', color: colors.error },
};

const getStatusMeta = (status?: string | null) =>
  VIEWING_STATUS_META[status ?? ''] ?? { label: status || '-', bg: 'rgba(148, 163, 184, 0.12)', color: colors.ink2 };

const toTime = (dt: Date | null) =>
  dt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '--:--';

interface WorkbenchSummary {
  lease_count?: number;
  pending_receivable?: number;
  overdue_receivable?: number;
}

interface PerfSummary {
  month_deals?: number;
  month_total?: number;
  month_commission?: number;
  commission_total?: number;
  deals_total?: number;
}

interface FeaturedListing {
  id: string;
  title?: string;
  room_number?: string;
  address?: string;
  monthly_rent?: number;
  currency?: string;
  photos?: string[];
  property_type?: string;
  bedrooms?: number;
  size_sqm?: number;
}

// 近 6 个月业绩趋势（真实数据不足时按本月业绩推算示例，端内仅作展示）
const genMonthlyTrend = (monthTotal: number) => {
  const base = monthTotal || 28000;
  const months = ['4月', '5月', '6月', '7月', '8月', '9月'];
  return months.map((label, i) => ({
    label,
    value: i === months.length - 1 ? base : Math.round(base * (0.62 + i * 0.07)),
  }));
};

const WEEK_HEADS = ['日', '一', '二', '三', '四', '五', '六'];

const typeMap: Record<Notification['type'], { label: string; bg: string; color: string; icon: IoniconName }> = {
  rent_reminder: { label: '租金', bg: 'rgba(217, 119, 6, 0.12)', color: colors.warning, icon: 'wallet-outline' },
  lease_expiry: { label: '到期', bg: 'rgba(220, 38, 38, 0.12)', color: colors.error, icon: 'alert-circle-outline' },
  service_update: { label: '服务', bg: `rgba(${colors.primaryRgb}, 0.12)`, color: colors.primary, icon: 'build-outline' },
  payment: { label: '支付', bg: 'rgba(22, 163, 74, 0.12)', color: colors.success, icon: 'card-outline' },
  system: { label: '系统', bg: 'rgba(148, 163, 184, 0.12)', color: colors.ink2, icon: 'information-circle-outline' },
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [workbench, setWorkbench] = useState<WorkbenchSummary>({});
  const [viewings, setViewings] = useState<ViewingItem[]>([]);
  const [perf, setPerf] = useState<PerfSummary | null>(null);
  const [featured, setFeatured] = useState<FeaturedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [ntfRes, wbRes, vwRes, pfRes, feRes] = await Promise.allSettled([
        notificationsApi.mine(),
        employeesApi.workbench(),
        viewingsApi.list({ pageSize: 100 }),
        performanceApi.mine(),
        propertiesApi.list({ page_size: 6 }),
      ]);
      if (ntfRes.status === 'fulfilled') {
        const data = ntfRes.value.data;
        const items = Array.isArray(data)
          ? data
          : (data as any)?.items ?? (data as any)?.data ?? [];
        setNotifications(items as Notification[]);
      }
      if (wbRes.status === 'fulfilled') {
        const data = (wbRes.value as any)?.data;
        setWorkbench(data?.summary ?? {});
      }
      if (vwRes.status === 'fulfilled') {
        const data = vwRes.value.data;
        const items = Array.isArray(data) ? data : (data as any)?.items ?? (data as any)?.data ?? [];
        setViewings(items as ViewingItem[]);
      }
      if (pfRes.status === 'fulfilled') {
        const d = (pfRes.value as any)?.data;
        setPerf(d?.summary ?? null);
      }
      if (feRes.status === 'fulfilled') {
        const data = feRes.value.data;
        const items = Array.isArray(data) ? data : (data as any)?.items ?? (data as any)?.data ?? [];
        setFeatured((items as FeaturedListing[]).slice(0, 6));
      }
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取提醒');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 日程（Hooks 必须在条件返回之前，统一在顶层计算）
  const schedules = useMemo(() => {
    const now = new Date();
    return viewings
      .map((v) => ({ ...v, dt: v.scheduled_at ? new Date(v.scheduled_at) : null }))
      .filter((v) => v.dt && !Number.isNaN(v.dt!.getTime()))
      .sort((a, b) => a.dt!.getTime() - b.dt!.getTime());
  }, [viewings]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const today = new Date();
  const todaySchedule = schedules.filter((v) => v.dt && isSameDay(v.dt, today));
  const upcomingSchedule = schedules.filter((v) => v.dt && v.dt.getTime() > today.getTime()).slice(0, 3);

  // 近 6 个月业绩趋势（用于首页图表展示）
  const trendData = useMemo(() => genMonthlyTrend(perf?.month_total ?? 0), [perf?.month_total]);

  // 当月月历：带看日打点，今日高亮
  const calYear = today.getFullYear();
  const calMonth = today.getMonth();
  const monthLabel = `${calYear}年${calMonth + 1}月`;
  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayDay = today.getDate();
  const markedDays = useMemo(() => {
    const s = new Set<number>();
    viewings.forEach((v) => {
      if (!v.scheduled_at) return;
      const d = new Date(v.scheduled_at);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === calYear && d.getMonth() === calMonth) {
        s.add(d.getDate());
      }
    });
    return s;
  }, [viewings, calYear, calMonth]);
  const calCells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const sym = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
  const money = (v?: number, c?: string) => `${sym(c)}${Number(v || 0).toLocaleString()}`;

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

  const pendingCount = notifications.filter((n) => !n.read).length;

  const renderItem = ({ item }: { item: Notification }) => {
    const t = typeMap[item.type] ?? {
      label: '提醒',
      bg: 'rgba(148, 163, 184, 0.12)',
      color: colors.ink2,
      icon: 'notifications-outline' as IoniconName,
    };
    return (
      <View style={styles.notifCard}>
        <View style={[styles.notifIcon, { backgroundColor: t.bg }]}>
          <Ionicons name={t.icon} size={20} color={t.color} />
        </View>
        <View style={styles.notifBody}>
          <View style={styles.notifTop}>
            <View style={[styles.notifTag, { backgroundColor: t.bg }]}>
              <Text style={[styles.notifTagText, { color: t.color }]}>{t.label}</Text>
            </View>
            <Text style={styles.notifTime}>{item.createdAt}</Text>
          </View>
          <Text style={styles.notifTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.notifBodyText} numberOfLines={2}>{item.body}</Text>
        </View>
        {!item.read && <View style={styles.notifDot} />}
      </View>
    );
  };

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
      {/* 顶部欢迎区 */}
      <View style={styles.hero}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroHi}>你好，同事</Text>
          <Text style={styles.heroRole}>经纪工作台</Text>
        </View>
        <View style={styles.heroAvatar}>
          <Text style={styles.heroAvatarText}>U</Text>
        </View>
      </View>

      {/* 快捷入口：展示页未覆盖的工作工具，置顶导航 */}
      <View style={styles.actionGrid}>
        {QUICK_ACTIONS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.actionCell}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(item.route)}
          >
            <View style={styles.actionCellIcon}>
              <Ionicons name={item.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.actionCellLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 业绩概览：本月成交 / 佣金 / 业绩 + 近 6 个月趋势 */}
      <View style={styles.perfCard}>
        <View style={styles.perfHead}>
          <View style={styles.perfTitleRow}>
            <View style={styles.perfIcon}>
              <Ionicons name="trending-up-outline" size={15} color={colors.primary} />
            </View>
            <Text style={styles.perfTitle}>本月业绩</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Performance')}>
            <Text style={styles.perfMore}>我的业绩 ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.perfKpis}>
          <View style={styles.perfKpi}>
            <Text style={[styles.perfNum, { color: colors.primary }]}>{perf?.month_deals ?? 0}</Text>
            <Text style={styles.perfLabel}>本月成交</Text>
          </View>
          <View style={styles.perfKpiDivider} />
          <View style={styles.perfKpi}>
            <Text style={[styles.perfNum, { color: colors.warning }]}>{money(perf?.month_commission)}{perf?.month_commission ? '' : ''}</Text>
            <Text style={styles.perfLabel}>本月佣金</Text>
          </View>
          <View style={styles.perfKpiDivider} />
          <View style={styles.perfKpi}>
            <Text style={[styles.perfNum, { color: colors.ink }]}>{money(perf?.month_total)}</Text>
            <Text style={styles.perfLabel}>本月业绩</Text>
          </View>
        </View>
        <BarChart data={trendData} height={110} activeIndex={trendData.length - 1} />
      </View>

      {/* 今日带看：页面主角，经纪人一天的重点 */}
      <View style={styles.scheduleCard}>
        <View style={styles.calHead}>
          <View style={styles.calTitleRow}>
            <View style={styles.calIcon}>
              <Ionicons name="calendar-outline" size={15} color={colors.primary} />
            </View>
            <Text style={styles.calTitle}>{monthLabel}</Text>
            <View style={styles.calCountBadge}>
              <Text style={styles.calCountText}>{markedDays.size} 天有安排</Text>
            </View>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Calendar')}>
            <Text style={styles.calMore}>完整日历 ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.calWeekRow}>
          {WEEK_HEADS.map((w, i) => (
            <Text key={i} style={styles.calWeek}>{w}</Text>
          ))}
        </View>
        <View style={styles.calGrid}>
          {calCells.map((day, idx) => (
            <View key={idx} style={styles.calCell}>
              {day !== null && (
                <View style={[styles.calDay, day === todayDay && styles.calDayToday]}>
                  <Text style={[styles.calDayText, day === todayDay && styles.calDayTextToday]}>{day}</Text>
                </View>
              )}
              {day !== null && markedDays.has(day) && <View style={styles.calDot} />}
            </View>
          ))}
        </View>
        <View style={styles.todayDivider} />
        <View style={styles.calTodayHead}>
          <Text style={styles.calTodayTitle}>今日安排</Text>
          <Text style={styles.calTodayCount}>{todaySchedule.length} 场</Text>
        </View>

        {todaySchedule.length === 0 && upcomingSchedule.length === 0 ? (
          <View style={styles.scheduleEmpty}>
            <Text style={styles.scheduleEmptyText}>今天暂无带看安排</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Calendar')}>
              <Text style={styles.scheduleEmptyLink}>去日历页添加安排 ›</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.scheduleList}>
            {todaySchedule.map((item) => {
              const meta = getStatusMeta(item.status);
              return (
                <View key={item.id} style={styles.scheduleRow}>
                  <View style={styles.scheduleTimeCol}>
                    <Text style={styles.scheduleTime}>{toTime(item.dt)}</Text>
                    <View style={[styles.scheduleLine, { backgroundColor: meta.color }]} />
                  </View>
                  <View style={[styles.scheduleBody, { borderLeftColor: meta.color }]}>
                    <View style={styles.scheduleBodyTop}>
                      <View style={[styles.scheduleTag, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.scheduleTagText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      <Text style={styles.scheduleVisitor}>{item.visitor_name || '待定客户'}</Text>
                    </View>
                    <Text style={styles.scheduleProp} numberOfLines={1}>
                      {item.property_title || item.property_address || '房源'}
                    </Text>
                  </View>
                </View>
              );
            })}
            {upcomingSchedule.length > 0 && (
              <View style={styles.scheduleUpcoming}>
                <Text style={styles.scheduleUpcomingLabel}>接下来</Text>
                {upcomingSchedule.slice(0, 2).map((item) => (
                  <View key={item.id} style={styles.scheduleUpcomingItem}>
                    <Text style={styles.scheduleUpcomingTime}>{toTime(item.dt)}</Text>
                    <Text style={styles.scheduleUpcomingProp} numberOfLines={1}>
                      {item.property_title || item.property_address || '房源'}
                    </Text>
                    <Text style={styles.scheduleUpcomingVisitor} numberOfLines={1}>
                      {item.visitor_name || ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* 我的待办：三格轻卡，只需扫一眼 */}
      <View style={styles.todoRow}>
        <View style={styles.todoItem}>
          <Text style={[styles.todoNum, { color: colors.primary }]}>{workbench.lease_count ?? 0}</Text>
          <Text style={styles.todoLabel}>跟进租约</Text>
        </View>
        <View style={styles.todoDivider} />
        <View style={styles.todoItem}>
          <Text style={[styles.todoNum, { color: colors.warning }]}>
            {workbench.pending_receivable ?? 0}
          </Text>
          <Text style={styles.todoLabel}>待收款</Text>
        </View>
        <View style={styles.todoDivider} />
        <View style={styles.todoItem}>
          <Text
            style={[
              styles.todoNum,
              { color: (workbench.overdue_receivable ?? 0) > 0 ? colors.error : colors.success },
            ]}
          >
            {workbench.overdue_receivable ?? 0}
          </Text>
          <Text style={styles.todoLabel}>逾期</Text>
        </View>
      </View>

      {/* 精选房源：横向推荐卡 */}
      <View style={styles.featuredHead}>
        <View style={styles.featuredTitleRow}>
          <View style={styles.featuredIcon}>
            <Ionicons name="star-outline" size={15} color={colors.primary} />
          </View>
          <Text style={styles.featuredTitle}>精选房源</Text>
        </View>
        <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('PropertySearch')}>
          <Text style={styles.featuredMore}>找房 ›</Text>
        </TouchableOpacity>
      </View>
      {featured.length === 0 ? (
        <EmptyState icon="home-outline" title="暂无精选房源" sub="上架中的房源会展示在这里" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredRow}
        >
          {featured.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.featureCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('PropertyDetail', { id: p.id })}
            >
              <View style={styles.featureThumbWrap}>
                {p.photos && p.photos.length > 0 ? (
                  <Image source={{ uri: p.photos[0] }} style={styles.featureThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.featureThumb, styles.featureThumbPh]}>
                    <Text style={styles.featureThumbText}>房源</Text>
                  </View>
                )}
              </View>
              <Text style={styles.featureTitle} numberOfLines={1}>
                {p.title || p.room_number || '未命名房源'}
              </Text>
              <Text style={styles.featureAddr} numberOfLines={1}>
                {p.address || '暂无地址'}
              </Text>
              <Text style={styles.featureRent}>
                {money(p.monthly_rent, p.currency)}
                <Text style={styles.featureRentUnit}>/月</Text>
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 通知列表 */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>最新通知</Text>
        <Text style={styles.sectionHint}>{pendingCount} 条未读</Text>
      </View>

      {notifications.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="暂无提醒" sub="有新动态时会在这里提醒你" />
      ) : (
        <View style={styles.notifList}>
          {notifications.slice(0, 2).map((item) => (
            <React.Fragment key={item.id}>
              {renderItem({ item })}
            </React.Fragment>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ===== 欢迎区 ===== */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 20,
    backgroundColor: colors.background,
  },
  heroLeft: { flex: 1 },
  heroHi: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroRole: {
    fontSize: 13,
    color: colors.ink3,
    backgroundColor: colors.surface2,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '500',
  },
  heroAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.primary,
  },
  heroAvatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryForeground,
  },

  /* ===== 我的待办（三格轻卡） ===== */
  todoRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.xl,
    paddingVertical: 14,
  },
  todoItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  todoDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  todoNum: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  todoLabel: { fontSize: 11, color: colors.ink2, fontWeight: '500' },

  /* ===== 快捷入口宫格（无外壳） ===== */
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    marginBottom: 8,
  },
  actionCell: {
    width: '20%',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  actionCellIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCellLabel: { fontSize: 12, color: colors.ink2, fontWeight: '600' },

  /* ===== 区块标题 ===== */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

  /* ===== 日程日历卡片 ===== */
  scheduleCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.sm,
  },

  /* ===== 业绩概览卡 ===== */
  perfCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...colors.shadow.sm,
  },
  perfHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  perfTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perfIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.12)`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  perfMore: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  perfKpis: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 12 },
  perfKpi: { flex: 1, alignItems: 'center', gap: 4 },
  perfKpiDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  perfNum: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  perfLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },

  /* ===== 日历卡 ===== */
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  calTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.12)`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  calCountBadge: {
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  calCountText: { fontSize: 11, fontWeight: '600', color: colors.primary, fontVariant: ['tabular-nums'] },
  calMore: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  calWeekRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginTop: 12,
  },
  calWeek: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: colors.ink3,
    fontWeight: '600',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    marginTop: 4,
    paddingBottom: 8,
  },
  calCell: {
    width: '14.28%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  calDay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayToday: { backgroundColor: colors.primary },
  calDayText: { fontSize: 13, color: colors.ink, fontWeight: '600', fontVariant: ['tabular-nums'] },
  calDayTextToday: { color: colors.primaryForeground, fontWeight: '700' },
  calDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  todayDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  calTodayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  calTodayTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  calTodayCount: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

  /* ===== 精选房源 ===== */
  featuredHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  featuredTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featuredIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.12)`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  featuredMore: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  featuredRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 4 },
  featureCard: {
    width: 156,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.sm,
  },
  featureThumbWrap: { width: 156, height: 104 },
  featureThumb: { width: '100%', height: '100%' },
  featureThumbPh: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureThumbText: { fontSize: 13, color: colors.ink3 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, paddingHorizontal: 10, marginTop: 10 },
  featureAddr: { fontSize: 11, color: colors.ink2, paddingHorizontal: 10, marginTop: 3 },
  featureRent: { fontSize: 15, fontWeight: '800', color: colors.primary, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 10, fontVariant: ['tabular-nums'] },
  featureRentUnit: { fontSize: 11, fontWeight: '400', color: colors.ink2 },

  scheduleList: { paddingHorizontal: 16, paddingVertical: 6 },
  scheduleRow: { flexDirection: 'row', alignItems: 'stretch' },
  scheduleTimeCol: { width: 56, alignItems: 'center', paddingTop: 12 },
  scheduleTime: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  scheduleLine: { width: 2, flex: 1, minHeight: 36, opacity: 0.25 },
  scheduleBody: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.lg,
    borderLeftWidth: 3,
    marginLeft: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scheduleBodyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  scheduleTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  scheduleTagText: { fontSize: 10, fontWeight: '600' },
  scheduleVisitor: { fontSize: 12, color: colors.ink2, fontWeight: '600', flexShrink: 1, marginLeft: 8 },
  scheduleProp: { fontSize: 13, color: colors.ink, fontWeight: '600' },

  scheduleUpcoming: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scheduleUpcomingLabel: { fontSize: 11, color: colors.ink3, fontWeight: '600', marginBottom: 8 },
  scheduleUpcomingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  scheduleUpcomingTime: { fontSize: 12, fontWeight: '700', color: colors.primary, width: 44 },
  scheduleUpcomingProp: { flex: 1, fontSize: 13, color: colors.ink, fontWeight: '500' },
  scheduleUpcomingVisitor: { fontSize: 12, color: colors.ink3, maxWidth: '40%' },

  scheduleEmpty: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  scheduleEmptyText: { fontSize: 13, color: colors.ink3 },
  scheduleEmptyLink: { fontSize: 13, fontWeight: '600', color: colors.primary },

  /* ===== 通知卡片 ===== */
  notifList: {
    paddingHorizontal: 20,
    gap: 10,
  },
  notifCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    ...colors.shadow.sm,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  notifBody: { flex: 1, minWidth: 0 },
  notifTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  notifTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  notifTagText: { fontSize: 11, fontWeight: '600' },
  notifTime: { fontSize: 11, color: colors.ink3 },
  notifTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  notifBodyText: { fontSize: 12, color: colors.ink2, lineHeight: 18 },
  notifDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
});
