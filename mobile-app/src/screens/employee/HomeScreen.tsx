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
import { employeesApi, notificationsApi, viewingsApi } from '@/services/api';
import type { Notification } from '@/types';

type IoniconName = keyof typeof Ionicons.glyphMap;

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
  pending: { label: '待确认', bg: 'rgba(148, 163, 184, 0.12)', color: colors.ink3 },
  confirmed: { label: '已确认', bg: `rgba(${colors.primaryRgb}, 0.12)`, color: colors.primary },
  completed: { label: '已完成', bg: 'rgba(22, 163, 74, 0.12)', color: colors.success },
  cancelled: { label: '已取消', bg: 'rgba(148, 163, 184, 0.12)', color: colors.ink3 },
  no_show: { label: '爽约', bg: 'rgba(220, 38, 38, 0.12)', color: colors.error },
};

const getStatusMeta = (status?: string | null) =>
  VIEWING_STATUS_META[status ?? ''] ?? { label: status || '-', bg: 'rgba(148, 163, 184, 0.12)', color: colors.ink3 };

const toTime = (dt: Date | null) =>
  dt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '--:--';

interface WorkbenchSummary {
  lease_count?: number;
  pending_receivable?: number;
  overdue_receivable?: number;
}

const typeMap: Record<Notification['type'], { label: string; bg: string; color: string; icon: IoniconName }> = {
  rent_reminder: { label: '租金', bg: 'rgba(217, 119, 6, 0.12)', color: colors.warning, icon: 'wallet-outline' },
  lease_expiry: { label: '到期', bg: 'rgba(220, 38, 38, 0.12)', color: colors.error, icon: 'alert-circle-outline' },
  service_update: { label: '服务', bg: `rgba(${colors.primaryRgb}, 0.12)`, color: colors.primary, icon: 'build-outline' },
  payment: { label: '支付', bg: 'rgba(22, 163, 74, 0.12)', color: colors.success, icon: 'card-outline' },
  system: { label: '系统', bg: 'rgba(148, 163, 184, 0.12)', color: colors.ink3, icon: 'information-circle-outline' },
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [workbench, setWorkbench] = useState<WorkbenchSummary>({});
  const [viewings, setViewings] = useState<ViewingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [ntfRes, wbRes, vwRes] = await Promise.allSettled([
        notificationsApi.mine(),
        employeesApi.workbench(),
        viewingsApi.list({ pageSize: 100 }),
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
      color: colors.ink3,
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

      {/* 关键指标条（单行） */}
      <View style={styles.kpiStrip}>
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiNum, { color: colors.primary }]}>{todaySchedule.length}</Text>
          <Text style={styles.kpiLabel}>今日带看</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiNum, { color: colors.ink }]}>{workbench.lease_count ?? 0}</Text>
          <Text style={styles.kpiLabel}>跟进租约</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiNum, { color: colors.warning }]}>
            {workbench.pending_receivable ?? 0}
          </Text>
          <Text style={styles.kpiLabel}>待收款</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text
            style={[styles.kpiNum, { color: (workbench.overdue_receivable ?? 0) > 0 ? colors.error : colors.success }]}
          >
            {workbench.overdue_receivable ?? 0}
          </Text>
          <Text style={styles.kpiLabel}>逾期</Text>
        </View>
      </View>

      {/* 日程日历：直接展示今日/近期安排 */}
      <View style={styles.scheduleCard}>
        <View style={styles.scheduleCardHead}>
          <View style={styles.scheduleCardTitleRow}>
            <View style={styles.scheduleCardIcon}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            </View>
            <Text style={styles.scheduleCardTitle}>今日日程</Text>
            <View style={styles.scheduleCountBadge}>
              <Text style={styles.scheduleCountText}>{todaySchedule.length} 场</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.scheduleMore} onPress={() => navigation.navigate('Calendar')} activeOpacity={0.7}>
            <Text style={styles.scheduleMoreText}>完整日历</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
          </TouchableOpacity>
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
                {upcomingSchedule.map((item) => (
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

      {/* 通知列表 */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>最新通知</Text>
        <Text style={styles.sectionHint}>{pendingCount} 条未读</Text>
      </View>

      {notifications.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="暂无提醒" sub="有新动态时会在这里提醒你" />
      ) : (
        <View style={styles.notifList}>
          {notifications.slice(0, 5).map((item) => (
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

  /* ===== 关键指标条（单行） ===== */
  kpiStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    ...colors.shadow.sm,
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  kpiDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  kpiNum: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  kpiLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },

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
  scheduleCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scheduleCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.12)`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleCardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  scheduleCountBadge: {
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  scheduleCountText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  scheduleMore: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  scheduleMoreText: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

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
