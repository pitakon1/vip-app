import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import colors from '@/theme/colors';
import { ownerApi, ownersApi } from '@/services/api';
import type { Property, PropertyStatus } from '@/types';
import type { RootStackParamList } from '@/navigation/RootNavigator';

const statusLabels: Record<PropertyStatus, string> = {
  vacant: '空置',
  rented: '已出租',
  renewing: '正在续约',
  maintenance: '维护中',
};

const statusColors: Record<PropertyStatus, string> = {
  vacant: colors.success,
  rented: colors.primary,
  renewing: '#722ed1',
  maintenance: colors.warning,
};

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const letter = (v?: number, c?: string) => `${cur(c)}${Number(v || 0).toLocaleString()}`;

type IoniconName = keyof typeof Ionicons.glyphMap;

// 资产概览快捷入口（对照需求文档 §2.3 业主端）
const SHELL_ENTRIES: { key: string; label: string; sub: string; icon: IoniconName; target: string }[] = [
  { key: 'marketing', label: '委托挂牌', sub: '出租·出售·估价', icon: 'megaphone-outline', target: 'OwnerPortal' },
  { key: 'income', label: '收益中心', sub: '实收·待收·明细', icon: 'wallet-outline', target: 'OwnerIncome' },
  { key: 'services', label: '增值服务', sub: '托管·保洁·保险', icon: 'sparkles-outline', target: 'OwnerServices' },
  { key: 'documents', label: '文档中心', sub: '合同·收据·验房', icon: 'folder-open-outline', target: 'OwnerDocuments' },
  { key: 'messages', label: '站内消息', sub: '租客·经纪沟通', icon: 'chatbubble-ellipses-outline', target: 'ChatList' },
];

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [properties, setProperties] = useState<Property[]>([]);
  const [summary, setSummary] = useState<{ received?: number; pending?: number; overdue?: number; currency?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProperties = useCallback(async () => {
    const year = new Date().getFullYear();
    try {
      const [propRes, sumRes]: any[] = await Promise.allSettled([
        ownerApi.properties(),
        ownersApi.annualSummary(year),
      ]);
      if (propRes.status === 'fulfilled') {
        const data = propRes.value?.data;
        const items = Array.isArray(data)
          ? data
          : (data as any)?.items ?? (data as any)?.data ?? [];
        setProperties(items as Property[]);
      }
      if (sumRes.status === 'fulfilled') {
        const d = sumRes.value?.data;
        setSummary({
          received: d?.totals?.received,
          pending: d?.totals?.pending,
          overdue: d?.totals?.overdue,
          currency: d?.currency,
        });
      }
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取房源列表');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProperties();
  }, [loadProperties]);

  const go = (target: string) => {
    navigation.navigate(target as any);
  };

  const renderItem = ({ item }: { item: Property }) => {
    // 后端返回 monthly_rent/size_sqm；兼容旧 rent/area 字段
    const rent = Number(item.monthly_rent ?? item.rent ?? 0);
    const cur = item.currency === 'USD' ? '$' : item.currency === 'CNY' ? '¥' : '฿';
    const title = item.title || item.room_number || item.address || '房源';
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PropertyDetail', { id: item.id })}
      >
        <Card title={title}>
          <View style={styles.row}>
            <Text style={styles.address} numberOfLines={2}>
              {item.address}
            </Text>
            <View style={[styles.badge, { backgroundColor: statusColors[item.status] }]}>
              <Text style={styles.badgeText}>{statusLabels[item.status]}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.rent}>
              {cur}
              {rent.toLocaleString()}/月
            </Text>
            <Text style={styles.meta}>
              {item.bedrooms ?? 0}室 · {item.size_sqm ?? item.area ?? 0}㎡
            </Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载房源…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View>
            {/* 资产概览 · 月度应收/实收/逾期 */}
            <View style={styles.banner}>
              <Text style={styles.bannerLabel}>资产概览 · 年度财务</Text>
              <View style={styles.bannerRow}>
                <View style={styles.bannerCell}>
                  <Text style={styles.bannerValue}>{letter(summary?.received, summary?.currency)}</Text>
                  <Text style={styles.bannerSub}>实收</Text>
                </View>
                <View style={styles.bannerCell}>
                  <Text style={[styles.bannerValue, { color: colors.warning }]}>{letter(summary?.pending, summary?.currency)}</Text>
                  <Text style={styles.bannerSub}>待收</Text>
                </View>
                <View style={styles.bannerCell}>
                  <Text style={[styles.bannerValue, { color: (summary?.overdue ?? 0) > 0 ? '#ffcece' : '#ffffff' }]}>{letter(summary?.overdue, summary?.currency)}</Text>
                  <Text style={styles.bannerSub}>逾期</Text>
                </View>
              </View>
              <View style={styles.bannerFooter}>
                <TouchableOpacity onPress={() => go('OwnerPortal')} activeOpacity={0.7}>
                  <Text style={styles.bannerLink}>委托挂牌 · 查看全部 ›</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 功能宫格 */}
            <View style={styles.shellGrid}>
              {SHELL_ENTRIES.map((entry) => (
                <TouchableOpacity key={entry.key} style={styles.shellItem} onPress={() => go(entry.target)} activeOpacity={0.7}>
                  <View style={styles.shellIconWrap}>
                    <Ionicons name={entry.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.shellLabel}>{entry.label}</Text>
                  <Text style={styles.shellSub}>{entry.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="key-outline"
            title="暂无房源"
            sub="名下还没有房源，去委托挂牌，让平台帮你出租或出售"
            actionLabel="去委托挂牌"
            onAction={() => go('OwnerPortal')}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8 },
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  bannerLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  bannerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  bannerCell: { flex: 1 },
  bannerValue: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  bannerFooter: { marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.2)' },
  bannerLink: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  shellGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    marginBottom: 8,
  },
  shellItem: {
    width: '20%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  shellIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  shellLabel: { fontSize: 12, color: colors.text, fontWeight: '600' },
  shellSub: { fontSize: 10, color: colors.ink3, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  address: { flex: 1, color: colors.ink2, fontSize: 13, marginRight: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: colors.primaryForeground, fontSize: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  rent: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.ink3, fontSize: 13 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});
