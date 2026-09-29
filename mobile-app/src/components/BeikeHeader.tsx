/**
 * BeikeHeader — 贝壳 App 风格顶部导航（适用于所有 Stack 子页面 / 详情页）。
 *
 * 布局：[返回‹]  [居中标题]  [返回主页⌂]
 * - 返回：navigation.goBack()（无可回页面时静默）。
 * - 返回主页：reset 回 Main（底部 Tab）的第一页——各角色首页 Tab。
 *
 * 本文件同时导出原生 header 用的按钮（BeikeBackButton / BeikeHomeButton），
 * 供 react-navigation native-stack 的 headerLeft / headerRight 复用；
 * BeikeHeader 默认导出为自绘顶栏页面（headerShown:false）的整体顶栏。
 *
 * 样式全部取自 theme.colors 令牌，无硬编码颜色、无 emoji。
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import { useAuthStore } from '../stores/auth';
import type { UserRole } from '../types';

/** 各角色底部「首页」Tab 名（返回主页的目标） */
const HOME_TAB: Record<UserRole, string> = {
  admin: 'AdminHome',
  partner_admin: 'PartnerHome',
  employee: 'EmployeeHome',
  agent: 'EmployeeHome',
  owner: 'Home',
  tenant: 'Home',
};

const BACK_ICON_BG = colors.alpha(colors.inkRgb, 0.06);

export function goMainHome(navigation: any) {
  const role: UserRole = useAuthStore.getState().user?.role ?? 'tenant';
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          state: { index: 0, routes: [{ name: HOME_TAB[role] }] },
        },
      ],
    }),
  );
}

/** 房屋 icon（SVG，非 emoji） */
export function HomeIcon({ size = 20, color = colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 10.5 12 3l9 7.5"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.2 9.6V20.5h5.1v-5.4h3.4v5.4h5.1V9.6"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 圆形半透明「返回」按钮（原生 header headerLeft 用） */
export function BeikeBackButton() {
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity
      style={styles.circleBtn}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => {
        if (navigation.canGoBack()) navigation.goBack();
      }}
      accessibilityRole="button"
      accessibilityLabel="返回"
    >
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d="M14.5 5l-7 7 7 7"
          fill="none"
          stroke={colors.ink}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </TouchableOpacity>
  );
}

/** 「返回主页」房屋按钮（原生 header headerRight 用） */
export function BeikeHomeButton() {
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity
      style={styles.circleBtn}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => goMainHome(navigation)}
      accessibilityRole="button"
      accessibilityLabel="返回主页"
    >
      <HomeIcon size={18} />
    </TouchableOpacity>
  );
}

interface BeikeHeaderProps {
  title?: string;
  /** 覆盖返回动作（默认 navigation.goBack()） */
  onBack?: () => void;
  /** 覆盖返回主页动作（默认 reset 回首页 Tab） */
  onHome?: () => void;
  /** 隐藏返回主页入口（比如本身就在首页场景） */
  hideHome?: boolean;
  /** 隐藏返回入口 */
  hideBack?: boolean;
}

/**
 * 自绘顶栏（headerShown:false 的 Stack 页复用）：
 * [返回‹] [居中标题] [返回主页⌂]，顶安全区自动内边距。
 */
export default function BeikeHeader({
  title,
  onBack,
  onHome,
  hideHome,
  hideBack,
}: BeikeHeaderProps) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const handleBack = onBack ?? (() => {
    if (navigation.canGoBack()) navigation.goBack();
  });
  const handleHome = onHome ?? (() => goMainHome(navigation));

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.barInner}>
        {hideBack ? <View style={styles.sideSlot} /> : (
          <TouchableOpacity style={styles.circleBtn} activeOpacity={0.7} onPress={handleBack}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path
                d="M14.5 5l-7 7 7 7"
                fill="none"
                stroke={colors.ink}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </TouchableOpacity>
        )}
        <Text style={styles.title} numberOfLines={1}>
          {title ?? ''}
        </Text>
        <View style={styles.sideSlot}>
          {!hideHome && (
            <TouchableOpacity style={styles.circleBtn} activeOpacity={0.7} onPress={handleHome}>
              <HomeIcon size={18} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  barInner: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: colors.radius.full,
    backgroundColor: BACK_ICON_BG,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: colors.fontSize.lg,
    color: colors.ink,
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  sideSlot: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});