/**
 * 房源管理（管理端）
 * 原型：admin-mobile-properties.html
 * 区块：搜索 → 状态筛选 → 统计行（总/空置/已出租/维护中）→ 房源列表（管理 + 删除）
 * 数据源：/properties（分页 + 状态筛选 + 关键词）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Modal,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useResponsiveContainerStyle } from '@/theme/responsive';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import { propertiesApi, usersAdminApi } from '@/services/api';
import { publicApi, type PublicSchool } from '@/services/publicApi';
import { SCHOOL_RADIUS_OPTIONS } from '@/lib/publicSite';
import { AREA_GROUPS } from '@/data/locationArea';
import { METRO_LINES } from '@/data/locationMetro';

const PAGE_SIZE = 10;

interface PropertyItem {
  id: string;
  room_number?: string | null;
  building?: string | null;
  address?: string | null;
  property_type?: string | null;
  monthly_rent?: number;
  currency?: string;
  status?: string | null;
  size_sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnished?: boolean;
  photos?: unknown[] | null;
  project_name?: string | null;
  // 归属人（房源由哪位员工录入）：管理员可见全部，销售/经纪只看自己录的
  created_by?: string | null;
  creator_name?: string | null;
}

const TYPE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  apartment: { label: '公寓', icon: 'business-outline', color: colors.primary },
  condo: { label: '公寓', icon: 'business-outline', color: colors.primary },
  house: { label: '别墅', icon: 'home-outline', color: colors.success },
  commercial: { label: '商铺', icon: 'storefront-outline', color: colors.warning },
  office: { label: '写字楼', icon: 'briefcase-outline', color: colors.info },
};

const STATUS_META: Record<string, { label: string; color: string; rgb: string }> = {
  vacant: { label: '空置中', color: colors.warning, rgb: colors.warningRgb },
  rented: { label: '已出租', color: colors.success, rgb: colors.successRgb },
  reserved: { label: '已预订', color: colors.primary, rgb: colors.primaryRgb },
  maintenance: { label: '维护中', color: colors.info, rgb: colors.infoRgb },
  renewing: { label: '续约中', color: colors.primary, rgb: colors.primaryRgb },
};

// 状态筛选（口径与租客端 ListingsScreen 一致：含已预订）
const CHIPS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'vacant', label: '空置' },
  { key: 'rented', label: '已出租' },
  { key: 'reserved', label: '已预订' },
  { key: 'maintenance', label: '维护中' },
];

// 选筛选项（取值口径与 Web / 租客端一致）
const BEDROOM_OPTIONS: { key: string; label: string }[] = [
  { key: '', label: '不限房型' },
  { key: '0', label: '单间' },
  { key: '1', label: '1室' },
  { key: '2', label: '2室' },
  { key: '3', label: '3室及以上' },
];
// 价格区间（月租，THB，万 → ×10000）—— 对齐租客端 PRICE_RANGES
const PRICE_OPTIONS: { key: string; label: string; min: number; max: number }[] = [
  { key: '', label: '不限价格', min: 0, max: Infinity },
  { key: 'u3', label: '≤3万', min: 0, max: 30000 },
  { key: '3-5', label: '3-5万', min: 30000, max: 50000 },
  { key: '5-8', label: '5-8万', min: 50000, max: 80000 },
  { key: 'g8', label: '≥8万', min: 80000, max: Infinity },
  { key: 'custom', label: '自定义', min: 0, max: Infinity },
];
// 面积区间（㎡）—— 对齐租客端 AREA_PRESETS
const AREA_OPTIONS: { key: string; label: string; min: number; max: number }[] = [
  { key: '', label: '不限面积', min: 0, max: Infinity },
  { key: 'u50', label: '≤50㎡', min: 0, max: 50 },
  { key: '50-100', label: '50-100㎡', min: 50, max: 100 },
  { key: '100-150', label: '100-150㎡', min: 100, max: 150 },
  { key: '150-200', label: '150-200㎡', min: 150, max: 200 },
  { key: 'g200', label: '≥200㎡', min: 200, max: Infinity },
  { key: 'custom', label: '自定义', min: 0, max: Infinity },
];
// 排序（对齐租客端 SORT_OPTIONS）
const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'default', label: '默认排序' },
  { key: 'latest', label: '最新发布' },
  { key: 'price_asc', label: '价格从低到高' },
  { key: 'price_desc', label: '价格从高到低' },
  { key: 'area_desc', label: '面积从大到小' },
];

const optionLabel = (opts: { key: string; label: string }[], key: string, fallback: string) =>
  opts.find((o) => o.key === key)?.label ?? fallback;

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

// 取房源照片首图 URL（兼容字符串与 {url|path} 对象两种形态），无则返回空
const photoUrlOf = (photos?: unknown[] | null): string => {
  if (!Array.isArray(photos) || photos.length === 0) return '';
  const first = photos[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const o = first as { url?: unknown; path?: unknown };
    return typeof o.url === 'string' ? o.url : typeof o.path === 'string' ? o.path : '';
  }
  return '';
};

// 房源标题：优先「小区名 · 房号」（与 C 端一致），缺小区名时回退房号·楼栋
const adminTitle = (p: PropertyItem) =>
  p.project_name ? `${p.project_name} · ${p.room_number ?? ''}`.trim() : ([p.room_number, p.building].filter(Boolean).join(' · ') || p.address || '未命名房源');

// 命中区域/地铁关键词：房源地址/标题/房号/城市/区域任一包含即匹配（对齐租客端 matchLocation）
const matchLocation = (item: any, kws: string[]): boolean =>
  kws.some((k) =>
    [item.address, item.title, item.room_number, item.city, item.district, item.area]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase())
      .some((v) => v.includes(k))
  );

const allDistricts = AREA_GROUPS.flatMap((g) => g.children);

export default function AdminPropertiesScreen() {
  const respContainer = useResponsiveContainerStyle();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PropertyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  // 扩展筛选（口径与 Web / 租客端一致）
  const [bedrooms, setBedrooms] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [priceCustomMin, setPriceCustomMin] = useState('');
  const [priceCustomMax, setPriceCustomMax] = useState('');
  const [areaRange, setAreaRange] = useState('');
  const [areaCustomMin, setAreaCustomMin] = useState('');
  const [areaCustomMax, setAreaCustomMax] = useState('');
  const [sort, setSort] = useState('default');
  // 位置筛选（对齐租客端「区域 | 地铁」）
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area');
  const [districtSel, setDistrictSel] = useState<string | null>(null);
  // 区域面板：国家 → 省市 → 城区 三级下钻。左栏只列国家，右栏默认是该国家的省市列表，
  // 点某个省市后右栏才换成它的城区 chips（顶部「返回」回到省市列表）。
  // 此前国家与省市平铺在同一列里，用户要在混杂的长列表中找城市。
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country);
  const [areaDrill, setAreaDrill] = useState<string>(''); // 已下钻的省市 cityKey，空 = 停在省市列表
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key);
  const [metroSel, setMetroSel] = useState<string[]>([]);
  const [metroDraft, setMetroDraft] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState('');
  // C 端维度：学校（空间筛选，与 C 端找房口径一致）
  const [schoolId, setSchoolId] = useState('');
  const [schoolKm, setSchoolKm] = useState<number>(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolKw, setSchoolKw] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);
  // 「指派归属人」弹层：员工列表 + 搜索 + 当前正在指派的房源
  const [assignTarget, setAssignTarget] = useState<PropertyItem | null>(null);
  const [staff, setStaff] = useState<{ id: string; full_name?: string; role?: string }[]>([]);
  const [staffKw, setStaffKw] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // 状态计数与列表共用同一批查询（统计行数字与列表口径一致）
  const fetchCounts = useCallback(async () => {
    const res = await Promise.allSettled(
      ['vacant', 'rented', 'maintenance'].map((s) =>
        propertiesApi.list({ status: s, page: 1, page_size: 1 }),
      ),
    );
    const next: Record<string, number> = {};
    ['vacant', 'rented', 'maintenance'].forEach((s, i) => {
      const r = res[i];
      if (r.status === 'fulfilled') {
        const d = (r.value as any)?.data ?? {};
        next[s] = typeof d.total === 'number' ? d.total : 0;
      } else {
        next[s] = 0;
      }
    });
    setCounts(next);
  }, []);

  const load = useCallback(
    async (options?: { nextPage?: number; keywordOverride?: string }) => {
      const kw = options?.keywordOverride ?? keyword;
      const targetPage = options?.nextPage ?? 1;
      try {
        const params: Record<string, unknown> = {
          page: targetPage,
          page_size: PAGE_SIZE,
        };
        if (sort === 'latest') params.sort = 'latest';
        if (kw.trim()) params.q = kw.trim();
        if (status) params.status = status;

        // C 端维度：学校 + 半径（空间筛选，与 C 端找房口径一致）
        if (schoolId) {
          params.school_id = schoolId;
          params.school_radius_km = schoolKm;
        }

        // 房型：单间=0,0；1/2 精确；3+ 则 bedrooms_min=3
        if (bedrooms !== '') {
          if (bedrooms === '3') params.bedrooms_min = 3;
          else {
            const n = Number(bedrooms);
            params.bedrooms_min = n;
            params.bedrooms_max = n;
          }
        }
        // 价格区间（对齐租客端：预设快捷区间或自定义，万 → ×10000 THB）
        if (priceRange) {
          if (priceRange === 'custom') {
            const mn = (Number(priceCustomMin) || 0) * 10000;
            const mx = (Number(priceCustomMax) || 0) * 10000;
            if (priceCustomMin !== '') params.price_min = mn;
            if (priceCustomMax !== '') params.price_max = mx;
          } else {
            const preset = PRICE_OPTIONS.find((o) => o.key === priceRange);
            if (preset) {
              if (preset.min > 0) params.price_min = preset.min;
              if (Number.isFinite(preset.max)) params.price_max = preset.max;
            }
          }
        }
        // 面积区间（对齐租客端：预设快捷区间或自定义 ㎡）
        if (areaRange) {
          if (areaRange === 'custom') {
            const mn = Number(areaCustomMin);
            const mx = Number(areaCustomMax);
            if (areaCustomMin !== '' && !Number.isNaN(mn)) params.area_min = mn;
            if (areaCustomMax !== '' && !Number.isNaN(mx)) params.area_max = mx;
          } else {
            const preset = AREA_OPTIONS.find((o) => o.key === areaRange);
            if (preset) {
              if (preset.min > 0) params.area_min = preset.min;
              if (Number.isFinite(preset.max)) params.area_max = preset.max;
            }
          }
        }

        const res = await propertiesApi.list(params);
        const d = (res as any)?.data ?? {};
        const list = (Array.isArray(d) ? d : d.items ?? []) as PropertyItem[];
        // latest 由后端排序；价格/面积排序后端可能不支持，客户端对已加载 items 兜底
        setItems((prev) => {
          const next = targetPage === 1 ? list : [...prev, ...list];
          if (sort === 'price_asc') next.sort((a, b) => (a.monthly_rent ?? 0) - (b.monthly_rent ?? 0));
          else if (sort === 'price_desc') next.sort((a, b) => (b.monthly_rent ?? 0) - (a.monthly_rent ?? 0));
          else if (sort === 'area_desc') next.sort((a, b) => (b.size_sqm ?? 0) - (a.size_sqm ?? 0));
          return next;
        });
        setTotal(typeof d.total === 'number' ? d.total : list.length);
        setTotalPages(typeof d.total_pages === 'number' ? d.total_pages : 1);
        setPage(targetPage);
      } catch (e: any) {
        if (targetPage === 1) {
          setItems([]);
          setTotal(0);
          setTotalPages(1);
        }
        notifyError('加载房源失败', e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyword, status, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort, schoolId, schoolKm],
  );

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      fetchCounts();
      load();
      return;
    }
    const timer = setTimeout(() => {
      fetchCounts();
      load({ nextPage: 1 });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, status, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort, schoolId, schoolKm]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchCounts(), load({ nextPage: 1 })]);
  }, [fetchCounts, load]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await load({ nextPage: page + 1 });
  }, [load, loadingMore, page, totalPages]);

  // 从「新增 / 编辑房源」页返回时刷新：该屏原本只在 mount 时加载，
  // 新建/编辑/指派后回到列表看到的还是旧数据。用 useIsFocused 追踪焦点变化
  // （而不是 addListener('focus')：后者在首帧就会触发，导致挂载时重复请求）。
  const isFocused = useIsFocused();
  const wasFocused = useRef(isFocused);
  useEffect(() => {
    if (isFocused && !wasFocused.current) {
      fetchCounts();
      load({ nextPage: 1 });
    }
    wasFocused.current = isFocused;
  }, [isFocused, fetchCounts, load]);

  // ===== 指派归属人（管理员专用）=====
  const loadAssignStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await usersAdminApi.list({ page_size: 100 });
      const list = ((res as any)?.data?.items ?? []) as { id: string; full_name?: string; role?: string }[];
      // 房源归属只能是内部员工：管理员 / 销售 / 经纪（业主、租客不参与）
      setStaff(list.filter((u) => u.role === 'agent' || u.role === 'employee'));
    } catch (e: any) {
      notifyError('加载员工列表失败', e);
      setStaff([]);
    } finally {
      setStaffLoading(false);
    }
  }, []);

  const openAssign = useCallback(
    (p: PropertyItem) => {
      setAssignTarget(p);
      setStaffKw('');
      loadAssignStaff();
    },
    [loadAssignStaff],
  );

  const closeAssign = useCallback(() => {
    setAssignTarget(null);
    setStaff([]);
    setStaffKw('');
  }, []);

  const doAssign = useCallback(
    async (employeeId: string | null) => {
      if (!assignTarget || assigning) return;
      setAssigning(true);
      try {
        await propertiesApi.assign(assignTarget.id, employeeId);
        const name = employeeId ? staff.find((s) => s.id === employeeId)?.full_name ?? null : null;
        setItems((prev) =>
          prev.map((it) =>
            it.id === assignTarget.id ? { ...it, created_by: employeeId, creator_name: name } : it,
          ),
        );
        notify(employeeId ? '已指派归属人' : '已收回归属');
        closeAssign();
        fetchCounts();
      } catch (e: any) {
        notifyError('指派失败', e);
      } finally {
        setAssigning(false);
      }
    },
    [assignTarget, assigning, staff, closeAssign, fetchCounts],
  );

  const filteredStaff = useMemo(() => {
    const kw = staffKw.trim().toLowerCase();
    if (!kw) return staff;
    return staff.filter((s) => (s.full_name ?? '').toLowerCase().includes(kw));
  }, [staff, staffKw]);

  const doDelete = (p: PropertyItem) => {
    const title = [p.room_number, p.building].filter(Boolean).join(' · ') || p.address || '该房源';
    Alert.alert('删除房源', `确定删除「${title}」吗？删除后不可恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await propertiesApi.remove(p.id);
            setItems((prev) => prev.filter((it) => it.id !== p.id));
            setTotal((t) => Math.max(0, t - 1));
            fetchCounts();
          } catch (e: any) {
            Alert.alert('删除失败', e?.response?.data?.detail || '请稍后重试');
          }
        },
      },
    ]);
  };

  // 区域面板左栏：国家清单（按 AREA_GROUPS 出现顺序去重，保持「泰国 → 越南 → …」的业务顺序）
  const countryList = useMemo(() => Array.from(new Set(AREA_GROUPS.map((g) => g.country))), []);
  // 左栏宽度按最长国家名动态推导（避免留白）：最长字幕数×字号13 + 条目横向padding 6×2 + 边框hairline + 2缓冲
  const areaLeftWidth = useMemo(() => {
    const maxChars = Math.max(...countryList.map((c) => [...c].length));
    return maxChars * 13 + 6 * 2 + 2;
  }, [countryList]);
  // 右栏未下钻时的数据源：当前国家下的省市
  const countryGroups = useMemo(
    () => AREA_GROUPS.filter((g) => g.country === areaCountry),
    [areaCountry],
  );
  // 右栏已下钻时的数据源：该省市的城区；未下钻时为 undefined，右栏才走省市列表分支
  const activeAreaGroup = useMemo(
    () => AREA_GROUPS.find((g) => g.cityKey === areaDrill),
    [areaDrill],
  );

  // 切换国家：右栏回到该国家的省市列表（否则会停在上一个国家已下钻的省市上）
  const pickAreaCountry = (country: string) => {
    setAreaCountry(country);
    setAreaDrill('');
  };

  // 打开区域面板时回显：已选城区则直接下钻到它所在的省市，否则停在省市列表，
  // 用户不必再从长列表里找回已选城市
  const echoAreaDrill = () => {
    if (!districtSel) return;
    const g = AREA_GROUPS.find((x) => x.children.some((d) => d.key === districtSel));
    if (g) {
      setAreaCountry(g.country);
      setAreaDrill(g.cityKey);
    }
  };

  // 位置筛选（客户端关键词过滤，对齐租客端：只作用于已加载 items）
  const activeLocationKw = useMemo(() => {
    if (districtSel) {
      const node = allDistricts.find((d) => d.key === districtSel);
      return node ? node.kws : [];
    }
    if (metroSel.length) {
      const stations = METRO_LINES.flatMap((l) => l.stations);
      return stations.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws);
    }
    return [];
  }, [districtSel, metroSel]);

  const displayItems = useMemo(() => {
    if (!activeLocationKw.length) return items;
    return items.filter((it) => matchLocation(it, activeLocationKw));
  }, [items, activeLocationKw]);

  // 学校清单只为筛选器备选（公开接口，匿名可读）
  useEffect(() => {
    publicApi
      .schools({ page_size: 100 })
      .then((res: any) => setSchools(res?.data?.items ?? []))
      .catch(() => setSchools([]));
  }, []);

  const filteredSchools = useMemo(() => {
    const kw = schoolKw.trim().toLowerCase();
    if (!kw) return schools;
    return schools.filter(
      (s) =>
        (s.name ?? '').toLowerCase().includes(kw) ||
        (s.name_en ?? '').toLowerCase().includes(kw),
    );
  }, [schools, schoolKw]);

  // 单行筛选栏 Tab 展示数据（对齐 C 端：未选中时只显示维度名，选中后显示当前取值）
  const filterTabs = useMemo(() => {
    const districtLabel = allDistricts.find((d) => d.key === districtSel)?.label;
    return [
      {
        key: 'location',
        label: districtLabel || (metroSel.length ? `地铁 ${metroSel.length}` : '区域'),
        active: !!(districtSel || metroSel.length),
      },
      {
        key: 'price',
        label: priceRange
          ? priceRange === 'custom'
            ? '自定义'
            : optionLabel(PRICE_OPTIONS, priceRange, '价格')
          : '价格',
        active: !!priceRange,
      },
      {
        key: 'bedrooms',
        label: bedrooms !== '' ? optionLabel(BEDROOM_OPTIONS, bedrooms, '房型') : '房型',
        active: bedrooms !== '',
      },
      {
        key: 'area',
        label: areaRange
          ? areaRange === 'custom'
            ? '自定义'
            : optionLabel(AREA_OPTIONS, areaRange, '面积')
          : '面积',
        active: !!areaRange,
      },
      {
        key: 'school',
        label: schoolId ? '已选学校' : '学校',
        active: !!schoolId,
      },
      {
        key: 'sort',
        label: sort !== 'default' ? optionLabel(SORT_OPTIONS, sort, '排序') : '排序',
        active: sort !== 'default',
      },
    ] as { key: string; label: string; active: boolean }[];
  }, [districtSel, metroSel.length, priceRange, bedrooms, areaRange, schoolId, sort]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }, respContainer]}
      showsVerticalScrollIndicator={false}
      onScroll={({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 80) onLoadMore();
      }}
      scrollEventThrottle={100}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      {/* 搜索 + 新增房源 */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={colors.ink3} />
          <TextInput
            style={styles.searchInput}
            value={keyword}
            onChangeText={setKeyword}
            placeholder="搜索房源名称/地址"
            placeholderTextColor={colors.ink3}
            returnKeyType="search"
          />
          {keyword ? (
            <TouchableOpacity
              onPress={() => setKeyword('')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="清除搜索"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.ink3} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('PropertyEdit', { mode: 'create' })}
          accessibilityRole="button"
          accessibilityLabel="新增房源"
        >
          <Ionicons name="add" size={16} color={colors.primaryForeground} />
          <Text style={styles.addBtnText}>新增</Text>
        </TouchableOpacity>
      </View>

      {/* 状态筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {CHIPS.map((c) => (
          <TouchableOpacity
            key={c.key || 'all'}
            style={[styles.chip, status === c.key && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => setStatus(c.key)}
          >
            <Text style={[styles.chipText, status === c.key && styles.chipTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 单行筛选栏（对齐 C 端：宽度够时等分铺满，不够时横向滚动；点击从顶部下拉面板展开） */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterTabsRow}
        contentContainerStyle={styles.filterTabsContent}
      >
        {filterTabs.map((tb) => (
          <TouchableOpacity
            key={tb.key}
            style={[
              styles.filterTab,
              activeFilter === tb.key && styles.filterTabOpen,
              tb.active && styles.filterTabActive,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              if (activeFilter === tb.key) {
                setActiveFilter('');
                return;
              }
              // 打开区域面板时回显已选城区所在的省市
              if (tb.key === 'location') echoAreaDrill();
              setActiveFilter(tb.key);
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.filterTabLabel,
                (activeFilter === tb.key || tb.active) && styles.filterTabLabelActive,
              ]}
            >
              {tb.label}
            </Text>
            <Ionicons
              name={activeFilter === tb.key ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={tb.active || activeFilter === tb.key ? colors.primary : colors.ink3}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 顶部下拉面板（对齐 C 端：紧贴 Tab 栏下方、通栏直角带投影；未展开时 display:none） */}
      <View style={[styles.dropPanel, activeFilter === '' && styles.dropPanelHidden]}>
      {/* 展开的筛选项 */}
      {activeFilter === 'bedrooms' && (
        <View style={styles.optRow}>
          {BEDROOM_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.key || 'any'}
              style={[styles.optChip, bedrooms === o.key && styles.optChipActive]}
              activeOpacity={0.7}
              onPress={() => setBedrooms(o.key)}
            >
              <Text style={[styles.optChipText, bedrooms === o.key && styles.optChipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {activeFilter === 'price' && (
        <View style={styles.optRow}>
          {PRICE_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.key || 'any'}
              style={[styles.optChip, priceRange === o.key && styles.optChipActive]}
              activeOpacity={0.7}
              onPress={() => setPriceRange(o.key)}
            >
              <Text style={[styles.optChipText, priceRange === o.key && styles.optChipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {activeFilter === 'price' && priceRange === 'custom' && (
        <View style={styles.customRow}>
          <Text style={styles.customLabel}>最低</Text>
          <TextInput
            style={styles.customInput}
            value={priceCustomMin}
            onChangeText={setPriceCustomMin}
            keyboardType="numeric"
            placeholder="如 3"
            placeholderTextColor={colors.ink3}
          />
          <Text style={styles.customSep}>-</Text>
          <Text style={styles.customLabel}>最高</Text>
          <TextInput
            style={styles.customInput}
            value={priceCustomMax}
            onChangeText={setPriceCustomMax}
            keyboardType="numeric"
            placeholder="如 8"
            placeholderTextColor={colors.ink3}
          />
          <Text style={styles.customLabel}>万/月</Text>
        </View>
      )}

      {activeFilter === 'area' && (
        <View style={styles.optRow}>
          {AREA_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.key || 'any'}
              style={[styles.optChip, areaRange === o.key && styles.optChipActive]}
              activeOpacity={0.7}
              onPress={() => setAreaRange(o.key)}
            >
              <Text style={[styles.optChipText, areaRange === o.key && styles.optChipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {activeFilter === 'area' && areaRange === 'custom' && (
        <View style={styles.customRow}>
          <Text style={styles.customLabel}>最小</Text>
          <TextInput
            style={styles.customInput}
            value={areaCustomMin}
            onChangeText={setAreaCustomMin}
            keyboardType="numeric"
            placeholder="如 60"
            placeholderTextColor={colors.ink3}
          />
          <Text style={styles.customSep}>-</Text>
          <Text style={styles.customLabel}>最大</Text>
          <TextInput
            style={styles.customInput}
            value={areaCustomMax}
            onChangeText={setAreaCustomMax}
            keyboardType="numeric"
            placeholder="如 120"
            placeholderTextColor={colors.ink3}
          />
        </View>
      )}

      {activeFilter === 'sort' && (
        <View style={styles.optRow}>
          {SORT_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={[styles.optChip, sort === o.key && styles.optChipActive]}
              activeOpacity={0.7}
              onPress={() => setSort(o.key)}
            >
              <Text style={[styles.optChipText, sort === o.key && styles.optChipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 位置筛选（对齐租客端「区域 | 地铁」） */}
      {activeFilter === 'location' && (
        <View>
          <View style={styles.customRow}>
            {(['area', 'metro'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.locTabChip, locTab === t && styles.locTabChipActive]}
                activeOpacity={0.7}
                onPress={() => {
                  if (t === 'metro') setMetroDraft(metroSel);
                  else echoAreaDrill();
                  setLocTab(t);
                }}
              >
                <Text style={[styles.locTabText, locTab === t && styles.locTabTextActive]}>
                  {t === 'area' ? '区域' : '地铁'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {locTab === 'area' ? (
            // 国家 → 省市 → 城区 三级下钻：左栏只列国家，右栏先是该国家的省市列表，
            // 点省市后右栏换成它的城区 chips（顶部「返回」回到省市列表）。
            // 此前把国家/省市平铺在同一列，用户要在混杂的长列表里找城市。
            <View style={styles.locArea}>
              <ScrollView style={[styles.locAreaCol, { width: areaLeftWidth, flexGrow: 0, flexShrink: 0 }]} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {countryList.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.locAreaColItem, areaCountry === c && styles.locAreaColItemActive]}
                    activeOpacity={0.7}
                    onPress={() => pickAreaCountry(c)}
                  >
                    <Text style={[styles.locAreaColText, areaCountry === c && styles.locAreaColTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView style={styles.locAreaBody} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {activeAreaGroup ? (
                  <>
                    <View style={styles.locAreaHead}>
                      <TouchableOpacity
                        style={styles.locAreaBack}
                        activeOpacity={0.7}
                        onPress={() => setAreaDrill('')}
                      >
                        <Ionicons name="chevron-back" size={12} color={colors.ink3} />
                        <Text style={styles.locAreaBackText}>{areaCountry}</Text>
                      </TouchableOpacity>
                      <Text style={styles.locAreaHeadTitle}>{activeAreaGroup.cityLabel}</Text>
                    </View>
                    <View style={styles.locAreaChips}>
                      <TouchableOpacity
                        style={[styles.optChip, districtSel === null && styles.optChipActive]}
                        activeOpacity={0.7}
                        onPress={() => setDistrictSel(null)}
                      >
                        <Text style={[styles.optChipText, districtSel === null && styles.optChipTextActive]}>不限</Text>
                      </TouchableOpacity>
                      {activeAreaGroup.children.map((d) => (
                        <TouchableOpacity
                          key={d.key}
                          style={[styles.optChip, districtSel === d.key && styles.optChipActive]}
                          activeOpacity={0.7}
                          onPress={() => setDistrictSel(d.key)}
                        >
                          <Text style={[styles.optChipText, districtSel === d.key && styles.optChipTextActive]}>{d.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.locAreaHeadTitle}>{areaCountry}</Text>
                    <View style={styles.locAreaChips}>
                      {countryGroups.map((g) => (
                        <TouchableOpacity
                          key={g.cityKey}
                          style={[styles.optChip, areaDrill === g.cityKey && styles.optChipActive]}
                          activeOpacity={0.7}
                          onPress={() => setAreaDrill(g.cityKey)}
                        >
                          <Text style={[styles.optChipText, areaDrill === g.cityKey && styles.optChipTextActive]}>
                            {g.cityLabel}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          ) : (
            <>
              <Text style={styles.locGroupLabel}>线路</Text>
              <View style={[styles.optRow, styles.locLineRow]}>
                {METRO_LINES.map((l) => (
                  <TouchableOpacity
                    key={l.key}
                    style={[styles.optChip, metroLine === l.key && styles.optChipActive]}
                    activeOpacity={0.7}
                    onPress={() => setMetroLine(l.key)}
                  >
                    <Text style={[styles.optChipText, metroLine === l.key && styles.optChipTextActive]}>
                      {l.cityLabel} · {l.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.locGroupLabel}>
                站点{metroDraft.length ? ` · 已选 ${metroDraft.length}` : ''}
              </Text>
              <View style={styles.optRow}>
                {METRO_LINES.find((l) => l.key === metroLine)?.stations.map((s) => (
                  <TouchableOpacity
                    key={s.name}
                    style={[styles.optChip, metroDraft.includes(s.name) && styles.optChipActive]}
                    activeOpacity={0.7}
                    onPress={() =>
                      setMetroDraft((d) => (d.includes(s.name) ? d.filter((x) => x !== s.name) : [...d, s.name]))
                    }
                  >
                    <Text style={[styles.optChipText, metroDraft.includes(s.name) && styles.optChipTextActive]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customRow}>
                <TouchableOpacity style={styles.optChip} activeOpacity={0.7} onPress={() => setMetroDraft([])}>
                  <Text style={styles.optChipText}>清除</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.optChip, styles.locConfirmBtn]} activeOpacity={0.7} onPress={() => setMetroSel(metroDraft)}>
                  <Text style={styles.optChipText}>确定</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* 学校（C 端维度：按学校 + 半径找房） */}
      {activeFilter === 'school' && (
        <View style={styles.schoolPanel}>
          <Text style={styles.locGroupLabel}>距离</Text>
          <View style={styles.optRow}>
            {SCHOOL_RADIUS_OPTIONS.map((kmv) => (
              <TouchableOpacity
                key={kmv}
                style={[styles.optChip, schoolKm === kmv && styles.optChipActive]}
                activeOpacity={0.7}
                onPress={() => setSchoolKm(kmv)}
              >
                <Text style={[styles.optChipText, schoolKm === kmv && styles.optChipTextActive]}>
                  {kmv}km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.schoolSearch}>
            <Ionicons name="search" size={14} color={colors.ink3} />
            <TextInput
              style={styles.schoolSearchInput}
              value={schoolKw}
              onChangeText={setSchoolKw}
              placeholder="搜索学校名称"
              placeholderTextColor={colors.ink3}
            />
          </View>
          <ScrollView style={styles.schoolList} keyboardShouldPersistTaps="handled">
            {filteredSchools.length === 0 ? (
              <Text style={styles.schoolEmpty}>未找到相关学校</Text>
            ) : (
              filteredSchools.map((s) => {
                const active = schoolId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSchoolId(s.id);
                      setActiveFilter('');
                    }}
                    style={styles.schoolRow}
                  >
                    <Text style={[styles.schoolRowName, active && styles.schoolRowActive]} numberOfLines={1}>
                      {s.name || s.name_en}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setSchoolId('');
              setActiveFilter('');
            }}
            style={styles.schoolReset}
          >
            <Text style={styles.schoolResetText}>不限（清除学校）</Text>
          </TouchableOpacity>
        </View>
      )}
      </View>

      {/* 统计行 */}
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>总房源</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{total}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>空置</Text>
          <Text style={[styles.statValue, { color: colors.warning }]}>{counts.vacant ?? 0}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>已出租</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>{counts.rented ?? 0}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>维护中</Text>
          <Text style={[styles.statValue, { color: colors.info }]}>{counts.maintenance ?? 0}</Text>
        </View>
      </View>

      {/* 房源列表 */}
      <Text style={styles.sectionTitle}>房源列表</Text>
      {displayItems.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title={keyword || activeLocationKw.length ? '没有找到房源' : '暂无房源'}
          sub={keyword || activeLocationKw.length ? '换个名称、地址或筛选条件试试' : '新增房源后会展示在这里'}
        />
      ) : (
        displayItems.map((p) => {
          const type = TYPE_META[p.property_type ?? 'apartment'] ?? TYPE_META.apartment;
          const meta = STATUS_META[p.status ?? 'vacant'] ?? {
            label: p.status ?? '未知',
            color: colors.ink2,
            rgb: colors.primaryRgb,
          };
          const spec = [
            p.size_sqm ? `${p.size_sqm}㎡` : null,
            p.bedrooms ? `${p.bedrooms} 卧` : null,
            p.bathrooms ? `${p.bathrooms} 浴` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={p.id} style={styles.card}>
              <View style={styles.banner}>
                {photoUrlOf(p.photos) ? (
                  <Image source={{ uri: photoUrlOf(p.photos) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={styles.bannerIcon}>
                    <Ionicons name={type.icon} size={26} color={colors.primaryForeground} />
                  </View>
                )}
                <View style={[styles.typeBadge, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.typeBadgeText, { color: type.color }]}>{type.label}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: colors.alpha(meta.rgb, 0.14) }]}>
                  <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.cardBody}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('PropertyEdit', { id: p.id })}
              >
                <Text style={styles.name} numberOfLines={1}>
                  {adminTitle(p)}
                </Text>
                <View style={styles.addrRow}>
                  <Ionicons name="location-outline" size={13} color={colors.ink3} />
                  <Text style={styles.addr} numberOfLines={1}>{p.address || '暂无地址'}</Text>
                </View>
                {!!spec && <Text style={styles.spec}>{spec}</Text>}
                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {symOf(p.currency)}
                    {Number(p.monthly_rent || 0).toLocaleString()}
                    <Text style={styles.priceUnit}> /月</Text>
                  </Text>
                </View>
                {/* 归属人：历史房源 created_by 为空，仅管理员可见并可由管理员指派 */}
                <View style={styles.ownerRow}>
                  <Ionicons name="person-outline" size={12} color={colors.ink3} />
                  <Text
                    style={[styles.ownerText, !p.creator_name && styles.ownerTextEmpty]}
                    numberOfLines={1}
                  >
                    {p.creator_name ?? '未指派'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.cardFoot}>
                <TouchableOpacity
                  style={styles.manageBtn}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('AdminPropertyDetail', { id: p.id })}
                >
                  <Text style={styles.manageText}>管理</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.assignBtn}
                  activeOpacity={0.7}
                  onPress={() => openAssign(p)}
                  accessibilityRole="button"
                  accessibilityLabel="指派归属人"
                >
                  <Ionicons name="person-add-outline" size={15} color={colors.primary} />
                  <Text style={styles.assignText}>指派</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  activeOpacity={0.7}
                  onPress={() => doDelete(p)}
                  accessibilityRole="button"
                  accessibilityLabel="删除房源"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {loadingMore && (
        <View style={styles.moreWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* 指派归属人：选中内部员工（销售/经纪/管理员）后，该房源即归其名下维护 */}
      <Modal visible={!!assignTarget} transparent animationType="fade" onRequestClose={closeAssign}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>指派归属人</Text>
              <TouchableOpacity
                onPress={closeAssign}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="关闭"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color={colors.ink3} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub} numberOfLines={1}>
              {assignTarget ? adminTitle(assignTarget) : ''}
            </Text>

            <View style={styles.modalSearch}>
              <Ionicons name="search" size={15} color={colors.ink3} />
              <TextInput
                style={styles.modalSearchInput}
                value={staffKw}
                onChangeText={setStaffKw}
                placeholder="搜索员工姓名"
                placeholderTextColor={colors.ink3}
              />
            </View>

            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {staffLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : filteredStaff.length === 0 ? (
                <Text style={styles.modalEmpty}>未找到可指派的员工</Text>
              ) : (
                filteredStaff.map((s) => {
                  const active = assignTarget?.created_by === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.modalItem}
                      activeOpacity={0.7}
                      disabled={assigning}
                      onPress={() => doAssign(s.id)}
                    >
                      <View style={styles.modalItemBody}>
                        <Text style={styles.modalItemTitle} numberOfLines={1}>
                          {s.full_name || '未命名员工'}
                        </Text>
                        <Text style={styles.modalItemSub}>
                          {s.role === 'employee' ? '经纪' : '销售'}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalClear}
              activeOpacity={0.7}
              disabled={assigning || !assignTarget?.created_by}
              onPress={() => doAssign(null)}
            >
              <Text
                style={[styles.modalClearText, !assignTarget?.created_by && styles.modalClearTextDisabled]}
              >
                收回归属（仅管理员可见）
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: colors.primaryForeground },

  chipScroll: { flexGrow: 0, marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  // 贝壳式单行 Tab 筛选栏 + 顶部下拉面板（视觉与 C 端找房页一致）
  filterTabsRow: {
    flexGrow: 0,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    overflow: 'hidden',
  },
  filterTabsContent: { flexGrow: 1 },
  filterTab: {
    // flexGrow + flexShrink:0：宽度够时等分铺满，不够时按内容撑开并触发横向滚动
    flexGrow: 1,
    flexShrink: 0,
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
  filterTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  filterTabLabel: {
    fontSize: 13,
    color: colors.ink2,
    fontWeight: '500',
    maxWidth: 92,
  },
  filterTabLabelActive: { color: colors.primary, fontWeight: '600' },
  dropPanel: {
    marginBottom: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dropPanelHidden: { display: 'none' },

  /* 学校筛选项（C 端维度） */
  schoolPanel: { marginBottom: 4 },
  schoolSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  schoolSearchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },
  schoolList: { maxHeight: 220 },
  schoolEmpty: { fontSize: 13, color: colors.ink3, textAlign: 'center', paddingVertical: 16 },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  schoolRowName: { flex: 1, fontSize: 14, color: colors.ink, paddingRight: 12 },
  schoolRowActive: { color: colors.primary, fontWeight: '600' },
  schoolReset: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  schoolResetText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },

  optRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  optChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optChipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  optChipTextActive: { color: '#fff', fontWeight: '600' },

  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  customLabel: { fontSize: 13, color: colors.ink2 },
  customSep: { fontSize: 13, color: colors.ink3 },
  customInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    fontSize: 13,
    color: colors.ink,
  },

  // 位置筛选（区域 | 地铁）
  locTabChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  locTabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  locTabText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  locTabTextActive: { color: '#fff', fontWeight: '600' },
  locGroupLabel: {
    fontSize: 12,
    color: colors.ink3,
    marginBottom: 8,
    marginTop: 4,
  },
  locLineRow: { flexWrap: 'wrap' },
  locConfirmBtn: { backgroundColor: colors.primary },
  // 区域筛选两栏：左栏固定宽度只放国家，右栏放省市 / 城区（链家式两栏观感）
  locArea: {
    flexDirection: 'row',
    maxHeight: 260,
    marginBottom: 4,
  },
  locAreaCol: {
    // 按最长国家名「马来西亚」倒推：条目 padding 6×2 + 4×13 = 64px
    width: 66,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  locAreaColItem: { paddingVertical: 9, paddingHorizontal: 6 },
  locAreaColItemActive: { backgroundColor: colors.alpha(colors.primaryRgb, 0.08) },
  locAreaColText: { fontSize: 13, color: colors.ink2 },
  locAreaColTextActive: { color: colors.primary, fontWeight: '600' },
  locAreaBody: { flex: 1, paddingLeft: 12 },
  locAreaHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  locAreaBack: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  locAreaBackText: { fontSize: 12, color: colors.ink3 },
  locAreaHeadTitle: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
  locAreaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  statRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20 },
  statCell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: 11, color: colors.ink3 },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: -0.2,
  },

  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    overflow: 'hidden',
    ...colors.shadow.card,
  },
  banner: {
    height: 96,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerIcon: { opacity: 0.95 },
  typeBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadge: {
    position: 'absolute',
    right: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  cardBody: { padding: 14 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  addr: { flex: 1, fontSize: 12, color: colors.ink3 },
  spec: { fontSize: 12, color: colors.ink2, marginTop: 6 },
  priceRow: { marginTop: 8 },
  price: { fontSize: 16, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  priceUnit: { fontSize: 11, fontWeight: '500', color: colors.ink3 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  ownerText: { flex: 1, fontSize: 12, color: colors.ink2 },
  ownerTextEmpty: { color: colors.warning, fontWeight: '600' },

  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  manageBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
  },
  manageText: { fontSize: 13, fontWeight: '700', color: colors.primaryForeground },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  assignText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  deleteBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: colors.radius.lg,
    backgroundColor: colors.alpha(colors.errorRgb, 0.1),
  },

  moreWrap: { paddingVertical: 16, alignItems: 'center' },

  // 指派归属人弹层
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    maxHeight: '80%',
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  modalSub: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
  },
  modalSearchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },
  modalLoading: { paddingVertical: 28, alignItems: 'center' },
  modalEmpty: { paddingVertical: 28, textAlign: 'center', fontSize: 13, color: colors.ink3 },
  modalList: { marginTop: 8 },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalItemBody: { flex: 1, gap: 3, paddingRight: 12 },
  modalItemTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  modalItemSub: { fontSize: 12, color: colors.ink3 },
  modalClear: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  modalClearText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  modalClearTextDisabled: { color: colors.ink3, opacity: 0.5 },
});