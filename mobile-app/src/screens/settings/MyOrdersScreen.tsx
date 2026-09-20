import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import EmptyState from '@/components/EmptyState';
import { propertyDealApi, saleListingApi } from '@/services/api';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtMoney as fmtRent } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-');

// 交易订单状态（PropertyDealStatus）
const DEAL_STATUS: Record<string, { text: string; color: string; bg: string }> = {
  drafted: { text: '洽谈中', color: colors.ink2, bg: colors.surface2 },
  escrow_pending: { text: '定金托管中', color: colors.warning, bg: colors.warningLight },
  signed: { text: '已签约', color: colors.primary, bg: colors.sidebarActive },
  transferring: { text: '过户中', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  completed: { text: '已完成', color: colors.success, bg: colors.successLight },
  failed: { text: '交易失败', color: colors.error, bg: colors.errorLight },
  cancelled: { text: '已取消', color: colors.ink3, bg: colors.surface2 },
};

/**
 * 我的交易订单（全屏下钻子页）。
 * 由「我的 - 常用功能 - 我的交易订单」进入；自拉本人订单清单（含买房与租房交易），点击行进入订单详情。
 */
export default function MyOrdersScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const q = useCachedQuery<any[]>({
    queryKey: ['deals', 'mine', user?.id ?? 'anon'],
    cacheKey: `deals:mine:${user?.id ?? 'anon'}`,
    queryFn: async () => {
      const [dRes, lRes] = await Promise.allSettled([
        propertyDealApi.list({ page: 1, page_size: 50 }),
        saleListingApi.list({ page: 1, page_size: 50 }),
      ]);
      const titles: Record<string, string> = {};
      if (lRes.status === 'fulfilled') {
        const d: any = lRes.value?.data;
        const rows = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
        (rows as any[]).forEach((r) => {
          if (r?.id) titles[String(r.id)] = r.title ?? '';
        });
      }
      if (dRes.status === 'fulfilled') {
        const d: any = dRes.value?.data;
        const rows = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
        return (rows as any[]).map((r) => ({
          ...r,
          listing_title: titles[String(r.sale_listing_id ?? '')],
        }));
      }
      return [];
    },
  });
  const deals = q.data ?? [];
  const loaded = q.isSuccess;

  if (loaded && deals.length === 0) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState
          icon="pricetag-outline"
          title={t('profile.noOrders')}
          sub="提交看房约谈或认购后在这里跟进进度"
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.card}>
        {deals.map((d, idx) => {
          const meta = DEAL_STATUS[String(d.status ?? '')] ?? DEAL_STATUS.drafted;
          return (
            <TouchableOpacity
              key={d.id}
              style={[styles.dealRow, idx < deals.length - 1 && styles.dealRowBorder]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('MyOrderDetail', { deal_id: String(d.id) })}
            >
              <View style={styles.dealLeft}>
                <Text style={styles.dealTitle} numberOfLines={1}>
                  {d.listing_title || `交易订单 ${String(d.id ?? '').slice(0, 8)}`}
                </Text>
                <Text style={styles.dealMeta} numberOfLines={1}>
                  {d.sale_price ? `${fmtRent(d.sale_price, d.currency)} · ` : ''}
                  {fmtDate(d.created_at)}
                </Text>
              </View>
              <View style={[styles.dealBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.dealBadgeText, { color: meta.color }]}>{meta.text}</Text>
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
    ...colors.shadow.card,
  },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 13,
  },
  dealRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dealLeft: { flex: 1, minWidth: 0 },
  dealTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  dealMeta: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  dealBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  dealBadgeText: { fontSize: 11, fontWeight: '600' },
});
