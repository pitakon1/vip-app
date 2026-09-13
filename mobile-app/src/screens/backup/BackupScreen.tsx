import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { backupApi } from '@/services/api';

interface BackupJob {
  id: string;
  type?: string;
  status?: string;
  size?: number | string;
  size_bytes?: number | string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
}

const statusColor: Record<string, string> = {
  success: colors.success,
  completed: colors.success,
  running: colors.info,
  pending: colors.warning,
  failed: colors.error,
  error: colors.error,
};

const statusLabel: Record<string, string> = {
  success: '成功',
  completed: '已完成',
  running: '备份中',
  pending: '等待中',
  failed: '失败',
  error: '失败',
};

export default function BackupScreen() {
  const isFocused = useIsFocused();
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await backupApi.jobs();
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.jobs ?? [];
      setJobs(items as BackupJob[]);
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取备份记录');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const handleRun = async () => {
    setRunning(true);
    try {
      await backupApi.run();
      Alert.alert('已触发', '备份任务已启动');
      await load();
    } catch (err: any) {
      Alert.alert('备份失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setRunning(false);
    }
  };

  const renderItem = ({ item }: { item: BackupJob }) => {
    const c = statusColor[item.status ?? ''] ?? colors.ink3;
    const label = statusLabel[item.status ?? ''] ?? (item.status ?? '未知');
    const size = item.size ?? item.size_bytes;
    return (
      <Card>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.title}>{item.type ?? '数据备份'}</Text>
            {typeof size !== 'undefined' ? (
              <Text style={styles.sub}>大小: {String(size)}</Text>
            ) : null}
            {item.created_at ? <Text style={styles.time}>{item.created_at}</Text> : null}
          </View>
          <View style={[styles.badge, { backgroundColor: c }]}>
            <Text style={styles.badgeText}>{label}</Text>
          </View>
        </View>
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

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.runBtn, running && styles.btnDisabled]}
          onPress={handleRun}
          disabled={running}
        >
          {running ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.runText}>立即备份</Text>
          )}
        </TouchableOpacity>
      </View>
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>暂无备份记录</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actions: { padding: 12 },
  runBtn: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  runText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  info: { flex: 1 },
  title: { fontSize: 15, color: colors.text, fontWeight: '600' },
  sub: { fontSize: 13, color: colors.ink2, marginTop: 6 },
  time: { fontSize: 12, color: colors.ink3, marginTop: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  badgeText: { color: colors.primaryForeground, fontSize: 12 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});