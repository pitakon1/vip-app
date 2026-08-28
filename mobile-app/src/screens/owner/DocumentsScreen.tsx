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
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { documentsApi } from '@/services/api';
import type { Document } from '@/types';

type FilterType = 'all' | Document['type'];

const FILTERS: Array<{ label: string; value: FilterType }> = [
  { label: '全部', value: 'all' },
  { label: '合同', value: 'contract' },
  { label: '收据', value: 'receipt' },
  { label: '验房照片', value: 'inspection' },
];

const typeLabels: Record<Document['type'], string> = {
  contract: '合同',
  receipt: '收据',
  inspection: '验房',
  identity: '证件',
  other: '其他',
};

export default function DocumentsScreen() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDocs = useCallback(async () => {
    try {
      const res = await documentsApi.list();
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      setDocs(items as Document[]);
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取文档');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDocs();
  }, [loadDocs]);

  const filtered = filter === 'all' ? docs : docs.filter((d) => d.type === filter);

  const renderItem = ({ item }: { item: Document }) => (
    <Card>
      <View style={styles.itemRow}>
        <View style={styles.info}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>
            {typeLabels[item.type]} · {item.fileType?.toUpperCase() ?? 'FILE'} ·{' '}
            {item.uploadedAt ?? '-'}
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
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
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterBtn, filter === f.value && styles.filterBtnActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text
              style={[styles.filterText, filter === f.value && styles.filterTextActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={<Text style={styles.empty}>暂无文档</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8, flexWrap: 'wrap' },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, color: '#666' },
  filterTextActive: { color: '#fff' },
  list: { paddingVertical: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  info: { flex: 1 },
  title: { fontSize: 15, color: colors.text, fontWeight: '500' },
  subtitle: { fontSize: 12, color: '#999', marginTop: 4 },
  arrow: { fontSize: 22, color: '#ccc' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
});
