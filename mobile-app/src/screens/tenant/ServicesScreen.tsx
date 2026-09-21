import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import api from '@/lib/api';
import { leasesApi, serviceOrdersApi } from '@/services/api';
import { fmtMoney as formatMoney, fmtDate } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';
import LoadingState from '@/components/LoadingState';

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

const orderStatusMeta: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: '待处理', color: colors.warning, bg: colors.warningLight },
  assigned: { text: '已派单', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  in_progress: { text: '进行中', color: colors.primary, bg: colors.sidebarActive },
  completed: { text: '已完成', color: colors.success, bg: colors.successLight },
  cancelled: { text: '已取消', color: colors.ink3, bg: colors.surface2 },
};

/* ===== 购买规格（淘宝式 SKU：按次 / 按日 / 按月）===== */
type BuyModel = 'per_use' | 'daily' | 'monthly';
const MODEL_OPTIONS: { key: BuyModel; label: string }[] = [
  { key: 'per_use', label: '按次' },
  { key: 'daily', label: '按日' },
  { key: 'monthly', label: '按月' },
];
// 各规格相对「单次基准价 base_price」的单价系数（可按运营随时调整）
const MODEL_FACTOR: Record<BuyModel, number> = {
  per_use: 1, // 按次：基准价原价
  daily: 0.5, // 按日：单日价 ≈ 基准价 × 0.5
  monthly: 3, // 按月：包月价 ≈ 基准价 × 3
};
// 各规格可选购数量（次数 / 天数 / 月数）
const MODEL_QTY_OPTIONS: Record<BuyModel, number[]> = {
  per_use: [1, 2, 3, 5],
  daily: [1, 3, 7, 15, 30],
  monthly: [1, 3, 6, 12],
};
const MODEL_UNIT_LABEL: Record<BuyModel, string> = {
  per_use: '次',
  daily: '天',
  monthly: '月',
};

interface ServicesPayload {
  catalog: CatalogItem[];
  orders: ServiceOrderRow[];
  activeLease: any;
}

