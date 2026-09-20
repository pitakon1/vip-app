import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import EmptyState from '@/components/EmptyState';
import { leasesApi } from '@/services/api';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtMoney as fmtRent } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Route = RouteProp<RootStackParamList, 'MyLeaseDetail'>;

const DAY_MS = 86400000;
const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-');

const LEASE_STATUS: Record<string, { text: string; color: string; bg: string }> = {
  active: { text: '生效中', color: colors.success, bg: colors.successLight },
  pending: { text: '待生效', color: colors.warning, bg: colors.warningLight },
  expired: { text: '已到期', color: colors.ink3, bg: colors.surface2 },
  terminated: { text: '已终止', color: colors.error, bg: colors.errorLight },
};

const DEPOSIT_STATUS: Record<string, string> = {
  held: '托管中',
  refunded: '已退还',
  forfeited: '已没收',
};

const leaseTitle = (l: any) =>
  l?.property_name || l?.room_number || l?.address || `租约 #${String(l?.id ?? '').slice(0, 8)}`;

/**
 * 租约详情（全屏下钻子页）。
 * 由「我的租约」列表行进入；自拉 /leases/{id} 展示租期、租金与押金明细。
 */
export default function MyLeaseDetailScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<Route>();
  const [lease, setLease] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    leasesApi
      .get(params.lease_id)
      .then((res: any) => {
        if (alive) setLease(res?.data ?? null);
      })
      .catch(() => {
        /* 加载失败保持空态 */
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [params.lease_id]);

  if (loaded && !lease) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState icon="document-text-outline" title={t('profile.noLease')} sub="租约不存在或已删除" />
      </View>
    );
  }
  if (!lease) {
    return <View style={styles.emptyWrap} />;
  }

  const meta = LEASE_STATUS[String(lease?.status ?? '')] ?? LEASE_STATUS.pending;
  const startTs = lease?.start_date ? new Date(lease.start_date).getTime() : 0;
  const endTs = lease?.end_date ? new Date(lease.end_date).getTime() : 0;
  const totalDays = startTs && endTs > startTs ? Math.round((endTs - startTs) / DAY_MS) : 0;
  const passedDays = startTs
    ? Math.max(0, Math.min(Math.round((Date.now() - startTs) / DAY_MS), totalDays || 0))
    : 0;
  const remainDays = endTs ? Math.max(0, Math.round((endTs - Date.now()) / DAY_MS)) : 0;
  const progress = totalDays > 0 ? Math.max(0, Math.min(passedDays / totalDays, 1)) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* 租期卡 */}
      <View style={styles.card}>
        <View style={styles.leaseHead}>
          <Text style={styles.leaseTitle} numberOfLines={1}>{leaseTitle(lease)}</Text>
          <View style={[styles.leaseBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.leaseBadgeText, { color: meta.color }]}>{meta.text}</Text>
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
            {fmtDate(lease?.start_date)} 至 {fmtDate(lease?.end_date)}
          </Text>
          {remainDays > 0 ? (
            <Text style={styles.leaseRemain}>
              {t('profile.remainPrefix')} {remainDays}{t('profile.dayUnit')}
            </Text>
          ) : null}
        </View>
        {totalDays > 0 && (
          <Text style={styles.leaseSub}>
            已过 {passedDays} / 共 {totalDays} {t('profile.dayUnit')}
          </Text>
        )}
      </View>

      {/* 明细卡 */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>租约明细</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('profile.monthlyRent')}</Text>
          <Text style={styles.detailValue}>
            {fmtRent(Number(lease?.monthly_rent || 0), lease?.currency)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>押金</Text>
          <Text style={styles.detailValue}>
            {fmtRent(Number(lease?.deposit_amount || 0), lease?.currency)}
            {lease?.deposit_status ? ` · ${DEPOSIT_STATUS[lease.deposit_status] ?? lease.deposit_status}` : ''}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>租期开始</Text>
          <Text style={styles.detailValue}>{fmtDate(lease?.start_date)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>租期结束</Text>
          <Text style={styles.detailValue}>{fmtDate(lease?.end_date)}</Text>
        </View>
        {lease?.contract_url ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>电子合同</Text>
            <Text style={[styles.detailValue, styles.linkValue]} numberOfLines={1}>查看合同</Text>
          </View>
        ) : null}
        {lease?.special_terms ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>特殊条款</Text>
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
    ...colors.shadow.card,
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
  leaseBadgeText: { fontSize: 11, fontWeight: '600' },
  leaseMeta: { fontSize: 13, color: colors.ink2, marginTop: 8 },
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
  leaseSub: { fontSize: 11, color: colors.ink3, marginTop: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 4 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailLabel: { fontSize: 13, color: colors.ink3 },
  detailValue: { fontSize: 13, fontWeight: '600', color: colors.ink },
  linkValue: { color: colors.primary },
});
