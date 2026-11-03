/** 作废合同弹窗。 */
import React from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { styles } from '../styles';

interface VoidContractModalProps {
  visible: boolean;
  onClose: () => void;
  voidReason: string;
  setVoidReason: (reason: string) => void;
  voidBusy: boolean;
  onSubmit: () => void;
}

export default function VoidContractModal({
  visible,
  onClose,
  voidReason,
  setVoidReason,
  voidBusy,
  onSubmit,
}: VoidContractModalProps) {
  const { t } = useI18n();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.voidTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.voidHint}>{t('contract.voidConfirm')}</Text>
          <TextInput style={styles.input} placeholder={t('contract.voidReason')} value={voidReason} onChangeText={setVoidReason} placeholderTextColor={colors.ink3} />
          <TouchableOpacity style={[styles.primaryBtn, styles.dangerBtn, voidBusy && styles.btnDisabled]} activeOpacity={0.85} disabled={voidBusy} onPress={onSubmit}>
            {voidBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerBtnText}>{t('contract.void')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
