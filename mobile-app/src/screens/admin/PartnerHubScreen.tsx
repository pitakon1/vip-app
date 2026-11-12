/**
 * 合作公司管理员（role=partner_admin）聚合页
 * 成员（/partner/members）· 绩效（/partner/performance）· 本公司考勤（/attendance/admin/summary）·
 * 本公司房源（/partner/properties）四块，Tab 切换。考勤作用域由后端强制为本公司。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import PartnerMemberManager from '@/components/PartnerMemberManager';
import { notifyError } from '@/utils/feedback';
import { attendanceApi, partnerAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';

type TabKey = 'members' | 'performance' | 'attendance' | 'properties';
const TABS: TabKey[] = ['members', 'performance', 'attendance', 'properties'];

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

interface PerfAgent {
  user_id?: string;
  employee_name?: string | null;
  total_commission?: number | null;
  total_revenue?: number | null;
  deals?: number;
}
interface PerfData {
  partner_id?: string;
  summary?: Record<string, any> | null;
  monthly?: any[];
  agents?: PerfAgent[];
}
interface PartnerProperty {
  id: string;
  address?: string | null;
  property_type?: string | null;
  bedrooms?: number | null;
  monthly_rent?: number | null;
  status?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

interface AttEmployee {
  employee_id: string;
  name?: string | null;
  department?: string | null;
  attended?: number;
  late?: number;
  early_out?: number;
  absent?: number;
  abnormal?: number;
}
interface AttData {
  range?: { start?: string; end?: string; days?: number } | null;
  total_employees?: number;
  totals?: {
    attended?: number;
    late?: number;
    early_out?: number;
    absent?: number;
    abnormal?: number;
    expected?: number;
    attendance_rate?: number;
  } | null;
  employees?: AttEmployee[];
}

export default function PartnerHubScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>('members');

  const [perf, setPerf] = useState<PerfData | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [props, setProps] = useState<PartnerProperty[]>([]);
  const [propsLoading, setPropsLoading] = useState(false);
  const [att, setAtt] = useState<AttData | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPerformance = useCallback(async () => {
    setPerfLoading(true);
    try {
      const { data } = await partnerAdminApi.performance();
      const d = (data?.data ?? data) as PerfData;
      setPerf(d ?? null);
    } catch (e: any) {
      notifyError(t('partner.perfFailed'), e);
    } finally {
      setPerfLoading(false);
    }
  }, [t]);

  const loadProperties = useCallback(async () => {
    setPropsLoading(true);
    try {
      const { data } = await partnerAdminApi.properties();
      const rows = (data?.data ?? data) as PartnerProperty[];
      setProps(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      notifyError(t('partner.propsFailed'), e);
    } finally {
      setPropsLoading(false);
    }
  }, [t]);

  // 本公司考勤：后端按 current.partner_id 强制收敛作用域，不传 partner_id 即本公司
  const loadAttendance = useCallback(async () => {
    setAttLoading(true);
    try {
      const { data } = await attendanceApi.summary();
      const d = (data?.data ?? data) as AttData;
      setAtt(d ?? null);
    } catch (e: any) {
      notifyError(t('partner.attFailed'), e);
    } finally {
      setAttLoading(false);
    }
  }, [t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (tab === 'performance') await loadPerformance();
      else if (tab === 'attendance') await loadAttendance();
      else if (tab === 'properties') await loadProperties();
    } finally {
      setRefreshing(false);
    }
  }, [tab, loadPerformance, loadAttendance, loadProperties]);

  useFocusEffect(
    useCallback(() => {
      if (tab === 'performance') loadPerformance();
      else if (tab === 'attendance') loadAttendance();
      else if (tab === 'properties') loadProperties();
    }, [tab, loadPerformance, loadAttendance, loadProperties]),
  );

  const summary = perf?.summary ?? {};
  const summaryRevenue = summary.total_revenue ?? summary.revenue;
  const summaryCommission = summary.total_commission ?? summary.commission;
  const summaryDeals = summary.deals ?? summary.total_deals;

  const renderPerformance = () => {
    if (perfLoading) {
      return (
        <View style={styles.center}>
          <LoadingState />
        </View>
      );
    }
    if (!perf || (summaryRevenue == null && summaryCommission == null && (perf.agents?.length ?? 0) === 0)) {
      return (
        <EmptyState
          icon="stats-chart-outline"
          title={t('partner.perfEmpty')}
          sub={t('member.pullRefresh')}
        />
      );
    }
    const agents = perf.agents ?? [];
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('partner.totalRevenue')}</Text>
            <Text style={styles.statValue}>{symOf(summary.currency)}{Number(summaryRevenue ?? 0).toLocaleString()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('partner.totalCommission')}</Text>
            <Text style={styles.statValue}>{symOf(summary.currency)}{Number(summaryCommission ?? 0).toLocaleString()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('acc.dealCount')}</Text>
            <Text style={styles.statValue}>{Number(summaryDeals ?? 0)}</Text>
          </View>
        </View>

        <View style={styles.listHead}>
          <Text style={styles.listTitle}>{t('partner.agentPerf')}</Text>
          <Text style={styles.listHint}>{t('partner.nAgents', { n: agents.length })}</Text>
        </View>
        {agents.length === 0 ? (
          <EmptyState icon="people-outline" title={t('partner.noAgents')} sub={t('member.pullRefresh')} />
        ) : (
          <View style={[styles.listCard, styles.listCardGap]}>
            {agents.map((a, i) => {
              const comm = Number(a.total_commission ?? 0);
              const deals = Number(a.deals ?? 0);
              return (
                <View key={a.user_id ?? i} style={styles.itemCard}>
                  <View style={styles.itemHeadRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{a.employee_name || t('acc.unnamed')}</Text>
                      {a.user_id ? (
                        <Text style={styles.itemSub}>{a.user_id}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.itemBadge, { backgroundColor: colors.alpha(colors.primaryRgb, 0.12) }]}>
                      <Text style={[styles.itemBadgeText, { color: colors.primary }]}>
                        {symOf(summary.currency)}{comm.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.itemStatRow}>
                    <View style={styles.itemStatChip}>
                      <Text style={styles.itemStatLabel}>{t('acc.dealCount')}</Text>
                      <Text style={[styles.itemStatValue, { color: colors.ink }]}>{deals}</Text>
                    </View>
                    <View style={styles.itemStatChip}>
                      <Text style={styles.itemStatLabel}>{t('partner.commission')}</Text>
                      <Text style={[styles.itemStatValue, { color: colors.ink }]}>{symOf(summary.currency)}{comm.toLocaleString()}</Text>
                    </View>
                    {a.total_revenue != null && (
                      <View style={styles.itemStatChip}>
                        <Text style={styles.itemStatLabel}>{t('partner.revenue')}</Text>
                        <Text style={[styles.itemStatValue, { color: colors.ink }]}>
                          {symOf(summary.currency)}{Number(a.total_revenue).toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderAttendance = () => {
    if (attLoading) {
      return (
        <View style={styles.center}>
          <LoadingState />
        </View>
      );
    }
    const totals = att?.totals ?? {};
    const rows = att?.employees ?? [];
    if (!att || (att.total_employees ?? 0) === 0) {
      return (
        <EmptyState
          icon="calendar-outline"
          title={t('partner.attEmpty')}
          sub={t('member.pullRefresh')}
        />
      );
    }
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {!!att.range?.start && (
          <Text style={styles.attRange}>
            {t('partner.attRange', { start: att.range.start, end: att.range.end ?? '' })}
          </Text>
        )}
        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('partner.attMembers')}</Text>
            <Text style={styles.statValue}>{Number(att.total_employees ?? 0)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('partner.attRate')}</Text>
            <Text style={styles.statValue}>{Number(totals.attendance_rate ?? 0)}%</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('partner.attAbnormal')}</Text>
            <Text style={styles.statValue}>{Number(totals.abnormal ?? 0)}</Text>
          </View>
        </View>

        <View style={styles.listHead}>
          <Text style={styles.listTitle}>{t('partner.attByMember')}</Text>
          <Text style={styles.listHint}>{t('partner.nAgents', { n: rows.length })}</Text>
        </View>
        <View style={[styles.listCard, styles.listCardGap]}>
          {rows.map((r, i) => {
            const abn = Number(r.abnormal ?? 0);
            const present = Number(r.attended ?? 0);
            const late = Number(r.late ?? 0);
            const early = Number(r.early_out ?? 0);
            const absent = Number(r.absent ?? 0);
            const dept = r.department || '';
            return (
              <View key={r.employee_id ?? i} style={styles.itemCard}>
                <View style={styles.itemHeadRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{r.name || t('acc.unnamed')}</Text>
                    {dept ? (
                      <Text style={styles.itemSub}>{dept}</Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.itemBadge,
                      {
                        backgroundColor: abn === 0
                          ? colors.alpha(colors.successRgb, 0.12)
                          : colors.alpha(colors.errorRgb, 0.12),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.itemBadgeText,
                        { color: abn === 0 ? colors.success : colors.error },
                      ]}
                    >
                      {t('partner.attAbnormal')} {abn}
                    </Text>
                  </View>
                </View>
                <View style={styles.itemStatRow}>
                  <View style={styles.itemStatChip}>
                    <Text style={[styles.itemStatLabel, { color: colors.success }]}>{t('partner.attPresent')}</Text>
                    <Text style={[styles.itemStatValue, { color: colors.ink }]}>{present}</Text>
                  </View>
                  <View style={styles.itemStatChip}>
                    <Text style={[styles.itemStatLabel, { color: colors.warning }]}>{t('partner.attLate')}</Text>
                    <Text style={[styles.itemStatValue, { color: colors.ink }]}>{late}</Text>
                  </View>
                  {early > 0 ? (
                    <View style={styles.itemStatChip}>
                      <Text style={[styles.itemStatLabel, { color: colors.warning }]}>{t('partner.attEarly')}</Text>
                      <Text style={[styles.itemStatValue, { color: colors.ink }]}>{early}</Text>
                    </View>
                  ) : null}
                  <View style={styles.itemStatChip}>
                    <Text style={[styles.itemStatLabel, { color: colors.error }]}>{t('partner.attAbsent')}</Text>
                    <Text style={[styles.itemStatValue, { color: colors.ink }]}>{absent}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const renderProperties = () => {
    if (propsLoading) {
      return (
        <View style={styles.center}>
          <LoadingState />
        </View>
      );
    }
    if (props.length === 0) {
      return (
        <EmptyState
          icon="business-outline"
          title={t('partner.propsEmpty')}
          sub={t('member.pullRefresh')}
        />
      );
    }
    return (
      <FlatList
        data={props}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.propHead}>
              <Ionicons name="business-outline" size={15} color={colors.primary} />
              <Text style={styles.propAddress} numberOfLines={2}>{item.address || t('partner.noAddress')}</Text>
              <View style={styles.propTag}>
                <Text style={styles.propTagText}>{item.status ? t(`partner.propStatus.${item.status}`) : '-'}</Text>
              </View>
            </View>
            <Text style={styles.propMeta} numberOfLines={1}>
              {[item.property_type, item.bedrooms != null ? `${t('partner.rooms')} ${item.bedrooms}` : '']
                .filter(Boolean)
                .join(' · ') || t('partner.noType')}
            </Text>
            <Text style={styles.propRent}>
              {symOf(undefined)}{Number(item.monthly_rent ?? 0).toLocaleString()}
              <Text style={styles.propRentUnit}> / {t('partner.month')}</Text>
            </Text>
          </View>
        )}
        initialNumToRender={10}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.tab, tab === k && styles.tabActive]}
            activeOpacity={0.7}
            onPress={() => setTab(k)}
          >
            <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{t(`partner.tab.${k}`)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ flex: 1 }}>
        {tab === 'members' ? (
          <PartnerMemberManager />
        ) : tab === 'performance' ? (
          renderPerformance()
        ) : tab === 'attendance' ? (
          renderAttendance()
        ) : (
          renderProperties()
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabScroll: { flexGrow: 0 },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 4 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.ink2 },
  tabTextActive: { color: '#fff', fontWeight: '700' },

  statRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 16 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 12,
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: 12, color: colors.ink3, marginBottom: 6 },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },

  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 20, marginBottom: 10 },
  attRange: { fontSize: colors.fontSize.xs, color: colors.ink3, marginHorizontal: 20, marginTop: 12, lineHeight: colors.lineHeight.tight},
  listTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  listHint: { fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: colors.lineHeight.tight},
  tableCard: { marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 14, ...colors.shadow.sm },
  tableHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tableTh: { fontSize: colors.fontSize.xs, color: colors.ink3, fontWeight: '600', lineHeight: colors.lineHeight.tight},
  colName: { flex: 1.4 },
  colNum: { width: 82, textAlign: 'right' },
  colNumSm: { width: 56, textAlign: 'right' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  tableRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tableTd: { fontSize: colors.fontSize.caption },
  tdName: { fontWeight: '600', color: colors.ink },
  tdNum: { fontVariant: ['tabular-nums'], color: colors.ink2 },

  // --- 卡片流（替换 performance / attendance 表格）---
  listCardGap: { marginHorizontal: 20, gap: 10 },
  listCard: { marginBottom: 10 },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  itemHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemName: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  itemSub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2, fontWeight: '500', lineHeight: colors.lineHeight.tight},
  itemBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: colors.radius.full,
  },
  itemBadgeText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  itemStatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  itemStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  itemStatLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, fontWeight: '500', lineHeight: colors.lineHeight.tight},
  itemStatValue: { fontSize: colors.fontSize.caption, fontWeight: '700', fontVariant: ['tabular-nums'] },

  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 14,
    ...colors.shadow.sm,
  },
  propHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  propAddress: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  propTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.alpha(colors.infoRgb, 0.12) },
  propTagText: { fontSize: colors.fontSize.xs, fontWeight: '600', color: colors.info, lineHeight: colors.lineHeight.tight},
  propMeta: { fontSize: 12, color: colors.ink2, marginTop: 8 },
  propRent: { fontSize: 18, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'], marginTop: 8 },
  propRentUnit: { fontSize: 12, fontWeight: '500', color: colors.ink3 },
});