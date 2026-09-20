import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';

interface Props {
  loading: boolean;
  onGoogle: () => void;
  onApple: () => void;
}

/**
 * Google / Apple 一键登录大按钮，复用注册页的 Reddit 式样式
 * （白底浅灰边框胶囊，图标左置）。底部接「或」分隔，供注册/登录页共用。
 */
export default function OAuthButtons({ loading, onGoogle, onApple }: Props) {
  return (
    <View style={styles.group}>
      <TouchableOpacity
        style={styles.btn}
        onPress={onGoogle}
        disabled={loading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="使用 Google 登录"
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.ink2} style={styles.icon} />
        ) : (
          <FontAwesome5 name="google" size={17} color="#4285F4" style={styles.icon} />
        )}
        <Text style={styles.text}>使用 Google 登录</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.btn}
        onPress={onApple}
        disabled={loading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="使用 Apple 登录"
      >
        <Ionicons name="logo-apple" size={18} color="#000000" style={styles.icon} />
        <Text style={styles.text}>使用 Apple 登录</Text>
      </TouchableOpacity>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>或</Text>
        <View style={styles.dividerLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12, marginBottom: 4 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: colors.radius.full,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.fieldFillBorder,
  },
  icon: { position: 'absolute', left: 16 },
  text: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.fieldFillBorder,
  },
  dividerText: { fontSize: 13, color: colors.ink3 },
});