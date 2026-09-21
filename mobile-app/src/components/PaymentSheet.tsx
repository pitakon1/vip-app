import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { fmtMoney } from '@/utils/format';

interface Props {
  visible: boolean;
  /** 扫码支付内容（PromptPay / 微信 / 支付宝 等） */
  qr: string;
  amount?: number;
  currency?: string;
  channelLabel?: string;
  onClose: () => void;
}

/** 扫码支付弹层：展示待付金额与二维码，供用户用支付应用扫描 */
export default function PaymentSheet({ visible, qr, amount, currency, channelLabel, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.mask}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>扫码支付</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="关闭">
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          <View style={styles.amountWrap}>
            <Text style={styles.amountLabel}>待支付金额</Text>
            <Text style={styles.amount}>{fmtMoney(amount, currency)}</Text>
          </View>
          <View style={styles.qrBox}>
            <QRCode value={qr} size={200} backgroundColor="#ffffff" color="#111827" />
          </View>
          <Text style={styles.hint}>
            请使用 {channelLabel || '您的支付应用'} 扫描二维码完成支付
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.45),
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: colors.spacing.lg,
    paddingBottom: colors.spacing.xxl,
    alignItems: 'center',
  },
  head: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: colors.spacing.md,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  amountWrap: { alignItems: 'center', marginBottom: colors.spacing.lg },
  amountLabel: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  amount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  qrBox: {
    padding: colors.spacing.lg,
    backgroundColor: '#ffffff',
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    fontSize: colors.fontSize.sm,
    color: colors.ink2,
    marginTop: colors.spacing.lg,
    textAlign: 'center',
  },
});