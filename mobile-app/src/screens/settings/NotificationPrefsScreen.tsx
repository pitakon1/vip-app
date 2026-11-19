import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { authApi, devicesApi } from '@/services/api';
import { registerPushToken } from '@/lib/push';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { notify, getErrorMessage } from '@/utils/feedback';
import EmptyState from '@/components/EmptyState';
import { errorText } from '@/lib/errorText';

type PushState = Awaited<ReturnType<typeof registerPushToken>>;

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [testingPush, setTestingPush] = useState(false);

  // 进入即尝试注册本机 push token（Web/模拟器会返回 unsupported，不伪造成功）
  React.useEffect(() => {
    let alive = true;
    void registerPushToken().then((result) => {
      if (alive) setPushState(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  const pushStatusText = (): string => {
    if (!pushState) return t('settings.pushChecking');
    switch (pushState.state) {
      case 'registered':
        return t('settings.pushRegistered');
      case 'denied':
        return t('settings.pushDenied');
      case 'unsupported':
        return pushState.reason === 'web'
          ? t('settings.pushUnsupportedWeb')
          : t('settings.pushUnsupportedSimulator');
      case 'not-configured':
        return t('settings.pushNotConfigured');
      default:
        return `${t('settings.pushFailed')}: ${pushState.message}`;
    }
  };

  const sendTestPush = async () => {
    setTestingPush(true);
    try {
      const { data } = await devicesApi.testPush();
      notify(t('settings.pushTestOk').replace('{n}', String(data?.sent ?? 0)));
    } catch (e: any) {
      const detail = String(e?.response?.data?.detail || '');
      if (detail.includes('No active push token')) {
        notify(t('settings.pushTestNone'));
      } else if (detail.includes('disabled')) {
        notify(t('settings.pushTestDisabled'));
      } else {
        notify(getErrorMessage(e, t('settings.pushFailed')));
      }
    } finally {
      setTestingPush(false);
    }
  };

  // 进入即读取用户偏好；读取失败必须阻止保存，否则会用默认值静默覆盖用户设置。
  const load = React.useCallback(async () => {
    setLoadError(null);
    setLoaded(false);
    try {
      const { data } = await authApi.preferences();
      const p = data ?? {};
      setTimezone(p.timezone || 'Asia/Bangkok');
      setEmail(p.notify_email !== false);
      setPush(p.notify_push !== false);
    } catch (e) {
      setLoadError(errorText(e, t('settings.loadPrefsFailed')));
    } finally {
      setLoaded(true);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

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

  if (loadError) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <EmptyState
          tone="error"
          title={loadError}
          sub={t('settings.noOverwritePrefs')}
          actionLabel={t('common.retry')}
          onAction={() => void load()}
        />
      </ScrollView>
    );
  }

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

      {/* 本机推送通道状态：真实反映权限/ProjectId/模拟器限制，不显示"已开启"假状态 */}
      <View style={styles.pushStatusRow}>
        <Text style={styles.pushStatusLabel}>{t('settings.pushDevice')}</Text>
        <Text style={styles.pushStatusText}>{pushStatusText()}</Text>
      </View>

      {pushState?.state === 'registered' && (
        <TouchableOpacity
          style={[styles.testButton, testingPush && styles.saveDisabled]}
          activeOpacity={0.8}
          disabled={testingPush}
          onPress={() => void sendTestPush()}
        >
          <Text style={styles.testText}>
            {testingPush ? t('settings.pushTesting') : t('settings.pushTest')}
          </Text>
        </TouchableOpacity>
      )}

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
  pushStatusRow: {
    marginTop: 12,
    padding: 12,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pushStatusLabel: {
    fontSize: colors.fontSize.caption,
    color: colors.ink2,
    marginBottom: 4,
  },
  pushStatusText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  testButton: {
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  testText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
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