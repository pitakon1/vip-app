import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';

interface Props {
  loading: boolean;
  mode?: 'login' | 'register';
  onGoogle: () => void;
  onApple: () => void;
  onPhone: () => void;
  onEmail: () => void;
}

/**
 * Google 官方四色品牌 G（Reddit 方式选择屏同款）。
 * 使用官方 SVG path（viewBox 48），配色 #FBBC05/#EA4335/#34A853/#4285F4 与 Web 端一致。
 */
function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <View style={styles.icon}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path
          fill="#FBBC05"
          d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
        />
        <Path
          fill="#EA4335"
          d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
        />
        <Path
          fill="#34A853"
          d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
        />
        <Path
          fill="#4285F4"
          d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
        />
      </Svg>
    </View>
  );
}

/**
 * Reddit 式「方式选择」按钮列表：Google / Apple 一键登录 +「或」分隔 + 手机号/邮箱入口。
 * 统一整宽白色胶囊（白底、浅灰边框、全圆角、约 52px），图标最左、文字居中。
 * 登录/注册页做成 `stage='choose'` 时共用。
 */
export default function OAuthButtons({
  loading,
  mode = 'login',
  onGoogle,
  onApple,
  onPhone,
  onEmail,
}: Props) {
  const goog = mode === 'register' ? '使用 Google 注册' : '使用 Google 登录';
  const apple = mode === 'register' ? '使用 Apple 注册' : '使用 Apple 登录';
  const phone = mode === 'register' ? '使用手机号注册' : '使用手机号登录';
  const email = mode === 'register' ? '使用邮箱注册' : '使用邮箱登录';

  return (
    <View style={styles.group}>
      <TouchableOpacity
        style={styles.btn}
        onPress={onGoogle}
        disabled={loading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={goog}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.ink2} style={styles.icon} />
        ) : (
          <GoogleG size={20} />
        )}
        <Text style={styles.text}>{goog}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.btn}
        onPress={onApple}
        disabled={loading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={apple}
      >
        <Ionicons name="logo-apple" size={18} color="#000000" style={styles.icon} />
        <Text style={styles.text}>{apple}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.btn}
        onPress={onPhone}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={phone}
      >
        <Ionicons name="phone-portrait-outline" size={19} color={colors.ink2} style={styles.icon} />
        <Text style={styles.text}>{phone}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.btn}
        onPress={onEmail}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={email}
      >
        <Ionicons name="mail-outline" size={20} color={colors.ink2} style={styles.icon} />
        <Text style={styles.text}>{email}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
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
});