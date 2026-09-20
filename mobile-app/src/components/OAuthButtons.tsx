import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';

interface Props {
  loading: boolean;
  onGoogle: () => void;
  onApple: () => void;
  onPhone: () => void;
  onEmail: () => void;
}

/**
 * Google 官方四色品牌 G（Reddit 式方式选择屏使用）。
 * 无第三方 SVG 依赖，用官方四色 #EA4335/#FBBC05/#34A853/#4285F4 拼出的品牌字形：
 * 蓝色顶部外环 + 黄色对角竖 + 红色短横底 + 绿色长横底。
 */
function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <View style={[styles.gBox, { width: size, height: size }]}>
      <View
        style={[
          styles.gBlue,
          { width: size, height: size, borderRadius: size / 2, borderWidth: size * 0.21 },
        ]}
      />
      <View
        style={[
          styles.gMask,
          { left: 0, top: size * 0.5, width: size, height: size * 0.5 + 1 },
        ]}
      >
        <View
          style={[
            styles.gYellow,
            {
              left: size * 0.32,
              top: size * 0.3,
              width: size * 0.26,
              height: size * 0.68,
            },
          ]}
        />
        <View
          style={[
            styles.gGreen,
            {
              left: size * 0.12,
              top: size * 0.68,
              width: size * 0.76,
              height: size * 0.22,
              borderRadius: size * 0.11,
            },
          ]}
        />
        <View
          style={[
            styles.gRed,
            {
              left: size * 0.12,
              top: size * 0.68,
              width: size * 0.32,
              height: size * 0.22,
              borderRadius: size * 0.11,
            },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * Reddit 式「方式选择」按钮列表：Google / Apple 一键登录 +「或」分隔 + 手机号/邮箱入口。
 * 统一整宽白色胶囊（白底、浅灰边框、全圆角、约 52px），图标最左、文字居中。
 * 登录/注册页做成 `stage='choose'` 时共用。
 */
export default function OAuthButtons({ loading, onGoogle, onApple, onPhone, onEmail }: Props) {
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
          <View style={styles.icon}>
            <GoogleG size={20} />
          </View>
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

      <TouchableOpacity
        style={styles.btn}
        onPress={onPhone}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="使用手机号登录"
      >
        <Ionicons name="phone-portrait-outline" size={19} color={colors.ink2} style={styles.icon} />
        <Text style={styles.text}>使用手机号登录</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.btn}
        onPress={onEmail}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="使用邮箱登录"
      >
        <Ionicons name="mail-outline" size={20} color={colors.ink2} style={styles.icon} />
        <Text style={styles.text}>使用邮箱登录</Text>
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.fieldFillBorder,
  },
  dividerText: { fontSize: 13, color: colors.ink3 },
  // ---- Google G 四色字形 ----
  gBox: { position: 'relative', overflow: 'hidden' },
  gBlue: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderColor: '#4285F4',
  },
  gMask: { position: 'absolute', backgroundColor: '#ffffff' },
  gYellow: {
    position: 'absolute',
    backgroundColor: '#FBBC05',
    transform: [{ rotate: '-30deg' }],
  },
  gGreen: { position: 'absolute', backgroundColor: '#34A853' },
  gRed: { position: 'absolute', backgroundColor: '#EA4335' },
});