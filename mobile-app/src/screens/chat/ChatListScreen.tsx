import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import { chatApi } from '@/services/api';
import { notifyError } from '@/utils/feedback';
import EmptyState from '@/components/EmptyState';
import type { RootStackParamList } from '@/navigation/RootNavigator';

interface Conversation {
  id: string;
  title?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  created_at?: string;
  [key: string]: any;
}

// 分类 Tab 基于真实 entity_type（后端无消息分类字段，按会话关联对象归类）
type CatKey = 'all' | 'lease' | 'property' | 'other';
const CATS: { key: CatKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'lease', label: '租务会话' },
  { key: 'property', label: '房源会话' },
  { key: 'other', label: '其他' },
];

const entityLabel: Record<string, string> = {
  lease: '租务',
  property: '房源',
};

const entityIcon: Record<string, string> = {
  lease: 'document-text-outline',
  property: 'home-outline',
};

const matchCat = (entityType: string | null | undefined, cat: CatKey) => {
  if (cat === 'all') return true;
  if (cat === 'other') return !entityType || !entityLabel[entityType];
  return entityType === cat;
};

const formatTime = (x?: string) => (x ? x.replace('T', ' ').slice(0, 16) : '');

export default function ChatListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState<CatKey>('all');

  const load = useCallback(async () => {
    try {
      const res = await chatApi.conversations();
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.conversations ?? [];
      setConversations(items as Conversation[]);
      setLoadError(false);
    } catch (err: any) {
      setLoadError(true);
      notifyError('加载失败', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const catCount = (key: CatKey) =>
    conversations.filter((c) => matchCat(c.entity_type, key)).length;

  const visible = useMemo(
    () => conversations.filter((c) => matchCat(c.entity_type, cat)),
    [conversations, cat],
  );

  const renderItem = ({ item }: { item: Conversation }) => {
    const label = item.entity_type ? entityLabel[item.entity_type] : undefined;
    return (
      <TouchableOpacity
        style={styles.msgItem}
        onPress={() =>
          navigation.navigate('ChatDetail', {
            conversationId: item.id,
            title: item.title ?? '会话',
          })
        }
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.msgIcon,
            label === '租务'
              ? styles.msgIconLease
              : label === '房源'
              ? styles.msgIconProperty
              : styles.msgIconOther,
          ]}
        >
          <Ionicons
            name={(entityIcon[item.entity_type ?? ''] ?? 'chatbubble-outline') as any}
            size={20}
            color={
              label === '租务'
                ? colors.info
                : label === '房源'
                ? colors.primary
                : colors.ink2
            }
          />
        </View>
        <View style={styles.msgBody}>
          <View style={styles.msgHead}>
            <Text style={styles.msgTitle} numberOfLines={1}>
              {item.title ?? '未命名会话'}
            </Text>
            {!!label && (
              <View style={styles.msgBadge}>
                <Text style={styles.msgBadgeText}>{label}</Text>
              </View>
            )}
          </View>
          <Text style={styles.msgSub}>点击进入会话查看消息</Text>
        </View>
        <Text style={styles.msgTime}>{formatTime(item.created_at)}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>加载会话中…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 消息页头（未读数与「全部已读」无对应接口，故不展示） */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>消息中心</Text>
          <Text style={styles.headerSub}>共 {conversations.length} 条会话</Text>
        </View>
      </View>

      {/* 会话由后端按客户/房源上下文自动创建，客户端不做手动新建 */}

      {/* 分类 Tabs（计数来自真实会话） */}
      <View style={styles.catTabs}>
        {CATS.map((c) => {
          const active = cat === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.catTab, active && styles.catTabActive]}
              onPress={() => setCat(c.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={c.label}
            >
              <Text style={[styles.catTabText, active && styles.catTabTextActive]}>
                {c.label} {catCount(c.key)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 消息列表 */}
      <View style={styles.msgCard}>
        {loadError && conversations.length === 0 ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="加载失败"
            sub="无法获取会话列表，请检查网络"
            actionLabel="重试"
            onAction={() => {
              setLoading(true);
              load();
            }}
          />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <EmptyState icon="chatbubbles-outline" title="暂无会话" sub="从客户/房源发起咨询后会显示在这里" />
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 13, color: colors.ink3, marginTop: 16, fontWeight: '500' },
  // 页头
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 14,
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.ink },
  headerSub: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.full,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  newBtnText: { fontSize: 13, color: colors.ink2 },
  createBox: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
  },
  inputError: { borderColor: colors.error },
  fieldError: { fontSize: 12, color: colors.error, marginTop: 6 },
  createBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    borderRadius: colors.radius.md,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  createText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  // 分类 Tabs
  catTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  catTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  catTabActive: { backgroundColor: colors.primary },
  catTabText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  catTabTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  // 消息列表
  msgCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
  },
  msgItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  msgIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgIconLease: { backgroundColor: colors.alpha(colors.infoRgb, 0.1) },
  msgIconProperty: { backgroundColor: colors.sidebarActive },
  msgIconOther: { backgroundColor: colors.surface2 },
  msgBody: { flex: 1 },
  msgHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  msgTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  msgBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
  },
  msgBadgeText: { fontSize: 11, fontWeight: '600', color: colors.ink2 },
  msgSub: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  msgTime: { fontSize: 12, color: colors.ink3 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});