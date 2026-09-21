import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface EmptyStateProps {
  icon?: IoniconName;
  title: string;
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** 统一空态：图标 + 主文案 + 副文案 + 可选操作，避免裸文字空占位 */
export default function EmptyState({ icon = 'file-tray-outline', title, sub, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={30} color={colors.mutedForeground} />
      </View>
      <Text style={styles.title}>{title}</Text>
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
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 16, color: colors.ink, fontWeight: '700', letterSpacing: -0.1 },
  sub: { fontSize: 13, color: colors.ink3, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  action: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: colors.radius.full,
    ...colors.shadow.primary,
  },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
});