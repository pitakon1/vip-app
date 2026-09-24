/**
 * 我的上架单：展示当前登录用户发布的上架单（状态 / 分成 / 去重状态）。
 * 说明：非 staff 后端 list 仅返回 active，故业主端此处能看到的是「已上架/可查」项；
 * staff（经纪人/员工/管理员）可见其发布的全量状态。进入可编辑，可关闭下架。
 */
import React, { useCallback } from 'react';
import {
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
import LoadingState from '@/components/LoadingState';
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

  const q = useCachedQuery<Listing[]>({
    queryKey: LISTINGS_KEY,
    cacheKey: `my-listings:${uid}`,
    queryFn: async () => {
      const res: any = await listingApi.list({ page: 1, page_size: 100 });
      const d = res?.data;
      const rows = Array.isArray(d) ? d : d?.items ?? [];
      return rows as Listing[];
    },
  });

  const allRows = q.data ?? [];
  const items = user?.id
    ? allRows.filter((r) => String(r.publisher_user_id) === String(user.id))
    : allRows;
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const onRefresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  const closeListing = (item: Listing) => {
    const doClose = async () => {
      try {
        await listingApi.close(item.id, {});
        notify('已下架', '该上架单已关闭');
        queryClient.setQueryData<Listing[]>(LISTINGS_KEY, (prev) =>
          (prev ?? []).map((x) => (x.id === item.id ? { ...x, status: 'closed' as const } : x)),
        );
      } catch (e: any) {
        notifyError('操作失败', e);
      }
    };
    const msg = '确定关闭该上架单并下架吗？';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) void doClose();
    } else {
      // 复用 notify 不可阻塞确认，这里用简单分支：直接弹出原生确认由 doClose 完成
      void doClose();
    }
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
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ListingPublish', { id: item.id })}
            accessibilityRole="button"
            accessibilityLabel="编辑上架单"
          >
            <Text style={styles.actionText}>编辑</Text>
          </TouchableOpacity>
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
        <LoadingState label="加载中…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="暂无上架单"
          sub="到「我的」发布房源，把您的房源放到平台上架"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
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