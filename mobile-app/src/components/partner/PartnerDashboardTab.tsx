/**
 * 合作公司控制台 · 经营驾驶舱
 * GET /partner/dashboard?month=YYYY-MM
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { getErrorMessage } from '@/utils/feedback';
import { partnerAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';
import {
  Badge,
  MonthSwitcher,
  currentMonthKey,
  shared,
  symOf,
  unwrapBody,
} from './PartnerShared';

interface DashboardStats {
  deals?: number;
  revenue?: number;
  receivable?: number;
  paid?: number;
  pending?: number;
  active_agents?: number;
  properties?: number;
}

interface MonthlyPoint {
  year: number;
  month: number;
  revenue?: number;
  commission?: number;
  deals?: number;
}

interface AgentRank {
  employee_id?: string;
  employee_name?: string | null;
  commission?: number;
  revenue?: number;
  deals?: number;
}

interface PropertyRank {
  user_id?: string;
  name?: string | null;
  count?: number;
}

interface DashboardData {
  period?: { year?: number; month?: number } | null;
  stats?: DashboardStats | null;
  monthly?: MonthlyPoint[];
  agent_ranking?: AgentRank[];
  property_ranking?: PropertyRank[];
}

export default function PartnerDashboardTab() {
  const { t } = useI18n();
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (spinner = true) => {
      if (spinner) setLoading(true);
      setError('');
      try {
        const { data: body } = await partnerAdminApi.dashboard(month);
        setData(unwrapBody<DashboardData>(body) ?? null);
      } catch (e: any) {
        setError(getErrorMessage(e, t('partner.loadFailed')));
      } finally {
        setLoading(false);
      }
    },
    [month, t],
  );

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        tone="error"
        title={error || t('partner.loadFailed')}
        sub={t('member.pullRefresh')}
        actionLabel={t('common.retry')}
        onAction={() => load(true)}
      />
    );
  }

  const s = data.stats ?? {};
  const monthly = data.monthly ?? [];
  const maxRevenue = Math.max(1, ...monthly.map((m) => Number(m.revenue ?? 0)));
  const agentRanking = data.agent_ranking ?? [];
  const propertyRanking = data.property_ranking ?? [];

  const stats: { key: string; label: string; value: string }[] = [
    { key: 'deals', label: t('partner.db.deals'), value: String(Number(s.deals ?? 0)) },
    { key: 'revenue', label: t('partner.db.revenue'), value: `${symOf()}${Number(s.revenue ?? 0).toLocaleString()}` },
    { key: 'receivable', label: t('partner.db.receivable'), value: `${symOf()}${Number(s.receivable ?? 0).toLocaleString()}` },
    { key: 'paid', label: t('partner.db.paid'), value: `${symOf()}${Number(s.paid ?? 0).toLocaleString()}` },
    { key: 'pending', label: t('partner.db.pending'), value: `${symOf()}${Number(s.pending ?? 0).toLocaleString()}` },
    { key: 'agents', label: t('partner.db.activeAgents'), value: String(Number(s.active_agents ?? 0)) },
    { key: 'properties', label: t('partner.db.properties'), value: String(Number(s.properties ?? 0)) },
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.monthRow}>
        <Text style={styles.monthLabel}>{t('partner.db.month')}</Text>
        <MonthSwitcher value={month} onChange={setMonth} />
      </View>

      {!!error && <Text style={shared.errorText}>{error}</Text>}

      <View style={shared.statGrid}>
        {stats.map((x) => (
          <View key={x.key} style={shared.statCard}>
            <Text style={shared.statLabel} numberOfLines={1}>
              {x.label}
            </Text>
            <Text style={shared.statValue} numberOfLines={1}>
              {x.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={shared.sectionHead}>
        <Text style={shared.sectionTitle}>{t('partner.db.trend')}</Text>
      </View>
      <View style={shared.card}>
        {monthly.length === 0 ? (
          <Text style={styles.emptyText}>{t('partner.db.empty')}</Text>
        ) : (
          <View style={styles.chart}>
            {monthly.map((m) => {
              const ratio = Number(m.revenue ?? 0) / maxRevenue;
              return (
                <View key={`${m.year}-${m.month}`} style={styles.chartCol}>
                  <Text style={styles.chartValue} numberOfLines={1}>
                    {ratio > 0 ? `${Math.round(ratio * 100)}%` : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.bar, { height: Math.max(3, ratio * 100) }]} />
                  </View>
                  <Text style={styles.chartLabel}>{t('common.monthN', { n: m.month })}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={shared.sectionHead}>
        <Text style={shared.sectionTitle}>{t('partner.db.agentRanking')}</Text>
        <Text style={shared.sectionHint}>{t('partner.nAgents', { n: agentRanking.length })}</Text>
      </View>
      {agentRanking.length === 0 ? (
        <Text style={styles.emptyText}>{t('partner.db.empty')}</Text>
      ) : (
        <View style={{ marginHorizontal: 20, gap: 10 }}>
          {agentRanking.map((a, i) => (
            <View key={a.employee_id ?? i} style={shared.card}>
              <View style={shared.rowHead}>
                <Text style={styles.rankNo}>{i + 1}</Text>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={1}>
                    {a.employee_name || t('acc.unnamed')}
                  </Text>
                  <Text style={shared.rowSub}>
                    {t('partner.db.rankRevenue')} {symOf()}
                    {Number(a.revenue ?? 0).toLocaleString()} · {t('partner.db.rankCommission')} {symOf()}
                    {Number(a.commission ?? 0).toLocaleString()}
                  </Text>
                </View>
                <Badge text={`${Number(a.deals ?? 0)} ${t('partner.db.rankDeals')}`} tone="info" />
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={shared.sectionHead}>
        <Text style={shared.sectionTitle}>{t('partner.db.propertyRanking')}</Text>
        <Text style={shared.sectionHint}>{propertyRanking.length}</Text>
      </View>
      {propertyRanking.length === 0 ? (
        <Text style={styles.emptyText}>{t('partner.db.empty')}</Text>
      ) : (
        <View style={{ marginHorizontal: 20, gap: 10 }}>
          {propertyRanking.map((p, i) => (
            <View key={p.user_id ?? i} style={shared.card}>
              <View style={shared.rowHead}>
                <Text style={styles.rankNo}>{i + 1}</Text>
                <Text style={[shared.rowTitle, { flex: 1 }]} numberOfLines={1}>
                  {p.name || t('acc.unnamed')}
                </Text>
                <Badge text={`${Number(p.count ?? 0)} ${t('partner.db.rankCount')}`} />
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  monthLabel: { marginLeft: 20, marginTop: 12, fontSize: colors.fontSize.xs, color: colors.ink3 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 150 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartValue: { fontSize: 9, color: colors.ink3, marginBottom: 3 },
  barTrack: { width: '100%', height: 100, justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  chartLabel: { fontSize: 9, color: colors.ink3, marginTop: 5 },
  emptyText: { marginHorizontal: 20, fontSize: colors.fontSize.sm, color: colors.ink3 },
  rankNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: colors.fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.12),
    overflow: 'hidden',
    marginTop: 1,
  },
});