export default function ServicesScreen() {
  const user = useAuthStore((state: any) => state.user);
  const uid = user?.id ?? 'anon';
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [buyModel, setBuyModel] = useState<BuyModel>('per_use');
  const [buyQty, setBuyQty] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  const q = useCachedQuery<ServicesPayload>({
    queryKey: ['tenant-services', uid],
    cacheKey: `tenant-services:${uid}`,
    queryFn: async () => {
      const [cRes, oRes, lRes] = await Promise.allSettled([
        api.get('/billing/pricing'),
        serviceOrdersApi.list({ page: 1, page_size: 20 }),
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

  // 当前选中商品的规格单价与本次总额
  const basePrice = Number(selected?.base_price || 0);
  // 水电代缴为专属公共事业接口：不按次/按日/按月计费，统一单笔缴付
  const selectedIsUtility = selected?.code === 'utility_payment';
  const unitPrice = selectedIsUtility
    ? basePrice
    : Math.round(basePrice * MODEL_FACTOR[buyModel]);
  const total = selectedIsUtility ? basePrice : unitPrice * buyQty;

  const switchModel = (m: BuyModel) => {
    setBuyModel(m);
    setBuyQty(MODEL_QTY_OPTIONS[m][0]);
  };

  // 提交购买：写入真实服务订单（orderer_id / orderer_type / property_id 必填）
  const handleBuy = async () => {
    if (!selected) return;
    if (!user?.id) {
      Alert.alert('提示', '请先登录后再购买服务');
      return;
    }
    if (!activeLease?.property_id) {
      Alert.alert('提示', '当前没有生效中的租约，无法关联房源购买服务');
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
        amount: isUtility ? basePrice : total,
        currency: 'THB',
        notes: isUtility
          ? '公共事业代缴（单笔）'
          : `${MODEL_OPTIONS.find((m) => m.key === buyModel)?.label} x${buyQty}`,
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
      Alert.alert(
        isUtility ? '缴费成功' : '购买成功',
        isUtility ? '公共事业代缴已提交，请留意缴费结果' : '服务订单已提交，工作人员将尽快与您联系',
      );
      setSelected(null);
      void q.refetch({ cancelRefetch: false });
    } catch (err: any) {
      Alert.alert(
        '购买失败',
        err?.response?.data?.detail || err?.response?.data?.message || '请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="加载服务中…" />
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
          <Text style={styles.heroTitle}>服务商城</Text>
          <Text style={styles.heroSub}>按次 · 按日 · 按月，按需选购</Text>
        </View>

        {/* 快捷过滤/标签（淘宝式：当前可选规格一眼可见） */}
        <View style={styles.filterRow}>
          {MODEL_OPTIONS.map((m) => (
            <View key={m.key} style={styles.filterTag}>
              <Text style={styles.filterTagText}>{m.label}</Text>
            </View>
          ))}
        </View>

        {/* 服务商品橱窗（淘宝式两列商品卡） */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>实惠购</Text>
          <Text style={styles.sectionHint}>专人上门 · 安心服务</Text>
        </View>
        {catalog.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="construct-outline" size={40} color={colors.ink3} />
            <Text style={styles.empty}>暂无可用服务</Text>
          </View>
        ) : (
          <View style={styles.productGrid}>
            {catalog.map((item) => {
              const unitBase =
                item.code === 'utility_payment'
                  ? `${formatMoney(Number(item.base_price || 0), 'THB')}/笔`
                  : `${formatMoney(Number(item.base_price || 0), 'THB')}/${item.unit || '次'}`;
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
                  <Text style={styles.productName} numberOfLines={1}>
                    {item.label_zh || item.code}
                  </Text>
                  <Text style={styles.productTag}>
                    {item.code === 'utility_payment' ? '公共事业代缴' : '按次 · 按日 · 按月'}
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
        <Text style={styles.sectionTitle}>我的订单</Text>
        {orders.length === 0 ? (
          <Text style={styles.empty}>暂无服务订单</Text>
        ) : (
          <View style={styles.orderCard}>
            {orders.map((o) => {
              const meta = orderStatusMeta[o.status ?? 'pending'] ?? orderStatusMeta.pending;
              return (
                <View key={o.id} style={styles.orderItem}>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderTitle}>
                      {catalog.find((c) => c.code === o.service_type)?.label_zh ??
                        o.service_type ??
                        '服务订单'}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {formatDate(o.scheduled_at ?? o.created_at)} ·{' '}
                      {formatMoney(o.amount, o.currency)}
                    </Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.chipText, { color: meta.color }]}>
                      {meta.text}
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
          <View style={styles.sheet}>
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
                <Text style={styles.skuTitle}>{selected?.label_zh || selected?.code}</Text>
                <Text style={styles.skuPrice}>
                  {formatMoney(total, 'THB')}
                  <Text style={styles.skuPriceUnit}>
                    {'　'}{selectedIsUtility ? '/笔' : `/共 ${buyQty}${MODEL_UNIT_LABEL[buyModel]}`}
                  </Text>
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            {/* 规格选择（水电代缴为公共事业专用接口，无规格选择） */}
            {!selectedIsUtility && <Text style={styles.specLabel}>购买规格</Text>}
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
                        {m.label}
                      </Text>
                      <Text style={[styles.modelSub, active && styles.modelSubActive]}>
                        {formatMoney(Math.round(basePrice * MODEL_FACTOR[m.key]), 'THB')}/{MODEL_UNIT_LABEL[m.key]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 数量选择（水电代缴不适用） */}
            {!selectedIsUtility && <Text style={styles.specLabel}>数量</Text>}
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
                        {n}{MODEL_UNIT_LABEL[buyModel]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 小计明细 */}
            <View style={styles.summary}>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>单价</Text>
                <Text style={styles.sumValue}>{formatMoney(unitPrice, 'THB')}</Text>
              </View>
              {!selectedIsUtility && (
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>数量</Text>
                  <Text style={styles.sumValue}>{buyQty}{MODEL_UNIT_LABEL[buyModel]}</Text>
                </View>
              )}
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>小计</Text>
                <Text style={[styles.sumValue, styles.sumTotal]}>{formatMoney(total, 'THB')}</Text>
              </View>
              {!selectedIsUtility && (
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>税费</Text>
                  <Text style={styles.sumValue}>另计（VAT 7%）</Text>
                </View>
              )}
            </View>

            {!activeLease?.property_id && (
              <Text style={styles.warn}>当前没有生效中的租约，购买将失败</Text>
            )}

            {/* 底部结算条 */}
            <View style={styles.buyBar}>
              <View>
                <Text style={styles.buyBarLabel}>应付合计</Text>
                <Text style={styles.buyBarTotal}>{formatMoney(total, 'THB')}</Text>
              </View>
              <TouchableOpacity
                style={[styles.buyBtn, submitting && styles.btnDisabled]}
                onPress={handleBuy}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={styles.buyBtnText}>
                    {selectedIsUtility ? '立即缴费' : '立即购买'}
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
    fontSize: 13,
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
  filterTagText: { fontSize: 11, color: colors.ink2, fontWeight: '600' },
  // 区块标题
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
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
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  productFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  productPrice: { fontSize: 13, color: colors.ink2, fontWeight: '600', flex: 1, marginRight: 6 },
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
  orderMeta: { fontSize: 13, color: colors.ink2, marginTop: 4 },
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
    paddingBottom: 24,
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
    fontSize: 13,
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
  modelSub: { fontSize: 11, color: colors.ink3 },
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
  qtyChipText: { fontSize: 13, fontWeight: '500', color: colors.ink2 },
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
  sumLabel: { fontSize: 13, color: colors.ink3 },
  sumValue: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
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