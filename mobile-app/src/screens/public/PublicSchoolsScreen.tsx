/**
 * 学校列表（学区找房一级入口，匿名可看）。
 *
 * 泰国买房/租房的第一决策因子是国际学校，这一页是最值钱的自然入口：
 * 用户按「阶段 / 课程体系」找学校，再进学校页反查周边房源。
 * 不做「学区房」标签——泰国没有划片入学。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { publicApi, unwrapPage, type PublicSchool } from '@/services/publicApi';
import {
  CURRICULUM_OPTIONS,
  STAGE_OPTIONS,
  curriculumLabel,
  schoolStageLabel,
} from '@/lib/publicSite';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { Badge, Chip } from './PublicFilterChip';
import PublicBackRow from './PublicBackRow';

const PAGE_SIZE = 30;

export default function PublicSchoolsScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [stage, setStage] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [items, setItems] = useState<PublicSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => clearTimeout(timer);
  }, [keyword]);

  const params = useMemo(
    () => ({
      page_size: PAGE_SIZE,
      q: debounced || undefined,
      stage: stage || undefined,
      curriculum: curriculum || undefined,
    }),
    [debounced, stage, curriculum],
  );

  const fetchPage = useCallback(
    async (targetPage: number) => {
      if (targetPage === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res: any = await publicApi.schools({ page: targetPage, ...params });
        const pageData = unwrapPage<PublicSchool>(res?.data);
        setTotal(pageData.total);
        setPage(targetPage);
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]));
      } catch {
        if (targetPage === 1) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [params],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.backWrap}>
        <PublicBackRow />
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>{t('pub.schoolsTitle')}</Text>
        <Text style={styles.hint}>{t('pub.schoolsHint')}</Text>
        <TextInput
          style={styles.search}
          value={keyword}
          onChangeText={setKeyword}
          placeholder={t('pub.schoolSearchPlaceholder')}
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
      </View>

      {/* ---- 办学阶段 ---- */}
      <Text style={styles.filterLabel}>{t('pub.stageLabel')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label={t('pub.all')} active={stage === ''} onPress={() => setStage('')} />
        {STAGE_OPTIONS.map((value) => (
          <Chip
            key={value}
            label={schoolStageLabel(value, t)}
            active={stage === value}
            onPress={() => setStage(value)}
          />
        ))}
      </ScrollView>

      {/* ---- 课程体系 ---- */}
      <Text style={styles.filterLabel}>{t('pub.curriculumLabel')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label={t('pub.all')} active={curriculum === ''} onPress={() => setCurriculum('')} />
        {CURRICULUM_OPTIONS.map((value) => (
          <Chip
            key={value}
            label={curriculumLabel(value, t)}
            active={curriculum === value}
            onPress={() => setCurriculum(value)}
          />
        ))}
      </ScrollView>

      <Text style={styles.count}>{t('pub.totalCount', { n: total })}</Text>

      {loading ? (
        <LoadingState label={t('pub.loading')} />
      ) : items.length === 0 ? (
        <EmptyState icon="school-outline" title={t('pub.schoolsEmpty')} sub={t('pub.schoolsHint')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loading || loadingMore || items.length >= total) return;
            void fetchPage(page + 1);
          }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PublicSchoolDetail', { id: item.id })}
            >
              <View style={styles.cardMain}>
                <Text style={styles.schoolName}>{item.name}</Text>
                {item.name_en || item.district ? (
                  <Text style={styles.schoolSub} numberOfLines={1}>
                    {[item.name_en, item.district, item.city].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <View style={styles.badgeRow}>
                  {item.stage ? <Badge text={schoolStageLabel(item.stage, t)} primary /> : null}
                  {item.curriculum ? <Badge text={curriculumLabel(item.curriculum, t)} /> : null}
                  {item.age_range ? <Badge text={item.age_range} /> : null}
                  {item.tuition_range ? <Badge text={item.tuition_range} /> : null}
                </View>
              </View>
              <Text style={styles.cardAction}>{t('pub.viewNearby')} ›</Text>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.primary} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  backWrap: { paddingHorizontal: 16 },
  header: { paddingHorizontal: 16 },
  title: { fontSize: colors.fontSize['2xl'], fontWeight: '800', color: colors.ink },
  hint: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 4, lineHeight: 19 },
  search: {
    height: 42,
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.fieldFillBorder,
    paddingHorizontal: 16,
    fontSize: colors.fontSize.base,
    color: colors.ink,
    marginTop: 10,
  },
  filterLabel: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 12, marginLeft: 16, marginBottom: 6 },
  chipRow: { paddingHorizontal: 16, gap: 8 },
  count: { fontSize: colors.fontSize.sm, color: colors.ink3, paddingHorizontal: 16, marginTop: 12, marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginBottom: colors.spacing.md,
    ...colors.shadow.card,
  },
  cardMain: { flex: 1 },
  schoolName: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  schoolSub: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  cardAction: { fontSize: colors.fontSize.sm, color: colors.primary, marginLeft: 8 },
});
