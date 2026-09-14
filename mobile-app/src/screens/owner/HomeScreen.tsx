import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import BarChart from '@/components/charts/BarChart';
import colors from '@/theme/colors';
import { useAuthStore } from '@/stores/auth';
import { ownerApi, ownersApi } from '@/services/api';
import type { Property, PropertyStatus } from '@/types';
import type { RootStackParamList } from '@/navigation/RootNavigator';

const statusLabels: Record<PropertyStatus, string> = {
  vacant: '空置',
  rented: '已出租',
  renewing: '正在续约',
  maintenance: '维护中',
};

const statusColors: Record<PropertyStatus, string> = {
  vacant: colors.success,
  rented: colors.primary,
  renewing: colors.info,
  maintenance: colors.warning,
};

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const letter = (v?: number, c?: string) => `${cur(c)}${Number(v || 0).toLocaleString()}`;

// 把月度字段转成 "N月"，如 "1月"、"2026-01"、"2026/03" 统一提取后两位数字
const monthLabel = (m?: string | number) => {
  const nums = String(m ?? '').match(/\d+/g);
  const last = nums && nums.length ? nums[nums.length - 1] : '';
  return `${last}月`;
};

type IoniconName = keyof typeof Ionicons.glyphMap;

// 快捷入口：收益/增值服务/文档已在底部 Tab，这里只放高频操作
const QUICK_ACTIONS: { key: string; label: string; icon: IoniconName; route: string }[] = [
  { key: 'marketing', label: '委托挂牌', icon: 'megaphone-outline', route: 'OwnerMarketing' },
  { key: 'payments', label: '我的付款', icon: 'receipt-outline', route: 'OwnerPayments' },
  { key: 'messages', label: '站内消息', icon: 'chatbubble-ellipses-outline', route: 'ChatList' },
];

interface AnnualMonthly {
  month?: string | number;
  received?: number;
  pending?: number;
  overdue?: number;
  count?: number;
}

interface AnnualSummary {
  by_month?: AnnualMonthly[];
  totals?: { received?: number; pending?: number; overdue?: number };
  currency?: string;
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const [properties, setProperties] = useState<Property[]>([]);
  const [annual, setAnnual] = useState<AnnualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProperties = useCallback(async () => {
    const year = new Date().getFullYear();
    try {
      const [propRes, sumRes]: any[] = await Promise.allSettled([
        ownerApi.properties(),
        ownersApi.annualSummary(year),
      ]);
      if (propRes.status === 'fulfilled') {
        const data = propRes.value?.data;
        const items = Array.isArray(data)
          ? data
          : (data as any)?.items ?? (data as any)?.data ?? [];
        setProperties(items as Property[]);
      }
      if (sumRes.status === 'fulfilled') {
        setAnnual(sumRes.value?.data ?? null);
      }
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取房源列表');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProperties();
  }, [loadProperties]);

  // 近 6 个月已实收趋势（图表数据），若后端无月度数据则返回空数组
  const chartData = useMemo(() => {
    const months = annual?.by_month ?? [];
    if (!months.length) return [];
    return months.slice(-6).map((m) => ({
      label: monthLabel(m.month),
      value: Number(m.received ?? 0),
    }));
  }, [annual]);

  // 房产状态统计：已出租 / 空置 / 预订（预订以"正在续约"计）
  const statusCounts = useMemo(() => {
    const rented = properties.filter((p) => p.status === 'rented').length;
    const vacant = properties.filter((p) => p.status === 'vacant').length;
    const prebook = properties.filter((p) => p.status === 'renewing').length;
    return { rented, vacant, prebook };
  }, [properties]);

  const totalStatus = statusCounts.rented + statusCounts.vacant + statusCounts.prebook;

  const totals = annual?.totals;
  const summary = {
    received: totals?.received,
    pending: totals?.pending,
    overdue: totals?.overdue,
    currency: annual?.currency,
  };

  const userName = user?.name || user?.full_name || user?.username || '业主';
  const userNameInitial = (user?.name || user?.full_name || user?.username || '业').slice(0, 1);

  const go = (target: string) => {
    navigation.navigate(target as any);
  };

  const renderItem = ({ item }: { item: Property }) => {
    const rent = Number(item.monthly_rent ?? item.rent ?? 0);
    const c = item.currency === 'USD' ? '$' : item.currency === 'CNY' ? '¥' : '฿';
    const title = item.title || item.room_number || item.address || '房源';
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PropertyDetail', { id: item.id })}
      >
        <Card title={title}>
          <View style={styles.row}>
            <Text style={styles.address} numberOfLines={2}>
              {item.address}
            </Text>
            <View style={[styles.badge, { backgroundColor: statusColors[item.status] }]}>
              <Text style={styles.badgeText}>{statusLabels[item.status]}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.rent}>
              {c}
              {rent.toLocaleString()}/月
            </Text>
            <Text style={styles.meta}>
              {item.bedrooms ?? 0}室 · {item.size_sqm ?? item.area ?? 0}㎡
            </Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载房源…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Hero 欢迎区 */}
            <View style={styles.hero}>
              <View style={styles.heroLeft}>
                <Text style={styles.heroHi}>欢迎回来，{userName}</Text>
                <Text style={styles.heroRole}>名下 {properties.length} 套房产</Text>
              </View>
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{userNameInitial}</Text>
              </View>
            </View>

