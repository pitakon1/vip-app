/** 已保存签署区卡片（详情与「放置签署区」左栏共用）。 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { SIGN_TYPE_META } from '../constants';
import { fmtDate } from '../utils';
import { styles } from '../styles';

interface SignFieldCardProps {
  field: any;
  parties: any[];
  canEdit: boolean;
  fieldsBusy: string | boolean;
  onRemove: (fieldId: string) => void;
}

export default function SignFieldCard({ field: f, parties, canEdit, fieldsBusy, onRemove }: SignFieldCardProps) {
  const { t } = useI18n();
  const meta = SIGN_TYPE_META[f?.field_type ?? 'signature'] ?? SIGN_TYPE_META.signature;
  const party = parties.find((p: any) => String(p?.id) === String(f?.party_id));
  const signed = !!f?.signed;
  const statusColor = signed ? colors.success : colors.warning;
  const statusBg = signed
    ? colors.alpha(colors.successRgb, 0.12)
    : colors.alpha(colors.warningRgb, 0.12);
  return (
    <View style={styles.fieldCard}>
      <Ionicons name={meta.icon} size={18} color={colors.primary} />
      <View style={styles.fieldBody}>
        <Text style={styles.fieldName} numberOfLines={1}>
          {t(meta.labelKey)} · {party?.name || t('contract.unknown')}
        </Text>
        <Text style={styles.fieldMeta}>
          {t('contract.hitOnPage', { page: f?.page ?? 1 })}
        </Text>
        {!!f?.signed_at && (
          <Text style={styles.fieldMeta}>
            {t('contract.signedAt')}{t('common.colon')}{fmtDate(f.signed_at)}
          </Text>
        )}
      </View>
      <View style={styles.fieldRight}>
        <View style={[styles.badge, { backgroundColor: statusBg }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>
            {t(signed ? 'contract.fieldDone' : 'contract.fieldPending')}
          </Text>
        </View>
        {canEdit && !signed && !!f?.id && (
          <TouchableOpacity
            style={styles.miniDelBtn}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={fieldsBusy === `ff-${f.id}`}
            onPress={() => onRemove(String(f.id))}
          >
            {fieldsBusy === `ff-${f.id}` ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Ionicons name="trash-outline" size={15} color={colors.error} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
