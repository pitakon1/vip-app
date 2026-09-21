/**
 * C 端筛选 chip 与徽章（学校列表 / 小区列表 / 房源筛选共用）。
 *
 * 抽成独立组件而不是各页各写一份：三个页面的筛选视觉必须一致，
 * 否则同一套 chip 在不同页有不同高度/配色，用户会以为是两套东西。
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import colors from '@/theme/colors';

export function Chip({
  label,
  active,
  onPress,
  style,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  style?: object;
}) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive, style]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Badge({ text, primary }: { text: string; primary?: boolean }) {
  return (
    <View style={[styles.badge, primary && styles.badgePrimary]}>
      <Text style={[styles.badgeText, primary && styles.badgeTextPrimary]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 32,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  badge: {
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgePrimary: { backgroundColor: colors.sidebarActive },
  badgeText: { fontSize: colors.fontSize.xs, color: colors.ink2 },
  badgeTextPrimary: { color: colors.accent, fontWeight: '600' },
});
