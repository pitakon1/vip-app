import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { authApi } from '@/services/api';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { notify, getErrorMessage } from '@/utils/feedback';

/**
 * 通知设置（全屏下钻子页，微信「设置→新消息通知」式）。
 * 由「我的」系统设置「通知设置 /时区」行进入。
 * 迁移自 ProfileScreen 的时区/通知弹层逻辑：读写用户时区与邮件/推送通知开关。
 */
export default function NotificationPrefsScreen() {
  const { t } = useI18n();
  const [timezone, setTimezone] = useState('Asia/Bangkok');
  const [email, setEmail] = useState(true);
  const [push, setPush] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // 进入即读取用户偏好
  React.useEffect(() => {
    let alive = true;
    authApi
      .preferences()
      .then(({ data }) => {
        const p = data ?? {};
        if (!alive) return;
        setTimezone(p.timezone || 'Asia/Bangkok');
        setEmail(p.notify_email !== false);
        setPush(p.notify_push !== false);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
        /* 读取失败用默认值 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await authApi.updatePreferences({
        timezone: timezone.trim() || undefined,
        notify_email: email,
        notify_push: push,
      });
      notify(t('settings.saved'));
    } catch (e: any) {
      notify(getErrorMessage(e, t('settings.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('settings.timezone')}</Text>
      <TextInput
        style={styles.input}
        value={timezone}
        onChangeText={setTimezone}
        placeholder={t('settings.timezonePlaceholder')}
        placeholderTextColor={colors.ink3}
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.prefRow} activeOpacity={0.7} onPress={() => setEmail(!email)}>
        <Text style={styles.prefLabel}>{t('settings.emailNotify')}</Text>
        <View style={styles.prefValue}>
          <Ionicons
            name={email ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={email ? colors.primary : colors.ink3}
          />
          <Text style={email ? styles.prefOn : styles.prefOff}>
            {email ? t('common.on') : t('common.off')}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.prefRow} activeOpacity={0.7} onPress={() => setPush(!push)}>
        <Text style={styles.prefLabel}>{t('settings.pushNotify')}</Text>
        <View style={styles.prefValue}>
          <Ionicons
            name={push ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={push ? colors.primary : colors.ink3}
          />
          <Text style={push ? styles.prefOn : styles.prefOff}>
            {push ? t('common.on') : t('common.off')}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveButton, (saving || !loaded) && styles.saveDisabled]}
        activeOpacity={0.8}
        disabled={saving || !loaded}
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
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  prefLabel: { fontSize: 15, color: colors.text },
  prefValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prefOff: {
    fontSize: 14,
    color: colors.ink3,
  },
  prefOn: {
    fontSize: 14,
    color: colors.primary,
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