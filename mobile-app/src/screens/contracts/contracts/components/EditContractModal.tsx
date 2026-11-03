/** 编辑合同弹窗（标题 + 正文）。 */
import React from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { styles } from '../styles';

interface EditContractModalProps {
  visible: boolean;
  onClose: () => void;
  editForm: { title: string; content_html: string };
  setEditForm: (form: { title: string; content_html: string }) => void;
  editBusy: boolean;
  onSubmit: () => void;
}

export default function EditContractModal({
  visible,
  onClose,
  editForm,
  setEditForm,
  editBusy,
  onSubmit,
}: EditContractModalProps) {
  const { t } = useI18n();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={[styles.modalCard, styles.modalCardTall]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.editContent')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <TextInput style={styles.input} placeholder={t('contract.titleLabel')} value={editForm.title} onChangeText={(v) => setEditForm({ ...editForm, title: v })} placeholderTextColor={colors.ink3} />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('contract.contentLabel')}
            value={editForm.content_html}
            onChangeText={(v) => setEditForm({ ...editForm, content_html: v })}
            placeholderTextColor={colors.ink3}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity style={[styles.primaryBtn, editBusy && styles.btnDisabled]} activeOpacity={0.85} disabled={editBusy} onPress={onSubmit}>
            {editBusy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>{t('contract.save')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
