import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
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
import { notify, notifyError } from '@/utils/feedback';
import {
  useOtp,
  useDefaultCountry,
  isValidPhone,
  phoneLengthHint,
  phoneToE164,
  displayCountry,
  searchCountries,
} from '@/hooks/useOtp';
import { useOAuth } from '@/hooks/useOAuth';
import OAuthButtons from '@/components/OAuthButtons';
import OAuthMockModal from '@/components/OAuthMockModal';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

const BRAND_LOGO = require('../../assets/haofang-logo.png');

type Method = 'phone' | 'email';
type Stage = 'choose' | 'form';
type Role = 'tenant' | 'owner';
type FocusField =
  | 'country'
  | 'phone'
  | 'code'
  | 'email'
  | 'password'
  | 'confirm'
  | 'name';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
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
  const { t, lang } = useI18n();

  // Reddit 式分步：choose = 方式选择屏，form = 对应表单屏
  const [stage, setStage] = useState<Stage>('choose');
  const [method, setMethod] = useState<Method>('phone');
  // 手机号模式
  const { country, selectCountry } = useDefaultCountry();
  const [countryVisible, setCountryVisible] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  // 邮箱模式
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // 通用
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('tenant');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<FocusField | 'agree' | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<FocusField | null>(null);
  const [agreed, setAgreed] = useState(false);

  const handleSendCode = async () => {
    if (!phone.trim()) {
      setError(t('login.phoneRequired'));
      return;
    }
    if (!isValidPhone(country, phone.trim())) {
      setError(t('login.phoneInvalid', { n: phoneLengthHint(country) }));
      return;
    }
    setError('');
    const dev = await sendOtp(phoneToE164(country, phone.trim()), 'sms');
    if (dev) setCode(dev);
  };

  const handleRegister = async () => {
    let ok = true;
    let msg = '';
    let field: FocusField | 'agree' | null = null;
    if (method === 'phone' && !phone.trim()) {
      msg = t('login.phoneRequired');
      field = 'phone';
      ok = false;
    } else if (method === 'phone' && !isValidPhone(country, phone.trim())) {
      msg = t('login.phoneInvalid', { n: phoneLengthHint(country) });
      field = 'phone';
      ok = false;
    }
    if (method === 'email' && !email.trim()) {
      msg = t('login.emailRequired');
      field = 'email';
      ok = false;
    }
    if (!code && method === 'phone') {
      msg = t('login.codeRequired');
      field = 'code';
      ok = false;
    }
    if (method === 'email' && !password) {
      msg = t('login.passwordRequired');
      field = 'password';
      ok = false;
    }
    if (method === 'email' && password !== confirm) {
      msg = t('register.passwordMismatch');
      field = 'confirm';
      ok = false;
    }
    if (!name.trim()) {
      msg = t('register.nameRequired');
      field = 'name';
      ok = false;
    }
    if (ok && !agreed) {
      msg = t('legal.mustAgree');
      field = 'agree';
      ok = false;
    }
    if (!ok) {
      // 单一提示：字段描边 + 一条行内错误，不再同时弹 toast 重复一遍
      setError(msg);
      setErrorField(field);
      return;
    }
    setError('');
    setErrorField(null);
    setLoading(true);
    try {
      const payload =
        method === 'phone'
          ? { phone: phoneToE164(country, phone.trim()), code: code.trim(), full_name: name.trim(), role }
          : { email: email.trim(), password, full_name: name.trim(), role };
      const { data } = await authApi.register(payload);
      const token: string | undefined = data?.token ?? data?.access_token;
      const user = data?.user ?? data?.data?.user;
      if (!token || !user) {
        throw new Error(t('register.badResponse'));
      }
      await tokenStorage.set(token);
      useAuthStore.setState({ user, token, isAuthenticated: true });
      // 注册成功轻量欢迎：不拦截导航，只在角色首页之上浮一条 toast
      notify(t('register.welcomeTitle'), t('register.welcomeBody', { name: name.trim() }));
    } catch (err: any) {
      setLoading(false);
      notifyError(t('register.failedTitle'), err);
    }
  };

  const focusedStyle = (f: FocusField) => [
    styles.input,
    focused === f ? styles.inputFocused : undefined,
    errorField === f ? styles.inputError : undefined,
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
    >
      {/* 左上角关闭：与登录页一致，任何阶段都能直接退出，不强制注册 */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + 6 }]}
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Ionicons name="close" size={22} color={colors.ink2} />
      </TouchableOpacity>
      {stage === 'choose' ? (
        /* ---------------- 方式选择屏 ---------------- */
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: 80 + insets.top, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 品牌 logo（保留图形，不含营销文案） */}
          <Image source={BRAND_LOGO} style={styles.brandLogo} accessibilityLabel="HaoFang.World" />

          {/* 一列整宽白色胶囊：Google / Apple / 手机号 / 邮箱 */}
          <OAuthButtons
            loading={oauthLoading}
            mode="register"
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

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('register.hasAccount')}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Text style={styles.footerLink}>{t('register.goLogin')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* ---------------- 对应表单屏 ---------------- */
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: 16 + insets.top, paddingBottom: insets.bottom + 24 },
          ]}
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
            <Text style={styles.formTitle}>{t('register.createAccount')}</Text>
          </View>

          {method === 'phone' ? (
            <>
              {/* 国家码 + 手机号 */}
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.countryField,
                  focused === 'country' ? styles.inputFocused : undefined,
                ]}
                onPress={() => setCountryVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('login.selectCountryCode')}
              >
                <Text style={styles.countryText}>{displayCountry(country, lang)}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.ink3} />
              </TouchableOpacity>

              <TextInput
                style={focusedStyle('phone')}
                placeholder={t('login.phoneLabel')}
                placeholderTextColor={colors.ink3}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                accessibilityLabel={t('login.phoneLabel')}
              />

              {/* 验证码 输入 + 获取验证码文字按钮 */}
              <View style={styles.codeRow}>
                <TextInput
                  style={[
                    styles.codeInput,
                    focused === 'code' ? styles.inputFocused : undefined,
                    errorField === 'code' ? styles.inputError : undefined,
                  ]}
                  placeholder={t('login.codeLabel')}
                  placeholderTextColor={colors.ink3}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  onFocus={() => setFocused('code')}
                  onBlur={() => setFocused(null)}
                  accessibilityLabel={t('login.codeLabel')}
                />
                <TouchableOpacity
                  style={styles.codeBtn}
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
                    <Text style={[styles.codeBtnText, secondsLeft > 0 && styles.codeBtnTextMuted]}>
                      {secondsLeft > 0 ? `${secondsLeft}s` : t('login.getCode')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TextInput
                style={focusedStyle('email')}
                placeholder={t('login.email')}
                placeholderTextColor={colors.ink3}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                accessibilityLabel={t('login.email')}
              />
              <TextInput
                style={focusedStyle('password')}
                placeholder={t('login.password')}
                placeholderTextColor={colors.ink3}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                accessibilityLabel={t('login.password')}
              />
              {/* 密码规则常驻提示：占位文案，正式规则待法务/产品确认 */}
              <Text style={styles.fieldHint}>{t('register.pwdRule')}</Text>
              <TextInput
                style={focusedStyle('confirm')}
                placeholder={t('register.confirmPassword')}
                placeholderTextColor={colors.ink3}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
                accessibilityLabel={t('register.confirmPassword')}
              />
            </>
          )}

          <TextInput
            style={focusedStyle('name')}
            placeholder={t('register.name')}
            placeholderTextColor={colors.ink3}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            accessibilityLabel={t('register.name')}
          />

          {/* 角色 两个紧凑胶囊 */}
          <View style={styles.roleRow}>
            {(
              [
                ['tenant', t('register.tenant'), t('register.tenantHint')],
                ['owner', t('register.owner'), t('register.ownerHint')],
              ] as [Role, string, string][]
            ).map(([r, label, hint]) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleItem, role === r && styles.roleItemActive]}
                onPress={() => setRole(r)}
                accessibilityRole="button"
                accessibilityState={{ selected: role === r }}
                accessibilityLabel={`${label} · ${hint}`}
              >
                <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{label}</Text>
                <Text style={[styles.roleHint, role === r && styles.roleHintActive]}>{hint}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 协议勾选：未勾选不阻止填写，提交时提示 */}
          <View style={styles.consentRow}>
            <TouchableOpacity
              onPress={() => setAgreed((v) => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              accessibilityLabel={t('legal.agreePrefix')}
            >
              <Ionicons
                name={agreed ? 'checkbox' : 'square-outline'}
                size={20}
                color={agreed ? colors.primary : colors.ink3}
              />
            </TouchableOpacity>
            <Text style={styles.consentText}>
              {t('legal.agreePrefix')}
              <Text
                style={styles.consentLink}
                onPress={() => navigation.navigate('Agreement', { type: 'terms' })}
              >
                {t('legal.termsTitle')}
              </Text>
              {t('legal.and')}
              <Text
                style={styles.consentLink}
                onPress={() => navigation.navigate('Agreement', { type: 'privacy' })}
              >
                {t('legal.privacyTitle')}
              </Text>
            </Text>
          </View>

          {!!error && <Text style={styles.fieldError}>{error}</Text>}

          {/* 全宽胶囊主按钮 */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>{t('register.submit')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('register.hasAccount')}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Text style={styles.footerLink}>{t('register.goLogin')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* 国家码选择弹层 */}
      <Modal
        visible={countryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setCountryVisible(false)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('login.selectCountry')}</Text>
            <TextInput
              style={styles.countrySearch}
              placeholder={t('login.searchCountry')}
              placeholderTextColor={colors.ink3}
              value={countryQuery}
              onChangeText={setCountryQuery}
              autoCorrect={false}
              accessibilityLabel={t('login.searchCountry')}
            />
            <ScrollView style={styles.countryList} keyboardShouldPersistTaps="handled">
              {searchCountries(countryQuery).map((c) => {
                const active = c.iso2 === country.iso2;
                return (
                  <TouchableOpacity
                    key={c.iso2}
                    style={styles.option}
                    onPress={() => {
                      selectCountry(c);
                      setCountryVisible(false);
                      setCountryQuery('');
                    }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {displayCountry(c, lang)}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
  container: { flex: 1, backgroundColor: colors.background },
  closeBtn: {
    position: 'absolute',
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
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
    marginBottom: 22,
  },
  formBack: {
    position: 'absolute',
    left: -8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  input: {
    backgroundColor: colors.fieldFill,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 15,
    marginBottom: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.fieldFill,
  },
  inputFocused: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  countryField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryText: { fontSize: 15, color: colors.ink },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  codeInput: {
    flex: 1,
    backgroundColor: colors.fieldFill,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.fieldFill,
  },
  codeBtn: {
    minWidth: 92,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  codeBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  codeBtnTextMuted: { opacity: 0.5 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  roleItem: {
    flex: 1,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 18,
    backgroundColor: colors.fieldFill,
  },
  roleItemActive: { backgroundColor: colors.sidebarActive },
  roleText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
  roleTextActive: { color: colors.primary },
  roleHint: { fontSize: 11, lineHeight: 15, color: colors.ink3, textAlign: 'center' },
  roleHintActive: { color: colors.primary },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
    paddingRight: 4,
  },
  consentText: { flex: 1, fontSize: 12, color: colors.ink3, lineHeight: 20 },
  consentLink: { color: colors.primary },
  fieldError: { fontSize: 12, color: colors.error, marginBottom: 12 },
  fieldHint: { fontSize: 12, color: colors.ink3, marginTop: -6, marginBottom: 12, paddingHorizontal: 4 },
  inputError: { borderColor: colors.error },
  button: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    ...colors.shadow.primary,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 22,
  },
  footerText: { fontSize: 14, color: colors.ink3 },
  footerLink: { fontSize: 14, color: colors.primary, fontWeight: '700' },
  overlay: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.45),
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: '86%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.lg,
  },
  countrySearch: {
    height: 40,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
  },
  countryList: {
    maxHeight: 360,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  optionText: { fontSize: 15, color: colors.ink2 },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
});