import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { ownerApi } from '@/services/api';
import type { Property, PropertyStatus } from '@/types';

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

export default function HomeScreen() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProperties = useCallback(async () => {
    try {
      const res = await ownerApi.properties();
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      setProperties(items as Property[]);
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

  const renderItem = ({ item }: { item: Property }) => (
    <Card title={item.title}>
      <View style={styles.row}>
        <Text style={styles.address} numberOfLines={2}>
          {item.address}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusColors[item.status] }]}>
          <Text style={styles.badgeText}>{statusLabels[item.status]}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.rent}>¥{item.rent.toLocaleString()}/月</Text>
        <Text style={styles.meta}>
          {item.bedrooms ?? 0}室 · {item.area ?? 0}㎡
        </Text>
      </View>
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
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
        ListEmptyComponent={<Text style={styles.empty}>暂无房源</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  address: { flex: 1, color: '#666', fontSize: 13, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  rent: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  meta: { color: '#999', fontSize: 13 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
});
