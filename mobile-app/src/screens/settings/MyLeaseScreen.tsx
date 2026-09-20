import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import EmptyState from '@/components/EmptyState';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtMoney as fmtRent } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Route = RouteProp<RootStackParamList, 'MyLease'>;

const DAY_MS = 86400000;
const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-');

/**
 * 我的租约（全屏下钻子页，微信「我→钱包→账单」式内容页）。
 * 由「我的 - 资产 - 我的租约」行进入；展示当前生效租约的租期进度与租金。
 * 数据由 ProfileScreen 加载后经路由参数传入。
 */
export default function MyLeaseScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<Route>();
  const activeLease: any = params?.activeLease ?? null;

  if (!activeLease) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState icon="document-text-outline" title={t('profile.noLease')} sub="签约后在这里查看租期进度与租金" />
      </View>
    );
  }

  const leaseName = activeLease.property_name || activeLease.room_number || t('home.myLease');
  const startTs = activeLease.start_date ? new Date(activeLease.start_date).getTime() : 0;
  const endTs = activeLease.end_date ? new Date(activeLease.end_date).getTime() : 0;
  const totalDays = startTs && endTs > startTs ? Math.round((endTs - startTs) / DAY_MS) : 0;
  const passedDays = startTs
    ? Math.max(0, Math.min(Math.round((Date.now() - startTs) / DAY_MS), totalDays || 0))
    : 0;
  const remainDays = endTs ? Math.max(0, Math.round((endTs - Date.now()) / DAY_MS)) : 0;
  const leaseProgress = totalDays > 0 ? Math.max(0, Math.min(passedDays / totalDays, 1)) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.card}>
        <View style={styles.leaseHead}>
          <Text style={styles.leaseTitle} numberOfLines={1}>{leaseName}</Text>
          <View style={styles.leaseBadge}>
            <View style={styles.leaseDot} />
            <Text style={styles.leaseBadgeText}>{t('home.leaseInforce')}</Text>
          </View>
        </View>
        <Text style={styles.leaseMeta}>
          月租金 {fmtRent(activeLease.monthly_rent, activeLease.currency)}
          {totalDays > 0 ? ` · 已过 ${passedDays} ${t('profile.dayUnit')} / 共 ${totalDays} ${t('profile.dayUnit')}` : ''}
        </Text>
        <View style={styles.leaseTrack}>
          <View style={[styles.leaseBar, { flex: Math.max(leaseProgress, 0.02) }]} />
          <View style={{ flex: Math.max(1 - leaseProgress, 0) }} />
        </View>
        <View style={styles.leaseFoot}>
          <Text style={styles.leaseFootText}>
            {fmtDate(activeLease.start_date)} 至 {fmtDate(activeLease.end_date)}
          </Text>
          {remainDays > 0 ? (
            <Text style={styles.leaseRemain}>
              {t('profile.remainPrefix')} {remainDays}{t('profile.dayUnit')}
            </Text>
          ) : null}
        </View>
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
  leaseBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leaseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  leaseBadgeText: { fontSize: 12, fontWeight: '600', color: colors.success },
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
});