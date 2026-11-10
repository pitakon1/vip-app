import { OPTION_PAGE_SIZE } from '@/lib/pagination';
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
import { useResponsiveContainerStyle } from '@/theme/responsive';
import { ownerApi, ownersApi, listingApi, paymentsApi } from '@/services/api';
import { fmtMoney as money, formatArea } from '@/utils/format';
import { isOverdue, isUnpaid } from '@/utils/payment';
import { useI18n } from '@/i18n';
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

// 上架单状态元数据（仓库 MyListingsScreen 同口径，文案复用 myListings.status.* 三语）
const LIST_STATUS: Record<string, { key: string; color: string; bg: string }> = {
  pending: { key: 'myListings.status.pending', color: colors.warningInk, bg: colors.warningLight },
  active: { key: 'myListings.status.active', color: colors.successInk, bg: colors.successLight },
  rejected: { key: 'myListings.status.rejected', color: colors.errorInk, bg: colors.errorLight },
  closed: { key: 'myListings.status.closed', color: colors.ink3, bg: colors.surface2 },
  sold: { key: 'myListings.status.sold', color: colors.primaryText, bg: colors.sidebarActive },
  rented: { key: 'myListings.status.rented', color: colors.primaryText, bg: colors.sidebarActive },
};

interface HomePayload {
  properties: OwnerProperty[];
  annual: AnnualSummary | null;
  listings: Listing[];
  payments: any[];
  paymentSummary?: {
    unpaid_count?: number;
    unpaid_amount?: number;
    overdue_count?: number;
    overdue_amount?: number;
  } | null;
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const respContainer = useResponsiveContainerStyle();
  const user = useAuthStore((s) => s.user);
  const { t } = useI18n();
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
        listingApi.list({ page: 1, page_size: OPTION_PAGE_SIZE }),
        paymentsApi.mine(),
      ]);
      return {
        properties: pick<OwnerProperty>(propRes),
        annual: sumRes.status === 'fulfilled' ? ((sumRes.value?.data as AnnualSummary) ?? null) : null,
        listings: pick<Listing>(listRes),
        payments: pick<any>(payRes),
        // /payments/me 新增 summary：待收/逾期与租客端、管理端同一口径
        paymentSummary:
          payRes.status === 'fulfilled'
            ? ((payRes.value?.data as any)?.summary ?? null)
            : null,
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
  // 待收账单：后端 summary 优先（与租客/管理端口径同源），缺省时用本地分桶兜底
  const pays = payload?.payments ?? [];
  const paySummary = payload?.paymentSummary;
  const due = pays.filter(isUnpaid);
  const overdue = due.filter(isOverdue);
  const dueCount = Number(paySummary?.unpaid_count ?? due.length);
  const dueTotal = Number(paySummary?.unpaid_amount ?? due.reduce((s, p) => s + Number(p.amount || 0), 0));
  const overdueCount = Number(paySummary?.overdue_count ?? overdue.length);

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
          Number.isInteger(num) && num >= 1 && num <= 12 ? t(`emp.month.${num}`) : s;
        return { label, value: Number(b.received ?? 0) };
      })
      .filter((d) => d.value > 0);
  }, [annual, t]);

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
    (p.project_name
      ? `${p.project_name}·${p.room_number ?? ''}`
      : p.room_number || p.address || t('ownerHome.propertyFallback'));

  const propMeta = (p: OwnerProperty) =>
    `${t('ownerHome.rooms', { bed: p.bedrooms ?? 0, bath: p.bathrooms ?? 0 })} · ${formatArea(p.size_sqm, t('pub.sqm'))}`;

  const propStatusStyle = (p: OwnerProperty): { text: string; color: string; bg: string } => {
    const s = String(p.status || '').toLowerCase();
    if (s === 'vacant' || s === 'available')
      return { text: t('ownerHome.vacant'), color: colors.warningInk, bg: `${colors.warningRgb}1F` };
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale')
      return { text: t('ownerHome.forSale'), color: colors.infoInk, bg: `${colors.infoRgb}1F` };
    return { text: t('ownerHome.rented'), color: colors.successInk, bg: `${colors.successRgb}1F` };
  };

  const listingTitle = (l: Listing) => l.room_number || l.address || t('ownerHome.listingFallback');
  const listingPrice = (l: Listing) =>
    l.listing_type === 'sell' && l.asking_price != null
      ? money(l.asking_price, l.currency)
      : l.monthly_rent != null
        ? `${money(l.monthly_rent, l.currency)}${t('pub.perMonth')}`
        : '—';
  const listingCommission = (l: Listing) => {
    if (l.owner_commission_rate != null)
      return t('ownerHome.commissionOwner', { rate: l.owner_commission_rate });
    if (l.listing_type === 'sell')
      return l.sale_commission_rate != null
        ? t('ownerHome.commissionSale', { rate: l.sale_commission_rate })
        : t('ownerHome.sell');
    return l.rental_commission_months != null
      ? t('ownerHome.commissionRentMonths', { n: l.rental_commission_months })
      : t('ownerHome.rent');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label={t('ownerHome.loading')} />
      </View>
    );
  }

  // 是否展示待办/提醒（空置房源 或 待缴账单）
  const hasTodo = statusCount.vacant > 0 || dueCount > 0 || dueTotal > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, respContainer, { paddingTop: insets.top + colors.spacing.md }]}
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
              <Text style={styles.heroLabel}>{t('ownerHome.monthReceived')}</Text>
              <Text style={styles.heroTotal}>{money(monthReceived, currency)}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => go('OwnerProperties')}>
              <Text style={styles.heroPropsLink}>
                {t('ownerHome.managedCount', { n: statusCount.total })}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.successInk }]}>{statusCount.rented}</Text>
              <Text style={styles.heroStatSmallLabel}>{t('ownerHome.rented')}</Text>
            </View>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.warningInk }]}>{statusCount.vacant}</Text>
              <Text style={styles.heroStatSmallLabel}>{t('ownerHome.vacant')}</Text>
            </View>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.infoInk }]}>{statusCount.forSale}</Text>
              <Text style={styles.heroStatSmallLabel}>{t('ownerHome.forSale')}</Text>
            </View>
            <View style={styles.heroStatSmall}>
              <Text style={[styles.heroStatSmallVal, { color: colors.primaryText }]}>
                {yearReceived ? money(yearReceived, annual?.currency || currency) : '—'}
              </Text>
              <Text style={styles.heroStatSmallLabel}>{t('ownerHome.yearIncome')}</Text>
            </View>
          </View>

          {statusCount.total > 0 ? (
            <View style={styles.heroStack}>
              <ProgressStack
                totalLabel={t('ownerHome.assetDistribution')}
                totalValue={t('ownerHome.totalUnits', { n: statusCount.total })}
                barHeight={10}
                segments={[
                  {
                    value: statusCount.rented,
                    color: colors.successInk,
                    label: t('ownerHome.rented'),
                    subLabel: t('ownerHome.units', { n: statusCount.rented }),
                  },
                  {
                    value: statusCount.vacant,
                    color: colors.warningInk,
                    label: t('ownerHome.vacant'),
                    subLabel: t('ownerHome.units', { n: statusCount.vacant }),
                  },
                  {
                    value: statusCount.forSale,
                    color: colors.infoInk,
                    label: t('ownerHome.forSale'),
                    subLabel: t('ownerHome.units', { n: statusCount.forSale }),
                  },
                ]}
              />
            </View>
          ) : (
            <EmptyState
              icon="key-outline"
              title={t('ownerHome.emptyPropsTitle')}
              sub={t('ownerHome.emptyPropsSub')}
              actionLabel={t('ownerHome.goRegister')}
              onAction={() => go('OwnerProperties')}
            />
          )}
        </View>

        {/* ===== 2. 收益趋势：月度实收 BarChart ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('ownerHome.trendTitle')}</Text>
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
              title={t('ownerHome.noTrendTitle')}
              sub={t('ownerHome.noTrendSub')}
            />
          )}
        </View>

        {/* ===== 3. 房源概览：前 3 套 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('ownerHome.propsTitle')}</Text>
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
                      {p.tenant_name ? ` · ${t('ownerHome.tenant', { name: p.tenant_name })}` : ''}
                    </Text>
                    <Text style={styles.propListPrice}>
                      {p.monthly_rent
                        ? `${money(Number(p.monthly_rent), p.currency || currency)}${t('pub.perMonth')}`
                        : p.sale_price
                          ? money(Number(p.sale_price), p.currency || currency)
                          : t('ownerHome.noPrice')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.moreRow} activeOpacity={0.7} onPress={() => go('OwnerProperties')}>
              <Text style={styles.moreLink}>
                {t('ownerHome.viewAllUnits', { n: statusCount.total })}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <EmptyState
              icon="key-outline"
              title={t('ownerHome.noPropsTitle')}
              sub={t('ownerHome.noPropsSub')}
              actionLabel={t('ownerHome.goProps')}
              onAction={() => go('OwnerProperties')}
            />
          </View>
        )}

        {/* ===== 4. 我的上架单：最近若干 + 空态去发布 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('ownerHome.myListings')}</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => go('MyListings')}>
            <Text style={styles.moreLink}>
              {t('ownerHome.viewAllListings', { n: listings.length })}
            </Text>
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
                  onPress={() => go('MyListings')}
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
                        <Text style={[styles.miniBadgeText, { color: st.color }]}>{t(st.key)}</Text>
                      </View>
                    </View>
                    <Text style={styles.propListMeta} numberOfLines={1}>
                      {l.listing_type === 'sell' ? t('ownerHome.sell') : t('ownerHome.rent')} ·{' '}
                      {listingCommission(l)}
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
              title={t('ownerHome.noListingsTitle')}
              sub={t('ownerHome.noListingsSub')}
              actionLabel={t('ownerHome.goProps')}
              onAction={() => go('OwnerProperties')}
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
                  <Text style={styles.alertTitle}>{t('ownerHome.vacantTodo')}</Text>
                  <Text style={styles.alertDesc}>
                    {t('ownerHome.vacantTodoDesc', { n: statusCount.vacant })}
                  </Text>
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
                  <Text style={styles.alertTitle}>{t('ownerHome.dueTodo')}</Text>
                  <Text style={styles.alertDesc}>
                    {t('ownerHome.dueDesc', { n: dueCount, amount: money(dueTotal, currency) })}
                    {overdueCount > 0 ? t('ownerHome.dueOverdue', { n: overdueCount }) : ''}
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
                <Text style={styles.alertTitle}>{t('ownerHome.docsTodo')}</Text>
                <Text style={styles.alertDesc}>{t('ownerHome.docsDesc')}</Text>
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
  heroPropsLink: { fontSize: colors.fontSize.sm, color: colors.primaryText, fontWeight: '600' },
  heroTotal: {
    fontSize: colors.fontSize['3xl'],
    fontWeight: colors.fontWeight.bold,
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
    paddingHorizontal: colors.spacing.lg,
    marginBottom: 10,
  },
  sectionTitle: { flexShrink: 1, fontSize: colors.fontSize.title, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '600' },

  /* ===== 通用卡片 ===== */
  card: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  moreLink: { fontSize: colors.fontSize.sm, color: colors.primaryText, fontWeight: '600' },
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
    color: colors.primaryText,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  miniBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: colors.radius.full },
  miniBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
});