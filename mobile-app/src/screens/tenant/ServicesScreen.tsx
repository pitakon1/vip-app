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
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import api from '@/lib/api';
import { billingApi, leasesApi, serviceOrdersApi } from '@/services/api';
import { fmtMoney as formatMoney, fmtDate } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';
import LoadingState from '@/components/LoadingState';
import PaymentSheet from '@/components/PaymentSheet';
import { resolvePayment } from '@/utils/payment';
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
  moving: 'cube-outline',
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
  moving: 'svc.name.moving',
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
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payQr, setPayQr] = useState<{
    qr: string;
    amount: number;
    currency?: string;
    channelLabel?: string;
  } | null>(null);
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

  // 发起支付：服务订单 → 支付单 → 渠道收银台。
  // 托管收银台（URL）直接跳转，扫码型渠道弹二维码，其余按结果提示。
  const payOrder = async (orderId: string, amount: number, currency?: string) => {
    setPayingId(orderId);
    try {
      const res: any = await serviceOrdersApi.pay(orderId, 'lianlian');
      const data = res?.data?.data ?? res?.data;
      if (data?.already_paid) {
        notify(t('svc.alreadyPaid'), t('svc.alreadyPaidMsg'));
        void q.refetch({ cancelRefetch: false });
        return;
      }
      // 渠道发起失败时后端仍可能返回 200，但 ok=false：必须按失败处理
      if (data?.ok === false) {
        if (data?.status === 'processing') {
          notify(t('svc.payProcessingTitle'), t('svc.payProcessingMsg'));
        } else {
          notifyError(t('svc.payFail'), data?.error);
        }
        void q.refetch({ cancelRefetch: false });
        return;
      }
      const resolution = resolvePayment(data);
      if (resolution.kind === 'url') {
        await WebBrowser.openBrowserAsync(resolution.url);
        // 收银台关闭回到 App 后刷新订单状态
        void q.refetch({ cancelRefetch: false });
      } else if (resolution.kind === 'qr') {
        setPayQr({
          qr: resolution.qr,
          amount,
          currency,
          channelLabel: t('pay.channelLianlian'),
        });
      } else {
        notify(t('svc.orderCreated'), t('svc.noPayLink'));
      }
    } catch (err: any) {
      notifyError(t('svc.payFail'), err);
    } finally {
      setPayingId(null);
    }
  };

  // 提交购买：写入真实服务订单，成功后立即调起支付
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
      const res: any = await serviceOrdersApi.create(
        isUtility
          ? orderBase
          : {
              ...orderBase,
              billing_model: buyModel,
              billing_interval: buyQty,
              billing_amount: unitPrice,
            },
      );
      const order = res?.data?.data ?? res?.data;
      setSelected(null);
      void q.refetch({ cancelRefetch: false });
      if (order?.id) {
        // 下单成功即进入支付：不会再出现「只提示成功、没有付款入口」
        await payOrder(order.id, Number(order.amount ?? total), order.currency);
      } else {
        notify(t('svc.orderCreated'), t('svc.noPayLink'));
      }
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
          <View style={styles.heroBadges}>
            {[t('svc.trustCertified'), t('svc.trustGuarantee'), t('svc.trustRedo')].map((label) => (
              <View key={label} style={styles.heroBadge}>
                <Ionicons name="checkmark-circle" size={12} color={colors.primaryForeground} />
                <Text style={styles.heroBadgeText}>{label}</Text>
              </View>
            ))}
          </View>
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

        {/* 我的订单（真实订单数据）：独立区块，与上方商品橱窗留出呼吸间距 */}
        <View style={styles.ordersSection}>
          <View style={styles.ordersHead}>
            <View style={styles.ordersHeadText}>
              <Text style={styles.ordersTitle}>{t('svc.myOrders')}</Text>
              <Text style={styles.ordersSub}>{t('svc.ordersSub')}</Text>
            </View>
            {orders.length > 0 ? (
              <View style={styles.ordersCount}>
                <Text style={styles.ordersCountText}>{orders.length}</Text>
              </View>
            ) : null}
          </View>
          {orders.length === 0 ? (
            <View style={styles.ordersEmpty}>
              <Ionicons name="receipt-outline" size={26} color={colors.ink3} />
              <Text style={styles.ordersEmptyText}>{t('svc.noOrders')}</Text>
            </View>
          ) : (
            <View style={styles.orderCard}>
              {orders.map((o, idx) => {
                const meta = orderStatusMeta[o.status ?? 'pending'] ?? orderStatusMeta.pending;
                const svcItem = catalog.find((c) => c.code === o.service_type);
                const canPay = o.status === 'pending' && Number(o.amount ?? 0) > 0;
                const busy = payingId === o.id;
                return (
                  <View
                    key={o.id}
                    style={[styles.orderItem, idx < orders.length - 1 && styles.orderDivider]}
                  >
                    <View style={styles.orderRow}>
                      <View style={styles.orderIcon}>
                        <Ionicons
                          name={(SERVICE_ICONS[o.service_type ?? ''] ?? 'construct-outline') as any}
                          size={18}
                          color={colors.primary}
                        />
                      </View>
                      <View style={styles.orderInfo}>
                        <Text style={styles.orderTitle} numberOfLines={1}>
                          {svcItem ? serviceNameOf(svcItem) : t('svc.orderFallback')}
                        </Text>
                        <Text style={styles.orderMeta} numberOfLines={1}>
                          {formatDate(o.scheduled_at ?? o.created_at)}
                        </Text>
                      </View>
                      <View style={styles.orderRight}>
                        <Text style={styles.orderAmount} numberOfLines={1}>
                          {formatMoney(o.amount, o.currency)}
                        </Text>
                        <View style={[styles.chip, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.chipText, { color: meta.color }]}>
                            {t(meta.labelKey)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {canPay ? (
                      <TouchableOpacity
                        style={[styles.orderPayBtn, busy && styles.btnDisabled]}
                        activeOpacity={0.85}
                        disabled={busy}
                        onPress={() => payOrder(o.id, Number(o.amount ?? 0), o.currency)}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="card-outline" size={14} color={colors.primary} />
                            <Text style={styles.orderPayText}>{t('svc.goPay')}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 淘宝式 SKU 购买弹层
          react-native-web 的 Modal 在 visible=false 后仍会保留一帧（等 slide 动画结束），
          这期间 selected 已是 null，规格价会显示成 ฿0、购买按钮消失（看起来像卡住）。
          这里直接按 selected 卸载 Modal，关闭即生效，也避免残留的空壳弹层。 */}
      {selected && (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.sheetHandle} />

            {/* 商品头：图标 + 名称 + 服务承诺，先建立信任再谈价格 */}
            <View style={styles.skuHero}>
              <View style={styles.skuIcon}>
                <Ionicons
                  name={(SERVICE_ICONS[selected?.code ?? ''] ?? 'construct-outline') as any}
                  size={26}
                  color={colors.primary}
                />
              </View>
              <View style={styles.skuInfo}>
                <Text style={styles.skuTitle} numberOfLines={1}>
                  {serviceNameOf(selected)}
                </Text>
                <Text style={styles.skuDesc} numberOfLines={2}>
                  {t('svc.sheetDesc')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelected(null)}
                hitSlop={12}
                style={styles.skuClose}
                accessibilityRole="button"
                accessibilityLabel={t('profile.close')}
              >
                <Ionicons name="close" size={20} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            <View style={styles.trustRow}>
              {[
                { icon: 'ribbon-outline', label: t('svc.trustCertified') },
                { icon: 'shield-checkmark-outline', label: t('svc.trustGuarantee') },
                { icon: 'refresh-outline', label: t('svc.trustRedo') },
              ].map((item) => (
                <View key={item.label} style={styles.trustItem}>
                  <Ionicons name={item.icon as any} size={14} color={colors.primary} />
                  <Text style={styles.trustText}>{item.label}</Text>
                </View>
              ))}
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
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

              {/* 数量：步进器 + 快捷档位（水电代缴不适用） */}
              {!selectedIsUtility && (
                <View style={styles.qtyRow}>
                  <Text style={styles.specLabelInline}>{t('svc.specQty')}</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      activeOpacity={0.7}
                      disabled={buyQty <= 1}
                      onPress={() => setBuyQty(Math.max(1, buyQty - 1))}
                    >
                      <Ionicons name="remove" size={16} color={buyQty <= 1 ? colors.ink3 : colors.ink} />
                    </TouchableOpacity>
                    <Text style={styles.stepValue}>
                      {buyQty}
                      {unitOf(buyModel)}
                    </Text>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      activeOpacity={0.7}
                      disabled={buyQty >= 99}
                      onPress={() => setBuyQty(Math.min(99, buyQty + 1))}
                    >
                      <Ionicons name="add" size={16} color={colors.ink} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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
                          {n}
                          {unitOf(buyModel)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* 价格明细 */}
              <View style={styles.summary}>
                <View style={styles.sumHead}>
                  <Text style={styles.sumHeadText}>{t('svc.priceDetail')}</Text>
                  {quoteLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </View>
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>{t('svc.unitPrice')}</Text>
                  <Text style={styles.sumValue}>{formatMoney(unitPrice, 'THB')}</Text>
                </View>
                {!selectedIsUtility && (
                  <View style={styles.sumRow}>
                    <Text style={styles.sumLabel}>{t('svc.specQty')}</Text>
                    <Text style={styles.sumValue}>
                      {buyQty}
                      {unitOf(buyModel)}
                    </Text>
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

              {/* 支付方式：写明真实可用的收银台，避免「点了没反应」 */}
              <View style={styles.payMethod}>
                <View style={styles.payMethodIcon}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
                </View>
                <View style={styles.payMethodBody}>
                  <Text style={styles.payMethodTitle}>{t('svc.securePay')}</Text>
                  <Text style={styles.payMethodMeta}>{t('svc.payMethods')}</Text>
                  <Text style={styles.payMethodNote}>{t('svc.payMethodsNote')}</Text>
                </View>
              </View>

              {!activeLease?.property_id && (
                <Text style={styles.warn}>{t('svc.noLeaseWarn')}</Text>
              )}
            </ScrollView>

            {/* 底部结算条：价格 + 立即支付 */}
            <View style={styles.buyBar}>
              <View style={styles.buyBarLeft}>
                <Text style={styles.buyBarLabel}>
                  {quoteLoading ? t('svc.quoting') : t('svc.totalDue')}
                </Text>
                <Text style={styles.buyBarTotal}>
                  {quoteLoading ? '—' : formatMoney(total, 'THB')}
                </Text>
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
                  <>
                    <Text style={styles.buyBtnText}>
                      {selectedIsUtility ? t('svc.payNow') : t('svc.buyNow')}
                    </Text>
                    <Ionicons name="arrow-forward" size={15} color={colors.primaryForeground} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      )}

      {/* 扫码支付弹层（渠道返回二维码时） */}
      <PaymentSheet
        visible={!!payQr}
        qr={payQr?.qr ?? ''}
        amount={payQr?.amount}
        currency={payQr?.currency}
        channelLabel={payQr?.channelLabel}
        onClose={() => {
          setPayQr(null);
          void q.refetch({ cancelRefetch: false });
        }}
      />
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
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha('255,255,255', 0.16),
  },
  heroBadgeText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: colors.primaryForeground,
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
  // 我的订单：独立区块，标题/副标题/数量与商品橱窗拉开间距
  ordersSection: { marginTop: 22, paddingHorizontal: 12 },
  ordersHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  ordersHeadText: { flex: 1, gap: 3 },
  ordersTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
  },
  ordersSub: { fontSize: 12, lineHeight: 17, color: colors.ink3 },
  ordersCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersCountText: { fontSize: 12, lineHeight: 16, color: colors.primary, fontWeight: '700' },
  ordersEmpty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 26,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ordersEmptyText: { fontSize: 13, lineHeight: 18, color: colors.ink3 },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  orderItem: { paddingVertical: 14 },
  orderDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderInfo: { flex: 1, minWidth: 0, gap: 3 },
  orderTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.ink },
  orderMeta: { fontSize: 12, lineHeight: 17, color: colors.ink3 },
  orderRight: { alignItems: 'flex-end', gap: 5 },
  orderAmount: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.ink },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.sm },
  chipText: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  orderPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.sidebarActive,
  },
  orderPayText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.primary },
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 12, marginBottom: 12 },
  // SKU 弹层
  overlay: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.45),
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '86%',
    ...colors.shadow.card,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  skuHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skuIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skuInfo: { flex: 1, minWidth: 0, gap: 4 },
  skuTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.ink },
  skuDesc: { fontSize: 12, lineHeight: 17, color: colors.ink3 },
  skuClose: { padding: 2 },
  trustRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  trustItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.sidebarActive,
  },
  trustText: { fontSize: 11, lineHeight: 15, color: colors.primary, fontWeight: '600' },
  sheetScroll: { marginTop: 4 },
  sheetScrollContent: { paddingBottom: 8 },
  specLabel: {
    fontSize: colors.fontSize.caption,
    fontWeight: '600',
    color: colors.ink3,
    marginTop: 16,
    marginBottom: 8,
  },
  specLabelInline: { fontSize: colors.fontSize.caption, fontWeight: '600', color: colors.ink3 },
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
  modelSub: { fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: colors.lineHeight.tight },
  modelSubActive: { color: colors.primary },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.full,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  stepBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepValue: {
    minWidth: 54,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.ink,
  },
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
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sumHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sumHeadText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.ink },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  sumLabel: { fontSize: colors.fontSize.caption, color: colors.ink3 },
  sumValue: { fontSize: colors.fontSize.caption, color: colors.ink2, fontWeight: '500' },
  sumTotal: { color: colors.primary, fontWeight: '700' },
  payMethod: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  payMethodIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payMethodBody: { flex: 1, gap: 2 },
  payMethodTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.ink },
  payMethodMeta: { fontSize: 12, lineHeight: 17, color: colors.ink2 },
  payMethodNote: { fontSize: 11, lineHeight: 15, color: colors.ink3 },
  warn: { fontSize: 12, lineHeight: 17, color: colors.warning, marginTop: 10 },
  // 结算条
  buyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  buyBarLeft: { flex: 1, minWidth: 0 },
  buyBarLabel: { fontSize: 12, lineHeight: 17, color: colors.ink3 },
  buyBarTotal: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.error, marginTop: 2 },
  buyBtn: {
    flexDirection: 'row',
    gap: 6,
    minWidth: 132,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: colors.radius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});