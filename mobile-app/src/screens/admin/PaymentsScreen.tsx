/**
 * 收付款管理（管理端）
 * 原型：admin-mobile-payments.html
 * 区块：本月收入卡（总收入 / 已收 / 待收 / 收缴率）→ 状态筛选 → 交易记录
 * 数据源：/dashboard/summary、/dashboard/financial-reconciliation、/payments、/admin/users（付款人姓名）、/properties（房源名）
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';
import { dashboardApi, paymentsApi, propertiesApi } from '@/services/api';

const PAGE_SIZE = 50;

interface PaymentRow {
  id: string;
  lease_id?: string | null;
  property_id?: string | null;
  payer_id?: string | null;
  amount?: number;
  currency?: string;
  payment_type?: string | null;
  status?: string | null;
  channel?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  description?: string | null;
}

type ChipKey = 'all' | 'succeeded' | 'pending' | 'expired' | 'refunded';
const CHIPS: { key: ChipKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'succeeded', label: '已收款' },
  { key: 'pending', label: '待收款' },
  { key: 'expired', label: '逾期' },
  { key: 'refunded', label: '已退款' },
];

// 状态展示口径与后端 PaymentStatus 枚举一一对应
const STATUS_META: Record<string, { label: string; color: string; rgb: string }> = {
  succeeded: { label: '已收款', color: colors.success, rgb: colors.successRgb },
  pending: { label: '待收款', color: colors.warning, rgb: colors.warningRgb },
  processing: { label: '处理中', color: colors.info, rgb: colors.infoRgb },
  expired: { label: '逾期', color: colors.error, rgb: colors.errorRgb },
  failed: { label: '失败', color: colors.error, rgb: colors.errorRgb },
  refunded: { label: '已退款', color: colors.ink2, rgb: colors.primaryRgb },
  disputed: { label: '争议中', color: colors.error, rgb: colors.errorRgb },
};

const TYPE_LABEL: Record<string, string> = {
  rent: '租金',
  deposit: '押金',
  commission: '佣金',
  service_fee: '服务费',
  utility: '水电费',
  tax: '税费',
  refund: '退款',
};

const CHANNEL_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; rgb: string }> = {
  promptpay: { label: 'PromptPay', icon: 'qr-code-outline', color: colors.primary, rgb: colors.primaryRgb },
  stripe: { label: 'Stripe', icon: 'card-outline', color: colors.info, rgb: colors.infoRgb },
  bank_transfer: { label: '银行转账', icon: 'business-outline', color: colors.ink2, rgb: colors.primaryRgb },
  wechat: { label: '微信支付', icon: 'chatbubble-ellipses-outline', color: colors.success, rgb: colors.successRgb },
  alipay: { label: '支付宝', icon: 'wallet-outline', color: colors.info, rgb: colors.infoRgb },
  wise: { label: 'Wise', icon: 'swap-horizontal-outline', color: colors.warning, rgb: colors.warningRgb },
  paypal: { label: 'PayPal', icon: 'logo-paypal', color: colors.info, rgb: colors.infoRgb },
};

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '');
const fmtMoney = (v?: number, c?: string) => `${symOf(c)}${Number(v ?? 0).toLocaleString()}`;
const fmtDate = (v?: string | null) => (v ? String(v).slice(0, 10) : '-');

export default function AdminPaymentsScreen() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<any>({});
  const [totals, setTotals] = useState<{ received?: number; receivable?: number; overdue?: number }>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [propMap, setPropMap] = useState<Record<string, string>>({});
  const [chip, setChip] = useState<ChipKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (status: ChipKey) => {
      const params: Record<string, unknown> = { page: 1, page_size: PAGE_SIZE };
      if (status !== 'all') params.status = status;

      const [payRes, sumRes, reconRes, userRes, propRes] = await Promise.allSettled([
        paymentsApi.list(params),
        dashboardApi.summary(),
        dashboardApi.financialReconciliation(),
        api.get('/admin/users', { params: { page_size: 100 } }),
        propertiesApi.list({ page: 1, page_size: 100 }),
      ]);

      if (payRes.status === 'fulfilled') {
        const d = (payRes.value as any)?.data ?? {};
        const rows = (Array.isArray(d) ? d : d.items ?? []) as PaymentRow[];
        setPayments(rows);
        setTotal(typeof d.total === 'number' ? d.total : rows.length);
      } else {
        setPayments([]);
        setTotal(0);
      }

      if (sumRes.status === 'fulfilled') setSummary((sumRes.value as any)?.data ?? {});
      if (reconRes.status === 'fulfilled') {
        setTotals(((reconRes.value as any)?.data?.totals ?? {}) as typeof totals);
      }
      if (userRes.status === 'fulfilled') {
        const items = (((userRes.value as any)?.data?.items ?? []) as { id: string; full_name?: string }[]) ?? [];
        setUserMap(
          items.reduce<Record<string, string>>((acc, u) => {
            if (u.full_name) acc[u.id] = u.full_name;
            return acc;
          }, {}),
        );
      }
      if (propRes.status === 'fulfilled') {
        const d = (propRes.value as any)?.data ?? {};
        const rows = (Array.isArray(d) ? d : d.items ?? []) as {
          id: string;
          room_number?: string | null;
          building?: string | null;
          address?: string | null;
        }[];
        setPropMap(
          rows.reduce<Record<string, string>>((acc, p) => {
            acc[p.id] = [p.room_number, p.building].filter(Boolean).join(' · ') || p.address || '房源';
            return acc;
          }, {}),
        );
      }

      setLoading(false);
      setRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    load(chip);
  }, [load, chip]);

  // 收缴率 = 已收 /（已收 + 待收），全部来自对账接口
  const received = Number(totals.received ?? 0);
  const receivable = Number(totals.receivable ?? 0);
  const collectRate = useMemo(() => {
    const base = received + receivable;
    return base > 0 ? Math.round((received / base) * 100) : 0;
  }, [received, receivable]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load(chip);
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* 本月收入卡 */}
      <View style={styles.incomeCard}>
        <View style={styles.incomeTop}>
          <View style={styles.incomeLeft}>
            <Text style={styles.incomeLabel}>本月总收入</Text>
            <Text style={styles.incomeNum}>{fmtMoney(summary.monthly_revenue)}</Text>
          </View>
          <Ionicons name="cash-outline" size={34} color={colors.alpha('255, 255, 255', 0.9)} />
        </View>

        <View style={styles.incomeSplit}>
          <View style={styles.incomeCell}>
            <Text style={styles.incomeCellLabel}>已收</Text>
            <Text style={styles.incomeCellValue}>{fmtMoney(received)}</Text>
          </View>
          <View style={styles.incomeDivider} />
          <View style={styles.incomeCell}>
            <Text style={styles.incomeCellLabel}>待收</Text>
            <Text style={styles.incomeCellValue}>{fmtMoney(receivable)}</Text>
          </View>
        </View>

        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>收缴率</Text>
          <Text style={styles.rateValue}>{collectRate}%</Text>
        </View>
        <View style={styles.rateTrack}>
          <View style={[styles.rateBar, { flex: Math.max(collectRate / 100, 0.02) }]} />
          <View style={{ flex: Math.max(1 - collectRate / 100, 0) }} />
        </View>
      </View>

      {/* 状态筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {CHIPS.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.chip, chip === c.key && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => setChip(c.key)}
          >
            <Text style={[styles.chipText, chip === c.key && styles.chipTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 交易记录 */}
      <View style={styles.listHead}>
        <Text style={styles.sectionTitle}>交易记录</Text>
        <Text style={styles.listHint}>共 {total} 笔</Text>
      </View>
      {payments.length === 0 ? (
        <EmptyState icon="card-outline" title="暂无交易记录" sub="该筛选条件下没有收付款流水" />
      ) : (
        payments.map((p) => {
          const meta = STATUS_META[p.status ?? ''] ?? {
            label: p.status ?? '未知',
            color: colors.ink2,
            rgb: colors.primaryRgb,
          };
          const channelKey = (p.channel ?? '').toLowerCase();
          const channelMeta = CHANNEL_META[channelKey] ?? {
            label: p.channel || '其他渠道',
            icon: 'card-outline' as keyof typeof Ionicons.glyphMap,
            color: colors.ink2,
            rgb: colors.primaryRgb,
          };
          const payer = p.payer_id ? userMap[p.payer_id] : null;
          const propName = p.property_id ? propMap[p.property_id] : null;
          return (
            <View key={p.id} style={styles.payCard}>
              <View style={[styles.payIcon, { backgroundColor: colors.alpha(channelMeta.rgb, 0.12) }]}>
                <Ionicons name={channelMeta.icon} size={18} color={channelMeta.color} />
              </View>
              <View style={styles.payBody}>
                <Text style={styles.payTitle} numberOfLines={1}>
                  {payer || TYPE_LABEL[p.payment_type ?? ''] || '收款'}
                </Text>
                <Text style={styles.paySub} numberOfLines={1}>
                  {[
                    propName || p.description || TYPE_LABEL[p.payment_type ?? ''] || '租金',
                    fmtDate(p.paid_at || p.due_date || p.created_at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <View style={styles.payRight}>
                <Text style={styles.payAmount}>{fmtMoney(p.amount, p.currency)}</Text>
                <View style={[styles.badge, { backgroundColor: colors.alpha(meta.rgb, 0.12) }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ===== 本月收入卡 ===== */
  incomeCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 18,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  incomeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  incomeLeft: { flex: 1 },
  incomeLabel: { fontSize: 13, color: colors.alpha('255, 255, 255', 0.8), marginBottom: 6 },
  incomeNum: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryForeground,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  incomeSplit: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.alpha('255, 255, 255', 0.25),
  },
  incomeCell: { flex: 1 },
  incomeDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.alpha('255, 255, 255', 0.25) },
  incomeCellLabel: { fontSize: 11, color: colors.alpha('255, 255, 255', 0.75) },
  incomeCellValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  rateLabel: { fontSize: 12, color: colors.alpha('255, 255, 255', 0.8) },
  rateValue: { fontSize: 12, fontWeight: '800', color: colors.primaryForeground },
  rateTrack: {
    flexDirection: 'row',
    height: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha('255, 255, 255', 0.3),
    overflow: 'hidden',
    marginTop: 8,
  },
  rateBar: { height: 5, borderRadius: colors.radius.full, backgroundColor: colors.primaryForeground },

  /* ===== 筛选 ===== */
  chipScroll: { flexGrow: 0, marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  /* ===== 列表 ===== */
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  listHint: { fontSize: 11, color: colors.ink3 },

  payCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...colors.shadow.sm,
  },
  payIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBody: { flex: 1, minWidth: 0 },
  payTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  paySub: { fontSize: 11, color: colors.ink3, marginTop: 4 },
  payRight: { alignItems: 'flex-end', gap: 5 },
  payAmount: { fontSize: 15, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
});