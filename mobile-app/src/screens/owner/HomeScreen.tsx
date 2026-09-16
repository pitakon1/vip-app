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
import { leasesApi, maintenanceApi, ownerApi, ownersApi, paymentsApi } from '@/services/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type IoniconName = keyof typeof Ionicons.glyphMap;

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const money = (v?: number, c?: string) =>
  `${cur(c)}${Number(v || 0).toLocaleString()}`;

const formatDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '-');

const daysUntil = (dateStr?: string) => {
  if (!dateStr) return Number.NaN;
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return Number.NaN;
  return Math.ceil((target - Date.now()) / 86400000);
};

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

interface OwnerPayment {
  id: string;
  amount?: number;
  currency?: string;
  payment_type?: string;
  status?: string;
  due_date?: string;
  paid_at?: string;
  description?: string;
  property?: string | null;
  [key: string]: any;
}

interface OwnerLease {
  id: string;
  property_id?: string;
  property_name?: string;
  tenant_name?: string;
  end_date?: string;
  monthly_rent?: number;
  currency?: string;
  status?: string;
}

interface MaintenanceTicket {
  id: string;
  property_id?: string;
  tenant_id?: string;
  title?: string;
  status?: string;
  created_at?: string;
  tenant_name?: string;
  [key: string]: any;
}

