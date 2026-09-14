/**
 * 管理员工作台：运营概览 / 财务对账 / 运营趋势 / 审计日志 / 佣金规则
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import { dashboardApi, auditApi, commissionRulesApi } from '@/services/api';

type Tab = 'overview' | 'recon' | 'trend' | 'audit' | 'commission';

interface ReconRow {
  property?: string | null;
  received: number;
  receivable: number;
  overdue: number;
  count: number;
}

interface TrendRow {
  month: string;
  revenue: number;
  leases_new?: number;
  leads_new?: number;
  viewings_new?: number;
}

interface AuditRow {
  id: string;
  action: string;
  resource_type?: string;
  actor_name?: string | null;
  occurred_at?: string | null;
}

interface CommissionRule {
  id: string;
  name: string;
  deal_type: string;
  rate: number;
  scope?: string;
  is_active?: boolean;
  [k: string]: any;
}

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const fmtMoney = (v?: number, c?: string) => `${cur(c)}${Number(v ?? 0).toLocaleString()}`;

const DEAL_TYPE: Record<string, string> = {
  new_rental: '新租',
  renewal: '续约',
  purchase: '购房',
  sale: '出租',
};
const SCOPE: Record<string, string> = {
  all_employees: '全体员工',
  department: '部门',
  individual: '个人',
};

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: '运营概览', icon: 'grid-outline' },
  { key: 'recon', label: '财务对账', icon: 'wallet-outline' },
  { key: 'trend', label: '运营趋势', icon: 'trending-up-outline' },
  { key: 'audit', label: '审计日志', icon: 'shield-checkmark-outline' },
  { key: 'commission', label: '佣金规则', icon: 'settings-outline' },
];

type IoniconName = keyof typeof Ionicons.glyphMap;

// 快捷入口：展示页未覆盖的工作工具，置于 hero 之后、分区之上
const QUICK_ACTIONS: { key: string; label: string; icon: IoniconName; route: string }[] = [
  { key: 'props', label: '房源管理', icon: 'home-outline', route: 'EmployeeProperties' },
  { key: 'sale', label: '买卖成交', icon: 'swap-horizontal-outline', route: 'SaleDeals' },
  { key: 'dist', label: '分销体系', icon: 'git-network-outline', route: 'Distribution' },
  { key: 'markets', label: '多国市场', icon: 'earth-outline', route: 'Markets' },
  { key: 'intel', label: '数据决策', icon: 'analytics-outline', route: 'MarketIntel' },
];

export default function AdminHomeScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [summary, setSummary] = useState<any>({});
  const [expiring, setExpiring] = useState<any[]>([]);
  const [totals, setTotals] = useState<{ received?: number; receivable?: number; overdue?: number }>({});
  const [byProperty, setByProperty] = useState<ReconRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);

  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [dealType, setDealType] = useState('new_rental');

  const loadTab = useCallback(async (target: Tab) => {
    setLoading(true);
    try {
      if (target === 'overview') {
        const [sumRes, expRes, trendRes, reconRes]: any[] = await Promise.all([
          dashboardApi.summary().catch(() => ({ data: {} })),
          dashboardApi.expiringLeases().catch(() => ({ data: { items: [] } })),
          dashboardApi.trend({ months: 12 }).catch(() => ({ data: { series: [] } })),
          dashboardApi.financialReconciliation().catch(() => ({ data: { totals: {}, by_property: [] } })),
        ]);
        setSummary(sumRes?.data ?? {});
        setExpiring((expRes?.data ?? {}).items ?? []);
        const trendD = trendRes?.data ?? {};
        const trendRows = Array.isArray(trendD.series) ? trendD.series : [];
        setTrend(trendRows);
        const reconD = reconRes?.data ?? {};
        setTotals((reconD.totals ?? {}) as { received?: number; receivable?: number; overdue?: number });
        setByProperty(reconD.by_property ?? []);
      } else if (target === 'recon') {
        const res: any = await dashboardApi.financialReconciliation();
        const d = res?.data ?? {};
        setTotals(d.totals ?? {});
        setByProperty(d.by_property ?? []);
      } else if (target === 'trend') {
        const res: any = await dashboardApi.trend({ months: 12 });
        setTrend((res?.data ?? {}).series ?? []);
      } else if (target === 'audit') {
        const res: any = await auditApi.list({});
        const d = res?.data ?? {};
        setAudits((d.items ?? d ?? []) as AuditRow[]);
      } else if (target === 'commission') {
        const res: any = await commissionRulesApi.list({});
        const d = res?.data ?? {};
        setRules((d.items ?? d ?? []) as CommissionRule[]);
      }
    } catch (e) {
      /* 加载失败不阻塞 */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTab('overview');
    }, [loadTab]),
  );

  const switchTab = (t: Tab) => {
    setTab(t);
    if (!dataLoaded(t)) loadTab(t);
  };

  const dataLoaded = (t: Tab) => {
    if (t === 'overview') return Object.keys(summary).length > 0;
    if (t === 'recon') return byProperty.length > 0;
    if (t === 'trend') return trend.length > 0;
    if (t === 'audit') return audits.length > 0;
    return rules.length > 0;
  };

  const reload = async () => {
    setRefreshing(true);
    await loadTab(tab);
  };

  // 近 6 个月营收（用于概览收入趋势图）
  const revenueTrend = trend.slice(-6).map((t) => ({
    label: `${Number(t.month?.slice(5))}月`,
    value: t.revenue ?? 0,
  }));

  const addRule = async () => {
    if (!name || !rate) return;
    const ruleName = name;
    try {
      await commissionRulesApi.create({
        name,
        rate: Number(rate),
        deal_type: dealType,
      });
      setName('');
      setRate('');
      setDealType('new_rental');
      await loadTab('commission');
      Alert.alert('新增成功', `佣金规则「${ruleName}」已生效`);
    } catch (e: any) {
      Alert.alert('新增失败', e?.response?.data?.message || '请稍后重试');
    }
  };

  return (
    <View style={styles.container}>
      {/* 顶部欢迎区 */}
      <View style={styles.hero}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroTitle}>管理员工作台</Text>
          <Text style={styles.heroSub}>系统管理权限 · 全局数据概览</Text>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="shield" size={14} color="#fff" />
          <Text style={styles.heroBadgeText}>ADMIN</Text>
        </View>
      </View>

      {/* 快捷入口：展示页未覆盖的工作工具，置顶导航 */}
      <View style={styles.actionGrid}>
        {QUICK_ACTIONS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.actionCell}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(item.route)}
          >
            <View style={styles.actionCellIcon}>
              <Ionicons name={item.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.actionCellLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab 导航 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => switchTab(t.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={t.icon}
              size={18}
              color={tab === t.key ? '#fff' : colors.ink2}
            />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reload}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.loadingWrap}>
            <LoadingState />
          </View>
        )}

        {/* ===== 运营概览 ===== */}
        {tab === 'overview' && (
          <View>
            {/* 核心数据 */}
            <View style={styles.primaryRow}>
              <View style={[styles.primaryCard, styles.cardPrimary]}>
                <Ionicons name="business-outline" size={22} color="#fff" style={styles.primaryIcon} />
                <Text style={styles.primaryNum}>{summary.total_properties ?? '-'}</Text>
                <Text style={styles.primaryLabel}>房源总数</Text>
              </View>
              <View style={[styles.primaryCard, styles.cardSuccess]}>
                <Ionicons name="trending-up-outline" size={22} color="#fff" style={styles.primaryIcon} />
                <Text style={styles.primaryNum}>{summary.occupancy_rate ?? 0}%</Text>
                <Text style={styles.primaryLabel}>入住率</Text>
              </View>
              <View style={[styles.primaryCard, styles.cardWarning]}>
                <Ionicons name="alarm-outline" size={22} color="#fff" style={styles.primaryIcon} />
                <Text style={styles.primaryNum}>{summary.expiring_leases ?? 0}</Text>
                <Text style={styles.primaryLabel}>到期合同</Text>
              </View>
            </View>

            {/* 次级数据 */}
            <View style={styles.miniRow}>
              <View style={styles.miniCard}>
                <Text style={[styles.miniNum, { color: colors.warning }]}>{summary.vacant ?? '-'}</Text>
                <Text style={styles.miniLabel}>空置</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={[styles.miniNum, { color: colors.success }]}>{summary.rented ?? '-'}</Text>
                <Text style={styles.miniLabel}>已出租</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={[styles.miniNum, { color: colors.error }]}>{summary.upcoming_payments ?? '-'}</Text>
                <Text style={styles.miniLabel}>待收款</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={[styles.miniNum, { color: colors.primary }]}>{summary.maintenance ?? '-'}</Text>
                <Text style={styles.miniLabel}>维护中</Text>
              </View>
            </View>

            {/* 营收大卡 */}
            <View style={styles.revenueCard}>
              <View style={styles.revenueLeft}>
                <Text style={styles.revenueLabel}>本月已收租金</Text>
                <Text style={styles.revenueNum}>{fmtMoney(summary.monthly_revenue)}</Text>
                <Text style={styles.revenueSub}>在租合同营收 {fmtMoney(summary.active_lease_revenue)}</Text>
              </View>
              <View style={styles.revenueIcon}>
                <Ionicons name="cash-outline" size={40} color="rgba(255,255,255,0.9)" />
              </View>
            </View>

            {/* 收入趋势图（近 6 个月营收） */}
            {revenueTrend.length > 0 && (
              <View style={styles.trendChartCard}>
                <View style={styles.chartHeaderRow}>
                  <View>
                    <Text style={styles.chartCardTitle}>收入趋势</Text>
                    <Text style={styles.chartCardSub}>近 6 个月营收</Text>
                  </View>
                  <View style={styles.chartLegend}>
                    <View style={styles.legendDotLine} />
                    <Text style={styles.legendText}>营收</Text>
                  </View>
                </View>
                <BarChart
                  data={revenueTrend}
                  height={140}
                  activeIndex={revenueTrend.length - 1}
                />
              </View>
            )}

            {/* 财务对账概要 */}
            <View style={styles.reconCard}>
              <View style={styles.reconHead}>
                <Text style={styles.chartCardTitle}>财务对账概要</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => switchTab('recon')}>
                  <Text style={styles.reconMore}>查看明细 ›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.reconRow}>
                <View style={styles.reconItem}>
                  <Text style={[styles.reconNum, { color: colors.success }]}>{fmtMoney(totals.received)}</Text>
                  <Text style={styles.reconLabel}>实收</Text>
                </View>
                <View style={styles.reconDivider} />
                <View style={styles.reconItem}>
                  <Text style={[styles.reconNum, { color: colors.warning }]}>{fmtMoney(totals.receivable)}</Text>
                  <Text style={styles.reconLabel}>待收</Text>
                </View>
                <View style={styles.reconDivider} />
                <View style={styles.reconItem}>
                  <Text style={[styles.reconNum, { color: colors.error }]}>{fmtMoney(totals.overdue)}</Text>
                  <Text style={styles.reconLabel}>逾期</Text>
                </View>
              </View>
            </View>

            {/* 临期租约 */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>临期租约</Text>
              <Text style={styles.sectionHint}>30 天内到期</Text>
            </View>
            {expiring.length === 0 && !loading && (
              <EmptyState icon="alarm-outline" title="无临期租约" sub="30 天内到期的租约会在这里预警" />
            )}
            {expiring.map((e: any) => (
              <View key={e.id} style={styles.expireCard}>
                <View style={styles.expireMain}>
                  <Text style={styles.expireTitle} numberOfLines={1}>{e.property_name || '-'}</Text>
                  <Text style={styles.expireSub}>租客：{e.tenant_name || '-'}</Text>
                </View>
                <View style={styles.expireRight}>
                  <View style={[styles.tag, (e.days_left ?? 0) <= 7 ? styles.tagError : styles.tagWarning]}>
                    <Text style={[styles.tagText, (e.days_left ?? 0) <= 7 ? styles.tagError_text : styles.tagWarning_text]}>{e.days_left ?? 0} 天</Text>
                  </View>
                  <Text style={styles.expireRent}>{fmtMoney(e.monthly_rent, e.currency)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ===== 财务对账 ===== */}
        {tab === 'recon' && (
          <View>
            <View style={styles.primaryRow}>
              <View style={[styles.primaryCard, styles.cardSuccess]}>
                <Text style={styles.primaryNum}>{fmtMoney(totals.received)}</Text>
                <Text style={styles.primaryLabel}>已收款</Text>
              </View>
              <View style={[styles.primaryCard, styles.cardWarning]}>
                <Text style={styles.primaryNum}>{fmtMoney(totals.receivable)}</Text>
                <Text style={styles.primaryLabel}>应收未收</Text>
              </View>
              <View style={[styles.primaryCard, styles.cardError]}>
                <Text style={styles.primaryNum}>{fmtMoney(totals.overdue)}</Text>
                <Text style={styles.primaryLabel}>逾期</Text>
              </View>
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>按房源对账</Text>
            </View>
            {byProperty.length === 0 && !loading && (
              <EmptyState icon="wallet-outline" title="暂无对账数据" sub="收款入账后这里会按房源汇总" />
            )}
            <View style={styles.tableCard}>
              <View style={[styles.tableRow, styles.tableHead]}>
                <Text style={[styles.cell, styles.cellLeft]}>房源</Text>
                <Text style={styles.cell}>已收</Text>
                <Text style={styles.cell}>逾期</Text>
              </View>
              {byProperty.map((r, i) => (
                <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.cell, styles.cellLeft]} numberOfLines={1}>{r.property || '-'}</Text>
                  <Text style={styles.cell}>{fmtMoney(r.received)}</Text>
                  <Text style={[styles.cell, styles.cellError]}>{fmtMoney(r.overdue)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ===== 运营趋势 ===== */}
        {tab === 'trend' && (
          <View>
            {/* 营收趋势折线图 */}
            <View style={styles.trendChartCard}>
              <View style={styles.chartHeaderRow}>
                <View>
                  <Text style={styles.chartCardTitle}>营收趋势</Text>
                  <Text style={styles.chartCardSub}>近 12 个月</Text>
                </View>
                <View style={styles.chartLegend}>
                  <View style={styles.legendDotLine} />
                  <Text style={styles.legendText}>营收</Text>
                </View>
              </View>
              {trend.length === 0 ? (
                !loading && <EmptyState icon="trending-up-outline" title="暂无趋势数据" sub="运营数据积累后展示" />
              ) : (
                <LineChart
                  data={trend.map((t) => ({
                    label: t.month.slice(5).replace('-', '.'),
                    value: t.revenue ?? 0,
                  }))}
                  height={200}
                  lineColor={colors.primary}
                  fillColor={`rgba(${colors.primaryRgb}, 0.12)`}
                  activeIndex={trend.length - 1}
                />
              )}
            </View>

            {/* 新签 vs 新线索 柱状对比 */}
            <View style={styles.trendChartCard}>
              <View style={styles.chartHeaderRow}>
                <View>
                  <Text style={styles.chartCardTitle}>业务增长</Text>
                  <Text style={styles.chartCardSub}>新签合同 & 新线索</Text>
                </View>
                <View style={styles.chartLegendRow}>
                  <View style={styles.legendBarPair}>
                    <View style={[styles.legendBar, { backgroundColor: colors.success }]} />
                    <Text style={styles.legendTextSm}>新签</Text>
                  </View>
                  <View style={styles.legendBarPair}>
                    <View style={[styles.legendBar, { backgroundColor: colors.warning }]} />
                    <Text style={styles.legendTextSm}>线索</Text>
                  </View>
                </View>
              </View>
              {trend.length > 0 ? (
                <View style={styles.dualBarWrap}>
                  {trend.slice(-8).map((t, idx) => {
                    const maxVal = Math.max(
                      ...trend.map((m) => Math.max(m.leases_new ?? 0, m.leads_new ?? 0)),
                      1
                    );
                    const leaseH = Math.max(((t.leases_new ?? 0) / maxVal) * 100, 3);
                    const leadH = Math.max(((t.leads_new ?? 0) / maxVal) * 100, 3);
                    return (
                      <View key={t.month} style={styles.dualBarCol}>
                        <View style={styles.dualBarValues}>
                          <Text style={styles.dualBarVal}>{t.leases_new ?? 0}</Text>
                          <Text style={styles.dualBarVal2}>{t.leads_new ?? 0}</Text>
                        </View>
                        <View style={styles.dualBars}>
                          <View
                            style={[
                              styles.dualBar,
                              styles.dualBarLeft,
                              { height: `${leaseH}%`, backgroundColor: colors.success },
                            ]}
                          />
                          <View
                            style={[
                              styles.dualBar,
                              styles.dualBarRight,
                              { height: `${leadH}%`, backgroundColor: colors.warning },
                            ]}
                          />
                        </View>
                        <Text style={styles.dualBarLabel}>{t.month.slice(5).replace('-', '')}月</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {/* 概览数据网格 */}
            <View style={styles.trendStatsGrid}>
              <View style={styles.trendStatCard}>
                <Text style={styles.trendStatLabel}>总营收</Text>
                <Text style={styles.trendStatVal}>
                  {fmtMoney(trend.reduce((s, t) => s + (t.revenue ?? 0), 0))}
                </Text>
                <View style={[styles.trendStatBar, { backgroundColor: colors.primary }]} />
              </View>
              <View style={styles.trendStatCard}>
                <Text style={styles.trendStatLabel}>新签合同</Text>
                <Text style={styles.trendStatVal}>
                  {trend.reduce((s, t) => s + (t.leases_new ?? 0), 0)}
                </Text>
                <View style={[styles.trendStatBar, { backgroundColor: colors.success }]} />
              </View>
              <View style={styles.trendStatCard}>
                <Text style={styles.trendStatLabel}>新增线索</Text>
                <Text style={styles.trendStatVal}>
                  {trend.reduce((s, t) => s + (t.leads_new ?? 0), 0)}
                </Text>
                <View style={[styles.trendStatBar, { backgroundColor: colors.warning }]} />
              </View>
            </View>
          </View>
        )}

        {/* ===== 审计日志 ===== */}
        {tab === 'audit' && (
          <View>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>审计日志</Text>
              <Text style={styles.sectionHint}>系统操作记录</Text>
            </View>
            {audits.length === 0 && !loading && (
              <EmptyState icon="shield-checkmark-outline" title="暂无审计日志" sub="系统操作记录将在此展示" />
            )}
            <View style={styles.auditList}>
              {audits.map((a, idx) => (
                <View key={a.id} style={styles.auditItem}>
                  <View style={styles.auditDot} />
                  {idx < audits.length - 1 && <View style={styles.auditLine} />}
                  <View style={styles.auditContent}>
                    <View style={styles.auditTop}>
                      <Text style={styles.auditAction} numberOfLines={1}>{a.action || '-'}</Text>
                      <View style={[styles.tag, styles.tagInfo]}>
                        <Text style={[styles.tagText, styles.tagInfo_text]}>{a.resource_type || '-'}</Text>
                      </View>
                    </View>
                    <View style={styles.auditMeta}>
                      <Text style={styles.auditActor}>{a.actor_name || '系统'}</Text>
                      <Text style={styles.auditTime}>
                        {a.occurred_at ? a.occurred_at.replace('T', ' ').slice(0, 19) : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ===== 佣金规则 ===== */}
        {tab === 'commission' && (
          <View>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>新增规则</Text>
            </View>
            <View style={styles.formCard}>
              <Text style={styles.formLabel}>规则名称</Text>
              <TextInput
                style={styles.formInput}
                placeholder="如：新签成交佣"
                placeholderTextColor={colors.ink3}
                value={name}
                onChangeText={setName}
              />
              <Text style={styles.formLabel}>交易类型</Text>
              <View style={styles.chipRow}>
                {Object.keys(DEAL_TYPE).map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.chip, dealType === k && styles.chipActive]}
                    onPress={() => setDealType(k)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, dealType === k && styles.chipTextActive]}>{DEAL_TYPE[k]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.formLabel}>佣金比例 %</Text>
              <TextInput
                style={styles.formInput}
                placeholder="请输入比例"
                placeholderTextColor={colors.ink3}
                keyboardType="numeric"
                value={rate}
                onChangeText={setRate}
              />
              <TouchableOpacity style={styles.submitBtn} onPress={addRule} activeOpacity={0.7}>
                <Text style={styles.submitBtnText}>新增规则</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>已有规则</Text>
              <Text style={styles.sectionHint}>共 {rules.length} 条</Text>
            </View>
            {rules.length === 0 && !loading && (
              <EmptyState icon="settings-outline" title="暂无佣金规则" sub="新增一条规则即可生效" />
            )}
            {rules.map((r) => (
              <View key={r.id} style={styles.ruleCard}>
                <View style={styles.ruleHead}>
                  <Text style={styles.ruleName} numberOfLines={1}>{r.name}</Text>
                  <View style={[styles.tag, r.is_active === false ? styles.tagWarning : styles.tagSuccess]}>
                    <Text style={[styles.tagText, r.is_active === false ? styles.tagWarning_text : styles.tagSuccess_text]}>{r.is_active === false ? '停用' : '启用'}</Text>
                  </View>
                </View>
                <View style={styles.ruleMeta}>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>类型</Text>
                    <Text style={styles.ruleMetaValue}>{DEAL_TYPE[r.deal_type] || r.deal_type}</Text>
                  </View>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>比例</Text>
                    <Text style={styles.ruleMetaPrimary}>{r.rate}%</Text>
                  </View>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>范围</Text>
                    <Text style={styles.ruleMetaValue}>{SCOPE[r.scope || ''] || '全体员工'}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  /* ===== 顶部欢迎区 ===== */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  heroLeft: { flex: 1 },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroSub: { fontSize: 12, color: colors.ink3 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.lg,
    gap: 4,
    ...colors.shadow.primary,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryForeground,
    letterSpacing: 0.5,
  },

  /* ===== 快捷入口宫格（无外壳） ===== */
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    marginBottom: 8,
  },
  actionCell: {
    width: '20%',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  actionCellIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCellLabel: { fontSize: 12, color: colors.ink2, fontWeight: '600' },

  /* ===== Tab 导航 ===== */
  tabScroll: {
    maxHeight: 72,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    paddingBottom: 12,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...colors.shadow.primary,
  },
  tabLabel: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  tabLabelActive: { color: '#fff', fontWeight: '700' },

  /* ===== 主体 ===== */
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 32 },
  loadingWrap: { paddingVertical: 32, alignItems: 'center' },

  /* ===== 核心数据卡（3列渐变） ===== */
  primaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  primaryCard: {
    flex: 1,
    borderRadius: colors.radius.xl,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.card,
  },
  cardPrimary: { backgroundColor: colors.primary },
  cardSuccess: { backgroundColor: colors.success },
  cardWarning: { backgroundColor: colors.warning },
  cardError: { backgroundColor: colors.error },
  primaryIcon: { marginBottom: 8 },
  primaryNum: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  primaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },

  /* ===== 次级数据（4列） ===== */
  miniRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  miniCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  miniNum: { fontSize: 18, fontWeight: '800', marginBottom: 3, fontVariant: ['tabular-nums'] },
  miniLabel: { fontSize: 10, color: colors.ink3, fontWeight: '500' },

  /* ===== 营收大卡 ===== */
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: colors.radius.xl,
    padding: 20,
    marginBottom: 8,
    ...colors.shadow.primary,
  },
  revenueLeft: { flex: 1 },
  revenueLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 6, fontWeight: '500' },
  revenueNum: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 4, fontVariant: ['tabular-nums'] },
  revenueSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  revenueIcon: { marginLeft: 12, opacity: 0.9 },

  /* ===== 财务对账概要卡 ===== */
  reconCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...colors.shadow.sm,
  },
  reconHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reconMore: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  reconRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  reconItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  reconDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  reconNum: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  reconLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },

  /* ===== 区块标题 ===== */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

  /* ===== 临期租约 ===== */
  expireCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  expireMain: { flex: 1, minWidth: 0 },
  expireTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  expireSub: { fontSize: 12, color: colors.ink3 },
  expireRight: { alignItems: 'flex-end', marginLeft: 12, gap: 6 },
  expireRent: { fontSize: 14, fontWeight: '700', color: colors.primary },

  /* ===== 标签 ===== */
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  tagText: { fontSize: 11, fontWeight: '600' },
  tagError: { backgroundColor: `rgba(${colors.errorRgb}, 0.12)` },
  tagWarning: { backgroundColor: `rgba(${colors.warningRgb}, 0.12)` },
  tagInfo: { backgroundColor: `rgba(${colors.primaryRgb}, 0.12)` },
  tagSuccess: { backgroundColor: `rgba(${colors.successRgb}, 0.12)` },
  tagError_text: { color: colors.error },
  tagWarning_text: { color: colors.warning },
  tagInfo_text: { color: colors.primary },
  tagSuccess_text: { color: colors.success },

  /* ===== 表格 ===== */
  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableHead: { backgroundColor: colors.surface2 },
  tableRowAlt: { backgroundColor: `rgba(${colors.primaryRgb}, 0.03)` },
  cell: { flex: 1, fontSize: 12, color: colors.ink2, textAlign: 'center' },
  cellLeft: { flex: 1.4, textAlign: 'left', fontWeight: '600', color: colors.ink },
  cellError: { color: colors.error, fontWeight: '600' },

  /* ===== 审计时间线 ===== */
  auditList: { position: 'relative', paddingLeft: 8 },
  auditItem: {
    flexDirection: 'row',
    position: 'relative',
    paddingBottom: 14,
  },
  auditDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginTop: 14,
    marginRight: 12,
    zIndex: 1,
    borderWidth: 3,
    borderColor: `rgba(${colors.primaryRgb}, 0.15)`,
  },
  auditLine: {
    position: 'absolute',
    left: 5,
    top: 26,
    bottom: 0,
    width: 2,
    backgroundColor: colors.border,
  },
  auditContent: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  auditTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  auditAction: { fontSize: 14, fontWeight: '700', color: colors.ink, flex: 1 },
  auditMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  auditActor: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  auditTime: { fontSize: 11, color: colors.ink3 },

  /* ===== 表单 ===== */
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 8, marginTop: 4 },
  formInput: {
    height: 44,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink3 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    ...colors.shadow.primary,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  /* ===== 佣金规则卡片 ===== */
  ruleCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  ruleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ruleName: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1, marginRight: 8 },
  ruleMeta: { flexDirection: 'row', gap: 12 },
  ruleMetaItem: { flex: 1 },
  ruleMetaLabel: { fontSize: 11, color: colors.ink3, marginBottom: 4 },
  ruleMetaValue: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  ruleMetaPrimary: { fontSize: 15, fontWeight: '800', color: colors.primary },

  /* ===== 趋势图表 ===== */
  trendChartCard: {
    marginHorizontal: 12,
    marginTop: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  chartCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  chartCardSub: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  chartLegend: { flexDirection: 'row', alignItems: 'center' },
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendDotLine: {
    width: 20,
    height: 2,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  legendText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  legendTextSm: { fontSize: 11, color: colors.ink3 },
  legendBarPair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendBar: { width: 8, height: 8, borderRadius: 2 },

  /* 双柱图 */
  dualBarWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingTop: 4,
  },
  dualBarCol: { flex: 1, alignItems: 'center', height: '100%' },
  dualBarValues: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  dualBarVal: { fontSize: 9, fontWeight: '600', color: colors.success },
  dualBarVal2: { fontSize: 9, fontWeight: '600', color: colors.warning },
  dualBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
  },
  dualBar: {
    width: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 3,
  },
  dualBarLeft: {},
  dualBarRight: {},
  dualBarLabel: { fontSize: 10, color: colors.ink3, marginTop: 6 },

  /* 趋势统计卡 */
  trendStatsGrid: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 14,
    gap: 8,
  },
  trendStatCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  trendStatLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },
  trendStatVal: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  trendStatBar: {
    height: 3,
    borderRadius: 2,
    marginTop: 10,
    width: '60%',
  },
});
