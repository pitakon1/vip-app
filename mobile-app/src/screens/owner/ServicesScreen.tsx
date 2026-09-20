import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { ownerApi, serviceOrdersApi, maintenanceApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface ServiceOrderItem {
  id: string;
  property_id?: string;
  service_type?: string;
  status?: string;
  amount?: number;
  currency?: string;
  notes?: string;
  scheduled_at?: string;
  completed_at?: string;
  created_at?: string;
  [key: string]: any;
}

interface RepairTicketItem {
  id: string;
  property_id?: string;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

interface OwnerProperty {
  id: string;
  name?: string;
  room_number?: string;
  project_name?: string;
  address?: string;
}

interface TypeMeta {
  label: string;
  icon: IoniconName;
  color: string;
  bg: string;
}

const typeMeta = (
  label: string,
  icon: IoniconName,
  color: string,
  bg: string
): TypeMeta => ({ label, icon, color, bg });

const tint = (rgb: string) => colors.alpha(rgb, 0.1);

const TYPE_META: Record<string, TypeMeta> = {
  cleaning: typeMeta('清洁服务', 'sparkles-outline', colors.primary, tint(colors.primaryRgb)),
  ac_cleaning: typeMeta('空调清洗保养', 'snow-outline', colors.info, tint(colors.infoRgb)),
  wifi_install: typeMeta('网络安装', 'wifi-outline', colors.info, tint(colors.infoRgb)),
  utility_payment: typeMeta('水电代缴', 'flash-outline', colors.warning, tint(colors.warningRgb)),
  insurance: typeMeta('房屋保险', 'shield-checkmark-outline', colors.success, tint(colors.successRgb)),
  tax_payment: typeMeta('税务代缴', 'document-text-outline', colors.warning, tint(colors.warningRgb)),
  annual_management: typeMeta('年度托管', 'home-outline', colors.primary, tint(colors.primaryRgb)),
  aircon: typeMeta('空调清洗保养', 'snow-outline', colors.info, tint(colors.infoRgb)),
  management: typeMeta('房屋托管', 'home-outline', colors.primary, tint(colors.primaryRgb)),
  wifi: typeMeta('网络安装', 'wifi-outline', colors.info, tint(colors.infoRgb)),
  utility: typeMeta('水电代缴', 'flash-outline', colors.warning, tint(colors.warningRgb)),
  other: typeMeta('其他服务', 'construct-outline', colors.ink3, colors.surface2),
};

const metaOf = (type?: string) => TYPE_META[type ?? ''] ?? TYPE_META.other;

// 可购买的服务类型（提交服务订单用）
const PURCHASE_TYPES = [
  'cleaning',
  'ac_cleaning',
  'wifi_install',
  'utility_payment',
  'insurance',
  'tax_payment',
  'annual_management',
];

// 服务商品一句话描述（陈列卡片用）
const SVC_DESC: Record<string, string> = {
  cleaning: '全屋深度清洁，专业人员上门',
  ac_cleaning: '空调深度清洗，出风更清新',
  wifi_install: '光纤宽带上门安装调试',
  utility_payment: '水电燃气费代缴，省心省力',
  insurance: '房屋财产保障，安心托管',
  tax_payment: '房产税务代办，合规省心',
  annual_management: '全年托管，租金收益最大化',
};

// 服务基准单价（THB，不含税），与后端 pricing.SERVICE_PRICE_CATALOG 保持一致，
// 用于在购买弹窗内展示单价/总价。年度托管 base_price 依月租而定，这里仅作占位。
const UNIT_PRICE_MAP: Record<string, number> = {
  cleaning: 1500,
  ac_cleaning: 800,
  wifi_install: 500,
  utility_payment: 200,
  insurance: 300,
  tax_payment: 500,
  annual_management: 0,
};

// 购买方式（三种计费方式）
type BuyModel = 'monthly' | 'per_use' | 'annual';
const BUY_MODEL_OPTIONS: { key: BuyModel; label: string }[] = [
  { key: 'monthly', label: '按月' },
  { key: 'per_use', label: '按次' },
  { key: 'annual', label: '按年' },
];
// 各计费方式的周期可选值（monthly=月数，annual=年数，per_use 忽略）
const INTERVAL_OPTIONS: Record<BuyModel, number[]> = {
  monthly: [1, 3, 6, 12],
  per_use: [],
  annual: [1, 2, 3],
};

interface StatusMeta {
  label: string;
  color: string;
  bg: string;
  pct: number;
}

const statusMeta = (
  label: string,
  color: string,
  bg: string,
  pct: number
): StatusMeta => ({ label, color, bg, pct });

const STATUS_META: Record<string, StatusMeta> = {
  pending: statusMeta('待响应', colors.warning, tint(colors.warningRgb), 20),
  assigned: statusMeta('已派单', colors.info, tint(colors.infoRgb), 40),
  in_progress: statusMeta('处理中', colors.info, tint(colors.infoRgb), 60),
  completed: statusMeta('已完成', colors.success, tint(colors.successRgb), 100),
  cancelled: statusMeta('已取消', colors.ink3, colors.surface2, 0),
};

const statusOf = (status?: string) => STATUS_META[status ?? ''] ?? STATUS_META.pending;

// 报修工单状态
const TICKET_STATUS_META: Record<string, StatusMeta> = {
  open: statusMeta('待处理', colors.warning, tint(colors.warningRgb), 20),
  assigned: statusMeta('已派单', colors.info, tint(colors.infoRgb), 40),
  in_progress: statusMeta('处理中', colors.info, tint(colors.infoRgb), 60),
  resolved: statusMeta('已解决', colors.success, tint(colors.successRgb), 100),
  closed: statusMeta('已关闭', colors.ink3, colors.surface2, 100),
};

const ticketStatusOf = (status?: string) =>
  TICKET_STATUS_META[status ?? ''] ?? TICKET_STATUS_META.open;

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: colors.info },
  medium: { label: '中', color: colors.warning },
  high: { label: '高', color: colors.error },
  urgent: { label: '紧急', color: colors.error },
};