            {/* 快捷入口：3 项轻网格，无卡片外壳 */}
            <View style={styles.actionGrid}>
              {QUICK_ACTIONS.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.actionCell}
                  activeOpacity={0.7}
                  onPress={() => go(item.route)}
                >
                  <View style={styles.actionCellIcon}>
                    <Ionicons name={item.icon} size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.actionCellLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 财务概览：KPI + 近 6 个月收入 */}
            <View style={styles.perfCard}>
              <View style={styles.perfHead}>
                <View style={styles.perfTitleRow}>
                  <View style={styles.perfIcon}>
                    <Ionicons name="wallet-outline" size={15} color={colors.primary} />
                  </View>
                  <Text style={styles.perfTitle}>财务概览</Text>
                </View>
                <TouchableOpacity activeOpacity={0.7} onPress={() => go('OwnerIncome')}>
                  <Text style={styles.perfMore}>收益中心 ›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.financeKpis}>
                <View style={styles.financeKpi}>
                  <Text style={[styles.financeNum, { color: colors.success }]}>{letter(summary.received, summary.currency)}</Text>
                  <Text style={styles.financeLabel}>实收</Text>
                </View>
                <View style={styles.perfKpiDivider} />
                <View style={styles.financeKpi}>
                  <Text style={[styles.financeNum, { color: colors.warning }]}>{letter(summary.pending, summary.currency)}</Text>
                  <Text style={styles.financeLabel}>待收</Text>
                </View>
                <View style={styles.perfKpiDivider} />
                <View style={styles.financeKpi}>
                  <Text style={[styles.financeNum, { color: colors.error }]}>{letter(summary.overdue, summary.currency)}</Text>
                  <Text style={styles.financeLabel}>逾期</Text>
                </View>
              </View>
              {chartData.length > 0 && (
                <BarChart data={chartData} height={110} activeIndex={chartData.length - 1} />
              )}
            </View>

            {/* 房产状态卡：已出租 / 空置 / 预订 + 比例条 */}
            <View style={styles.statusCard}>
              <View style={styles.statusHead}>
                <View style={styles.perfTitleRow}>
                  <View style={styles.perfIcon}>
                    <Ionicons name="home-outline" size={15} color={colors.primary} />
                  </View>
                  <Text style={styles.statusTitle}>房产状态</Text>
                </View>
                <Text style={styles.statusHint}>共 {properties.length} 套</Text>
              </View>
              <View style={styles.financeKpis}>
                <View style={styles.financeKpi}>
                  <Text style={[styles.financeNum, { color: colors.success }]}>{statusCounts.rented}</Text>
                  <Text style={styles.financeLabel}>已出租</Text>
                </View>
                <View style={styles.perfKpiDivider} />
                <View style={styles.financeKpi}>
                  <Text style={[styles.financeNum, { color: colors.primary }]}>{statusCounts.vacant}</Text>
                  <Text style={styles.financeLabel}>空置</Text>
                </View>
                <View style={styles.perfKpiDivider} />
                <View style={styles.financeKpi}>
                  <Text style={[styles.financeNum, { color: colors.warning }]}>{statusCounts.prebook}</Text>
                  <Text style={styles.financeLabel}>预订</Text>
                </View>
              </View>
              <View style={styles.ratioBar}>
                {totalStatus > 0 && (
                  <>
                    <View style={[styles.ratioSeg, { flex: statusCounts.rented, backgroundColor: colors.success }]} />
                    <View style={[styles.ratioSeg, { flex: statusCounts.vacant, backgroundColor: colors.primary }]} />
                    <View style={[styles.ratioSeg, { flex: statusCounts.prebook, backgroundColor: colors.warning }]} />
                  </>
                )}
              </View>
            </View>

            {/* 我的房源：列表标题 */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>我的房源</Text>
              <Text style={styles.sectionHint}>{properties.length} 套</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="key-outline"
            title="暂无房源"
            sub="名下还没有房源，去委托挂牌，让平台帮你出租或出售"
            actionLabel="去委托挂牌"
            onAction={() => go('OwnerMarketing')}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8, paddingBottom: 32 },

  /* ===== Hero 欢迎区 ===== */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 28,
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
    borderRadius: colors.radius.full,
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
  heroAvatarText: { fontSize: 20, fontWeight: '800', color: colors.primaryForeground },

  /* ===== 快捷入口（无外壳轻网格，3 项一行） ===== */
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    marginBottom: 8,
  },
  actionCell: {
    width: '33.33%',
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

  /* ===== 财务概览卡（复用 perfCard 系列） ===== */
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
  perfMore: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  perfTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  perfKpiDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  /* ==== KPI（财务 + 状态共用） ===== */
  financeKpis: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 12 },
  financeKpi: { flex: 1, alignItems: 'center', gap: 4 },
  financeNum: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  financeLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },

  /* ===== 房产状态卡 ===== */
  statusCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...colors.shadow.sm,
  },
  statusHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statusTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  statusHint: { fontSize: 12, color: colors.ink3, fontWeight: '500', fontVariant: ['tabular-nums'] },
  ratioBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: colors.radius.full,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  ratioSeg: { height: 8 },

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
  sectionHint: { fontSize: 12, color: colors.ink3, fontWeight: '500', fontVariant: ['tabular-nums'] },

  /* ===== 房源卡片 ===== */
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  address: { flex: 1, color: colors.ink2, fontSize: 13, marginRight: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: colors.primaryForeground, fontSize: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  rent: { color: colors.primary, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  meta: { color: colors.ink3, fontSize: 13 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});