import { LIST_PAGE_SIZE } from '@/lib/pagination';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import api from '@/lib/api';
import { billingApi, leasesApi, serviceOrdersApi } from '@/services/api';
import { fmtMoney as formatMoney, fmtDate } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';

const formatDate = (x?: string) => fmtDate(x, 'minute');

// 真实价目来源：GET /billing/pricing → service_catalog（价税分离，税费另算）
interface CatalogItem {
  code: string;
  label_zh?: string;
  unit?: string;
  base_price?: number;
  [key: string]: any;
}

interface ServiceOrderRow {
  id: string;
  service_type?: string;
  status?: string;
  amount?: number;
  currency?: string;
  scheduled_at?: string;
  created_at?: string;
  [key: string]: any;
}

// 服务图标（按真实服务编码映射）
const SERVICE_ICONS: Record<string, string> = {
  cleaning: 'sparkles-outline',
  ac_cleaning: 'snow-outline',
  wifi_install: 'wifi-outline',
  utility_payment: 'flash-outline',
  insurance: 'shield-checkmark-outline',
};

const orderStatusMeta: Record<string, { labelKey: string; color: string; bg: string }> = {
  pending: { labelKey: 'svc.st.pending', color: colors.warning, bg: colors.warningLight },
  assigned: { labelKey: 'svc.st.assigned', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  in_progress: { labelKey: 'svc.st.inProgress', color: colors.primary, bg: colors.sidebarActive },
  completed: { labelKey: 'svc.st.completed', color: colors.success, bg: colors.successLight },
  cancelled: { labelKey: 'svc.st.cancelled', color: colors.ink3, bg: colors.surface2 },
};

/* ===== 购买规格（淘宝式 SKU：按次 / 按日 / 按月）===== */
type BuyModel = 'per_use' | 'daily' | 'monthly';
const MODEL_OPTIONS: { key: BuyModel; labelKey: string; noteZh: string }[] = [
  { key: 'per_use', labelKey: 'svc.model.perUse', noteZh: '按次' },
  { key: 'daily', labelKey: 'svc.model.daily', noteZh: '按日' },
  { key: 'monthly', labelKey: 'svc.model.monthly', noteZh: '按月' },
];
// 规格单价必须由服务端 /billing/pricing/quotes 报价，客户端不再维护系数
// 各规格可选购数量（次数 / 天数 / 月数）
const MODEL_QTY_OPTIONS: Record<BuyModel, number[]> = {
  per_use: [1, 2, 3, 5],
  daily: [1, 3, 7, 15, 30],
  monthly: [1, 3, 6, 12],
};
const MODEL_UNIT_KEY: Record<BuyModel, string> = {
  per_use: 'svc.unit.perUse',
  daily: 'svc.unit.daily',
  monthly: 'svc.unit.monthly',
};

const SERVICE_NAME_KEYS: Record<string, string> = {
  cleaning: 'svc.name.cleaning',
  ac_cleaning: 'svc.name.acCleaning',
  wifi_install: 'svc.name.wifiInstall',
  utility_payment: 'svc.name.utility',
  insurance: 'svc.name.insurance',
};

interface ServicesPayload {
  catalog: CatalogItem[];
  orders: ServiceOrderRow[];
  activeLease: any;
}

export default function ServicesScreen() {
  const { t } = useI18n();
  const user = useAuthStore((state: any) => state.user);
  const uid = user?.id ?? 'anon';
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [buyModel, setBuyModel] = useState<BuyModel>('per_use');
  const [buyQty, setBuyQty] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const q = useCachedQuery<ServicesPayload>({
    queryKey: ['tenant-services', uid],
    cacheKey: `tenant-services:${uid}`,
    queryFn: async () => {
      const [cRes, oRes, lRes] = await Promise.allSettled([
        api.get('/billing/pricing'),
        serviceOrdersApi.list({ page: 1, page_size: LIST_PAGE_SIZE }),
        leasesApi.mine(),
      ]);

      let catalog: CatalogItem[] = [];
      if (cRes.status === 'fulfilled') {
        const cat: any = (cRes.value as any)?.data?.service_catalog ?? {};
        catalog = Object.entries(cat).map(([code, v]: [string, any]) => ({ code, ...v }));
      }

      let orders: ServiceOrderRow[] = [];
      if (oRes.status === 'fulfilled') {
        const d: any = (oRes.value as any)?.data;
        orders = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      }

      let activeLease: any = null;
      if (lRes.status === 'fulfilled') {
        const d: any = (lRes.value as any)?.data;
        const list = Array.isArray(d) ? d : d?.items ?? [];
        activeLease = (list as any[]).find((l: any) => l?.status === 'active') ?? null;
      }

      return { catalog, orders, activeLease };
    },
  });

  const catalog = q.data?.catalog ?? [];
  const orders = q.data?.orders ?? [];
  const activeLease = q.data?.activeLease ?? null;
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const onRefresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  const openBuy = (item: CatalogItem) => {
    setSelected(item);
    setBuyModel('per_use');
    setBuyQty(1);
  };

  // 当前选中商品的规格单价与本次总额：全部来自服务端报价
  const selectedIsUtility = selected?.code === 'utility_payment';
  const [quote, setQuote] = useState<{ unit_price?: number; base_amount?: number; tax_amount?: number } | null>(null);
  const [modelQuotes, setModelQuotes] = useState<Partial<Record<BuyModel, number>>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);

  // 选中商品时预取三种规格的单价，仅用于展示
  useEffect(() => {
    if (!selected || selectedIsUtility) {
      setModelQuotes({});
      return;
    }
    let alive = true;
    Promise.all(
      MODEL_OPTIONS.map(async (m) => {
        const res: any = await billingApi.quote({ code: selected.code, qty: 1, billing_model: m.key });
        const body = res?.data?.data ?? res?.data;
        return [m.key, Number(body?.unit_price || 0)] as const;
      }),
    )
      .then((pairs) => {
        if (alive) setModelQuotes(Object.fromEntries(pairs) as Partial<Record<BuyModel, number>>);
      })
      .catch(() => {
        if (alive) setModelQuotes({});
      });
    return () => {
      alive = false;
    };
  }, [selected?.code, selectedIsUtility]);

  // 当前规格 × 数量的服务端报价
  useEffect(() => {
    if (!selected) {
      setQuote(null);
      return;
    }
    let alive = true;
    setQuoteLoading(true);
    billingApi
      .quote({
        code: selected.code,
        qty: selectedIsUtility ? 1 : buyQty,
        billing_model: selectedIsUtility ? 'per_use' : buyModel,
      })
      .then((res: any) => {
        const body = res?.data?.data ?? res?.data;
        if (alive) setQuote(body ? { ...body } : null);
      })
      .catch(() => {
        if (alive) setQuote(null);
      })
      .finally(() => {
        if (alive) setQuoteLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected?.code, selectedIsUtility, buyModel, buyQty]);

  const unitPrice = Number(quote?.unit_price || 0);
  const total = Number(quote?.base_amount || 0);

  const switchModel = (m: BuyModel) => {
    setBuyModel(m);
    setBuyQty(MODEL_QTY_OPTIONS[m][0]);
  };

  const unitOf = (m: BuyModel) => t(MODEL_UNIT_KEY[m]);
  const serviceNameOf = (item?: CatalogItem | null) => {
    if (!item) return '';
    const k = SERVICE_NAME_KEYS[item.code];
    return k ? t(k) : item.label_zh || item.code;
  };

  // 提交购买：写入真实服务订单（orderer_id / orderer_type / property_id 必填）
  const handleBuy = async () => {
    if (!selected) return;
    if (!user?.id) {
      notify(t('common.notice'), t('svc.loginRequired'));
      return;
    }
    if (!activeLease?.property_id) {
      notify(t('common.notice'), t('svc.noActiveLease'));
      return;
    }
    setSubmitting(true);
    try {
      // 水电代缴走公共事业专用接口（单笔缴付，不按次/按日/按月），其余服务走购买规格
      const isUtility = selected.code === 'utility_payment';
      const orderBase = {
        orderer_id: user.id,
        orderer_type: (user.role === 'owner' ? 'owner' : 'tenant') as 'owner' | 'tenant',
        property_id: activeLease.property_id,
        service_type: selected.code,
        // 金额来自服务端报价；后端会再次按价目表校验，篡改客户端金额无效
        amount: total,
        currency: 'THB',
        notes: isUtility
          ? '公共事业代缴（单笔）'
          : `${MODEL_OPTIONS.find((m) => m.key === buyModel)?.noteZh} x${buyQty}`,
      };
      await serviceOrdersApi.create(
        isUtility
          ? orderBase
          : {
              ...orderBase,
              billing_model: buyModel,
              billing_interval: buyQty,
              billing_amount: unitPrice,
            },
      );
      notify(
        isUtility ? t('svc.paySuccess') : t('svc.buySuccess'),
        isUtility ? t('svc.paySuccessMsg') : t('svc.buySuccessMsg'),
      );
      setSelected(null);
      void q.refetch({ cancelRefetch: false });
    } catch (err: any) {
      notifyError(t('svc.buyFail'), err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label={t('svc.loading')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{t('svc.title')}</Text>
          <Text style={styles.heroSub}>{t('svc.subtitle')}</Text>
        </View>

        {/* 快捷过滤/标签（淘宝式：当前可选规格一眼可见） */}
        <View style={styles.filterRow}>
          {MODEL_OPTIONS.map((m) => (
            <View key={m.key} style={styles.filterTag}>
              <Text style={styles.filterTagText}>{t(m.labelKey)}</Text>
            </View>
          ))}
        </View>

        {/* 服务商品橱窗（淘宝式两列商品卡） */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('svc.sectionShop')}</Text>
          <Text style={styles.sectionHint} numberOfLines={1}>{t('svc.sectionShopSub')}</Text>
        </View>
        {catalog.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="construct-outline" size={40} color={colors.ink3} />
            <Text style={styles.empty}>{t('svc.empty')}</Text>
          </View>
        ) : (
          <View style={styles.productGrid}>
            {catalog.map((item) => {
              const unitBase =
                item.code === 'utility_payment'
                  ? `${formatMoney(Number(item.base_price || 0), 'THB')}/${t('svc.unit.order')}`
                  : `${formatMoney(Number(item.base_price || 0), 'THB')}/${item.unit || t('svc.unit.perUse')}`;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={styles.productCard}
                  activeOpacity={0.85}
                  onPress={() => openBuy(item)}
                >
                  <View style={styles.productIcon}>
                    <Ionicons
                      name={(SERVICE_ICONS[item.code] ?? 'construct-outline') as any}
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={styles.productName} numberOfLines={2}>
                    {serviceNameOf(item)}
                  </Text>
                  <Text style={styles.productTag} numberOfLines={1}>
                    {item.code === 'utility_payment' ? t('svc.utilityTag') : t('svc.modelTag')}
                  </Text>
                  <View style={styles.productFoot}>
                    <Text style={styles.productPrice} numberOfLines={1}>
                      {unitBase}
                    </Text>
                    <View style={styles.productBuyBtn}>
                      <Ionicons name="add" size={14} color={colors.primaryForeground} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* 我的订单（真实订单数据） */}
        <Text style={styles.sectionTitle}>{t('svc.myOrders')}</Text>
        {orders.length === 0 ? (
          <Text style={styles.empty}>{t('svc.noOrders')}</Text>
        ) : (
          <View style={styles.orderCard}>
            {orders.map((o) => {
              const meta = orderStatusMeta[o.status ?? 'pending'] ?? orderStatusMeta.pending;
              return (
                <View key={o.id} style={styles.orderItem}>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderTitle}>
                      {catalog.find((c) => c.code === o.service_type)
                        ? serviceNameOf(catalog.find((c) => c.code === o.service_type))
                        : t('svc.orderFallback')}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {formatDate(o.scheduled_at ?? o.created_at)} ·{' '}
                      {formatMoney(o.amount, o.currency)}
                    </Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.chipText, { color: meta.color }]}>
                      {t(meta.labelKey)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* 淘宝式 SKU 购买弹层 */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* 商品头 */}
            <View style={styles.skuHead}>
              <View style={styles.skuIcon}>
                <Ionicons
                  name={(SERVICE_ICONS[selected?.code ?? ''] ?? 'construct-outline') as any}
                  size={28}
                  color={colors.primary}
                />
              </View>
              <View style={styles.skuInfo}>
                <Text style={styles.skuTitle}>{serviceNameOf(selected)}</Text>
                <Text style={styles.skuPrice}>
                  {formatMoney(total, 'THB')}
                  <Text style={styles.skuPriceUnit}>
                    {'　'}
                    {selectedIsUtility
                      ? `/${t('svc.unit.order')}`
                      : `/${t('svc.qtyTotal', { n: buyQty, unit: unitOf(buyModel) })}`}
                  </Text>
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            {/* 规格选择（水电代缴为公共事业专用接口，无规格选择） */}
            {!selectedIsUtility && <Text style={styles.specLabel}>{t('svc.specModel')}</Text>}
            {!selectedIsUtility && (
              <View style={styles.modelRow}>
                {MODEL_OPTIONS.map((m) => {
                  const active = buyModel === m.key;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.modelBtn, active && styles.modelBtnActive]}
                      activeOpacity={0.8}
                      onPress={() => switchModel(m.key)}
                    >
                      <Text style={[styles.modelBtnText, active && styles.modelBtnTextActive]}>
                        {t(m.labelKey)}
                      </Text>
                      <Text style={[styles.modelSub, active && styles.modelSubActive]}>
                        {formatMoney(Number(modelQuotes[m.key] || 0), 'THB')}/{unitOf(m.key)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 数量选择（水电代缴不适用） */}
            {!selectedIsUtility && <Text style={styles.specLabel}>{t('svc.specQty')}</Text>}
            {!selectedIsUtility && (
              <View style={styles.qtyWrap}>
                {MODEL_QTY_OPTIONS[buyModel].map((n) => {
                  const active = buyQty === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[styles.qtyChip, active && styles.qtyChipActive]}
                      activeOpacity={0.8}
                      onPress={() => setBuyQty(n)}
                    >
                      <Text style={[styles.qtyChipText, active && styles.qtyChipTextActive]}>
                        {n}{unitOf(buyModel)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 小计明细 */}
            <View style={styles.summary}>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>{t('svc.unitPrice')}</Text>
                <Text style={styles.sumValue}>{formatMoney(unitPrice, 'THB')}</Text>
              </View>
              {!selectedIsUtility && (
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>{t('svc.specQty')}</Text>
                  <Text style={styles.sumValue}>{buyQty}{unitOf(buyModel)}</Text>
                </View>
              )}
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>{t('svc.subtotal')}</Text>
                <Text style={[styles.sumValue, styles.sumTotal]}>{formatMoney(total, 'THB')}</Text>
              </View>
              {!selectedIsUtility && (
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>{t('svc.tax')}</Text>
                  <Text style={styles.sumValue}>{t('svc.taxNote')}</Text>
                </View>
              )}
            </View>

            {!activeLease?.property_id && (
              <Text style={styles.warn}>{t('svc.noLeaseWarn')}</Text>
            )}

            {/* 底部结算条 */}
            <View style={styles.buyBar}>
              <View>
                <Text style={styles.buyBarLabel}>{quoteLoading ? t('svc.quoting') : t('svc.totalDue')}</Text>
                <Text style={styles.buyBarTotal}>{quoteLoading ? '—' : formatMoney(total, 'THB')}</Text>
              </View>
              <TouchableOpacity
                style={[styles.buyBtn, (submitting || quoteLoading || !quote) && styles.btnDisabled]}
                onPress={handleBuy}
                disabled={submitting || quoteLoading || !quote}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={styles.buyBtnText}>
                    {selectedIsUtility ? t('svc.payNow') : t('svc.buyNow')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 24 },
  // Hero
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 4,
  },
  heroTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryForeground },
  heroSub: {
    fontSize: colors.fontSize.caption,
    color: colors.alpha('255,255,255', 0.85),
    marginTop: 4,
  },
  // 规格标签行
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  filterTag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  filterTagText: { fontSize: colors.fontSize.xs, color: colors.ink2, fontWeight: '600', lineHeight: colors.lineHeight.tight},
  // 区块标题
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2, flexShrink: 1 },
  sectionHint: { fontSize: 12, color: colors.ink3, fontWeight: '500', flexShrink: 1 },
  // 商品橱窗（淘宝式两列）
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12 },
  productCard: {
    width: '48.5%',
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productIcon: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.md,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  productName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  productTag: {
    fontSize: colors.fontSize.xs,
    lineHeight: colors.lineHeight.tight,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  productFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  productPrice: { fontSize: colors.fontSize.caption, color: colors.ink2, fontWeight: '600', flex: 1, marginRight: 6 },
  productBuyBtn: {
    width: 26,
    height: 26,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 我的订单
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 12,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  orderInfo: { flex: 1 },
  orderTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  orderMeta: { fontSize: colors.fontSize.caption, color: colors.ink2, marginTop: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.sm },
  chipText: { fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 12, marginBottom: 12 },
  // SKU 弹层
  overlay: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.4),
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 16,
    maxHeight: '82%',
  },
  skuHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skuIcon: {
    width: 56,
    height: 56,
    borderRadius: colors.radius.md,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skuInfo: { flex: 1, minWidth: 0 },
  skuTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  skuPrice: { fontSize: 20, fontWeight: '800', color: colors.error, marginTop: 4 },
  skuPriceUnit: { fontSize: 12, fontWeight: '500', color: colors.ink3 },
  specLabel: {
    fontSize: colors.fontSize.caption,
    fontWeight: '600',
    color: colors.ink3,
    marginTop: 16,
    marginBottom: 8,
  },
  modelRow: { flexDirection: 'row', gap: 8 },
  modelBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelBtnActive: { backgroundColor: colors.sidebarActive, borderColor: colors.primary },
  modelBtnText: { fontSize: 15, fontWeight: '600', color: colors.ink2 },
  modelBtnTextActive: { color: colors.primary, fontWeight: '700' },
  modelSub: { fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: colors.lineHeight.tight},
  modelSubActive: { color: colors.primary },
  qtyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qtyChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  qtyChipText: { fontSize: colors.fontSize.caption, fontWeight: '500', color: colors.ink2 },
  qtyChipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  summary: {
    marginTop: 16,
    padding: 14,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  sumLabel: { fontSize: colors.fontSize.caption, color: colors.ink3 },
  sumValue: { fontSize: colors.fontSize.caption, color: colors.ink2, fontWeight: '500' },
  sumTotal: { color: colors.primary, fontWeight: '700' },
  warn: { fontSize: 12, color: colors.warning, marginTop: 10 },
  // 结算条
  buyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  buyBarLabel: { fontSize: 12, color: colors.ink3 },
  buyBarTotal: { fontSize: 22, fontWeight: '800', color: colors.error, marginTop: 2 },
  buyBtn: {
    minWidth: 130,
    paddingVertical: 13,
    borderRadius: colors.radius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});