import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import { companyApi } from '@/services/api';
import colors from '@/theme/colors';
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
      notify('租金提醒天数需为 0-180 之间的整数');
      return;
    }
    if (!Number.isFinite(lease) || lease < 0 || lease > 365) {
      notify('合同到期提醒天数需为 0-365 之间的整数');
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
      notify('已保存');
    } catch (e: any) {
      notify(getErrorMessage(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>租金到期前提醒天数</Text>
      <TextInput
        style={styles.input}
        value={rentDays}
        onChangeText={setRentDays}
        keyboardType="number-pad"
        placeholder="7"
        placeholderTextColor={colors.ink3}
      />

      <Text style={styles.label}>合同到期前提醒天数</Text>
      <TextInput
        style={styles.input}
        value={leaseDays}
        onChangeText={setLeaseDays}
        keyboardType="number-pad"
        placeholder="30"
        placeholderTextColor={colors.ink3}
      />

      <TouchableOpacity style={styles.prefRow} activeOpacity={0.7} onPress={() => setAutoDunning(!autoDunning)}>
        <Text style={styles.prefLabel}>自动催缴</Text>
        <Text style={autoDunning ? styles.check : styles.prefOff}>{autoDunning ? '✓ 开启' : '关闭'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveButton, (saving || !loaded) && styles.saveDisabled]}
        activeOpacity={0.8}
        disabled={saving || !loaded}
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
  prefOff: {
    fontSize: 14,
    color: colors.ink3,
  },
  check: {
    fontSize: 15,
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