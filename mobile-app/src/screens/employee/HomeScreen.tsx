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

const typeMap: Record<Notification['type'], { label: string; color: string }> = {
  rent_reminder: { label: '租金', color: colors.warning },
  lease_expiry: { label: '到期', color: colors.error },
  service_update: { label: '服务', color: colors.primary },
  payment: { label: '支付', color: colors.success },
  system: { label: '系统', color: '#999' },
};

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
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取提醒');
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

  const renderItem = ({ item }: { item: Notification }) => {
    const t = typeMap[item.type] ?? { label: '提醒', color: '#999' };
    return (
      <Card>
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: t.color }]}>
            <Text style={styles.badgeText}>{t.label}</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
        <Text style={styles.body}>{item.body}</Text>
        <Text style={styles.time}>{item.createdAt}</Text>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const pendingCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>今日提醒</Text>
        <Text style={styles.headerSub}>{pendingCount} 项待处理</Text>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={<Text style={styles.empty}>暂无提醒</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: colors.primary, padding: 20 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 10 },
  badgeText: { color: '#fff', fontSize: 12 },
  title: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '500' },
  body: { fontSize: 13, color: '#666', marginTop: 8, lineHeight: 18 },
  time: { fontSize: 12, color: '#999', marginTop: 6 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
});
