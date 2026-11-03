/** 手写签名画板弹窗（写完「使用该签名」入库并回填）。 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import SignaturePad from '@/components/SignaturePad';
import { useI18n } from '@/i18n';
import { styles } from '../styles';

interface SignMakeModalProps {
  visible: boolean;
  onClose: () => void;
  onResult: (svg: string) => void;
  svgRef: { current: any };
  onUse: () => void;
}

export default function SignMakeModal({ visible, onClose, onResult, svgRef, onUse }: SignMakeModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalMask}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t('contract.makeSign')}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <SignaturePad
            key={String(visible)}
            onResult={onResult}
            svgRef={svgRef}
          />
          <View style={styles.drawPadActions}>
            <TouchableOpacity
              style={styles.drawPadUseBtn}
              activeOpacity={0.85}
              onPress={onUse}
            >
              <Text style={styles.drawPadUseText}>{t('contract.useThisSign')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
