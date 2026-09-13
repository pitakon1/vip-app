import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import colors from '@/theme/colors';
import { chatApi } from '@/services/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

interface Message {
  id?: string;
  content?: string;
  text?: string;
  role?: string;
  sender?: string;
  created_at?: string;
}

type Route = RouteProp<RootStackParamList, 'ChatDetail'>;

export default function ChatDetailScreen() {
  const route = useRoute<Route>();
  const { conversationId, title } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await chatApi.messages(conversationId);
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.messages ?? [];
      setMessages(items as Message[]);
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取消息记录');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    // 乐观更新
    const optimistic: Message = { content: text, role: 'user' };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await chatApi.sendMessage(conversationId, { content: text });
      await load();
    } catch (err: any) {
      Alert.alert('发送失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const content = item.content ?? item.text ?? '';
    const isMine = item.role === 'user' || item.sender === 'user';
    return (
      <View style={[styles.msgRow, isMine ? styles.mineRow : styles.otherRow]}>
        <View style={[styles.bubble, isMine ? styles.mineBubble : styles.otherBubble]}>
          <Text style={[styles.msgText, isMine && styles.mineText]}>{content}</Text>
          {item.created_at ? (
            <Text style={[styles.msgTime, isMine && styles.mineTime]}>{item.created_at}</Text>
          ) : null}
        </View>
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        data={messages}
        keyExtractor={(item, index) => item.id ?? String(index)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>暂无消息，开始第一个话题吧</Text>}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={title ? `回复「${title}」` : '输入消息...'}
          value={input}
          onChangeText={setInput}
          placeholderTextColor={colors.ink3}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.btnDisabled]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.sendText}>发送</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12, flexGrow: 1 },
  msgRow: { marginBottom: 10, flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  mineBubble: { backgroundColor: colors.primary },
  otherBubble: { backgroundColor: colors.surface },
  msgText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  mineText: { color: colors.primaryForeground },
  msgTime: { fontSize: 11, color: colors.ink3, marginTop: 6, textAlign: 'right' },
  mineTime: { color: 'rgba(255,255,255,0.85)' },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
  inputBar: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: colors.surface,
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
  sendBtn: {
    height: 40,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  sendText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600', paddingHorizontal: 12 },
});