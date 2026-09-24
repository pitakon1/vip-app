import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { companyApi } from '@/services/api';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { notify, getErrorMessage } from '@/utils/feedback';

/**
 * 业务设置（管理端「我的 → 业务设置」全屏下钻子页）。
 * 对应 Web 设置页的「业务提醒参数」，读写 `GET/PUT /company/settings` 的 business 段：
 * 租金提醒天数 / 合同到期提醒天数 / 自动催缴开关。
 *
 * 此前「我的」里这三项是写死的展示文本（7 天前 / 30 天前 / 已开启）且点击提示
 * 「暂未开放」——既与后台真实配置脱钩，也没有可修改的入口。
 */
export default function AdminBusinessSettingsScreen() {
  const { t } = useI18n();
  const [rentDays, setRentDays] = useState('7');
  const [leaseDays, setLeaseDays] = useState('30');
  const [autoDunning, setAutoDunning] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    let alive = true;
    companyApi
      .settings()
      .then(({ data }) => {
        const business = (data?.data ?? data)?.business ?? {};
        if (!alive) return;
        setRentDays(String(business.rent_reminder_days ?? 7));
        setLeaseDays(String(business.lease_reminder_days ?? 30));
        setAutoDunning(business.auto_dunning !== false);
      })
      .catch(() => {
        /* 读取失败时保留默认值，保存仍会覆盖 */
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    const rent = Number.parseInt(rentDays, 10);
    const lease = Number.parseInt(leaseDays, 10);
    if (!Number.isFinite(rent) || rent < 0 || rent > 180) {
      notify(t('settings.rentDaysRange'));
      return;
    }
    if (!Number.isFinite(lease) || lease < 0 || lease > 365) {
      notify(t('settings.leaseDaysRange'));
      return;
    }
    setSaving(true);
    try {
      await companyApi.updateSettings({
        business: {
          rent_reminder_days: rent,
          lease_reminder_days: lease,
          auto_dunning: autoDunning,
        },
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
      <Text style={styles.label}>{t('settings.rentReminderDays')}</Text>
      <TextInput
        style={styles.input}
        value={rentDays}
        onChangeText={setRentDays}
        keyboardType="number-pad"
        placeholder="7"
        placeholderTextColor={colors.ink3}
      />

      <Text style={styles.label}>{t('settings.leaseReminderDays')}</Text>
      <TextInput
        style={styles.input}
        value={leaseDays}
        onChangeText={setLeaseDays}
        keyboardType="number-pad"
        placeholder="30"
        placeholderTextColor={colors.ink3}
      />

      <TouchableOpacity style={styles.prefRow} activeOpacity={0.7} onPress={() => setAutoDunning(!autoDunning)}>
        <Text style={styles.prefLabel}>{t('settings.autoDunning')}</Text>
        <View style={styles.prefValue}>
          <Ionicons
            name={autoDunning ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={autoDunning ? colors.primary : colors.ink3}
          />
          <Text style={autoDunning ? styles.prefOn : styles.prefOff}>
            {autoDunning ? t('common.on') : t('common.off')}
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
    marginTop: 12,
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