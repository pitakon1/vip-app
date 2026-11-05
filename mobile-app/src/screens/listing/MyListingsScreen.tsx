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
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import Card from '@/components/Card';
import type { Listing } from '@/types';

const STATUS_META: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: '待审核', color: colors.warning, bg: colors.warningLight },
  active: { text: '已上架', color: colors.success, bg: colors.successLight },
  rejected: { text: '已驳回', color: colors.error, bg: colors.errorLight },
  closed: { text: '已下架', color: colors.ink3, bg: colors.surface2 },
  sold: { text: '已售出', color: colors.primary, bg: colors.sidebarActive },
  rented: { text: '已出租', color: colors.primary, bg: colors.sidebarActive },
};

const DEDUPE_META: Record<string, { text: string; color: string }> = {
  new: { text: '正常', color: colors.success },
  suspect: { text: '疑似重复待审', color: colors.warning },
  blocked: { text: '重复已阻断', color: colors.error },
};

export default function MyListingsScreen() {
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

  const loadError = q.isError && rows.length === 0 ? '上架单加载失败' : null;
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
        notify('已下架', '该上架单已关闭');
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
        notifyError('操作失败', e);
      }
    };
    const msg = '确定关闭该上架单并下架吗？下架后买家/租客将无法再看到该房源。';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) void doClose();
      return;
    }
    Alert.alert('下架确认', msg, [
      { text: '取消', style: 'cancel' },
      { text: '确认下架', style: 'destructive', onPress: () => void doClose() },
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
    const priceUnit = item.listing_type === 'sell' ? '' : ' / 月';
    const splitText =
      item.buyer_side_rate != null && item.listing_side_rate != null
        ? `客源 ${item.buyer_side_rate}% · 房源 ${item.listing_side_rate}%`
        : item.owner_commission_rate != null
          ? `佣金 ${item.owner_commission_rate}% 归业主`
          : '';
    return (
      <Card>
        <View style={styles.itemHead}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.room_number || item.address || '房源上架单'}
          </Text>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.text}</Text>
          </View>
        </View>
        {item.address ? <Text style={styles.itemAddr} numberOfLines={1}>{item.address}</Text> : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{price}{priceUnit}</Text>
          <Text style={styles.typeTag}>{item.listing_type === 'sell' ? '出售' : '出租'}</Text>
        </View>
        <View style={styles.metaRow}>
          {dd ? <Text style={[styles.meta, { color: dd.color }]}>去重：{dd.text}</Text> : null}
          {splitText ? <Text style={styles.meta}>{splitText}</Text> : null}
          <Text style={styles.meta}>
            {item.rental_commission_months != null
              ? `租佣 ${item.rental_commission_months} 个月`
              : item.sale_commission_rate != null
                ? `卖佣 ${item.sale_commission_rate}%`
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
              accessibilityLabel="关闭下架"
            >
              <Text style={styles.actionDangerText}>下架</Text>
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
        <ListState error={loadError} retryLabel="重试" onRetry={retry} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="暂无上架单"
          sub="到「我的」发布房源，把您的房源放到平台上架"
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
              <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>上架单加载失败</Text>
              <TouchableOpacity onPress={retry} activeOpacity={0.7}>
                <Text style={{ fontSize: 12, color: colors.primary }}>重试</Text>
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
  itemAddr: { fontSize: 13, color: colors.ink2, marginTop: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  price: { fontSize: 20, fontWeight: '800', color: colors.ink },
  typeTag: { fontSize: 12, color: colors.ink3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: colors.radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  meta: { fontSize: 12, color: colors.ink2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, height: 40, borderRadius: colors.radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  actionDanger: { backgroundColor: colors.errorLight, borderColor: colors.errorLight },
  actionDangerText: { fontSize: 14, fontWeight: '600', color: colors.error },
});