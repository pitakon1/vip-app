import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { publicApi } from '@/services/publicApi';

/**
 * 平台成交榜单 / 成交行情（C 端公开）。
 *
 * 数据只来自 `/public/rankings`，仅聚合平台 `property_deals` 已完成样本；
 * 界面固定展示「平台样本 n=xx，非全市场」，样本不足时只显示提示、不编造排名。
 */

type Scope = 'project' | 'district';
type Metric = 'deal_count' | 'avg_price' | 'avg_psqm';

interface RankingItem {
  rank: number;
  name: string;
  district?: string | null;
  deal_count: number;
  avg_price?: number | null;
  avg_psqm?: number | null;
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

export default function PublicRankingsScreen() {
  const { t } = useI18n();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const [scope, setScope] = useState<Scope>(route.params?.scope ?? 'project');
  const [metric, setMetric] = useState<Metric>(route.params?.metric ?? 'deal_count');
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const res: any = await publicApi.rankings({ scope, metric, days: 90, limit: 20 });
      setData(res?.data ?? res);
    } catch {
      setError(t('pub.rankingsLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, metric]);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{ padding: colors.spacing.lg, paddingBottom: insets.bottom + 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      {/* 口径切换 */}
      <View style={styles.segRow}>
        {(['project', 'district'] as Scope[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.seg, scope === s && styles.segOn]}
            onPress={() => setScope(s)}
          >
            <Text style={[styles.segText, scope === s && styles.segTextOn]}>
              {t(s === 'project' ? 'pub.rankingsTabProject' : 'pub.rankingsTabDistrict')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chipRow}>
        {(['deal_count', 'avg_price', 'avg_psqm'] as Metric[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.chip, metric === m && styles.chipOn]}
            onPress={() => setMetric(m)}
          >
            <Text style={[styles.chipText, metric === m && styles.chipTextOn]}>
              {t(
                m === 'deal_count'
                  ? 'pub.rankingsByCount'
                  : m === 'avg_price'
                    ? 'pub.rankingsByPrice'
                    : 'pub.rankingsByPsqm',
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('pub.rankingsTitle')}</Text>
            <Text style={styles.caveat}>{t('pub.rankingsCaveat', { n: data.sample_count })}</Text>
          </View>
          <Text style={styles.period}>
            {t('pub.rankingsPeriod', {
              days: data.days,
              start: data.period.start,
              end: data.period.end,
            })}
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
                  <Text style={styles.value}>
                    {metric === 'deal_count'
                      ? t('pub.rankingsDeals', { n: item.deal_count })
                      : metric === 'avg_price'
                        ? money(item.avg_price)
                        : money(item.avg_psqm)}
                  </Text>
                  <Text style={styles.sub}>
                    {t(
                      metric === 'deal_count'
                        ? 'pub.rankingsByCount'
                        : metric === 'avg_price'
                          ? 'pub.rankingsAvgPrice'
                          : 'pub.rankingsByPsqm',
                    )}
                  </Text>
                </View>
              </View>
            ))
          )}

          <Text style={styles.note}>{t('pub.rankingsNote')}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  segRow: {
    flexDirection: 'row',
    backgroundColor: colors.muted,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  segOn: { backgroundColor: colors.surface },
  segText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  segTextOn: { color: colors.ink, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: colors.spacing.md, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: colors.fontSize.xs, color: colors.ink2 },
  chipTextOn: { color: colors.primary, fontWeight: '600' },
  loading: { marginTop: colors.spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginTop: colors.spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink, flexShrink: 1 },
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
  error: { fontSize: colors.fontSize.sm, color: colors.error },
  retry: {
    marginTop: colors.spacing.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  retryText: { fontSize: colors.fontSize.sm, color: colors.primaryForeground, fontWeight: '600' },
});
