import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/services/api';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { notify, getErrorMessage } from '@/utils/feedback';

/**
 * 编辑资料（全屏下钻子页，微信「设置→个人信息」式）。
 * 由「我的」用户卡「编辑资料」按钮或「绑定手机/绑定邮箱/账号与安全」行进入。
 * 迁移自 ProfileScreen 的编辑资料弹层逻辑，选项仅提交发生变化的字段。
 */
export default function EditProfileScreen() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [code, setCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [saving, setSaving] = useState(false);

  const phoneChanged = phone !== (user?.phone ?? '');
  // 只做格式门槛（国际号码 6-15 位数字，可带前导 +），真实有效性仍由后端验证码兜底
  const isPhoneValid = /^\+?\d{6,15}$/.test(phone.trim());
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // 修改手机号必须先向新手机号发送验证码（后端 PATCH /auth/me 校验 code，否则 400）
  const sendCode = async () => {
    if (!phone.trim()) {
      notify(t('settings.profilePhonePh'));
      return;
    }
    if (!isPhoneValid) {
      notify(t('settings.phoneInvalid'));
      return;
    }
    setSendingCode(true);
    try {
      await authApi.requestOtp(phone.trim(), 'sms');
      notify(t('settings.codeSent'));
    } catch (e: any) {
      notify(getErrorMessage(e, t('settings.codeSendFailed')));
    } finally {
      setSendingCode(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      notify(t('settings.nameRequired'));
      return;
    }
    if (phoneChanged && !isPhoneValid) {
      notify(t('settings.phoneInvalid'));
      return;
    }
    if (email.trim() && !isEmailValid) {
      notify(t('settings.emailInvalid'));
      return;
    }
    if (phoneChanged && !code.trim()) {
      notify(t('settings.codeRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = { full_name: name.trim() };
      if (phoneChanged) {
        payload.phone = phone.trim();
        payload.code = code.trim();
      }
      if (email !== (user?.email ?? '')) payload.email = email.trim();
      const { data } = await authApi.updateMe(payload);
      setUser({ ...user, ...(data ?? {}) } as any);
      notify(t('settings.saved'));
    } catch (e: any) {
      notify(getErrorMessage(e, t('settings.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('settings.profileName')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('settings.profileNamePh')}
        placeholderTextColor={colors.ink3}
      />
      <Text style={styles.label}>{t('settings.profilePhone')}</Text>
      <View style={styles.phoneRow}>
        <TextInput
          style={[styles.input, styles.phoneInput]}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('settings.profilePhonePh')}
          placeholderTextColor={colors.ink3}
          keyboardType="phone-pad"
        />
        <TouchableOpacity
          style={[styles.codeButton, sendingCode && styles.saveDisabled]}
          activeOpacity={0.8}
          disabled={sendingCode}
          onPress={sendCode}
        >
          <Text style={styles.codeButtonText}>
            {sendingCode ? t('settings.codeSending') : t('settings.sendCode')}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.label}>{t('settings.profileCode')}</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder={t('settings.profileCodePh')}
        placeholderTextColor={colors.ink3}
        keyboardType="number-pad"
      />
      <Text style={styles.label}>{t('settings.profileEmail')}</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder={t('settings.profileEmailPh')}
        placeholderTextColor={colors.ink3}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveDisabled]}
        activeOpacity={0.8}
        disabled={saving}
        onPress={save}
      >
        <Text style={styles.saveText}>{saving ? t('settings.saving') : t('settings.save')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  label: {
    fontSize: 13,
    color: colors.ink2,
    marginTop: 4,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phoneInput: {
    flex: 1,
  },
  codeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  codeButtonText: {
    fontSize: 13,
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  saveButton: {
    marginTop: 24,
    paddingVertical: 13,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: 15,
    color: colors.primaryForeground,
    fontWeight: '600',
  },
});