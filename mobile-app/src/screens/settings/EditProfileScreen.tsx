import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/services/api';
import colors from '@/theme/colors';
import { notify, getErrorMessage } from '@/utils/feedback';

/**
 * 编辑资料（全屏下钻子页，微信「设置→个人信息」式）。
 * 由「我的」用户卡「编辑资料」按钮或「绑定手机/绑定邮箱/账号与安全」行进入。
 * 迁移自 ProfileScreen 的编辑资料弹层逻辑，选项仅提交发生变化的字段。
 */
export default function EditProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      notify('请填写姓名');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = { full_name: name.trim() };
      if (phone !== (user?.phone ?? '')) payload.phone = phone.trim();
      if (email !== (user?.email ?? '')) payload.email = email.trim();
      const { data } = await authApi.updateMe(payload);
      setUser({ ...user, ...(data ?? {}) } as any);
      notify('已保存');
    } catch (e: any) {
      notify(getErrorMessage(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>姓名</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="请输入姓名"
        placeholderTextColor={colors.ink3}
      />
      <Text style={styles.label}>手机号</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="请输入手机号"
        placeholderTextColor={colors.ink3}
        keyboardType="phone-pad"
      />
      <Text style={styles.label}>邮箱</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="请输入邮箱"
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
        <Text style={styles.saveText}>{saving ? '保存中...' : '保存'}</Text>
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