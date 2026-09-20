import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import type { RootStackParamList } from '@/navigation/RootNavigator';

export default function FeatureNotAvailableScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'FeatureNotAvailable'>>();
  const { t } = useI18n();
  const feature = route.params?.feature;
  const hint = route.params?.hint;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.iconBox}>
        <Ionicons name="lock-closed" size={40} color={colors.primary} />
      </View>
      <Text style={styles.title}>{t('profile.notAvailable')}</Text>
      <Text style={styles.desc}>
        {feature ? `「${feature}」` : ''}
        {hint ?? t('profile.notAvailableFeatureLocked')}
      </Text>
      <TouchableOpacity
        style={styles.backBtn}
        activeOpacity={0.8}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
      >
        <Text style={styles.backText}>{t('common.back')}</Text>
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
    backgroundColor: colors.sidebarActive,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 10,
  },
  desc: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.ink3,
    marginBottom: 28,
  },
  backBtn: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});