import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import { leasesApi } from '@/services/api';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtMoney as fmtRent } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';

const DAY_MS = 86400000;
const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-');

// 租约状态（LeaseStatus，与小程序 profile 一致）
const LEASE_STATUS: Record<string, { text: string; color: string; bg: string }> = {
  active: { text: '生效中', color: colors.success, bg: colors.successLight },
  pending: { text: '待生效', color: colors.warning, bg: colors.warningLight },
  expired: { text: '已到期', color: colors.ink3, bg: colors.surface2 },
  terminated: { text: '已终止', color: colors.error, bg: colors.errorLight },
};

const leaseTitle = (l: any) =>
  l?.property_name || l?.room_number || l?.address || `租约 #${String(l?.id ?? '').slice(0, 8)}`;

const leaseProgress = (l: any) => {
  const start = new Date(l?.start_date || l?.startDate || '').getTime();
  const end = new Date(l?.end_date || l?.endDate || '').getTime();
  if (!start || !end || end <= start) return 0;
  const ratio = (Date.now() - start) / (end - start);
  return Math.min(1, Math.max(0, ratio));
};

/**
 * 我的租约（全屏下钻子页）。
 * 由「我的 - 常用功能 - 我的租约」进入；自拉 /leases/me 展示本人全部租约，点击行进入租约详情。
 */
export default function MyLeaseScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);

  // 业主不能用租客接口 /leases/me（该方法只按 tenant_id 查询，业主持有房源
  // 不是租客，永远返回空）。业主改走 /leases，由后端 owner_visibility 收窄到
  // 本人名下房源的租约；租客仍用 /leases/me 看自己承租的租约。
  const isOwner = user?.role === 'owner';
  const q = useCachedQuery<any[]>({
    queryKey: ['leases', isOwner ? 'owner' : 'mine', user?.id ?? 'anon'],
    cacheKey: `leases:${isOwner ? 'owner' : 'mine'}:${user?.id ?? 'anon'}`,
    queryFn: async () => {
      const res: any = isOwner
        ? await leasesApi.list({ page: 1, page_size: 50 })
        : await leasesApi.mine();
      const payload = res?.data;
      return Array.isArray(payload) ? payload : payload?.items ?? [];
    },
  });
  const leases = q.data ?? [];
  const loaded = q.isSuccess;
  const loading = q.isPending && !q.data;
  const loadError = q.isError && leases.length === 0 ? '租约加载失败' : null;
  const retry = () => {
    void q.refetch({ cancelRefetch: false });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await q.refetch({ cancelRefetch: false });
    } finally {
      setRefreshing(false);
    }
  }, [q]);

  if (loading) {
    return <ListState loading />;
  }

  if (loadError) {
    return <ListState error={loadError} retryLabel="重试" onRetry={retry} />;
  }

  if (loaded && leases.length === 0) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState icon="document-text-outline" title={t('profile.noLease')} sub="签约后在这里查看租期进度与租金" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {q.isError && leases.length > 0 ? (
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 12,
            padding: 10,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.alpha(colors.errorRgb, 0.08),
          }}
        >
          <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>租约加载失败</Text>
          <TouchableOpacity onPress={retry} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, color: colors.primary }}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.card}>
        {leases.map((lease, idx) => {
          const meta = LEASE_STATUS[String(lease?.status ?? '')] ?? LEASE_STATUS.pending;
          const remainDays = lease?.end_date
            ? Math.max(0, Math.round((new Date(lease.end_date).getTime() - Date.now()) / DAY_MS))
            : 0;
          return (
            <TouchableOpacity
              key={lease?.id}
              style={[styles.leaseRow, idx < leases.length - 1 && styles.leaseRowBorder]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('MyLeaseDetail', { lease_id: String(lease?.id) })}
            >
              <View style={styles.leaseLeft}>
                <View style={styles.leaseTitleRow}>
                  <Text style={styles.leaseTitle} numberOfLines={1}>{leaseTitle(lease)}</Text>
                  <View style={[styles.leaseBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.leaseBadgeText, { color: meta.color }]}>{meta.text}</Text>
                  </View>
                </View>
                <Text style={styles.leaseMeta} numberOfLines={1}>
                  {t('profile.monthlyRent')} {fmtRent(Number(lease?.monthly_rent || 0), lease?.currency)}
                  {remainDays > 0 ? ` · ${t('profile.remainPrefix')} ${remainDays}${t('profile.dayUnit')}` : ''}
                </Text>
                <View style={styles.leaseTrack}>
                  <View style={[styles.leaseBar, { flex: Math.max(leaseProgress(lease), 0.02) }]} />
                  <View style={{ flex: Math.max(1 - leaseProgress(lease), 0) }} />
                </View>
                <Text style={styles.leaseRange}>
                  {fmtDate(lease?.start_date || lease?.startDate)} 至 {fmtDate(lease?.end_date || lease?.endDate)}
                </Text>
              </View>
              <View style={styles.chevron}>
                <Text style={styles.chevronText}>›</Text>
              </View>
            </TouchableOpacity>
          );
        })}
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
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  leaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
  },
  leaseRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  leaseLeft: { flex: 1, minWidth: 0 },
  leaseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaseTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  leaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  leaseBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600', lineHeight: colors.lineHeight.tight},
  leaseMeta: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  leaseTrack: {
    flexDirection: 'row',
    height: 4,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: 8,
  },
  leaseBar: { height: 4, borderRadius: colors.radius.full, backgroundColor: colors.primary },
  leaseRange: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 6, lineHeight: colors.lineHeight.tight},
  chevron: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronText: { fontSize: 18, color: colors.ink3, lineHeight: 20 },
});