const priorityOf = (p?: string) => PRIORITY_META[p ?? ''] ?? PRIORITY_META.medium;

const formatDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '-');

const matchFilter = (
  kind: 'order' | 'ticket',
  status: string | undefined,
  filter: string
) => {
  if (filter === 'all') return true;
  const s = status;
  if (filter === 'processing') return s === 'assigned' || s === 'in_progress';
  if (filter === 'completed') {
    return kind === 'order' ? s === 'completed' : s === 'resolved' || s === 'closed';
  }
  if (filter === 'pending') return kind === 'order' ? s === 'pending' : s === 'open';
  return true;
};

// 我的工单状态筛选选项
const FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'processing', label: '处理中' },
  { key: 'completed', label: '已完成' },
  { key: 'pending', label: '待响应' },
];

// 统一时间戳比较（混合排序用）
const timeTs = (x?: string) => {
  if (!x) return 0;
  const t = new Date(String(x)).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export default function ServicesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<'services' | 'repairs'>('services');
  const [orders, setOrders] = useState<ServiceOrderItem[]>([]);
  const [tickets, setTickets] = useState<RepairTicketItem[]>([]);
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 提交报修弹窗
  const [ticketModal, setTicketModal] = useState(false);
  const [ticketProp, setTicketProp] = useState<string | null>(null);
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketPriority, setTicketPriority] = useState('medium');
  const [submitting, setSubmitting] = useState(false);

  // 购买服务弹窗
  const [buyModal, setBuyModal] = useState(false);
  const [buyProp, setBuyProp] = useState<string | null>(null);
  const [buyType, setBuyType] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  // 三种计费方式：按月/按次/按年 + 周期数
  const [buyModel, setBuyModel] = useState<BuyModel>('monthly');
  const [buyInterval, setBuyInterval] = useState<number>(1);

  // 当前选中服务的单价
  const buyUnitPrice = buyType ? UNIT_PRICE_MAP[buyType] ?? 0 : 0;
  // 总价：monthly/annual = 单价 × 周期；per_use = 单价（单次）
  const buyTotal =
    buyModel === 'per_use' ? buyUnitPrice : buyUnitPrice * buyInterval;

  const loadData = useCallback(async () => {
    const [orderRes, ticketRes, propRes] = await Promise.allSettled([
      serviceOrdersApi.list({ page: 1, limit: 100 }),
      maintenanceApi.list({ page: 1, limit: 100 }),
      ownerApi.properties(),
    ]);

    if (orderRes.status === 'fulfilled') {
      const data: any = orderRes.value.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setOrders(Array.isArray(items) ? (items as ServiceOrderItem[]) : []);
    } else {
      setOrders([]);
      const err: any = (orderRes as PromiseRejectedResult).reason;
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取服务工单');
    }

    if (ticketRes.status === 'fulfilled') {
      const data: any = ticketRes.value.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setTickets(Array.isArray(items) ? (items as RepairTicketItem[]) : []);
    }

    if (propRes.status === 'fulfilled') {
      const data: any = propRes.value.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setProperties(Array.isArray(items) ? (items as OwnerProperty[]) : []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const go = (target: string) => navigation.navigate(target as any);

  const propertyName = useCallback(
    (propertyId?: string) => {
      if (!propertyId) return null;
      const p = properties.find((x) => String(x.id) === String(propertyId));
      if (!p) return null;
      return (
        p.name ||
        [p.project_name, p.room_number].filter(Boolean).join(' ') ||
        p.address ||
        null
      );
    },
    [properties]
  );

  /* ===== 合并工单（服务单 + 报修单，按 created_at 倒序混合排序）===== */
  interface MergedRow {
    key: string;
    kind: 'order' | 'ticket';
    item: ServiceOrderItem | RepairTicketItem;
  }

  const mergedRows = useMemo<MergedRow[]>(() => {
    const rows: MergedRow[] = [
      ...orders.map((o) => ({ key: `o-${o.id}`, kind: 'order' as const, item: o })),
      ...tickets.map((t) => ({ key: `t-${t.id}`, kind: 'ticket' as const, item: t })),
    ];
    return rows.sort((a, b) => timeTs(b.item.created_at) - timeTs(a.item.created_at));
  }, [orders, tickets]);

  const visibleRows = useMemo(
    () => mergedRows.filter((r) => matchFilter(r.kind, r.item.status, filter)),
    [mergedRows, filter]
  );

  /* 我的工单统计（筛选 chips 上方小字） */
  const mergedStats = useMemo(() => {
    const processing =
      orders.filter((o) => o.status === 'assigned' || o.status === 'in_progress').length +
      tickets.filter((t) => t.status === 'assigned' || t.status === 'in_progress').length;
    const completed =
      orders.filter((o) => o.status === 'completed').length +
      tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
    return { processing, completed };
  }, [orders, tickets]);

  /* ===== 提交报修 ===== */
  const submitTicket = useCallback(async () => {
    if (!ticketProp) {
      Alert.alert('提示', '请选择报修房源');
      return;
    }
    if (!ticketTitle.trim()) {
      Alert.alert('提示', '请填写报修标题');
      return;
    }
    setSubmitting(true);
    try {
      await maintenanceApi.create({
        property_id: ticketProp,
        title: ticketTitle.trim(),
        description: ticketDesc.trim() || ticketTitle.trim(),
        priority: ticketPriority,
      });
      setTicketModal(false);
      setTicketTitle('');
      setTicketDesc('');
      setTicketProp(null);
      setTicketPriority('medium');
      Alert.alert('提交成功', '报修工单已提交，工作人员将尽快处理');
      loadData();
    } catch (err: any) {
      Alert.alert('提交失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [ticketProp, ticketTitle, ticketDesc, ticketPriority, loadData]);

  /* ===== 购买服务 ===== */
  const submitBuy = useCallback(async () => {
    if (!buyProp) {
      Alert.alert('提示', '请选择服务房源');
      return;
    }
    if (!buyType) {
      Alert.alert('提示', '请选择服务类型');
      return;
    }
    setBuying(true);
    try {
      await serviceOrdersApi.create({
        orderer_id: user?.id,
        orderer_type: 'owner',
        property_id: buyProp,
        service_type: buyType,
        amount: buyTotal,
        currency: 'THB',
        notes: TYPE_META[buyType]?.label,
        // 购买计费：按购买方式与周期透传给后端记录
        billing_model: buyModel,
        billing_interval: buyModel === 'per_use' ? 1 : buyInterval,
        billing_amount: buyUnitPrice,
      });
      setBuyModal(false);
      setBuyProp(null);
      setBuyType(null);
      setBuyInterval(1);
      Alert.alert('购买成功', '服务订单已创建，工作人员将尽快联系您');
      loadData();
    } catch (err: any) {
      Alert.alert('购买失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setBuying(false);
    }
  }, [buyProp, buyType, buyModel, buyInterval, buyTotal, buyUnitPrice, user?.id, loadData]);

  const resetTicketModal = () => {
    setTicketModal(false);
    setTicketProp(null);
    setTicketTitle('');
    setTicketDesc('');
    setTicketPriority('medium');
  };

  const resetBuyModal = () => {
    setBuyModal(false);
    setBuyProp(null);
    setBuyType(null);
    setBuyModel('monthly');
    setBuyInterval(1);
  };

  /* ===== 合并工单行（服务单 / 报修单）===== */
  const renderMergedRow = ({ item }: { item: MergedRow }) => {
    if (item.kind === 'order') {
      const o = item.item as ServiceOrderItem;
      const meta = metaOf(o.service_type);
      const st = statusOf(o.status);
      const pName = propertyName(o.property_id);
      return (
        <View style={styles.flowRow}>
          <View style={[styles.flowIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={18} color={meta.color} />
          </View>
          <View style={styles.flowBody}>
            <Text style={styles.flowTitle} numberOfLines={1}>{meta.label}</Text>
            <Text style={styles.flowMeta} numberOfLines={1}>
              {pName ? `${pName} · ` : ''}{formatDate(o.created_at)}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
      );
    }
    const t = item.item as RepairTicketItem;
    const st = ticketStatusOf(t.status);
    const pr = priorityOf(t.priority);
    const pName = propertyName(t.property_id);
    return (
      <View style={styles.flowRow}>
        <View style={[styles.flowIcon, { backgroundColor: tint(colors.errorRgb) }]}>
          <Ionicons name="construct-outline" size={18} color={colors.error} />
        </View>
        <View style={styles.flowBody}>
          <Text style={styles.flowTitle} numberOfLines={1}>{t.title || '报修工单'}</Text>
          <Text style={styles.flowMeta} numberOfLines={1}>
            {pName ? `${pName} · ` : ''}{formatDate(t.created_at)}
          </Text>
        </View>
        <View style={styles.flowRight}>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
          <View style={[styles.prioBadge, { backgroundColor: tint(pr.color) }]}>
            <Text style={[styles.prioText, { color: pr.color }]}>优先级 {pr.label}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderPropertyPicker = (
    selected: string | null,
    onSelect: (id: string) => void
  ) => {
    if (properties.length === 0) {
      return (
        <TouchableOpacity style={styles.emptyProp} onPress={() => go('OwnerProperties')}>
          <Text style={styles.emptyPropText}>暂无房源，去委托挂牌 ›</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.pickWrap}>
        {properties.map((p) => {
          const active = String(p.id) === selected;
          const label = p.name || [p.project_name, p.room_number].filter(Boolean).join(' ') || p.address || '房源';
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.pickChip, active && styles.pickChipActive]}
              activeOpacity={0.8}
              onPress={() => onSelect(p.id)}
            >
              <Text style={[styles.pickChipText, active && styles.pickChipTextActive]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载服务工单…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tab === 'services' ? [] : visibleRows}
        keyExtractor={(item) => item.key}
        renderItem={renderMergedRow}
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
            {/* 分类 Tab：服务商城 / 我的工单 */}
            <View style={styles.tabRow}>
              {[
                { key: 'services' as const, label: '服务商城' },
                { key: 'repairs' as const, label: '我的工单' },
              ].map((t) => {
                const active = tab === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tabBtn, active && styles.tabBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => setTab(t.key)}
                  >
                    <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {tab === 'services' ? (
              <>
                {/* 服务商品陈列（点击卡片直接购买） */}
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>服务商品</Text>
                  <Text style={styles.sectionHint}>按需购买 · 专人上门</Text>
                </View>
                <View style={styles.svcGrid}>
                  {PURCHASE_TYPES.map((t) => {
                    const meta = metaOf(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        style={styles.svcCard}
                        activeOpacity={0.85}
                        onPress={() => {
                          setBuyType(t);
                          setBuyModal(true);
                        }}
                      >
                        <View style={[styles.svcIcon, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={22} color={meta.color} />
                        </View>
                        <Text style={styles.svcName} numberOfLines={1}>{meta.label}</Text>
                        <Text style={styles.svcDesc} numberOfLines={2}>{SVC_DESC[t]}</Text>
                        <View style={styles.svcBuy}>
                          <Text style={styles.svcBuyText}>去购买</Text>
                          <Ionicons name="arrow-forward" size={12} color={colors.primary} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                {/* 提交报修 */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnPrimary, styles.repairBtn]}
                  activeOpacity={0.85}
                  onPress={() => setTicketModal(true)}
                >
                  <Ionicons name="construct-outline" size={18} color={colors.primaryForeground} />
                  <Text style={styles.actionBtnTextPrimary}>提交报修</Text>
                </TouchableOpacity>

                {/* 工单统计小字 */}
                <View style={styles.statLine}>
                  <Text style={styles.statLineText}>
                    处理中 {mergedStats.processing} · 已完成 {mergedStats.completed} · 共 {mergedRows.length} 单
                  </Text>
                </View>

                {/* 状态筛选 chips */}
                <View style={styles.filterChips}>
                  {FILTER_OPTIONS.map((f) => {
                    const active = filter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                        activeOpacity={0.8}
                        onPress={() => setFilter(f.key)}
                      >
                        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>全部工单</Text>
                  <Text style={styles.sectionHint}>{visibleRows.length} 单</Text>
                </View>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          tab === 'services' ? null : (
            <EmptyState
              icon="construct-outline"
              title="暂无工单"
              sub="点击上方「提交报修」或购买服务后，工单会显示在这里"
            />
          )
        }
      />

      {/* 提交报修弹窗 */}
      <Modal
        visible={ticketModal}
        transparent
        animationType="slide"
        onRequestClose={resetTicketModal}
      >
        <View style={styles.mask}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>提交报修</Text>
              <TouchableOpacity onPress={resetTicketModal} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.ink3} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              <Text style={styles.fieldLabel}>报修房源</Text>
              {renderPropertyPicker(ticketProp, (id) => setTicketProp(id))}

              <Text style={styles.fieldLabel}>优先级</Text>
              <View style={styles.pickWrap}>
                {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                  const active = ticketPriority === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.pickChip, active && styles.pickChipActive]}
                      activeOpacity={0.8}
                      onPress={() => setTicketPriority(p)}
                    >
                      <Text style={[styles.pickChipText, active && styles.pickChipTextActive]}>
                        {priorityOf(p).label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>报修标题</Text>
              <TextInput
                style={styles.input}
                value={ticketTitle}
                onChangeText={setTicketTitle}
                placeholder="如：空调不制冷 / 水管漏水"
                placeholderTextColor={colors.ink3}
                maxLength={60}
              />

              <Text style={styles.fieldLabel}>问题描述</Text>
              <TextInput
                style={[styles.input, styles.inputArea]}
                value={ticketDesc}
                onChangeText={setTicketDesc}
                placeholder="请描述具体问题，便于工作人员准备工具（选填）"
                placeholderTextColor={colors.ink3}
                multiline
                maxLength={300}
              />

              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                disabled={submitting}
                onPress={submitTicket}
              >
                <Text style={styles.submitBtnText}>{submitting ? '提交中…' : '提交工单'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 购买服务弹窗 */}
      <Modal
        visible={buyModal}
        transparent
        animationType="slide"
        onRequestClose={resetBuyModal}
      >
        <View style={styles.mask}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>购买服务</Text>
              <TouchableOpacity onPress={resetBuyModal} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.ink3} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              <Text style={styles.fieldLabel}>服务房源</Text>
              {renderPropertyPicker(buyProp, (id) => setBuyProp(id))}

              <Text style={styles.fieldLabel}>服务类型</Text>
              <View style={styles.pickWrap}>
                {PURCHASE_TYPES.map((t) => {
                  const meta = metaOf(t);
                  const active = buyType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.pickChip, active && styles.pickChipActive]}
                      activeOpacity={0.8}
                      onPress={() => setBuyType(t)}
                    >
                      <Ionicons
                        name={meta.icon}
                        size={14}
                        color={active ? colors.primaryForeground : meta.color}
                      />
                      <Text
                        style={[styles.pickChipText, active && styles.pickChipTextActive]}
                        numberOfLines={1}
                      >
                        {meta.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>购买方式</Text>
              <View style={styles.modelRow}>
                {BUY_MODEL_OPTIONS.map((m) => {
                  const active = buyModel === m.key;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.modelBtn, active && styles.modelBtnActive]}
                      activeOpacity={0.8}
                      onPress={() => {
                        setBuyModel(m.key);
                        // 切换计费方式时重置周期为默认 1
                        setBuyInterval(1);
                      }}
                    >
                      <Text
                        style={[styles.modelBtnText, active && styles.modelBtnTextActive]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 按月/按年：选择周期数 */}
              {INTERVAL_OPTIONS[buyModel].length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>
                    {buyModel === 'monthly' ? '周期（月）' : '周期（年）'}
                  </Text>
                  <View style={styles.pickWrap}>
                    {INTERVAL_OPTIONS[buyModel].map((iv) => {
                      const active = buyInterval === iv;
                      return (
                        <TouchableOpacity
                          key={iv}
                          style={[styles.pickChip, active && styles.pickChipActive]}
                          activeOpacity={0.8}
                          onPress={() => setBuyInterval(iv)}
                        >
                          <Text
                            style={[styles.pickChipText, active && styles.pickChipTextActive]}
                          >
                            {iv}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* 价格摘要：单价 + 总价 */}
              <View style={styles.priceRow}>
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>单价</Text>
                  <Text style={styles.priceValue}>THB {buyUnitPrice}</Text>
                </View>
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>
                    {buyModel === 'per_use' ? '本次金额' : '总价'}
                  </Text>
                  <Text style={[styles.priceValue, styles.priceTotal]}>THB {buyTotal}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, buying && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                disabled={buying}
                onPress={submitBuy}
              >
                <Text style={styles.submitBtnText}>{buying ? '提交中…' : '确认购买'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: colors.spacing.md, paddingBottom: 90 },

  /* 分类 Tab */
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: colors.spacing.md,
    padding: 4,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.lg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: colors.radius.md,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: colors.surface, ...colors.shadow.sm },
  tabBtnText: { fontSize: 15, fontWeight: '600', color: colors.ink3 },
  tabBtnTextActive: { color: colors.primary, fontWeight: '700' },

  /* 操作区 */
  actionRow: { flexDirection: 'row', gap: 10, marginTop: colors.spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: colors.radius.lg,
  },
  actionBtnPrimary: { backgroundColor: colors.primary, ...colors.shadow.primary },
  actionBtnGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionBtnTextPrimary: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  actionBtnTextGhost: { fontSize: 15, fontWeight: '700', color: colors.primary },

  /* 统计行 */
  statRow: { flexDirection: 'row', gap: 10, marginTop: colors.spacing.md },
  statCell: {
    flex: 1,
    padding: 12,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 4,
    marginBottom: 6,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  miniBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.radius.full,
  },
  miniBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },

  /* 合并工单行（服务单 / 报修单） */
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  flowIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowBody: { flex: 1, minWidth: 0 },
  flowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  flowMeta: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  flowRight: { alignItems: 'flex-end', gap: 4 },

  /* 工单统计小字 */
  statLine: { marginTop: colors.spacing.md },
  statLineText: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },

  /* 状态筛选 chips */
  filterChips: { flexDirection: 'row', gap: 8, marginTop: colors.spacing.md },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: colors.fontSize.base, fontWeight: '500', color: colors.ink3 },
  filterChipTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  /* 服务商品陈列 */
  svcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  svcCard: {
    width: '48.5%',
    padding: colors.spacing.lg,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  svcIcon: {
    width: 42,
    height: 42,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  svcName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  svcDesc: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    lineHeight: 18,
    marginTop: 4,
    minHeight: 36,
  },
  svcBuy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 10,
  },
  svcBuyText: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.primary },

  /* 报修 Tab 内提交按钮 */
  repairBtn: { marginTop: colors.spacing.md },

  /* 区块标题 */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: colors.spacing.lg,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },

  /* 工单卡 */
  card: {
    padding: colors.spacing.lg,
    marginBottom: 10,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  cardMeta: {
    fontSize: colors.fontSize.base,
    color: colors.ink3,
    fontVariant: ['tabular-nums'],
  },

  /* 报修卡附加行 */
  ticketMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ticketDesc: { flex: 1, fontSize: colors.fontSize.base, color: colors.ink2 },
  prioBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  prioText: { fontSize: colors.fontSize.xs, fontWeight: '600' },

  /* 进度 */
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  progressBar: { height: 8, borderRadius: colors.radius.full },
  progressText: {
    fontSize: colors.fontSize.base,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  /* 弹窗 */
  mask: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    paddingBottom: 24,
    maxHeight: '82%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: colors.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  sheetBody: { paddingHorizontal: colors.spacing.lg, paddingTop: colors.spacing.md },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink3,
    marginBottom: 8,
    marginTop: 4,
  },
  pickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: colors.spacing.md },
  pickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickChipText: { fontSize: 13, fontWeight: '500', color: colors.ink2 },
  pickChipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  /* 购买方式：分段按钮 */
  modelRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: colors.spacing.md,
    padding: 3,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.lg,
  },
  modelBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: colors.radius.md,
    alignItems: 'center',
  },
  modelBtnActive: { backgroundColor: colors.surface, ...colors.shadow.sm },
  modelBtnText: { fontSize: 14, fontWeight: '600', color: colors.ink3 },
  modelBtnTextActive: { color: colors.primary, fontWeight: '700' },
  /* 价格摘要 */
  priceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: colors.spacing.md,
  },
  priceCell: {
    flex: 1,
    padding: colors.spacing.lg,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  priceLabel: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },
  priceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  priceTotal: { color: colors.primary },
  emptyProp: {
    padding: 14,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: colors.spacing.md,
  },
  emptyPropText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.ink,
    marginBottom: colors.spacing.md,
  },
  inputArea: { minHeight: 96, textAlignVertical: 'top' },
  submitBtn: {
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    ...colors.shadow.primary,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
});
