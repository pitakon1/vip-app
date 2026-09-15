import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
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
  pending: { text: '待支付', color: colors.warning, bg: '#fff6e6' },
  processing: { text: '处理中', color: colors.primary, bg: colors.sidebarActive },
  succeeded: { text: '已支付', color: colors.success, bg: '#e7f6ee' },
  failed: { text: '支付失败', color: colors.error, bg: '#fdecec' },
  refunded: { text: '已退款', color: colors.info, bg: '#e6f4fd' },
  disputed: { text: '有争议', color: colors.error, bg: '#fdecec' },
  expired: { text: '已过期', color: colors.ink3, bg: 'colors.surface2' },
};

const formatMoney = (v: any, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '฿';
  return `${cur}${Number(v || 0).toLocaleString()}`;
};

const formatDate = (x?: string) =>
  x ? x.replace('T', ' ').slice(0, 16) : '—';

export default function PaymentsScreen() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // 发票弹窗
  const [invoiceItem, setInvoiceItem] = useState<Payment | null>(null);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

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
    } catch {
      // 忽略加载失败
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = payments.filter((p) => p.status === 'pending');
  const dueTotal = pending.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
  const currency = pending[0]?.currency || payments[0]?.currency || 'THB';

  const channelFor = (cur?: string) =>
    cur === 'CNY' ? 'wechat' : cur === 'USD' ? 'stripe' : 'promptpay';

  const handlePay = async (item: Payment) => {
    try {
      const res: any = await paymentsApi.pay(item.id, channelFor(item.currency));
      const data = res?.data ?? res;
      setPayments((list) =>
        list.map((p) => (p.id === item.id ? { ...p, status: 'processing' } : p))
      );
      const checkoutUrl =
        data?.checkout_url ?? data?.qr_code ?? data?.qr ?? data?.url;
      Alert.alert(
        '发起支付',
        checkoutUrl
          ? `支付链接已生成，请完成支付：\n${checkoutUrl}`
          : '支付单已提交，正在处理中。未配置支付渠道时将使用演示通道。'
      );
    } catch (err: any) {
      Alert.alert(
        '支付失败',
        err?.response?.data?.detail || '请稍后重试'
      );
    }
  };

  const handleReceipt = async (item: Payment) => {
    try {
      const res: any = await paymentsApi.receipt(item.id);
      const r = res?.data ?? res;
      const lines = [
        '=== 缴费凭证 ===',
        `单号：${(r.reference_no || item.id).slice(0, 16)}`,
        `金额：${formatMoney(r.amount ?? item.amount, r.currency ?? item.currency)}`,
        `类型：${typeLabels[r.payment_type ?? ''] ?? r.payment_type ?? '-'}`,
        `渠道：${r.channel || '-'}${r.channel_transaction_id ? `（${r.channel_transaction_id}）` : ''}`,
        `支付时间：${formatDate(r.paid_at ?? item.paid_at)}`,
      ].join('\n');
      Alert.alert('缴费凭证', lines, [
        { text: '关闭' },
        { text: '知道了', style: 'default' },
      ]);
    } catch (err: any) {
      Alert.alert('获取凭证失败', err?.response?.data?.detail || '请稍后重试');
    }
  };

  const openInvoice = async (item: Payment) => {
    setInvoiceItem(item);
    setInvoiceData(null);
    setInvoiceLoading(true);
    try {
      const res: any = await paymentsApi.invoice(item.id);
      setInvoiceData(res?.data ?? res);
    } catch (err: any) {
      Alert.alert('获取发票失败', err?.response?.data?.detail || '请稍后重试');
      setInvoiceItem(null);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const closeInvoice = () => {
    setInvoiceItem(null);
    setInvoiceData(null);
  };

  const money = (v: any, currency?: string) => formatMoney(v, currency);

  const renderInvoice = () => {
    const iv = invoiceData;
    if (!iv) return null;
    const cur = iv.currency || invoiceItem?.currency;
    return (
      <>
        <Ionicons name="document-text-outline" size={20} color={colors.primary} style={styles.invTitleIcon} />
        <Text style={styles.invNo}>发票号 {iv.invoice_no || '—'}</Text>
        <View style={styles.invRow}>
          <Text style={styles.invLabel}>净金额</Text>
          <Text style={styles.invValue}>{money(iv.net_amount, cur)}</Text>
        </View>
        <View style={styles.invRow}>
          <Text style={styles.invLabel}>税额（{iv.vat_rate ? `${iv.vat_rate}%` : '—'}）</Text>
          <Text style={styles.invValue}>{money(iv.tax_amount, cur)}</Text>
        </View>
        <View style={styles.invDivider} />
        <View style={styles.invRow}>
          <Text style={styles.invLabelBold}>合计（含税）</Text>
          <Text style={styles.invTotal}>{money(iv.total_amount, cur)}</Text>
        </View>
        <Text style={styles.invMeta}>开票抬头：{iv.bill_to?.name || '—'}</Text>
        {!!iv.bill_to?.email && <Text style={styles.invMeta}>电子邮箱：{iv.bill_to.email}</Text>}
        {!!iv.description && <Text style={styles.invMeta}>项目：{iv.description}</Text>}
        <Text style={styles.invMeta}>
          支付渠道：{iv.channel || '—'} · 支付时间：{formatDate(iv.paid_at)}
        </Text>
      </>
    );
  };

  const renderItem = ({ item }: { item: Payment }) => {
    const meta = statusMeta[item.status ?? 'pending'] ?? statusMeta.pending;
    const isPending = item.status === 'pending';
    const isSucceeded = item.status === 'succeeded';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.type}>
            {typeLabels[item.payment_type ?? ''] ?? item.payment_type ?? '账单'}
          </Text>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.text}</Text>
          </View>
        </View>
        {!!item.description && (
          <Text style={styles.desc} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <Text style={[styles.amount, { color: meta.color }]}>
          {formatMoney(item.amount, item.currency)}
        </Text>
        <Text style={styles.time}>
          截止 {formatDate(item.due_date)} · 支付 {formatDate(item.paid_at)}
        </Text>
        {isPending && (
          <TouchableOpacity
            style={styles.payBtn}
            activeOpacity={0.8}
            onPress={() => handlePay(item)}
          >
            <Text style={styles.payBtnText}>去支付</Text>
          </TouchableOpacity>
        )}
        {isSucceeded && (
          <View style={styles.succBtnRow}>
            <TouchableOpacity
              style={styles.receiptBtn}
              activeOpacity={0.8}
              onPress={() => handleReceipt(item)}
            >
              <Text style={styles.receiptBtnText}>查看凭证</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.receiptBtn}
              activeOpacity={0.8}
              onPress={() => openInvoice(item)}
            >
              <Text style={styles.receiptBtnText}>发票</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>待缴合计</Text>
        <Text style={styles.bannerAmount}>{formatMoney(dueTotal, currency)}</Text>
        <Text style={styles.bannerSub}>共 {pending.length} 笔待支付账单</Text>
        {pending.length > 0 && (
          <TouchableOpacity
            style={styles.bannerBtn}
            activeOpacity={0.85}
            onPress={() => handlePay(pending[0])}
          >
            <Text style={styles.bannerBtnText}>立即缴费</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>暂无账单</Text>}
      />

      {/* 发票弹窗 */}
      <Modal
        visible={!!invoiceItem}
        transparent
        animationType="slide"
        onRequestClose={closeInvoice}
      >
        <View style={styles.invWrap}>
          <View style={styles.invCard}>
            <TouchableOpacity style={styles.invClose} onPress={closeInvoice} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
            {invoiceLoading ? (
              <View style={styles.invCenter}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              renderInvoice()
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 12,
  },
  bannerLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  bannerAmount: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  bannerBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  bannerBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  type: { fontSize: 15, fontWeight: '600', color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  desc: { fontSize: 12, color: colors.ink2, marginTop: 6 },
  amount: { fontSize: 18, fontWeight: '700', marginTop: 10 },
  time: { fontSize: 11, color: colors.ink3, marginTop: 6 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
  payBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
  },
  payBtnText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  receiptBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
  },
  receiptBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  succBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  invWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  invCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    paddingTop: 34,
  },
  invClose: { position: 'absolute', top: 12, right: 12, padding: 4 },
  invCenter: { alignItems: 'center', paddingVertical: 32 },
  invTitleIcon: { fontSize: 32, textAlign: 'center', marginBottom: 8 },
  invNo: { fontSize: 13, color: colors.ink2, textAlign: 'center', marginBottom: 16 },
  invRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  invLabel: { fontSize: 14, color: colors.ink2 },
  invLabelBold: { fontSize: 14, color: colors.ink, fontWeight: '700' },
  invValue: { fontSize: 14, color: colors.ink },
  invTotal: { fontSize: 17, color: colors.primary, fontWeight: '700' },
  invDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  invMeta: { fontSize: 12, color: colors.ink3, marginTop: 8 },
});