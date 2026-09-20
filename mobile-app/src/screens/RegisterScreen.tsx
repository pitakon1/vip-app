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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/services/api';
import { tokenStorage } from '@/lib/storage';
import { notifyError } from '@/utils/feedback';
import { useOtp, COUNTRY_CODES, DEFAULT_COUNTRY } from '@/hooks/useOtp';
import { useOAuth } from '@/hooks/useOAuth';
import OAuthButtons from '@/components/OAuthButtons';
import OAuthMockModal from '@/components/OAuthMockModal';
import colors from '@/theme/colors';

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

  // Reddit 式分步：choose = 方式选择屏，form = 对应表单屏
  const [stage, setStage] = useState<Stage>('choose');
  const [method, setMethod] = useState<Method>('phone');
  // 手机号模式
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [countryVisible, setCountryVisible] = useState(false);
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
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<FocusField | null>(null);

  const handleSendCode = async () => {
    if (!phone.trim()) {
      setError('请输入手机号');
      return;
    }
    setError('');
    const dev = await sendOtp(`${country.value}${phone.trim()}`, 'sms');
    if (dev) setCode(dev);
  };

  const handleRegister = async () => {
    let ok = true;
    let msg = '';
    if (method === 'phone' && !phone.trim()) {
      msg = '请输入手机号';
      ok = false;
    }
    if (method === 'email' && !email.trim()) {
      msg = '请输入邮箱';
      ok = false;
    }
    if (!code && method === 'phone') {
      msg = '请输入验证码';
      ok = false;
    }
    if (method === 'email' && !password) {
      msg = '请输入密码';
      ok = false;
    }
    if (method === 'email' && password !== confirm) {
      msg = '两次输入的密码不一致';
      ok = false;
    }
    if (!name.trim()) {
      msg = '请输入姓名';
      ok = false;
    }
    if (!ok) {
      setError(msg);
      notifyError('请检查填写内容', new Error(msg));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const payload =
        method === 'phone'
          ? { phone: `${country.value}${phone.trim()}`, code: code.trim(), full_name: name.trim(), role }
          : { email: email.trim(), password, full_name: name.trim(), role };
      const { data } = await authApi.register(payload);
      const token: string | undefined = data?.token ?? data?.access_token;
      const user = data?.user ?? data?.data?.user;
      if (!token || !user) {
        throw new Error('注册响应格式异常');
      }
      await tokenStorage.set(token);
      useAuthStore.setState({ user, token, isAuthenticated: true });
    } catch (err: any) {
      setLoading(false);
      notifyError('注册失败', err);
    }
  };

  const focusedStyle = (f: FocusField) => [
    styles.input,
    focused === f ? styles.inputFocused : undefined,
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {stage === 'choose' ? (
        /* ---------------- 方式选择屏 ---------------- */
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: 32 + insets.top, paddingBottom: insets.bottom + 24 },
          ]}
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

          <View style={styles.footer}>
            <Text style={styles.footerText}>已有账号？</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Text style={styles.footerLink}>去登录</Text>
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
              accessibilityLabel="返回方式选择"
            >
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.formTitle}>创建你的账号</Text>
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
                accessibilityLabel="选择国家码"
              >
                <Text style={styles.countryText}>{country.label}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.ink3} />
              </TouchableOpacity>

              <TextInput
                style={focusedStyle('phone')}
                placeholder="手机号"
                placeholderTextColor={colors.ink3}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                accessibilityLabel="手机号"
              />

              {/* 验证码 输入 + 获取验证码文字按钮 */}
              <View style={styles.codeRow}>
                <TextInput
                  style={[styles.codeInput, focused === 'code' ? styles.inputFocused : undefined]}
                  placeholder="验证码"
                  placeholderTextColor={colors.ink3}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  onFocus={() => setFocused('code')}
                  onBlur={() => setFocused(null)}
                  accessibilityLabel="验证码"
                />
                <TouchableOpacity
                  style={styles.codeBtn}
                  onPress={handleSendCode}
                  disabled={secondsLeft > 0 || sending}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={secondsLeft > 0 ? `重新获取，${secondsLeft}秒` : '获取验证码'}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.codeBtnText, secondsLeft > 0 && styles.codeBtnTextMuted]}>
                      {secondsLeft > 0 ? `${secondsLeft}s` : '获取验证码'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TextInput
                style={focusedStyle('email')}
                placeholder="邮箱"
                placeholderTextColor={colors.ink3}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                accessibilityLabel="邮箱"
              />
              <TextInput
                style={focusedStyle('password')}
                placeholder="密码"
                placeholderTextColor={colors.ink3}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                accessibilityLabel="密码"
              />
              <TextInput
                style={focusedStyle('confirm')}
                placeholder="确认密码"
                placeholderTextColor={colors.ink3}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
                accessibilityLabel="确认密码"
              />
            </>
          )}

          <TextInput
            style={focusedStyle('name')}
            placeholder="姓名"
            placeholderTextColor={colors.ink3}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            accessibilityLabel="姓名"
          />

          {/* 角色 两个紧凑胶囊 */}
          <View style={styles.roleRow}>
            {(
              [
                ['tenant', '租客'],
                ['owner', '房东'],
              ] as [Role, string][]
            ).map(([r, label]) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleItem, role === r && styles.roleItemActive]}
                onPress={() => setRole(r)}
                accessibilityRole="button"
                accessibilityState={{ selected: role === r }}
                accessibilityLabel={`注册为${label}`}
              >
                <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
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
              <Text style={styles.buttonText}>注册</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>已有账号？</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Text style={styles.footerLink}>去登录</Text>
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
            <Text style={styles.sheetTitle}>选择国家 / 地区</Text>
            {COUNTRY_CODES.map((c) => {
              const active = c.value === country.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={styles.option}
                  onPress={() => {
                    setCountry(c);
                    setCountryVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{c.label}</Text>
                  {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
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
  container: { flex: 1, backgroundColor: '#ffffff' },
  scroll: {
    paddingHorizontal: 28,
    justifyContent: 'center',
    flexGrow: 1,
  },
  brandLogo: {
    width: 120,
    height: 48,
    alignSelf: 'center',
    resizeMode: 'contain',
    marginBottom: 8,
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
    backgroundColor: '#ffffff',
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
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
  },
  roleItemActive: { backgroundColor: colors.sidebarActive },
  roleText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
  roleTextActive: { color: colors.primary },
  fieldError: { fontSize: 12, color: colors.error, marginBottom: 12 },
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
  footerLink: { fontSize: 14, color: colors.ink, fontWeight: '800' },
  overlay: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.45),
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
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