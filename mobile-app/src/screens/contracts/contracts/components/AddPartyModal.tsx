/** 追加签署方弹窗。 */
import React from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { ROLE_META } from '../constants';
import { styles } from '../styles';
import type { PartyForm } from '../types';

interface AddPartyModalProps {
  visible: boolean;
  onClose: () => void;
  partyForm: PartyForm;
  setPartyForm: (form: PartyForm) => void;
  partyBusy: boolean;
  onSubmit: () => void;
}

export default function AddPartyModal({
  visible,
  onClose,
  partyForm,
  setPartyForm,
  partyBusy,
  onSubmit,
}: AddPartyModalProps) {
  const { t } = useI18n();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.addParty')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <TextInput style={styles.input} placeholder={t('contract.name')} value={partyForm.name} onChangeText={(v) => setPartyForm({ ...partyForm, name: v })} placeholderTextColor={colors.ink3} />
          <TextInput style={styles.input} placeholder={t('contract.email')} keyboardType="email-address" value={partyForm.email} onChangeText={(v) => setPartyForm({ ...partyForm, email: v })} placeholderTextColor={colors.ink3} />
          <View style={styles.langRow}>
            {(['tenant', 'landlord', 'witness'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, partyForm.role === r && styles.chipActive]}
                onPress={() => setPartyForm({ ...partyForm, role: r })}
              >
                <Text style={[styles.chipText, partyForm.role === r && styles.chipTextActive]}>
                  {t(ROLE_META[r] ?? 'contract.roleOther')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.primaryBtn, partyBusy && styles.btnDisabled]} activeOpacity={0.85} disabled={partyBusy} onPress={onSubmit}>
            {partyBusy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>{t('contract.confirm')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
