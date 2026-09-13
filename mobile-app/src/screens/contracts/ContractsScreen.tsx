import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { contractsApi, leasesApi } from '@/services/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

interface Contract {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  created_at?: string;
}

interface Lease {
  id: string;
  status?: string;
  monthly_rent?: number;
  currency?: string;
  start_date?: string;
  end_date?: string;
}

export default function ContractsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [lease, setLease] = useState<Lease | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    landlord_name: '',
    tenant_name: '',
    property: '',
    monthly_rent: '',
    months: '',
    currency: 'CNY',
  });

  const load = useCallback(async () => {
    try {
      const res = await contractsApi.list();
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.contracts ?? [];
      setContracts(items as Contract[]);
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取合同列表');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const fetchLease = useCallback(async () => {
    try {
      const res = await leasesApi.mine();
      const data = res.data;
      const list = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.leases ?? [];
      const active = (list as any[]).find((l) => l && l.status === 'active');
      setLease(active ?? null);
    } catch (err) {
      setLease(null);
    }
  }, []);

  useEffect(() => {
    if (isFocused) fetchLease();
  }, [isFocused, fetchLease]);

  const handleRenew = () => {
    if (!lease) return;
    Alert.alert(
      '续约确认',
      `将按原租金${lease.currency ?? 'THB'} ${lease.monthly_rent ?? '-'}继续租住 12 个月，续约后原合同自动结束。是否继续？`,
      [
        { text: '再想想', style: 'cancel' },
        {
          text: '确认续约',
          onPress: async () => {
            if (!lease) return;
            setRenewing(true);
            try {
              const today = new Date();
              const end = new Date();
              end.setFullYear(end.getFullYear() + 1);
              const fmt = (d: Date) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              await leasesApi.renew(lease.id, {
                start_date: fmt(today),
                end_date: fmt(end),
              });
              Alert.alert('续约成功', '新租约已生效');
              await Promise.all([load(), fetchLease()]);
            } catch (err: any) {
              Alert.alert('续约失败', err?.response?.data?.detail || '请稍后重试');
            } finally {
              setRenewing(false);
            }
          },
        },
      ],
    );
  };

  const handleGenerate = async () => {
    if (
      !form.landlord_name.trim() ||
      !form.tenant_name.trim() ||
      !form.property.trim() ||
      !form.monthly_rent.trim()
    ) {
      Alert.alert('提示', '请填写出租人、承租人、房源与月租金');
      return;
    }
    setGenerating(true);
    try {
      await contractsApi.generate({
        counters: {
          landlord_name: form.landlord_name.trim(),
          tenant_name: form.tenant_name.trim(),
          property: form.property.trim(),
          monthly_rent: Number(form.monthly_rent),
          months: form.months ? Number(form.months) : 12,
          currency: form.currency,
        },
      });
      setShowForm(false);
      setForm({
        landlord_name: '',
        tenant_name: '',
        property: '',
        monthly_rent: '',
        months: '',
        currency: 'CNY',
      });
      Alert.alert('生成成功', '电子合同已生成');
      await load();
    } catch (err: any) {
      Alert.alert('生成失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  const setField = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const renderItem = ({ item }: { item: Contract }) => (
    <TouchableOpacity onPress={() => navigation.navigate('ContractDetail', { id: item.id })} activeOpacity={0.8}>
      <Card>
        <View style={styles.row}>
          <Text style={styles.title}>{item.title ?? item.name ?? '电子合同'}</Text>
          <Text style={styles.arrow}>›</Text>
        </View>
        {item.status ? <Text style={styles.subtitle}>状态: {item.status}</Text> : null}
        {item.created_at ? <Text style={styles.time}>{item.created_at}</Text> : null}
      </Card>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.genBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.genText}>生成电子合同</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={contracts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>暂无合同</Text>}
        ListHeaderComponent={
          lease ? (
            <CursorRenewCard lease={lease} renewing={renewing} onRenew={handleRenew} />
          ) : null
        }
      />

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>生成电子合同</Text>
              {(
                [
                  ['landlord_name', '出租人（房东）', '房东姓名'],
                  ['tenant_name', '承租人（租客）', '租客姓名'],
                  ['property', '房源', '如：阳光花园 3-202'],
                  ['monthly_rent', '月租金', '如：3000'],
                  ['months', '租期(月)', '如：12'],
                ] as [keyof typeof form, string, string][]
              ).map(([key, label, placeholder]) => (
                <View key={key} style={styles.fieldBox}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder={placeholder}
                    placeholderTextColor={colors.ink3}
                    value={form[key]}
                    onChangeText={(v) => setField(key, v)}
                    keyboardType={key === 'monthly_rent' || key === 'months' ? 'numeric' : 'default'}
                  />
                </View>
              ))}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.formBtn, generating && styles.btnDisabled]}
                  onPress={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={styles.formBtnText}>生成</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelText}>取消</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CursorRenewCard({
  lease,
  renewing,
  onRenew,
}: {
  lease: Lease;
  renewing: boolean;
  onRenew: () => void;
}) {
  return (
    <View style={styles.renewCard}>
      <View style={styles.renewHead}>
        <Text style={styles.renewTitle}>我的租约</Text>
        <View style={styles.renewBadge}>
          <Text style={styles.renewBadgeText}>在租</Text>
        </View>
      </View>
      <Text style={styles.renewInfo}>
        月租：{lease.currency ?? 'THB'} {lease.monthly_rent ?? '-'}
      </Text>
      <Text style={styles.renewInfo}>
        租期至：{lease.end_date ? lease.end_date.slice(0, 10) : '-'}
      </Text>
      <TouchableOpacity
        style={[styles.renewBtn, renewing && styles.btnDisabled]}
        onPress={onRenew}
        disabled={renewing}
      >
        <Text style={styles.renewBtnText}>{renewing ? '续约中...' : '一键续约'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 12 },
  genBtn: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  genText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },
  arrow: { fontSize: 22, color: colors.ink3 },
  subtitle: { fontSize: 13, color: colors.ink2, marginTop: 8 },
  time: { fontSize: 12, color: colors.ink3, marginTop: 6 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' },
  sheet: { backgroundColor: colors.surface, margin: 20, borderRadius: 14, padding: 20, maxHeight: '85%' },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 16 },
  fieldBox: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, color: colors.ink2, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.background,
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  formBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  formBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '600' },
  cancelBtn: { flex: 1, backgroundColor: colors.surface, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.ink2, fontSize: 15 },
  renewCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderTopWidth: 5,
    borderTopColor: colors.primary,
  },
  renewHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  renewTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginRight: 8 },
  renewBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  renewBadgeText: { color: colors.primaryForeground, fontSize: 11, fontWeight: '600' },
  renewInfo: { fontSize: 13, color: colors.ink2, marginBottom: 6 },
  renewBtn: {
    marginTop: 10,
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  renewBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '600' },
});