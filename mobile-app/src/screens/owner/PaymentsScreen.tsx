import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { paymentsApi } from '@/services/api';
import { fmtMoney as money } from '@/utils/format';

type IoniconName = keyof typeof Ionicons.glyphMap;
type Group = 'due' | 'paid' | 'overdue';

interface Payment {
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

const typeLabels: Record<string, string> = {
  rent: '租金',
  deposit: '押金',
  commission: '佣金',
  service_fee: '服务费',
  utility: '物业费',
  tax: '税费',
  refund: '退款',
};

const typeIcons: Record<string, IoniconName> = {
  rent: 'home-outline',
  deposit: 'lock-closed-outline',
  commission: 'briefcase-outline',
  service_fee: 'construct-outline',
  utility: 'water-outline',
  tax: 'document-text-outline',
  refund: 'refresh-outline',
};

const statusMap: Record<string, { text: string; group: Group; color: string; bg: string }> = {
  pending: { text: '待缴', group: 'due', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1) },
  processing: { text: '处理中', group: 'due', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  succeeded: { text: '已缴', group: 'paid', color: colors.success, bg: colors.alpha(colors.successRgb, 0.1) },
  refunded: { text: '已退款', group: 'paid', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  failed: { text: '逾期', group: 'overdue', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
  expired: { text: '逾期', group: 'overdue', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
  disputed: { text: '争议', group: 'overdue', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
};

const FILTERS: { key: 'all' | Group; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'due', label: '待缴' },
  { key: 'paid', label: '已缴' },
  { key: 'overdue', label: '逾期' },
];

const formatDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '-');

const groupOf = (status?: string): Group => statusMap[status ?? '']?.group ?? 'due';

export default function OwnerPaymentsScreen() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<'all' | Group>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: any = await paymentsApi.mine();
      const data = res?.data;
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setPayments(items as Payment[]);
    } catch (err: any) {
      // 列表失败不阻断渲染，保留空态
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

  const ccy = payments[0]?.currency || 'THB';

  /* ===== 汇总卡口径（真实聚合） ===== */
  const dueTotal = payments
    .filter((p) => groupOf(p.status) !== 'paid')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const monthPaid = useMemo(() => {
    const now = new Date();
    return payments
      .filter((p) => groupOf(p.status) === 'paid' && !!p.paid_at)
      .filter((p) => {
        const d = new Date(String(p.paid_at));
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }, [payments]);

  const utilityTotal = payments
    .filter((p) => p.payment_type === 'utility')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const filtered = useMemo(
    () => (filter === 'all' ? payments : payments.filter((p) => groupOf(p.status) === filter)),
    [payments, filter],
  );

  const channelFor = (c?: string) => (c === 'CNY' ? 'wechat' : c === 'USD' ? 'stripe' : 'promptpay');

  const handlePay = async (item: Payment) => {
    try {
      const res: any = await paymentsApi.pay(item.id, channelFor(item.currency));
      const data = res?.data ?? res;
      setPayments((list) =>
        list.map((p) => (p.id === item.id ? { ...p, status: 'processing' } : p)),
      );
      const checkoutUrl = data?.checkout_url ?? data?.qr_code ?? data?.qr ?? data?.url;
      Alert.alert(
        '发起支付',
        checkoutUrl
          ? `支付链接已生成，请完成支付：\n${checkoutUrl}`
          : '支付单已提交，正在处理中。',
      );
    } catch (err: any) {
      Alert.alert('支付失败', err?.response?.data?.detail || '请稍后重试');
    }
  };

  const renderItem = ({ item }: { item: Payment }) => {
    const meta = statusMap[item.status ?? ''] ?? statusMap.pending;
    const group = groupOf(item.status);
    const icon = typeIcons[item.payment_type ?? ''] ?? 'receipt-outline';
    const label = typeLabels[item.payment_type ?? ''] ?? item.payment_type ?? '账单';

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Ionicons name={icon} size={20} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.type} numberOfLines={1}>{label}</Text>
              <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.badgeText, { color: meta.color }]}>{meta.text}</Text>
              </View>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {item.property || item.description || '账单'} · 到期 {formatDate(item.due_date)}
            </Text>
          </View>
        </View>
        <View style={styles.cardFoot}>
          <Text style={styles.amount}>{money(item.amount, item.currency || ccy)}</Text>
          {group === 'paid' ? (
            <View style={[styles.btn, styles.btnSecondary]}>
              <Ionicons name="checkmark" size={14} color={colors.ink3} />
              <Text style={[styles.btnText, { color: colors.ink3 }]}>已缴清</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.btn, group === 'overdue' ? styles.btnDanger : styles.btnPrimary]}
              activeOpacity={0.85}
              onPress={() => handlePay(item)}
            >
              <Ionicons
                name={group === 'overdue' ? 'alert-circle-outline' : 'card-outline'}
                size={14}
                color={colors.primaryForeground}
              />
              <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
                {group === 'overdue' ? '逾期缴费' : '立即缴费'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载账单…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* 汇总卡：待缴总额 / 本月已缴 / 物业费 */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>待缴总额</Text>
              <Text style={styles.heroAmount}>{money(dueTotal, ccy)}</Text>
              <View style={styles.heroDivider} />
              <View style={styles.heroStats}>
                <View>
                  <Text style={styles.heroStatLabel}>本月已缴</Text>
                  <Text style={styles.heroStatVal}>{money(monthPaid, ccy)}</Text>
                </View>
                <View style={styles.heroStatRight}>
                  <Text style={styles.heroStatLabel}>物业费</Text>
                  <Text style={styles.heroStatVal}>{money(utilityTotal, ccy)}</Text>
                </View>
              </View>
            </View>

            {/* 筛选 chips */}
            <View style={styles.chips}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.8}
                    onPress={() => setFilter(f.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>账单列表</Text>
              <Text style={styles.sectionHint}>{filtered.length} 笔</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="documents-outline"
            title="暂无账单"
            sub="名下房源产生物业费、水电费或租金结算后，会在这里列出每一笔"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  list: { paddingHorizontal: colors.spacing.md, paddingBottom: 24 },

  /* 汇总卡 */
  heroCard: {
    marginTop: colors.spacing.md,
    marginBottom: colors.spacing.lg,
    padding: colors.spacing.xl,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  heroLabel: { fontSize: colors.fontSize.base, color: colors.alpha('255, 255, 255', 0.8) },
  heroAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryForeground,
    marginTop: 4,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.alpha('255, 255, 255', 0.25),
    marginVertical: colors.spacing.lg,
  },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between' },
  heroStatRight: { alignItems: 'flex-end' },
  heroStatLabel: { fontSize: colors.fontSize.xs, color: colors.alpha('255, 255, 255', 0.7), marginBottom: 2 },
  heroStatVal: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryForeground,
    fontVariant: ['tabular-nums'],
  },

  /* chips */
  chips: { flexDirection: 'row', gap: 8, marginBottom: colors.spacing.md },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.base, fontWeight: '500', color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  /* 区块标题 */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },

  /* 账单卡 */
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  type: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: colors.fontSize.base, color: colors.ink3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.full },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: {
    fontSize: colors.fontSize['2xl'],
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.md,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: colors.error },
  btnSecondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  btnText: { fontSize: colors.fontSize.sm, fontWeight: '700' },
});