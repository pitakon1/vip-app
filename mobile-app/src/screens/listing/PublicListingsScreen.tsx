/**
 * 已上架房源浏览（租客 / 普通用户）。
 * 数据来自 /listings（非 staff 后端仅返回 active）。点击卡片展开查看详情与联系方式。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { listingApi } from '@/services/api';
import { notifyError } from '@/utils/feedback';
import { fmtMoney } from '@/utils/format';
import { useCachedQuery } from '@/lib/useCachedQuery';
import EmptyState from '@/components/EmptyState';
import Card from '@/components/Card';
import type { Listing } from '@/types';

export default function PublicListingsScreen() {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<string | null>(null);
  const LISTINGS_KEY = ['public-listings'];

  const q = useCachedQuery<Listing[]>({
    queryKey: LISTINGS_KEY,
    cacheKey: 'public-listings',
    queryFn: async () => {
      const res: any = await listingApi.list({ page: 1, page_size: 100 });
      const d = res?.data;
      return Array.isArray(d) ? d : d?.items ?? [];
    },
  });

  const items = q.data ?? [];
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const onRefresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  const renderItem = ({ item }: { item: Listing }) => {
    const open = expanded === item.id;
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
        : '';
    return (
      <Card>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setExpanded(open ? null : item.id)}
          accessibilityRole="button"
          accessibilityLabel="查看房源详情"
        >
          <Text style={styles.title} numberOfLines={1}>{item.room_number || item.address || '房源'}</Text>
          {item.address ? <Text style={styles.addr} numberOfLines={1}>{item.address}</Text> : null}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{price}{priceUnit}</Text>
            <Text style={styles.typeTag}>{item.listing_type === 'sell' ? '出售' : '出租'}</Text>
          </View>
        </TouchableOpacity>

        {open ? (
          <View style={styles.detail}>
            <Text style={styles.detailRow}>状态：已上架 <Text style={styles.dim}>（{splitText}）</Text></Text>
            <Text style={styles.detailRow}>
              佣金：{item.rental_commission_months != null
                ? `租房 ${item.rental_commission_months} 个月`
                : item.sale_commission_rate != null
                  ? `卖房 ${item.sale_commission_rate}%`
                  : '—'}
            </Text>
            <Text style={styles.detailRow}>发布机构：{item.broker_company || '业主自主发布'}</Text>
            {item.owner_contact_visible ? (
              <View style={styles.contactBox}>
                <Text style={styles.contactText}>联系人：{item.owner_contact_name || '—'}</Text>
                <Text style={styles.contactText}>联系电话：{item.owner_contact_phone || '—'}</Text>
                {item.owner_contact_channel ? <Text style={styles.contactText}>渠道：{item.owner_contact_channel}</Text> : null}
              </View>
            ) : (
              <Text style={styles.detailRow}>业主联系方式未公开，如需咨询请联系经纪人</Text>
            )}
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : items.length === 0 ? (
        <EmptyState icon="home-outline" title="暂无可浏览的房源" sub="平台上架房源将展示在首页，敬请关注" />
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
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  addr: { fontSize: 13, color: colors.ink2, marginTop: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  price: { fontSize: 20, fontWeight: '800', color: colors.ink },
  typeTag: { fontSize: 12, color: colors.ink3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: colors.radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  detail: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, gap: 6 },
  detailRow: { fontSize: 13, color: colors.ink2 },
  dim: { color: colors.ink3 },
  contactBox: { backgroundColor: colors.surface2, borderRadius: colors.radius.md, padding: 12, marginTop: 6, gap: 4 },
  contactText: { fontSize: 13, color: colors.ink },
});