import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

/**
 * 帮助中心（D-08）：原「我的 → 帮助」只弹「暂未开放」，
 * 这里改为可用的静态说明页，覆盖账号、找房、签约、缴费、报修五类高频问题。
 * 文案全部走 i18n 三语，不依赖后端接口。
 */
export default function HelpCenterScreen() {
  const { t } = useI18n();
  const sections = [
    { q: 'help.q1', a: 'help.a1' },
    { q: 'help.q2', a: 'help.a2' },
    { q: 'help.q3', a: 'help.a3' },
    { q: 'help.q4', a: 'help.a4' },
    { q: 'help.q5', a: 'help.a5' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>{t('help.intro')}</Text>
      {sections.map((item) => (
        <View key={item.q} style={styles.card}>
          <Text style={styles.question}>{t(item.q)}</Text>
          <Text style={styles.answer}>{t(item.a)}</Text>
        </View>
      ))}
      <View style={styles.card}>
        <Text style={styles.question}>{t('help.contactTitle')}</Text>
        <Text style={styles.answer}>{t('help.contactBody')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  intro: { fontSize: 13, color: colors.ink3, lineHeight: 20, marginBottom: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  question: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  answer: { fontSize: 13, color: colors.ink2, lineHeight: 20 },
});
