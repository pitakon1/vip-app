/**
 * 匿名留资表单（房源详情 / 学校详情共用）。
 *
 * 这是「浏览不需注册」到「有需求才留资」的转化落点：不强制注册，只收一个称呼
 * 加一项联系方式，直接写进后端 CRM 的 `Lead`。后端限流防灌水，且至少要求留
 * 一种联系方式——否则这条线索是废的，后端会直接 400。
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import colors from '@/theme/colors';
import { publicApi, type PublicInquiryPayload } from '@/services/publicApi';
import type { TFunction } from '@/lib/publicSite';

interface Props {
  t: TFunction;
  title: string;
  note?: string;
  /** 留资上下文：房源 / 学校 / 小区，用于后端判断意图 */
  context: Pick<PublicInquiryPayload, 'listing_id' | 'property_id' | 'project_id' | 'school_id'>;
  source: string;
  defaultMessage?: string;
}

export default function PublicInquiryForm({
  t,
  title,
  note,
  context,
  source,
  defaultMessage = '',
}: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [wechat, setWechat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setFeedback({ tone: 'error', text: t('pub.inquireNameRequired') });
      return;
    }
    // 贝壳口径：匿名留资手机号必填——否则线索无法回访，这条 lead 是废的。
    if (!phone.trim()) {
      setFeedback({ tone: 'error', text: t('pub.inquirePhoneRequired') });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await publicApi.inquiry({
        name: name.trim(),
        phone: phone.trim(),
        wechat_id: wechat.trim() || undefined,
        message: defaultMessage || undefined,
        source,
        ...context,
      });
      setFeedback({ tone: 'ok', text: t('pub.inquireOk') });
      setName('');
      setPhone('');
      setWechat('');
    } catch {
      setFeedback({ tone: 'error', text: t('pub.inquireError') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      <Text style={styles.label}>{t('pub.inquireName')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('pub.inquireName')}
        placeholderTextColor={colors.ink3}
      />

      <Text style={styles.label}>{t('pub.inquirePhone')}</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder={t('pub.inquirePhone')}
        placeholderTextColor={colors.ink3}
      />

      <Text style={styles.label}>{t('pub.inquireWechat')}</Text>
      <TextInput
        style={styles.input}
        value={wechat}
        onChangeText={setWechat}
        autoCapitalize="none"
        placeholder={t('pub.inquireWechat')}
        placeholderTextColor={colors.ink3}
      />

      {feedback ? (
        <Text style={[styles.msg, feedback.tone === 'ok' ? styles.msgOk : styles.msgError]}>
          {feedback.text}
        </Text>
      ) : null}

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={submit}
        disabled={submitting}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonText}>{t('pub.inquireSubmit')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginTop: colors.spacing.lg,
    ...colors.shadow.card,
  },
  title: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  note: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 6, lineHeight: 19 },
  label: {
    fontSize: colors.fontSize.sm,
    color: colors.ink2,
    marginTop: colors.spacing.md,
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: colors.spacing.md,
    fontSize: colors.fontSize.base,
    color: colors.ink,
    backgroundColor: colors.fieldFill,
  },
  msg: { fontSize: colors.fontSize.sm, marginTop: colors.spacing.md },
  msgOk: { color: colors.success },
  msgError: { color: colors.error },
  button: {
    height: 48,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: colors.spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.primaryForeground },
});
