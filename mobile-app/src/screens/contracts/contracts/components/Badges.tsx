/** 来源 / 状态徽标（列表与详情共用）。 */
import React from 'react';
import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n';
import { SOURCE_META, STATUS_META } from '../constants';
import { styles } from '../styles';

export function SourceBadge({ source }: { source?: string }) {
  const { t } = useI18n();
  const meta = SOURCE_META[source ?? ''] ?? SOURCE_META.generated;
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Ionicons
        name={meta.icon}
        size={11}
        color={meta.color}
        style={{ marginRight: 3 }}
      />
      <Text style={[styles.badgeText, { color: meta.color }]}>{t(meta.labelKey)}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const { t } = useI18n();
  const meta = STATUS_META[status ?? ''] ?? STATUS_META.draft;
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>
        {t(`contract.status.${status ?? 'draft'}`)}
      </Text>
    </View>
  );
}
