/** 催办弹窗：可对全部未签方或指定签署方催办，同一方 24 小时内只发一次。 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { ROLE_META } from '../constants';
import { styles } from '../styles';

interface RemindModalProps {
  visible: boolean;
  onClose: () => void;
  parties: any[];
  selectedPartyId: string;
  setSelectedPartyId: (id: string) => void;
  busy: boolean;
  onSubmit: () => void;
}

export default function RemindModal({
  visible,
  onClose,
  parties,
  selectedPartyId,
  setSelectedPartyId,
  busy,
  onSubmit,
}: RemindModalProps) {
  const { t } = useI18n();
  const pendingParties = parties.filter((p) => !p?.signed && !p?.declined_at);

  const chip = (key: string, label: string) => {
    const active = selectedPartyId === key;
    return (
      <TouchableOpacity
        key={key || 'all'}
        style={[styles.remindChip, active && styles.remindChipActive]}
        activeOpacity={0.8}
        onPress={() => setSelectedPartyId(key)}
      >
        <Text style={[styles.remindChipText, active && styles.remindChipTextActive]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.remindTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.voidHint}>{t('contract.remindHint')}</Text>
          <ScrollView style={styles.remindList} contentContainerStyle={styles.remindListContent}>
            {chip('', t('contract.remindAll'))}
            {pendingParties.map((p) =>
              chip(
                String(p.id),
                `${p.name || p.email || t('contract.unknown')} · ${t(ROLE_META[p.role] ?? 'contract.roleOther')}`,
              ),
            )}
          </ScrollView>
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            activeOpacity={0.85}
            disabled={busy}
            onPress={onSubmit}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('contract.remind')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
