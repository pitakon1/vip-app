/**
 * 用户协议 / 隐私政策（App 内占位页）
 *
 * 正式条款由法务提供后替换文案；本页只负责展示与返回，不做任何同意状态判断。
 * 入口：注册页协议勾选旁、登录页底部。
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

export default function AgreementScreen() {
  const route = useRoute<any>();
  const { t } = useI18n();
  const isPrivacy = route.params?.type === 'privacy';
  const paragraphs = t(isPrivacy ? 'legal.privacyBody' : 'legal.termsBody').split('\n\n');

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.notice}>
        <Text style={styles.noticeText}>{t('legal.placeholderNotice')}</Text>
      </View>
      {paragraphs.map((p, i) => (
        <Text key={i} style={styles.paragraph}>
          {p}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingVertical: 18, paddingBottom: 40 },
  notice: {
    backgroundColor: colors.sidebarActive,
    borderRadius: colors.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  noticeText: { fontSize: 12, color: colors.ink2, lineHeight: 18 },
  paragraph: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 23,
    marginBottom: 14,
  },
});
