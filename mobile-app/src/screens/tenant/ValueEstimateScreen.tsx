import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { leasesApi, propertiesApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import { formatMoney } from '@/utils/format';

/**
 * 房屋估价（C 端）。
 *
 * 取当前生效租约对应房源，调 GET /properties/{id}/value-estimate：
 * 小区录入均价 → 同小区在售中位单价 → 月租 × 12 ÷ 5% 资本化率，逐级回退。
 * 页面明确标注「估算参考，非评估报告」，并展示数据口径与样本数。
 */

interface Estimate {
  available: boolean;
  currency: string;
  size_sqm?: number | null;
  unit_price?: number | null;
  estimate?: number | null;
  low?: number | null;
  high?: number | null;
  basis?: string | null;
  sample_count?: number;
  reason?: string | null;
  as_of?: string;
}

const pickList = (res: any): any[] => {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.data)) return d.data;
  return [];
};

export default function ValueEstimateScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.id) ?? 'anon';

  const q = useCachedQuery<{ property: any | null; estimate: Estimate | null }>({
    queryKey: ['value-estimate', uid],
    cacheKey: `value-estimate:${uid}`,
    queryFn: async () => {
      const leases = pickList(await leasesApi.mine());
      const active = leases.find((l) => String(l?.status) === 'active');
      if (!active?.property_id) return { property: null, estimate: null };
      const [estRes, propRes] = await Promise.all([
        propertiesApi.valueEstimate(active.property_id),
        propertiesApi.get(active.property_id),
      ]);
      const est: any = estRes?.data;
      const prop: any = propRes?.data;
      return {
        property: prop?.data ?? prop,
        estimate: est?.data ?? est,
      };
    },
  });

  const loading = q.isPending && !q.data;
  const data = q.data;
  const property = data?.property;
  const est = data?.estimate;

  const rangeText =
    est?.available && est.low != null && est.high != null
      ? `${formatMoney(est.low)} – ${formatMoney(est.high)}`
      : '';

  const basisText = (() => {
    if (!est?.basis) return '';
    if (est.basis === 'project_avg_price') return t('value.basisProject');
    if (est.basis === 'sale_listing_median')
      return t('value.basisSale').replace('{n}', String(est.sample_count ?? 0));
    return t('value.basisRent');
  })();

  if (loading) return <ListState loading />;
  if (q.isError && !q.data) {
    return (
      <ListState
        error={t('value.loadFail')}
        retryLabel={t('common.retry')}
        onRetry={() => { void q.refetch({ cancelRefetch: false }); }}
      />
    );
  }
  if (!property) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState icon="home-outline" title={t('value.noHome')} sub={t('value.noHomeSub')} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => { void q.refetch({ cancelRefetch: false }); }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{t('value.rangeLabel')}</Text>
        {est?.available ? (
          <Text style={styles.heroValue}>{rangeText}</Text>
        ) : (
          <Text style={styles.heroValue}>—</Text>
        )}
        <Text style={styles.heroSub}>
          {property.room_number || property.address || t('value.untitled')}
        </Text>
        {est?.available ? (
          <Text style={styles.heroSub}>
            {`${est.size_sqm ?? '—'} ㎡ · ${formatMoney(est.unit_price ?? 0)}/㎡`}
          </Text>
        ) : null}
      </View>

      {est?.available ? (
        <View style={styles.card}>
          <Row label={t('value.estimateLabel')} value={formatMoney(est.estimate ?? 0)} />
          <Row label={t('value.sizeLabel')} value={`${est.size_sqm ?? '—'} ㎡`} />
          <Row label={t('value.unitLabel')} value={`${formatMoney(est.unit_price ?? 0)}/㎡`} />
          <Row label={t('value.basisLabel')} value={basisText} />
          <Row label={t('value.asOf')} value={est.as_of ?? '—'} last />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.unavailable}>
            {est?.reason === 'missing_area' ? t('value.missingArea') : t('value.noSample')}
          </Text>
        </View>
      )}

      <Text style={styles.disclaimer}>{t('value.disclaimer')}</Text>
    </ScrollView>
  );
}

const Row = ({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) => (
  <View style={[styles.row, !last && styles.rowBorder]}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.xl,
    padding: 20,
    gap: 6,
  },
  heroLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  heroValue: { fontSize: 24, fontWeight: '700', color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  card: {
    marginTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 12, color: colors.ink3 },
  rowValue: { flex: 1, fontSize: 12, color: colors.ink, textAlign: 'right' },
  unavailable: { fontSize: 13, color: colors.ink2, paddingVertical: 16 },
  disclaimer: {
    marginTop: 14,
    marginHorizontal: 4,
    fontSize: 11,
    lineHeight: 17,
    color: colors.ink3,
  },
});
