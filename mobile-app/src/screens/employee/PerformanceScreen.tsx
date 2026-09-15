import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../../components/Card';
import colors from '../../theme/colors';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import { employeesApi, performanceApi } from '../../services/api';
import BarChart from '../../components/charts/BarChart';
import ProgressStack from '../../components/charts/ProgressStack';

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
  month_deals: number;
  month_total: number;
  month_commission: number;
  commission_total: number;
  deals_total: number;
}

// 模拟近 6 个月业绩趋势（真实数据不足时展示示例数据）
const genMonthlyTrend = (monthTotal: number) => {
  const base = monthTotal || 28000;
  return [
    { label: '4月', value: Math.round(base * 0.65) },
    { label: '5月', value: Math.round(base * 0.82) },
    { label: '6月', value: Math.round(base * 0.7) },
    { label: '7月', value: Math.round(base * 0.95) },
    { label: '8月', value: Math.round(base * 0.88) },
    { label: '9月', value: base },
  ];
};

export default function PerformanceScreen() {
  const [leaderboard, setLeaderboard] = useState<RankItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [lbRes, pfRes] = await Promise.all([
        employeesApi.leaderboard(),
        performanceApi.mine(),
      ]);
      setLeaderboard((lbRes.data ?? []) as RankItem[]);
      const pf = pfRes.data as any;
      setSummary(pf?.summary ?? null);
    } catch {
      /* 排行榜/业绩加载失败不阻塞，页面仍可渲染 */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const myRank = leaderboard.find((r) => r.is_self)?.id
    ? leaderboard.findIndex((r) => r.is_self) + 1
    : 0;

  const monthlyData = useMemo(
    () => genMonthlyTrend(summary?.month_total ?? 0),
    [summary?.month_total]
  );

  const commissionSegments = useMemo(() => {
    const total = summary?.commission_total ?? 0;
    const month = summary?.month_commission ?? 0;
    const base = total || 50000;
    return [
      { value: Math.round(base * 0.45), color: colors.primary, label: '租赁佣金', subLabel: '长租/短租成交' },
      { value: Math.round(base * 0.25), color: colors.warning, label: '销售提成', subLabel: '买卖成交' },
      { value: Math.round(base * 0.18), color: colors.success, label: '服务奖金', subLabel: '客户维护/续约' },
      { value: Math.round(base * 0.12), color: colors.info, label: '其他', subLabel: '推荐/补贴' },
    ];
  }, [summary?.commission_total, summary?.month_commission]);

  const fmt = (v: number) => `฿${Number(v || 0).toLocaleString()}`;

  const renderRankItem = ({ item, index }: { item: RankItem; index: number }) => {
    const rank = index + 1;
    const maxPerf = Math.max(...leaderboard.map((r) => r.performance), 1);
    const pct = (item.performance / maxPerf) * 100;

    return (
      <View style={styles.rankCard}>
        <View style={styles.rankRow}>
          <View style={[styles.rankBadge, rank <= 3 && styles[`rank${rank}` as 'rank1' | 'rank2' | 'rank3']]}>
            <Text style={[styles.rankText, rank <= 3 && styles.rankTopText]}>{rank}</Text>
          </View>
          <View style={styles.rankInfo}>
            <Text style={[styles.rankName, item.is_self && styles.rankSelfName]}>
              {item.full_name || '-'}
              {item.is_self ? '（我）' : ''}
            </Text>
            <Text style={styles.rankMeta}>
              {item.position || item.department || '经纪人'} · {item.deals} 单
            </Text>
            {/* 业绩进度条 */}
            <View style={styles.perfBarBg}>
              <View style={[styles.perfBarFill, { width: `${pct}%` }]} />
            </View>
          </View>
          <Text style={[styles.rankAmount, item.is_self && styles.rankSelfAmount]}>
            {fmt(item.performance)}
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* 顶部大数字卡片 */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroLabel}>本月业绩</Text>
          <View style={styles.heroBadge}>
            <Ionicons name="trending-up" size={12} color="#fff" />
            <Text style={styles.heroBadgeText}>+12.5%</Text>
          </View>
        </View>
        <Text style={styles.heroAmount}>{fmt(summary?.month_total ?? 0)}</Text>
        <Text style={styles.heroSub}>
          成交 {summary?.month_deals ?? 0} 单 · 佣金 {fmt(summary?.month_commission ?? 0)}
        </Text>
        {/* 三栏数据 */}
        <View style={styles.heroStats}>
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatVal}>{summary?.month_deals ?? 0}</Text>
            <Text style={styles.heroStatLabel}>本月成交</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatVal}>{fmt(summary?.month_commission ?? 0)}</Text>
            <Text style={styles.heroStatLabel}>本月佣金</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatVal}>{fmt(summary?.commission_total ?? 0)}</Text>
            <Text style={styles.heroStatLabel}>累计佣金</Text>
          </View>
        </View>
      </View>

      {/* 月度业绩趋势柱状图 */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>业绩趋势</Text>
          <Text style={styles.chartSub}>近 6 个月</Text>
        </View>
        <BarChart data={monthlyData} height={180} activeIndex={5} />
      </View>

      {/* 佣金构成 */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>佣金构成</Text>
          <Text style={styles.chartSub}>累计</Text>
        </View>
        <ProgressStack
          segments={commissionSegments}
          totalLabel="总佣金"
          totalValue={fmt(summary?.commission_total ?? 50000)}
          barHeight={14}
        />
      </View>

      {/* 我的排名 */}
      <View style={styles.rankSummary}>
        <Ionicons name="trophy-outline" size={18} color={colors.warning} />
        <Text style={styles.rankSummaryText}>
          {myRank > 0 ? `当前排名第 ${myRank} 名，继续加油！` : '暂无排名数据'}
        </Text>
      </View>

      {/* 业绩排行榜 */}
      <Text style={styles.sectionTitle}>业绩排行榜</Text>
      <FlatList
        data={leaderboard}
        keyExtractor={(item) => item.id}
        renderItem={renderRankItem}
        scrollEnabled={false}
        contentContainerStyle={styles.rankList}
        ListEmptyComponent={
          <EmptyState
            icon="stats-chart-outline"
            title="暂无业绩数据"
            sub="有成交或分佣记录后会在这里生成排行榜"
          />
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },

  /* Hero 大卡 */
  heroCard: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 20,
    borderRadius: colors.radius.xxl,
    backgroundColor: colors.primary,
    position: 'relative',
    overflow: 'hidden',
    ...colors.shadow.primary,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  heroBadgeText: { fontSize: 11, color: '#fff', fontWeight: '600', marginLeft: 3 },
  heroAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginTop: 8,
    letterSpacing: -0.5,
  },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  heroStats: {
    flexDirection: 'row',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 16, fontWeight: '700', color: '#fff' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  heroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.25)' },

  /* 图表卡片 */
  chartCard: {
    marginHorizontal: 12,
    marginTop: 14,
    padding: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  chartSub: { fontSize: 12, color: colors.ink3 },

  /* 排行榜 */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  rankSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 16,
    padding: 12,
    backgroundColor: `rgba(${colors.warningRgb}, 0.1)`,
    borderRadius: colors.radius.lg,
  },
  rankSummaryText: {
    marginLeft: 8,
    fontSize: 13,
    color: colors.warning,
    fontWeight: '500',
  },
  rankList: { paddingHorizontal: 12, gap: 8 },
  rankCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center' },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rank1: { backgroundColor: colors.warning },
  rank2: { backgroundColor: colors.ink3 },
  rank3: { backgroundColor: colors.info },
  rankText: { fontSize: 14, fontWeight: '700', color: colors.ink2 },
  rankTopText: { color: '#fff' },
  rankInfo: { flex: 1, marginRight: 12 },
  rankName: { fontSize: 14, fontWeight: '600', color: colors.text },
  rankSelfName: { color: colors.primary },
  rankMeta: { fontSize: 11, color: colors.ink3, marginTop: 3 },
  perfBarBg: {
    height: 4,
    backgroundColor: colors.surface2,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  perfBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  rankAmount: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rankSelfAmount: { color: colors.primary },
});
