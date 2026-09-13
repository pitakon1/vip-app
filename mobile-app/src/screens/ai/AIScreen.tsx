import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import colors from '@/theme/colors';
import { aiApi } from '@/services/api';

interface ChatMsg {
  id?: string;
  text?: string;
  role: 'user' | 'assistant';
}

interface HealthInfo {
  status?: string;
  configured?: boolean;
  message?: string;
  provider?: string;
}

export default function AIScreen() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const checkHealth = async () => {
    try {
      const res = await aiApi.health();
      const data = res.data;
      setHealth((data as HealthInfo) ?? null);
    } catch (err: any) {
      setHealth({
        status: 'unknown',
        configured: false,
        message: err?.response?.data?.message || '无法获取 AI 服务状态',
      });
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    try {
      const res = await aiApi.chat(messages.map((m) => ({ role: m.role, content: m.text })).concat([{ role: 'user', content: text }]));
      const data = res.data;
      const reply =
        typeof data === 'string'
          ? data
          : (data as any)?.reply ?? (data as any)?.content ?? (data as any)?.message ?? JSON.stringify(data);
      setMessages((prev) => [...prev, { role: 'assistant', text: String(reply) }]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'AI 服务暂不可用';
      // 未配置密钥等预留提示
      setMessages((prev) => [...prev, { role: 'assistant', text: msg }]);
      checkHealth();
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: ChatMsg }) => (
    <View style={[styles.msgRow, item.role === 'user' ? styles.userRow : styles.aiRow]}>
      <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.msgText, item.role === 'user' && styles.userText]}>{item.text ?? ''}</Text>
      </View>
    </View>
  );

  const configured = health?.configured;
  const statusLabel = configured === false ? '未配置密钥' : health?.status ?? '未知';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.statusBar}>
        <View style={[styles.dot, configured === false ? styles.dotWarn : styles.dotOk]} />
        <Text style={styles.statusText}>
          AI 服务{statusLabel}
          {health?.message ? `：${health.message}` : ''}
        </Text>
      </View>
      <FlatList
        data={messages}
        keyExtractor={(item, index) => String(index)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>在下方输入问题，与 VIP 智能助手对话</Text>
        }
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="输入问题..."
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
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  dotOk: { backgroundColor: colors.success },
  dotWarn: { backgroundColor: colors.warning },
  statusText: { fontSize: 13, color: colors.text, flex: 1 },
  list: { padding: 12, flexGrow: 1 },
  msgRow: { marginBottom: 10, flexDirection: 'row' },
  userRow: { justifyContent: 'flex-end' },
  aiRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  userBubble: { backgroundColor: colors.primary },
  aiBubble: { backgroundColor: colors.surface },
  msgText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  userText: { color: colors.primaryForeground },
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