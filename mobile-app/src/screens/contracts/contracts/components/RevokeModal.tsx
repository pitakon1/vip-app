/** 撤回合同弹窗：撤回后合同进入「已撤回」终态，已发出的签署链接全部失效且不可恢复。 */
import React from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { styles } from '../styles';

interface RevokeModalProps {
  visible: boolean;
  onClose: () => void;
  reason: string;
  setReason: (reason: string) => void;
  busy: boolean;
  onSubmit: () => void;
}

export default function RevokeModal({
  visible,
  onClose,
  reason,
  setReason,
  busy,
  onSubmit,
}: RevokeModalProps) {
  const { t } = useI18n();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.revokeTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.voidHint}>{t('contract.revokeConfirm')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('contract.revokeReason')}
            value={reason}
            onChangeText={setReason}
            placeholderTextColor={colors.ink3}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, styles.dangerBtn, busy && styles.btnDisabled]}
            activeOpacity={0.85}
            disabled={busy}
            onPress={onSubmit}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.dangerBtnText}>{t('contract.revoke')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
