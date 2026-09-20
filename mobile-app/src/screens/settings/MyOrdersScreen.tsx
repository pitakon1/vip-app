import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import EmptyState from '@/components/EmptyState';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtMoney as fmtRent } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Route = RouteProp<RootStackParamList, 'MyOrders'>;

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-');

// 购房订单状态（PropertyDealStatus）
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
 * 我的购房订单（全屏下钻子页）。
 * 由「我的 - 资产 - 我的购房订单」行进入；展示本人订单清单及状态。
 * 数据由 ProfileScreen 加载后经路由参数传入。
 */
export default function MyOrdersScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<Route>();
  const deals: any[] = params?.deals ?? [];

  if (!deals.length) {
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
            <View
              key={d.id}
              style={[styles.dealRow, idx < deals.length - 1 && styles.dealRowBorder]}
            >
              <View style={styles.dealLeft}>
                <Text style={styles.dealTitle} numberOfLines={1}>
                  {d.listing_title || `购房订单 ${String(d.id ?? '').slice(0, 8)}`}
                </Text>
                <Text style={styles.dealMeta} numberOfLines={1}>
                  {d.sale_price ? `${fmtRent(d.sale_price, d.currency)} · ` : ''}
                  {fmtDate(d.created_at)}
                </Text>
              </View>
              <View style={[styles.dealBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.dealBadgeText, { color: meta.color }]}>{meta.text}</Text>
              </View>
            </View>
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