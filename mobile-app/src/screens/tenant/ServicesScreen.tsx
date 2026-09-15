import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { serviceOrdersApi } from '@/services/api';
import type { ServiceOrder } from '@/types';

interface ServiceItem {
  id: string;
  serviceType: ServiceOrder['serviceType'];
  title: string;
  description: string;
  price: number;
}

const SERVICES: ServiceItem[] = [
  { id: '1', serviceType: 'cleaning', title: '日常保洁', description: '2 小时日常保洁服务', price: 120 },
  { id: '2', serviceType: 'aircon', title: '空调清洗', description: '单台分体空调深度清洗', price: 99 },
  { id: '3', serviceType: 'wifi', title: '宽带办理', description: '千兆宽带按月办理', price: 99 },
  { id: '4', serviceType: 'utility', title: '水电代付', description: '按月代缴水电燃气费', price: 20 },
];

const PAYMENT_METHODS = [
  { id: 'qr', label: 'QR 码' },
  { id: 'visa', label: 'Visa' },
  { id: 'alipay', label: '支付宝' },
  { id: 'wechat', label: '微信' },
  { id: 'wise', label: 'Wise' },
];

export default function ServicesScreen() {
  const [selected, setSelected] = useState<ServiceItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePay = async (method: string) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await serviceOrdersApi.create({
        serviceType: selected.serviceType,
        title: selected.title,
        description: selected.description,
        price: selected.price,
        paymentMethod: method,
      });
      Alert.alert('下单成功', `已通过${method}支付 ฿${selected.price}，服务订单已创建`);
      setSelected(null);
    } catch (err: any) {
      Alert.alert('下单失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: ServiceItem }) => (
    <Card title={item.title}>
      <Text style={styles.description}>{item.description}</Text>
      <View style={styles.footer}>
        <Text style={styles.price}>฿{item.price}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setSelected(item)}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>立即下单</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={SERVICES}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>选择付款方式</Text>
            {selected ? (
              <Text style={styles.sheetSub}>
                {selected.title} · ¥{selected.price}
              </Text>
            ) : null}
            <View style={styles.methodRow}>
              {PAYMENT_METHODS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.methodBtn}
                  onPress={() => handlePay(m.label)}
                  disabled={submitting}
                >
                  <Text style={styles.methodText}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {submitting ? (
              <ActivityIndicator style={styles.loading} color={colors.primary} />
            ) : null}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)}>
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingVertical: 8 },
  description: { fontSize: 13, color: colors.ink2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  price: { fontSize: 18, color: colors.error, fontWeight: '600' },
  button: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 6 },
  buttonText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center' },
  sheetSub: { fontSize: 14, color: colors.ink2, textAlign: 'center', marginTop: 6 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20, justifyContent: 'center' },
  methodBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(22,119,255,0.06)',
  },
  methodText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
  loading: { marginTop: 16 },
  cancelBtn: { marginTop: 20, paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: colors.ink3, fontSize: 15 },
});
