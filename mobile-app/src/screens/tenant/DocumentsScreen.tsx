import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { documentsApi } from '@/services/api';
import { documentFileUrl } from '@/lib/api';
import { useUserCapabilities } from '@/hooks/useUserCapabilities';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/i18n';
import { useCachedQuery } from '@/lib/useCachedQuery';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface DocItem {
  id: string;
  title?: string;
  type?: string;
  file_size?: number;
  mime_type?: string;
  created_at?: string;
  uploadedAt?: string;
  fileUrl?: string;
  size?: number;
  [key: string]: any;
}

/**
 * 文档类型元数据（合并业主 + 租客两类文档类型）。
 * 统一一套页面结构，仅按用户能力决定上传入口的显隐。
 */
const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: IoniconName }> = {
  contract: { label: '合同', color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1), icon: 'document-text-outline' },
  receipt: { label: '收据', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1), icon: 'receipt-outline' },
  inspection_photo: { label: '验房照片', color: colors.success, bg: colors.alpha(colors.successRgb, 0.1), icon: 'image-outline' },
  tax_invoice: { label: '税务发票', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1), icon: 'document-outline' },
  wht_certificate: { label: '代扣税凭证', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1), icon: 'document-outline' },
  other: { label: '其他', color: colors.ink3, bg: colors.surface2, icon: 'folder-outline' },
};

const metaOf = (type?: string) => TYPE_META[type ?? ''] ?? TYPE_META.other;

const formatSize = (bytes?: number) => {
  const n = Number(bytes || 0);
  if (n <= 0) return '—';
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

const formatDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '-');

