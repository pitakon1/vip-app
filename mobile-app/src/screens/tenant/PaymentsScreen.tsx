import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import { paymentsApi } from '@/services/api';
import { fmtMoney as formatMoney, fmtDate } from '@/utils/format';
import { notify, notifyError } from '@/utils/feedback';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { useI18n } from '@/i18n';

const formatDate = (x?: string) => fmtDate(x, 'minute');

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
  pending: { text: '待支付', color: colors.warning, bg: colors.warningLight },
  processing: { text: '处理中', color: colors.primary, bg: colors.sidebarActive },
  succeeded: { text: '已支付', color: colors.success, bg: colors.successLight },
  failed: { text: '支付失败', color: colors.error, bg: colors.errorLight },
  refunded: { text: '已退款', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  disputed: { text: '有争议', color: colors.error, bg: colors.errorLight },
  expired: { text: '已过期', color: colors.ink3, bg: colors.surface2 },
};

// 付款记录以「月份」为主标题（对齐原型：2025年7月 + 金额 + 状态徽标）
const monthLabel = (x?: string) => {
  if (!x) return '';
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
};

// 分段筛选（默认「待支付」——租客最关心待缴账单）
type PaySeg = 'pending' | 'paid' | 'all';

const SEG_TABS: { key: PaySeg; label: string }[] = [
  { key: 'pending', label: '待支付' },
  { key: 'paid', label: '已支付' },
  { key: 'all', label: '全部' },
];

// 是否已支付（含 succeeded 与历史 paid 两种状态）
const isPaid = (p: Payment) => p.status === 'succeeded' || p.status === 'paid';

