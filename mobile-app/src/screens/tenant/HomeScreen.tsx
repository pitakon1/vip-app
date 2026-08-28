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
import { notificationsApi } from '@/services/api';
import type { Notification } from '@/types';

const typeLabels: Record<Notification['type'], string> = {
  rent_reminder: '租金提醒',
  lease_expiry: '合同到期',
  service_update: '服务更新',
  system: '系统',
  payment: '支付',
};

function badgeColor(type: Notification['type']): string {
  switch (type) {
    case 'rent_reminder':
      return colors.warning;
    case 'lease_expiry':
      return colors.error;
    case 'payment':
      return colors.success;
    default:
      return colors.primary;
  }
}

export default function HomeScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.mine();
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      setNotifications(items as Notification[]);
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取通知');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const renderItem = ({ item }: { item: Notification }) => (
    <Card title={item.title}>
      <View style={styles.typeRow}>
        <View style={[styles.badge, { backgroundColor: badgeColor(item.type) }]}>
          <Text style={styles.badgeText}>{typeLabels[item.type]}</Text>
        </View>
        {!item.read ? <View style={styles.dot} /> : null}
      </View>
      <Text style={styles.body}>{item.body}</Text>
      <Text style={styles.date}>{item.createdAt}</Text>
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
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={<Text style={styles.empty}>暂无通知</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8 },
  typeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error, marginLeft: 8 },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  date: { fontSize: 12, color: '#999', marginTop: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
});
