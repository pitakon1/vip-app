import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { ownerApi } from '@/services/api';

interface IncomeRecord {
  id: string;
  property: string;
  month: string;
  amount: number;
  status: 'received' | 'pending' | 'overdue';
}

interface IncomeSummary {
  total?: number;
  monthly?: number;
  records?: IncomeRecord[];
}

const statusMap: Record<IncomeRecord['status'], { label: string; color: string }> = {
  received: { label: '已到账', color: colors.success },
  pending: { label: '待入账', color: colors.warning },
  overdue: { label: '逾期', color: colors.error },
};

export default function IncomeScreen() {
  const [summary, setSummary] = useState<IncomeSummary>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadIncome = useCallback(async () => {
    try {
      const res = await ownerApi.income();
      const data = res.data as any;
      const records: IncomeRecord[] =
        data?.records ?? data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);
      setSummary({
        total: data?.total ?? records.reduce((s, r) => s + r.amount, 0),
        monthly: data?.monthly,
        records,
      });
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取收入数据');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadIncome();
  }, [loadIncome]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadIncome();
  }, [loadIncome]);

  const renderItem = ({ item }: { item: IncomeRecord }) => {
    const st = statusMap[item.status] ?? { label: item.status, color: '#999' };
    return (
      <Card>
        <View style={styles.row}>
          <View>
            <Text style={styles.property}>{item.property}</Text>
            <Text style={styles.month}>{item.month}</Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.amount}>¥{item.amount.toLocaleString()}</Text>
            <View style={[styles.badge, { backgroundColor: st.color }]}>
              <Text style={styles.badgeText}>{st.label}</Text>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const records = summary.records ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>总收入</Text>
        <Text style={styles.summaryAmount}>¥{(summary.total ?? 0).toLocaleString()}</Text>
        {summary.monthly != null ? (
          <Text style={styles.summarySub}>本月收入 ¥{summary.monthly.toLocaleString()}</Text>
        ) : null}
      </View>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={<Text style={styles.empty}>暂无收入明细</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summary: { backgroundColor: colors.primary, padding: 20, alignItems: 'center' },
  summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  summaryAmount: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 8 },
  summarySub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6 },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  property: { fontSize: 15, color: colors.text, fontWeight: '500' },
  month: { fontSize: 12, color: '#999', marginTop: 4 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 16, color: colors.text, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 6 },
  badgeText: { color: '#fff', fontSize: 12 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
});
