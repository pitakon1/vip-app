import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '@/theme/colors';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import api from '@/lib/api';

interface FunnelRow { stage: string; key: string; value: number; rate: number }
interface CountryRow { country: string; properties: number; rented: number; occupancy: number }

export default function AdminOpsScreen() {
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [activity, setActivity] = useState<any>(null);
  const [revenue, setRevenue] = useState(0);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res: any = await api.get('/operations/overview');
      const d = res?.data ?? {};
      setFunnel(d.funnel ?? []);
      setActivity(d.activity ?? null);
      setRevenue(Number(d.revenue?.month_paid ?? 0));
      setCountries(d.by_country ?? []);
    } catch (e: any) {
      Alert.alert('加载失败', e?.response?.data?.detail || '无法获取运营数据');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} colors={[colors.primary]} tintColor={colors.primary} />}
    >
      {/* 活跃度 */}
      <View style={styles.statsRow}>
        {[
          { label: '日活', value: `${activity?.dau ?? 0}`, color: colors.primary },
          { label: '周活', value: `${activity?.wau ?? 0}`, color: colors.warning },
          { label: '月活', value: `${activity?.mau ?? 0}`, color: colors.success },
          { label: '本月实收', value: revenue.toLocaleString(), color: colors.ink },
        ].map((c) => (
          <View key={c.label} style={styles.statCard}>
            <Text style={[styles.statNum, { color: c.color }]} numberOfLines={1}>{c.value}</Text>
            <Text style={styles.statLabel}>{c.label}</Text>
          </View>
        ))}
      </View>

      {/* 转化漏斗 */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>流程转化漏斗</Text>
        <Text style={styles.sectionHint}>线索 → 带看 → 成交 → 签约</Text>
      </View>
      {funnel.length === 0 ? (
        <EmptyState icon="filter-outline" title="暂无漏斗数据" sub="线索累计后展示" />
      ) : (
        <View style={styles.card}>
          {funnel.map((f, i) => (
            <View key={f.key} style={styles.funnelRow}>
              <View style={styles.funnelTop}>
                <Text style={styles.funnelStage}>{f.stage}</Text>
                <Text style={styles.funnelVal}>
                  {f.value}{i > 0 ? ` · ${f.rate}%` : ''}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${i === 0 ? 100 : Math.round((f.value / maxFunnel) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 分国家 */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>按国家分布</Text>
        <Text style={styles.sectionHint}>{countries.length} 个国家</Text>
      </View>
      {countries.length === 0 ? (
        <EmptyState icon="earth-outline" title="暂无国家数据" sub="房源归属项目后展示" />
      ) : (
        <View style={styles.card}>
          {countries.map((c) => (
            <View key={c.country} style={styles.countryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.countryName}>{c.country}</Text>
                <Text style={styles.countryMeta}>
                  {c.properties} 套房源 · 在租 {c.rented} · 出租率 {c.occupancy}%
                </Text>
              </View>
              <View style={[styles.barTrack, { flex: 1 }]}>
                <View style={[styles.barFill, { width: `${c.occupancy}%`, backgroundColor: colors.success }]} />
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...colors.shadow.sm,
  },
  statNum: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  statLabel: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sectionHint: { fontSize: 11, color: colors.ink3 },

  card: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: colors.radius.xl, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14, ...colors.shadow.sm },
  funnelRow: { gap: 6 },
  funnelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  funnelStage: { fontSize: 14, fontWeight: '600', color: colors.ink },
  funnelVal: { fontSize: 13, fontWeight: '700', color: colors.primary },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: 'rgba(148,163,184,0.15)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countryName: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  countryMeta: { fontSize: 11, color: colors.ink3 },
});