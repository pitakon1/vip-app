/** 合同详情里的签署方卡片（含复制签署链接）。 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { ROLE_META } from '../constants';
import { fmtDate } from '../utils';
import { styles } from '../styles';

interface PartyCardProps {
  party: any;
  canEdit: boolean;
  busyAction: string | null;
  onShareLink: (partyId: string) => void;
}

export default function PartyCard({ party: p, canEdit, busyAction, onShareLink }: PartyCardProps) {
  const { t } = useI18n();
  const statusMeta = p?.signed
    ? { labelKey: 'contract.signed', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) }
    : p?.declined_at
    ? { labelKey: 'contract.declined', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) }
    : { labelKey: 'contract.unsigned', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) };
  return (
    <View style={styles.partyCard}>
      <View style={styles.partyHead}>
        <View style={styles.partyId}>
          <Text style={styles.partyName}>{p?.name || t('contract.unknown')}</Text>
          {p?.role ? <Text style={styles.partyRole}>{t(ROLE_META[p.role] ?? 'contract.roleOther')}</Text> : null}
        </View>
        <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
          <Text style={[styles.badgeText, { color: statusMeta.color }]}>{t(statusMeta.labelKey)}</Text>
        </View>
      </View>
      {!!p?.email && <Text style={styles.partyMeta}>{`${t('contract.email')}：${p.email}`}</Text>}
      {!!p?.phone && <Text style={styles.partyMeta}>{`${t('contract.phone')}：${p.phone}`}</Text>}
      {!!p?.signed_at && <Text style={styles.partyMeta}>{`${t('contract.signedAt')}：${fmtDate(p.signed_at)}`}</Text>}
      {!!p?.decline_reason && <Text style={[styles.partyMeta, styles.partyDecline]}>{`${t('contract.declineReason')}：${p.decline_reason}`}</Text>}
      {canEdit && !p?.signed && !!p?.id ? (
        <View style={styles.partyActions}>
          <TouchableOpacity
            style={styles.miniBtn}
            activeOpacity={0.8}
            disabled={busyAction === `link-${p.id}`}
            onPress={() => onShareLink(String(p.id))}
          >
            {busyAction === `link-${p.id}` ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="link-outline" size={14} color={colors.primary} />
                <Text style={styles.miniBtnText}>{t('contract.copyLink')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
