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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';
import { notifyError } from '@/utils/feedback';
import { propertiesApi } from '@/services/api';
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
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key);
  const [metroSel, setMetroSel] = useState<string[]>([]);
  const [metroDraft, setMetroDraft] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);

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
    [keyword, status, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort],
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
  }, [keyword, status, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchCounts(), load({ nextPage: 1 })]);
  }, [fetchCounts, load]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await load({ nextPage: page + 1 });
  }, [load, loadingMore, page, totalPages]);

  const doDelete = (p: PropertyItem) => {
    const title = [p.room_number, p.building].filter(Boolean).join(' · ') || p.address || '该房源';
    Alert.alert('删除房源', `确定删除「${title}」吗？删除后不可恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/properties/${p.id}`);
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
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
      {/* 搜索 */}
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

      {/* 筛选：房型 / 价格 / 面积 / 排序（口径与 Web / 租客端一致） */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'bedrooms' && styles.filterChipActive]}
          activeOpacity={0.7}
          onPress={() => setActiveFilter(activeFilter === 'bedrooms' ? '' : 'bedrooms')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'bedrooms' && styles.filterChipTextActive]}>
            房型：{optionLabel(BEDROOM_OPTIONS, bedrooms, '不限房型')}
          </Text>
          <Ionicons name="chevron-down" size={13} color={activeFilter === 'bedrooms' ? colors.primary : colors.ink3} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'price' && styles.filterChipActive]}
          activeOpacity={0.7}
          onPress={() => setActiveFilter(activeFilter === 'price' ? '' : 'price')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'price' && styles.filterChipTextActive]}>
            价格：{priceRange === 'custom' ? '自定义' : optionLabel(PRICE_OPTIONS, priceRange, '不限价格')}
          </Text>
          <Ionicons name="chevron-down" size={13} color={activeFilter === 'price' ? colors.primary : colors.ink3} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'area' && styles.filterChipActive]}
          activeOpacity={0.7}
          onPress={() => setActiveFilter(activeFilter === 'area' ? '' : 'area')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'area' && styles.filterChipTextActive]}>
            面积：{areaRange === 'custom' ? '自定义' : optionLabel(AREA_OPTIONS, areaRange, '不限面积')}
          </Text>
          <Ionicons name="chevron-down" size={13} color={activeFilter === 'area' ? colors.primary : colors.ink3} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'location' && styles.filterChipActive]}
          activeOpacity={0.7}
          onPress={() => setActiveFilter(activeFilter === 'location' ? '' : 'location')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'location' && styles.filterChipTextActive]}>
            区域：{districtSel || metroSel.length ? '已选' : '不限'}
          </Text>
          <Ionicons name="chevron-down" size={13} color={activeFilter === 'location' ? colors.primary : colors.ink3} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'sort' && styles.filterChipActive]}
          activeOpacity={0.7}
          onPress={() => setActiveFilter(activeFilter === 'sort' ? '' : 'sort')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'sort' && styles.filterChipTextActive]}>
            排序：{optionLabel(SORT_OPTIONS, sort, '默认排序')}
          </Text>
          <Ionicons name="chevron-down" size={13} color={activeFilter === 'sort' ? colors.primary : colors.ink3} />
        </TouchableOpacity>
      </View>

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
            <>
              <View style={styles.optRow}>
                <TouchableOpacity
                  style={[styles.optChip, districtSel === null && styles.optChipActive]}
                  activeOpacity={0.7}
                  onPress={() => setDistrictSel(null)}
                >
                  <Text style={[styles.optChipText, districtSel === null && styles.optChipTextActive]}>不限</Text>
                </TouchableOpacity>
              </View>
              {AREA_GROUPS.map((g) => (
                <View key={g.cityKey}>
                  <Text style={styles.locGroupLabel}>{g.country} · {g.cityLabel}</Text>
                  <View style={styles.optRow}>
                    {g.children.map((d) => (
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
                </View>
              ))}
            </>
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
                <View style={styles.bannerIcon}>
                  <Ionicons name={type.icon} size={26} color={colors.primaryForeground} />
                </View>
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
                  {[p.room_number, p.building].filter(Boolean).join(' · ') || '未命名房源'}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },

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

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.08),
  },
  filterChipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  filterChipTextActive: { color: colors.primary, fontWeight: '600' },

  optRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
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
    marginHorizontal: 20,
    marginBottom: 12,
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
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 4,
  },
  locLineRow: { flexWrap: 'wrap' },
  locConfirmBtn: { backgroundColor: colors.primary },

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
  deleteBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: colors.radius.lg,
    backgroundColor: colors.alpha(colors.errorRgb, 0.1),
  },

  moreWrap: { paddingVertical: 16, alignItems: 'center' },
});