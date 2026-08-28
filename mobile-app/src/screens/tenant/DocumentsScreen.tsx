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
import * as ImagePicker from 'expo-image-picker';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { documentsApi } from '@/services/api';
import type { Document } from '@/types';

const typeLabels: Record<Document['type'], string> = {
  contract: '合同',
  receipt: '收据',
  inspection: '验房',
  identity: '证件',
  other: '其他',
};

export default function DocumentsScreen() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const handleUpload = async (type: 'contract' | 'receipt') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled) return;
      setUploading(true);
      Alert.alert(
        '已选择文件',
        `${type === 'contract' ? '租赁合同' : '租金凭证'}已选择，正在上传`,
      );
      await loadDocs();
    } catch (err: any) {
      Alert.alert('上传失败', err?.message || '请稍后重试');
    } finally {
      setUploading(false);
    }
  };

  const renderItem = ({ item }: { item: Document }) => (
    <Card>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>
            {typeLabels[item.type]} · {item.fileType?.toUpperCase() ?? 'FILE'}
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
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, uploading && styles.actionBtnDisabled]}
          onPress={() => handleUpload('receipt')}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.actionText}>上传租金凭证</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, uploading && styles.actionBtnDisabled]}
          onPress={() => handleUpload('contract')}
          disabled={uploading}
        >
          <Text style={styles.actionText}>上传租赁合同</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={docs}
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
  actions: { flexDirection: 'row', padding: 12, gap: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  info: { flex: 1 },
  title: { fontSize: 15, color: colors.text, fontWeight: '500' },
  subtitle: { fontSize: 12, color: '#999', marginTop: 4 },
  arrow: { fontSize: 22, color: '#ccc' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
});
