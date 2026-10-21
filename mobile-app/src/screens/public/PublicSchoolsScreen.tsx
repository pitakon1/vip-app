/**
 * 学校列表（学区找房一级入口，匿名可看）。
 *
 * 泰国买房/租房的第一决策因子是国际学校，这一页是最值钱的自然入口：
 * 用户按「阶段 / 课程体系」找学校，再进学校页反查周边房源。
 * 不做「学区房」标签——泰国没有划片入学。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import BeikeHeader from '@/components/BeikeHeader';
import { publicApi, unwrapPage, type PublicSchool } from '@/services/publicApi';
import {
  CURRICULUM_OPTIONS,
  STAGE_OPTIONS,
  curriculumLabel,
  schoolStageLabel,
} from '@/lib/publicSite';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { Badge } from './PublicFilterChip';
const PAGE_SIZE = 30;

export default function PublicSchoolsScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [stage, setStage] = useState('');
  const [curriculum, setCurriculum] = useState('');
  /** 当前展开的筛选下拉面板（null = 全部收起） */
  const [openTab, setOpenTab] = useState<null | 'stage' | 'curriculum'>(null);
  const [items, setItems] = useState<PublicSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // 请求序列守卫：切筛选/搜索时丢弃仍在途的旧响应，避免结果互相覆盖
  const requestSeq = useRef(0);

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
      const seq = ++requestSeq.current;
      try {
        const res: any = await publicApi.schools({ page: targetPage, ...params });
        if (seq !== requestSeq.current) return;
        const pageData = unwrapPage<PublicSchool>(res?.data);
        setTotal(pageData.total);
        setPage(targetPage);
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]));
      } catch {
        if (seq !== requestSeq.current) return;
        if (targetPage === 1) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [params],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  // 筛选项：与房源列表同款「单行纯文字 + ▼」下拉口径，首项均为「全部」
  const stageOptions = useMemo(
    () => [
      { value: '', label: t('pub.all') },
      ...STAGE_OPTIONS.map((v) => ({ value: v, label: schoolStageLabel(v, t) })),
    ],
    [t],
  );
  const curriculumOptions = useMemo(
    () => [
      { value: '', label: t('pub.all') },
      ...CURRICULUM_OPTIONS.map((v) => ({ value: v, label: curriculumLabel(v, t) })),
    ],
    [t],
  );
  const filterTabs = [
    {
      key: 'stage' as const,
      label: stage ? schoolStageLabel(stage, t) : t('pub.stageLabel'),
      active: !!stage,
    },
    {
      key: 'curriculum' as const,
      label: curriculum ? curriculumLabel(curriculum, t) : t('pub.curriculumLabel'),
      active: !!curriculum,
    },
  ];

  return (
    <View style={styles.container}>
      <BeikeHeader title={t('pub.schoolsTitle')} />
      <Text style={styles.hint}>{t('pub.schoolsHint')}</Text>

      {/* 与房源列表对齐：一张卡内「搜索行 + 单行筛选栏 + 顶部下拉面板」 */}
      <View style={styles.filterCard}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.ink3} />
          <TextInput
            style={styles.searchInput}
            value={keyword}
            onChangeText={setKeyword}
            placeholder={t('pub.schoolSearchPlaceholder')}
            placeholderTextColor={colors.ink3}
            returnKeyType="search"
          />
        </View>

        <View style={styles.filterBar}>
          {filterTabs.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterTab,
                openTab === f.key && styles.filterTabOpen,
                f.active && styles.filterTabActive,
              ]}
              onPress={() => setOpenTab(openTab === f.key ? null : f.key)}
              activeOpacity={0.7}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.filterTabLabel,
                  (f.active || openTab === f.key) && styles.filterTabLabelActive,
                ]}
              >
                {f.label}
              </Text>
              <Ionicons
                name={openTab === f.key ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={f.active || openTab === f.key ? colors.primary : colors.ink3}
              />
            </TouchableOpacity>
          ))}
        </View>

        {openTab !== null && (
          <View style={styles.dropPanel}>
            {(openTab === 'stage' ? stageOptions : curriculumOptions).map((opt) => {
              const selected = (openTab === 'stage' ? stage : curriculum) === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value || 'all'}
                  style={styles.optionRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (openTab === 'stage') setStage(opt.value);
                    else setCurriculum(opt.value);
                    setOpenTab(null);
                  }}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                    {opt.label}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

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
  title: { fontSize: colors.fontSize['2xl'], fontWeight: '800', color: colors.ink },
  hint: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    marginTop: 10,
    paddingHorizontal: 16,
    lineHeight: 19,
  },
  // 与房源列表一致的筛选卡：搜索行 + 单行筛选栏 + 顶部下拉面板
  filterCard: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface2,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  filterBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  filterTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  filterTabOpen: { backgroundColor: colors.surface2 },
  filterTabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  filterTabLabel: { fontSize: 13, color: colors.ink2, fontWeight: '500', maxWidth: 110 },
  filterTabLabelActive: { color: colors.primary, fontWeight: '600' },
  dropPanel: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: { fontSize: 14, color: colors.ink },
  optionTextActive: { color: colors.primary, fontWeight: '600' },
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
