/**
 * 「帮我找房」线索表单（App 公开页，未登录可进）。
 *
 * 分类页的「帮我找房」入口此前是 FeatureNotAvailable 占位。这里把预算 / 区域 /
 * 入住时间 / 语言结构化提交到 `POST /public/inquiries`（intent=find_my_home），
 * 后端落 Lead 并给运营/经纪人发站内通知。
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { publicApi } from '@/services/publicApi';

const CURRENCIES = ['THB', 'CNY', 'USD'] as const;
const LANGUAGES = ['zh', 'en', 'th'] as const;

export default function FindMyHomeScreen({ navigation }: any) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    wechat_id: '',
    email: '',
    budgetMin: '',
    budgetMax: '',
    areas: '',
    moveIn: '',
    message: '',
  });
  const [currency, setCurrency] = useState<string>('THB');
  const [language, setLanguage] = useState<string>('zh');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const patch = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError(t('pub.findHomeNameRequired'));
      return;
    }
    if (!form.phone.trim() && !form.wechat_id.trim() && !form.email.trim()) {
      setError(t('pub.findHomeContactRequired'));
      return;
    }
    const min = form.budgetMin ? Number(form.budgetMin) : undefined;
    const max = form.budgetMax ? Number(form.budgetMax) : undefined;
    if (min != null && max != null && min > max) {
      setError(t('pub.findHomeBudgetInvalid'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await publicApi.inquiry({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        wechat_id: form.wechat_id.trim() || undefined,
        email: form.email.trim() || undefined,
        message: form.message.trim() || undefined,
        intent: 'find_my_home',
        source: 'find_my_home',
        budget_min: min,
        budget_max: max,
        currency,
        areas: form.areas
          .split(/[,，]/)
          .map((a) => a.trim())
          .filter(Boolean),
        move_in_date: form.moveIn || undefined,
        language: language as 'zh' | 'en' | 'th',
      });
      setDone(true);
    } catch {
      setError(t('pub.findHomeError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.container, styles.center, { padding: 24 }]}>
        <Text style={styles.okTitle}>{t('pub.findHomeOkTitle')}</Text>
        <Text style={styles.hint}>{t('pub.findHomeOk')}</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('PublicListings')}
        >
          <Text style={styles.primaryBtnText}>{t('pub.findHomeBrowse')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => setDone(false)}>
          <Text style={styles.ghostBtnText}>{t('pub.findHomeAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{t('pub.findHomeTitle')}</Text>
      <Text style={styles.hint}>{t('pub.findHomeSub')}</Text>

      <Field label={t('pub.findHomeName')} value={form.name} onChangeText={(v) => patch('name', v)} />
      <Field label={t('pub.findHomePhone')} value={form.phone} onChangeText={(v) => patch('phone', v)} keyboardType="phone-pad" />
      <Field label={t('pub.findHomeWechat')} value={form.wechat_id} onChangeText={(v) => patch('wechat_id', v)} />
      <Field label={t('pub.findHomeEmail')} value={form.email} onChangeText={(v) => patch('email', v)} keyboardType="email-address" autoCapitalize="none" />

      <Text style={styles.label}>{t('pub.findHomeCurrency')}</Text>
      <Chips
        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        value={currency}
        onChange={setCurrency}
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Field
            label={t('pub.findHomeBudgetMin')}
            value={form.budgetMin}
            onChangeText={(v) => patch('budgetMin', v.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.half}>
          <Field
            label={t('pub.findHomeBudgetMax')}
            value={form.budgetMax}
            onChangeText={(v) => patch('budgetMax', v.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
          />
        </View>
      </View>

      <Field
        label={t('pub.findHomeAreas')}
        value={form.areas}
        onChangeText={(v) => patch('areas', v)}
        placeholder={t('pub.findHomeAreasHint')}
      />
      <Field
        label={t('pub.findHomeMoveIn')}
        value={form.moveIn}
        onChangeText={(v) => patch('moveIn', v)}
        placeholder="2026-12-01"
      />

      <Text style={styles.label}>{t('pub.findHomeLanguage')}</Text>
      <Chips
        options={LANGUAGES.map((l) => ({ value: l, label: t(`pub.findHomeLang_${l}`) }))}
        value={language}
        onChange={setLanguage}
      />

      <Field
        label={t('pub.findHomeMessage')}
        value={form.message}
        onChangeText={(v) => patch('message', v)}
        multiline
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.primaryBtn, submitting && styles.btnDisabled]}
        onPress={submit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.primaryBtnText}>{t('pub.findHomeSubmit')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  label,
  multiline,
  ...rest
}: {
  label: string;
  multiline?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholderTextColor={colors.ink3}
        multiline={multiline}
        {...rest}
      />
    </View>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(o.value)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 13, color: colors.ink2, marginTop: 6, marginBottom: 8, lineHeight: 20, textAlign: 'center' },
  label: { fontSize: 13, color: colors.ink2, marginBottom: 6 },
  input: {
    backgroundColor: colors.fieldFill,
    borderWidth: 1,
    borderColor: colors.fieldFillBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 15,
  },
  inputMultiline: { height: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  error: { color: colors.error, marginTop: 12 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
  ghostBtn: { marginTop: 12, paddingVertical: 12 },
  ghostBtnText: { color: colors.ink2, fontSize: 14 },
  okTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'center' },
});
