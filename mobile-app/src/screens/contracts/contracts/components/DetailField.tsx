/** 详情/验签报告共用的「标签 - 值」行。 */
import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../styles';

export default function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} selectable>{value || '-'}</Text>
    </View>
  );
}