export default function DocumentsScreen() {
  const { isActiveTenant } = useUserCapabilities();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState<string>('all');
  const [uploading, setUploading] = useState(false);

  const q = useCachedQuery<DocItem[]>({
    queryKey: ['docs', 'list'],
    cacheKey: `docs:list:${user?.id ?? 'anon'}`,
    queryFn: async () => {
      const res = await documentsApi.list();
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      return Array.isArray(items) ? (items as DocItem[]) : [];
    },
  });
  const docs = q.data ?? [];
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const loadDocs = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);
  const onRefresh = loadDocs;

  // 加载失败提示（保留原行为）
  useEffect(() => {
    if (q.isError) {
      Alert.alert(t('loadFailed'), t('doc.loadFailMsg'));
    }
  }, [q.isError]);

  /* ===== 统计口径（真实数据）===== */
  const stats = useMemo(() => {
    const now = new Date();
    const monthAdded = docs.filter((d) => {
      const ts = d.created_at ?? d.uploadedAt;
      if (!ts) return false;
      const dt = new Date(String(ts));
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    }).length;

    const usedBytes = docs.reduce((s, d) => s + Number(d.file_size ?? d.size ?? 0), 0);

    const byType = new Map<string, number>();
    docs.forEach((d) => {
      const key = d.type ?? 'other';
      byType.set(key, (byType.get(key) ?? 0) + Number(d.file_size ?? d.size ?? 0));
    });
    let topType: string | null = null;
    let topBytes = 0;
    byType.forEach((v, k) => {
      if (v > topBytes) {
        topBytes = v;
        topType = k;
      }
    });

    return {
      total: docs.length,
      monthAdded,
      usedBytes,
      topType,
      topPct: usedBytes > 0 ? Math.round((topBytes / usedBytes) * 100) : 0,
    };
  }, [docs]);

  // chips 由真实文档类型动态生成
  const filters = useMemo(() => {
    const types = Array.from(new Set(docs.map((d) => d.type ?? 'other')));
    return [
      { key: 'all', label: '全部' },
      ...types.map((t) => ({ key: t, label: metaOf(t).label })),
    ];
  }, [docs]);

  const filtered = filter === 'all' ? docs : docs.filter((d) => (d.type ?? 'other') === filter);

  // 打开 / 下载文档：统一走带鉴权的 /documents/{id}/file 取件，避免直接使用前端落库地址
  const openDoc = async (doc: DocItem, mode: 'file' | 'download' = 'file') => {
    if (!doc.id) {
      Alert.alert(t('doc.openFailTitle'), t('doc.noFile'));
      return;
    }
    const url = await documentFileUrl(doc.id, mode);
    if (!url) {
      Alert.alert(t('doc.openFailTitle'), t('doc.sessionExpired'));
      return;
    }
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      Alert.alert(t('doc.openFailTitle'), t('doc.unsupported'));
      return;
    }
    Linking.openURL(url);
  };

  // 租客上传（仅在有上传能力时显示）
  const handleUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled) return;
      setUploading(true);
      Alert.alert('已选择文件', '文件已选择，正在上传…');
      await loadDocs();
    } catch (err: any) {
      Alert.alert('上传失败', err?.message || '请稍后重试');
    } finally {
      setUploading(false);
    }
  };

  const renderItem = ({ item }: { item: DocItem }) => {
    const meta = metaOf(item.type);
    return (
      <View style={styles.card}>
        <View style={[styles.cardIcon, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title || '未命名文档'}</Text>
          <View style={styles.cardMetaRow}>
            <View style={[styles.badge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
          <Text style={styles.cardSub} numberOfLines={1}>
            {formatDate(item.created_at ?? item.uploadedAt)} · {formatSize(item.file_size ?? item.size)}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => openDoc(item, 'file')}>
            <Ionicons name="eye-outline" size={16} color={colors.ink2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => openDoc(item, 'download')}>
            <Ionicons name="download-outline" size={16} color={colors.ink2} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载文档…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* 租客上传入口（按能力显隐） */}
            {isActiveTenant && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, uploading && styles.actionBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.primaryForeground} />
                      <Text style={styles.actionText}>上传合同 / 凭证</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* 统计行：文档总数 / 存储已用 */}
            <View style={styles.statRow}>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>文档总数</Text>
                <Text style={styles.statValue}>{stats.total}</Text>
                <View style={[styles.miniBadge, { backgroundColor: colors.alpha(colors.primaryRgb, 0.12) }]}>
                  <Text style={[styles.miniBadgeText, { color: colors.primary }]}>
                    {stats.monthAdded} 份本月新增
                  </Text>
                </View>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>存储已用</Text>
                <Text style={styles.statValue}>{formatSize(stats.usedBytes)}</Text>
                <View style={[styles.miniBadge, { backgroundColor: colors.surface2 }]}>
                  <Text style={[styles.miniBadgeText, { color: colors.ink3 }]}>
                    {stats.total} 份文件
                  </Text>
                </View>
              </View>
            </View>

            {/* 存储空间使用情况 */}
            <View style={styles.card2}>
              <View style={styles.storageHead}>
                <Text style={styles.storageLabel}>存储空间使用情况</Text>
                <Text style={styles.storageValue}>{formatSize(stats.usedBytes)}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${stats.topPct}%` }]} />
              </View>
              {stats.topType && stats.usedBytes > 0 && (
                <Text style={styles.storageNote}>
                  主要来源：{metaOf(stats.topType).label} · 占比 {stats.topPct}%
                </Text>
              )}
            </View>

            {/* 筛选 chips */}
            <View style={styles.chips}>
              {filters.map((f) => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.8}
                    onPress={() => setFilter(f.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>全部文档</Text>
              <Text style={styles.sectionHint}>{filtered.length} 份</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="folder-open-outline"
            title="暂无文档"
            sub="合同、收据、验房与税务文件都会归档在这里"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: colors.spacing.md, paddingBottom: 24 },

  /* 上传入口 */
  actions: { flexDirection: 'row', marginTop: colors.spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    minHeight: 44,
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },

  /* 统计行 */
  statRow: { flexDirection: 'row', gap: 10, marginTop: colors.spacing.md },
  statCell: {
    flex: 1,
    padding: 12,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 4,
    marginBottom: 6,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  miniBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.radius.full,
  },
  miniBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },

  /* 存储卡 */
  card2: {
    marginTop: colors.spacing.md,
    padding: colors.spacing.lg,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  storageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  storageLabel: { fontSize: colors.fontSize.base, color: colors.ink2 },
  storageValue: {
    fontSize: colors.fontSize.base,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  progressBar: { height: 8, borderRadius: colors.radius.full, backgroundColor: colors.primary },
  storageNote: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 8 },

  /* chips */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: colors.spacing.lg },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.base, fontWeight: '500', color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  /* 区块标题 */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: colors.spacing.lg,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },

  /* 文档卡 */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: colors.spacing.lg,
    marginBottom: 10,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  cardSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 3, fontVariant: ['tabular-nums'] },
  cardActions: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});