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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/services/api';
import { tokenStorage } from '@/lib/storage';
import { useI18n, LANG_LABELS, LANGS, type AppLang } from '@/i18n';
import { notifyError } from '@/utils/feedback';
import { useOtp, COUNTRY_CODES, DEFAULT_COUNTRY } from '@/hooks/useOtp';
import { useOAuth } from '@/hooks/useOAuth';
import OAuthButtons from '@/components/OAuthButtons';
import OAuthMockModal from '@/components/OAuthMockModal';
import colors from '@/theme/colors';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [langVisible, setLangVisible] = useState(false);
  // 手机号登录
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [countryVisible, setCountryVisible] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const { sending, secondsLeft, sendOtp } = useOtp();
  const {
    oauthLoading,
    loginWithGoogle,
    loginWithApple,
    mockVisible,
    mockProvider,
    mockEmail,
    setMockEmail,
    submitMock,
    closeMock,
    mockBusy,
  } = useOAuth();
  // 记住我：勾选则持久化 token，取消勾选则本次登录仅在内存态生效
  const [remember, setRemember] = useState(true);
  const { t, lang, setLang } = useI18n();
  const navigation = useNavigation<any>();

  const handleSendCode = async () => {
    if (!phone.trim()) {
      notifyError('提示', new Error('请输入手机号'));
      return;
    }
    const dev = await sendOtp(`${country.value}${phone.trim()}`, 'sms');
    if (dev) setCode(dev);
  };

  const handleLogin = async () => {
    let ok = true;
    if (mode === 'email') {
      if (!email.trim()) {
        setEmailError('请输入邮箱');
        ok = false;
      } else {
        setEmailError('');
      }
      if (!password) {
        setPasswordError('请输入密码');
        ok = false;
      } else {
        setPasswordError('');
      }
    } else {
      if (!phone.trim()) {
        notifyError('提示', new Error('请输入手机号'));
        ok = false;
      }
      if (!code.trim()) {
        notifyError('提示', new Error('请输入验证码'));
        ok = false;
      }
    }
    if (!ok) return;
    setLoading(true);
    try {
      const { data } =
        mode === 'email'
          ? await authApi.login(email.trim(), password)
          : await authApi.loginByOtp(`${country.value}${phone.trim()}`, code.trim());
      const token: string | undefined = data?.token ?? data?.access_token;
      const user = data?.user ?? data?.data?.user;
      if (!token || !user) {
        throw new Error('登录响应格式异常');
      }
      if (remember) {
        await tokenStorage.set(token);
      } else {
        await tokenStorage.remove();
      }
      useAuthStore.setState({ user, token, isAuthenticated: true });
    } catch (err: any) {
      setLoading(false);
      notifyError('登录失败', err);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 右上角语言切换按钮 */}
      <TouchableOpacity
        style={[styles.langBtn, { top: insets.top + 10 }]}
        onPress={() => setLangVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="选择语言"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="globe-outline" size={18} color={colors.ink2} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 80 + insets.top, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
          <Text style={styles.brandSubtitle}>{t('login.tagline')}</Text>
          <Text style={styles.brandDesc}>{t('login.taglineSub')}</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.form}>
            {/* 欢迎区（对齐原型右卡标题） */}
            <Text style={styles.cardTitle}>{t('login.welcome')}</Text>
            <Text style={styles.cardSubtitle}>{t('login.subtitle')}</Text>

            {/* Google / Apple 一键登录（独立社交区，含「或」分隔线） */}
            <OAuthButtons loading={oauthLoading} onGoogle={loginWithGoogle} onApple={loginWithApple} />

            {/* 胶囊分段 Tab：邮箱登录 / 手机号登录 */}
            <View style={styles.segContainer}>
              {(
                [
                  ['email', 'mail-outline', '邮箱登录'],
                  ['phone', 'phone-portrait-outline', '手机号登录'],
                ] as const
              ).map(([m, icon, label]) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.segItem, mode === m && styles.segItemActive]}
                  onPress={() => setMode(m)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === m }}
                  accessibilityLabel={label}
                >
                  <Ionicons name={icon} size={17} color={mode === m ? colors.primary : colors.ink3} />
                  <Text style={[styles.segText, mode === m && styles.segTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === 'email' ? (
              <>
            <Text style={styles.label}>{t('login.email')}</Text>
            <TextInput
              style={[styles.input, (email.length > 0 || emailError) && styles.inputFocused, !!emailError && styles.inputError]}
              placeholder="请输入邮箱"
              placeholderTextColor={colors.ink3}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (emailError) setEmailError('');
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            {!!emailError && <Text style={styles.fieldError}>{emailError}</Text>}
            <Text style={styles.label}>{t('login.password')}</Text>
            <TextInput
              style={[styles.input, (password.length > 0 || passwordError) && styles.inputFocused, !!passwordError && styles.inputError]}
              placeholder="请输入密码"
              placeholderTextColor={colors.ink3}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (passwordError) setPasswordError('');
              }}
              secureTextEntry
              textContentType="password"
            />
            {!!passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
              </>
            ) : (
              <>
                <Text style={styles.label}>国家 / 地区</Text>
                <TouchableOpacity
                  style={styles.countryField}
                  onPress={() => setCountryVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="选择国家码"
                >
                  <Text style={styles.countryText}>{country.label}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.ink3} />
                </TouchableOpacity>

                <Text style={styles.label}>手机号</Text>
                <TextInput
                  style={styles.input}
                  placeholder="请输入手机号"
                  placeholderTextColor={colors.ink3}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  accessibilityLabel="手机号"
                />

                <Text style={styles.label}>验证码</Text>
                <View style={styles.codeRow}>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="输入验证码"
                    placeholderTextColor={colors.ink3}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    accessibilityLabel="验证码"
                  />
                  <TouchableOpacity
                    style={[styles.codeBtn, (secondsLeft > 0 || sending) && styles.codeBtnDisabled]}
                    onPress={handleSendCode}
                    disabled={secondsLeft > 0 || sending}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={secondsLeft > 0 ? `重新获取，${secondsLeft}秒` : '获取验证码'}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.codeBtnText}>
                        {secondsLeft > 0 ? `${secondsLeft}s` : '获取验证码'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
            {/* 记住我 / 忘记密码 */}
            <View style={styles.helperRow}>
              <TouchableOpacity
                style={styles.rememberRow}
                activeOpacity={0.8}
                onPress={() => setRemember((v) => !v)}
              >
                <Ionicons
                  name={remember ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={remember ? colors.primary : colors.ink3}
                />
                <Text style={styles.rememberText}>{t('login.remember')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() =>
                  Alert.alert('忘记密码', '请联系管理员在「账号管理」中重置您的登录密码。')
                }
              >
                <Text style={styles.forgotText}>{t('login.forgot')}</Text>
              </TouchableOpacity>
            </View>
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

        {/* 品牌特性（对齐原型左侧品牌区特性列表） */}
        <View style={styles.features}>
          {(['login.feature1', 'login.feature2', 'login.feature3', 'login.feature4'] as const).map(
            (key) => (
              <View key={key} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={styles.featureText}>{t(key)}</Text>
              </View>
            ),
          )}
        </View>

        {/* 页脚：去注册 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>还没有账号？</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="去注册"
          >
            <Text style={styles.footerLink}>去注册</Text>
          </TouchableOpacity>
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

      {/* 国家码选择弹层 */}
      <Modal
        visible={countryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryVisible(false)}
      >
        <TouchableOpacity
          style={styles.langOverlay}
          activeOpacity={1}
          onPress={() => setCountryVisible(false)}
        >
          <View style={styles.langSheet}>
            <Text style={styles.langSheetTitle}>选择国家 / 地区</Text>
            {COUNTRY_CODES.map((c) => {
              const active = c.value === country.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={styles.langOption}
                  onPress={() => {
                    setCountry(c);
                    setCountryVisible(false);
                  }}
                >
                  <Text style={[styles.langOptionText, active && styles.langOptionActive]}>
                    {c.label}
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

      {/* OAuth mock 邮箱弹窗 */}
      <OAuthMockModal
        visible={mockVisible}
        provider={mockProvider}
        email={mockEmail}
        busy={mockBusy}
        onChangeEmail={setMockEmail}
        onCancel={closeMock}
        onSubmit={submitMock}
      />
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
    color: colors.ink2,
    textAlign: 'center',
  },
  brandDesc: {
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
    marginTop: 6,
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
  /* 卡片欢迎区 */
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.ink3,
    marginTop: 6,
    marginBottom: 20,
  },
  /* 记住我 / 忘记密码 */
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  rememberText: { fontSize: 13, color: colors.ink2 },
  forgotText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  /* 胶囊分段控件（邮箱登录 / 手机号登录） */
  segContainer: {
    flexDirection: 'row',
    backgroundColor: colors.fieldFill,
    borderRadius: colors.radius.full,
    padding: 4,
    gap: 4,
    marginTop: 4,
    marginBottom: 20,
  },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: colors.radius.full,
  },
  segItemActive: { backgroundColor: colors.surface, ...colors.shadow.sm },
  segText: { fontSize: 14, color: colors.ink3, fontWeight: '600' },
  segTextActive: { color: colors.primary, fontWeight: '700' },
  /* 手机号登录 */
  countryField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 18,
  },
  countryText: { fontSize: 15, color: colors.ink },
  codeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  codeInput: { flex: 1, marginBottom: 0, paddingVertical: 14 },
  codeBtn: {
    minWidth: 108,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 12,
  },
  codeBtnDisabled: { opacity: 0.5 },
  codeBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  /* 品牌特性 */
  features: {
    marginTop: 24,
    gap: 10,
    alignItems: 'flex-start',
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, color: colors.ink2 },
  /* 页脚 */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 20,
  },
  footerText: { fontSize: 13, color: colors.ink3 },
  footerLink: { fontSize: 13, color: colors.primary, fontWeight: '600' },
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
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    fontSize: 12,
    color: colors.error,
    marginTop: -10,
    marginBottom: 12,
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
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.sm,
  },
  langOverlay: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.45),
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
