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
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n';
import { publicApi, unwrapPage, type PublicListing, type PublicSchool } from '@/services/publicApi';
import { SCHOOL_RADIUS_OPTIONS, loadRates } from '@/lib/publicSite';
import PublicListingRow from './PublicListingRow';
import PublicBackRow from './PublicBackRow';
import ListState from '@/components/ListState';
import FilterBar, {
  FilterOptionGrid,
  FilterPanel,
  FilterRail,
  type FilterTabDef,
} from '@/components/FilterBar';
import { PanelBackdrop, usePanelAnchor } from '@/components/PanelBackdrop';
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

/** 分类页快捷入口带入的预设筛选；都会落进「更多」面板里对应的字段。 */
type PresetKey = 'latest' | 'furnished' | 'owner_direct' | 'featured' | 'vr' | 'env' | 'new';

const PRESET_LABEL_KEY: Record<PresetKey, string> = {
  latest: 'pub.presetLatest',
  furnished: 'pub.presetFurnished',
  owner_direct: 'pub.presetOwnerDirect',
  featured: 'pub.presetFeatured',
  vr: 'pub.presetVr',
  env: 'pub.presetEnv',
  new: 'pub.presetNew',
};

/**
 * 「更多」面板左竖栏分组。
 * 这里收纳的是后端 `/public/listings` 已支持、但此前只在分类页预设里出现的维度：
 * 之前用户点「业主直租」入口能筛，但进到列表页却找不到这个条件，也没法取消单项。
 */
type MoreRailKey = 'area' | 'room' | 'tags' | 'lease' | 'business' | 'amenity';

const ORIENTATIONS = [
  'north',
  'south',
  'east',
  'west',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
];
const DECORATIONS = ['fully_furnished', 'standard', 'simple', 'bare', 'luxury'];
const FLOOR_LEVELS = ['low', 'mid', 'high'];
const TENURES = ['freehold', 'leasehold', 'mixed'];
const AMENITIES = ['aircon', 'pool', 'gym', 'parking', 'elevator', 'balcony', 'garden'];
/** 最短租期：取后端常用档位，选中 = 该期限起租 */
const LEASE_MONTHS = ['3', '6', '12'];
/** 楼龄上限（年） */
const BUILDING_AGES = ['5', '10', '20'];

