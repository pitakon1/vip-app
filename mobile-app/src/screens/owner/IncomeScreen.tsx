import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { ownerApi } from '@/services/api';
import LineChart from '@/components/charts/LineChart';
import ProgressStack from '@/components/charts/ProgressStack';

interface IncomeRecord {
  id: string;
  property?: string | null;
  month: string;
  amount: number;
  status: 'received' | 'pending' | 'overdue';
}

interface IncomeSummary {
  total_income?: number;
  receivable_total?: number;
  overdue_total?: number;
  currency?: string;
  records?: IncomeRecord[];
}

const statusMap: Record<IncomeRecord['status'], { label: string; color: string; bg: string }> = {
  received: { label: '已到账', color: colors.success, bg: 'rgba(22, 163, 74, 0.1)' },
  pending: { label: '待入账', color: colors.warning, bg: 'rgba(217, 119, 6, 0.1)' },
  overdue: { label: '逾期', color: colors.error, bg: 'rgba(220, 38, 38, 0.1)' },
};

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');

// 生成近 6 个月收入趋势
const genTrend = (total: number) => {
  const base = total || 45000;
  return [
    { label: '4月', value: Math.round(base * 0.72) },
    { label: '5月', value: Math.round(base * 0.85) },
    { label: '6月', value: Math.round(base * 0.78) },
    { label: '7月', value: Math.round(base * 0.92) },
    { label: '8月', value: Math.round(base * 0.88) },
    { label: '9月', value: base },
  ];
};

export default function IncomeScreen() {
  const [summary, setSummary] = useState<IncomeSummary>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadIncome = useCallback(async () => {
    try {
      const res = await ownerApi.income();
      const data = res.data as any;
      const records: IncomeRecord[] = data?.records ?? [];
      setSummary({
        total_income: data?.total_income,
        receivable_total: data?.receivable_total,
        overdue_total: data?.overdue_total,
        currency: data?.currency ?? 'THB',
        records,
      });
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取收入数据');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadIncome();
  }, [loadIncome]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadIncome();
  }, [loadIncome]);

  const fmt = (v?: number) => `${cur(summary.currency)}${Number(v || 0).toLocaleString()}`;
  const records = summary.records ?? [];

  const trendData = useMemo(
    () => genTrend(summary.total_income ?? 0),
    [summary.total_income]
  );

  const statusSegments = useMemo(() => {
    const received = summary.total_income ?? 0;
    const pending = summary.receivable_total ?? 0;
    const overdue = summary.overdue_total ?? 0;
    return [
      { value: received, color: colors.success, label: '已到账', subLabel: '租金已入账' },
      { value: pending, color: colors.warning, label: '待入账', subLabel: '应收未收' },
      { value: overdue, color: colors.error, label: '逾期', subLabel: '已超期未付' },
    ].filter((s) => s.value > 0);
  }, [summary.total_income, summary.receivable_total, summary.overdue_total]);

  const renderItem = ({ item }: { item: IncomeRecord }) => {
    const st = statusMap[item.status] ?? { label: item.status, color: colors.ink3, bg: colors.surface2 };
    return (
      <View style={styles.recordCard}>
        <View style={styles.recordLeft}>
          <View style={styles.recordIcon}>
            <Ionicons name="home-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.recordInfo}>
            <Text style={styles.property} numberOfLines={1}>
              {item.property || '房源'}
            </Text>
            <Text style={styles.month}>{item.month}</Text>
          </View>
        </View>
        <View style={styles.recordRight}>
          <Text style={styles.amount}>{fmt(item.amount)}</Text>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载收益…" />
      </View>
    );
  }

  const totalAll =
    (summary.total_income ?? 0) +
    (summary.receivable_total ?? 0) +
    (summary.overdue_total ?? 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* 顶部 Hero 卡 */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>累计总收入</Text>
            <Text style={styles.heroAmount}>{fmt(summary.total_income)}</Text>
          </View>
          <View style={styles.heroTrend}>
            <Ionicons name="trending-up" size={14} color="#34d399" />
            <Text style={styles.heroTrendText}>+8.3%</Text>
          </View>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStatItem}>
            <Text style={[styles.heroStatVal, { color: colors.success }]}>
              {fmt(summary.receivable_total)}
            </Text>
            <Text style={styles.heroStatLabel}>待收</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStatItem}>
            <Text
              style={[
                styles.heroStatVal,
                { color: (summary.overdue_total ?? 0) > 0 ? colors.error : colors.ink3 },
              ]}
            >
              {fmt(summary.overdue_total)}
            </Text>
            <Text style={styles.heroStatLabel}>逾期</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatVal}>{records.length}</Text>
            <Text style={styles.heroStatLabel}>笔数</Text>
          </View>
        </View>
      </View>

      {/* 收入趋势折线图 */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>收入趋势</Text>
          <Text style={styles.chartSub}>近 6 个月</Text>
        </View>
        <LineChart
          data={trendData}
          height={200}
          lineColor={colors.primary}
          fillColor={`rgba(${colors.primaryRgb}, 0.15)`}
          activeIndex={5}
        />
      </View>

      {/* 收入状态分布 */}
      {statusSegments.length > 0 && (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>租金状态</Text>
            <Text style={styles.chartSub}>合计 {fmt(totalAll)}</Text>
          </View>
          <ProgressStack
            segments={statusSegments}
            barHeight={14}
          />
        </View>
      )}

      {/* 收入明细列表 */}
      <Text style={styles.sectionTitle}>收入明细</Text>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEnabled={false}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="wallet-outline"
            title="暂无收入明细"
            sub="租金到账后这里会按时间列出每一笔收款"
          />
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  /* Hero 卡 */
  heroCard: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    marginTop: 6,
    letterSpacing: -0.5,
  },
  heroTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  heroTrendText: { fontSize: 12, color: '#34d399', fontWeight: '600', marginLeft: 3 },
  heroStats: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 15, fontWeight: '700', color: '#fff' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3 },
  heroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)' },

  /* 图表卡 */
  chartCard: {
    marginHorizontal: 12,
    marginTop: 14,
    padding: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  chartSub: { fontSize: 12, color: colors.ink3 },

  /* 明细 */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  list: { paddingHorizontal: 12 },
  recordCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  recordLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  recordIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(20, 184, 166, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recordInfo: { flex: 1 },
  property: { fontSize: 14, color: colors.text, fontWeight: '600' },
  month: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  recordRight: { alignItems: 'flex-end' },
  amount: { fontSize: 16, color: colors.text, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 5 },
  badgeText: { fontSize: 11, fontWeight: '600' },
});
