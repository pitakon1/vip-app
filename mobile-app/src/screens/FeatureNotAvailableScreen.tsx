import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import type { RootStackParamList } from '@/navigation/RootNavigator';

/**
 * 功能暂未开放提示页。
 *
 * 产品口径：平台没有独立的业主/租客角色，所有 C 端功能都不按身份拦截。
 * 这里只表达「该功能还没做」，并给出具体原因 + 可操作的下一步入口
 * （浏览房源 / 登记找房需求 / 查看成交榜单），不再一律「请联系客服」。
 */
export default function FeatureNotAvailableScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'FeatureNotAvailable'>>();
  const { t } = useI18n();
  const { feature, hint, hintKey, actionLabelKey, actionScreen, actionParams } = route.params ?? {};

  const desc = hint ?? (hintKey ? t(hintKey) : t('featureUnavailable.defaultHint'));
  const canAct = Boolean(actionScreen && actionLabelKey);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.iconBox}>
        <Ionicons name="information-circle-outline" size={40} color={colors.primary} />
      </View>
      <Text style={styles.title}>{t('featureUnavailable.title')}</Text>
      {feature ? <Text style={styles.feature}>{feature}</Text> : null}
      <Text style={styles.desc}>{desc}</Text>

      {canAct ? (
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.8}
          onPress={() => navigation.replace(actionScreen as string, actionParams)}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{t(actionLabelKey as string)}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.backBtn, canAct && styles.backBtnGhost]}
        activeOpacity={0.8}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
      >
        <Text style={[styles.backText, canAct && styles.backTextGhost]}>
          {t('featureUnavailable.back')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.background,
  },
  iconBox: {
    width: 84,
    height: 84,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  feature: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink2,
    marginBottom: 10,
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.ink3,
    marginBottom: 28,
  },
  primaryBtn: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primaryForeground,
  },
  backBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtnGhost: {},
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  backTextGhost: {
    color: colors.ink3,
  },
});
