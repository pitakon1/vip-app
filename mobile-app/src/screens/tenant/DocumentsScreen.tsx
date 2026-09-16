import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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

// 分类 Tab（对齐原型：全部 / 合同 / 收据 / 其他）
type CatKey = 'all' | 'contract' | 'receipt' | 'other';
const CATS: { key: CatKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'contract', label: '合同' },
  { key: 'receipt', label: '收据' },
  { key: 'other', label: '其他' },
];

// 类型徽标配色
const typeBadge: Record<string, { color: string; bg: string }> = {
  contract: { color: colors.primary, bg: colors.sidebarActive },
  receipt: { color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  inspection: { color: colors.warning, bg: colors.warningLight },
  identity: { color: colors.success, bg: colors.successLight },
  other: { color: colors.ink2, bg: colors.surface2 },
};

// 文件大小 → 可读文本
const formatSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

const formatDate = (x?: string) => (x ? x.slice(0, 10) : null);

export default function DocumentsScreen() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cat, setCat] = useState<CatKey>('all');

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

  // 按分类 Tab 过滤（真实文档类型）
  const catDocs = useMemo(() => {
    if (cat === 'all') return docs;
    if (cat === 'other')
      return docs.filter((d) => d.type !== 'contract' && d.type !== 'receipt');
    return docs.filter((d) => d.type === cat);
  }, [docs, cat]);

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

  const renderItem = ({ item }: { item: Document }) => {
    const badge = typeBadge[item.type] ?? typeBadge.other;
    const size = formatSize(item.size);
    const date = formatDate(item.uploadedAt);
    const metaText = [size, date].filter(Boolean).join(' · ');
    return (
      <View style={styles.docCard}>
        <View style={styles.docHead}>
          <View style={[styles.docIcon, { backgroundColor: badge.bg }]}>
            <Ionicons name="document-text-outline" size={18} color={badge.color} />
          </View>
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.typeChip, { backgroundColor: badge.bg }]}>
                <Text style={[styles.typeChipText, { color: badge.color }]}>
                  {typeLabels[item.type] ?? '其他'}
                </Text>
              </View>
              {!!metaText && <Text style={styles.meta}>{metaText}</Text>}
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={styles.downloadBtn}
          activeOpacity={0.8}
          onPress={() =>
            item.fileUrl
              ? Alert.alert('下载', `文件地址：\n${item.fileUrl}`)
              : Alert.alert('提示', '该文档暂无可下载文件')
          }
        >
          <Ionicons name="download-outline" size={14} color={colors.primary} />
          <Text style={styles.downloadText}>下载</Text>
        </TouchableOpacity>
      </View>
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
      {/* 上传入口（现有业务逻辑保留） */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, uploading && styles.actionBtnDisabled]}
          onPress={() => handleUpload('receipt')}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
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

      {/* 分类 Tabs —— 计数来自真实文档类型 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catTabs}
      >
        {CATS.map((c) => {
          const count =
            c.key === 'all'
              ? docs.length
              : c.key === 'other'
              ? docs.filter((d) => d.type !== 'contract' && d.type !== 'receipt').length
              : docs.filter((d) => d.type === c.key).length;
          const active = cat === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.catTab, active && styles.catTabActive]}
              onPress={() => setCat(c.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.catTabText, active && styles.catTabTextActive]}>
                {c.label} {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Stat Row（真实份数） */}
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>合同</Text>
          <Text style={styles.statValue}>
            {docs.filter((d) => d.type === 'contract').length} 份
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>收据</Text>
          <Text style={styles.statValue}>
            {docs.filter((d) => d.type === 'receipt').length} 份
          </Text>
        </View>
      </View>

      {/* 文档列表 */}
      <Text style={styles.sectionTitle}>文档列表</Text>
      <FlatList
        data={catDocs}
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
    borderRadius: colors.radius.md,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '500' },
  // 分类 Tabs
  catTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  catTabActive: { backgroundColor: colors.primary },
  catTabText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  catTabTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  // Stat Row
  statRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statLabel: { fontSize: 12, color: colors.ink3 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 4 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  // 文档卡片（对齐原型：36 图标 + 标题 + 类型徽标 + 大小/日期 + 下载）
  docCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  docHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  title: { fontSize: 15, color: colors.text, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  typeChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.sm },
  typeChipText: { fontSize: 11, fontWeight: '600' },
  meta: { fontSize: 13, color: colors.ink3 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: colors.radius.md,
    paddingVertical: 8,
  },
  downloadText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});