// 快捷入口：4 列图标网格，配色对齐原型（收益 teal / 文档 info / 服务 success / 缴费 warning）
const QUICK_ACTIONS: {
  key: string;
  label: string;
  icon: IoniconName;
  color: string;
  bg: string;
  route: string;
}[] = [
  {
    key: 'income',
    label: '收益报表',
    icon: 'cash-outline',
    color: colors.primary,
    bg: colors.alpha(colors.primaryRgb, 0.1),
    route: 'OwnerIncome',
  },
  {
    key: 'documents',
    label: '租房文档',
    icon: 'document-text-outline',
    color: colors.info,
    bg: colors.alpha(colors.infoRgb, 0.1),
    route: 'OwnerDocuments',
  },
  {
    key: 'services',
    label: '物业服务',
    icon: 'compass-outline',
    color: colors.success,
    bg: colors.alpha(colors.successRgb, 0.1),
    route: 'OwnerServices',
  },
  {
    key: 'payments',
    label: '账单缴费',
    icon: 'card-outline',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.1),
    route: 'OwnerPayments',
  },
];

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [payments, setPayments] = useState<OwnerPayment[]>([]);
  const [leases, setLeases] = useState<OwnerLease[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [annual, setAnnual] = useState<AnnualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const year = new Date().getFullYear();
    const [propRes, sumRes, payRes, leaseRes, ticketRes] = await Promise.allSettled([
      ownerApi.properties(),
      ownersApi.annualSummary(year),
      paymentsApi.mine(),
      leasesApi.list({ page: 1, limit: 100 }),
      maintenanceApi.list({ page: 1, limit: 100 }),
    ]);

    const pick = <T,>(res: PromiseSettledResult<any>): T[] => {
      if (res.status !== 'fulfilled') return [];
      const data = res.value?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      return Array.isArray(items) ? (items as T[]) : [];
    };

    setProperties(pick<OwnerProperty>(propRes));
    setPayments(pick<OwnerPayment>(payRes));
    setLeases(pick<OwnerLease>(leaseRes));
    setTickets(pick<MaintenanceTicket>(ticketRes));
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

  const currency = properties[0]?.currency || payments[0]?.currency || 'THB';

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

  /* ===== 待处理：待确认租金 ===== */
  const pendingPayments = useMemo(
    () =>
      payments.filter((p) =>
        ['pending', 'overdue', 'processing'].includes(String(p.status || '').toLowerCase()),
      ),
    [payments],
  );

  /* ===== 最近入账：已到账记录 ===== */
  const recentIncomes = useMemo(
    () =>
      payments
        .filter((p) => ['succeeded', 'paid'].includes(String(p.status || '').toLowerCase()))
        .slice(0, 4),
    [payments],
  );

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

  const rentedProp = useMemo(
    () =>
      properties.find((p) =>
        ['rented', 'active'].includes(String(p.status || '').toLowerCase()),
      ),
    [properties],
  );
  const saleProp = useMemo(
    () =>
      properties.find((p) =>
        ['for_sale', 'on_sale', 'sale'].includes(String(p.status || '').toLowerCase()),
      ),
    [properties],
  );

  /* ===== 待处理：60 天内到期租约 ===== */
  const expiringLeases = useMemo(
    () =>
      leases
        .filter((l) => !!l.end_date)
        .filter((l) => {
          const d = daysUntil(l.end_date);
          return !Number.isNaN(d) && d >= 0 && d <= 60;
        })
        .sort((a, b) => daysUntil(a.end_date) - daysUntil(b.end_date)),
    [leases],
  );

  const propTitle = (p: OwnerProperty) =>
    p.name ||
    (p.project_name ? `${p.project_name}·${p.room_number ?? ''}` : p.room_number || p.address || '房源');

  const propMeta = (p: OwnerProperty) =>
    `${p.bedrooms ?? 0}室${p.bathrooms ?? 0}厅 ${p.size_sqm ?? 0}㎡`;

  /* ===== 待处理：名下房源的报修待审批工单 =====
     后端 /maintenance-tickets 未按业主归属过滤，故在前端按自己房源 property_id + open 状态筛出 */
  const pendingRepairs = useMemo(() => {
    const myIds = properties.map((p) => String(p.id));
    return tickets.filter(
      (t) =>
        String(t.status || '').toLowerCase() === 'open' &&
        myIds.includes(String(t.property_id || '')),
    );
  }, [tickets, properties]);

  const propTitleById = useCallback(
    (propertyId?: string) => {
      const p = properties.find((x) => String(x.id) === String(propertyId));
      return p ? propTitle(p) : '房源';
    },
    // propTitle 为纯函数，依赖仅 properties
    [properties],
  );

  const expiring = expiringLeases[0];
  const saleTodoDesc = saleProp
    ? `${propTitle(saleProp)} 预估价 ${money(Number(saleProp.sale_price || 0) * 0.97, currency)} - ${money(
        Number(saleProp.sale_price || 0) * 1.03,
        currency,
      )}`
    : null;
  const todoCount = (saleTodoDesc ? 1 : 0) + (expiring ? 1 : 0) + pendingRepairs.length;

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
        {/* ===== 双业务入口：委托出租 / 委托出售 ===== */}
        <View style={styles.dualRow}>
          <TouchableOpacity
            style={[styles.dualEntry, styles.dualEntryRent]}
            activeOpacity={0.8}
            onPress={() => go('OwnerMarketing')}
          >
            <View style={[styles.dualIcon, { backgroundColor: `rgba(${colors.primaryRgb}, 0.12)` }]}>
              <Ionicons name="home-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.dualBody}>
              <Text style={styles.dualTitle}>委托出租</Text>
              <Text style={styles.dualSub}>托管出租 · 省心收租</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dualEntry, styles.dualEntrySale]}
            activeOpacity={0.8}
            onPress={() => go('OwnerMarketing')}
          >
            <View style={[styles.dualIcon, { backgroundColor: `rgba(${colors.warningRgb}, 0.12)` }]}>
              <Ionicons name="pricetag-outline" size={20} color={colors.warning} />
            </View>
            <View style={styles.dualBody}>
              <Text style={styles.dualTitle}>委托出售</Text>
              <Text style={styles.dualSub}>在线估价 · 挂牌成交</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
        </View>

        {/* ===== 预警卡：待确认租金（有数据才渲染）===== */}
        {pendingPayments.length > 0 && (
          <View style={styles.warnCard}>
            <View style={styles.warnTop}>
              <View style={styles.warnIcon}>
                <Ionicons name="notifications-outline" size={22} color={colors.warning} />
              </View>
              <View style={styles.warnBody}>
                <Text style={styles.warnTitle}>{pendingPayments.length} 笔租金待确认</Text>
                <Text style={styles.warnDesc} numberOfLines={2}>
                  {pendingPayments
                    .slice(0, 3)
                    .map((p) => `${p.property || p.description || '租金'} ${money(Number(p.amount || 0), p.currency || currency)}`)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.warnBtn}
              activeOpacity={0.85}
              onPress={() => go('OwnerIncome')}
            >
              <Text style={styles.warnBtnText}>去确认</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ===== 收益总览 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>收益总览</Text>
          <Text style={styles.sectionHint}>租金 + 售房款</Text>
        </View>
        <View style={styles.card}>
          {income.hasData ? (
            <>
              <View style={styles.incomeHead}>
                <Text style={styles.mutedSm}>本月应收</Text>
                <Text style={styles.incomeDue}>{money(income.due, currency)}</Text>
              </View>
              <View style={styles.incomeCols}>
                <View style={styles.incomeCol}>
                  <Text style={styles.mutedSm}>已收</Text>
                  <Text style={[styles.incomeColVal, { color: colors.success }]}>
                    {money(income.received, currency)}
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
                <Text style={styles.incomeRate}>已收 {income.rate}%</Text>
              </View>
            </>
          ) : (
            <EmptyState
              icon="stats-chart-outline"
              title="暂无收益数据"
              sub="名下房源产生租金或售房款后，这里会按本月口径汇总"
            />
          )}
        </View>

        {/* ===== 待处理事项 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>待处理事项</Text>
          <Text style={styles.sectionHint}>{todoCount} 项</Text>
        </View>
        <View style={styles.card}>
          {!expiring && !saleTodoDesc ? (
            <EmptyState icon="checkmark-circle-outline" title="暂无待处理事项" sub="租约与委托都正常" />
          ) : (
            <>
              {expiring && (
                <View style={styles.todoRow}>
                  <Ionicons name="time-outline" size={20} color={colors.warning} />
                  <View style={styles.todoBody}>
                    <Text style={styles.todoTitle} numberOfLines={1}>
                      {expiring.property_name || expiring.property_id || '房源'} 租约 {daysUntil(expiring.end_date)} 天后到期
                    </Text>
                    <Text style={styles.todoSub}>
                      租客：{expiring.tenant_name || '-'} · 到期 {formatDate(expiring.end_date)}
                    </Text>
                  </View>
                </View>
              )}

              {saleTodoDesc && (
                <View style={[styles.todoRow, styles.todoRowSale]}>
                  <View style={styles.todoSaleIcon}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.warning} />
                  </View>
                  <View style={styles.todoBody}>
                    <Text style={styles.todoTitle} numberOfLines={1}>卖房委托 · 估价待确认</Text>
                    <Text style={styles.todoSub} numberOfLines={2}>{saleTodoDesc}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    activeOpacity={0.85}
                    onPress={() => go('OwnerMarketing')}
                  >
                    <Text style={styles.primaryBtnText}>去确认</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* ===== 租客报修待审批（无待审批工单时不渲染，避免空卡）===== */}
        {pendingRepairs.length > 0 && (
          <View style={[styles.card, styles.repairCard]}>
            <View style={styles.repairHead}>
              <Text style={styles.repairTitle}>租客报修待审批</Text>
              <View style={[styles.miniBadge, { backgroundColor: colors.alpha(colors.warningRgb, 0.12) }]}>
                <Text style={[styles.miniBadgeText, { color: colors.warning }]}>
                  {pendingRepairs.length} 条
                </Text>
              </View>
            </View>
            {pendingRepairs.map((t, idx) => (
              <View
                key={t.id || String(idx)}
                style={[styles.repairRow, idx === pendingRepairs.length - 1 && styles.repairRowLast]}
              >
                <View style={styles.repairIcon}>
                  <Ionicons name="construct-outline" size={18} color={colors.warning} />
                </View>
                <View style={styles.todoBody}>
                  <Text style={styles.repairRowTitle} numberOfLines={1}>
                    {propTitleById(t.property_id)} · {t.title || '报修工单'}
                  </Text>
                  <Text style={styles.repairRowSub} numberOfLines={1}>
                    {t.tenant_name || '租客'} · {formatDate(t.created_at)} 提交
                  </Text>
                </View>
                {/* 业主侧暂无审批接口（后端 PATCH 仅 agent+ 可用），跳转「服务」跟进工单 */}
                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.85}
                  onPress={() => go('OwnerServices')}
                >
                  <Text style={styles.primaryBtnText}>审批</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ===== 资产概览 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>资产概览</Text>
          <Text style={styles.sectionHint}>共 {properties.length} 套</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.statGrid}>
            <View style={styles.statCell}>
              <Text style={styles.statVal}>{properties.length}</Text>
              <Text style={styles.statLabel}>名下房源</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: colors.success }]}>{statusCount.rented}</Text>
              <Text style={styles.statLabel}>在租房源</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: colors.ink3 }]}>{statusCount.vacant}</Text>
              <Text style={styles.statLabel}>空置房源</Text>
            </View>
          </View>

          {(rentedProp || saleProp) && (
            <View style={styles.propRow}>
              {rentedProp && (
                <TouchableOpacity
                  style={[styles.propCard, styles.propCardRent]}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('OwnerPropertyDetail' as any, { id: rentedProp.id } as any)}
                >
                  <View style={[styles.propThumb, { backgroundColor: `rgba(${colors.primaryRgb}, 0.1)` }]}>
                    <Ionicons name="home-outline" size={26} color={colors.primary} />
                  </View>
                  <View style={styles.propHead}>
                    <Text style={styles.propName} numberOfLines={1}>{propTitle(rentedProp)}</Text>
                    <View style={[styles.miniBadge, { backgroundColor: colors.alpha(colors.successRgb, 0.12) }]}>
                      <Text style={[styles.miniBadgeText, { color: colors.success }]}>在租</Text>
                    </View>
                  </View>
                  <Text style={styles.propMeta} numberOfLines={1}>{propMeta(rentedProp)}</Text>
                  <Text style={styles.propPrice}>
                    {money(Number(rentedProp.monthly_rent || 0), rentedProp.currency || currency)}
                    <Text style={styles.propPriceUnit}>/月</Text>
                  </Text>
                </TouchableOpacity>
              )}

              {saleProp && (
                <TouchableOpacity
                  style={[styles.propCard, styles.propCardSale]}
                  activeOpacity={0.8}
                  onPress={() => go('OwnerMarketing')}
                >
                  <View style={[styles.propThumb, { backgroundColor: `rgba(${colors.warningRgb}, 0.1)` }]}>
                    <Ionicons name="pricetag-outline" size={26} color={colors.warning} />
                  </View>
                  <View style={styles.propHead}>
                    <Text style={styles.propName} numberOfLines={1}>{propTitle(saleProp)}</Text>
                    <View style={[styles.miniBadge, { backgroundColor: colors.alpha(colors.warningRgb, 0.12) }]}>
                      <Text style={[styles.miniBadgeText, { color: colors.warning }]}>在售</Text>
                    </View>
                  </View>
                  <Text style={styles.propMeta} numberOfLines={1}>{propMeta(saleProp)}</Text>
                  <Text style={styles.propPrice}>
                    {money(Number(saleProp.sale_price || 0), saleProp.currency || currency)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!rentedProp && !saleProp && (
            <EmptyState
              icon="key-outline"
              title="暂无房源数据"
              sub="去委托挂牌，让平台帮你出租或出售"
              actionLabel="去委托挂牌"
              onAction={() => go('OwnerMarketing')}
            />
          )}
        </View>

        {/* ===== 快捷入口 4 列 ===== */}
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.quickCell}
              activeOpacity={0.7}
              onPress={() => go(item.route)}
            >
              <View style={[styles.quickIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ===== 最近入账 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>最近入账</Text>
          <Text style={styles.sectionHint}>{recentIncomes.length} 笔</Text>
        </View>
        <View style={styles.card}>
          {recentIncomes.length === 0 ? (
            <EmptyState icon="wallet-outline" title="暂无入账记录" sub="租金到账后会在这里按时间列出" />
          ) : (
            recentIncomes.map((p, idx) => (
              <View
                key={p.id || String(idx)}
                style={[styles.incomeRow, idx === recentIncomes.length - 1 && styles.incomeRowLast]}
              >
                <View style={styles.incomeRowIcon}>
                  <Ionicons name="cash-outline" size={18} color={colors.success} />
                </View>
                <View style={styles.incomeRowBody}>
                  <Text style={styles.incomeRowTitle} numberOfLines={1}>
                    {p.property || p.description || '租金入账'}
                  </Text>
                  <Text style={styles.incomeRowSub} numberOfLines={1}>
                    {formatDate(p.paid_at || p.due_date)}
                  </Text>
                </View>
                <View style={styles.incomeRowRight}>
                  <Text style={styles.incomeRowAmount}>
                    +{money(Number(p.amount || 0), p.currency || currency)}
                  </Text>
                  <View style={[styles.miniBadge, { backgroundColor: colors.alpha(colors.successRgb, 0.12) }]}>
                    <Text style={[styles.miniBadgeText, { color: colors.success }]}>已到账</Text>
                  </View>
                </View>
              </View>
            ))
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

  /* ===== 资产概览 ===== */
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

  /* ===== 快捷入口 ===== */
  quickGrid: {
    flexDirection: 'row',
    marginHorizontal: colors.spacing.md,
    marginBottom: colors.spacing.lg,
  },
  quickCell: { width: '25%', alignItems: 'center', paddingVertical: 10, gap: 6 },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: colors.fontSize.sm, color: colors.ink2, fontWeight: '600' },

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