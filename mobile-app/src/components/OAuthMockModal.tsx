import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import colors from '@/theme/colors';
import type { MockProvider } from '@/hooks/useOAuth';

interface Props {
  visible: boolean;
  provider: MockProvider;
  email: string;
  busy: boolean;
  onChangeEmail: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

/**
 * OAuth mock 兜底弹窗：本地后端返回 enabled=false、mock=true 时，
 * 用输入的邮箱直接调后端 oauth/google|apple 完成 mock 登录。
 */
export default function OAuthMockModal({
  visible,
  provider,
  email,
  busy,
  onChangeEmail,
  onCancel,
  onSubmit,
}: Props) {
  const providerLabel = provider === 'apple' ? 'Apple' : 'Google';
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onCancel}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{providerLabel} Mock 登录</Text>
          <Text style={styles.desc}>当前未配置 {providerLabel} 授权，请输入 mock 邮箱完成登录。</Text>
          <TextInput
            style={styles.input}
            placeholder="mock 邮箱"
            placeholderTextColor={colors.ink3}
            value={email}
            onChangeText={onChangeEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoFocus
          />
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>登录</Text>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.45),
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: '82%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    paddingVertical: 24,
    paddingHorizontal: 22,
    ...colors.shadow.lg,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  desc: { fontSize: 13, color: colors.ink2, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  input: {
    backgroundColor: colors.fieldFill,
    borderWidth: 1,
    borderColor: colors.fieldFillBorder,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 15,
    color: colors.text,
    marginTop: 20,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.full,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
});