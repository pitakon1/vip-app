/** 生成合同弹窗：模板选择 + 范本预览 + 字段填写 + 语言。 */
import React from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { FIELD_META, FALLBACK_TEMPLATES, KIND_FIELDS, LANG_OPTIONS } from '../constants';
import { styles } from '../styles';
import type { ContractTemplate, GenerateForm } from '../types';

interface GenerateContractModalProps {
  visible: boolean;
  onClose: () => void;
  templates: ContractTemplate[];
  genKind: string;
  setGenKind: (kind: string) => void;
  genLang: string;
  setGenLang: (lang: string) => void;
  genForm: GenerateForm;
  setGenForm: (form: GenerateForm) => void;
  generating: boolean;
  onSubmit: () => void;
  genPreviewText: string;
}

export default function GenerateContractModal({
  visible,
  onClose,
  templates,
  genKind,
  setGenKind,
  genLang,
  setGenLang,
  genForm,
  setGenForm,
  generating,
  onSubmit,
  genPreviewText,
}: GenerateContractModalProps) {
  const { t } = useI18n();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.generateTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldSectionTitle}>{t('contract.formTemplate')}</Text>
            <View style={styles.langRow}>
              {(templates.length ? templates : FALLBACK_TEMPLATES).map((item) => {
                const active = genKind === item.kind;
                return (
                  <TouchableOpacity
                    key={item.kind}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.8}
                    onPress={() => setGenKind(item.kind)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(`contract.tmpl.${item.kind}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.genPreviewBox}>
              <Text style={styles.genPreviewTitle}>{t('contract.templatePreview')}</Text>
              <ScrollView style={styles.genPreviewScroll} nestedScrollEnabled>
                <Text style={styles.genPreviewText} selectable>{genPreviewText}</Text>
              </ScrollView>
            </View>
            {(KIND_FIELDS[genKind] ?? []).map((f) => {
              const meta = FIELD_META[f];
              return (
                <TextInput
                  key={f}
                  style={styles.input}
                  placeholder={t(meta.labelKey)}
                  keyboardType={meta.numeric ? 'numeric' : 'default'}
                  value={genForm[f]}
                  onChangeText={(v) => setGenForm({ ...genForm, [f]: v })}
                  placeholderTextColor={colors.ink3}
                />
              );
            })}
            <View style={styles.langRow}>
              {LANG_OPTIONS.map((opt) => {
                const active = genLang === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setGenLang(opt.value)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, generating && styles.btnDisabled]}
              activeOpacity={0.85}
              disabled={generating}
              onPress={onSubmit}
            >
              {generating ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('contract.generateSubmit')}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
