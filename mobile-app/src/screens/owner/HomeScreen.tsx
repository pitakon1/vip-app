import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import BarChart from '@/components/charts/BarChart';
import colors from '@/theme/colors';
import { ownerApi, ownersApi } from '@/services/api';
import { fmtMoney as money } from '@/utils/format';
import type { RootStackParamList } from '@/navigation/RootNavigator';

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

interface OwnerProperty {
  id: string;
  name?: string;
  room_number?: string;
  project_name?: string;
  address?: string;
  status?: string;
  monthly_rent?: number;
  sale_price?: number;
  currency?: string;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  tenant_name?: string;
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [annual, setAnnual] = useState<AnnualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const year = new Date().getFullYear();
    const [propRes, sumRes] = await Promise.allSettled([
      ownerApi.properties(),
      ownersApi.annualSummary(year),
    ]);

    const pick = <T,>(res: PromiseSettledResult<any>): T[] => {
      if (res.status !== 'fulfilled') return [];
      const data = res.value?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      return Array.isArray(items) ? (items as T[]) : [];
    };

    setProperties(pick<OwnerProperty>(propRes));
    if (sumRes.status === 'fulfilled') {
      setAnnual((sumRes.value?.data as AnnualSummary) ?? null);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const currency = properties[0]?.currency || 'THB';

  const go = (target: string) => navigation.navigate(target as any);

  /* ===== 本月实收收益：取年度汇总最近一个月桶（真实数据）===== */
  const monthReceived = useMemo(() => {
    const buckets = annual?.by_month ?? [];
    const bucket = buckets.length ? buckets[buckets.length - 1] : null;
    return Number(bucket?.received ?? 0);
  }, [annual]);

  /* ===== 年度收益趋势：按月绘制实收柱状图 ===== */
  const chartData = useMemo(() => {
    const buckets = annual?.by_month ?? [];
    return buckets
      .map((b) => {
        const s = String(b.month ?? '');
        const num = s.includes('-') ? Number(s.split('-')[1]) : Number(s);
        const label =
          Number.isInteger(num) && num >= 1 && num <= 12 ? `${num}月` : s;
        return { label, value: Number(b.received ?? 0) };
      })
      .filter((d) => d.value > 0);
  }, [annual]);

  /* ===== 资产概览统计 ===== */
  const statusCount = useMemo(() => {
    const count = { vacant: 0, rented: 0, forSale: 0 };
    properties.forEach((p) => {
      const s = String(p.status || '').toLowerCase();
      if (s === 'vacant' || s === 'available') count.vacant += 1;
      else if (s === 'for_sale' || s === 'on_sale' || s === 'sale') count.forSale += 1;
      else if (s === 'rented' || s === 'active') count.rented += 1;
    });
    return count;
  }, [properties]);

  const propTitle = (p: OwnerProperty) =>
    p.name ||
    (p.project_name ? `${p.project_name}·${p.room_number ?? ''}` : p.room_number || p.address || '房源');

  const propMeta = (p: OwnerProperty) =>
    `${p.bedrooms ?? 0}室${p.bathrooms ?? 0}厅 ${p.size_sqm ?? 0}㎡`;

  const propStatusText = (p: OwnerProperty) => {
    const s = String(p.status || '').toLowerCase();
    if (s === 'vacant' || s === 'available') return { text: '空置', color: colors.ink3 };
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale')
      return { text: '在售', color: colors.warning };
    return { text: '在租', color: colors.success };
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载工作台…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + colors.spacing.md }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ===== 收益 Hero 概览：本月实收为主数字 + 名下套数/在租/空置/在售 小列 ===== */}
        <View style={styles.heroCard}>
          <View style={styles.heroHead}>
            <Text style={styles.heroLabel}>本月实收</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => go('OwnerProperties')}>
              <Text style={styles.heroPropsLink}>名下 {properties.length} 套 ›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.heroTotalRow}>
            <Text style={styles.heroTotal}>{money(monthReceived, currency)}</Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.success }]}>{statusCount.rented}</Text>
              <Text style={styles.heroStatSmallLabel}>在租</Text>
            </View>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.ink3 }]}>{statusCount.vacant}</Text>
              <Text style={styles.heroStatSmallLabel}>空置</Text>
            </View>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.warning }]}>{statusCount.forSale}</Text>
              <Text style={styles.heroStatSmallLabel}>在售</Text>
            </View>
          </View>
        </View>

        {/* ===== 年度收益趋势图（主图表） ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>年度收益趋势</Text>
          {annual?.currency || currency ? (
            <Text style={styles.sectionHint}>{annual?.currency ?? currency}</Text>
          ) : null}
        </View>
        <View style={styles.card}>
          {chartData.length ? (
            <BarChart data={chartData} height={170} />
          ) : (
            <EmptyState
              icon="bar-chart-outline"
              title="暂无收益数据"
              sub="名下房源产生租金或售房款后，这里按月展示实收金额"
            />
          )}
          {/* 唯一跳「服务中心」入口：业主购买/使用增值服务 */}
          <TouchableOpacity
            style={styles.chartFoot}
            activeOpacity={0.8}
            onPress={() => go('OwnerServices')}
          >
            <Text style={styles.chartFootText}>查看增值服务 ›</Text>
            <Ionicons name="apps-outline" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ===== 提醒条：仅空置房源（业主无房租缴费，不提“待收/催缴”） ===== */}
        {statusCount.vacant > 0 && (
          <View style={styles.alertCard}>
            <TouchableOpacity
              style={styles.alertRow}
              activeOpacity={0.7}
              onPress={() => go('OwnerProperties')}
            >
              <View style={styles.alertIcon}>
                <Ionicons name="home-outline" size={17} color={colors.ink3} />
              </View>
              <View style={styles.alertBody}>
                <Text style={styles.alertTitle}>空置房源</Text>
                <Text style={styles.alertDesc}>有 {statusCount.vacant} 套待出租 / 出售，去发布委托</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </TouchableOpacity>
          </View>
        )}

        {/* ===== 房源简卡：前 3 条 + 全部入口 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>房源</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => go('OwnerProperties')}>
            <Text style={styles.moreLink}>全部 {properties.length} 套 ›</Text>
          </TouchableOpacity>
        </View>
        {properties.length > 0 ? (
          <View style={styles.card}>
            {properties.slice(0, 3).map((p, idx) => {
              const st = propStatusText(p);
              const last = idx === Math.min(properties.length, 3) - 1;
              return (
                <TouchableOpacity
                  key={p.id || String(idx)}
                  style={[styles.propListItem, last && styles.propListLast]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('OwnerPropertyDetail', { id: p.id })}
                >
                  <View style={[styles.propListIcon, { backgroundColor: `${st.color}14` }]}>
                    <Ionicons name="home-outline" size={18} color={st.color} />
                  </View>
                  <View style={styles.todoBody}>
                    <View style={styles.propListTop}>
                      <Text style={styles.propListName} numberOfLines={1}>{propTitle(p)}</Text>
                      <View style={[styles.miniBadge, { backgroundColor: `${st.color}1F` }]}>
                        <Text style={[styles.miniBadgeText, { color: st.color }]}>{st.text}</Text>
                      </View>
                    </View>
                    <Text style={styles.propListMeta} numberOfLines={1}>
                      {propMeta(p)}
                      {p.tenant_name ? ` · 租客 ${p.tenant_name}` : ''}
                    </Text>
                    <Text style={styles.propListPrice}>
                      {p.monthly_rent
                        ? `${money(Number(p.monthly_rent), p.currency || currency)}/月`
                        : p.sale_price
                          ? money(Number(p.sale_price), p.currency || currency)
                          : '暂无挂牌价'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.card}>
            <EmptyState
              icon="key-outline"
              title="暂无房源"
              sub="在房源管理页发布委托挂牌，让平台帮你出租或出售"
              actionLabel="去房源管理"
              onAction={() => go('OwnerProperties')}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingTop: colors.spacing.md, paddingBottom: 32 },

  /* ===== 收益 Hero 概览：本月实收主数字 + 套数小列 ===== */
  heroCard: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    padding: colors.spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    ...colors.shadow.md,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },
  heroPropsLink: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },
  heroTotalRow: { marginTop: 8 },
  heroTotal: {
    fontSize: colors.fontSize['3xl'],
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  heroStats: { flexDirection: 'row', gap: 10, marginTop: colors.spacing.xl },
  heroStatSmall: { flex: 1 },
  heroStatSmallVal: { fontSize: colors.fontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroStatSmallLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2 },

  /* ===== 区块标题 ===== */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.xl,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '600' },

  /* ===== 通用卡片 ===== */
  card: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  /* ===== 趋势图卡脚注（唯一跳「付款中心」入口）===== */
  chartFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: colors.spacing.lg,
    paddingTop: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  chartFootText: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },

  /* ===== 提醒条 ===== */
  alertCard: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    paddingHorizontal: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  alertIcon: {
    width: 34,
    height: 34,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBody: { flex: 1, minWidth: 0 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  alertDesc: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 2 },

  /* ===== 房源简卡 ===== */
  moreLink: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },
  propListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  propListLast: { borderBottomWidth: 0, paddingBottom: 0 },
  propListIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoBody: { flex: 1, minWidth: 0 },
  propListTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  propListName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  propListMeta: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  propListPrice: {
    fontSize: colors.fontSize.base,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  miniBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: colors.radius.full },
  miniBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
});