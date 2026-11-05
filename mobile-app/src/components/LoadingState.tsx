import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import colors from '@/theme/colors';

/** 统一加载态：居中加载指示 + 简短说明 */
export default function LoadingState({ label = '加载中…' }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: colors.spacing.xxxl * 2 },
  label: {
    fontSize: colors.fontSize.sm,
    lineHeight: colors.lineHeight.snug,
    color: colors.ink3,
    marginTop: colors.spacing.lg,
    fontWeight: colors.fontWeight.medium,
  },
});