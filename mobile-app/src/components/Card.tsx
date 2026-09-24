import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import colors from '../theme/colors';

interface CardProps {
  title?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
  titleStyle?: TextStyle;
}

export default function Card({ title, children, style, titleStyle }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={[styles.title, titleStyle]}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: colors.spacing.lg, // 16
    marginVertical: colors.spacing.sm, // 8
    marginHorizontal: colors.spacing.md, // 12
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  title: {
    fontSize: colors.fontSize.lg, // 16
    fontWeight: '700',
    color: colors.ink,
    marginBottom: colors.spacing.md, // 12
    letterSpacing: -0.2,
  },
});
