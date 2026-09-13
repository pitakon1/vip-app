import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import Card from '../../components/Card';
import colors from '../../theme/colors';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import { propertiesApi } from '../../services/api';

interface PropertyItem {
  id: string;
  title?: string;
  room_number?: string;
  address?: string;
  monthly_rent?: number;
  currency?: string;
  status?: string;
  size_sqm?: number;
  [key: string]: any;
}

const statusLabels: Record<string, string> = {
  vacant: '空置',
  rented: '已出租',
  reserved: '已预订',
  renewing: '续约中',
  maintenance: '维护中',
};

const statusColors: Record<string, string> = {
  vacant: colors.warning,
  rented: colors.success,
  reserved: colors.primary,
  renewing: colors.primary,
  maintenance: colors.error,
};

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');

export default function PropertiesScreen() {
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await propertiesApi.list({ page: 1, page_size: 100 });
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      setProperties(items as PropertyItem[]);
    } catch {
      /* 房源加载失败不阻塞 */
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

  const renderItem = ({ item }: { item: PropertyItem }) => {
    const status = item.status ?? 'vacant';
    const text = statusLabels[status] ?? status;
    const color = statusColors[status] ?? colors.ink3;
    const title = item.title || item.room_number || '房源';
    return (
      <Card title={title}>
        <View style={styles.row}>
          <Text style={styles.address} numberOfLines={1}>
            {item.address || '暂无地址'}
          </Text>
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeText}>{text}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.rent}>
            {cur(item.currency)}
            {Number(item.monthly_rent || 0).toLocaleString()}/月
          </Text>
          <Text style={styles.area}>{item.size_sqm ?? 0}㎡</Text>
        </View>
      </Card>
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
        ListEmptyComponent={<EmptyState icon="business-outline" title="暂无房源" sub="可管理的房源会展示在这里，或先去房源搜索帮客户筛选" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  address: { flex: 1, color: colors.ink2, fontSize: 13, marginRight: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: colors.primaryForeground, fontSize: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  rent: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  area: { color: colors.ink3, fontSize: 13 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});