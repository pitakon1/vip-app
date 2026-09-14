import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { paymentsApi } from '@/services/api';

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

const statusMeta: Record<
  string,
  { text: string; color: string; bg: string }
> = {
  pending: { text: '待入账', color: colors.warning, bg: 'rgba(217,119,6,0.1)' },
  processing: { text: '处理中', color: colors.info, bg: 'rgba(14,165,233,0.1)' },
  succeeded: { text: '已到账', color: colors.success, bg: 'rgba(22,163,74,0.1)' },
  failed: { text: '支付失败', color: colors.error, bg: 'rgba(220,38,38,0.1)' },
  refunded: { text: '已退款', color: colors.info, bg: 'rgba(14,165,233,0.1)' },
  disputed: { text: '有争议', color: colors.error, bg: 'rgba(220,38,38,0.1)' },
  expired: { text: '已过期', color: colors.ink3, bg: colors.surface2 },
};

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const money = (v: any, c?: string) => `${cur(c)}${Number(v || 0).toLocaleString()}`;
const formatDate = (x?: string) =>
  x ? x.replace('T', ' ').slice(0, 16) : '-';

export default function OwnerPaymentsScreen() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: any = await paymentsApi.mine();
      const data = res?.data;
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];
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

  // 业主视角 KPI：从列表计算
  const received = payments.filter((p) => p.status === 'succeeded');
  const pending = payments.filter(
    (p) => p.status === 'pending' || p.status === 'processing'
  );
  const disputed = payments.filter(
    (p) => p.status === 'failed' || p.status === 'disputed' || p.status === 'refunded'
  );
  const receivedTotal = received.reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingTotal = pending.reduce((s, p) => s + Number(p.amount || 0), 0);
  const ccy =
    payments[0]?.currency || received[0]?.currency || 'THB';

  const renderItem = ({ item }: { item: Payment }) => {
    const meta = statusMeta[item.status ?? 'pending'] ?? statusMeta.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.recordIcon]}>
            <Ionicons name="wallet-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.type} numberOfLines={1}>
              {typeLabels[item.payment_type ?? ''] ?? item.payment_type ?? '账单'}
            </Text>
            {!!item.property && (
              <Text style={styles.property} numberOfLines={1}>
                <Ionicons name="home-outline" size={12} color={colors.ink3} />{' '}
                {item.property}
              </Text>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.text}</Text>
          </View>
        </View>
        {!!item.description && (
          <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={styles.amountRow}>
          <Text style={[styles.amount, { color: meta.color }]}>
            {money(item.amount, item.currency)}
          </Text>
          <Text style={styles.time}>
            {formatDate(item.paid_at || item.due_date)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载付款记录…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>累计已到账</Text>
            <Text style={styles.heroAmount}>{money(receivedTotal, ccy)}</Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatVal}>
                  {money(pendingTotal, ccy)}
                </Text>
                <Text style={styles.heroStatLabel}>待入账</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatVal}>{pending.length}</Text>
                <Text style={styles.heroStatLabel}>待处理笔数</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStatItem}>
                <Text style={[styles.heroStatVal, { color: colors.error }]}>
                  {disputed.length}
                </Text>
                <Text style={styles.heroStatLabel}>异常笔数</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="documents-outline"
            title="暂无付款记录"
            sub="名下房源产生租金或费用结算后，会在这里按时间列出每一笔"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  list: { paddingHorizontal: 12, paddingBottom: 24 },

  /* 顶部 KPI 汇总 */
  heroCard: {
    marginTop: 12,
    marginBottom: 4,
    padding: 20,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroAmount: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    marginTop: 6,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  heroStats: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 15, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3 },
  heroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)' },

  /* 列表卡片 */
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  recordIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.md,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  type: { fontSize: 15, fontWeight: '600', color: colors.text },
  property: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.full, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  desc: { fontSize: 12, color: colors.ink2, marginTop: 8 },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  amount: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  time: { fontSize: 11, color: colors.ink3 },
});