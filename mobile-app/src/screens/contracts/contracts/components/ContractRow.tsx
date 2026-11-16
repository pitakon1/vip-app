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
  // D-07：列表直接给出合同编号、关联租约、金额与创建时间，避免多张卡片无法区分
  const metaLine = [
    item.contract_no ? `${t('contract.no')} ${item.contract_no}` : '',
    item.lease_no ? `${t('contract.lease')} ${item.lease_no}` : '',
  ].filter(Boolean).join(' · ');
  const amountLine = [
    item.amount != null ? `${t('contract.amount')} ${item.currency || 'THB'} ${Number(item.amount).toLocaleString()}` : '',
    item.created_at ? `${t('contract.created_at')} ${String(item.created_at).slice(0, 10)}` : '',
  ].filter(Boolean).join(' · ');
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
        {!!metaLine && <Text style={styles.rowSub} numberOfLines={1}>{metaLine}</Text>}
        {!!amountLine && <Text style={styles.rowSub} numberOfLines={1}>{amountLine}</Text>}
        <View style={styles.rowMeta}>
          <SourceBadge source={item.source} />
          <StatusBadge status={item.status} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </TouchableOpacity>
  );
}
