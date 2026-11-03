/** 合同详情弹窗：基本信息 + 签署方 + 签署区 + 操作区 + 正文。 */
import React from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import LoadingState from '@/components/LoadingState';
import { useI18n } from '@/i18n';
import { KIND_LABEL_KEYS } from '../constants';
import { baseName, fmtDate, stripHtml } from '../utils';
import { styles } from '../styles';
import DetailField from './DetailField';
import PartyCard from './PartyCard';
import SignFieldCard from './SignFieldCard';
import { SourceBadge, StatusBadge } from './Badges';

interface ContractDetailModalProps {
  detail: any;
  detailLoading: boolean;
  canEdit: boolean;
  parties: any[];
  signFields: any[];
  fieldsBusy: string | boolean;
  busyAction: string | null;
  onClose: () => void;
  onShareLink: (partyId: string) => void;
  onRemoveField: (fieldId: string) => void;
  onSend: () => void;
  onAddFields: () => void;
  onVerify: () => void;
  onAddParty: () => void;
  onEdit: () => void;
  onUpload: () => void;
  onOpenSealLib: () => void;
  onDecline: () => void;
  onVoid: () => void;
}

export default function ContractDetailModal({
  detail,
  detailLoading,
  canEdit,
  parties,
  signFields,
  fieldsBusy,
  busyAction,
  onClose,
  onShareLink,
  onRemoveField,
  onSend,
  onAddFields,
  onVerify,
  onAddParty,
  onEdit,
  onUpload,
  onOpenSealLib,
  onDecline,
  onVoid,
}: ContractDetailModalProps) {
  const { t } = useI18n();

  return (
    <Modal visible={!!detail} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailWrap}>
        <View style={styles.detailHead}>
          <TouchableOpacity style={styles.detailBack} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.detailTitle} numberOfLines={1}>{detail?.title || t('contract.manage')}</Text>
          <View style={{ width: 32 }} />
        </View>
        {detailLoading ? (
          <View style={styles.center}><LoadingState label={t('contract.loadFail')} /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.detailStatusRow}>
              <SourceBadge source={detail?.source} />
              <StatusBadge status={detail?.status} />
            </View>
            <DetailField label={t('contract.titleLabel')} value={detail?.title} />
            <DetailField
              label={t('contract.kind')}
              value={
                detail?.kind
                  ? KIND_LABEL_KEYS[detail.kind]
                    ? t(KIND_LABEL_KEYS[detail.kind])
                    : detail.kind
                  : '-'
              }
            />
            <DetailField label={t('contract.created_at')} value={fmtDate(detail?.created_at)} />
            {!!detail?.file_path && <DetailField label={t('contract.upload')} value={baseName(detail.file_path)} />}

            <Text style={styles.sectionTitle}>{t('contract.parties')}</Text>
            {detail?.parties?.length ? detail.parties.map((p: any, idx: number) => (
              <PartyCard
                key={p?.id ?? idx}
                party={p}
                canEdit={canEdit}
                busyAction={busyAction}
                onShareLink={onShareLink}
              />
            )) : (
              <Text style={styles.partyNone}>{t('contract.empty')}</Text>
            )}

            <Text style={styles.sectionTitle}>{t('contract.signFields')}</Text>
            {signFields.length ? (
              <>
                <Text style={styles.fieldsTip}>{t('contract.fieldsTip')}</Text>
                <View style={styles.fieldsList}>{signFields.map((f: any, idx: number) => (
                  <SignFieldCard
                    key={f?.id ?? idx}
                    field={f}
                    parties={parties}
                    canEdit={canEdit}
                    fieldsBusy={fieldsBusy}
                    onRemove={onRemoveField}
                  />
                ))}</View>
              </>
            ) : (
              <Text style={styles.partyNone}>{t('contract.noSignFields')}</Text>
            )}

            {canEdit ? (
              <>
                <View style={styles.actionWrap}>
                  <TouchableOpacity style={[styles.actionBtn, busyAction === 'send' && styles.btnDisabled]} onPress={onSend} disabled={busyAction === 'send'}>
                    <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionBtnText}>{t('contract.sendNotice')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={onAddFields}>
                    <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionBtnText}>{t('contract.addSignField')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={onVerify}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionBtnText}>{t('contract.verify')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={onAddParty}>
                    <Ionicons name="person-add-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionBtnText}>{t('contract.addParty')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={onEdit}>
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionBtnText}>{t('contract.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={onUpload} disabled={busyAction === 'upload'}>
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionBtnText}>{t('contract.upload')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={onOpenSealLib}>
                    <Ionicons name="albums-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionBtnText}>{t('contract.signAssets')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={onDecline}>
                    <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                    <Text style={[styles.actionBtnText, { color: colors.error }]}>{t('contract.decline')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={onVoid}>
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={[styles.actionBtnText, { color: colors.error }]}>{t('contract.void')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={styles.readOnlyHint}>{t('contract.onlyEditable')}</Text>
            )}

            {!!detail?.content_html && (
              <>
                <Text style={styles.sectionTitle}>{t('contract.content')}</Text>
                <View style={styles.contentBox}>
                  <Text style={styles.contentText} selectable>{stripHtml(detail.content_html)}</Text>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
