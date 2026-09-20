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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/services/api';
import { tokenStorage } from '@/lib/storage';
import { notifyError } from '@/utils/feedback';
import { useOtp, COUNTRY_CODES, DEFAULT_COUNTRY } from '@/hooks/useOtp';
import colors from '@/theme/colors';

type Mode = 'phone' | 'email';
type Role = 'tenant' | 'owner';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { sending, secondsLeft, sendOtp } = useOtp();

  const [mode, setMode] = useState<Mode>('phone');
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
    if (mode === 'phone' && !phone.trim()) {
      msg = '请输入手机号';
      ok = false;
    }
    if (mode === 'email' && !email.trim()) {
      msg = '请输入邮箱';
      ok = false;
    }
    if (!code && mode === 'phone') {
      msg = '请输入验证码';
      ok = false;
    }
    if (mode === 'email' && !password) {
      msg = '请输入密码';
      ok = false;
    }
    if (mode === 'email' && password !== confirm) {
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
        mode === 'phone'
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

  const modeItem = (m: Mode, icon: string, label: string) => (
    <TouchableOpacity
      style={[styles.tabItem, mode === m && styles.tabItemActive]}
      onPress={() => {
        setMode(m);
        setError('');
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: mode === m }}
      accessibilityLabel={label}
    >
      <Ionicons name={icon as any} size={18} color={mode === m ? colors.primary : colors.ink3} />
      <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: 52 + insets.top, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="返回登录"
          >
            <Ionicons name="arrow-back" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={styles.brandTitle}>
            <Text style={styles.brandTitleAccent}>VIP</Text> Rental
          </Text>
          <Text style={styles.brandSubtitle}>注册新账号</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.form}>
            <View style={styles.tabs}>
              {modeItem('phone', 'phone-portrait-outline', '手机号')}
              {modeItem('email', 'mail-outline', '邮箱')}
            </View>

            {mode === 'phone' ? (
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
                    style={[styles.inputCode, styles.codeInput]}
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
            ) : (
              <>
                <Text style={styles.label}>邮箱</Text>
                <TextInput
                  style={styles.input}
                  placeholder="请输入邮箱"
                  placeholderTextColor={colors.ink3}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  accessibilityLabel="邮箱"
                />
                <Text style={styles.label}>密码</Text>
                <TextInput
                  style={styles.input}
                  placeholder="设置密码"
                  placeholderTextColor={colors.ink3}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  accessibilityLabel="密码"
                />
                <Text style={styles.label}>确认密码</Text>
                <TextInput
                  style={styles.input}
                  placeholder="再次输入密码"
                  placeholderTextColor={colors.ink3}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  accessibilityLabel="确认密码"
                />
              </>
            )}

            <Text style={styles.label}>姓名</Text>
            <TextInput
              style={styles.input}
              placeholder="请输入姓名"
              placeholderTextColor={colors.ink3}
              value={name}
              onChangeText={setName}
              accessibilityLabel="姓名"
            />

            <Text style={styles.label}>注册身份</Text>
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
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>已有账号？</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.footerLink}>去登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: 24,
    justifyContent: 'center',
    flexGrow: 1,
  },
  header: { alignItems: 'center', marginBottom: 28 },
  backBtn: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  brandTitleAccent: { color: colors.primary },
  brandSubtitle: { fontSize: 14, color: colors.ink2, marginTop: 6 },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xxl,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  form: { width: '100%' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.lg,
    padding: 4,
    marginBottom: 20,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
  },
  tabItemActive: { backgroundColor: colors.surface, ...colors.shadow.sm },
  tabText: { fontSize: 15, color: colors.ink3, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
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
  },
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
  codeInput: { flex: 1, marginBottom: 0 },
  inputCode: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
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
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  roleItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
  },
  roleItemActive: { borderColor: colors.primary, backgroundColor: colors.sidebarActive },
  roleText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
  roleTextActive: { color: colors.primary },
  fieldError: { fontSize: 12, color: colors.error, marginBottom: 12 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    ...colors.shadow.primary,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 20,
  },
  footerText: { fontSize: 13, color: colors.ink3 },
  footerLink: { fontSize: 13, color: colors.primary, fontWeight: '600' },
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