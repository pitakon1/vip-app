import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { chatApi } from '@/services/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

interface Conversation {
  id: string;
  title?: string;
  peer_name?: string;
  last_message?: string;
  updated_at?: string;
}

export default function ChatListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await chatApi.conversations();
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.conversations ?? [];
      setConversations(items as Conversation[]);
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取会话列表');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      Alert.alert('提示', '请输入会话名称');
      return;
    }
    setCreating(true);
    try {
      await chatApi.createConversation({ title });
      setNewTitle('');
      Alert.alert('创建成功', '会话已创建');
      await load();
    } catch (err: any) {
      Alert.alert('创建失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setCreating(false);
    }
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      onPress={() =>
        navigation.navigate('ChatDetail', {
          conversationId: item.id,
          title: item.title ?? item.peer_name ?? '会话',
        })
      }
      activeOpacity={0.8}
    >
      <Card>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.title}>{item.title ?? item.peer_name ?? '未命名会话'}</Text>
            {item.last_message ? (
              <Text style={styles.preview} numberOfLines={1}>
                {item.last_message}
              </Text>
            ) : null}
          </View>
          <View style={styles.arrowBox}>
            <Text style={styles.arrow}>›</Text>
          </View>
        </View>
        {item.updated_at ? <Text style={styles.time}>{item.updated_at}</Text> : null}
      </Card>
    </TouchableOpacity>
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
      <View style={styles.createBox}>
        <TextInput
          style={styles.input}
          placeholder="新建会话名称"
          value={newTitle}
          onChangeText={setNewTitle}
          placeholderTextColor={colors.ink3}
        />
        <TouchableOpacity
          style={[styles.createBtn, creating && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.createText}>新建</Text>
          )}
        </TouchableOpacity>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>暂无会话</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  createBox: { flexDirection: 'row', padding: 12, gap: 10 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  createBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    borderRadius: 8,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  createText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1 },
  title: { fontSize: 15, color: colors.text, fontWeight: '600' },
  preview: { fontSize: 13, color: colors.ink2, marginTop: 6 },
  arrowBox: { marginLeft: 8 },
  arrow: { fontSize: 22, color: colors.ink3 },
  time: { fontSize: 12, color: colors.ink3, marginTop: 8 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});