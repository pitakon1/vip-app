import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/services/api';
import { tokenStorage } from '@/lib/storage';
import { useI18n, LANG_LABELS, LANGS, type AppLang } from '@/i18n';
import colors from '@/theme/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [langVisible, setLangVisible] = useState(false);
  const { t, lang, setLang } = useI18n();
  const navigation = useNavigation<any>();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('提示', '请输入邮箱和密码');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login(email.trim(), password);
      const token: string | undefined = data?.token ?? data?.access_token;
      const user = data?.user ?? data?.data?.user;
      if (!token || !user) {
        throw new Error('登录响应格式异常');
      }
      await tokenStorage.set(token);
      useAuthStore.setState({ user, token, isAuthenticated: true });
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || '邮箱或密码错误';
      Alert.alert('登录失败', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 右上角语言切换按钮 */}
      <TouchableOpacity
        style={styles.langBtn}
        onPress={() => setLangVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="globe-outline" size={18} color={colors.ink2} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Image
            source={require('../../assets/haofang-logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="logo"
          />
          <Text style={styles.brandTitle}>
            <Text style={styles.brandTitleAccent}>VIP</Text> Rental
          </Text>
          <Text style={styles.brandSubtitle}>房地产租赁管理系统</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.form}>
            <Text style={styles.label}>{t('login.email')}</Text>
            <TextInput
              style={[styles.input, email.length > 0 && styles.inputFocused]}
              placeholder="请输入邮箱"
              placeholderTextColor={colors.ink3}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              onFocus={() => {}}
            />
            <Text style={styles.label}>{t('login.password')}</Text>
            <TextInput
              style={[styles.input, password.length > 0 && styles.inputFocused]}
              placeholder="请输入密码"
              placeholderTextColor={colors.ink3}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.buttonText}>{t('login.submit')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 测试面板入口 */}
        <TouchableOpacity
          style={styles.testEntry}
          onPress={() => navigation.navigate('Test')}
        >
          <Text style={styles.testEntryText}>测试调试面板</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 语言选择弹层 */}
      <Modal
        visible={langVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangVisible(false)}
      >
        <TouchableOpacity
          style={styles.langOverlay}
          activeOpacity={1}
          onPress={() => setLangVisible(false)}
        >
          <View style={styles.langSheet}>
            <Text style={styles.langSheetTitle}>选择语言</Text>
            {LANGS.map((id: AppLang) => {
              const active = lang === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={styles.langOption}
                  onPress={() => {
                    setLang(id);
                    setLangVisible(false);
                  }}
                >
                  <Text style={[styles.langOptionText, active && styles.langOptionActive]}>
                    {LANG_LABELS[id]}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: 24,
    justifyContent: 'center',
    flexGrow: 1,
    paddingTop: 80,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 110,
    height: 110,
    marginBottom: 16,
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  brandTitleAccent: {
    color: colors.primary,
  },
  brandSubtitle: {
    fontSize: 14,
    color: colors.ink3,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xxl,
    padding: 28,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 18,
    color: colors.text,
    fontWeight: '400',
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    ...colors.shadow.primary,
  },
  buttonPressed: {
    backgroundColor: colors.primaryHover,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  testEntry: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 16,
  },
  testEntryText: {
    fontSize: 12,
    color: colors.ink3,
  },
  langBtn: {
    position: 'absolute',
    top: 50,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.sm,
  },
  langOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  langSheet: {
    width: '72%',
    maxWidth: 280,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.lg,
  },
  langSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 12,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  langOptionText: {
    fontSize: 15,
    color: colors.ink2,
  },
  langOptionActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
