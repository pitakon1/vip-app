import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
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
        <LoadingState label="正在加载文档…" />
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
            activeOpacity={0.7}
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
        ListEmptyComponent={<EmptyState icon="folder-open-outline" title="暂无文档" sub="合同、收据、验房与产权文件都会归档在这里" />}
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
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, color: colors.ink2 },
  filterTextActive: { color: colors.primaryForeground },
  list: { paddingVertical: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  info: { flex: 1 },
  title: { fontSize: 15, color: colors.text, fontWeight: '500' },
  subtitle: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  arrow: { fontSize: 22, color: colors.ink3 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});
