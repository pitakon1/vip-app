/**
 * 合作公司控制台 · 佣金对账单
 * GET /partner/settlements?start=YYYY-MM-DD&end=YYYY-MM-DD&status=&page_size=
 * （后端按月过滤以 start/end 表达，这里由月份换算）
 */
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
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
  SubTabs,
  currentMonthKey,
  fmtDateTime,
  monthRange,
  shared,
  statusText,
  statusTone,
  symOf,
  unwrapBody,
} from './PartnerShared';

type StatusKey = 'all' | 'pending' | 'approved' | 'paid';

interface SettlementRow {
  id: string;
  lease_id?: string | null;
  contract_id?: string | null;
  deal_type?: string | null;
  role?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  commission_base?: number | null;
  commission_rate?: number | null;
  commission_amount?: number | null;
  split_percent?: number | null;
  currency?: string | null;
  status?: string | null;
  settled_at?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
}

interface SettlementResp {
  items?: SettlementRow[];
  total?: number;
  sum?: { base?: number; amount?: number } | null;
}

export default function PartnerSettlementsTab() {
  const { t } = useI18n();
  const [month, setMonth] = useState(currentMonthKey());
  const [status, setStatus] = useState<StatusKey>('all');
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [summary, setSummary] = useState<SettlementResp['sum']>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (spinner = true) => {
      if (spinner) setLoading(true);
      setError('');
      try {
        const { start, end } = monthRange(month);
        const { data: body } = await partnerAdminApi.settlements({
          start,
          end,
          status: status === 'all' ? undefined : status,
          page: 1,
          page_size: 100,
        });
        const resp = unwrapBody<SettlementResp>(body) ?? {};
        setRows(Array.isArray(resp.items) ? resp.items : []);
        setSummary(resp.sum ?? null);
        setTotal(Number(resp.total ?? 0));
      } catch (e: any) {
        setError(getErrorMessage(e, t('partner.loadFailed')));
      } finally {
        setLoading(false);
      }
    },
    [month, status, t],
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

  const header = (
    <View>
      <View style={styles.monthRow}>
        <Text style={styles.monthLabel}>{t('partner.db.month')}</Text>
        <MonthSwitcher value={month} onChange={setMonth} />
      </View>
      <SubTabs
        value={status}
        onChange={setStatus}
        items={[
          { key: 'all', label: t('partner.st.allStatus') },
          { key: 'pending', label: statusText(t, 'partner.status', 'pending') },
          { key: 'approved', label: statusText(t, 'partner.status', 'approved') },
          { key: 'paid', label: statusText(t, 'partner.status', 'paid') },
        ]}
      />
      {!!error && <Text style={shared.errorText}>{error}</Text>}
      <Text style={styles.summary}>
        {t('partner.st.summary', {
          n: total,
          base: `${symOf()}${Number(summary?.base ?? 0).toLocaleString()}`,
          amount: `${symOf()}${Number(summary?.amount ?? 0).toLocaleString()}`,
        })}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        error ? (
          <EmptyState
            icon="cloud-offline-outline"
            tone="error"
            title={error}
            actionLabel={t('common.retry')}
            onAction={() => load(true)}
          />
        ) : (
          <EmptyState icon="receipt-outline" title={t('partner.st.empty')} sub={t('member.pullRefresh')} />
        )
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={({ item }) => (
        <View style={shared.card}>
          <View style={shared.rowHead}>
            <View style={shared.rowMain}>
              <Text style={shared.rowTitle} numberOfLines={1}>
                {item.employee_name || t('acc.unnamed')}
              </Text>
              <Text style={shared.rowSub} numberOfLines={1}>
                {t('partner.st.lease')} {item.lease_id ? `#${item.lease_id.slice(0, 8)}` : '—'}
                {item.contract_id ? ` · ${t('partner.st.contract')} #${item.contract_id.slice(0, 8)}` : ''}
              </Text>
            </View>
            <Badge text={statusText(t, 'partner.status', item.status)} tone={statusTone(item.status)} />
          </View>

          <View style={shared.chipRow}>
            <View style={shared.chip}>
              <Text style={shared.chipLabel}>{t('partner.st.dealType')}</Text>
              <Text style={shared.chipValue}>{item.deal_type || '—'}</Text>
            </View>
            {!!item.role && (
              <View style={shared.chip}>
                <Text style={shared.chipLabel}>{t('partner.st.role')}</Text>
                <Text style={shared.chipValue}>{item.role}</Text>
              </View>
            )}
            <View style={shared.chip}>
              <Text style={shared.chipLabel}>{t('partner.st.base')}</Text>
              <Text style={shared.chipValue}>
                {symOf(item.currency)}
                {Number(item.commission_base ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={shared.chip}>
              <Text style={shared.chipLabel}>{t('partner.st.rate')}</Text>
              <Text style={shared.chipValue}>{Number(item.commission_rate ?? 0)}%</Text>
            </View>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>{t('partner.st.amount')}</Text>
            <Text style={styles.amount}>
              {symOf(item.currency)}
              {Number(item.commission_amount ?? 0).toLocaleString()}
            </Text>
          </View>

          <Text style={shared.rowSub}>
            {t('partner.st.settledAt')} {fmtDateTime(item.created_at)}
            {item.paid_at ? ` · ${t('partner.st.paidAt')} ${fmtDateTime(item.paid_at)}` : ''}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  monthLabel: { marginLeft: 20, marginTop: 12, fontSize: colors.fontSize.xs, color: colors.ink3 },
  summary: {
    marginHorizontal: 20,
    marginTop: 12,
    fontSize: colors.fontSize.xs,
    color: colors.ink3,
    lineHeight: colors.lineHeight.tight,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  amountLabel: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  amount: { fontSize: 17, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
});
