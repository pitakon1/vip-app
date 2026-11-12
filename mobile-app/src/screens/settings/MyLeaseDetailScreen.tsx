import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import { leasesApi } from '@/services/api';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtMoney as fmtRent, fmtDate } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCachedQuery } from '@/lib/useCachedQuery';

type Route = RouteProp<RootStackParamList, 'MyLeaseDetail'>;

const DAY_MS = 86400000;

const LEASE_STATUS: Record<string, { key: string; color: string; bg: string }> = {
  active: { key: 'lease.status.active', color: colors.success, bg: colors.successLight },
  pending: { key: 'lease.status.pending', color: colors.warning, bg: colors.warningLight },
  expired: { key: 'lease.status.expired', color: colors.ink3, bg: colors.surface2 },
  terminated: { key: 'lease.status.terminated', color: colors.error, bg: colors.errorLight },
};

const DEPOSIT_STATUS: Record<string, string> = {
  held: 'lease.deposit.held',
  refunded: 'lease.deposit.refunded',
  forfeited: 'lease.deposit.forfeited',
};

const leaseTitle = (l: any, t: (k: string) => string) =>
  l?.property_name ||
  l?.room_number ||
  l?.address ||
  `${t('lease.idPrefix')} #${String(l?.id ?? '').slice(0, 8)}`;

/**
 * 租约详情（全屏下钻子页）。
 * 由「我的租约」列表行进入；自拉 /leases/{id} 展示租期、租金与押金明细。
 */
export default function MyLeaseDetailScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<Route>();

  const q = useCachedQuery<any | null>({
    queryKey: ['lease', 'detail', params.lease_id],
    cacheKey: `lease:detail:${params.lease_id}`,
    queryFn: async () => {
      const res: any = await leasesApi.get(params.lease_id);
      return res?.data ?? null;
    },
  });
  const lease = q.data ?? null;
  const loaded = q.isSuccess;
  const loading = q.isPending && !q.data;
  const loadError = q.isError && !q.data;
  const retry = () => {
    void q.refetch({ cancelRefetch: false });
  };

  if (loading) {
    return <ListState loading />;
  }
  if (loadError) {
    return <ListState error={t('lease.loadFailed')} retryLabel={t('common.retry')} onRetry={retry} />;
  }
  if (loaded && !lease) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState icon="document-text-outline" title={t('profile.noLease')} sub={t('lease.notFound')} />
      </View>
    );
  }
  if (!lease) {
    return <View style={styles.emptyWrap} />;
  }

  const meta = LEASE_STATUS[String(lease?.status ?? '')];
  const startTs = lease?.start_date ? new Date(lease.start_date).getTime() : 0;
  const endTs = lease?.end_date ? new Date(lease.end_date).getTime() : 0;
  const totalDays = startTs && endTs > startTs ? Math.round((endTs - startTs) / DAY_MS) : 0;
  const passedDays = startTs
    ? Math.max(0, Math.min(Math.round((Date.now() - startTs) / DAY_MS), totalDays || 0))
    : 0;
  const remainDays = endTs ? Math.max(0, Math.round((endTs - Date.now()) / DAY_MS)) : 0;
  const progress = totalDays > 0 ? Math.max(0, Math.min(passedDays / totalDays, 1)) : 0;

  // 电子合同：仅展示入口时不可点曾是「假按钮」，这里真实打开（浏览器，失败降级系统链接）
  const openContract = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {
      Linking.openURL(url).catch(() => undefined);
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* 租期卡 */}
      <View style={styles.card}>
        <View style={styles.leaseHead}>
          <Text style={styles.leaseTitle} numberOfLines={1}>{leaseTitle(lease, t)}</Text>
          <View style={[styles.leaseBadge, { backgroundColor: meta?.bg ?? colors.surface2 }]}>
            <Text style={[styles.leaseBadgeText, { color: meta?.color ?? colors.ink3 }]}>
              {meta ? t(meta.key) : t('common.unknown')}
            </Text>
          </View>
        </View>
        <Text style={styles.leaseMeta}>
          {t('profile.monthlyRent')} {fmtRent(Number(lease?.monthly_rent || 0), lease?.currency)}
        </Text>
        <View style={styles.leaseTrack}>
          <View style={[styles.leaseBar, { flex: Math.max(progress, 0.02) }]} />
          <View style={{ flex: Math.max(1 - progress, 0) }} />
        </View>
        <View style={styles.leaseFoot}>
          <Text style={styles.leaseFootText}>
            {fmtDate(lease?.start_date)} {t('lease.until')} {fmtDate(lease?.end_date)}
          </Text>
          {remainDays > 0 ? (
            <Text style={styles.leaseRemain}>
              {t('profile.remainPrefix')} {remainDays}{t('profile.dayUnit')}
            </Text>
          ) : null}
        </View>
        {totalDays > 0 && (
          <Text style={styles.leaseSub}>
            {t('lease.passedOf', { a: passedDays, b: totalDays })}
          </Text>
        )}
      </View>

      {/* 明细卡 */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>{t('lease.details')}</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('profile.monthlyRent')}</Text>
          <Text style={styles.detailValue}>
            {fmtRent(Number(lease?.monthly_rent || 0), lease?.currency)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('lease.deposit')}</Text>
          <Text style={styles.detailValue}>
            {fmtRent(Number(lease?.deposit_amount || 0), lease?.currency)}
            {lease?.deposit_status
              ? ` · ${DEPOSIT_STATUS[lease.deposit_status] ? t(DEPOSIT_STATUS[lease.deposit_status]) : t('common.unknown')}`
              : ''}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('lease.startDate')}</Text>
          <Text style={styles.detailValue}>{fmtDate(lease?.start_date)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('lease.endDate')}</Text>
          <Text style={styles.detailValue}>{fmtDate(lease?.end_date)}</Text>
        </View>
        {lease?.contract_url ? (
          <TouchableOpacity
            style={styles.detailRow}
            activeOpacity={0.7}
            onPress={() => openContract(String(lease.contract_url))}
            accessibilityRole="link"
            accessibilityLabel={t('lease.viewContract')}
          >
            <Text style={styles.detailLabel}>{t('lease.contract')}</Text>
            <Text style={[styles.detailValue, styles.linkValue]} numberOfLines={1}>
              {t('lease.viewContract')}
            </Text>
          </TouchableOpacity>
        ) : null}
        {lease?.special_terms ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('lease.specialTerms')}</Text>
            <Text style={[styles.detailValue, { flex: 1, textAlign: 'right' }]}>{lease.special_terms}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  leaseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leaseTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  leaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  leaseBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600', lineHeight: colors.lineHeight.tight},
  leaseMeta: { fontSize: colors.fontSize.caption, color: colors.ink2, marginTop: 8 },
  leaseTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: 10,
  },
  leaseBar: { height: 6, borderRadius: colors.radius.full, backgroundColor: colors.primary },
  leaseFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  leaseFootText: { fontSize: 12, color: colors.ink3 },
  leaseRemain: { fontSize: 12, fontWeight: '700', color: colors.primary },
  leaseSub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 6, lineHeight: colors.lineHeight.tight},
  sectionLabel: { fontSize: colors.fontSize.caption, fontWeight: '600', color: colors.ink, marginBottom: 4 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailLabel: { fontSize: colors.fontSize.caption, color: colors.ink3 },
  detailValue: { fontSize: colors.fontSize.caption, fontWeight: '600', color: colors.ink },
  linkValue: { color: colors.primary },
});