export default function PublicListingsScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  // 分类页快捷入口预设（新上 / 带家具 / 房东直租 / 精选 / VR / 可环评 / 新房）
  const [preset, setPreset] = useState<PresetKey | null>((route.params?.preset as PresetKey) ?? null);
  // 标题按入口语义命名（房东直租 / 新上房源 / 带家具房源…），不再一律叫「上架房源」
  const headerTitleKey = preset ? PRESET_LABEL_KEY[preset] : 'category.allListings';
  useLayoutEffect(() => {
    navigation.setOptions({ title: t(headerTitleKey) });
  }, [headerTitleKey, navigation, t]);

  // ---- 筛选状态 ----
  const { rootRef, anchorRef, backdropTop, measureAnchor } = usePanelAnchor();
  type PanelKey = 'type' | 'price' | 'school' | 'more' | 'sort';
  // 单开面板：同一 tab 再点一次收起
  const [openKey, setOpenKey] = useState<PanelKey | null>(null);
  const [biz, setBiz] = useState<BizKey>('all');
  // 类型面板草稿：点「确定」才一起提交，点「重置」只清空本面板
  const [draftBiz, setDraftBiz] = useState<BizKey>('all');
  const [draftType, setDraftType] = useState<TypeClassKey>('');
  // 类型面板左侧一级类目：业务线 / 房产类型
  const [typeRail, setTypeRail] = useState<'biz' | 'type'>('biz');
  // 「类型」筛选（公寓 / 别墅 / 商铺办公 …），与租售分段是两个维度，可叠加
  const [typeClass, setTypeClass] = useState<TypeClassKey>('');
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<SortKey>('latest');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [bedsMin, setBedsMin] = useState('');

  // ---- 「更多」面板：后端支持但原先只有预设入口的维度 ----
  // 预设入口（分类页）会把值灌进这些 state，进到列表页后面板里能看到选中态，
  // 也能像普通筛选项一样点掉——不再出现「入口能筛、面板里却找不到」的死角。
  const [moreRail, setMoreRail] = useState<MoreRailKey>('area');
  const [orientation, setOrientation] = useState('');
  const [floorLevels, setFloorLevels] = useState<string[]>([]);
  const [decoration, setDecoration] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [ownerDirect, setOwnerDirect] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [hasVr, setHasVr] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [envPermit, setEnvPermit] = useState(false);
  const [minLease, setMinLease] = useState('');
  const [tenure, setTenure] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [wholeFloor, setWholeFloor] = useState(false);
  const [wholeBuilding, setWholeBuilding] = useState(false);
  const [companyReg, setCompanyReg] = useState(false);

  // ---- 学校筛选（空间筛选）----
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolKm, setSchoolKm] = useState<number>(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolKw, setSchoolKw] = useState('');
  const [schoolKwDebounced, setSchoolKwDebounced] = useState('');
  const [schoolsLoading, setSchoolsLoading] = useState(false);

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

  // 预设入口 → 面板状态：进入后这些条件既在面板里保持选中，也以可移除 chip 展示；
  // 从「全部房源」再次进入时 params.preset 为空，顺带清掉上一次的预设维度。
  useEffect(() => {
    const p = (route.params?.preset as PresetKey) ?? null;
    setPreset(p);
    setDecoration(p === 'furnished' ? 'fully_furnished' : '');
    setOwnerDirect(p === 'owner_direct');
    setFeatured(p === 'featured');
    setHasVr(p === 'vr');
    setEnvPermit(p === 'env');
    // 新房没有独立布尔面板，复用「业务线」里的新房档（同一后端参数 is_new_development）
    if (p === 'new') setBiz('new');
  }, [route.params?.preset]);

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
    if (openKey !== 'school') return;
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
  }, [openKey, schoolKwDebounced]);

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
      orientation: orientation || undefined,
      floor_level: floorLevels.length ? floorLevels : undefined,
      decoration: decoration || undefined,
      amenity: amenities.length ? amenities : undefined,
      owner_direct: ownerDirect || undefined,
      is_featured: featured || undefined,
      has_vr: hasVr || undefined,
      has_video: hasVideo || undefined,
      environmental_permit: envPermit || undefined,
      min_lease_months: minLease ? Number(minLease) : undefined,
      tenure: (tenure || undefined) as 'freehold' | 'leasehold' | 'mixed' | undefined,
      building_age_max: ageMax ? Number(ageMax) : undefined,
      whole_floor_only: wholeFloor || undefined,
      whole_building_only: wholeBuilding || undefined,
      company_registrable: companyReg || undefined,
      school_id: schoolId || undefined,
      school_radius_km: schoolId ? schoolKm : undefined,
    }),
    [
      biz,
      typeClass,
      debounced,
      sort,
      priceMin,
      priceMax,
      areaMin,
      areaMax,
      bedsMin,
      orientation,
      floorLevels,
      decoration,
      amenities,
      ownerDirect,
      featured,
      hasVr,
      hasVideo,
      envPermit,
      minLease,
      tenure,
      ageMax,
      wholeFloor,
      wholeBuilding,
      companyReg,
      schoolId,
      schoolKm,
    ],
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

  const resetMore = () => {
    setAreaMin('');
    setAreaMax('');
    setBedsMin('');
    setOrientation('');
    setFloorLevels([]);
    setDecoration('');
    setAmenities([]);
    setOwnerDirect(false);
    setFeatured(false);
    setHasVr(false);
    setHasVideo(false);
    setEnvPermit(false);
    setMinLease('');
    setTenure('');
    setAgeMax('');
    setWholeFloor(false);
    setWholeBuilding(false);
    setCompanyReg(false);
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
  const priceActive = !!(priceMin || priceMax);
  const priceLabel = priceActive
    ? `${priceMin || '—'}–${priceMax || '—'}`
    : t('pub.filterPrice');
  // 「更多」面板的已选维度数（每个维度算 1，多选项如楼层/配套按维度计）
  const moreActiveDims = [
    !!(areaMin || areaMax),
    !!bedsMin,
    !!orientation,
    floorLevels.length > 0,
    !!decoration,
    amenities.length > 0,
    ownerDirect,
    featured,
    hasVr,
    hasVideo,
    envPermit,
    !!minLease,
    !!tenure,
    !!ageMax,
    wholeFloor,
    wholeBuilding,
    companyReg,
  ];
  const moreCount = moreActiveDims.filter(Boolean).length;
  const filterTabs: FilterTabDef[] = [
    { key: 'type', label: typeLabel, active: typeActive },
    { key: 'price', label: priceLabel, active: priceActive },
    {
      key: 'school',
      label: schoolId
        ? `${schoolName} · ${Number(schoolKm).toFixed(1)}${t('pub.km')}`
        : t('pub.filterSchool'),
      active: !!schoolId,
    },
    { key: 'more', label: t('pub.filterMore'), active: moreCount > 0, badge: moreCount },
    { key: 'sort', label: t(SORT_LABEL_KEY[sort]), active: sort !== 'latest' },
  ];
  const toggleTab = (key: string) => {
    if (key === 'type') {
      setDraftBiz(biz);
      setDraftType(typeClass);
    }
    setOpenKey((cur) => (cur === key ? null : (key as PanelKey)));
  };
  const applyType = () => {
    setBiz(draftBiz);
    setTypeClass(draftType);
    setOpenKey(null);
  };
  const clearTypeFilter = () => {
    setBiz('all');
    setTypeClass('');
  };

  // ---- 已选条件 chip：每个维度一条，点 × 只清这一个维度 ----
  const chips: { key: string; label: string; onClear: () => void }[] = [];
  if (biz !== 'all') {
    chips.push({ key: 'biz', label: bizLabel, onClear: () => setBiz('all') });
  }
  if (typeClass) {
    chips.push({ key: 'type', label: typeClassLabel, onClear: () => setTypeClass('') });
  }
  if (priceMin || priceMax) {
    chips.push({
      key: 'price',
      label: `${priceMin || '—'}–${priceMax || '—'}`,
      onClear: () => {
        setPriceMin('');
        setPriceMax('');
      },
    });
  }
  if (schoolId) {
    chips.push({
      key: 'school',
      label: `${schoolName} · ${Number(schoolKm).toFixed(1)}${t('pub.km')}`,
      onClear: resetSchool,
    });
  }
  if (areaMin || areaMax) {
    chips.push({
      key: 'area',
      label: `${t('pub.filterArea')} ${areaMin || '—'}–${areaMax || '—'}${t('pub.sqm')}`,
      onClear: () => {
        setAreaMin('');
        setAreaMax('');
      },
    });
  }
  if (bedsMin) {
    chips.push({ key: 'beds', label: `${bedsMin}+ ${t('pub.filterBeds')}`, onClear: () => setBedsMin('') });
  }
  if (orientation) {
    chips.push({
      key: 'orientation',
      label: t(`pub.orientation.${orientation}`),
      onClear: () => setOrientation(''),
    });
  }
  floorLevels.forEach((lv) => {
    chips.push({
      key: `floor-${lv}`,
      label: t(`pub.floorLevel.${lv}`),
      onClear: () => setFloorLevels((prev) => prev.filter((x) => x !== lv)),
    });
  });
  if (decoration) {
    chips.push({
      key: 'decoration',
      // 预设入口进来的「带家具」沿用入口文案，避免同一条件两种说法
      label:
        decoration === 'fully_furnished'
          ? t('pub.presetFurnished')
          : t(`pub.decoration.${decoration}`),
      onClear: () => setDecoration(''),
    });
  }
  amenities.forEach((a) => {
    chips.push({
      key: `amenity-${a}`,
      label: t(`prop.amenity.${a}`),
      onClear: () => setAmenities((prev) => prev.filter((x) => x !== a)),
    });
  });
  if (ownerDirect) {
    chips.push({ key: 'owner', label: t('pub.presetOwnerDirect'), onClear: () => setOwnerDirect(false) });
  }
  if (featured) {
    chips.push({ key: 'featured', label: t('pub.presetFeatured'), onClear: () => setFeatured(false) });
  }
  if (hasVr) {
    chips.push({ key: 'vr', label: t('pub.presetVr'), onClear: () => setHasVr(false) });
  }
  if (hasVideo) {
    chips.push({ key: 'video', label: t('pub.filterVideo'), onClear: () => setHasVideo(false) });
  }
  if (envPermit) {
    chips.push({ key: 'env', label: t('pub.presetEnv'), onClear: () => setEnvPermit(false) });
  }
  if (minLease) {
    chips.push({
      key: 'lease',
      label: t('pub.leaseMonths', { n: minLease }),
      onClear: () => setMinLease(''),
    });
  }
  if (tenure) {
    chips.push({ key: 'tenure', label: t(`pub.tenure.${tenure}`), onClear: () => setTenure('') });
  }
  if (ageMax) {
    chips.push({
      key: 'age',
      label: t('pub.ageWithin', { n: ageMax }),
      onClear: () => setAgeMax(''),
    });
  }
  if (wholeFloor) {
    chips.push({ key: 'wholeFloor', label: t('pub.filterWholeFloor'), onClear: () => setWholeFloor(false) });
  }
  if (wholeBuilding) {
    chips.push({
      key: 'wholeBuilding',
      label: t('pub.filterWholeBuilding'),
      onClear: () => setWholeBuilding(false),
    });
  }
  if (companyReg) {
    chips.push({ key: 'companyReg', label: t('pub.filterCompanyReg'), onClear: () => setCompanyReg(false) });
  }

  const filtered = chips.length > 0 || !!debounced;

  // ---- 「更多」面板里的多选组 ----
  const tagSelected = [
    ownerDirect ? 'owner' : '',
    featured ? 'featured' : '',
    hasVr ? 'vr' : '',
    hasVideo ? 'video' : '',
    envPermit ? 'env' : '',
  ].filter(Boolean);
  const toggleTag = (k: string) => {
    const on = !tagSelected.includes(k);
    if (k === 'owner') setOwnerDirect(on);
    else if (k === 'featured') setFeatured(on);
    else if (k === 'vr') setHasVr(on);
    else if (k === 'video') setHasVideo(on);
    else if (k === 'env') setEnvPermit(on);
  };
  const bizSelected = [
    wholeFloor ? 'floor' : '',
    wholeBuilding ? 'building' : '',
    companyReg ? 'company' : '',
  ].filter(Boolean);
  const toggleBizExtra = (k: string) => {
    const on = !bizSelected.includes(k);
    if (k === 'floor') setWholeFloor(on);
    else if (k === 'building') setWholeBuilding(on);
    else if (k === 'company') setCompanyReg(on);
  };

  return (
    <View ref={rootRef} style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <PublicBackRow />
      {/* ---- 顶部：标题 + 搜索 ---- */}
      <View style={styles.header}>
        <Text style={styles.title}>{t(headerTitleKey)}</Text>
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


      {/* ---- 筛选栏：类型 / 租金 / 学校 / 更多 / 排序（点击就地展开面板）---- */}
      <FilterBar
        tabs={filterTabs}
        openKey={openKey}
        onToggle={toggleTab}
        anchorRef={anchorRef}
        onLayoutAnchor={measureAnchor}
      >
        {openKey === 'type' ? (
          <FilterPanel
            onReset={() => {
              setDraftBiz('all');
              setDraftType('');
            }}
            onConfirm={applyType}
            resetLabel={t('pub.reset')}
            confirmLabel={t('pub.apply')}
          >
            <View style={styles.typePanel}>
              <FilterRail
                items={[
                  { key: 'biz', label: t('pub.bizLine') },
                  { key: 'type', label: t('pub.propertyTypeGroup') },
                ]}
                value={typeRail}
                onChange={(k) => setTypeRail(k as 'biz' | 'type')}
              />
              <View style={styles.typePanelBody}>
                {typeRail === 'biz' ? (
                  <FilterOptionGrid
                    options={[
                      { key: 'all', label: t('pub.bizAll') },
                      { key: 'rent', label: t('pub.typeRent') },
                      { key: 'resale', label: t('category.resaleTitle') },
                      { key: 'new', label: t('category.newTitle') },
                    ]}
                    value={draftBiz}
                    onChange={(k) => setDraftBiz(k as BizKey)}
                  />
                ) : (
                  <FilterOptionGrid
                    options={TYPE_CLASS_OPTIONS.map((o) => ({ key: o.value, label: t(o.labelKey) }))}
                    value={draftType}
                    onChange={(k) => setDraftType(k as TypeClassKey)}
                  />
                )}
              </View>
            </View>
          </FilterPanel>
        ) : null}

        {openKey === 'price' ? (
          <FilterPanel
            onReset={() => {
              setPriceMin('');
              setPriceMax('');
            }}
            onConfirm={() => setOpenKey(null)}
            resetLabel={t('pub.reset')}
            confirmLabel={t('pub.apply')}
          >
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
          </FilterPanel>
        ) : null}

        {openKey === 'school' ? (
          <FilterPanel
            onReset={resetSchool}
            onConfirm={() => setOpenKey(null)}
            resetLabel={t('pub.schoolAny')}
            confirmLabel={t('pub.apply')}
          >
            <Text style={styles.fieldLabel}>{t('pub.schoolRadius')}</Text>
            <FilterOptionGrid
              options={SCHOOL_RADIUS_OPTIONS.map((km) => ({ key: String(km), label: `${km}${t('pub.km')}` }))}
              value={String(schoolKm)}
              onChange={(k) => setSchoolKm(Number(k))}
            />
            <TextInput
              style={styles.search}
              value={schoolKw}
              onChangeText={setSchoolKw}
              placeholder={t('pub.schoolSearchPlaceholder')}
              placeholderTextColor={colors.ink3}
            />
            <ScrollView style={{ maxHeight: 240, marginTop: 8 }}>
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
                        setOpenKey(null);
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
          </FilterPanel>
        ) : null}

        {openKey === 'more' ? (
          <FilterPanel
            onReset={resetMore}
            onConfirm={() => setOpenKey(null)}
            resetLabel={t('pub.reset')}
            confirmLabel={t('pub.apply')}
          >
            <View style={styles.typePanel}>
              <FilterRail
                items={[
                  { key: 'area', label: t('pub.filterArea') },
                  { key: 'room', label: t('pub.filterRoom') },
                  { key: 'tags', label: t('pub.filterTags') },
                  { key: 'lease', label: t('pub.filterLeaseTerms') },
                  { key: 'business', label: t('pub.filterCommercial') },
                  { key: 'amenity', label: t('list.amenities') },
                ]}
                value={moreRail}
                onChange={(k) => setMoreRail(k as MoreRailKey)}
              />
              <ScrollView style={styles.moreBody} contentContainerStyle={{ paddingBottom: 4 }}>
                {moreRail === 'area' ? (
                  <>
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
                    <FilterOptionGrid
                      title={t('pub.filterBeds')}
                      options={['', '1', '2', '3', '4'].map((n) => ({
                        key: n,
                        label: n ? `${n}+` : t('pub.filterAny'),
                      }))}
                      value={bedsMin}
                      onChange={setBedsMin}
                    />
                  </>
                ) : null}

                {moreRail === 'room' ? (
                  <>
                    <FilterOptionGrid
                      title={t('pub.orientationLabel')}
                      options={[{ key: '', label: t('pub.filterAny') }, ...ORIENTATIONS.map((o) => ({ key: o, label: t(`pub.orientation.${o}`) }))]}
                      value={orientation}
                      onChange={setOrientation}
                    />
                    <FilterOptionGrid
                      title={t('pub.floor')}
                      options={FLOOR_LEVELS.map((lv) => ({ key: lv, label: t(`pub.floorLevel.${lv}`) }))}
                      value={floorLevels}
                      onChange={(k) =>
                        setFloorLevels((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
                      }
                    />
                    <FilterOptionGrid
                      title={t('pub.decorationLabel')}
                      options={[{ key: '', label: t('pub.filterAny') }, ...DECORATIONS.map((d) => ({ key: d, label: t(`pub.decoration.${d}`) }))]}
                      value={decoration}
                      onChange={setDecoration}
                    />
                  </>
                ) : null}

                {moreRail === 'tags' ? (
                  <FilterOptionGrid
                    options={[
                      { key: 'owner', label: t('pub.presetOwnerDirect') },
                      { key: 'featured', label: t('pub.presetFeatured') },
                      { key: 'vr', label: t('pub.presetVr') },
                      { key: 'video', label: t('pub.filterVideo') },
                      { key: 'env', label: t('pub.presetEnv') },
                    ]}
                    value={tagSelected}
                    onChange={toggleTag}
                  />
                ) : null}

                {moreRail === 'lease' ? (
                  <>
                    <FilterOptionGrid
                      title={t('pub.filterMinLease')}
                      options={[{ key: '', label: t('pub.filterAny') }, ...LEASE_MONTHS.map((n) => ({ key: n, label: t('pub.leaseMonths', { n }) }))]}
                      value={minLease}
                      onChange={setMinLease}
                    />
                    <FilterOptionGrid
                      title={t('pub.tenureLabel')}
                      options={[{ key: '', label: t('pub.filterAny') }, ...TENURES.map((x) => ({ key: x, label: t(`pub.tenure.${x}`) }))]}
                      value={tenure}
                      onChange={setTenure}
                    />
                    <FilterOptionGrid
                      title={t('pub.filterBuildingAge')}
                      options={[{ key: '', label: t('pub.filterAny') }, ...BUILDING_AGES.map((n) => ({ key: n, label: t('pub.ageWithin', { n }) }))]}
                      value={ageMax}
                      onChange={setAgeMax}
                    />
                  </>
                ) : null}

                {moreRail === 'business' ? (
                  <FilterOptionGrid
                    options={[
                      { key: 'floor', label: t('pub.filterWholeFloor') },
                      { key: 'building', label: t('pub.filterWholeBuilding') },
                      { key: 'company', label: t('pub.filterCompanyReg') },
                    ]}
                    value={bizSelected}
                    onChange={toggleBizExtra}
                  />
                ) : null}

                {moreRail === 'amenity' ? (
                  <FilterOptionGrid
                    options={AMENITIES.map((a) => ({ key: a, label: t(`prop.amenity.${a}`) }))}
                    value={amenities}
                    onChange={(k) =>
                      setAmenities((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
                    }
                  />
                ) : null}
              </ScrollView>
            </View>
          </FilterPanel>
        ) : null}

        {openKey === 'sort' ? (
          <FilterOptionGrid
            options={[...SORTS, ...(schoolId ? (['distance'] as SortKey[]) : [])].map((key) => ({
              key,
              label: t(SORT_LABEL_KEY[key]),
            }))}
            value={sort}
            onChange={(k) => {
              setSort(k as SortKey);
              setOpenKey(null);
            }}
          />
        ) : null}
      </FilterBar>

      {/* ---- 已选条件回显：每个维度一条 chip，点 × 只清该维度 ---- */}
      {chips.length ? (
        <View style={styles.activeRow}>
          {chips.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={styles.activeChip}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              onPress={c.onClear}
            >
              <Text style={styles.activeChipText}>{c.label}</Text>
              <Text style={styles.activeChipX}>×</Text>
            </TouchableOpacity>
          ))}
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

      {openKey ? <PanelBackdrop top={backdropTop} onClose={() => setOpenKey(null)} /> : null}

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
  typePanel: { flexDirection: 'row', marginTop: -12, marginBottom: -12, marginHorizontal: -16 },
  typePanelBody: { flex: 1, paddingLeft: 16, paddingTop: 12, paddingBottom: 12 },
  moreBody: { flex: 1, paddingLeft: 16, paddingTop: 12, maxHeight: 300 },
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
