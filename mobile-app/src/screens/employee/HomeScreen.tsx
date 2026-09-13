import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import colors from '@/theme/colors';
import { employeesApi, notificationsApi, viewingsApi } from '@/services/api';
import type { Notification } from '@/types';

type IoniconName = keyof typeof Ionicons.glyphMap;

const QUICK: { key: string; navigate: string; icon: IoniconName; label: string; sub: string }[] = [
  { key: 'search', navigate: 'PropertySearch', icon: 'search', label: '房源搜索', sub: '快速查找' },
  { key: 'properties', navigate: 'EmployeeProperties', icon: 'business', label: '房源管理', sub: '在租空置' },
  { key: 'crm', navigate: 'CRM', icon: 'people', label: '客户跟进', sub: '线索管理' },
  { key: 'performance', navigate: 'Performance', icon: 'stats-chart', label: '我的业绩', sub: '佣金统计' },
  { key: 'contracts', navigate: 'Contracts', icon: 'document-text', label: '电子合同', sub: '签约归档' },
  { key: 'viewings', navigate: 'Calendar', icon: 'calendar', label: '日程日历', sub: '预约待办' },
];

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
  const [viewingCount, setViewingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [ntfRes, wbRes, vwRes] = await Promise.allSettled([
        notificationsApi.mine(),
        employeesApi.workbench(),
        viewingsApi.mine(),
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
        setViewingCount((items as any[]).length);
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
          <Text style={styles.heroHi}>你好，同事 👋</Text>
          <Text style={styles.heroRole}>经纪工作台</Text>
        </View>
        <View style={styles.heroAvatar}>
          <Text style={styles.heroAvatarText}>U</Text>
        </View>
      </View>

      {/* 待办提示 */}
      <View style={styles.pendingBar}>
        <Ionicons name="notifications-outline" size={16} color={colors.primary} />
        <Text style={styles.pendingText}>
          你有 <Text style={styles.pendingNum}>{pendingCount}</Text> 条未读通知待处理
        </Text>
      </View>

      {/* 核心数据 */}
      <View style={styles.statsRow}>
        <View style={[styles.statBig, styles.statPrimary]}>
          <View style={styles.statBigIcon}>
            <Ionicons name="eye-outline" size={22} color="#fff" />
          </View>
          <View style={styles.statBigBody}>
            <Text style={styles.statBigNum}>{viewingCount}</Text>
            <Text style={styles.statBigLabel}>今日带看</Text>
          </View>
        </View>
        <View style={[styles.statBig, styles.statSuccess]}>
          <View style={styles.statBigIcon}>
            <Ionicons name="document-text-outline" size={22} color="#fff" />
          </View>
          <View style={styles.statBigBody}>
            <Text style={styles.statBigNum}>{workbench.lease_count ?? 0}</Text>
            <Text style={styles.statBigLabel}>跟进租约</Text>
          </View>
        </View>
      </View>

      {/* 次级数据 */}
      <View style={styles.miniRow}>
        <View style={styles.miniCard}>
          <Text style={[styles.miniNum, { color: colors.warning }]}>
            {workbench.pending_receivable ?? 0}
          </Text>
          <Text style={styles.miniLabel}>待收款</Text>
        </View>
        <View style={styles.miniCard}>
          <Text
            style={[
              styles.miniNum,
              { color: (workbench.overdue_receivable ?? 0) > 0 ? colors.error : colors.ink3 },
            ]}
          >
            {workbench.overdue_receivable ?? 0}
          </Text>
          <Text style={styles.miniLabel}>逾期</Text>
        </View>
        <View style={styles.miniCard}>
          <Text style={[styles.miniNum, { color: colors.success }]}>
            {notifications.length}
          </Text>
          <Text style={styles.miniLabel}>总通知</Text>
        </View>
      </View>

      {/* 快捷入口 */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>快捷入口</Text>
      </View>
      <View style={styles.quickGrid}>
        {QUICK.map((q) => (
          <TouchableOpacity
            key={q.key}
            style={styles.quickItem}
            onPress={() => navigation.navigate(q.navigate)}
            activeOpacity={0.7}
          >
            <View style={styles.quickIcon}>
              <Ionicons name={q.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.quickLabel}>{q.label}</Text>
            <Text style={styles.quickSub}>{q.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 通知列表 */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>最新通知</Text>
        <Text style={styles.sectionHint}>共 {notifications.length} 条</Text>
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

  /* ===== 待办提示条 ===== */
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.08)`,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  pendingText: { fontSize: 13, color: colors.ink2, flex: 1 },
  pendingNum: { fontSize: 13, fontWeight: '800', color: colors.primary },

  /* ===== 核心数据卡 ===== */
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  statBig: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: colors.radius.xl,
    padding: 18,
    gap: 12,
    ...colors.shadow.card,
  },
  statPrimary: {
    backgroundColor: colors.primary,
  },
  statSuccess: {
    backgroundColor: colors.success,
  },
  statBigIcon: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBigBody: { flex: 1 },
  statBigNum: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  statBigLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },

  /* ===== 次级数据 ===== */
  miniRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  miniCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  miniNum: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  miniLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },

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

  /* ===== 快捷入口 ===== */
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  quickItem: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.lg,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  quickSub: { fontSize: 10, color: colors.ink3 },

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
