import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface EmptyStateProps {
  icon?: IoniconName;
  title: string;
  sub?: string;
  /** empty=空态；error=失败态（图标与语义区分，配 actionLabel 作为重试入口） */
  tone?: 'empty' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

/** 统一空态/失败态：图标 + 主文案 + 副文案 + 可选操作，避免裸文字空占位。
 *  与 Web `DataState`（.rent-state）同构：44 圆形描边图标 + 标题 + 副文案 + 可选操作，
 *  仅按移动端令牌换算尺寸，不共享组件。 */
export default function EmptyState({
  icon,
  title,
  sub,
  tone = 'empty',
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const resolvedIcon = icon ?? (tone === 'error' ? 'alert-circle-outline' : 'file-tray-outline');
  return (
    <View style={styles.wrap} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      <View style={[styles.iconWrap, tone === 'error' && styles.iconWrapError]}>
        <Ionicons
          name={resolvedIcon}
          size={20}
          color={tone === 'error' ? colors.error : colors.ink3}
        />
      </View>
      <Text style={[styles.title, tone === 'error' && styles.titleError]}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.action} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: colors.spacing.huge,
    paddingHorizontal: colors.spacing.xl,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: colors.spacing.md,
  },
  iconWrapError: {
    borderColor: colors.error,
  },
  title: {
    fontSize: colors.fontSize.base,
    lineHeight: colors.lineHeight.snug,
    color: colors.ink,
    fontWeight: colors.fontWeight.semibold,
  },
  titleError: {
    color: colors.error,
  },
  sub: {
    fontSize: colors.fontSize.sm,
    lineHeight: colors.lineHeight.snug,
    color: colors.ink3,
    marginTop: colors.spacing.sm,
    textAlign: 'center',
  },
  action: {
    minHeight: colors.touch.min,
    marginTop: colors.spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: colors.spacing.md,
    paddingHorizontal: colors.spacing.xxl,
    borderRadius: colors.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.primary,
  },
  actionText: {
    color: colors.primaryForeground,
    fontSize: colors.fontSize.base,
    fontWeight: colors.fontWeight.semibold,
    letterSpacing: 0.3,
  },
});