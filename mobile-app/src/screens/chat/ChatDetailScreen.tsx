import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { chatApi, authApi } from '@/services/api';
import { notifyError } from '@/utils/feedback';
import { fmtDateTime } from '@/utils/format';
import EmptyState from '@/components/EmptyState';
import type { RootStackParamList } from '@/navigation/RootNavigator';

interface Message {
  id?: string;
  tempKey?: string;
  body?: string;
  content?: string;
  text?: string;
  role?: string;
  sender?: string;
  sender_id?: string;
  created_at?: string;
}

type Route = RouteProp<RootStackParamList, 'ChatDetail'>;

export default function ChatDetailScreen() {
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { conversationId, title } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await chatApi.messages(conversationId);
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.messages ?? [];
      setMessages(items as Message[]);
      setLoadError(false);
      // 拉取成功即视为已读：会话列表的未读角标随之清零
      chatApi.markRead(conversationId).catch(() => undefined);
    } catch (err: any) {
      if (!silent) {
        setLoadError(true);
        notifyError(t('loadFailed'), err);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [conversationId, t]);

  // 建立实时接收通道：发送走 REST，WebSocket 仅接收对端消息（服务端已排除发送者回声）
  // 断线（切网/切后台）后按退避重连，避免「进会话后网络一抖就再也收不到」。
  useEffect(() => {
    let cancelled = false;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const open = async () => {
      try {
        const url = await chatApi.wsUrl(conversationId);
        if (cancelled) return;
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
          retry = 0;
        };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.event === 'message') {
              // 按服务端消息 id 去重：轮询/重连可能带来同一条消息
              setMessages((prev) =>
                data.id && prev.some((m) => m.id === data.id)
                  ? prev
                  : [
                      ...prev,
                      {
                        id: data.id || `rt-${Date.now()}`,
                        body: data.body,
                        sender_id: data.sender_id,
                        message_type: data.message_type,
                        created_at: data.created_at,
                      },
                    ],
              );
              // 会话正处于前台，收到即已读
              chatApi.markRead(conversationId).catch(() => undefined);
            }
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          if (cancelled || retry >= 3) return;
          retry += 1;
          retryTimer = setTimeout(open, 1500 * retry);
        };
      } catch {
        if (cancelled || retry >= 3) return;
        retry += 1;
        retryTimer = setTimeout(open, 1500 * retry);
      }
    };

    authApi
      .me()
      .then((res) => !cancelled && setMyId(res?.data?.id || ''))
      .catch(() => undefined);
    void open();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  // 兜底轮询：WS 被代理/弱网阻断时仍能收消息（15s 一次，静默失败不打扰用户）
  useEffect(() => {
    const timer = setInterval(() => {
      void load(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);

  // 新消息（首次加载 / 发送 / 实时接收）后滚到最新一条，避免停在历史顶部
  useEffect(() => {
    if (messages.length === 0) return;
    listRef.current?.scrollToEnd({ animated: false });
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    // 乐观更新（临时唯一 key，避免刷新首插时 index 漂移导致 key 不稳）
    const tempKey = `temp-${Date.now()}`;
    const optimistic: Message = { content: text, role: 'user', tempKey };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await chatApi.sendMessage(conversationId, { body: text });
      // 成功后刷新真实列表（拿到服务端 id，替换乐观消息）
      await load();
    } catch (err: any) {
      notifyError(t('chat.sendFail'), err);
      // 失败回滚乐观消息，避免残留未入库的临时气泡；输入框恢复原文，不用重打
      setMessages((prev) => prev.filter((m) => m.tempKey !== tempKey));
      setInput((prev) => (prev.trim() ? prev : text));
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const content = item.body ?? item.content ?? item.text ?? '';
    const isMine = item.role === 'user' || (!!myId && item.sender_id === myId);
    return (
      <View style={[styles.msgRow, isMine ? styles.mineRow : styles.otherRow]}>
        <View style={[styles.bubble, isMine ? styles.mineBubble : styles.otherBubble]}>
          <Text style={[styles.msgText, isMine && styles.mineText]}>{content}</Text>
          {item.created_at ? (
            <Text style={[styles.msgTime, isMine && styles.mineTime]}>
              {fmtDateTime(item.created_at)}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
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
      {loadError && messages.length === 0 ? (
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <EmptyState
            icon="cloud-offline-outline"
            title={t('loadFailed')}
            sub={t('chat.loadMsgFailSub')}
            actionLabel={t('retry')}
            onAction={() => {
              setLoading(true);
              load();
            }}
          />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item, index) => item.id ?? item.tempKey ?? String(index)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title={t('chat.msgEmptyTitle')}
              sub={t('chat.msgEmptySub')}
            />
          }
        />
      )}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={styles.input}
          placeholder={title ? t('chat.replyPlaceholder', { title }) : t('chat.inputPlaceholder')}
          value={input}
          onChangeText={setInput}
          placeholderTextColor={colors.ink3}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.btnDisabled]}
          onPress={handleSend}
          disabled={sending}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={t('chat.sendA11y')}
        >
          {sending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.sendText}>{t('chat.send')}</Text>
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
  msgTime: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 6, textAlign: 'right', lineHeight: colors.lineHeight.tight},
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
    height: 44,
    minWidth: 64,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  sendText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
});