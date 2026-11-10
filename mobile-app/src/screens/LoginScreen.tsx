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
  Linking,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth';
import { authApi, companyApi } from '@/services/api';
import { refreshTokenStorage, tokenStorage } from '@/lib/storage';
import { useI18n, LANG_LABELS, LANGS, type AppLang } from '@/i18n';
import { notifyError } from '@/utils/feedback';
import { useOtp, COUNTRY_CODES, useDefaultCountry, isValidPhone, phoneLengthHint } from '@/hooks/useOtp';
import { useOAuth } from '@/hooks/useOAuth';
import OAuthButtons from '@/components/OAuthButtons';
import OAuthMockModal from '@/components/OAuthMockModal';
import colors from '@/theme/colors';

const BRAND_LOGO = require('../../assets/haofang-logo.png');

/** 邮箱格式：只做「有本地部分 + @ + 域名后缀」的轻校验，最终以后端为准 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [pwdVisible, setPwdVisible] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [langVisible, setLangVisible] = useState(false);
  // 手机号登录
  const { country, selectCountry } = useDefaultCountry();
  const [countryVisible, setCountryVisible] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  // 忘记密码：走客服（电话/邮箱），不做自助重置
  const [forgotOpen, setForgotOpen] = useState(false);
  const [supportInfo, setSupportInfo] = useState<{ phone: string; email: string } | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
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

  /** 手机号字段校验：空值与位数/纯数字统一回填到字段下方 */
  const checkPhone = (): boolean => {
    if (!phone.trim()) {
      setPhoneError(t('login.phoneRequired'));
      return false;
    }
    if (!isValidPhone(country.value, phone.trim())) {
      setPhoneError(t('login.phoneInvalid', { n: phoneLengthHint(country.value) }));
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleSendCode = async () => {
    if (!checkPhone()) return;
    const dev = await sendOtp(`${country.value}${phone.trim()}`, 'sms');
    if (dev) setCode(dev);
  };

  /** 忘记密码：拉取公司客服联系方式（电话/邮箱），没有自助重置流程 */
  const openForgot = async () => {
    setForgotOpen(true);
    if (supportInfo || supportLoading) return;
    setSupportLoading(true);
    try {
      const { data } = await companyApi.info();
      const d = (data as any)?.data ?? data ?? {};
      setSupportInfo({
        phone: String(d.phone ?? d.hotline ?? '').trim(),
        email: String(d.email ?? '').trim(),
      });
    } catch {
      setSupportInfo({ phone: '', email: '' });
    } finally {
      setSupportLoading(false);
    }
  };

  const contactSupport = (url: string) => {
    setForgotOpen(false);
    void Linking.openURL(url).catch(() =>
      notifyError(t('actionFailed'), new Error(t('login.forgotNoChannel'))),
    );
  };

  const handleLogin = async () => {
    let ok = true;
    if (method === 'email') {
      if (!email.trim()) {
        setEmailError(t('login.emailRequired'));
        ok = false;
      } else if (!EMAIL_RE.test(email.trim())) {
        setEmailError(t('login.emailInvalid'));
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
      if (!checkPhone()) ok = false;
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
      const refreshToken: string | undefined = data?.refresh_token ?? data?.data?.refresh_token;
      if (remember) {
        await tokenStorage.set(token);
        // 验证码/邮箱登录同样下发 refresh_token；不落盘会导致访问令牌
        // 过期后静默续期失败，用户被直接踢回登录页。
        if (refreshToken) {
          await refreshTokenStorage.set(refreshToken);
        }
      } else {
        await tokenStorage.remove();
        await refreshTokenStorage.remove();
      }
      useAuthStore.setState({ user, token, isAuthenticated: true });
    } catch (err: any) {
      setLoading(false);
      // 登录接口的 400/401 表示凭证错误，而不是「登录态过期」：
      // errorText 对 401 的统一文案是「登录已过期，请重新登录」，用在登录页会误导用户。
      const status = err?.response?.status;
      if (method === 'email' && (status === 400 || status === 401)) {
        // 凭证错误定位到密码字段：保留已输入内容，不再用 toast 遮挡表单
        setPasswordError(t('login.invalidCredentials'));
        return;
      }
      notifyError(t('login.failedTitle'), err);
    }
  };

  /** 登录页底部协议说明：两个可点入口，进协议页后可正常返回 */
  const legalNote = (
    <View style={styles.legalRow}>
      <Text style={styles.legalText}>{t('login.agreementPrefix')}</Text>
      <TouchableOpacity
        onPress={() => navigation.navigate('Agreement', { type: 'terms' })}
        activeOpacity={0.7}
        accessibilityRole="link"
        accessibilityLabel={t('legal.termsTitle')}
      >
        <Text style={styles.legalLink}>{t('legal.termsTitle')}</Text>
      </TouchableOpacity>
      <Text style={styles.legalText}>{t('legal.and')}</Text>
      <TouchableOpacity
        onPress={() => navigation.navigate('Agreement', { type: 'privacy' })}
        activeOpacity={0.7}
        accessibilityRole="link"
        accessibilityLabel={t('legal.privacyTitle')}
      >
        <Text style={styles.legalLink}>{t('legal.privacyTitle')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
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

      {/* 左上角关闭：从收藏/预约等入口跳来时可直接退出，不强制登录 */}
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
          contentContainerStyle={[styles.scroll, { paddingTop: 80 + insets.top, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 品牌区：图形 logo + 产品名 + 一句定位（不做营销长文） */}
          <Image source={BRAND_LOGO} style={styles.brandLogo} accessibilityLabel="HaoFang.World" />
          <Text style={styles.brandName}>HaoFang.World</Text>
          <Text style={styles.brandTagline}>{t('login.brandTagline')}</Text>

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
          <TouchableOpacity
            style={styles.footer}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Register')}
            accessibilityRole="button"
            accessibilityLabel={`${t('login.noAccount')} ${t('login.goRegister')}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.footerText}>{t('login.noAccount')}</Text>
            <Text style={styles.footerLink}>{t('login.goRegister')}</Text>
          </TouchableOpacity>
          {legalNote}
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
                placeholder={t('login.emailPlaceholder')}
                placeholderTextColor={colors.ink3}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError('');
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                onBlur={() => {
                  const v = email.trim();
                  if (v && !EMAIL_RE.test(v)) setEmailError(t('login.emailInvalid'));
                }}
              />
              {!!emailError && <Text style={styles.fieldError}>{emailError}</Text>}
              <Text style={styles.label}>{t('login.password')}</Text>
              <View
                style={[
                  styles.pwdWrap,
                  (password.length > 0 || passwordError) && styles.inputFocused,
                  !!passwordError && styles.inputError,
                ]}
              >
                <TextInput
                  style={styles.pwdInput}
                  placeholder={t('login.passwordPlaceholder')}
                  placeholderTextColor={colors.ink3}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (passwordError) setPasswordError('');
                  }}
                  secureTextEntry={!pwdVisible}
                  // 密码框必须关掉自动首字母大写/自动纠错：RN 的 autoCapitalize 默认 'sentences'，
                  // 手机键盘会把首字母自动大写、输入法还会改写字母，导致用户「明明输对了却登录失败」。
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  onBlur={() => {
                    if (!password) setPasswordError(t('login.passwordRequired'));
                  }}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setPwdVisible((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={pwdVisible ? t('login.hidePassword') : t('login.showPassword')}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons
                    name={pwdVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.ink3}
                  />
                </TouchableOpacity>
              </View>
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
                <Text style={styles.countryText}>{t(country.labelKey)}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.ink3} />
              </TouchableOpacity>

              <Text style={styles.label}>{t('login.phoneLabel')}</Text>
              <TextInput
                style={[styles.input, !!phoneError && styles.inputError]}
                placeholder={t('login.phoneRequired')}
                placeholderTextColor={colors.ink3}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (phoneError) setPhoneError('');
                }}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                accessibilityLabel={t('login.phoneLabel')}
                onBlur={() => {
                  if (phone.trim()) checkPhone();
                }}
              />
              {!!phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}

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
                      {secondsLeft > 0 ? t('login.resendCountdown', { n: secondsLeft }) : t('login.getCode')}
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
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: remember }}
              accessibilityLabel={t('login.remember')}
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
              onPress={openForgot}
              accessibilityRole="button"
              accessibilityLabel={t('login.forgot')}
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
          <TouchableOpacity
            style={styles.footer}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Register')}
            accessibilityRole="button"
            accessibilityLabel={`${t('login.noAccount')} ${t('login.goRegister')}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.footerText}>{t('login.noAccount')}</Text>
            <Text style={styles.footerLink}>{t('login.goRegister')}</Text>
          </TouchableOpacity>
          {legalNote}
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
                    selectCountry(c);
                    setCountryVisible(false);
                  }}
                >
                  <Text style={[styles.langOptionText, active && styles.langOptionActive]}>
                    {t(c.labelKey)}
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

      {/* 忘记密码：客服渠道（电话/邮箱），不做自助重置 */}
      <Modal
        visible={forgotOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotOpen(false)}
      >
        <TouchableOpacity
          style={styles.langOverlay}
          activeOpacity={1}
          onPress={() => setForgotOpen(false)}
        >
          <View style={styles.langSheet}>
            <Text style={styles.langSheetTitle}>{t('login.forgotTitle')}</Text>
            <Text style={styles.forgotHint}>{t('login.forgotChannelHint')}</Text>
            {supportLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.forgotLoading} />
            ) : (
              <>
                {supportInfo?.phone ? (
                  <TouchableOpacity
                    style={styles.supportOption}
                    activeOpacity={0.7}
                    onPress={() => contactSupport(`tel:${supportInfo.phone}`)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="call-outline" size={20} color={colors.primary} />
                    <Text style={styles.supportOptionText}>
                      {t('login.forgotCall', { phone: supportInfo.phone })}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {supportInfo?.email ? (
                  <TouchableOpacity
                    style={styles.supportOption}
                    activeOpacity={0.7}
                    onPress={() => contactSupport(`mailto:${supportInfo.email}`)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="mail-outline" size={20} color={colors.primary} />
                    <Text style={styles.supportOptionText}>
                      {t('login.forgotEmail', { email: supportInfo.email })}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {!supportInfo?.phone && !supportInfo?.email ? (
                  <Text style={styles.forgotHint}>{t('login.forgotNoChannel')}</Text>
                ) : null}
              </>
            )}
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
    marginBottom: 12,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  brandTagline: {
    fontSize: 13,
    color: colors.ink3,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  /* 密码可见性开关 */
  pwdWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    paddingLeft: 16,
    paddingRight: 4,
    marginBottom: 18,
  },
  pwdInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    fontWeight: '400',
  },
  eyeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 44,
    marginTop: 22,
  },
  footerText: { fontSize: 14, color: colors.ink3 },
  footerLink: { fontSize: 14, color: colors.primary, fontWeight: '700' },
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
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  legalText: { fontSize: 12, color: colors.ink3 },
  legalLink: { fontSize: 12, color: colors.primary },
  forgotHint: {
    fontSize: 13,
    color: colors.ink3,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  forgotLoading: { marginVertical: 18 },
  supportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  supportOptionText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
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