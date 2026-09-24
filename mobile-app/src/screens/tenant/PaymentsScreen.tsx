import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import colors from '@/theme/colors';
import { paymentsApi } from '@/services/api';
import { fmtMoney as formatMoney, fmtDate } from '@/utils/format';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import PaymentSheet from '@/components/PaymentSheet';
import { resolvePayment } from '@/utils/payment';
import { useI18n } from '@/i18n';
import { useUserCapabilities } from '@/hooks/useUserCapabilities';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';

const PAYMENTS_KEY = (uid: string): string[] => ['payments', 'mine', uid];

type IoniconName = keyof typeof Ionicons.glyphMap;

type TFunc = (key: string, params?: Record<string, string | number>) => string;

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

const typeLabelText = (t: TFunc, type?: string) => {
  switch (type) {
    case 'rent':
      return t('pay.type.rent');
    case 'deposit':
      return t('pay.type.deposit');
    case 'commission':
      return t('pay.type.commission');
    case 'service_fee':
      return t('pay.type.service_fee');
    case 'utility':
      return t('pay.type.utility');
    case 'tax':
      return t('pay.type.tax');
    case 'refund':
      return t('pay.type.refund');
    default:
      return '';
  }
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

/** 业主视角：状态 → 分组（全部/待缴/已缴/逾期），主视图按业主收款/应缴口径）
 *  租客视角：待支付/已支付/全部 */
type OwnerGroup = 'due' | 'paid' | 'overdue';

const ownerStatusMap: Record<string, { key: string; group: OwnerGroup; color: string; bg: string }> = {
  pending: { key: 'pay.ownerDue', group: 'due', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1) },
  processing: { key: 'common.processing', group: 'due', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  succeeded: { key: 'pay.ownerPaid', group: 'paid', color: colors.success, bg: colors.alpha(colors.successRgb, 0.1) },
  refunded: { key: 'pay.status.refunded', group: 'paid', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  failed: { key: 'pay.ownerOverdue', group: 'overdue', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
  expired: { key: 'pay.ownerOverdue', group: 'overdue', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
  disputed: { key: 'pay.ownerDisputed', group: 'overdue', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
};

const ownerGroupOf = (status?: string): OwnerGroup => ownerStatusMap[status ?? '']?.group ?? 'due';

const ownerFilters = (t: TFunc): { key: 'all' | OwnerGroup; label: string }[] => [
  { key: 'all', label: t('common.all') },
  { key: 'due', label: t('pay.ownerDue') },
  { key: 'paid', label: t('pay.ownerPaid') },
  { key: 'overdue', label: t('pay.ownerOverdue') },
];

// 付款记录以「月份」为主标题（对齐原型：2025年7月 + 金额 + 状态徽标）
const monthLabel = (t: TFunc, x?: string) => {
  if (!x) return '';
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return '';
  return t('pay.yearMonth', { y: d.getFullYear(), m: d.getMonth() + 1 });
};

// 是否已支付（含 succeeded 与历史 paid 两种状态）
const isPaid = (p: Payment) => p.status === 'succeeded' || p.status === 'paid';

// react-native-web 下 `Alert.alert` 是空实现，统一降级浏览器原生 alert
const notify = (title?: string, message?: string) => {
  const text = message ? `${title ?? ''}\n${message}` : (title ?? '');
  if (Platform.OS === 'web') window.alert(text);
  else Alert.alert(title ?? '', message ?? '');
};

/**
 * 缴费中心（C 端共用）
 * 业主 / 租客已合并为单一 C 端（对齐贝壳「一个 App 按行为动态显示」心智）：
 *  - 租客：待支付账单（本月租金/待缴合计 hero + 待支付/已支付/全部 分段 + 去支付/凭证/发票）
 *  - 业主：名下房源应收/已缴（待支付/本月已付/物业费 hero + 全部/待缴/已缴/逾期 筛选 + 补缴）
 * 数据源统一为 paymentsApi.mine()。
 */
export default function PaymentsScreen() {
  const { t } = useI18n();
  const { canManageProperty, isActiveTenant } = useUserCapabilities();
  // 用户可能「既是业主又是租客」，能力驱动：有三种叠加，为避免嵌套滚动列表，双身份时用分段切换
  const showOwner = canManageProperty;
  const showTenant = isActiveTenant;
  const [view, setView] = useState<'owner' | 'tenant'>(
    canManageProperty ? 'owner' : 'tenant',
  );
  const activeView = showOwner ? (showTenant ? view : 'owner') : 'tenant';

  if (!showTenant || !showOwner) {
    return showOwner ? <OwnerPaymentsView /> : <TenantPaymentsView />;
  }

  return (
    <View style={styles.container}>
      {/** 双身份：分段切换「业主缴费 / 租客缴费」 */}
      <View style={styles.dualSeg}>
        {(
          [
            { key: 'owner', label: t('pay.ownerTab') },
            { key: 'tenant', label: t('pay.tenantTab') },
          ] as const
        ).map((s) => {
          const active = activeView === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.dualSegItem, active && styles.dualSegItemActive]}
              activeOpacity={0.8}
              onPress={() => setView(s.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.dualSegText, active && styles.dualSegTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {activeView === 'owner' ? <OwnerPaymentsView /> : <TenantPaymentsView />}
    </View>
  );
}

/* ========================= 租客视角：待支付账单 ========================= */
type PaySeg = 'pending' | 'paid' | 'all';

const segTabs = (t: TFunc): { key: PaySeg; label: string }[] => [
  { key: 'pending', label: t('pay.status.pending') },
  { key: 'paid', label: t('pay.status.succeeded') },
  { key: 'all', label: t('common.all') },
];

const tenantStatusMeta: Record<string, { key: string; color: string; bg: string }> = {
  pending: { key: 'pay.status.pending', color: colors.warning, bg: colors.warningLight },
  processing: { key: 'common.processing', color: colors.primary, bg: colors.sidebarActive },
  succeeded: { key: 'pay.status.succeeded', color: colors.success, bg: colors.successLight },
  failed: { key: 'pay.status.failed', color: colors.error, bg: colors.errorLight },
  refunded: { key: 'pay.status.refunded', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  disputed: { key: 'pay.status.disputed', color: colors.error, bg: colors.errorLight },
  expired: { key: 'mkt.lsExpired', color: colors.ink3, bg: colors.surface2 },
};

function TenantPaymentsView() {
  const { t } = useI18n();
  const SEG_TABS = useMemo(() => segTabs(t), [t]);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const uid = user?.id ?? 'anon';
  const [seg, setSeg] = useState<PaySeg>('pending');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [invoiceItem, setInvoiceItem] = useState<Payment | null>(null);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [payQr, setPayQr] = useState<{ qr: string; amount: number; currency?: string; channelLabel?: string } | null>(null);

  const bannerScale = useRef(new Animated.Value(1)).current;
  const pressIn = (v: Animated.Value) =>
    Animated.spring(v, { toValue: 0.97, speed: 30, bounciness: 0, useNativeDriver: Platform.OS !== 'web' }).start();
  const pressOut = (v: Animated.Value) =>
    Animated.spring(v, { toValue: 1, speed: 30, bounciness: 0, useNativeDriver: Platform.OS !== 'web' }).start();

  const q = useCachedQuery<Payment[]>({
    queryKey: PAYMENTS_KEY(uid),
    cacheKey: `payments:mine:${uid}`,
    queryFn: async () => {
      const res: any = await paymentsApi.mine();
      const data = res?.data;
      return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    },
  });
  const payments = q.data ?? [];
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const loadError = q.isError && !q.data;
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  const markProcessing = useCallback(
    (id: string) => {
      queryClient.setQueryData<Payment[]>(PAYMENTS_KEY(uid), (old) =>
        (old ?? []).map((p) => (p.id === id ? { ...p, status: 'processing' } : p)),
      );
    },
    [queryClient, uid],
  );

  const pending = payments.filter((p) => p.status === 'pending');
  const paidCount = payments.filter(isPaid).length;
  const dueTotal = pending.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const currency = pending[0]?.currency || payments[0]?.currency || 'THB';

  const segData = useMemo(() => {
    if (seg === 'pending') return payments.filter((p) => p.status === 'pending');
    if (seg === 'paid') return payments.filter(isPaid);
    return payments;
  }, [payments, seg]);
  const segTotal = segData.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const segMeta =
    seg === 'pending' ? { text: t('pay.status.pending'), color: colors.warning }
    : seg === 'paid' ? { text: t('pay.status.succeeded'), color: colors.success }
    : { text: t('common.all'), color: colors.ink2 };

  const now = new Date();
  const monthRent = pending.find((p) => {
    if (p.payment_type !== 'rent' || !p.due_date) return false;
    const d = new Date(p.due_date);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const heroLabel = monthRent ? t('pay.heroThisMonthRent') : t('pay.heroDueTotal');
  const heroAmount = monthRent ? Number(monthRent.amount || 0) : dueTotal;

  const channelFor = (cur?: string) => (cur === 'CNY' ? 'wechat' : cur === 'USD' ? 'stripe' : 'promptpay');
  const channelLabelFor = (cur?: string) =>
    cur === 'CNY' ? t('pay.channelWechat') : cur === 'USD' ? t('pay.channelStripe') : 'PromptPay';

  const handlePay = async (item: Payment) => {
    setPayingId(item.id);
    try {
      const res: any = await paymentsApi.pay(item.id, channelFor(item.currency));
      const data = res?.data ?? res;
      markProcessing(item.id);
      const resolution = resolvePayment(data);
      if (resolution.kind === 'url') {
        // 托管收银台渠道：直接跳转支付页面
        await WebBrowser.openBrowserAsync(resolution.url);
      } else if (resolution.kind === 'qr') {
        // 扫码渠道：展示二维码供用户扫描
        setPayQr({
          qr: resolution.qr,
          amount: Number(item.amount || 0),
          currency: item.currency,
          channelLabel: channelLabelFor(item.currency),
        });
      } else {
        notify(t('pay.submittedTitle'), t('pay.submittedMsg'));
      }
    } catch (err: any) {
      notify(t('pay.status.failed'), err?.response?.data?.detail || t('prop.retryLater'));
    } finally {
      setPayingId(null);
    }
  };

  const handleReceipt = async (item: Payment) => {
    try {
      const res: any = await paymentsApi.receipt(item.id);
      const r = res?.data ?? res;
      const channel = r.channel || '-';
      const lines = [
        t('pay.receiptHeader'),
        t('pay.receiptNo', { no: (r.reference_no || item.id).slice(0, 16) }),
        t('pay.receiptAmount', { amount: formatMoney(r.amount ?? item.amount, r.currency ?? item.currency) }),
        t('pay.receiptType', { type: typeLabelText(t, r.payment_type) || r.payment_type || '-' }),
        t('pay.receiptChannel', {
          channel: r.channel_transaction_id
            ? t('pay.receiptChannelRef', { channel, ref: r.channel_transaction_id })
            : channel,
        }),
        t('pay.receiptPaidAt', { time: fmtDate(r.paid_at ?? item.paid_at, 'minute') }),
      ].join('\n');
      notify(t('pay.receiptTitle'), lines);
    } catch (err: any) {
      notify(t('pay.receiptFail'), err?.response?.data?.detail || t('prop.retryLater'));
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
      notify(t('pay.invoiceFail'), err?.response?.data?.detail || t('prop.retryLater'));
    } finally {
      setInvoiceLoading(false);
    }
  };

  const closeInvoice = () => { setInvoiceItem(null); setInvoiceData(null); };

  const renderInvoice = () => {
    const iv = invoiceData;
    if (!iv) return null;
    const cur = iv.currency || invoiceItem?.currency;
    return (
      <>
        <Ionicons name="document-text-outline" size={20} color={colors.primary} style={styles.invTitleIcon} />
        <Text style={styles.invNo}>{t('pay.invoiceNo', { no: iv.invoice_no || '—' })}</Text>
        <View style={styles.invRow}><Text style={styles.invLabel}>{t('pay.invoiceNet')}</Text><Text style={styles.invValue}>{formatMoney(iv.net_amount, cur)}</Text></View>
        <View style={styles.invRow}><Text style={styles.invLabel}>{t('pay.invoiceTax', { rate: iv.vat_rate ? `${iv.vat_rate}%` : '—' })}</Text><Text style={styles.invValue}>{formatMoney(iv.tax_amount, cur)}</Text></View>
        <View style={styles.invDivider} />
        <View style={styles.invRow}><Text style={styles.invLabelBold}>{t('pay.invoiceTotal')}</Text><Text style={styles.invTotal}>{formatMoney(iv.total_amount, cur)}</Text></View>
        <Text style={styles.invMeta}>{t('pay.invoiceBillTo', { name: iv.bill_to?.name || '—' })}</Text>
        {!!iv.bill_to?.email && <Text style={styles.invMeta}>{t('pay.invoiceEmail', { email: iv.bill_to.email })}</Text>}
        {!!iv.description && <Text style={styles.invMeta}>{t('pay.invoiceItem', { item: iv.description })}</Text>}
        <Text style={styles.invMeta}>{t('pay.invoiceMeta', { channel: iv.channel || '—', time: fmtDate(iv.paid_at, 'minute') })}</Text>
      </>
    );
  };

  if (loading) {
    return <View style={styles.center}><LoadingState label={t('pay.loadingBills')} /></View>;
  }

  const bannerTarget = monthRent ?? pending[0];
  const bannerPaying = !!bannerTarget && payingId === bannerTarget.id;

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <View style={styles.bannerHead}>
          <Text style={styles.bannerLabel}>{heroLabel}</Text>
          {pending.length > 0 && <View style={styles.bannerBadge}><Text style={styles.bannerBadgeText}>{t('pay.status.pending')}</Text></View>}
        </View>
        <Text style={styles.bannerAmount}>{formatMoney(heroAmount, currency)}</Text>
        <Text style={styles.bannerSub}>{t('pay.pendingBadgeCount', { n: pending.length })}</Text>
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
              accessibilityLabel={t('pay.payNow')}
              accessibilityState={{ disabled: bannerPaying }}
            >
              {bannerPaying ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.bannerBtnText}>{t('pay.payNow')}</Text>}
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
      <View style={styles.statRow}>
        <View style={styles.stat}><Text style={styles.statLabel}>{t('pay.status.succeeded')}</Text><Text style={styles.statValue}>{t('pay.countN', { n: paidCount })}</Text></View>
        <View style={styles.stat}><Text style={styles.statLabel}>{t('pay.status.pending')}</Text><Text style={[styles.statValue, pending.length > 0 && { color: colors.warning }]}>{t('pay.countN', { n: pending.length })}</Text></View>
      </View>
      <View style={styles.segBar}>
        {SEG_TABS.map((s) => (
          <TouchableOpacity key={s.key} style={[styles.segItem, seg === s.key && styles.segItemActive]} onPress={() => setSeg(s.key)} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ selected: seg === s.key }} accessibilityLabel={t('pay.segA11y', { label: s.label })}>
            <Text style={[styles.segText, seg === s.key && styles.segTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.sectionTitle}>{t('pay.paymentRecords')}</Text>
        <Text style={[styles.summaryText, { color: segMeta.color }]}>{t('pay.segSummary', { label: segMeta.text, n: segData.length, amount: formatMoney(segTotal, currency) })}</Text>
      </View>
      <FlatList
        data={segData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const meta = tenantStatusMeta[item.status ?? 'pending'] ?? tenantStatusMeta.pending;
          const typeLabel = typeLabelText(t, item.payment_type) || item.payment_type || t('pay.bill');
          const isPending = item.status === 'pending';
          const isSucceeded = item.status === 'succeeded';
          return (
            <View style={styles.card}>
              <View style={styles.rowMain}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{monthLabel(t, item.due_date) || typeLabel}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{t('pay.dueBy', { type: typeLabel, date: fmtDate(item.due_date, 'minute') })}</Text>
                  {!!item.description && <Text style={styles.rowDesc} numberOfLines={1}>{item.description}</Text>}
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowAmount}>{formatMoney(item.amount, item.currency)}</Text>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}><Text style={[styles.badgeText, { color: meta.color }]}>{t(meta.key)}</Text></View>
                </View>
              </View>
              {isPending && (
                <TouchableOpacity style={[styles.payBtn, payingId === item.id && styles.payBtnDisabled]} activeOpacity={0.8} onPress={() => handlePay(item)} disabled={payingId === item.id} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('pay.payA11y', { type: typeLabel })}>
                  {payingId === item.id ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={styles.payBtnText}>{t('pay.goPay')}</Text>}
                </TouchableOpacity>
              )}
              {isSucceeded && (
                <View style={styles.succBtnRow}>
                  <TouchableOpacity style={styles.receiptBtn} activeOpacity={0.8} onPress={() => handleReceipt(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('pay.viewReceiptA11y')}><Text style={styles.receiptBtnText}>{t('pay.viewReceipt')}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.receiptBtn} activeOpacity={0.8} onPress={() => openInvoice(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('pay.viewInvoiceA11y')}><Text style={styles.receiptBtnText}>{t('pay.invoice')}</Text></TouchableOpacity>
                </View>
              )}
              {!!item.paid_at && <Text style={styles.time}>{t('pay.paidAt', { time: fmtDate(item.paid_at, 'minute') })}</Text>}
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={loadError ? (
          <EmptyState icon="cloud-offline-outline" title={t('loadFailed')} sub={t('loadFailedSub')} actionLabel={t('retry')} onAction={refresh} />
        ) : (
          <EmptyState icon="card-outline" title={seg === 'pending' ? t('pay.emptyPendingTitle') : seg === 'paid' ? t('pay.emptyPaidTitle') : t('empty.bills')} sub={t('empty.billsSub')} />
        )}
        ListFooterComponent={<View style={{ height: 12 }} />}
      />

      <Modal visible={!!invoiceItem} transparent animationType="slide" onRequestClose={closeInvoice}>
        <View style={styles.invWrap}>
          <View style={styles.invCard}>
            <TouchableOpacity style={styles.invClose} onPress={closeInvoice} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
            {invoiceLoading ? <View style={styles.invCenter}><ActivityIndicator size="large" color={colors.primary} /></View> : renderInvoice()}
          </View>
        </View>
      </Modal>

      <PaymentSheet
        visible={!!payQr}
        qr={payQr?.qr ?? ''}
        amount={payQr?.amount}
        currency={payQr?.currency}
        channelLabel={payQr?.channelLabel}
        onClose={() => setPayQr(null)}
      />
    </View>
  );
}

/* ========================= 业主视角：名下房源应收/已缴 ========================= */
function OwnerPaymentsView() {
  const { t } = useI18n();
  const OWNER_FILTERS = useMemo(() => ownerFilters(t), [t]);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const uid = user?.id ?? 'anon';
  const [filter, setFilter] = useState<'all' | OwnerGroup>('all');
  const [payQr, setPayQr] = useState<{ qr: string; amount: number; currency?: string; channelLabel?: string } | null>(null);

  const q = useCachedQuery<Payment[]>({
    queryKey: PAYMENTS_KEY(uid),
    cacheKey: `payments:mine:${uid}`,
    queryFn: async () => {
      const res: any = await paymentsApi.mine();
      const data = res?.data;
      return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    },
  });
  const payments = q.data ?? [];
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  const markProcessing = useCallback(
    (id: string) => {
      queryClient.setQueryData<Payment[]>(PAYMENTS_KEY(uid), (old) =>
        (old ?? []).map((p) => (p.id === id ? { ...p, status: 'processing' } : p)),
      );
    },
    [queryClient, uid],
  );

  const ccy = payments[0]?.currency || 'THB';

  const dueTotal = payments.filter((p) => ownerGroupOf(p.status) !== 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);

  const monthPaid = useMemo(() => {
    const now = new Date();
    return payments
      .filter((p) => ownerGroupOf(p.status) === 'paid' && !!p.paid_at)
      .filter((p) => { const d = new Date(String(p.paid_at)); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }, [payments]);

  const utilityTotal = payments.filter((p) => p.payment_type === 'utility').reduce((s, p) => s + Number(p.amount || 0), 0);

  const filtered = useMemo(() => {
    const base = filter === 'all' ? payments : payments.filter((p) => ownerGroupOf(p.status) === filter);
    const unpaid = base.filter((p) => ownerGroupOf(p.status) !== 'paid');
    const paid = base.filter((p) => ownerGroupOf(p.status) === 'paid');
    unpaid.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '') || Number(b.amount || 0) - Number(a.amount || 0));
    paid.sort((a, b) => (b.paid_at || b.due_date || '').localeCompare(a.paid_at || a.due_date || ''));
    return [...unpaid, ...paid];
  }, [payments, filter]);

  const channelFor = (c?: string) => (c === 'CNY' ? 'wechat' : c === 'USD' ? 'stripe' : 'promptpay');
  const channelLabelFor = (c?: string) =>
    c === 'CNY' ? t('pay.channelWechat') : c === 'USD' ? t('pay.channelStripe') : 'PromptPay';

  const handlePay = async (item: Payment) => {
    try {
      const res: any = await paymentsApi.pay(item.id, channelFor(item.currency));
      const data = res?.data ?? res;
      markProcessing(item.id);
      const resolution = resolvePayment(data);
      if (resolution.kind === 'url') {
        await WebBrowser.openBrowserAsync(resolution.url);
      } else if (resolution.kind === 'qr') {
        setPayQr({
          qr: resolution.qr,
          amount: Number(item.amount || 0),
          currency: item.currency,
          channelLabel: channelLabelFor(item.currency),
        });
      } else {
        notify(t('pay.submittedTitle'), t('pay.submittedMsg'));
      }
    } catch (err: any) {
      notify(t('pay.status.failed'), err?.response?.data?.detail || t('prop.retryLater'));
    }
  };

  if (loading) {
    return <View style={styles.center}><LoadingState label={t('pay.loadingBillsOwner')} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const meta = ownerStatusMap[item.status ?? ''] ?? ownerStatusMap.pending;
          const group = ownerGroupOf(item.status);
          const icon = typeIcons[item.payment_type ?? ''] ?? 'receipt-outline';
          const label = typeLabelText(t, item.payment_type) || item.payment_type || t('pay.bill');
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View>
                <View style={styles.cardInfo}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.type} numberOfLines={1}>{label}</Text>
                    <View style={[styles.badge, { backgroundColor: meta.bg }]}><Text style={[styles.badgeText, { color: meta.color }]}>{t(meta.key)}</Text></View>
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>{t('pay.ownerCardMeta', { name: item.property || item.description || t('pay.bill'), date: item.due_date ? String(item.due_date).replace('T', ' ').slice(0, 10) : '-' })}</Text>
                </View>
              </View>
              <View style={styles.cardFoot}>
                <Text style={styles.amount}>{formatMoney(item.amount, item.currency || ccy)}</Text>
                {group === 'paid' ? (
                  <View style={[styles.btn, styles.btnSecondary]}><Ionicons name="checkmark" size={14} color={colors.ink3} /><Text style={[styles.btnText, { color: colors.ink3 }]}>{t('pay.settled')}</Text></View>
                ) : (
                  <TouchableOpacity style={[styles.btn, group === 'overdue' ? styles.btnDanger : styles.btnPrimary]} activeOpacity={0.85} onPress={() => handlePay(item)}>
                    <Ionicons name={group === 'overdue' ? 'alert-circle-outline' : 'card-outline'} size={14} color={colors.primaryForeground} />
                    <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{group === 'overdue' ? t('pay.topUp') : t('pay.goPay')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>{t('pay.status.pending')}</Text>
              <Text style={styles.heroAmount}>{formatMoney(dueTotal, ccy)}</Text>
              <View style={styles.heroDivider} />
              <View style={styles.heroStats}>
                <View><Text style={styles.heroStatLabel}>{t('pay.paidThisMonth')}</Text><Text style={styles.heroStatVal}>{formatMoney(monthPaid, ccy)}</Text></View>
                <View style={styles.heroStatRight}><Text style={styles.heroStatLabel}>{t('pay.type.utility')}</Text><Text style={styles.heroStatVal}>{formatMoney(utilityTotal, ccy)}</Text></View>
              </View>
            </View>
            <View style={styles.chips}>
              {OWNER_FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity key={f.key} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.8} onPress={() => setFilter(f.key)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitleBig}>{t('pay.billList')}</Text>
              <Text style={styles.sectionHint}>{t('pay.countN', { n: filtered.length })}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="documents-outline" title={t('empty.bills')} sub={t('pay.emptyOwnerSub')} />}
      />

      <PaymentSheet
        visible={!!payQr}
        qr={payQr?.qr ?? ''}
        amount={payQr?.amount}
        currency={payQr?.currency}
        channelLabel={payQr?.channelLabel}
        onClose={() => setPayQr(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: 12, paddingBottom: 24 },

  /* 通用 banner / stat（租客） */
  banner: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 18, marginBottom: 12 },
  bannerLabel: { color: colors.alpha('255,255,255', 0.85), fontSize: 13 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerBadge: { backgroundColor: colors.alpha('255,255,255', 0.2), borderRadius: colors.radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  bannerBadgeText: { color: colors.primaryForeground, fontSize: 11, fontWeight: '600' },
  bannerAmount: { color: colors.primaryForeground, fontSize: 28, fontWeight: '700', marginTop: 4 },
  bannerSub: { color: colors.alpha('255,255,255', 0.85), fontSize: 12, marginTop: 2 },
  bannerBtn: { alignSelf: 'flex-start', marginTop: 12, backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 8, borderRadius: colors.radius.full },
  bannerBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },

  statRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: colors.radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, paddingHorizontal: 16 },
  statLabel: { fontSize: 12, color: colors.ink2 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 4 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  segBar: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginBottom: 12, backgroundColor: colors.surface, borderRadius: colors.radius.md, padding: 4 },
  segItem: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: colors.radius.sm },
  segItemActive: { backgroundColor: colors.primary },
  segText: { fontSize: 14, color: colors.ink2, fontWeight: '500' },
  segTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 8 },
  summaryText: { fontSize: 12, fontWeight: '600' },

  /* 账单卡 */
  card: { backgroundColor: colors.surface, borderRadius: colors.radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
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
  payBtn: { alignSelf: 'flex-end', marginTop: 12, minHeight: 44, justifyContent: 'center', backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: colors.radius.full },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  receiptBtn: { alignSelf: 'flex-end', marginTop: 12, minHeight: 44, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: colors.radius.full },
  receiptBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  succBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },

  /* 业主卡 (owner) */
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: colors.radius.sm, backgroundColor: colors.alpha(colors.primaryRgb, 0.1), justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  type: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.ink3 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: colors.radius.md },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: colors.error },
  btnSecondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  btnText: { fontSize: 12, fontWeight: '700' },

  /* 业主 hero / chips */
  heroCard: { marginHorizontal: 12, marginTop: 12, marginBottom: 12, padding: 16, borderRadius: colors.radius.xl, backgroundColor: colors.primary, ...colors.shadow.primary },
  heroLabel: { fontSize: 14, color: colors.alpha('255, 255, 255', 0.8) },
  heroAmount: { fontSize: 28, fontWeight: '800', color: colors.primaryForeground, marginTop: 4, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  heroDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.alpha('255, 255, 255', 0.25), marginVertical: 12 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between' },
  heroStatRight: { alignItems: 'flex-end' },
  heroStatLabel: { fontSize: 11, color: colors.alpha('255, 255, 255', 0.7), marginBottom: 2 },
  heroStatVal: { fontSize: 17, fontWeight: '700', color: colors.primaryForeground, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginBottom: 12 },
  chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: colors.radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },
  /* 双身份分段切换（业主&租客） */
  dualSeg: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 12, marginBottom: 12, backgroundColor: colors.surface, borderRadius: colors.radius.md, borderWidth: 1, borderColor: colors.border, padding: 4 },
  dualSegItem: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: colors.radius.sm, paddingVertical: 10 },
  dualSegItemActive: { backgroundColor: colors.primary },
  dualSegText: { fontSize: 14, color: colors.ink2, fontWeight: '500' },
  dualSegTextActive: { color: colors.primaryForeground, fontWeight: '600' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 12, marginBottom: 10 },
  sectionTitleBig: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

  /* 发票弹窗 */
  invWrap: { flex: 1, backgroundColor: colors.alpha('0,0,0', 0.4), justifyContent: 'center', padding: 24 },
  invCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20, paddingTop: 34 },
  invClose: { position: 'absolute', top: 12, right: 12, padding: 4 },
  invCenter: { alignItems: 'center', paddingVertical: 32 },
  invTitleIcon: { fontSize: 32, textAlign: 'center', marginBottom: 8 },
  invNo: { fontSize: 13, color: colors.ink2, textAlign: 'center', marginBottom: 16 },
  invRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  invLabel: { fontSize: 14, color: colors.ink2 },
  invLabelBold: { fontSize: 14, color: colors.ink, fontWeight: '700' },
  invValue: { fontSize: 14, color: colors.ink },
  invTotal: { fontSize: 17, color: colors.primary, fontWeight: '700' },
  invDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  invMeta: { fontSize: 12, color: colors.ink3, marginTop: 8 },
});