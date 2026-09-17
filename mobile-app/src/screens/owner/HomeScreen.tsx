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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
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

  /* ===== 收益总览：取年度汇总最近一个月桶（真实数据）===== */
  const income = useMemo(() => {
    const buckets = annual?.by_month ?? [];
    const bucket = buckets.length ? buckets[buckets.length - 1] : null;
    const received = Number(bucket?.received ?? 0);
    const pending = Number(bucket?.pending ?? 0) + Number(bucket?.overdue ?? 0);
    const due = received + pending;
    return {
      hasData: !!bucket && due > 0,
      due,
      received,
      pending,
      rate: due > 0 ? Math.round((received / due) * 100) : 0,
    };
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
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ===== 收益总览（点击进入收益中心查看详情）===== */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => go('OwnerIncome')}
        >
          {income.hasData ? (
            <>
              <View style={styles.incomeHead}>
                <Text style={styles.mutedSm}>本月实收</Text>
                <Text style={styles.incomeDue}>{money(income.received, currency)}</Text>
              </View>
              <View style={styles.incomeCols}>
                <View style={styles.incomeCol}>
                  <Text style={styles.mutedSm}>本月应收</Text>
                  <Text style={[styles.incomeColVal, { color: colors.ink }]}>
                    {money(income.due, currency)}
                  </Text>
                </View>
                <View style={[styles.incomeCol, styles.incomeColWarn]}>
                  <Text style={styles.mutedSm}>待收</Text>
                  <Text style={[styles.incomeColVal, { color: colors.warning }]}>
                    {money(income.pending, currency)}
                  </Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${income.rate}%` }]} />
              </View>
              <View style={styles.incomeFoot}>
                <Text style={styles.mutedSm}>本月收款进度</Text>
                <Text style={styles.incomeRate}>已收 {income.rate}% · 查看明细 ›</Text>
              </View>
            </>
          ) : (
            <EmptyState
              icon="stats-chart-outline"
              title="暂无收益数据"
              sub="名下房源产生租金或售房款后，这里会按本月口径汇总"
              actionLabel="查看收益中心"
              onAction={() => go('OwnerIncome')}
            />
          )}
        </TouchableOpacity>

        {/* ===== 房源管理 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>房源管理</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => go('OwnerProperties')}>
            <Text style={styles.moreLink}>全部 {properties.length} 套 ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <View style={styles.statGrid}>
            <View style={styles.statCell}>
              <Text style={styles.statVal}>{properties.length}</Text>
              <Text style={styles.statLabel}>名下房源</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: colors.success }]}>{statusCount.rented}</Text>
              <Text style={styles.statLabel}>在租</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: colors.ink3 }]}>{statusCount.vacant}</Text>
              <Text style={styles.statLabel}>空置</Text>
            </View>
          </View>

          {properties.length > 0 && (
            <View style={styles.propList}>
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
          )}

          {properties.length === 0 && (
            <EmptyState
              icon="key-outline"
              title="暂无房源"
              sub="在房源管理页发布委托挂牌，让平台帮你出租或出售"
              actionLabel="去房源管理"
              onAction={() => go('OwnerProperties')}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingTop: colors.spacing.md, paddingBottom: 32 },

  /* ===== 双业务入口 ===== */
  dualRow: { flexDirection: 'row', gap: 10, paddingHorizontal: colors.spacing.lg, marginBottom: colors.spacing.lg },
  dualEntry: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  dualEntryRent: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  dualEntrySale: { borderLeftWidth: 3, borderLeftColor: colors.warning },
  dualIcon: { width: 34, height: 34, borderRadius: colors.radius.md, alignItems: 'center', justifyContent: 'center' },
  dualBody: { flex: 1, minWidth: 0 },
  dualTitle: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.ink },
  dualSub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2 },

  /* ===== 预警卡 ===== */
  warnCard: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    padding: 14,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.alpha(colors.warningRgb, 0.35),
    backgroundColor: colors.alpha(colors.warningRgb, 0.07),
  },
  warnTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warnIcon: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha(colors.warningRgb, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnBody: { flex: 1, minWidth: 0 },
  warnTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  warnDesc: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 3, lineHeight: 18 },
  warnBtn: {
    marginTop: colors.spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    ...colors.shadow.primary,
  },
  warnBtnText: { color: colors.primaryForeground, fontSize: colors.fontSize.base, fontWeight: '700' },

  /* ===== 区块标题 ===== */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.xl,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },

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
  mutedSm: { fontSize: colors.fontSize.sm, color: colors.ink3 },

  /* ===== 收益总览 ===== */
  incomeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  incomeDue: {
    fontSize: colors.fontSize['2xl'],
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  incomeCols: { flexDirection: 'row', gap: 12, marginTop: colors.spacing.lg },
  incomeCol: {
    flex: 1,
    padding: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  incomeColWarn: {
    borderColor: colors.alpha(colors.warningRgb, 0.35),
    backgroundColor: colors.alpha(colors.warningRgb, 0.07),
  },
  incomeColVal: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: colors.spacing.lg,
  },
  progressBar: { height: 8, borderRadius: colors.radius.full, backgroundColor: colors.primary },
  incomeFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  incomeRate: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '700' },

  /* ===== 待处理事项 ===== */
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todoRowSale: { marginTop: colors.spacing.lg },
  todoSaleIcon: {
    width: 34,
    height: 34,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha(colors.warningRgb, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoBody: { flex: 1, minWidth: 0 },
  todoTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  todoSub: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 3, lineHeight: 18 },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  ghostBtnText: { fontSize: colors.fontSize.sm, fontWeight: '600', color: colors.ink2 },
  primaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
  },
  primaryBtnText: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.primaryForeground },

  /* ===== 租客报修待审批 ===== */
  repairCard: { paddingHorizontal: colors.spacing.lg },
  repairHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  repairTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  repairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  repairRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  repairIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha(colors.warningRgb, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  repairRowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  repairRowSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },

  /* ===== 房源管理 ===== */
  moreLink: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },
  statGrid: { flexDirection: 'row', gap: 10 },
  statCell: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  propList: { marginTop: colors.spacing.md },
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
  propRow: { flexDirection: 'row', gap: 10, marginTop: colors.spacing.md },
  propCard: {
    flex: 1,
    padding: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  propCardRent: { backgroundColor: colors.alpha(colors.primaryRgb, 0.04) },
  propCardSale: { backgroundColor: colors.alpha(colors.warningRgb, 0.05) },
  propThumb: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  propHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  propName: { flex: 1, fontSize: colors.fontSize.base, fontWeight: '700', color: colors.ink },
  propMeta: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 3 },
  propPrice: {
    fontSize: colors.fontSize.base,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  propPriceUnit: { fontSize: colors.fontSize.xs, fontWeight: '400', color: colors.ink3 },
  miniBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: colors.radius.full },
  miniBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },

  /* ===== 最近入账 ===== */
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  incomeRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  incomeRowIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha(colors.successRgb, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeRowBody: { flex: 1, minWidth: 0 },
  incomeRowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  incomeRowSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  incomeRowRight: { alignItems: 'flex-end', gap: 3 },
  incomeRowAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.success,
    fontVariant: ['tabular-nums'],
  },
});