/** 拒签弹窗：选择未签且未拒签的签署方 + 填写原因。 */
import React from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { styles } from '../styles';

interface DeclineModalProps {
  visible: boolean;
  onClose: () => void;
  parties: any[];
  declinePartyId: string;
  setDeclinePartyId: (id: string) => void;
  declineReason: string;
  setDeclineReason: (reason: string) => void;
  declineBusy: boolean;
  onSubmit: () => void;
}

export default function DeclineModal({
  visible,
  onClose,
  parties,
  declinePartyId,
  setDeclinePartyId,
  declineReason,
  setDeclineReason,
  declineBusy,
  onSubmit,
}: DeclineModalProps) {
  const { t } = useI18n();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.declineTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.fieldSectionTitle}>{t('contract.fieldSelectParty')}</Text>
          <View style={styles.langRow}>
            {parties.filter((p: any) => !!p?.id && !p?.signed && !p?.declined_at).map((p: any) => {
              const active = declinePartyId === String(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.8}
                  onPress={() => setDeclinePartyId(String(p.id))}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {p?.name || t('contract.unknown')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('contract.declineReasonPh')}
            value={declineReason}
            onChangeText={setDeclineReason}
            multiline
            textAlignVertical="top"
            placeholderTextColor={colors.ink3}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, styles.declineConfirmBtn, declineBusy && styles.btnDisabled]}
            activeOpacity={0.85}
            disabled={declineBusy || !declinePartyId}
            onPress={onSubmit}
          >
            {declineBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.declineConfirmText}>{t('contract.decline')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
