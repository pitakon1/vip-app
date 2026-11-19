import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import { viewingsApi } from '@/services/api';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtDate } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';

/**
 * 我的看房（/viewings/mine）。
 *
 * 由「我的 - 常用功能 - 我的看房」进入：列出本人发起的看房预约，
 * 待确认/已确认的预约可由本人直接取消（后端 POST /viewings/{id}/cancel 只认
 * requester_user_id，员工用的 PATCH 状态机不向租客开放）。
 */

const STATUS_META: Record<string, { key: string; color: string; bg: string }> = {
  pending: { key: 'viewing.status.pending', color: colors.warningInk, bg: colors.warningSoft },
  confirmed: { key: 'viewing.status.confirmed', color: colors.primary, bg: colors.sidebarActive },
  completed: { key: 'viewing.status.completed', color: colors.success, bg: colors.successLight },
  cancelled: { key: 'viewing.status.cancelled', color: colors.ink3, bg: colors.surface2 },
  no_show: { key: 'viewing.status.no_show', color: colors.error, bg: colors.errorLight },
};

const CANCELLABLE = new Set(['pending', 'confirmed']);

export default function MyViewingsScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const q = useCachedQuery<any[]>({
    queryKey: ['viewings', 'mine', user?.id ?? 'anon'],
    cacheKey: `viewings:mine:${user?.id ?? 'anon'}`,
    queryFn: async () => {
      const res = await viewingsApi.mine();
      const d: any = res?.data;
      const rows = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      return Array.isArray(rows) ? rows : [];
    },
  });

  const items = q.data ?? [];
  const loaded = q.isSuccess;
  const loading = q.isPending && !q.data;
  const loadError = q.isError && items.length === 0 ? t('viewing.loadFailed') : null;

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

  const cancel = async (id: string) => {
    setCancellingId(id);
    setNotice(null);
    try {
      await viewingsApi.cancel(id);
      setNotice(t('viewing.cancelOk'));
      await q.refetch({ cancelRefetch: false });
    } catch (e: any) {
      const status = e?.response?.status;
      setNotice(status === 409 ? t('viewing.cancelDenied') : t('viewing.cancelFail'));
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) return <ListState loading />;
  if (loadError) {
    return (
      <ListState error={loadError} retryLabel={t('common.retry')} onRetry={retry} />
    );
  }

  if (loaded && items.length === 0) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState
          icon="calendar-outline"
          title={t('viewing.empty')}
          sub={t('viewing.emptySub')}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      {q.isError && items.length > 0 ? (
        <View style={styles.notice}>
          <Text style={[styles.noticeText, { color: colors.error }]}>{t('viewing.loadFailed')}</Text>
          <TouchableOpacity onPress={retry} activeOpacity={0.7}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.card}>
        {items.map((v, idx) => {
          const meta = STATUS_META[String(v.status ?? '')];
          const cancellable = CANCELLABLE.has(String(v.status ?? ''));
          const busy = cancellingId === String(v.id);
          return (
            <View
              key={String(v.id)}
              style={[styles.row, idx < items.length - 1 && styles.rowBorder]}
            >
              <TouchableOpacity
                style={styles.rowMain}
                activeOpacity={0.7}
                onPress={() => {
                  if (v.property_id) {
                    navigation.navigate('PropertyDetail', { id: String(v.property_id) });
                  }
                }}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.title} numberOfLines={1}>
                    {v.property_title || t('viewing.untitled')}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {`${fmtDate(v.scheduled_at, 'minute')}${v.property_address ? ` · ${v.property_address}` : ''}`}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: meta?.bg ?? colors.surface2 }]}>
                  <Text style={[styles.badgeText, { color: meta?.color ?? colors.ink3 }]}>
                    {meta ? t(meta.key) : String(v.status ?? '')}
                  </Text>
                </View>
              </TouchableOpacity>
              {cancellable ? (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  activeOpacity={0.7}
                  disabled={busy}
                  onPress={() => cancel(String(v.id))}
                >
                  <Text style={styles.cancelText}>
                    {busy ? t('viewing.cancelling') : t('viewing.cancel')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  emptyWrap: { flex: 1, backgroundColor: colors.background },
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
  row: { paddingVertical: 12, gap: 8 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.full },
  badgeText: {
    fontSize: colors.fontSize.xs,
    fontWeight: '600',
    lineHeight: colors.lineHeight.tight,
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cancelText: { fontSize: 12, color: colors.ink2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surface2,
  },
  noticeText: { flex: 1, fontSize: 12, color: colors.ink2 },
  retryText: { fontSize: 12, color: colors.primary },
});
