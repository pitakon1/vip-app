/**
 * 业主「资产管理」独立页（我的 → 资产管理 / OwnerHome 路由）。
 * 首页已统一为租客同款视觉（问候/搜索/资产速览条/房源 rail），此处只承载业主差异内容：
 * 资产概览（出租率）→ 收益趋势 → 房源概览 → 我的上架单 → 待办/提醒。
 * 明细仍由各栈页（OwnerProperties/Payments/Marketing/Services/Documents/MyListings）承担；
 * 区块标题等视觉参数与统一首页保持一致（sectionTitle 18px / letterSpacing -0.3）。
 * 数据一律复用现有真实接口，不编造。
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import BarChart from '@/components/charts/BarChart';
import ProgressStack from '@/components/charts/ProgressStack';
import colors from '@/theme/colors';
import { ownerApi, ownersApi, listingApi, paymentsApi } from '@/services/api';
import { fmtMoney as money } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { Listing } from '@/types';

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

// 上架单状态元数据（仓库 MyListingsScreen 同口径）
const LIST_STATUS: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: '待审核', color: colors.warning, bg: colors.warningLight },
  active: { text: '已上架', color: colors.success, bg: colors.successLight },
  rejected: { text: '已驳回', color: colors.error, bg: colors.errorLight },
  closed: { text: '已下架', color: colors.ink3, bg: colors.surface2 },
  sold: { text: '已售出', color: colors.primary, bg: colors.sidebarActive },
  rented: { text: '已出租', color: colors.primary, bg: colors.sidebarActive },
};

interface HomePayload {
  properties: OwnerProperty[];
  annual: AnnualSummary | null;
  listings: Listing[];
  payments: any[];
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const uid = user?.id ?? 'anon';
  const year = new Date().getFullYear();

  const pick = <T,>(res: PromiseSettledResult<any>): T[] => {
    if (res.status !== 'fulfilled') return [];
    const data = res.value?.data;
    const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
    return Array.isArray(items) ? (items as T[]) : [];
  };

  const q = useCachedQuery<HomePayload>({
    queryKey: ['owner-home', uid, String(year)],
    cacheKey: `owner-home:${uid}:${year}`,
    queryFn: async () => {
      const [propRes, sumRes, listRes, payRes] = await Promise.allSettled([
        ownerApi.properties(),
        ownersApi.annualSummary(year),
        listingApi.list({ page: 1, page_size: 100 }),
        paymentsApi.mine(),
      ]);
      return {
        properties: pick<OwnerProperty>(propRes),
        annual: sumRes.status === 'fulfilled' ? ((sumRes.value?.data as AnnualSummary) ?? null) : null,
        listings: pick<Listing>(listRes),
        payments: pick<any>(payRes),
      };
    },
  });

  const payload = q.data;
  const properties = payload?.properties ?? [];
  const annual = payload?.annual ?? null;
  // 我的上架单：仅展示当前用户发布（对齐 MyListingsScreen 口径；非 staff 后端仅返回 active）
  const rows = payload?.listings ?? [];
  const listings = user?.id
    ? rows.filter((r) => String(r.publisher_user_id) === String(user.id))
    : rows;
  // 待缴账单：payments 中未结清（pending/processing）合计与笔数
  const pays = payload?.payments ?? [];
  const due = pays.filter((p) => !['succeeded', 'refunded'].includes(String(p.status || '')));
  const dueCount = due.length;
  const dueTotal = due.reduce((s, p) => s + Number(p.amount || 0), 0);

  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const onRefresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  // 币种优先取年度汇总，其次房源
  const currency = annual?.currency || properties[0]?.currency || 'THB';

  const go = (target: string) => navigation.navigate(target as any);

  /* ===== 本月实收 / 年累计实收：取年度汇总（真实数据） ===== */
  const monthReceived = useMemo(() => {
    const buckets = annual?.by_month ?? [];
    const bucket = buckets.length ? buckets[buckets.length - 1] : null;
    return Number(bucket?.received ?? 0);
  }, [annual]);

  const yearReceived = useMemo(() => Number(annual?.totals?.received ?? 0), [annual]);

  /* ===== 年度收益趋势 BarChart ===== */
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

  /* ===== 资产概览统计（在管/出租中/空置/在售） ===== */
  const statusCount = useMemo(() => {
    const count = { total: properties.length, vacant: 0, rented: 0, forSale: 0 };
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

  const propStatusStyle = (p: OwnerProperty): { text: string; color: string; bg: string } => {
    const s = String(p.status || '').toLowerCase();
    if (s === 'vacant' || s === 'available') return { text: '空置', color: colors.warning, bg: `${colors.warningRgb}1F` };
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale')
      return { text: '在售', color: colors.info, bg: `${colors.infoRgb}1F` };
    return { text: '出租中', color: colors.success, bg: `${colors.successRgb}1F` };
  };

  const listingTitle = (l: Listing) => l.room_number || l.address || '房源上架单';
  const listingPrice = (l: Listing) =>
    l.listing_type === 'sell' && l.asking_price != null
      ? money(l.asking_price, l.currency)
      : l.monthly_rent != null
        ? `${money(l.monthly_rent, l.currency)}/月`
        : '—';
  const listingCommission = (l: Listing) => {
    if (l.owner_commission_rate != null) return `佣金 ${l.owner_commission_rate}% 归业主`;
    if (l.listing_type === 'sell') return l.sale_commission_rate != null ? `卖佣 ${l.sale_commission_rate}%` : '出售';
    return l.rental_commission_months != null ? `租佣 ${l.rental_commission_months}个月` : '出租';
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载资产总览…" />
      </View>
    );
  }

  // 是否展示待办/提醒（空置房源 或 待缴账单）
  const hasTodo = statusCount.vacant > 0 || dueCount > 0 || dueTotal > 0;

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
        {/* ===== 1. 资产概览卡：本月实收 + 在管/出租中/空置/在售 + 年累计实收 + 出租率条 ===== */}
        <View style={styles.heroCard}>
          <View style={styles.hPropsHead}>
            <View>
              <Text style={styles.heroLabel}>本月租金实收</Text>
              <Text style={styles.heroTotal}>{money(monthReceived, currency)}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => go('OwnerProperties')}>
              <Text style={styles.heroPropsLink}>在管 {statusCount.total} 套 ›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.success }]}>{statusCount.rented}</Text>
              <Text style={styles.heroStatSmallLabel}>出租中</Text>
            </View>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.warning }]}>{statusCount.vacant}</Text>
              <Text style={styles.heroStatSmallLabel}>空置</Text>
            </View>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.info }]}>{statusCount.forSale}</Text>
              <Text style={styles.heroStatSmallLabel}>在售</Text>
            </View>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.primary }]}>
                {yearReceived ? money(yearReceived, annual?.currency || currency) : '—'}
              </Text>
              <Text style={styles.heroStatSmallLabel}>年累计收益</Text>
            </View>
          </View>

          {statusCount.total > 0 ? (
            <View style={styles.heroStack}>
              <ProgressStack
                totalLabel="资产占用分布"
                totalValue={`共 ${statusCount.total} 套`}
                barHeight={10}
                segments={[
                  { value: statusCount.rented, color: colors.success, label: '出租中', subLabel: `${statusCount.rented} 套` },
                  { value: statusCount.vacant, color: colors.warning, label: '空置', subLabel: `${statusCount.vacant} 套` },
                  { value: statusCount.forSale, color: colors.info, label: '在售', subLabel: `${statusCount.forSale} 套` },
                ]}
              />
            </View>
          ) : (
            <EmptyState
              icon="key-outline"
              title="名下暂无在管房源"
              sub="发布或登记你的第一套房后，这里会展示占用分布与收益"
              actionLabel="去登记房源"
              onAction={() => go('OwnerProperties')}
            />
          )}
        </View>

        {/* ===== 2. 收益趋势：月度实收 BarChart ===== */}
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
        </View>

        {/* ===== 3. 房源概览：前 3 套 + 发布房源 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>房源概览</Text>
          <TouchableOpacity
            style={styles.publishBtn}
            activeOpacity={0.8}
            onPress={() => go('ListingPublish')}
          >
            <Ionicons name="add" size={15} color={colors.primaryForeground} />
            <Text style={styles.publishBtnText}>发布房源</Text>
          </TouchableOpacity>
        </View>
        {properties.length > 0 ? (
          <View style={styles.card}>
            {properties.slice(0, 3).map((p, idx) => {
              const st = propStatusStyle(p);
              const last = idx === Math.min(properties.length, 3) - 1;
              return (
                <TouchableOpacity
                  key={p.id || String(idx)}
                  style={[styles.propListItem, last && styles.propListLast]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('OwnerPropertyDetail', { id: p.id })}
                >
                  <View style={[styles.propListIcon, { backgroundColor: st.bg }]}>
                    <Ionicons name="home-outline" size={18} color={st.color} />
                  </View>
                  <View style={styles.todoBody}>
                    <View style={styles.propListTop}>
                      <Text style={styles.propListName} numberOfLines={1}>{propTitle(p)}</Text>
                      <View style={[styles.miniBadge, { backgroundColor: st.bg }]}>
                        <Text style={[styles.miniBadgeText, { color: st.color }]}>{st.text}</Text>
                      </View>
                    </View>
                    <Text style={styles.propListMeta} numberOfLines={1}>
                      {p.address || propMeta(p)}
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
            <TouchableOpacity style={styles.moreRow} activeOpacity={0.7} onPress={() => go('OwnerProperties')}>
              <Text style={styles.moreLink}>全部 {statusCount.total} 套 ›</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <EmptyState
              icon="key-outline"
              title="暂无房源"
              sub="点击上方「发布房源」建立你的第一套房档案"
              actionLabel="去发布房源"
              onAction={() => go('ListingPublish')}
            />
          </View>
        )}

        {/* ===== 4. 我的上架单：最近若干 + 空态去发布 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>我的上架单</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => go('MyListings')}>
            <Text style={styles.moreLink}>全部 {listings.length} 条 ›</Text>
          </TouchableOpacity>
        </View>
        {listings.length > 0 ? (
          <View style={styles.card}>
            {listings.slice(0, 3).map((l, idx) => {
              const st = LIST_STATUS[l.status] ?? LIST_STATUS.pending;
              const last = idx === Math.min(listings.length, 3) - 1;
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.propListItem, last && styles.propListLast]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('ListingPublish', { id: l.id })}
                >
                  <View style={[styles.propListIcon, { backgroundColor: st.bg }]}>
                    <Ionicons
                      name={l.listing_type === 'sell' ? 'storefront-outline' : 'home-outline'}
                      size={18}
                      color={st.color}
                    />
                  </View>
                  <View style={styles.todoBody}>
                    <View style={styles.propListTop}>
                      <Text style={styles.propListName} numberOfLines={1}>{listingTitle(l)}</Text>
                      <View style={[styles.miniBadge, { backgroundColor: st.bg }]}>
                        <Text style={[styles.miniBadgeText, { color: st.color }]}>{st.text}</Text>
                      </View>
                    </View>
                    <Text style={styles.propListMeta} numberOfLines={1}>
                      {l.listing_type === 'sell' ? '出售' : '出租'} · {listingCommission(l)}
                    </Text>
                    <Text style={styles.propListPrice}>{listingPrice(l)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.card}>
            <EmptyState
              icon="business-outline"
              title="暂无上架单"
              sub="把房源发布到平台，让更多租客或买家看到"
              actionLabel="去发布"
              onAction={() => go('ListingPublish')}
            />
          </View>
        )}

        {/* ===== 5. 待办/提醒（有数据则展示） ===== */}
        {hasTodo && (
          <View style={styles.alertCard}>
            {statusCount.vacant > 0 && (
              <TouchableOpacity
                style={styles.alertRow}
                activeOpacity={0.7}
                onPress={() => go('OwnerProperties')}
              >
                <View style={styles.alertIcon}>
                  <Ionicons name="home-outline" size={17} color={colors.warning} />
                </View>
                <View style={styles.alertBody}>
                  <Text style={styles.alertTitle}>空置房源待处理</Text>
                  <Text style={styles.alertDesc}>有 {statusCount.vacant} 套待出租 / 出售，去发布委托</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </TouchableOpacity>
            )}
            {(dueCount > 0 || dueTotal > 0) && (
              <TouchableOpacity
                style={styles.alertRow}
                activeOpacity={0.7}
                onPress={() => go('OwnerPayments')}
              >
                <View style={[styles.alertIconBg, { backgroundColor: `${colors.errorRgb}1A` }]}>
                  <Ionicons name="receipt-outline" size={17} color={colors.error} />
                </View>
                <View style={styles.alertBody}>
                  <Text style={styles.alertTitle}>待缴账单</Text>
                  <Text style={styles.alertDesc}>
                    {dueCount} 笔待缴 · 共 {money(dueTotal, currency)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.alertRow}
              activeOpacity={0.7}
              onPress={() => go('OwnerDocuments')}
            >
              <View style={[styles.alertIconBg, { backgroundColor: `${colors.infoRgb}1A` }]}>
                <Ionicons name="document-text-outline" size={17} color={colors.info} />
              </View>
              <View style={styles.alertBody}>
                <Text style={styles.alertTitle}>到期合同 / 文档</Text>
                <Text style={styles.alertDesc}>合同到期与档案文件在「物业文档」中查看</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </TouchableOpacity>
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

  /* ===== 1. 资产概览卡 ===== */
  heroCard: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    padding: colors.spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    ...colors.shadow.md,
  },
  hPropsHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroLabel: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },
  heroPropsLink: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },
  heroTotal: {
    fontSize: colors.fontSize['3xl'],
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    marginTop: 6,
  },
  heroStats: { flexDirection: 'row', gap: 10, marginTop: colors.spacing.xl },
  heroStatSmall: { flex: 1 },
  heroStatSmallVal: { fontSize: colors.fontSize.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroStatSmallLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2 },
  heroStack: { marginTop: colors.spacing.xl, paddingTop: colors.spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },

  /* ===== 区块标题 ===== */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.xl,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
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

  /* ===== 发布房源按钮 ===== */
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
  },
  publishBtnText: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.primaryForeground },

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
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  alertIcon: {
    width: 34,
    height: 34,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIconBg: {
    width: 34,
    height: 34,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBody: { flex: 1, minWidth: 0 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  alertDesc: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 2 },

  /* ===== 列表通用行 ===== */
  moreLink: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },
  moreRow: { alignItems: 'flex-end', paddingTop: 10, marginTop: 2 },
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