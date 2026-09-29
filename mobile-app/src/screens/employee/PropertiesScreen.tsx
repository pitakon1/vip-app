/**
 * 房源台账：搜索 + 状态/排序筛选 + 结果统计 + 房源卡片（租客信息）+ 加载更多
 * 原型：employee-mobile-properties.html（房源浏览 · 台账）
 * 数据源：/properties（分页）、/leases?property_ids=（批量取整页租客姓名）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { filterStyles } from '@/theme/filterStyles';
import { useResponsiveContainerStyle } from '@/theme/responsive';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { leasesApi, propertiesApi } from '@/services/api';
import { publicApi, type PublicSchool } from '@/services/publicApi';
import { SCHOOL_RADIUS_OPTIONS } from '@/lib/publicSite';
import RegionPicker, { type RegionSelection } from '@/components/RegionPicker';
import { currencySymbol } from '@/lib/currency';
import { propertyCoverUrl } from '@/lib/property';

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
  video_url?: string | null;
  project_name?: string | null;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  vacant: { label: '空置', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.12) },
  rented: {
    label: '在租',
    color: colors.success,
    bg: colors.alpha(colors.successRgb, 0.12),
  },
  renewing: {
    label: '续约中',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
  maintenance: {
    label: '维修中',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
};

const TYPE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  apartment: { label: '公寓', icon: 'business-outline', color: colors.primary },
  condo: { label: '公寓', icon: 'business-outline', color: colors.primary },
  house: { label: '别墅', icon: 'home-outline', color: colors.success },
  commercial: { label: '商铺', icon: 'storefront-outline', color: colors.warning },
};

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'rented', label: '在租' },
  { key: 'vacant', label: '空置' },
  { key: 'maintenance', label: '维修' },
];

const SORTS: { key: string; label: string }[] = [
  { key: 'latest', label: '最新' },
  { key: 'price_asc', label: '租金从低到高' },
  { key: 'price_desc', label: '租金从高到低' },
  { key: 'area_desc', label: '面积从大到小' },
];

export default function PropertiesScreen() {
  const respContainer = useResponsiveContainerStyle();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PropertyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [vacantTotal, setVacantTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('latest');
  const [region, setRegion] = useState<RegionSelection | null>(null);
  // ---- C 端维度：学校 + 更多（价格/面积/卧室），与 C 端找房口径一致 ----
  const [schoolId, setSchoolId] = useState('');
  const [schoolKm, setSchoolKm] = useState<number>(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolKw, setSchoolKw] = useState('');
  // 链家式单行筛选栏：当前展开的下拉 Tab（'region' | 'price' | 'sort' | 'more' | null）
  const [openTab, setOpenTab] = useState<string | null>(null);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [bedsMin, setBedsMin] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);

  const fetchProperties = useCallback(
    async (targetPage: number, base: {
      kw: string;
      st: string;
      so: string;
      rg: RegionSelection | null;
      schoolId: string;
      schoolKm: number;
      priceMin: string;
      priceMax: string;
      areaMin: string;
      areaMax: string;
      bedsMin: string;
    }) => {
      const params: Record<string, unknown> = { page: targetPage, page_size: PAGE_SIZE, sort: base.so };
      if (base.kw.trim()) params.q = base.kw.trim();
      if (base.st) params.status = base.st;
      if (base.rg?.region) params.region = base.rg.region;
      if (base.rg?.city) params.city = base.rg.city;
      if (base.rg?.district) params.district = base.rg.district;
      // C 端维度：学校（空间筛选）/ 价格 / 面积 / 卧室
      if (base.schoolId) {
        params.school_id = base.schoolId;
        params.school_radius_km = base.schoolKm;
      }
      if (base.priceMin) params.price_min = Number(base.priceMin);
      if (base.priceMax) params.price_max = Number(base.priceMax);
      if (base.areaMin) params.area_min = Number(base.areaMin);
      if (base.areaMax) params.area_max = Number(base.areaMax);
      if (base.bedsMin) params.bedrooms_min = Number(base.bedsMin);
      const res = await propertiesApi.list(params);
      const data = res.data as {
        items?: PropertyItem[];
        total?: number;
        total_pages?: number;
      };
      const list = Array.isArray(data)
        ? (data as unknown as PropertyItem[])
        : (data?.items ?? []);
      return {
        list,
        total: data?.total ?? list.length,
        totalPages: data?.total_pages ?? 1,
      };
    },
    [],
  );

  const load = useCallback(
    async (options?: { nextPage?: number; keywordOverride?: string }) => {
      const kw = options?.keywordOverride ?? keyword;
      const targetPage = options?.nextPage ?? 1;
      try {
        const [propRes, vacantRes] = await Promise.allSettled([
          fetchProperties(targetPage, {
            kw,
            st: status,
            so: sort,
            rg: region,
            schoolId,
            schoolKm,
            priceMin,
            priceMax,
            areaMin,
            areaMax,
            bedsMin,
          }),
          propertiesApi.list({ status: 'vacant', page: 1, page_size: 1 }),
        ]);

        let pageItems: PropertyItem[] = [];
        if (propRes.status === 'fulfilled') {
          const { list, total: t, totalPages: tp } = propRes.value;
          pageItems = list;
          setTotal(t);
          setTotalPages(tp);
          setPage(targetPage);
          setItems((prev) => (targetPage === 1 ? list : [...prev, ...list]));
        } else if (targetPage === 1) {
          setItems([]);
          setTotal(0);
          setTotalPages(1);
        }

        if (vacantRes.status === 'fulfilled') {
          const vd = vacantRes.value.data as { total?: number };
          setVacantTotal(typeof vd?.total === 'number' ? vd.total : null);
        }

        // 在租房源补充租客姓名：一次批量取回整页房源的租约，再按房源聚合。
        // 此前逐条请求 /properties/{id}/leases，每页 10 个房源就是 10 次请求。
        const rentedIds = pageItems.filter((p) => p.status === 'rented').map((p) => p.id);
        if (rentedIds.length > 0) {
          const next: Record<string, string> = {};
          try {
            const res = await leasesApi.list({
              property_ids: rentedIds.join(','),
              page: 1,
              page_size: 100,
            });
            const leases = (res.data?.items ?? []) as {
              property_id?: string;
              tenant_name?: string | null;
              status?: string | null;
            }[];
            const byProperty: Record<string, typeof leases> = {};
            leases.forEach((l) => {
              if (!l.property_id) return;
              if (!byProperty[l.property_id]) byProperty[l.property_id] = [];
              byProperty[l.property_id].push(l);
            });
            Object.keys(byProperty).forEach((pid) => {
              const list = byProperty[pid];
              const primary = list.find((l) => l.status === 'active') ?? list[0];
              if (primary?.tenant_name) next[pid] = primary.tenant_name;
            });
          } catch {
            // 租客姓名属附加信息，批量失败不应影响房源列表本身展示
          }
          setTenantMap((prev) => (targetPage === 1 ? next : { ...prev, ...next }));
        } else if (targetPage === 1) {
          setTenantMap({});
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [fetchProperties, keyword, status, sort, region, schoolId, schoolKm, priceMin, priceMax, areaMin, areaMax, bedsMin],
  );

  // 学校清单只为筛选器备选（公开接口，匿名可读）
  useEffect(() => {
    publicApi
      .schools({ page_size: 100 })
      .then((res: any) => setSchools(res?.data?.items ?? []))
      .catch(() => setSchools([]));
  }, []);

  // 关键词 / 筛选变化后重新查询（关键词做 400ms 防抖）
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      load();
      return;
    }
    const timer = setTimeout(() => load({ nextPage: 1 }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, status, sort, region, schoolId, schoolKm, priceMin, priceMax, areaMin, areaMax, bedsMin]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ nextPage: 1 });
  }, [load]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await load({ nextPage: page + 1 });
  }, [load, loadingMore, page, totalPages]);

  // 租客行：有真实租客姓名则展示，无租约展示「无租约」
  const tenantLabel = useMemo(() => {
    return (propertyId: string) => {
      const name = tenantMap[propertyId];
      return name ? `租客: ${name}` : '无租约';
    };
  }, [tenantMap]);

  // ---- 链家式单行筛选栏（对齐租客端）：区域 / 价格 / 更多 / 排序 ----
  const tabRegionActive = !!region;
  const tabPriceActive = !!(priceMin || priceMax);
  const tabSortActive = sort !== 'latest';
  const tabMoreActive = !!(status !== '' || bedsMin || schoolId);
  const filterTabs = useMemo(
    () => [
      { key: 'region', label: '区域', active: tabRegionActive, badge: 0 },
      { key: 'price', label: '价格', active: tabPriceActive, badge: 0 },
      {
        key: 'more',
        label: '更多',
        active: tabMoreActive,
        badge: [status !== '' ? 1 : 0, bedsMin ? 1 : 0, schoolId ? 1 : 0].filter(Boolean).length,
      },
      { key: 'sort', label: '排序', active: tabSortActive, badge: 0 },
    ],
    [tabRegionActive, tabPriceActive, tabSortActive, tabMoreActive, status, bedsMin, schoolId, region],
  );
  const toggleTab = (key: string) => setOpenTab((cur) => (cur === key ? null : key));
  const resetPrice = () => {
    setPriceMin('');
    setPriceMax('');
  };
  const resetMore = () => {
    setStatus('');
    setBedsMin('');
    setSchoolId('');
    setSchoolKm(3);
    setSchoolKw('');
  };
  const filteredSchools = useMemo(() => {
    const kw = schoolKw.trim().toLowerCase();
    if (!kw) return schools;
    return schools.filter(
      (s) =>
        (s.name ?? '').toLowerCase().includes(kw) ||
        (s.name_en ?? '').toLowerCase().includes(kw),
    );
  }, [schools, schoolKw]);

  const renderCard = (p: PropertyItem) => {
    const st = p.status ?? 'vacant';
    const meta = STATUS_META[st] ?? { label: st, color: colors.ink2, bg: colors.surface2 };
    const type = TYPE_META[p.property_type ?? 'apartment'] ?? TYPE_META.apartment;
    const cover = propertyCoverUrl(p.photos);
    const title = p.project_name
      ? `${p.project_name} · ${p.room_number ?? ''}`.trim()
      : ([p.room_number, p.building].filter(Boolean).join(' · ') || p.address || '房源');
    const spec = [
      p.size_sqm ? `${p.size_sqm}㎡` : null,
      p.bedrooms ? `${p.bedrooms}卧${p.bathrooms ?? 0}浴` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const tags = [
      p.furnished ? '精装' : null,
      p.video_url ? '视频看房' : null,
      Array.isArray(p.photos) && p.photos.length > 0 ? `${p.photos.length} 张照片` : null,
    ].filter(Boolean) as string[];

    return (
      <TouchableOpacity
        key={p.id}
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('PropertyEdit', { id: p.id })}
      >
        <View style={[styles.thumb, { backgroundColor: type.color }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Ionicons name={type.icon} size={26} color={colors.primaryForeground} />
          )}
          <View style={styles.typeBadge}>
            <Text style={[styles.typeBadgeText, { color: type.color }]}>{type.label}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.addr} numberOfLines={1}>
            {p.address || '暂无地址'}
          </Text>
          {tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {spec ? <Text style={styles.spec}>{spec}</Text> : null}
          <View style={styles.leaseRow}>
            <Ionicons name="person-outline" size={13} color={colors.ink3} />
            <Text style={styles.leaseText} numberOfLines={1}>
              {tenantLabel(p.id)}
            </Text>
          </View>
          <View style={styles.bottom}>
            <Text style={styles.price}>
              {currencySymbol(p.currency)}
              {Number(p.monthly_rent || 0).toLocaleString()}
              <Text style={styles.priceUnit}>/月</Text>
            </Text>
            <View style={styles.badgeGroup}>
              <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label="正在加载房源…" />
      </View>
    );
  }

  return (
    <>
    <FlatList
      style={styles.container}
      contentContainerStyle={[styles.content, respContainer]}
      showsVerticalScrollIndicator={false}
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <View style={styles.listItem}>{renderCard(item)}</View>}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <>
      {/* 搜索 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索房源名称、地址..."
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
        {keyword ? (
          <TouchableOpacity onPress={() => setKeyword('')} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={16} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ---- 链家式单行筛选栏 + 顶部下拉面板（对齐租客端 ListingsScreen）---- */}
      <View style={styles.filterZone}>
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
                openTab === tb.key && styles.filterTabOpen,
                tb.active && styles.filterTabActive,
              ]}
              onPress={() => toggleTab(tb.key)}
              activeOpacity={0.7}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.filterTabLabel,
                  (openTab === tb.key || tb.active) && styles.filterTabLabelActive,
                ]}
              >
                {tb.label}
              </Text>
              {tb.badge > 0 && (
                <View style={styles.filterTabBadge}>
                  <Text style={styles.filterTabBadgeText}>{tb.badge}</Text>
                </View>
              )}
              <Ionicons
                name={openTab === tb.key ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={tb.active || openTab === tb.key ? colors.primary : colors.ink3}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {openTab !== null && (
          <View style={styles.dropPanel}>
            {openTab === 'region' && (
              <>
                <View style={styles.regionHolder}>
                  <RegionPicker value={region} onChange={setRegion} />
                </View>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={() => setRegion(null)} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => setOpenTab(null)} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {openTab === 'price' && (
              <>
                <Text style={styles.dropGroupTitle}>租金（THB/月）</Text>
                <View style={styles.ceRangeRow}>
                  <TextInput
                    style={styles.ceInput}
                    value={priceMin}
                    onChangeText={setPriceMin}
                    placeholder="最低"
                    placeholderTextColor={colors.ink3}
                    keyboardType="numeric"
                  />
                  <Text style={styles.ceRangeSep}>—</Text>
                  <TextInput
                    style={styles.ceInput}
                    value={priceMax}
                    onChangeText={setPriceMax}
                    placeholder="最高"
                    placeholderTextColor={colors.ink3}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={resetPrice} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => setOpenTab(null)} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {openTab === 'sort' && (
              <>
                <View style={styles.dropSort}>
                  {SORTS.map((o) => (
                    <TouchableOpacity
                      key={o.key}
                      style={styles.dropSortItem}
                      activeOpacity={0.7}
                      onPress={() => setSort(o.key)}
                    >
                      <Text style={[styles.dropSortText, sort === o.key && styles.dropSortTextActive]}>
                        {o.label}
                      </Text>
                      {sort === o.key ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={() => setSort('latest')} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => setOpenTab(null)} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {openTab === 'more' && (
              <>
                <ScrollView style={styles.dropBodyTall} keyboardShouldPersistTaps="handled">
                  <Text style={styles.dropGroupTitle}>房源状态</Text>
                  <View style={styles.filterGroup}>
                    {STATUS_FILTERS.map((f) => (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.optChip, status === f.key && styles.optChipActive]}
                        activeOpacity={0.7}
                        onPress={() => setStatus(f.key)}
                      >
                        <Text style={[styles.optChipText, status === f.key && styles.optChipTextActive]}>
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dropGroupTitle}>户型</Text>
                  <View style={styles.filterGroup}>
                    <TouchableOpacity
                      style={[styles.optChip, bedsMin === '' && styles.optChipActive]}
                      activeOpacity={0.7}
                      onPress={() => setBedsMin('')}
                    >
                      <Text style={[styles.optChipText, bedsMin === '' && styles.optChipTextActive]}>不限</Text>
                    </TouchableOpacity>
                    {['1', '2', '3'].map((b) => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.optChip, bedsMin === b && styles.optChipActive]}
                        activeOpacity={0.7}
                        onPress={() => setBedsMin(b)}
                      >
                        <Text style={[styles.optChipText, bedsMin === b && styles.optChipTextActive]}>
                          {b}卧及以上
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dropGroupTitle}>学校 · 距离</Text>
                  <View style={styles.filterGroup}>
                    {SCHOOL_RADIUS_OPTIONS.map((km) => (
                      <TouchableOpacity
                        key={km}
                        style={[styles.optChip, schoolKm === km && styles.optChipActive]}
                        activeOpacity={0.7}
                        onPress={() => setSchoolKm(km)}
                      >
                        <Text style={[styles.optChipText, schoolKm === km && styles.optChipTextActive]}>
                          {km}km
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.dropSearch}
                    value={schoolKw}
                    onChangeText={setSchoolKw}
                    placeholder="搜索学校名称"
                    placeholderTextColor={colors.ink3}
                    returnKeyType="search"
                  />
                  <View style={styles.filterGroup}>
                    {filteredSchools.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.optChip, schoolId === s.id && styles.optChipActive]}
                        activeOpacity={0.7}
                        onPress={() => setSchoolId(s.id)}
                      >
                        <Text
                          style={[styles.optChipText, schoolId === s.id && styles.optChipTextActive]}
                          numberOfLines={1}
                        >
                          {s.name || s.name_en}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {schools.length > 0 && filteredSchools.length === 0 && (
                    <Text style={styles.dropEmpty}>未找到相关学校</Text>
                  )}
                </ScrollView>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={resetMore} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => setOpenTab(null)} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </View>

      {/* 结果统计 */}
      <Text style={filterStyles.count}>
        共 <Text style={styles.countStrong}>{total}</Text> 套
        {vacantTotal !== null ? (
          <>
            {' · 空置 '}
            <Text style={styles.countVacant}>{vacantTotal}</Text> 套
          </>
        ) : null}
      </Text>

        </>
      }
      ListEmptyComponent={
        <EmptyState
          icon="business-outline"
          title="暂无房源"
          sub={keyword || status ? '换个关键词或筛选条件试试' : '可管理的房源会展示在这里'}
        />
      }
      ListFooterComponent={
        page < totalPages ? (
          <View style={styles.listFooter}>
            <TouchableOpacity
              style={styles.loadMore}
              activeOpacity={0.8}
              onPress={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>加载更多房源</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null
      }
    />

      </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.full,
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: 9,
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },

  chipScroll: { marginTop: colors.spacing.md },
  chipRow: { gap: colors.spacing.sm, paddingHorizontal: colors.spacing.lg },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: colors.spacing.lg, marginTop: colors.spacing.md },
  // 状态筛选 chip：与 C 端浏览页筛选 chip 同一套排版语言
  chip: { ...filterStyles.chip },
  chipActive: { ...filterStyles.chipActive },
  chipText: { ...filterStyles.chipText },
  chipTextActive: { ...filterStyles.chipTextActive },

  // 下拉面板内选项 chip：与 C 端浏览页筛选 chip 同源
  optChip: { ...filterStyles.chip },
  optChipActive: { ...filterStyles.chipActive },
  optChipText: { ...filterStyles.chipText },
  optChipTextActive: { ...filterStyles.chipTextActive },

  // 链家式单行筛选栏 + 顶部下拉面板（对齐租客端 ListingsScreen）
  filterZone: { position: 'relative' },
  filterTabsRow: {
    flexGrow: 0,
    marginHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    overflow: 'hidden',
  },
  filterTabsContent: { flexGrow: 1 },
  filterTab: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 12,
    position: 'relative',
    backgroundColor: colors.surface,
  },
  filterTabOpen: { backgroundColor: colors.surface2 },
  filterTabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  filterTabLabel: { fontSize: 13, color: colors.ink2, fontWeight: '500', maxWidth: 92 },
  filterTabLabelActive: { color: colors.primary, fontWeight: '600' },
  filterTabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: colors.radius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterTabBadgeText: { color: colors.primaryForeground, fontSize: 11, fontWeight: '600' },
  dropPanel: {
    marginHorizontal: 0,
    marginTop: 6,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dropBody: { flexGrow: 0, maxHeight: 260 },
  // 「更多」面板多组条件：内容区限高滚动，操作行常驻底部
  dropBodyTall: { flexGrow: 0, maxHeight: 300 },
  dropSearch: {
    minHeight: 44,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    marginBottom: 10,
  },
  dropEmpty: { fontSize: 13, color: colors.ink3, paddingVertical: 12 },
  dropGroupTitle: { fontSize: 12, color: colors.ink2, marginBottom: 8, marginTop: 4 },
  filterGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  dropSort: { paddingVertical: 4 },
  dropSortItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropSortText: { fontSize: 14, color: colors.ink },
  dropSortTextActive: { color: colors.primary, fontWeight: '600' },
  // 区域面板内触发控件容器
  regionHolder: { flexDirection: 'row', alignItems: 'center' },
  // 贝壳式底部操作条：重置=浅灰块、确定=主色块，等宽、直角小圆角
  panelActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  resetBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: colors.surface2,
  },
  resetText: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  confirmBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  confirmText: { fontSize: 15, color: colors.primaryForeground, fontWeight: '600' },

  sortChip: {
    flexDirection: 'row',
    gap: 4,
    ...filterStyles.chip,
  },
  sortChipActive: { ...filterStyles.chipActive },
  sortChipText: { ...filterStyles.chipText },
  sortChipTextActive: { ...filterStyles.chipTextActive },

  // 结果数行：与 C 端浏览页 count 同源（字号/间距/水平内边距一致）；保留「空置」附加信息
  countRow: { ...filterStyles.count },
  countStrong: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.ink },
  countVacant: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.info },

  listItem: { paddingHorizontal: colors.spacing.md, marginBottom: colors.spacing.md },
  listFooter: { paddingHorizontal: colors.spacing.md },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: colors.spacing.md,
    ...colors.shadow.card,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: colors.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: colors.spacing.md,
  },
  typeBadge: {
    position: 'absolute',
    bottom: 6,
    backgroundColor: colors.alpha('255, 255, 255', 0.92),
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '700' },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  addr: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: colors.spacing.sm },
  tag: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontSize: colors.fontSize.xs, color: colors.ink2 },
  spec: { fontSize: 12, color: colors.ink2, marginTop: 6 },
  leaseRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  leaseText: { fontSize: 12, color: colors.ink3, flexShrink: 1 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: colors.spacing.sm,
    paddingTop: colors.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  priceUnit: { fontSize: 12, fontWeight: '500', color: colors.ink3 },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadge: { borderRadius: colors.radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },

  loadMore: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadMoreText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  /* ---- C 端维度筛选行（学校 / 更多）---- */
  ceFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    paddingHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.md,
  },
  // C 端维度筛选行（学校 / 更多）：chip 与 C 端浏览页同源
  ceChip: {
    flexDirection: 'row',
    gap: 4,
    ...filterStyles.chip,
  },
  ceChipActive: { ...filterStyles.chipActive },
  ceChipText: { ...filterStyles.chipText },
  ceChipTextActive: { ...filterStyles.chipTextActive },
  ceReset: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 6 },
  ceResetText: { fontSize: 13, color: colors.ink3 },

  /* ---- 底部弹层（复刻 C 端浏览页 modalMask / modalSheet / sheetHeader 系列）---- */
  filterMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  filterSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: colors.radius.xxl,
    borderTopRightRadius: colors.radius.xxl,
    padding: colors.spacing.lg,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  sheetClose: { fontSize: colors.fontSize.base, color: colors.ink2 },
  fieldLabel: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: colors.spacing.md, marginBottom: colors.spacing.sm },

  panelSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.full,
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: 8,
    marginBottom: colors.spacing.md,
  },
  panelSearchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },
  schoolList: { maxHeight: 240 },
  schoolEmpty: { fontSize: 13, color: colors.ink3, textAlign: 'center', paddingVertical: 16 },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  schoolRowName: { flex: 1, fontSize: 14, color: colors.ink, paddingRight: 12 },
  schoolRowActive: { color: colors.primary, fontWeight: '600' },

  /* ---- 面板内分组 ---- */
  ceGroup: { marginBottom: colors.spacing.md },
  ceGroupLabel: { fontSize: 13, color: colors.ink2, fontWeight: '600', marginBottom: 8 },
  ceChips: { flexDirection: 'row', gap: colors.spacing.sm },
  // 面板内小 chip（距离 / 学校项）：与 C 端浏览页 chip 同源
  ceChipSmall: { ...filterStyles.chip },
  ceChipSmallActive: { ...filterStyles.chipActive },
  ceChipSmallText: { ...filterStyles.chipText },
  ceChipSmallTextActive: { ...filterStyles.chipTextActive },
  ceRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ceRangeSep: { fontSize: 14, color: colors.ink3 },
  ceInput: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.ink,
  },
  ceInputSingle: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.ink,
  },

  /* ---- 弹层底部操作按钮（复刻 C 端浏览页 sheetActions / sheetReset / sheetApply）---- */
  sheetActions: { flexDirection: 'row', gap: colors.spacing.md, marginTop: colors.spacing.lg },
  sheetReset: {
    flex: 1,
    height: 46,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: colors.spacing.lg,
  },
  sheetResetText: { fontSize: colors.fontSize.base, color: colors.ink2 },
  sheetApply: {
    flex: 1,
    height: 46,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: colors.spacing.lg,
  },
  sheetApplyText: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.primaryForeground },
});