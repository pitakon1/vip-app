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
  ActivityIndicator,
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

export default function PublicSchoolDetailScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const id: string = route.params?.id;

  const [school, setSchool] = useState<PublicSchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadRates();
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    publicApi
      .school(id, { radius_km: 5, limit: 12 })
      .then((res: any) => {
        if (!cancelled) setSchool(res?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setSchool(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!school) {
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
            >
              <Ionicons name="call-outline" size={16} color={colors.primary} />
              <Text style={styles.callText}>
                {school.phone} · {t('pub.call')}
              </Text>
            </TouchableOpacity>
          ) : null}
          {school.website ? (
            <TouchableOpacity onPress={() => school.website && void Linking.openURL(school.website)}>
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
        accessibilityLabel={t('pub.back')}
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
    height: 42,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.sm,
  },
});
