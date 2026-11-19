/**
 * 「平台成交榜单」卡片（C 端首页）。
 *
 * 数据仅来自平台 `property_deals` 已完成样本，不是全市场；
 * 界面固定展示「平台样本 n=xx，非全市场」，样本不足时只显示提示。
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { publicApi } from '@/services/publicApi';

interface RankingItem {
  rank: number;
  name: string;
  district?: string | null;
  deal_count: number;
  avg_price?: number | null;
}

interface RankingData {
  days: number;
  period: { start: string; end: string };
  sample_count: number;
  min_sample: number;
  published: boolean;
  items: RankingItem[];
}

const money = (v?: number | null) =>
  v == null ? '-' : `฿${Math.round(v).toLocaleString('en-US')}`;

export default function DealRankingsCard() {
  const { t } = useI18n();
  const [data, setData] = useState<RankingData | null>(null);

  useEffect(() => {
    let alive = true;
    publicApi
      .rankings({ scope: 'project', metric: 'deal_count', days: 90, limit: 5 })
      .then((res: any) => {
        if (alive) setData(res?.data ?? res);
      })
      .catch(() => {
        /* 榜单失败静默：不影响首页主流程 */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('pub.rankingsTitle')}</Text>
        <Text style={styles.caveat}>{t('pub.rankingsCaveat', { n: data.sample_count })}</Text>
      </View>
      <Text style={styles.period}>
        {t('pub.rankingsPeriod', { days: data.days, start: data.period.start, end: data.period.end })}
      </Text>

      {!data.published ? (
        <Text style={styles.empty}>{t('pub.rankingsEmpty', { n: data.min_sample })}</Text>
      ) : (
        data.items.map((item) => (
          <View key={`${item.rank}-${item.name}`} style={styles.row}>
            <Text style={[styles.no, item.rank <= 3 && styles.noTop]}>{item.rank}</Text>
            <View style={styles.main}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.district || '-'}
                {' · '}
                {t('pub.rankingsDeals', { n: item.deal_count })}
              </Text>
            </View>
            <View style={styles.valueBox}>
              <Text style={styles.value}>{money(item.avg_price)}</Text>
              <Text style={styles.sub}>{t('pub.rankingsAvgPrice')}</Text>
            </View>
          </View>
        ))
      )}

      <Text style={styles.note}>{t('pub.rankingsNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginTop: colors.spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  caveat: { fontSize: colors.fontSize.xs, color: colors.ink3, flexShrink: 1, textAlign: 'right' },
  period: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    paddingVertical: colors.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: colors.spacing.sm,
  },
  no: {
    width: 24,
    height: 24,
    borderRadius: 8,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: colors.fontSize.xs,
    fontWeight: '700',
    color: colors.ink2,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  noTop: { color: colors.primaryForeground, backgroundColor: colors.primary },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: colors.fontSize.sm, fontWeight: '600', color: colors.ink },
  sub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2 },
  valueBox: { alignItems: 'flex-end' },
  value: { fontSize: colors.fontSize.sm, fontWeight: '600', color: colors.ink },
  empty: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    marginTop: colors.spacing.md,
    lineHeight: colors.lineHeight.snug,
  },
  note: {
    fontSize: colors.fontSize.xs,
    color: colors.ink3,
    marginTop: colors.spacing.sm,
    lineHeight: colors.lineHeight.tight,
  },
});
