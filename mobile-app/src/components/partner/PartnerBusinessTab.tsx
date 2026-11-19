/**
 * 合作公司控制台 · 成交与收款（只读）
 * GET /partner/leases · /partner/contracts · /partner/renewals · /partner/payments
 */
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { getErrorMessage } from '@/utils/feedback';
import { partnerAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';
import {
  Badge,
  SubTabs,
  fmtDate,
  shared,
  statusText,
  statusTone,
  symOf,
  unwrapBody,
} from './PartnerShared';

type BusinessTab = 'leases' | 'contracts' | 'renewals' | 'payments';

interface LeaseRow {
  id: string;
  lease_no?: string | null;
  contract_no?: string | null;
  property_address?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  monthly_rent?: number | null;
  currency?: string | null;
  status?: string | null;
}

interface ContractRow {
  id: string;
  contract_no?: string | null;
  title?: string | null;
  kind?: string | null;
  status?: string | null;
  signed_at?: string | null;
  created_at?: string | null;
}

interface RenewalRow {
  lease_id: string;
  lease_no?: string | null;
  end_date?: string | null;
  days_left?: number | null;
  monthly_rent?: number | null;
}

interface RenewalBucket {
  key: string;
  items?: RenewalRow[];
}

type RenewalRowWithBucket = RenewalRow & { bucket?: string };

interface PaymentRow {
  id: string;
  receipt_no?: string | null;
  payment_type?: string | null;
  amount?: number | null;
  late_fee_due?: number | null;
  total_due?: number | null;
  currency?: string | null;
  status?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  description?: string | null;
}

const isPayOverdue = (p: PaymentRow) => {
  if (!p.due_date) return false;
  if (p.status === 'succeeded' || p.status === 'refunded') return false;
  const t = new Date(p.due_date).getTime();
  return !Number.isNaN(t) && t < Date.now();
};

export default function PartnerBusinessTab() {
  const { t } = useI18n();
  const [tab, setTab] = useState<BusinessTab>('leases');
  const [leases, setLeases] = useState<LeaseRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [renewalBuckets, setRenewalBuckets] = useState<RenewalBucket[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (spinner = true) => {
      if (spinner) setLoading(true);
      setError('');
      try {
        const [leaseRes, contractRes, renewalRes, paymentRes] = await Promise.all([
          partnerAdminApi.leases({ page: 1, page_size: 100 }),
          partnerAdminApi.contracts({ page: 1, page_size: 100 }),
          partnerAdminApi.renewals({ days: 60 }),
          partnerAdminApi.payments({ page: 1, page_size: 100, overdue: overdueOnly }),
        ]);
        const leaseBody = unwrapBody<{ items?: LeaseRow[] }>(leaseRes.data);
        setLeases(Array.isArray(leaseBody?.items) ? leaseBody.items ?? [] : []);
        const contractBody = unwrapBody<{ items?: ContractRow[] }>(contractRes.data);
        setContracts(Array.isArray(contractBody?.items) ? contractBody.items ?? [] : []);
        const renewalBody = unwrapBody<{ buckets?: RenewalBucket[] }>(renewalRes.data);
        setRenewalBuckets(Array.isArray(renewalBody?.buckets) ? renewalBody.buckets ?? [] : []);
        const paymentBody = unwrapBody<{ items?: PaymentRow[]; outstanding?: number }>(paymentRes.data);
        setPayments(Array.isArray(paymentBody?.items) ? paymentBody.items ?? [] : []);
        setOutstanding(Number(paymentBody?.outstanding ?? 0));
      } catch (e: any) {
        setError(getErrorMessage(e, t('partner.loadFailed')));
      } finally {
        setLoading(false);
      }
    },
    [overdueOnly, t],
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

  const renewalRows: RenewalRowWithBucket[] = renewalBuckets.flatMap((b) => {
    const list = b.items ?? [];
    return list.map((x) => ({ ...x, bucket: b.key }));
  });

  type AnyRow = LeaseRow | ContractRow | RenewalRowWithBucket | PaymentRow;
  const data: AnyRow[] =
    tab === 'leases' ? leases : tab === 'contracts' ? contracts : tab === 'renewals' ? renewalRows : payments;

  const emptyTitle =
    tab === 'leases'
      ? t('partner.bz.leaseEmpty')
      : tab === 'contracts'
        ? t('partner.bz.contractEmpty')
        : tab === 'renewals'
          ? t('partner.bz.renewalEmpty')
          : t('partner.bz.paymentEmpty');

  return (
    <FlatList
      data={data}
      keyExtractor={(r: any) => String(r.id ?? r.lease_id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View>
          <SubTabs
            value={tab}
            onChange={setTab}
            items={[
              { key: 'leases', label: t('partner.bz.leases') },
              { key: 'contracts', label: t('partner.bz.contracts') },
              { key: 'renewals', label: t('partner.bz.renewals') },
              { key: 'payments', label: t('partner.bz.payments') },
            ]}
          />
          {!!error && <Text style={shared.errorText}>{error}</Text>}
          {tab === 'payments' && (
            <View style={styles.filterRow}>
              <Text style={styles.outstanding}>
                {t('partner.bz.outstanding')} {symOf()}
                {outstanding.toLocaleString()}
              </Text>
              <TouchableOpacity
                style={[styles.filterChip, overdueOnly && styles.filterChipActive]}
                activeOpacity={0.7}
                onPress={() => setOverdueOnly((v) => !v)}
              >
                <Text style={[styles.filterChipText, overdueOnly && styles.filterChipTextActive]}>
                  {t('partner.bz.overdueOnly')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{ height: 12 }} />
        </View>
      }
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
          <EmptyState icon="document-text-outline" title={emptyTitle} sub={t('member.pullRefresh')} />
        )
      }
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={({ item }) => {
        if (tab === 'leases') {
          const r = item as LeaseRow;
          return (
            <View style={shared.card}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={1}>
                    {r.lease_no || '—'}
                  </Text>
                  <Text style={shared.rowSub} numberOfLines={1}>
                    {r.property_address || '—'}
                  </Text>
                </View>
                <Badge text={statusText(t, 'lease.status', r.status)} tone={statusTone(r.status)} />
              </View>
              <View style={shared.chipRow}>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.bz.startDate')}</Text>
                  <Text style={shared.chipValue}>{fmtDate(r.start_date)}</Text>
                </View>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.bz.endDate')}</Text>
                  <Text style={shared.chipValue}>{fmtDate(r.end_date)}</Text>
                </View>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.bz.monthlyRent')}</Text>
                  <Text style={shared.chipValue}>
                    {symOf(r.currency)}
                    {Number(r.monthly_rent ?? 0).toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          );
        }
        if (tab === 'contracts') {
          const r = item as ContractRow;
          return (
            <View style={shared.card}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={1}>
                    {r.title || r.contract_no || '—'}
                  </Text>
                  <Text style={shared.rowSub} numberOfLines={1}>
                    {r.contract_no || '—'}
                  </Text>
                </View>
                <Badge text={statusText(t, 'contract.status', r.status)} tone={statusTone(r.status)} />
              </View>
              <View style={shared.chipRow}>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.bz.kind')}</Text>
                  <Text style={shared.chipValue}>{r.kind || '—'}</Text>
                </View>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.bz.signedAt')}</Text>
                  <Text style={shared.chipValue}>{fmtDate(r.signed_at || r.created_at)}</Text>
                </View>
              </View>
            </View>
          );
        }
        if (tab === 'renewals') {
          const r = item as RenewalRow & { bucket?: string };
          const urgent = Number(r.days_left ?? 99) <= 7;
          return (
            <View style={[shared.card, urgent && shared.cardOverdue]}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={1}>
                    {r.lease_no || '—'}
                  </Text>
                  <Text style={shared.rowSub}>
                    {t('partner.bz.endDate')} {fmtDate(r.end_date)}
                  </Text>
                </View>
                <Badge
                  text={t('partner.bz.daysLeftN', { n: Number(r.days_left ?? 0) })}
                  tone={urgent ? 'error' : 'warning'}
                />
              </View>
              <Text style={[shared.rowSub, { marginTop: 6 }]}>
                {t('partner.bz.monthlyRent')} {symOf()}
                {Number(r.monthly_rent ?? 0).toLocaleString()} · {t('partner.bz.withinDays', { n: r.bucket ?? 60 })}
              </Text>
            </View>
          );
        }
        const r = item as PaymentRow;
        const overdue = isPayOverdue(r);
        return (
          <View style={[shared.card, overdue && shared.cardOverdue]}>
            <View style={shared.rowHead}>
              <View style={shared.rowMain}>
                <Text style={shared.rowTitle} numberOfLines={1}>
                  {r.receipt_no || '—'}
                </Text>
                <Text style={shared.rowSub} numberOfLines={1}>
                  {r.payment_type || '—'}
                  {r.description ? ` · ${r.description}` : ''}
                </Text>
              </View>
              <Badge
                text={overdue ? t('partner.bz.overdue') : statusText(t, 'pay.status', r.status)}
                tone={overdue ? 'error' : statusTone(r.status)}
              />
            </View>
            <View style={shared.chipRow}>
              <View style={shared.chip}>
                <Text style={shared.chipLabel}>{t('partner.bz.totalDue')}</Text>
                <Text style={shared.chipValue}>
                  {symOf(r.currency)}
                  {Number(r.total_due ?? 0).toLocaleString()}
                </Text>
              </View>
              <View style={shared.chip}>
                <Text style={shared.chipLabel}>{t('partner.bz.dueDate')}</Text>
                <Text style={shared.chipValue}>{fmtDate(r.due_date)}</Text>
              </View>
              {!!r.paid_at && (
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.st.paidAt')}</Text>
                  <Text style={shared.chipValue}>{fmtDate(r.paid_at)}</Text>
                </View>
              )}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
  },
  outstanding: { fontSize: colors.fontSize.xs, color: colors.error, fontWeight: '700' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: colors.surface, borderColor: colors.error },
  filterChipText: { fontSize: colors.fontSize.xs, fontWeight: '600', color: colors.ink2 },
  filterChipTextActive: { color: colors.error, fontWeight: '700' },
});
