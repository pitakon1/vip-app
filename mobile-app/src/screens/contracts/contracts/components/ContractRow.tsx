/** 合同列表行（图标 + 标题 + 来源/状态徽标）。 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { SOURCE_META } from '../constants';
import { styles } from '../styles';
import type { ContractItem } from '../types';
import { SourceBadge, StatusBadge } from './Badges';

export default function ContractRow({ item, onPress }: { item: ContractItem; onPress: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      onPress={() => onPress(item.id)}
    >
      <View style={styles.rowIcon}>
        <Ionicons
          name={(SOURCE_META[item.source ?? ''] ?? SOURCE_META.generated).icon}
          size={20}
          color={(SOURCE_META[item.source ?? ''] ?? SOURCE_META.generated).color}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title || t('contract.unknown')}</Text>
        <View style={styles.rowMeta}>
          <SourceBadge source={item.source} />
          <StatusBadge status={item.status} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </TouchableOpacity>
  );
}
