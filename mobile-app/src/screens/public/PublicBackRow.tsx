/**
 * C 端列表页的「返回」行。
 *
 * 这三个列表页（找房 / 学校 / 小区）有两处宿主：
 * - 访客态的底部 Tab（`PublicTabNavigator`）—— 此时**没有**上级页面，
 *   不该出现返回入口；
 * - 登录态的栈推送（`RootNavigator` 的 `PublicSchools` / `PublicCommunities`）——
 *   此时必须能返回。
 *
 * 所以用 `navigation.canGoBack()` 判断，而不是给同一份代码配两套外壳——
 * 否则「Tab 根页露出返回箭头」或「栈页没有返回路径」必有一头出错。
 *
 * 做成**行内**而不是浮动按钮：列表页左上角是页面标题，浮动按钮会直接压住标题。
 * 详情页的返回按钮是浮在相册图上的（那里没有文字），不适用这个组件。
 */
import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

export default function PublicBackRow() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();

  if (!navigation.canGoBack?.()) return null;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel={t('pub.back')}
    >
      <Ionicons name="chevron-back" size={18} color={colors.ink2} />
      <Text style={styles.text}>{t('pub.back')}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, alignSelf: 'flex-start' },
  text: { fontSize: colors.fontSize.base, color: colors.ink2 },
});
