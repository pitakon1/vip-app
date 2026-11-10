import { NEARBY_LIMIT } from '@/lib/pagination';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/filters';
/**
 * 学校详情 + 该校周边在租在售房源（学区找房的真正入口）。
 *
 * 用户从「想让孩子上这所学校」出发反查房子，而不是从「筛一套房」出发——
 * 这是老站学校页的做法，也是它自然搜索流量最值钱的一块。因此这一页的
 * 主体不是学校简介，而是**周边房源列表**（后端按 haversine 距离由近到远返回）。
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { publicApi, type PublicSchoolDetail } from '@/services/publicApi';
import {
  curriculumLabel,
  loadRates,
  photoUrls,
  schoolStageLabel,
  type TFunction,
} from '@/lib/publicSite';
import PublicListingRow from './PublicListingRow';
import PublicInquiryForm from './PublicInquiryForm';
import { Badge } from './PublicFilterChip';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

export default function PublicSchoolDetailScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const id: string = route.params?.id;

  const [school, setSchool] = useState<PublicSchoolDetail | null>(null);
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
      .school(id, { radius_km: DEFAULT_SCHOOL_RADIUS_KM, limit: NEARBY_LIMIT })
      .then((res: any) => {
        if (cancelled) return;
        const data = res?.data ?? null;
        setSchool(data);
        if (!data) setNotFound(true);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setSchool(null);
        // 404 是「学校不存在」，网络/服务失败要能重试，不能都糊成「未找到」
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

  if (notFound || !school) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>{t('pub.schoolNotFound')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{t('pub.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photos = photoUrls(school.photos);
  const listings = school.nearby_listings ?? [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {photos.length > 0 ? (
          <Image source={{ uri: photos[0] }} style={styles.cover} resizeMode="cover" />
        ) : null}

        <View style={styles.block}>
          <Text style={styles.title}>{school.name}</Text>
          {school.name_en ? <Text style={styles.subtitle}>{school.name_en}</Text> : null}

          <View style={styles.badgeRow}>
            {school.stage ? <Badge text={schoolStageLabel(school.stage, t)} primary /> : null}
            {school.curriculum ? <Badge text={curriculumLabel(school.curriculum, t)} /> : null}
            {school.age_range ? <Badge text={school.age_range} /> : null}
            {school.tuition_range ? <Badge text={school.tuition_range} /> : null}
          </View>

          <KV label={t('pub.address')} value={school.address ?? ''} />
          <KV
            label={t('pub.district')}
            value={[school.district, school.city].filter(Boolean).join(' · ')}
          />
          <KV
            label={t('pub.studentCount')}
            value={school.student_count != null ? String(school.student_count) : ''}
          />
          {school.phone ? (
            <TouchableOpacity
              style={styles.callRow}
              onPress={() => void Linking.openURL(`tel:${school.phone}`)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`${school.phone} · ${t('pub.call')}`}
            >
              <Ionicons name="call-outline" size={16} color={colors.primary} />
              <Text style={styles.callText}>
                {school.phone} · {t('pub.call')}
              </Text>
            </TouchableOpacity>
          ) : null}
          {school.website ? (
            <TouchableOpacity
              onPress={() => school.website && void Linking.openURL(school.website)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="link"
              accessibilityLabel={school.website}
            >
              <Text style={styles.link}>{school.website}</Text>
            </TouchableOpacity>
          ) : null}

          {school.description ? (
            <Text style={styles.description}>{school.description}</Text>
          ) : null}
        </View>

        {/* ---- 周边房源：学区找房的落地点 ---- */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>{t('pub.nearbyListings')}</Text>
          <Text style={styles.sectionHint}>{t('pub.nearbyListingsHint')}</Text>
          {listings.length === 0 ? (
            <Text style={styles.sectionEmpty}>{t('pub.nearbyListingsEmpty')}</Text>
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

        {/* ---- 学校维度留资：还没看中具体房源也能留下需求 ---- */}
        <View style={{ paddingHorizontal: 16 }}>
          <PublicInquiryForm
            t={t as TFunction}
            title={t('pub.schoolInquireTitle')}
            note={t('pub.inquireNote')}
            context={{ school_id: school.id }}
            source="school_detail"
            defaultMessage={t('pub.schoolInquiryMessage', { name: school.name ?? '' })}
          />
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.floatBack, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel={t('pub.back')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

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
  cover: { width: '100%', height: 220 },
  block: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginHorizontal: 16,
    marginTop: 12,
    ...colors.shadow.card,
  },
  title: { fontSize: colors.fontSize['2xl'], fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: colors.fontSize.base, color: colors.ink2, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 4 },
  kvItem: { paddingVertical: 6 },
  kvLabel: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  kvValue: { fontSize: colors.fontSize.base, color: colors.ink, marginTop: 2 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  callText: { fontSize: colors.fontSize.base, color: colors.primary, fontWeight: '600' },
  link: { fontSize: colors.fontSize.base, color: colors.primary, marginTop: 10 },
  description: { fontSize: colors.fontSize.base, color: colors.ink2, lineHeight: 22, marginTop: 10 },
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
