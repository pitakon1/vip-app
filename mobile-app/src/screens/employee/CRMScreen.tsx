import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import Card from '../../components/Card';
import colors from '../../theme/colors';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import { employeesApi } from '../../services/api';

interface FollowUpLease {
  lease_id: string;
  property_title?: string | null;
  monthly_rent?: number;
  currency?: string;
  end_date?: string | null;
  days_to_expire?: number | null;
}

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');

export default function CRMScreen() {
  const [leases, setLeases] = useState<FollowUpLease[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: any = await employeesApi.workbench();
      const data = res?.data;
      setLeases((data?.follow_up_leases ?? []) as FollowUpLease[]);
    } catch {
      /* 跟进租约加载失败不阻塞 */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const renderItem = ({ item }: { item: FollowUpLease }) => {
    const d = item.days_to_expire;
    const expireText =
      d == null
        ? '租期状态未知'
        : d < 0
        ? `已到期 ${-d} 天`
        : d === 0
        ? '今日到期'
        : `距到期 ${d} 天`;
    return (
      <Card>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>
            {item.property_title || '房源'}
          </Text>
          <View
            style={[
              styles.expirePill,
              d != null && d <= 7 ? styles.expirePillWarn : styles.expirePillOk,
            ]}
          >
            <Text
              style={[
                styles.expire,
                { color: d != null && d <= 7 ? colors.error : colors.ink2 },
              ]}
            >
              {expireText}
            </Text>
          </View>
        </View>
        <Text style={styles.rent}>
          {cur(item.currency)}
          {Number(item.monthly_rent || 0).toLocaleString()}/月
        </Text>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载跟进租约…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={leases}
        keyExtractor={(item) => item.lease_id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={<Text style={styles.heading}>我的跟进租约</Text>}
        ListEmptyComponent={<EmptyState icon="people-outline" title="暂无进行中的租约" sub="你跟进的客户租约到账后会展示在这里" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8 },
  heading: { fontSize: 15, color: colors.text, fontWeight: '600', marginHorizontal: 12, marginBottom: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '600', marginRight: 8 },
  expire: { fontSize: 12, fontWeight: '600' },
  expirePill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  expirePillWarn: { backgroundColor: colors.errorLight },
  expirePillOk: { backgroundColor: colors.surface2 },
  rent: { color: colors.primary, fontSize: 15, fontWeight: '600', marginTop: 8 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 32 },
});