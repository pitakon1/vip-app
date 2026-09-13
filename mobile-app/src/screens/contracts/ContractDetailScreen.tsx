import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import colors from '@/theme/colors';
import { contractsApi } from '@/services/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Route = RouteProp<RootStackParamList, 'ContractDetail'>;

interface Party {
  id: string;
  name?: string;
  role?: string;
  signed?: boolean;
}

interface ContractDetail {
  id: string;
  title?: string;
  content?: string;
  status?: string;
  parties?: Party[];
  created_at?: string;
}

export default function ContractDetailScreen() {
  const route = useRoute<Route>();
  const { id } = route.params;
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await contractsApi.get(id);
      const data = res.data;
      const item =
        data && typeof data === 'object'
          ? data
          : (data as any)?.contract ?? {};
      setDetail(item as ContractDetail);
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取合同详情');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSign = async () => {
    if (!detail) return;
    const target =
      Array.isArray(detail.parties) && detail.parties.length > 0
        ? detail.parties.find((p) => !p.signed) ?? detail.parties[0]
        : null;
    if (!target) {
      Alert.alert('提示', '未找到可签名的签署方');
      return;
    }
    setSigning(true);
    try {
      await contractsApi.sign(id, target.id);
      Alert.alert('签名成功', '电子合同已签名');
      await load();
    } catch (err: any) {
      Alert.alert('签名失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const partyLabel = (role?: string) => {
    switch (role) {
      case 'landlord':
      case 'owner':
        return '出租人';
      case 'tenant':
        return '承租人';
      default:
        return role ?? '签署方';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{detail?.title ?? '电子合同'}</Text>
      {detail?.status ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{detail?.status}</Text>
        </View>
      ) : null}

      {detail?.parties && detail.parties.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>签署方</Text>
          {detail.parties.map((p) => (
            <View key={p.id} style={styles.partyRow}>
              <Text style={styles.partyName}>
                {p.name ?? '未命名'}（{partyLabel(p.role)}）
              </Text>
              <Text style={[styles.signState, p.signed ? styles.signed : styles.unsigned]}>
                {p.signed ? '已签署' : '未签署'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>合同内容</Text>
        <Text style={styles.contentText}>{detail?.content ?? '暂无合同内容'}</Text>
      </View>

      <TouchableOpacity
        style={[styles.signBtn, signing && styles.btnDisabled]}
        onPress={handleSign}
        disabled={signing}
      >
        {signing ? (
          <ActivityIndicator color={colors.primaryForeground} size="small" />
        ) : (
          <Text style={styles.signText}>签署合同</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 8,
  },
  badgeText: { color: colors.primaryForeground, fontSize: 12 },
  section: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 10 },
  partyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  partyName: { fontSize: 14, color: colors.text },
  signState: { fontSize: 13, fontWeight: '500' },
  signed: { color: colors.success },
  unsigned: { color: colors.warning },
  contentText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  signBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: { opacity: 0.6 },
  signText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '600' },
});