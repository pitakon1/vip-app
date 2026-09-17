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
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { dashboardApi, paymentsApi, propertiesApi, usersAdminApi } from '@/services/api';

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

// 手动记账可选币种 / 类型 / 渠道
const CURRENCIES = ['THB', 'CNY', 'EUR'];
const PAYMENT_TYPE_KEYS = ['rent', 'deposit', 'commission', 'service_fee', 'utility', 'tax'];
const CHANNEL_KEYS = Object.keys(CHANNEL_META);

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
  const [userList, setUserList] = useState<{ id: string; full_name?: string }[]>([]);

  // 手动记账弹窗
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    payer_id: '',
    payer_name: '',
    payee_id: '',
    amount: '',
    currency: 'THB',
    payment_type: 'rent',
    channel: '',
    due_date: '',
    description: '',
  });
  const [showUserPicker, setShowUserPicker] = useState(false);

  // 确认到账弹窗
  const [confirmItem, setConfirmItem] = useState<PaymentRow | null>(null);
  const [confirmNote, setConfirmNote] = useState('');

  // 详情弹窗
  const [detailItem, setDetailItem] = useState<PaymentRow | null>(null);
  const [detailDoc, setDetailDoc] = useState<{ title: string; body: string } | null>(null);

  const load = useCallback(
    async (status: ChipKey) => {
      const params: Record<string, unknown> = { page: 1, page_size: PAGE_SIZE };
      if (status !== 'all') params.status = status;

      const [payRes, sumRes, reconRes, userRes, propRes] = await Promise.allSettled([
        paymentsApi.list(params),
        dashboardApi.summary(),
        dashboardApi.financialReconciliation(),
        usersAdminApi.list({ page_size: 100 }),
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
        setUserList(items);
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

  /* ===== 手动记账 ===== */
  const openForm = () => {
    setForm({ payer_id: '', payer_name: '', payee_id: '', amount: '', currency: 'THB', payment_type: 'rent', channel: '', due_date: '', description: '' });
    setShowForm(true);
  };
  const pickUser = (id: string, name?: string) => {
    setForm((f) => ({ ...f, payer_id: id, payer_name: name || f.payer_name }));
    setShowUserPicker(false);
  };
  const submitForm = async () => {
    const amount = Number(form.amount);
    if (!form.payer_id) {
      Alert.alert('提示', '请选择付款方');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('提示', '请输入有效金额');
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        payer_id: form.payer_id,
        amount,
        currency: form.currency,
        payment_type: form.payment_type,
      };
      if (form.payee_id.trim()) payload.payee_id = form.payee_id.trim();
      if (form.channel.trim()) payload.channel = form.channel.trim();
      if (form.due_date.trim()) payload.due_date = form.due_date.trim();
      if (form.description.trim()) payload.description = form.description.trim();
      await paymentsApi.create(payload);
      Alert.alert('成功', '交易已手动入账');
      setShowForm(false);
      load(chip);
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '入账失败');
    }
  };

  /* ===== 确认到账 ===== */
  const doConfirm = async () => {
    if (!confirmItem) return;
    try {
      await paymentsApi.confirm(confirmItem.id, { note: confirmNote.trim() || undefined });
      Alert.alert('成功', '已确认到账');
      setConfirmItem(null);
      setConfirmNote('');
      load(chip);
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '确认失败');
    }
  };

  /* ===== 详情 / 凭证 / 发票 ===== */
  const openDetail = (p: PaymentRow) => {
    setDetailItem(p);
    setDetailDoc(null);
  };
  const openDoc = async (type: 'receipt' | 'invoice') => {
    if (!detailItem) return;
    try {
      const res = type === 'receipt' ? await paymentsApi.receipt(detailItem.id) : await paymentsApi.invoice(detailItem.id);
      const d = (res as any)?.data ?? {};
      setDetailDoc({ title: type === 'receipt' ? '收款凭证' : '税务发票', body: JSON.stringify(d, null, 2) });
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '获取失败');
    }
  };

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
        <View style={styles.listHeadRight}>
          <Text style={styles.listHint}>共 {total} 笔</Text>
          <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={openForm}>
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={styles.addBtnText}>手动记账</Text>
          </TouchableOpacity>
        </View>
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
              <View style={styles.payTop}>
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
              <View style={styles.payActions}>
                {p.status === 'pending' ? (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    activeOpacity={0.7}
                    onPress={() => {
                      setConfirmItem(p);
                      setConfirmNote('');
                    }}
                  >
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.primary }]}>确认到账</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={() => openDetail(p)}>
                  <Ionicons name="eye-outline" size={14} color={colors.ink2} />
                  <Text style={[styles.actionBtnText, { color: colors.ink2 }]}>查看</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* 手动记账弹窗 */}
      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalMask}>
          <ScrollView contentContainerStyle={styles.modalCardWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>手动记账</Text>

              {/* 付款方 */}
              <Text style={styles.fieldLabel}>付款方 *</Text>
              <TouchableOpacity style={styles.pickerField} activeOpacity={0.7} onPress={() => setShowUserPicker(true)}>
                <Text style={form.payer_id ? styles.pickerValue : styles.pickerPlaceholder}>
                  {form.payer_name || (form.payer_id ? form.payer_id : '选择账户')}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.ink3} />
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>收款方（选填，默认当前租户/收款方）</Text>
              <TextInput
                style={styles.textInput}
                value={form.payee_id}
                onChangeText={(v) => setForm((f) => ({ ...f, payee_id: v }))}
                placeholder="收款方账户 ID"
                placeholderTextColor={colors.ink3}
              />

              <Text style={styles.fieldLabel}>金额 *</Text>
              <TextInput
                style={styles.textInput}
                value={form.amount}
                onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                placeholder="0.00"
                keyboardType="numeric"
                placeholderTextColor={colors.ink3}
              />

              <Text style={styles.fieldLabel}>币种</Text>
              <View style={styles.chipRow2}>
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip2, form.currency === c && styles.chip2Active]}
                    onPress={() => setForm((f) => ({ ...f, currency: c }))}
                  >
                    <Text style={[styles.chip2Text, form.currency === c && styles.chip2TextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>类型</Text>
              <View style={styles.chipRow2}>
                {PAYMENT_TYPE_KEYS.map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.chip2, form.payment_type === k && styles.chip2Active]}
                    onPress={() => setForm((f) => ({ ...f, payment_type: k }))}
                  >
                    <Text style={[styles.chip2Text, form.payment_type === k && styles.chip2TextActive]}>
                      {TYPE_LABEL[k]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>渠道</Text>
              <View style={styles.chipRow2}>
                {CHANNEL_KEYS.map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.chip2, form.channel === k && styles.chip2Active]}
                    onPress={() => setForm((f) => ({ ...f, channel: f.channel === k ? '' : k }))}
                  >
                    <Text style={[styles.chip2Text, form.channel === k && styles.chip2TextActive]}>
                      {CHANNEL_META[k].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>应付日期（YYYY-MM-DD）</Text>
              <TextInput
                style={styles.textInput}
                value={form.due_date}
                onChangeText={(v) => setForm((f) => ({ ...f, due_date: v }))}
                placeholder="如 2026-10-01"
                placeholderTextColor={colors.ink3}
              />

              <Text style={styles.fieldLabel}>备注</Text>
              <TextInput
                style={styles.textInput}
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="备注说明"
                placeholderTextColor={colors.ink3}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setShowForm(false)}>
                  <Text style={styles.modalCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} activeOpacity={0.7} onPress={submitForm}>
                  <Text style={styles.modalOkText}>保存入账</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* 付款方选择 */}
      <Modal visible={showUserPicker} transparent animationType="fade" onRequestClose={() => setShowUserPicker(false)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, styles.pickerCard]}>
            <Text style={styles.modalTitle}>选择付款方</Text>
            <ScrollView style={styles.pickerScroll}>
              {userList.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.pickerItem}
                  activeOpacity={0.7}
                  onPress={() => pickUser(u.id, u.full_name)}
                >
                  <Text style={styles.pickerName}>{u.full_name || u.id}</Text>
                  {!u.full_name ? <Text style={styles.pickerSub}>{u.id}</Text> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 确认到账弹窗 */}
      <Modal visible={!!confirmItem} transparent animationType="fade" onRequestClose={() => setConfirmItem(null)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>确认到账</Text>
            <Text style={styles.modalNoteText}>
              确认该笔交易 {confirmItem ? fmtMoney(confirmItem.amount, confirmItem.currency) : ''} 已到账？
            </Text>
            <TextInput
              style={styles.textInput}
              value={confirmNote}
              onChangeText={setConfirmNote}
              placeholder="到账备注（选填）"
              placeholderTextColor={colors.ink3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setConfirmItem(null)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} activeOpacity={0.7} onPress={doConfirm}>
                <Text style={styles.modalOkText}>确认到账</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 详情弹窗 */}
      <Modal visible={!!detailItem} transparent animationType="fade" onRequestClose={() => setDetailItem(null)}>
        <View style={styles.modalMask}>
          <ScrollView contentContainerStyle={styles.modalCardWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>交易详情</Text>
              {detailItem ? (
                <>
                  {[
                    ['金额', fmtMoney(detailItem.amount, detailItem.currency)],
                    ['类型', TYPE_LABEL[detailItem.payment_type ?? ''] || detailItem.payment_type || '-'],
                    ['状态', STATUS_META[detailItem.status ?? '']?.label || detailItem.status || '-'],
                    ['渠道', detailItem.channel || '-'],
                    ['付款方', detailItem.payer_id ? userMap[detailItem.payer_id] || detailItem.payer_id : '-'],
                    ['应付日期', fmtDate(detailItem.due_date)],
                    ['实收日期', fmtDate(detailItem.paid_at)],
                    ['创建时间', fmtDate(detailItem.created_at)],
                    ['备注', detailItem.description || '-'],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{k}</Text>
                      <Text style={styles.detailValue} numberOfLines={3}>{v}</Text>
                    </View>
                  ))}

                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.docBtn} activeOpacity={0.7} onPress={() => openDoc('receipt')}>
                      <Ionicons name="receipt-outline" size={14} color={colors.primary} />
                      <Text style={styles.docBtnText}>收款凭证</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.docBtn} activeOpacity={0.7} onPress={() => openDoc('invoice')}>
                      <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                      <Text style={styles.docBtnText}>税务发票</Text>
                    </TouchableOpacity>
                  </View>

                  {detailDoc ? (
                    <View style={styles.docBox}>
                      <Text style={styles.docTitle}>{detailDoc.title}</Text>
                      <Text style={styles.docBody}>{detailDoc.body}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
              <TouchableOpacity style={[styles.modalBtn, styles.modalOk, styles.closeBtn]} activeOpacity={0.7} onPress={() => setDetailItem(null)}>
                <Text style={styles.modalOkText}>关闭</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  listHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  listHint: { fontSize: 11, color: colors.ink3 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: colors.radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  payCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...colors.shadow.sm,
  },
  payTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  payActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 10,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },

  /* ===== 弹窗 ===== */
  modalMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 28 },
  modalCardWrap: { justifyContent: 'center' },
  modalCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  fieldLabel: { fontSize: 12, color: colors.ink3, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerValue: { fontSize: 14, color: colors.ink },
  pickerPlaceholder: { fontSize: 14, color: colors.ink3 },
  chipRow2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip2: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chip2Active: { backgroundColor: colors.primary, borderColor: colors.primary },
  chip2Text: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chip2TextActive: { color: '#fff', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: colors.radius.lg },
  modalCancel: { backgroundColor: colors.surface2 },
  modalCancelText: { color: colors.ink2, fontWeight: '600' },
  modalOk: { backgroundColor: colors.primary },
  modalOkText: { color: '#fff', fontWeight: '600' },
  closeBtn: { marginTop: 16, flex: 1 },
  modalNoteText: { fontSize: 14, color: colors.ink2, marginVertical: 10 },

  /* ===== 付款方选择 ===== */
  pickerCard: { maxHeight: '70%' },
  pickerScroll: { marginTop: 8 },
  pickerItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerName: { fontSize: 15, color: colors.ink },
  pickerSub: { fontSize: 11, color: colors.ink3, marginTop: 2 },

  /* ===== 详情 ===== */
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 13, color: colors.ink3 },
  detailValue: { fontSize: 13, color: colors.ink, fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 12 },
  docBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  docBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  docBox: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    padding: 12,
    marginTop: 4,
  },
  docTitle: { fontSize: 12, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  docBody: { fontSize: 11, color: colors.ink2, lineHeight: 16 },
});