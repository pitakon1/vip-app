import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import api from '@/lib/api';
import { leasesApi, serviceOrdersApi } from '@/services/api';
import { fmtMoney as formatMoney, fmtDate } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';

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
  tax_payment: 'receipt-outline',
  annual_management: 'calendar-outline',
};

const orderStatusMeta: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: '待处理', color: colors.warning, bg: colors.warningLight },
  assigned: { text: '已派单', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  in_progress: { text: '进行中', color: colors.primary, bg: colors.sidebarActive },
  completed: { text: '已完成', color: colors.success, bg: colors.successLight },
  cancelled: { text: '已取消', color: colors.ink3, bg: colors.surface2 },
};

export default function ServicesScreen() {
  const user = useAuthStore((state: any) => state.user);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<ServiceOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeLease, setActiveLease] = useState<any>(null);

  // 预约弹窗
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [timeText, setTimeText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [cRes, oRes, lRes] = await Promise.allSettled([
      api.get('/billing/pricing'),
      serviceOrdersApi.list({ page: 1, page_size: 20 }),
      leasesApi.mine(),
    ]);

    // 服务价目（真实 catalog）
    if (cRes.status === 'fulfilled') {
      const cat: any = (cRes.value as any)?.data?.service_catalog ?? {};
      setCatalog(
        Object.entries(cat).map(([code, v]: [string, any]) => ({ code, ...v })),
      );
    } else {
      setCatalog([]);
    }

    // 我的订单（真实订单）
    if (oRes.status === 'fulfilled') {
      const d: any = (oRes.value as any)?.data;
      const items = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      setOrders(items as ServiceOrderRow[]);
    } else {
      setOrders([]);
    }

    // 预约需要关联在租房源
    if (lRes.status === 'fulfilled') {
      const d: any = (lRes.value as any)?.data;
      const list = Array.isArray(d) ? d : d?.items ?? [];
      setActiveLease(
        (list as any[]).find((l: any) => l?.status === 'active') ?? null,
      );
    } else {
      setActiveLease(null);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // 预约：写入真实服务订单（orderer_id / orderer_type / property_id 必填）
  const handleBook = async () => {
    if (!selected) return;
    if (!user?.id) {
      Alert.alert('提示', '请先登录后再预约服务');
      return;
    }
    if (!activeLease?.property_id) {
      Alert.alert('提示', '当前没有生效中的租约，无法关联房源预约服务');
      return;
    }
    setSubmitting(true);
    try {
      await serviceOrdersApi.create({
        orderer_id: user.id,
        orderer_type: user.role === 'owner' ? 'owner' : 'tenant',
        property_id: activeLease.property_id,
        service_type: selected.code,
        scheduled_at: timeText.trim()
          ? timeText.trim().replace(' ', 'T')
          : undefined,
        amount: Number(selected.base_price || 0),
        currency: 'THB',
        notes: noteText.trim() || undefined,
      });
      Alert.alert('预约成功', '您的服务订单已提交，工作人员将尽快与您联系');
      setSelected(null);
      setTimeText('');
      setNoteText('');
      load();
    } catch (err: any) {
      Alert.alert(
        '预约失败',
        err?.response?.data?.detail || err?.response?.data?.message || '请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>推荐服务</Text>
          <Text style={styles.heroSub}>一站式家居服务</Text>
        </View>

        {/* 服务卡列表（真实价目） */}
        {catalog.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="construct-outline" size={40} color={colors.ink3} />
            <Text style={styles.empty}>暂无可用服务</Text>
          </View>
        ) : (
          catalog.map((item) => (
            <View key={item.code} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  <Ionicons
                    name={(SERVICE_ICONS[item.code] ?? 'construct-outline') as any}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>
                    {item.label_zh || item.code}
                  </Text>
                  <Text style={styles.cardDesc}>
                    计费单位：{item.unit || '次'} · 不含税
                  </Text>
                </View>
              </View>
              <View style={styles.cardFooter}>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {formatMoney(item.base_price, 'THB')}
                  </Text>
                  <Text style={styles.priceUnit}>/{item.unit || '次'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.bookBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelected(item);
                    setTimeText('');
                    setNoteText('');
                  }}
                >
                  <Text style={styles.bookBtnText}>预约</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
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

      {/* 预约弹窗 */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>预约服务</Text>
            {selected ? (
              <Text style={styles.sheetSub}>
                {selected.label_zh || selected.code} ·{' '}
                {formatMoney(selected.base_price, 'THB')}/{selected.unit || '次'}
              </Text>
            ) : null}
            <Text style={styles.label}>服务时间</Text>
            <TextInput
              style={styles.input}
              placeholder="如 2026-09-20 10:00"
              placeholderTextColor={colors.ink3}
              value={timeText}
              onChangeText={setTimeText}
            />
            <Text style={styles.label}>备注（可选）</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="补充说明你的需求"
              placeholderTextColor={colors.ink3}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            {!activeLease?.property_id && (
              <Text style={styles.warn}>当前没有生效中的租约，提交将失败</Text>
            )}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.btnDisabled]}
              onPress={handleBook}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={styles.submitText}>提交预约</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setSelected(null)}
            >
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
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
    paddingVertical: 20,
    marginBottom: 12,
  },
  heroTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryForeground },
  heroSub: {
    fontSize: 13,
    color: colors.alpha('255,255,255', 0.85),
    marginTop: 4,
  },
  // 服务卡
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  cardDesc: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { fontSize: 20, fontWeight: '700', color: colors.ink },
  priceUnit: { fontSize: 13, color: colors.ink3, marginLeft: 2 },
  bookBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: colors.radius.sm,
  },
  bookBtnText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  // 我的订单
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 12,
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
  orderMeta: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.sm },
  chipText: { fontSize: 11, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 12, marginBottom: 12 },
  // 预约弹窗
  overlay: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.4),
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 20,
    paddingBottom: 28,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  sheetSub: { fontSize: 14, color: colors.ink2, textAlign: 'center', marginTop: 6 },
  label: { fontSize: 13, color: colors.ink2, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  textarea: { minHeight: 72 },
  warn: { fontSize: 12, color: colors.warning, marginTop: 10 },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  submitText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  cancelBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: colors.ink3, fontSize: 15 },
});