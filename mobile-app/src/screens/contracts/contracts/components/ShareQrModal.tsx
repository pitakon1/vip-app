/** 签署二维码弹窗：按签署方生成免登录链接并展示二维码。
 *
 * 后端「生成链接」会覆盖该签署方的旧 token，因此这里把动作明确标成
 * 「生成/刷新二维码」，旧链接会立即失效，避免用户误以为可以并行使用。
 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { ROLE_META } from '../constants';
import { styles } from '../styles';

interface ShareQrModalProps {
  visible: boolean;
  onClose: () => void;
  parties: any[];
  selectedPartyId: string;
  setSelectedPartyId: (id: string) => void;
  busy: boolean;
  link: string | null;
  onGenerate: () => void;
  onCopy: () => void;
}

export default function ShareQrModal({
  visible,
  onClose,
  parties,
  selectedPartyId,
  setSelectedPartyId,
  busy,
  link,
  onGenerate,
  onCopy,
}: ShareQrModalProps) {
  const { t } = useI18n();
  const pendingParties = parties.filter((p) => !p?.signed && !p?.declined_at);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.qrTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.voidHint}>{t('contract.qrHint')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.remindListContent}
          >
            {pendingParties.map((p) => {
              const key = String(p.id);
              const active = selectedPartyId === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.remindChip, active && styles.remindChipActive]}
                  activeOpacity={0.8}
                  onPress={() => setSelectedPartyId(key)}
                >
                  <Text
                    style={[styles.remindChipText, active && styles.remindChipTextActive]}
                    numberOfLines={1}
                  >
                    {`${p.name || p.email || t('contract.unknown')} · ${t(
                      ROLE_META[p.role] ?? 'contract.roleOther',
                    )}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.qrBox}>
            {link ? (
              <QRCode value={link} size={168} backgroundColor="#fff" />
            ) : (
              <Text style={styles.qrEmpty}>{t('contract.qrEmpty')}</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            activeOpacity={0.85}
            disabled={busy || !selectedPartyId}
            onPress={onGenerate}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {link ? t('contract.qrRefresh') : t('contract.qrGenerate')}
              </Text>
            )}
          </TouchableOpacity>
          {link ? (
            <TouchableOpacity style={styles.qrCopyBtn} activeOpacity={0.8} onPress={onCopy}>
              <Ionicons name="copy-outline" size={14} color={colors.primary} />
              <Text style={styles.miniBtnText}>{t('contract.copyLink')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
