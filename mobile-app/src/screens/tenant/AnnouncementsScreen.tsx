import React, { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import { announcementsApi } from '@/services/api';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtDate } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';

/**
 * 小区公告（GET /announcements/mine）。
 * 后端按租客生效租约所在楼盘过滤，并附带平台级公告（project_id 为空）。
 * 公告由物业/员工在后台发布（POST /announcements），属自建数据而非第三方接口。
 */

const CATEGORY_META: Record<string, { key: string; color: string; bg: string }> = {
  notice: { key: 'ann.cat.notice', color: colors.primary, bg: colors.sidebarActive },
  maintenance: { key: 'ann.cat.maintenance', color: colors.warningInk, bg: colors.warningSoft },
  event: { key: 'ann.cat.event', color: colors.success, bg: colors.successLight },
  rule: { key: 'ann.cat.rule', color: colors.ink2, bg: colors.surface2 },
};

export default function AnnouncementsScreen() {
  const { t } = useI18n();
  const uid = useAuthStore((s) => s.user?.id) ?? 'anon';
  const [refreshing, setRefreshing] = useState(false);

  const q = useCachedQuery<any[]>({
    queryKey: ['announcements', 'mine', uid],
    cacheKey: `announcements:mine:${uid}`,
    queryFn: async () => {
      const res = await announcementsApi.mine();
      const d: any = res?.data;
      const rows = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      return Array.isArray(rows) ? rows : [];
    },
  });

  const items = q.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await q.refetch({ cancelRefetch: false });
    } finally {
      setRefreshing(false);
    }
  }, [q]);

  if (q.isPending && !q.data) return <ListState loading />;
  if (q.isError && items.length === 0) {
    return (
      <ListState
        error={t('ann.loadFailed')}
        retryLabel={t('common.retry')}
        onRetry={() => { void q.refetch({ cancelRefetch: false }); }}
      />
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
      {q.isSuccess && items.length === 0 ? (
        <EmptyState icon="megaphone-outline" title={t('ann.empty')} sub={t('ann.emptySub')} />
      ) : null}
      <View style={{ padding: 12, gap: 10 }}>
        {items.map((a) => {
          const meta = CATEGORY_META[String(a.category ?? '')] ?? CATEGORY_META.notice;
          return (
            <View key={String(a.id)} style={styles.card}>
              <View style={styles.head}>
                <View style={[styles.chip, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.chipText, { color: meta.color }]}>{t(meta.key)}</Text>
                </View>
                {a.is_pinned ? (
                  <View style={[styles.chip, { backgroundColor: colors.errorLight }]}>
                    <Text style={[styles.chipText, { color: colors.error }]}>{t('ann.pinned')}</Text>
                  </View>
                ) : null}
                <Text style={styles.scope} numberOfLines={1}>
                  {a.scope === 'platform' ? t('ann.scopePlatform') : a.project_name || ''}
                </Text>
              </View>
              <Text style={styles.title}>{a.title}</Text>
              <Text style={styles.content}>{a.content}</Text>
              <Text style={styles.meta}>
                {`${fmtDate(a.published_at)}${a.publisher_name ? ` · ${a.publisher_name}` : ''}`}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  chipText: { fontSize: colors.fontSize.xs, fontWeight: '600', lineHeight: colors.lineHeight.tight },
  scope: { flex: 1, fontSize: 11, color: colors.ink3, textAlign: 'right' },
  title: { fontSize: 15, fontWeight: '600', color: colors.ink },
  content: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  meta: { fontSize: 11, color: colors.ink3 },
});
