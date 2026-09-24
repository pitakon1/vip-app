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
  Modal,
  Image,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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

const BRAND_LOGO = require('../../assets/haofang-logo.png');

type Stage = 'choose' | 'form';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  // Reddit 式分步：choose = 方式选择屏，form = 对应表单屏
  const [stage, setStage] = useState<Stage>('choose');
  const [method, setMethod] = useState<'email' | 'phone'>('email');
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
      notifyError(t('common.hint'), new Error(t('login.phoneRequired')));
      return;
    }
    const dev = await sendOtp(`${country.value}${phone.trim()}`, 'sms');
    if (dev) setCode(dev);
  };

  const handleLogin = async () => {
    let ok = true;
    if (method === 'email') {
      if (!email.trim()) {
        setEmailError(t('login.emailRequired'));
        ok = false;
      } else {
        setEmailError('');
      }
      if (!password) {
        setPasswordError(t('login.passwordRequired'));
        ok = false;
      } else {
        setPasswordError('');
      }
    } else {
      if (!phone.trim()) {
        notifyError(t('common.hint'), new Error(t('login.phoneRequired')));
        ok = false;
      }
      if (!code.trim()) {
        notifyError(t('common.hint'), new Error(t('login.codeRequired')));
        ok = false;
      }
    }
    if (!ok) return;
    setLoading(true);
    try {
      const { data } =
        method === 'email'
          ? await authApi.login(email.trim(), password)
          : await authApi.loginByOtp(`${country.value}${phone.trim()}`, code.trim());
      const token: string | undefined = data?.token ?? data?.access_token;
      const user = data?.user ?? data?.data?.user;
      if (!token || !user) {
        throw new Error(t('login.badResponse'));
      }
      if (remember) {
        await tokenStorage.set(token);
      } else {
        await tokenStorage.remove();
      }
      useAuthStore.setState({ user, token, isAuthenticated: true });
    } catch (err: any) {
      setLoading(false);
      notifyError(t('login.failedTitle'), err);
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
        accessibilityLabel={t('login.selectLanguage')}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="globe-outline" size={18} color={colors.ink2} />
      </TouchableOpacity>

      {stage === 'choose' ? (
        /* ---------------- 方式选择屏 ---------------- */
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: 80 + insets.top, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 品牌 logo（保留图形，不含营销文案） */}
          <Image source={BRAND_LOGO} style={styles.brandLogo} accessibilityLabel="HaoFang.World" />

          {/* 一列整宽白色胶囊：Google / Apple / 手机号 / 邮箱 */}
          <OAuthButtons
            loading={oauthLoading}
            onGoogle={loginWithGoogle}
            onApple={loginWithApple}
            onPhone={() => {
              setMethod('phone');
              setStage('form');
            }}
            onEmail={() => {
              setMethod('email');
              setStage('form');
            }}
          />

          {/* 页脚：去注册 */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('login.noAccount')}</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('login.goRegister')}
            >
              <Text style={styles.footerLink}>{t('login.goRegister')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* ---------------- 对应表单屏 ---------------- */
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: 16 + insets.top, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formHeader}>
            <TouchableOpacity
              style={styles.formBack}
              onPress={() => setStage('choose')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('login.backToMethods')}
            >
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.formTitle}>{t('login.welcome')}</Text>
          </View>

          {method === 'email' ? (
            <>
              <Text style={styles.label}>{t('login.email')}</Text>
              <TextInput
                style={[styles.input, (email.length > 0 || emailError) && styles.inputFocused, !!emailError && styles.inputError]}
                placeholder={t('login.emailRequired')}
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
                placeholder={t('login.passwordRequired')}
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
              <Text style={styles.label}>{t('login.countryLabel')}</Text>
              <TouchableOpacity
                style={styles.countryField}
                onPress={() => setCountryVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('login.selectCountryCode')}
              >
                <Text style={styles.countryText}>{country.label}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.ink3} />
              </TouchableOpacity>

              <Text style={styles.label}>{t('login.phoneLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('login.phoneRequired')}
                placeholderTextColor={colors.ink3}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                accessibilityLabel={t('login.phoneLabel')}
              />

              <Text style={styles.label}>{t('login.codeLabel')}</Text>
              <View style={styles.codeRow}>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder={t('login.codePlaceholder')}
                  placeholderTextColor={colors.ink3}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  accessibilityLabel={t('login.codeLabel')}
                />
                <TouchableOpacity
                  style={[styles.codeBtn, (secondsLeft > 0 || sending) && styles.codeBtnDisabled]}
                  onPress={handleSendCode}
                  disabled={secondsLeft > 0 || sending}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    secondsLeft > 0 ? t('login.resendIn', { n: secondsLeft }) : t('login.getCode')
                  }
                >
                  {sending ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.codeBtnText}>
                      {secondsLeft > 0 ? `${secondsLeft}s` : t('login.getCode')}
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
                Alert.alert(t('login.forgotTitle'), t('login.forgotMsg'))
              }
            >
              <Text style={styles.forgotText}>{t('login.forgot')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.submitBtnText}>{t('login.submit')}</Text>
            )}
          </TouchableOpacity>

          {/* 页脚：去注册 */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('login.noAccount')}</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('login.goRegister')}
            >
              <Text style={styles.footerLink}>{t('login.goRegister')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

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
            <Text style={styles.langSheetTitle}>{t('login.selectLanguage')}</Text>
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
            <Text style={styles.langSheetTitle}>{t('login.selectCountry')}</Text>
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
  brandLogo: {
    width: 168,
    height: 168,
    alignSelf: 'center',
    resizeMode: 'contain',
    marginBottom: 20,
  },
  // 表单屏头部：返回 + 标题
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  formBack: {
    position: 'absolute',
    left: -6,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
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
  /* 页脚 */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 22,
  },
  footerText: { fontSize: 14, color: colors.ink3 },
  footerLink: { fontSize: 14, color: colors.primary, fontWeight: '700' },
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
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    ...colors.shadow.primary,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
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