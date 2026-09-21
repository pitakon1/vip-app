/**
 * 「我的」Tab 的访客态。
 *
 * 这是「浏览不需注册、只在需要登录的动作上才要求注册」的边界页：
 * 用户不登录也能一路浏览到详情，只有点进来办自己的事（租约、缴费、收藏、消息）
 * 才需要登录。所以这里不做强制跳转，只给登录/注册入口，并说明可浏览范围。
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

const CAPABILITIES = [
  { icon: 'search-outline' as const, key: 'pub.tabListings' },
  { icon: 'school-outline' as const, key: 'pub.tabSchools' },
  { icon: 'business-outline' as const, key: 'pub.tabCommunities' },
];

export default function PublicGuestProfileScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Ionicons name="person-outline" size={30} color={colors.primary} />
        </View>
        <Text style={styles.heroTitle}>{t('pub.tabMe')}</Text>
        <Text style={styles.heroSub}>{t('pub.guestHint')}</Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>{t('pub.guestHint')}</Text>
        {CAPABILITIES.map((cap) => (
          <View key={cap.key} style={styles.capRow}>
            <Ionicons name={cap.icon} size={18} color={colors.primary} />
            <Text style={styles.capText}>{t(cap.key)}</Text>
            <Ionicons name="checkmark" size={18} color={colors.success} />
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Login')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{t('pub.login')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Register')}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>{t('pub.register')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: { alignItems: 'center', paddingHorizontal: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: colors.fontSize['2xl'], fontWeight: '800', color: colors.ink, marginTop: 14 },
  heroSub: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  block: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginHorizontal: 16,
    marginTop: 24,
    ...colors.shadow.card,
  },
  blockTitle: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  capText: { flex: 1, fontSize: colors.fontSize.base, color: colors.ink2 },
  actions: { paddingHorizontal: 16, marginTop: 24, gap: 12 },
  primaryButton: {
    height: 50,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.primary,
  },
  primaryButtonText: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.primaryForeground },
  secondaryButton: {
    height: 50,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontSize: colors.fontSize.lg, fontWeight: '600', color: colors.ink },
});
