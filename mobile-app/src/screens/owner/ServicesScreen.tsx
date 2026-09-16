import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { ownerApi, serviceOrdersApi } from '@/services/api';
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

const formatDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '-');

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'processing', label: '处理中' },
  { key: 'completed', label: '已完成' },
  { key: 'pending', label: '待响应' },
];

const matchFilter = (status: string | undefined, filter: string) => {
  if (filter === 'all') return true;
  if (filter === 'processing') return status === 'assigned' || status === 'in_progress';
  if (filter === 'completed') return status === 'completed';
  if (filter === 'pending') return status === 'pending';
  return true;
};

export default function ServicesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [orders, setOrders] = useState<ServiceOrderItem[]>([]);
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [orderRes, propRes] = await Promise.allSettled([
      serviceOrdersApi.list({ page: 1, limit: 100 }),
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

  /* ===== 统计口径（真实工单数据）===== */
  const stats = useMemo(() => {
    const now = new Date();
    const inMonth = (x?: string) => {
      if (!x) return false;
      const dt = new Date(String(x));
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    };

    const processing = orders.filter(
      (o) => o.status === 'assigned' || o.status === 'in_progress'
    ).length;
    const monthOrders = orders.filter((o) => inMonth(o.created_at));
    const monthCompleted = monthOrders.filter((o) => o.status === 'completed').length;

    return { processing, monthOrders: monthOrders.length, monthCompleted };
  }, [orders]);

  const filtered = useMemo(
    () => orders.filter((o) => matchFilter(o.status, filter)),
    [orders, filter]
  );

  const renderItem = ({ item }: { item: ServiceOrderItem }) => {
    const meta = metaOf(item.service_type);
    const st = statusOf(item.status);
    const pName = propertyName(item.property_id);
    const shortId = `#SR-${String(item.id).slice(0, 6).toUpperCase()}`;

    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.cardIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.notes || meta.label}
              </Text>
              <View style={[styles.badge, { backgroundColor: st.bg }]}>
                <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {shortId}
              {pName ? ` · ${pName}` : ''} · {formatDate(item.created_at)}
            </Text>
          </View>
        </View>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { width: `${st.pct}%`, backgroundColor: st.color },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: st.color }]}>{st.pct}%</Text>
        </View>
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
            {/* 统计行：处理中工单 / 本月工单 */}
            <View style={styles.statRow}>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>处理中工单</Text>
                <Text style={styles.statValue}>{stats.processing}</Text>
                <View style={[styles.miniBadge, { backgroundColor: colors.alpha(colors.infoRgb, 0.12) }]}>
                  <Text style={[styles.miniBadgeText, { color: colors.info }]}>跟进中</Text>
                </View>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>本月工单</Text>
                <Text style={styles.statValue}>{stats.monthOrders}</Text>
                <View style={[styles.miniBadge, { backgroundColor: colors.alpha(colors.successRgb, 0.12) }]}>
                  <Text style={[styles.miniBadgeText, { color: colors.success }]}>
                    {stats.monthCompleted} 已完成
                  </Text>
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
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>我的工单</Text>
              <Text style={styles.sectionHint}>{filtered.length} 单</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="construct-outline"
            title="暂无服务工单"
            sub="清洁、维修、代缴等增值服务工单会显示在这里"
          />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => go('OwnerMarketing')}
      >
        <Ionicons name="add" size={24} color={colors.primaryForeground} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: colors.spacing.md, paddingBottom: 90 },

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

  /* chips */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: colors.spacing.lg },
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

  /* FAB */
  fab: {
    position: 'absolute',
    right: colors.spacing.lg,
    bottom: colors.spacing.xl,
    width: 52,
    height: 52,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.primary,
  },
});