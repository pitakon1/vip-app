﻿import { LIST_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination';
/**
 * C 端房源列表（匿名可浏览，无需注册）。
 *
 * 数据源是 `/public/listings`（不是站内 `/listings` 或 `/properties`——那两个强制鉴权，
 * 匿名请求直接 401，这就是此前「未登录什么都看不到」的根因）。
 *
 * 两个关键设计：
 * 1. **服务端分页 + 筛选**：不再把全量数据拉到前端过滤。后端 `PaginationParams`
 *    把 `page_size` 顶在 100，前端传 999 会被静默截断，于是总数按 100 条算、
 *    第 100 条之后永远翻不到——这类"假分页"在数据量上万后必崩。
 * 2. **按学校找房是空间筛选**：选一所学校 + 半径，后端用 haversine 算真实距离，
 *    结果按距离由近到远，卡片回显「距 XX 约 N 公里」。不做「学区房」布尔标签——
 *    泰国没有划片入学，国际学校是「付费 + 距离」逻辑，硬做标签无据可依。
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
  RefreshControl,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n';
import { publicApi, unwrapPage, type PublicListing, type PublicSchool } from '@/services/publicApi';
import { SCHOOL_RADIUS_OPTIONS, loadRates } from '@/lib/publicSite';
import PublicListingRow from './PublicListingRow';
import PublicBackRow from './PublicBackRow';
import ListState from '@/components/ListState';
import { bizToParams, type BizKey } from '@/lib/bizFilter';

const PAGE_SIZE = LIST_PAGE_SIZE;

type SortKey = 'latest' | 'price_asc' | 'price_desc' | 'area_desc' | 'distance';

const SORTS: SortKey[] = ['latest', 'price_asc', 'price_desc', 'area_desc'];

/**
 * 「类型」筛选口径：与 Web 找房页 / 销售端同一条规则。
 * 公寓 = apartment + condo（后端没有 category 枚举，只能用 property_type 组合表达），
 * 商铺办公 = office + shop；值以重复键下发 `/public/listings?property_type=...`。
 */
type TypeClassKey = '' | 'apartment' | 'villa' | 'commercial' | 'factory' | 'hotel' | 'land';

const TYPE_CLASS_GROUPS: Record<Exclude<TypeClassKey, ''>, string[]> = {
  apartment: ['apartment', 'condo'],
  villa: ['villa', 'house'],
  commercial: ['office', 'shop'],
  factory: ['factory'],
  hotel: ['hotel'],
  land: ['land'],
};

const TYPE_CLASS_OPTIONS: { value: TypeClassKey; labelKey: string }[] = [
  { value: '', labelKey: 'pub.filterAny' },
  { value: 'apartment', labelKey: 'prop.type.apartment' },
  { value: 'villa', labelKey: 'prop.type.house' },
  { value: 'commercial', labelKey: 'pub.shopOffice' },
  { value: 'factory', labelKey: 'prop.type.factory' },
  { value: 'hotel', labelKey: 'prop.type.hotel' },
  { value: 'land', labelKey: 'prop.type.land' },
];

/** 排序取值 → i18n key。抽成常量表而不是内联三元，避免取值增删时漏改文案。 */
const SORT_LABEL_KEY: Record<SortKey, string> = {
  latest: 'pub.sortLatest',
  price_asc: 'pub.sortPriceAsc',
  price_desc: 'pub.sortPriceDesc',
  area_desc: 'pub.sortAreaDesc',
  distance: 'pub.sortDistance',
};

export default function PublicListingsScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // ---- 筛选状态 ----
  const [biz, setBiz] = useState<BizKey>('all');
  // 类型面板草稿：点「应用」才一起提交，点「重置」只清空本面板
  const [draftBiz, setDraftBiz] = useState<BizKey>('all');
  const [draftType, setDraftType] = useState<TypeClassKey>('');
  const [sortOpen, setSortOpen] = useState(false);
  // 「类型」筛选（公寓 / 别墅 / 商铺办公 …），与租售分段是两个维度，可叠加
  const [typeClass, setTypeClass] = useState<TypeClassKey>('');
  const [typeOpen, setTypeOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<SortKey>('latest');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [bedsMin, setBedsMin] = useState('');

  // ---- 学校筛选（空间筛选）----
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolKm, setSchoolKm] = useState<number>(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolPickOpen, setSchoolPickOpen] = useState(false);
  const [schoolKw, setSchoolKw] = useState('');
  const [schoolKwDebounced, setSchoolKwDebounced] = useState('');
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // ---- 列表状态 ----
  const [items, setItems] = useState<PublicListing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reqSeq = useRef(0);

  useEffect(() => {
    void loadRates();
  }, []);

  // 关键词防抖：输入时不打接口，停 350ms 再查
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 学校选择器改为服务端检索：学校库可能上千条，原先只拉前 100 条再前端过滤，
  // 第 100 条之后的学校永远搜不到（FE-06）。
  useEffect(() => {
    const timer = setTimeout(() => setSchoolKwDebounced(schoolKw.trim()), 350);
    return () => clearTimeout(timer);
  }, [schoolKw]);

  useEffect(() => {
    if (!schoolPickOpen) return;
    let alive = true;
    setSchoolsLoading(true);
    publicApi
      .schools({ q: schoolKwDebounced || undefined, page_size: OPTION_PAGE_SIZE })
      .then((res: any) => {
        if (alive) setSchools(unwrapPage<PublicSchool>(res?.data).items);
      })
      .catch(() => {
        if (alive) setSchools([]);
      })
      .finally(() => {
        if (alive) setSchoolsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [schoolPickOpen, schoolKwDebounced]);

  const queryParams = useMemo(
    () => ({
      ...bizToParams(biz),




      property_type: typeClass ? TYPE_CLASS_GROUPS[typeClass] : undefined,
      q: debounced || undefined,
      sort: schoolId ? (sort === 'latest' ? ('distance' as SortKey) : sort) : sort,
      price_min: priceMin ? Number(priceMin) : undefined,
      price_max: priceMax ? Number(priceMax) : undefined,
      area_min: areaMin ? Number(areaMin) : undefined,
      area_max: areaMax ? Number(areaMax) : undefined,
      bedrooms_min: bedsMin ? Number(bedsMin) : undefined,
      school_id: schoolId || undefined,
      school_radius_km: schoolId ? schoolKm : undefined,
    }),
    [biz, typeClass, debounced, sort, priceMin, priceMax, areaMin, areaMax, bedsMin, schoolId, schoolKm],
  );

  const fetchPage = useCallback(
    async (targetPage: number) => {
      const seq = ++reqSeq.current;
      if (targetPage === 1) {
        setLoading(true);
        setLoadError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const res: any = await publicApi.listings({
          page: targetPage,
          page_size: PAGE_SIZE,
          ...queryParams,
        });
        // 过期响应直接丢弃：筛选条件连续变化时，先发的请求可能后到
        if (seq !== reqSeq.current) return;
        const pageData = unwrapPage<PublicListing>(res?.data);
        setTotal(pageData.total);
        setPage(targetPage);
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]));
      } catch {
        if (seq !== reqSeq.current) return;
        if (targetPage === 1) setLoadError(t('loadFailed'));
      } finally {
        if (seq === reqSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [queryParams],
  );

  // 筛选变化 → 回到第 1 页
  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage(1);
    setRefreshing(false);
  }, [fetchPage]);

  const onEndReached = useCallback(() => {
    if (loading || loadingMore) return;
    if (items.length >= total) return;
    void fetchPage(page + 1);
  }, [loading, loadingMore, items.length, total, page, fetchPage]);

  const hasMore = items.length < total;
  const moreActive = !!(priceMin || priceMax || areaMin || areaMax || bedsMin);

  const resetMore = () => {
    setPriceMin('');
    setPriceMax('');
    setAreaMin('');
    setAreaMax('');
    setBedsMin('');
  };

  const resetSchool = () => {
    setSchoolId('');
    setSchoolName('');
    setSchoolKm(3);
  };

  // ---- 类型入口的回显与动作 ----
  const bizLabel =
    biz === 'all'
      ? ''
      : biz === 'rent'
        ? t('pub.typeRent')
        : biz === 'resale'
          ? t('category.resaleTitle')
          : t('category.newTitle');
  const typeClassLabel = typeClass
    ? t(TYPE_CLASS_OPTIONS.find((o) => o.value === typeClass)?.labelKey ?? 'pub.filterType')
    : '';
  const typeLabel =
    [bizLabel, typeClassLabel].filter(Boolean).join('·') || t('pub.filterType');
  const typeActive = biz !== 'all' || !!typeClass;
  const openType = () => {
    setDraftBiz(biz);
    setDraftType(typeClass);
    setTypeOpen(true);
  };
  const applyType = () => {
    setBiz(draftBiz);
    setTypeClass(draftType);
    setTypeOpen(false);
  };
  const clearTypeFilter = () => {
    setBiz('all');
    setTypeClass('');
  };
  const filtered = !!(
    biz !== 'all' ||
    typeClass ||
    debounced ||
    schoolId ||
    priceMin ||
    priceMax ||
    areaMin ||
    areaMax ||
    bedsMin
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <PublicBackRow />
      {/* ---- 顶部：标题 + 搜索 ---- */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('pub.listingsTitle')}</Text>
        <Text style={styles.hint}>{t('pub.guestHint')}</Text>
        <TextInput
          style={styles.search}
          value={keyword}
          onChangeText={setKeyword}
          placeholder={t('pub.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
      </View>


      {/* ---- 筛选行：类型 / 学校 / 更多 ---- */}
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, typeActive && styles.chipActive]}
          onPress={openType}
        >
          <Text style={[styles.chipText, typeActive && styles.chipTextActive]} numberOfLines={1}>
            {typeLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, !!schoolId && styles.chipActive]}
          onPress={() => setSchoolPickOpen(true)}
        >
          <Text style={[styles.chipText, !!schoolId && styles.chipTextActive]} numberOfLines={1}>
            {schoolId
              ? `${schoolName} · ${Number(schoolKm).toFixed(1)}${t('pub.km')}`
              : t('pub.filterSchool')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, moreActive && styles.chipActive]}
          onPress={() => setMoreOpen(true)}
        >
          <Text style={[styles.chipText, moreActive && styles.chipTextActive]}>
            {t('pub.filterMore')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, sort !== 'latest' && styles.chipActive]}
          onPress={() => setSortOpen(true)}
        >
          <Text style={[styles.chipText, sort !== 'latest' && styles.chipTextActive]} numberOfLines={1}>
            {sort === 'latest' ? t('pub.sort') : t(SORT_LABEL_KEY[sort])}
          </Text>
        </TouchableOpacity>
        {schoolId ? (
          <TouchableOpacity style={styles.chipGhost} onPress={resetSchool}>
            <Text style={styles.chipGhostText}>{t('pub.schoolAny')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ---- 已选条件回显：业务线与房产类型各一条，点 × 各自清除 ---- */}
      {typeActive ? (
        <View style={styles.activeRow}>
          {biz !== 'all' ? (
            <TouchableOpacity
              style={styles.activeChip}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              onPress={() => setBiz('all')}
            >
              <Text style={styles.activeChipText}>{bizLabel}</Text>
              <Text style={styles.activeChipX}>×</Text>
            </TouchableOpacity>
          ) : null}
          {typeClass ? (
            <TouchableOpacity
              style={styles.activeChip}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              onPress={() => setTypeClass('')}
            >
              <Text style={styles.activeChipText}>{typeClassLabel}</Text>
              <Text style={styles.activeChipX}>×</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* ---- 结果数 ---- */}
      <Text style={styles.count}>{t('pub.totalCount', { n: total })}</Text>

      {/* ---- 列表 ---- */}
      {loading || loadError || items.length === 0 ? (
        <ListState
          loading={loading}
          loadingLabel={t('pub.loading')}
          error={loadError}
          empty={items.length === 0}
          filtered={filtered}
          emptyTitle={filtered ? t('pub.emptyFiltered') : t('pub.empty')}
          emptySub={filtered ? t('pub.emptyFilteredSub') : t('pub.listingsHint')}
          emptyActionLabel={typeActive ? t('pub.clearType') : undefined}
          onEmptyAction={typeActive ? clearTypeFilter : undefined}
          retryLabel={t('retry')}
          onRetry={() => {
            setLoadError(null);
            void fetchPage(1);
          }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PublicListingRow
              item={item}
              t={t}
              onPress={(row) => navigation.navigate('PublicListingDetail', { id: row.id })}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.primary} />
            ) : hasMore ? (
              <Text style={styles.footer}>{t('pub.loadMore')}</Text>
            ) : (
              <Text style={styles.footer}>{t('pub.noMore')}</Text>
            )
          }
        />
      )}

      {/* ==================== 类型筛选 ==================== */}
      <Modal visible={typeOpen} animationType="slide" transparent onRequestClose={() => setTypeOpen(false)}>
        <View style={styles.modalMask}>
          {/* 点击面板外的空白区域 = 收起（与下拉面板一致） */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTypeOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('pub.filterType')}</Text>
              <TouchableOpacity onPress={() => setTypeOpen(false)}>
                <Text style={styles.sheetClose}>{t('pub.cancel')}</Text>
              </TouchableOpacity>
            </View>

            {/* 业务线：单选，对应 listing_type 与 is_new_development */}
            <Text style={styles.fieldLabel}>{t('pub.bizLine')}</Text>
            <View style={styles.radiusRow}>
              {([
                { value: 'all', label: t('pub.bizAll') },
                { value: 'rent', label: t('pub.typeRent') },
                { value: 'resale', label: t('category.resaleTitle') },
                { value: 'new', label: t('category.newTitle') },
              ] as const).map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.radiusChip, draftBiz === o.value && styles.chipActive]}
                  onPress={() => setDraftBiz(o.value)}
                >
                  <Text style={[styles.chipText, draftBiz === o.value && styles.chipTextActive]}>
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 房产类型：单选一组 property_type，可与业务线叠加 */}
            <Text style={styles.fieldLabel}>{t('pub.propertyTypeGroup')}</Text>
            <View style={styles.radiusRow}>
              {TYPE_CLASS_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.value || 'any'}
                  style={[styles.radiusChip, draftType === o.value && styles.chipActive]}
                  onPress={() => setDraftType(o.value)}
                >
                  <Text style={[styles.chipText, draftType === o.value && styles.chipTextActive]}>
                    {t(o.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetReset}
                onPress={() => {
                  setDraftBiz('all');
                  setDraftType('');
                }}
              >
                <Text style={styles.sheetResetText}>{t('pub.reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetApply} onPress={applyType}>
                <Text style={styles.sheetApplyText}>{t('pub.apply')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== 排序 ==================== */}
      <Modal visible={sortOpen} animationType="slide" transparent onRequestClose={() => setSortOpen(false)}>
        <View style={styles.modalMask}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('pub.sort')}</Text>
              <TouchableOpacity onPress={() => setSortOpen(false)}>
                <Text style={styles.sheetClose}>{t('pub.cancel')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.radiusRow, { marginTop: 16 }]}>
              {SORTS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.radiusChip, sort === key && styles.chipActive]}
                  onPress={() => {
                    setSort(key);
                    setSortOpen(false);
                  }}
                >
                  <Text style={[styles.chipText, sort === key && styles.chipTextActive]}>
                    {t(SORT_LABEL_KEY[key])}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== 学校筛选（空间筛选）==================== */}
      <Modal visible={schoolPickOpen} animationType="slide" transparent onRequestClose={() => setSchoolPickOpen(false)}>
        <View style={styles.modalMask}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSchoolPickOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('pub.filterSchool')}</Text>
              <TouchableOpacity onPress={() => setSchoolPickOpen(false)}>
                <Text style={styles.sheetClose}>{t('pub.cancel')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetHint}>{t('pub.schoolFilterHint')}</Text>

            <Text style={styles.fieldLabel}>{t('pub.schoolRadius')}</Text>
            <View style={styles.radiusRow}>
              {SCHOOL_RADIUS_OPTIONS.map((km) => (
                <TouchableOpacity
                  key={km}
                  style={[styles.radiusChip, schoolKm === km && styles.chipActive]}
                  onPress={() => setSchoolKm(km)}
                >
                  <Text style={[styles.chipText, schoolKm === km && styles.chipTextActive]}>
                    {km}
                    {t('pub.km')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.search, { marginTop: 12 }]}
              value={schoolKw}
              onChangeText={setSchoolKw}
              placeholder={t('pub.schoolSearchPlaceholder')}
              placeholderTextColor={colors.ink3}
            />

            <ScrollView style={{ maxHeight: 300, marginTop: 8 }}>
              {schoolsLoading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
              ) : schools.length === 0 ? (
                <Text style={styles.sheetEmpty}>{t('pub.schoolFilterEmpty')}</Text>
              ) : (
                schools.map((school) => {
                  const active = schoolId === school.id;
                  return (
                    <TouchableOpacity
                      key={school.id}
                      style={[styles.schoolRow, active && styles.schoolRowActive]}
                      onPress={() => {
                        setSchoolId(school.id);
                        setSchoolName(school.name ?? '');
                        setSchoolPickOpen(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.schoolName}>{school.name}</Text>
                        {school.name_en || school.district ? (
                          <Text style={styles.schoolSub} numberOfLines={1}>
                            {[school.name_en, school.district].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      {active ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity style={styles.sheetReset} onPress={resetSchool}>
              <Text style={styles.sheetResetText}>{t('pub.schoolAny')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================== 更多筛选 ==================== */}
      <Modal visible={moreOpen} animationType="slide" transparent onRequestClose={() => setMoreOpen(false)}>
        <View style={styles.modalMask}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoreOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('pub.filterMore')}</Text>
              <TouchableOpacity onPress={() => setMoreOpen(false)}>
                <Text style={styles.sheetClose}>{t('pub.cancel')}</Text>
              </TouchableOpacity>
            </View>

            {schoolId ? (
              <>
                <Text style={styles.fieldLabel}>{t('pub.sort')}</Text>
                <View style={styles.radiusRow}>
                  <TouchableOpacity
                    style={[styles.radiusChip, sort === 'distance' && styles.chipActive]}
                    onPress={() => setSort('distance')}
                  >
                    <Text style={[styles.chipText, sort === 'distance' && styles.chipTextActive]}>
                      {t('pub.sortDistance')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            <Text style={styles.fieldLabel}>{t('pub.sort')}</Text>
            <View style={styles.radiusRow}>
              {SORTS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.radiusChip, sort === key && styles.chipActive]}
                  onPress={() => setSort(key)}
                >
                  <Text style={[styles.chipText, sort === key && styles.chipTextActive]}>
                    {t(SORT_LABEL_KEY[key])}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t('pub.filterPrice')}</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={priceMin}
                onChangeText={setPriceMin}
                keyboardType="numeric"
                placeholder={t('pub.filterMin')}
                placeholderTextColor={colors.ink3}
              />
              <Text style={styles.rangeDash}>—</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={priceMax}
                onChangeText={setPriceMax}
                keyboardType="numeric"
                placeholder={t('pub.filterMax')}
                placeholderTextColor={colors.ink3}
              />
            </View>

            <Text style={styles.fieldLabel}>{t('pub.filterArea')}</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={areaMin}
                onChangeText={setAreaMin}
                keyboardType="numeric"
                placeholder={t('pub.filterMin')}
                placeholderTextColor={colors.ink3}
              />
              <Text style={styles.rangeDash}>—</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={areaMax}
                onChangeText={setAreaMax}
                keyboardType="numeric"
                placeholder={t('pub.filterMax')}
                placeholderTextColor={colors.ink3}
              />
            </View>

            <Text style={styles.fieldLabel}>{t('pub.filterBeds')}</Text>
            <View style={styles.radiusRow}>
              {['', '1', '2', '3', '4'].map((n) => (
                <TouchableOpacity
                  key={n || 'any'}
                  style={[styles.radiusChip, bedsMin === n && styles.chipActive]}
                  onPress={() => setBedsMin(n)}
                >
                  <Text style={[styles.chipText, bedsMin === n && styles.chipTextActive]}>
                    {n ? `${n}+` : t('pub.filterAny')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetReset} onPress={resetMore}>
                <Text style={styles.sheetResetText}>{t('pub.reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetApply]}
                onPress={() => setMoreOpen(false)}
              >
                <Text style={styles.sheetApplyText}>{t('pub.apply')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingBottom: 4 },
  title: { fontSize: colors.fontSize['2xl'], fontWeight: '800', color: colors.ink },
  hint: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 4 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  activeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 10 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.fieldFill,
  },
  activeChipText: { fontSize: colors.fontSize.xs, color: colors.primary, fontWeight: '600' },
  activeChipX: { fontSize: colors.fontSize.xs, color: colors.primary, fontWeight: '700' },
  chip: {
    minHeight: colors.touch.chip,
    maxWidth: 200,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  chipGhost: { minHeight: colors.touch.min, justifyContent: 'center', paddingHorizontal: 6 },
  chipGhostText: { fontSize: colors.fontSize.sm, color: colors.primary },
  count: { fontSize: colors.fontSize.sm, color: colors.ink3, paddingHorizontal: 16, marginTop: 10, marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { textAlign: 'center', fontSize: colors.fontSize.sm, color: colors.ink3, paddingVertical: 16 },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: colors.spacing.lg,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  sheetClose: { fontSize: colors.fontSize.base, color: colors.ink2 },
  sheetHint: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 6 },
  fieldLabel: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 16, marginBottom: 8 },
  radiusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  radiusChip: {
    minHeight: colors.touch.chip,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetEmpty: { fontSize: colors.fontSize.sm, color: colors.ink3, paddingVertical: 24, textAlign: 'center' },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  schoolRowActive: { backgroundColor: colors.sidebarActive },
  schoolName: { fontSize: colors.fontSize.base, color: colors.ink, fontWeight: '600' },
  schoolSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },

  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    height: 42,
    borderRadius: colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.fieldFill,
    paddingHorizontal: 12,
    fontSize: colors.fontSize.base,
    color: colors.ink,
  },
  rangeDash: { color: colors.ink3 },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  sheetReset: {
    flex: 1,
    height: 46,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  sheetResetText: { fontSize: colors.fontSize.base, color: colors.ink2 },
  sheetApply: {
    flex: 1,
    height: 46,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  sheetApplyText: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.primaryForeground },
});
