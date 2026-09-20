import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import EmptyState from '@/components/EmptyState';
import { propertyDealApi } from '@/services/api';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtMoney as fmtRent } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCachedQuery } from '@/lib/useCachedQuery';

type Route = RouteProp<RootStackParamList, 'MyOrderDetail'>;

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-');

// 交易订单状态（PropertyDealStatus，与 MyOrders 一致）
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
 * 交易订单详情（全屏下钻子页）。
 * 由「我的交易订单」列表行进入；自拉 /property-deals/{id} 展示金额、状态与关键节点。
 */
export default function MyOrderDetailScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<Route>();

  const q = useCachedQuery<any | null>({
    queryKey: ['deal', 'detail', params.deal_id],
    cacheKey: `deal:detail:${params.deal_id}`,
    queryFn: async () => {
      const res: any = await propertyDealApi.get(params.deal_id);
      return res?.data ?? null;
    },
  });
  const deal = q.data ?? null;
  const loaded = q.isSuccess;

  if (loaded && !deal) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState icon="pricetag-outline" title={t('profile.noOrders')} sub="订单不存在或已删除" />
      </View>
    );
  }
  if (!deal) {
    return <View style={styles.emptyWrap} />;
  }

  const meta = DEAL_STATUS[String(deal?.status ?? '')] ?? DEAL_STATUS.drafted;
  const title = deal?.listing_title || deal?.property_name || `交易订单 #${String(deal?.id ?? '').slice(0, 8)}`;

  // 关键节点（按时间先后）
  const timeline: Array<{ label: string; value: string }> = (
    [
      { label: '创建订单', value: deal?.created_at ?? '' },
      { label: '签约时间', value: deal?.signed_at ?? '' },
      { label: '过户日期', value: deal?.transfer_date ?? '' },
    ] as Array<{ label: string; value: string }>
  ).filter((x) => !!x.value);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* 金额卡 */}
      <View style={styles.card}>
        <View style={styles.dealHead}>
          <Text style={styles.dealTitle} numberOfLines={2}>{title}</Text>
          <View style={[styles.dealBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.dealBadgeText, { color: meta.color }]}>{meta.text}</Text>
          </View>
        </View>
        <Text style={styles.dealPrice}>
          {deal?.sale_price ? fmtRent(Number(deal.sale_price), deal?.currency) : '—'}
        </Text>
        {deal?.notes ? <Text style={styles.dealNotes}>{deal.notes}</Text> : null}
      </View>

      {/* 关键节点卡 */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>交易节点</Text>
        {timeline.map((node, idx) => (
          <View key={node.label} style={styles.timelineRow}>
            <View style={styles.timelineDot} />
            <Text style={styles.timelineLabel}>{node.label}</Text>
            <Text style={styles.timelineValue}>{fmtDate(node.value)}</Text>
          </View>
        ))}
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
  dealHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  dealTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  dealBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  dealBadgeText: { fontSize: 11, fontWeight: '600' },
  dealPrice: { fontSize: 24, fontWeight: '700', color: colors.ink, marginTop: 12 },
  dealNotes: { fontSize: 13, color: colors.ink2, marginTop: 8, lineHeight: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 4 },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  timelineLabel: { flex: 1, fontSize: 13, color: colors.ink2 },
  timelineValue: { fontSize: 13, fontWeight: '600', color: colors.ink },
});
