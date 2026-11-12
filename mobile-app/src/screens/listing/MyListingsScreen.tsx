import { LIST_PAGE_SIZE } from '@/lib/pagination';
/**
 * 我的上架单：展示当前登录用户发布的上架单（状态 / 分成 / 去重状态）。
 * 归属过滤由服务端 `mine=true` 完成（本人 / 本合作方 / 本人业主），
 * 客户端不再拉首页 100 条后本地筛选。进入可编辑，可关闭下架（带二次确认）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import { listingApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useQueryClient } from '@tanstack/react-query';
import { notify, notifyError } from '@/utils/feedback';
import { fmtMoney } from '@/utils/format';
import { useI18n } from '@/i18n';
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import Card from '@/components/Card';
import type { Listing } from '@/types';

const STATUS_META: Record<string, { key: string; color: string; bg: string }> = {
  pending: { key: 'myListings.status.pending', color: colors.warning, bg: colors.warningLight },
  active: { key: 'myListings.status.active', color: colors.success, bg: colors.successLight },
  rejected: { key: 'myListings.status.rejected', color: colors.error, bg: colors.errorLight },
  closed: { key: 'myListings.status.closed', color: colors.ink3, bg: colors.surface2 },
  sold: { key: 'myListings.status.sold', color: colors.primary, bg: colors.sidebarActive },
  rented: { key: 'myListings.status.rented', color: colors.primary, bg: colors.sidebarActive },
};

const DEDUPE_META: Record<string, { key: string; color: string }> = {
  new: { key: 'myListings.dedupe.new', color: colors.success },
  suspect: { key: 'myListings.dedupe.suspect', color: colors.warning },
  blocked: { key: 'myListings.dedupe.blocked', color: colors.error },
};

export default function MyListingsScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const uid = user?.id ?? 'anon';
  const LISTINGS_KEY: string[] = ['my-listings', uid];
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);

  const q = useCachedQuery<{ items: Listing[]; total: number }>({
    queryKey: [...LISTINGS_KEY, String(page)],
    cacheKey: `my-listings:${uid}:p${page}`,
    queryFn: async () => {
      const res: any = await listingApi.list({
        page,
        page_size: LIST_PAGE_SIZE,
        // 归属收窄交给服务端：staff 不带 mine 会拿到全平台上架单
        mine: true,
      });
      const d = res?.data;
      const items = Array.isArray(d) ? d : d?.items ?? [];
      return { items: items as Listing[], total: Array.isArray(d) ? items.length : d?.total ?? 0 };
    },
  });

  // 逐页合并（按 id 去重，避免刷新/回填造成重复行）；回到第 1 页时重置
  useEffect(() => {
    const next = q.data;
    if (!next) return;
    setTotal(next.total);
    setRows((prev) => {
      if (page === 1) return next.items;
      const merged = new Map(prev.map((x) => [x.id, x]));
      for (const x of next.items) merged.set(x.id, x);
      return Array.from(merged.values());
    });
  }, [q.data, page]);

  const loadError = q.isError && rows.length === 0 ? t('myListings.loadFail') : null;
  const retry = () => {
    void q.refetch({ cancelRefetch: false });
  };
  const items = rows;
  const loading = q.isPending && rows.length === 0;
  const refreshing = q.isRefetching;
  const onRefresh = useCallback(() => {
    if (page === 1) void q.refetch({ cancelRefetch: false });
    else setPage(1);
  }, [q, page]);
  const loadMore = () => {
    if (q.isFetching || rows.length >= total) return;
    setPage((p) => p + 1);
  };

  const closeListing = (item: Listing) => {
    const doClose = async () => {
      try {
        await listingApi.close(item.id, {});
        notify(t('myListings.closedTitle'), t('myListings.closedMsg'));
        setRows((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, status: 'closed' as const } : x)),
        );
        // 同步更新当前页缓存，避免下拉刷新前又被旧数据覆盖
        queryClient.setQueryData<{ items: Listing[]; total: number }>(
          [...LISTINGS_KEY, String(page)],
          (prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.map((x) =>
                    x.id === item.id ? { ...x, status: 'closed' as const } : x,
                  ),
                }
              : prev,
        );
      } catch (e: any) {
        notifyError(t('myListings.opFail'), e);
      }
    };
    const msg = t('myListings.closeMsg');
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) void doClose();
      return;
    }
    Alert.alert(t('myListings.closeTitle'), msg, [
      { text: t('myListings.cancel'), style: 'cancel' },
      { text: t('myListings.confirmClose'), style: 'destructive', onPress: () => void doClose() },
    ]);
  };

  const renderItem = ({ item }: { item: Listing }) => {
    const st = STATUS_META[item.status] ?? STATUS_META.pending;
    const dd = item.dedupe_state ? DEDUPE_META[item.dedupe_state] : null;
    const price =
      item.listing_type === 'sell' && item.asking_price != null
        ? fmtMoney(item.asking_price, item.currency)
        : item.monthly_rent != null
          ? fmtMoney(item.monthly_rent, item.currency)
          : '—';
    const priceUnit = item.listing_type === 'sell' ? '' : t('myListings.perMonth');
    const splitText =
      item.buyer_side_rate != null && item.listing_side_rate != null
        ? t('myListings.split', { buyer: item.buyer_side_rate, listing: item.listing_side_rate })
        : item.owner_commission_rate != null
          ? t('myListings.ownerCommission', { rate: item.owner_commission_rate })
          : '';
    return (
      <Card>
        <View style={styles.itemHead}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.room_number || item.address || t('myListings.untitled')}
          </Text>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{t(st.key)}</Text>
          </View>
        </View>
        {item.address ? <Text style={styles.itemAddr} numberOfLines={1}>{item.address}</Text> : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{price}{priceUnit}</Text>
          <Text style={styles.typeTag}>
            {item.listing_type === 'sell' ? t('myListings.sell') : t('myListings.rent')}
          </Text>
        </View>
        <View style={styles.metaRow}>
          {dd ? (
            <Text style={[styles.meta, { color: dd.color }]}>
              {`${t('myListings.dedupePrefix')}${t(dd.key)}`}
            </Text>
          ) : null}
          {splitText ? <Text style={styles.meta}>{splitText}</Text> : null}
          <Text style={styles.meta}>
            {item.rental_commission_months != null
              ? t('myListings.rentCommission', { months: item.rental_commission_months })
              : item.sale_commission_rate != null
                ? t('myListings.saleCommission', { rate: item.sale_commission_rate })
                : ''}
          </Text>
        </View>
        {/* 操作 */}
        <View style={styles.actions}>
          {item.status === 'pending' || item.status === 'active' ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionDanger]}
              activeOpacity={0.7}
              onPress={() => closeListing(item)}
              accessibilityRole="button"
              accessibilityLabel={t('myListings.close')}
            >
              <Text style={styles.actionDangerText}>{t('myListings.close')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ListState loading />
      ) : loadError ? (
        <ListState error={loadError} retryLabel={t('retry')} onRetry={retry} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title={t('myListings.emptyTitle')}
          sub={t('myListings.emptySub')}
        />
      ) : (
        <>
          {q.isError ? (
            <View
              style={{
                margin: 16,
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.alpha(colors.errorRgb, 0.08),
              }}
            >
              <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>{t('myListings.loadFail')}</Text>
              <TouchableOpacity onPress={retry} activeOpacity={0.7}>
                <Text style={{ fontSize: 12, color: colors.primary }}>{t('retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            ListFooterComponent={
              items.length > 0 && items.length >= total ? (
                <Text style={styles.footer}>{t('pub.noMore')}</Text>
              ) : null
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink, marginRight: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: colors.radius.full },
  badgeText: { fontSize: 12, fontWeight: '600' },
  itemAddr: { fontSize: colors.fontSize.caption, color: colors.ink2, marginTop: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  price: { fontSize: 20, fontWeight: '800', color: colors.ink },
  typeTag: { fontSize: 12, color: colors.ink3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: colors.radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  meta: { fontSize: 12, color: colors.ink2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, minHeight: colors.touch.min, borderRadius: colors.radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  footer: { fontSize: 12, color: colors.ink3, textAlign: 'center', paddingVertical: 16 },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  actionDanger: { backgroundColor: colors.errorLight, borderColor: colors.errorLight },
  actionDangerText: { fontSize: 14, fontWeight: '600', color: colors.error },
});