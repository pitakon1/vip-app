import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/services/api';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { notify, getErrorMessage } from '@/utils/feedback';

/**
 * 修改密码（全屏下钻子页，微信「设置→账号与安全→微信密码」式）。
 * 由「我的」账户设置「修改密码」行进入。
 * 迁移自 ProfileScreen 的修改密码弹层逻辑：改密后旧令牌失效，需重新登录。
 */
export default function ChangePasswordScreen() {
  const { t } = useI18n();
  const logout = useAuthStore((s) => s.logout);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!oldPwd || !newPwd) {
      notify(t('settings.pwdIncomplete'));
      return;
    }
    if (newPwd.length < 6) {
      notify(t('settings.pwdTooShort'));
      return;
    }
    if (newPwd !== confirmPwd) {
      notify(t('settings.pwdMismatch'));
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword({ old_password: oldPwd, new_password: newPwd });
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      // 改密后所有旧令牌失效，建议重新登录（先提示再退出，避免提示随页面卸载丢失）
      notify(t('settings.pwdChanged'));
      logout();
    } catch (e: any) {
      notify(getErrorMessage(e, t('settings.pwdChangeFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('settings.currentPassword')}</Text>
      <TextInput
        style={styles.input}
        value={oldPwd}
        onChangeText={setOldPwd}
        placeholder={t('settings.currentPasswordPh')}
        placeholderTextColor={colors.ink3}
        secureTextEntry
      />
      <Text style={styles.label}>{t('settings.newPassword')}</Text>
      <TextInput
        style={styles.input}
        value={newPwd}
        onChangeText={setNewPwd}
        placeholder={t('settings.newPasswordPh')}
        placeholderTextColor={colors.ink3}
        secureTextEntry
      />
      <Text style={styles.label}>{t('settings.confirmPassword')}</Text>
      <TextInput
        style={styles.input}
        value={confirmPwd}
        onChangeText={setConfirmPwd}
        placeholder={t('settings.confirmPasswordPh')}
        placeholderTextColor={colors.ink3}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveDisabled]}
        activeOpacity={0.8}
        disabled={saving}
        onPress={save}
      >
        <Text style={styles.saveText}>
          {saving ? t('settings.pwdSubmitting') : t('settings.pwdSubmit')}
        </Text>
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
    fontSize: colors.fontSize.caption,
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