export default function PaymentsScreen() {
  const { t } = useI18n();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // 当前分段（本地 state，默认待支付）
  const [seg, setSeg] = useState<PaySeg>('pending');
  // 当前正在发起支付的账单 id（避免重复提交 + 按钮 loading）
  const [payingId, setPayingId] = useState<string | null>(null);
  // 发票弹窗
  const [invoiceItem, setInvoiceItem] = useState<Payment | null>(null);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // 主 CTA 按压反馈：按下缩至 0.97、松手 spring 回弹（原生驱动；web 退化默认）
  const bannerScale = useRef(new Animated.Value(1)).current;
  const pressIn = (v: Animated.Value) =>
    Animated.spring(v, {
      toValue: 0.97,
      speed: 30,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  const pressOut = (v: Animated.Value) =>
    Animated.spring(v, {
      toValue: 1,
      speed: 30,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

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
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = payments.filter((p) => p.status === 'pending');
  // Stat Row 真实统计（对齐原型：已上传 / 待审核，此处映射为已支付 / 待支付）
  const paidCount = payments.filter(isPaid).length;
  const dueTotal = pending.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
  const currency = pending[0]?.currency || payments[0]?.currency || 'THB';

  // 分段列表数据 + 分段汇总（笔数 / 合计，供列表标题行展示）
  const segData = useMemo(() => {
    if (seg === 'pending') return payments.filter((p) => p.status === 'pending');
    if (seg === 'paid') return payments.filter(isPaid);
    return payments;
  }, [payments, seg]);
  const segTotal = segData.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const segMeta =
    seg === 'pending'
      ? { text: '待支付', color: colors.warning }
      : seg === 'paid'
      ? { text: '已支付', color: colors.success }
      : { text: '全部', color: colors.ink2 };

  // 本月租金：当月到期的租金类账单（真实数据；无则回退为待缴合计）
  const now = new Date();
  const monthRent = pending.find((p) => {
    if (p.payment_type !== 'rent' || !p.due_date) return false;
    const d = new Date(p.due_date);
    return (
      !Number.isNaN(d.getTime()) &&
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth()
    );
  });
  const heroLabel = monthRent ? '本月租金' : '待缴合计';
  const heroAmount = monthRent ? Number(monthRent.amount || 0) : dueTotal;

  const channelFor = (cur?: string) =>
    cur === 'CNY' ? 'wechat' : cur === 'USD' ? 'stripe' : 'promptpay';

  const handlePay = async (item: Payment) => {
    setPayingId(item.id);
    try {
      const res: any = await paymentsApi.pay(item.id, channelFor(item.currency));
      const data = res?.data ?? res;
      setPayments((list) =>
        list.map((p) => (p.id === item.id ? { ...p, status: 'processing' } : p))
      );
      const checkoutUrl =
        data?.checkout_url ?? data?.qr_code ?? data?.qr ?? data?.url;
      notify(
        '发起支付',
        checkoutUrl
          ? `支付链接已生成，请完成支付：\n${checkoutUrl}`
          : '支付单已提交，正在处理中。未配置支付渠道时将使用演示通道。'
      );
    } catch (err: any) {
      notifyError('支付失败', err, () => handlePay(item));
    } finally {
      setPayingId(null);
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
      notify('缴费凭证', lines);
    } catch (err: any) {
      notifyError('获取凭证失败', err, () => handleReceipt(item));
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
      setInvoiceItem(null);
      setInvoiceData(null);
      notifyError('获取发票失败', err, () => openInvoice(item));
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
        {/* 行式记录：月份 + 类型/截止 + 金额 + 状态徽标（对齐原型） */}
        <View style={styles.rowMain}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {monthLabel(item.due_date) ||
                typeLabels[item.payment_type ?? ''] ||
                item.payment_type ||
                '账单'}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {typeLabels[item.payment_type ?? ''] ?? '账单'} · 截止 {formatDate(item.due_date)}
            </Text>
            {!!item.description && (
              <Text style={styles.rowDesc} numberOfLines={1}>
                {item.description}
              </Text>
            )}
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowAmount}>{formatMoney(item.amount, item.currency)}</Text>
            <View style={[styles.badge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.badgeText, { color: meta.color }]}>{meta.text}</Text>
            </View>
          </View>
        </View>
        {isPending && (
          <TouchableOpacity
            style={[styles.payBtn, payingId === item.id && styles.payBtnDisabled]}
            activeOpacity={0.8}
            onPress={() => handlePay(item)}
            disabled={payingId === item.id}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${typeLabels[item.payment_type ?? ''] ?? '账单'}，去支付`}
          >
            {payingId === item.id ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.payBtnText}>去支付</Text>
            )}
          </TouchableOpacity>
        )}
        {isSucceeded && (
          <View style={styles.succBtnRow}>
            <TouchableOpacity
              style={styles.receiptBtn}
              activeOpacity={0.8}
              onPress={() => handleReceipt(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="查看缴费凭证"
            >
              <Text style={styles.receiptBtnText}>查看凭证</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.receiptBtn}
              activeOpacity={0.8}
              onPress={() => openInvoice(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="查看发票"
            >
              <Text style={styles.receiptBtnText}>发票</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!item.paid_at && <Text style={styles.time}>支付时间 {formatDate(item.paid_at)}</Text>}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="加载账单中…" />
      </View>
    );
  }

  // banner 发起中目标（一次性屏蔽重复点击）
  const bannerTarget = monthRent ?? pending[0];
  const bannerPaying = !!bannerTarget && payingId === bannerTarget.id;

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <View style={styles.bannerHead}>
          <Text style={styles.bannerLabel}>{heroLabel}</Text>
          {pending.length > 0 && (
            <View style={styles.bannerBadge}>
              <Text style={styles.bannerBadgeText}>待支付</Text>
            </View>
          )}
        </View>
        <Text style={styles.bannerAmount}>{formatMoney(heroAmount, currency)}</Text>
        <Text style={styles.bannerSub}>共 {pending.length} 笔待支付账单</Text>
        {pending.length > 0 && (
          <Animated.View style={{ transform: [{ scale: bannerScale }] }}>
            <TouchableOpacity
              style={[styles.bannerBtn, bannerPaying && styles.payBtnDisabled]}
              activeOpacity={0.85}
              onPress={() => handlePay(bannerTarget!)}
              disabled={bannerPaying}
              onPressIn={() => pressIn(bannerScale)}
              onPressOut={() => pressOut(bannerScale)}
              accessibilityRole="button"
              accessibilityLabel="立即缴费"
              accessibilityState={{ disabled: bannerPaying }}
            >
              {bannerPaying ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={styles.bannerBtnText}>立即缴费</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
      {/* Stat Row（真实账单统计） */}
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>已支付</Text>
          <Text style={styles.statValue}>{paidCount} 笔</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>待支付</Text>
          <Text style={[styles.statValue, pending.length > 0 && { color: colors.warning }]}>
            {pending.length} 笔
          </Text>
        </View>
      </View>
      {/* 分段筛选（待支付 / 已支付 / 全部，默认待支付） */}
      <View style={styles.segBar}>
        {SEG_TABS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.segItem, seg === s.key && styles.segItemActive]}
            onPress={() => setSeg(s.key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: seg === s.key }}
            accessibilityLabel={`${s.label}账单`}
          >
            <Text style={[styles.segText, seg === s.key && styles.segTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* 付款记录（标题行同时给出当前分段汇总：笔数 · 合计） */}
      <View style={styles.summaryRow}>
        <Text style={styles.sectionTitle}>付款记录</Text>
        <Text style={[styles.summaryText, { color: segMeta.color }]}>
          {segMeta.text} {segData.length} 笔 · 合计 {formatMoney(segTotal, currency)}
        </Text>
      </View>
      <FlatList
        data={segData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          loadError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title={t('loadFailed')}
              sub={t('loadFailedSub')}
              actionLabel={t('retry')}
              onAction={async () => {
                setLoading(true);
                await load();
              }}
            />
          ) : (
            <EmptyState
              icon="card-outline"
              title={
                seg === 'pending'
                  ? '暂无待支付账单'
                  : seg === 'paid'
                  ? '暂无已支付账单'
                  : t('empty.bills')
              }
              sub={t('empty.billsSub')}
            />
          )
        }
        ListFooterComponent={<View style={{ height: 12 }} />}
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
            <TouchableOpacity
              style={styles.invClose}
              onPress={closeInvoice}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="关闭"
            >
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
  bannerLabel: { color: colors.alpha('255,255,255', 0.85), fontSize: 13 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerBadge: {
    backgroundColor: colors.alpha('255,255,255', 0.2),
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bannerBadgeText: { color: colors.primaryForeground, fontSize: 11, fontWeight: '600' },
  bannerAmount: {
    color: colors.primaryForeground,
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  bannerSub: { color: colors.alpha('255,255,255', 0.85), fontSize: 12, marginTop: 2 },
  bannerBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
  },
  bannerBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statLabel: { fontSize: 12, color: colors.ink2 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 4 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  // 分段筛选（待支付 / 已支付 / 全部）
  segBar: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    padding: 4,
  },
  segItem: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: colors.radius.sm,
  },
  segItemActive: { backgroundColor: colors.primary },
  segText: { fontSize: 14, color: colors.ink2, fontWeight: '500' },
  segTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  // 列表标题 + 当前分段汇总（笔数 · 合计）
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  summaryText: { fontSize: 12, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowLeft: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.ink2, marginTop: 4 },
  rowDesc: { fontSize: 12, color: colors.ink2, marginTop: 4 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowAmount: { fontSize: 17, fontWeight: '700', color: colors.ink },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.sm },
  badgeText: { fontSize: 12, fontWeight: '600' },
  time: { fontSize: 12, color: colors.ink2, marginTop: 6 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
  payBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: colors.radius.full,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  receiptBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: colors.radius.full,
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
    backgroundColor: colors.alpha('0,0,0', 0.4),
    justifyContent: 'center',
    padding: 24,
  },
  invCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
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