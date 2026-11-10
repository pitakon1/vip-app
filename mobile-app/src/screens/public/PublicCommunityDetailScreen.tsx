import { BROWSE_PAGE_SIZE } from '@/lib/pagination';
/**
 * 小区（楼盘）详情（匿名可看）。
 *
 * 承载楼盘字典的完整对外参数（户数/栋数/楼层/车位/管理费/竣工年份/开发商/产权/
 * 外国人配额），并挂出该小区在租在售房源——字典存了不展示等于没存。
 *
 * 泰国特有的「外国人配额」在这里必须展示：它直接决定一套房外国人能不能买、
 * 以什么形式持有（公寓永久产权受 49% 配额限制，土地/别墅只能拿租赁权）。
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RemoteImage from '@/components/RemoteImage';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { publicApi, type PublicProjectDetail } from '@/services/publicApi';
import { convertFromThb, loadRates, tenureLabel } from '@/lib/publicSite';
import { fmtMoney } from '@/utils/format';
import PublicListingRow from './PublicListingRow';
import { Badge } from './PublicFilterChip';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

export default function PublicCommunityDetailScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const id: string = route.params?.id;

  const [project, setProject] = useState<PublicProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void loadRates();
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setNotFound(false);
    publicApi
      .project(id, { listing_limit: BROWSE_PAGE_SIZE })
      .then((res: any) => {
        if (cancelled) return;
        const data = res?.data ?? null;
        setProject(data);
        if (!data) setNotFound(true);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setProject(null);
        // 404 是「楼盘不存在」，网络/服务失败要能重试，不能都糊成「未找到」
        if (err?.response?.status === 404) setNotFound(true);
        else setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  if (loading) {
    return <LoadingState label={t('pub.loading')} />;
  }

  if (failed) {
    return (
      <View style={styles.center}>
        <EmptyState
          tone="error"
          title={t('loadFailed')}
          actionLabel={t('retry')}
          onAction={() => setReloadKey((k) => k + 1)}
        />
      </View>
    );
  }

  if (notFound || !project) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>{t('pub.communityNotFound')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{t('pub.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const listings = project.listings ?? [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {project.cover ? (
          <RemoteImage uri={project.cover} style={styles.cover} resizeMode="cover" />
        ) : null}

        <View style={styles.block}>
          <Text style={styles.title}>{project.name}</Text>
          <Text style={styles.subtitle}>
            {[project.address, project.district, project.city].filter(Boolean).join(' · ')}
          </Text>

          <View style={styles.badgeRow}>
            {(project.sale_count ?? 0) > 0 ? (
              <Badge text={t('pub.saleCount', { n: project.sale_count ?? 0 })} primary />
            ) : null}
            {(project.rent_count ?? 0) > 0 ? (
              <Badge text={t('pub.rentCount', { n: project.rent_count ?? 0 })} />
            ) : null}
            {project.tenure ? <Badge text={tenureLabel(project.tenure, t)} /> : null}
          </View>

          <View style={styles.kvGrid}>
            <KV label={t('pub.developer')} value={project.developer_name ?? ''} />
            <KV label={t('pub.totalUnits')} value={num(project.total_units)} />
            <KV label={t('pub.totalBuildings')} value={num(project.total_buildings)} />
            <KV label={t('pub.totalFloors')} value={num(project.total_floors)} />
            <KV label={t('pub.parkingSpaces')} value={num(project.parking_spaces)} />
            <KV label={t('pub.completionYear')} value={num(project.completion_year)} />
            <KV
              label={t('pub.managementFee')}
              value={
                project.management_fee_per_sqm
                  ? `${fmtMoney(project.management_fee_per_sqm, 'THB')}/${t('pub.sqm')}`
                  : ''
              }
            />
            <KV
              label={t('pub.avgPrice')}
              value={
                project.avg_price
                  ? `${fmtMoney(project.avg_price, 'THB')}/${t('pub.sqm')} ≈ ${fmtMoney(
                      convertFromThb(project.avg_price),
                      'CNY',
                    )}`
                  : ''
              }
            />
            <KV
              label={t('pub.foreignQuota')}
              value={project.foreign_quota_pct != null ? `${project.foreign_quota_pct}%` : ''}
            />
          </View>
        </View>

        {/* ---- 该小区房源 ---- */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>{t('pub.communityListings')}</Text>
          <Text style={styles.sectionHint}>{t('pub.communityListingsHint')}</Text>
          {listings.length === 0 ? (
            <Text style={styles.sectionEmpty}>{t('pub.communityListingsEmpty')}</Text>
          ) : (
            listings.map((item) => (
              <PublicListingRow
                key={item.id}
                item={item}
                t={t}
                onPress={(row) => navigation.navigate('PublicListingDetail', { id: row.id })}
              />
            ))
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.floatBack, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
        accessibilityLabel={t('pub.back')}
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

const num = (value?: number | null) => (value != null ? String(value) : '');

function KV({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.kvItem}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  emptyText: { fontSize: colors.fontSize.base, color: colors.ink3 },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { color: colors.primaryForeground, fontWeight: '600' },
  cover: { width: '100%', height: 200 },
  block: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginHorizontal: 16,
    marginTop: 12,
    ...colors.shadow.card,
  },
  title: { fontSize: colors.fontSize['2xl'], fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: colors.fontSize.base, color: colors.ink2, marginTop: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  kvGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  kvItem: { width: '50%', paddingVertical: 7 },
  kvLabel: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  kvValue: { fontSize: colors.fontSize.base, color: colors.ink, marginTop: 2 },
  sectionWrap: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: colors.fontSize.xl, fontWeight: '700', color: colors.ink },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 4, marginBottom: 10 },
  sectionEmpty: { fontSize: colors.fontSize.base, color: colors.ink3, paddingVertical: 20, textAlign: 'center' },
  floatBack: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.sm,
  },
});
