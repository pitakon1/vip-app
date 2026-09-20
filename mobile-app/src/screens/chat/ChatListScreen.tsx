import React, { useCallback, useEffect, useState } from 'react';
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
  created_at?: string;
  [key: string]: any;
}

const formatTime = (x?: string) => (x ? x.replace('T', ' ').slice(5, 16) : '');

export default function ChatListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.msgItem}
      onPress={() =>
        navigation.navigate('ChatDetail', {
          conversationId: item.id,
          title: item.title ?? '会话',
        })
      }
      activeOpacity={0.7}
    >
      <View style={styles.msgIcon}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
      </View>
      <Text style={styles.msgTitle} numberOfLines={1}>
        {item.title ?? '未命名会话'}
      </Text>
      <Text style={styles.msgTime}>{formatTime(item.created_at)}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loadError ? (
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
            <EmptyState icon="chatbubbles-outline" title="暂无会话" sub="从客户/房源发起咨询后会显示在这里" />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  msgItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  msgIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.full,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink },
  msgTime: { fontSize: 12, color: colors.ink3 },
});