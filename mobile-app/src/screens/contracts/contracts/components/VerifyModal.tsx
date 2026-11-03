/** 验签报告弹窗。 */
import React from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import LoadingState from '@/components/LoadingState';
import { useI18n } from '@/i18n';
import { VERIFY_METHOD_LABEL } from '../constants';
import { fmtDate, fmtSignTypesSummary } from '../utils';
import { styles } from '../styles';
import DetailField from './DetailField';

interface VerifyModalProps {
  verifyData: any;
  verifyLoading: boolean;
  onClose: () => void;
}

export default function VerifyModal({ verifyData, verifyLoading, onClose }: VerifyModalProps) {
  const { t } = useI18n();

  return (
    <Modal visible={!!verifyData} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={[styles.modalCard, styles.modalCardTall]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.verifyTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          {verifyLoading ? (
            <View style={styles.center}><LoadingState label={t('contract.verify')} /></View>
          ) : (
            <ScrollView>
              {verifyData?.tampered != null && (
                <View style={[styles.badge, { alignSelf: 'flex-start', marginBottom: 12, backgroundColor: verifyData.tampered ? colors.alpha(colors.errorRgb, 0.12) : colors.alpha(colors.successRgb, 0.12) }]}>
                  <Text style={[styles.badgeText, { color: verifyData.tampered ? colors.error : colors.success }]}>
                    {t(verifyData.tampered ? 'contract.verifyTampered' : 'contract.verifyIntact')}
                  </Text>
                </View>
              )}
              {verifyData?.document_hash != null && <DetailField label={t('contract.verifyDocumentHash')} value={String(verifyData.document_hash)} />}
              {!!verifyData?.sign_types_summary && <DetailField label={t('contract.verifySignTypes')} value={fmtSignTypesSummary(t, verifyData.sign_types_summary)} />}
              <Text style={styles.sectionTitle}>{t('contract.verifySignatures')}</Text>
              {Array.isArray(verifyData?.signatures) && verifyData.signatures.length ? (
                verifyData.signatures.map((sig: any, idx: number) => (
                  <View key={idx} style={styles.partyCard}>
                    <DetailField label={t('contract.verifyMethod')} value={sig?.method ? (VERIFY_METHOD_LABEL[sig.method] ? t(VERIFY_METHOD_LABEL[sig.method]) : String(sig.method)) : '-'} />
                    <DetailField label={t('contract.verifySignedAt')} value={fmtDate(sig?.signed_at)} />
                    <DetailField label={t('contract.verifyIp')} value={String(sig?.ip ?? '-')} />
                    <DetailField label={t('contract.verifyHash')} value={String(sig?.signature_hash ?? '-')} />
                    <DetailField label={t('contract.verifySigResultId')} value={t(sig?.signature_success ? 'contract.verifyOk' : 'contract.verifyFail')} />
                  </View>
                ))
              ) : (
                <Text style={styles.partyNone}>{t('contract.verifyNoSig')}</Text>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
