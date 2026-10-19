/**
 * 员工端房源浏览（薄壳）
 *
 * 本页只负责**数据**：`/properties`（分页 + 关键词/区域同义词/学校半径/价格/面积/房型/朝向/装修/配套/状态/排序）
 * 拉取与归一化，展示层完全复用 C 端找房页的共享组件 `@/components/ListingsFeed`，
 * 因此 UI 与 C 端「找房」页 1:1 一致；且本页为**纯浏览**：无上架/编辑/删除/新增楼盘，卡片无额外操作块。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import api from '@/lib/api';
import * as Location from 'expo-location';
import { favoritesApi, translateApi } from '@/services/api';
import {
  publicApi,
  unwrapPage,
  type PublicSchool,
  type PublicMapPoint,
} from '@/services/publicApi';
import { notify } from '@/utils/feedback';
import { propertyCoverUrl } from '@/lib/property';
import { METRO_LINES } from '@/data/locationMetro';
import { useLocationStore, findCityByKey } from '@/stores/location';
import { useI18n } from '@/i18n';
import ListingsMapModal from '@/components/ListingsMapModal';
import ListingsFeed, {
  priceRanges,
  areaPresets,
  translateSource,
  type Listing,
  type ListingsFilters,
  type RegionDistrict,
  type BizKey,
} from '@/components/ListingsFeed';

const PAGE_SIZE = 10;

interface PropertyItem {
  id: string;
  room_number?: string | null;
  building?: string | null;
  address?: string | null;
  property_type?: string | null;
  monthly_rent?: number;
  sale_price?: number | null;
  currency?: string;
  status?: string | null;
  size_sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: number | null;
  furnished?: boolean;
  description?: string | null;
  photos?: unknown[] | null;
  video_url?: string | null;
}

// `/properties` 条目 → 找房卡片数据模型（含买卖挂牌价映射）
const normalize = (p: PropertyItem): Listing => {
  const joined = [p.room_number, p.building].filter(Boolean).join(' ');
  const cover = p.photos ? propertyCoverUrl(p.photos) : '';
  return {
    id: String(p.id),
    property_id: String(p.id),
    title: joined || undefined,
    room_number: p.room_number ?? undefined,
    address: p.address ?? undefined,
    property_type: p.property_type ?? undefined,
    monthly_rent: p.monthly_rent,
    asking_price: p.sale_price ?? undefined,
    currency: p.currency,
    bedrooms: p.bedrooms ?? 0,
    bathrooms: p.bathrooms ?? 0,
    size_sqm: p.size_sqm ?? 0,
    status: p.status ?? undefined,
    floor: p.floor ?? undefined,
    description: p.description ?? undefined,
    photos: cover ? [cover] : [],
  };
};

export default function PropertyBrowseScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const PRICE_RANGES = useMemo(() => priceRanges(t), [t]);
  const AREA_PRESETS = useMemo(() => areaPresets(t), [t]);

  // 全局定位：区域面板 = 当前定位城市的区/街道；地铁 = 当前城市的线路（与 C 端一致）
  const locSel = useLocationStore((s) => s.selection);
  const locCity = useMemo(() => findCityByKey(locSel.cityKey), [locSel.cityKey]);
  const districts: RegionDistrict[] = useMemo(
    () => (locCity?.children ?? []).map((c) => ({ key: c.key, label: c.label, kws: c.kws })),
    [locCity],
  );
  const metroLines = useMemo(
    () => METRO_LINES.filter((l) => l.cityKey === locSel.cityKey),
    [locSel.cityKey],
  );

  const [items, setItems] = useState<PropertyItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const firstLoad = useRef(true);

  // ---------- 受控筛选值（与 C 端同构） ----------
  const [keyword, setKeyword] = useState('');
  const [districtSel, setDistrictSel] = useState<string | null>(null);
  const [metroSel, setMetroSel] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState('');
  const [customMin, setCustomMin] = useState('');
  const [customMax, setCustomMax] = useState('');
  const [bedFilter, setBedFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orientationSel, setOrientationSel] = useState('');
  const [floorSel, setFloorSel] = useState('');
  const [decorSel, setDecorSel] = useState('');
  const [amenitySel, setAmenitySel] = useState<string[]>([]);
  const [areaRange, setAreaRange] = useState('');
  const [areaCustomMin, setAreaCustomMin] = useState('');
  const [areaCustomMax, setAreaCustomMax] = useState('');
  const [sortKey, setSortKey] = useState('default');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [biz, setBiz] = useState<BizKey>('rent');
  // 学校筛选（收进「更多」）：后端按学校坐标 + 半径反查覆盖的小区
  const [schoolId, setSchoolId] = useState('');
  const [schoolKm, setSchoolKm] = useState(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [schoolKw, setSchoolKw] = useState('');
  const [favSet, setFavSet] = useState<Record<string, boolean>>({});

  // ---------- C 端同款能力：附近排序 / 翻译 / 地图弹层 ----------
  const [nearby, setNearby] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPoints, setMapPoints] = useState<PublicMapPoint[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState(false);

  // 已选区域/地铁的关键词（服务端 keywords 同义词匹配）
  const activeLocationKw = useMemo(() => {
    if (districtSel) {
      const node = districts.find((d) => d.key === districtSel);
      return node ? node.kws : [];
    }
    if (metroSel.length) {
      const stations = METRO_LINES.flatMap((l) => l.stations);
      return stations.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws);
    }
    return [];
  }, [districtSel, metroSel, districts]);

  // 组装查询参数：除「房源类型」为本地产过滤外，其余均走服务端 /properties
  const buildParams = useCallback(
    (targetPage: number) => {
      const params: Record<string, unknown> = { page: targetPage, page_size: PAGE_SIZE };
      // 后端 sort 无「默认排序」取值：default 不传，由后端落回最新/相关性
      if (sortKey !== 'default') params.sort = sortKey;
      const kw = keyword.trim();
      if (kw) params.q = kw;
      if (activeLocationKw.length) params.keywords = activeLocationKw;
      if (schoolId) {
        params.school_id = schoolId;
        params.school_radius_km = schoolKm;
      }
      let pMin = 0;
      let pMax = Infinity;
      const preset = PRICE_RANGES.find((p) => p.key === priceRange);
      if (preset && preset.key) {
        pMin = preset.min;
        pMax = preset.max;
      } else if (customMin || customMax) {
        pMin = (Number(customMin) || 0) * 10000;
        pMax = (Number(customMax) || 0) * 10000;
      }
      if (isFinite(pMin) && pMin > 0) params.price_min = pMin;
      if (isFinite(pMax) && pMax !== Infinity) params.price_max = pMax;
      if (bedFilter === '5') params.bedrooms_min = 5;
      else if (bedFilter) {
        params.bedrooms_min = Number(bedFilter);
        params.bedrooms_max = Number(bedFilter);
      }
      if (orientationSel) params.orientation = orientationSel;
      if (floorSel) params.floor_level = floorSel;
      if (decorSel) params.decoration = decorSel;
      if (amenitySel.length) params.amenity = amenitySel;
      if (statusFilter) params.status = statusFilter;
      let aMin = 0;
      let aMax = Infinity;
      const areaPreset = AREA_PRESETS.find((a) => a.key === areaRange);
      if (areaPreset && areaPreset.key) {
        aMin = areaPreset.min;
        aMax = areaPreset.max;
      } else if (areaCustomMin || areaCustomMax) {
        aMin = Number(areaCustomMin) || 0;
        aMax = Number(areaCustomMax) || 0;
      }
      if (aMin > 0) params.area_min = aMin;
      if (isFinite(aMax) && aMax !== Infinity) params.area_max = aMax;
      return params;
    },
    [keyword, activeLocationKw, schoolId, schoolKm, priceRange, customMin, customMax, bedFilter, orientationSel, floorSel, decorSel, amenitySel, statusFilter, areaRange, areaCustomMin, areaCustomMax, sortKey, PRICE_RANGES, AREA_PRESETS],
  );

  const load = useCallback(
    async (options?: { nextPage?: number }) => {
      const targetPage = options?.nextPage ?? 1;
      setError(false);
      try {
        const res = await api.get('/properties', {
          params: buildParams(targetPage),
          paramsSerializer: { indexes: null },
        });
        const data = res.data as { items?: PropertyItem[]; total?: number; total_pages?: number };
        const list = Array.isArray(data) ? (data as unknown as PropertyItem[]) : (data?.items ?? []);
        setItems((prev) => (targetPage === 1 ? list : [...prev, ...list]));
        setTotalPages(data?.total_pages ?? 1);
        setPage(targetPage);
      } catch {
        if (targetPage === 1) {
          setItems([]);
          setTotalPages(1);
          setError(true);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [buildParams],
  );

  // 筛选变化后重新查询（关键词做 400ms 防抖）
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      load({ nextPage: 1 });
      return;
    }
    const timer = setTimeout(() => load({ nextPage: 1 }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, districtSel, metroSel, schoolId, schoolKm, priceRange, customMin, customMax, bedFilter, orientationSel, floorSel, decorSel, amenitySel, statusFilter, areaRange, areaCustomMin, areaCustomMax, sortKey]);

  // 学校候选：首次展开「更多」面板时懒加载一次
  const loadSchools = useCallback(() => {
    if (schoolsLoaded) return;
    setSchoolsLoaded(true);
    publicApi
      .schools({ page_size: 100 })
      .then((res: any) => setSchools(unwrapPage<PublicSchool>(res?.data).items))
      .catch(() => setSchools([]));
  }, [schoolsLoaded]);

  // 批量取收藏状态
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    Promise.all(
      items.map((p) =>
        favoritesApi
          .status(p.id)
          .then((r: any) => ({ id: p.id, ok: !!r?.data?.favorited }))
          .catch(() => ({ id: p.id, ok: false })),
      ),
    ).then((rows) => {
      if (cancelled) return;
      const map: Record<string, boolean> = {};
      rows.forEach((r) => {
        map[r.id] = r.ok;
      });
      setFavSet(map);
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ nextPage: 1 });
  }, [load]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await load({ nextPage: page + 1 });
  }, [load, loadingMore, page, totalPages]);

  const onRetry = useCallback(() => {
    setLoading(true);
    load({ nextPage: 1 });
  }, [load]);

  const toggleFav = useCallback(
    async (p: Listing) => {
      const current = !!favSet[p.id];
      try {
        if (current) {
          await favoritesApi.remove(p.id);
        } else {
          await favoritesApi.toggle(p.id);
        }
        setFavSet((s) => ({ ...s, [p.id]: !current }));
      } catch {
        Alert.alert(t('acc.opFailed'), t('prop.retryLater'));
      }
    },
    [favSet, t],
  );

  // 业务 Tab（整租/买房）+ 房源类型：均在本页做客户端过滤（/properties 无对应参数）
  const visibleItems = useMemo(() => {
    let arr = items;
    arr =
      biz === 'sale'
        ? arr.filter((it) => Number(it.sale_price ?? 0) > 0)
        : arr.filter((it) => Number(it.monthly_rent ?? 0) > 0);
    if (filterTypes.length) {
      arr = arr.filter((it) => filterTypes.includes(String(it.property_type ?? '')));
    }
    return arr.map(normalize);
  }, [items, biz, filterTypes]);

  const filters: ListingsFilters = useMemo(
    () => ({
      keyword,
      districtSel,
      metroSel,
      priceRange,
      customMin,
      customMax,
      bedFilter,
      statusFilter,
      orientationSel,
      floorSel,
      decorSel,
      amenitySel,
      areaRange,
      areaCustomMin,
      areaCustomMax,
      sortKey,
      schoolId,
      schoolKm,
      schoolKw,
      filterTypes,
    }),
    [
      keyword, districtSel, metroSel, priceRange, customMin, customMax, bedFilter,
      statusFilter, orientationSel, floorSel, decorSel, amenitySel, areaRange,
      areaCustomMin, areaCustomMax, sortKey, schoolId, schoolKm, schoolKw, filterTypes,
    ],
  );

  const handleFiltersChange = useCallback((patch: Partial<ListingsFilters>) => {
    if (patch.keyword !== undefined) setKeyword(patch.keyword);
    if (patch.districtSel !== undefined) setDistrictSel(patch.districtSel);
    if (patch.metroSel !== undefined) setMetroSel(patch.metroSel);
    if (patch.priceRange !== undefined) setPriceRange(patch.priceRange);
    if (patch.customMin !== undefined) setCustomMin(patch.customMin);
    if (patch.customMax !== undefined) setCustomMax(patch.customMax);
    if (patch.bedFilter !== undefined) setBedFilter(patch.bedFilter);
    if (patch.statusFilter !== undefined) setStatusFilter(patch.statusFilter);
    if (patch.orientationSel !== undefined) setOrientationSel(patch.orientationSel);
    if (patch.floorSel !== undefined) setFloorSel(patch.floorSel);
    if (patch.decorSel !== undefined) setDecorSel(patch.decorSel);
    if (patch.amenitySel !== undefined) setAmenitySel(patch.amenitySel);
    if (patch.areaRange !== undefined) setAreaRange(patch.areaRange);
    if (patch.areaCustomMin !== undefined) setAreaCustomMin(patch.areaCustomMin);
    if (patch.areaCustomMax !== undefined) setAreaCustomMax(patch.areaCustomMax);
    if (patch.sortKey !== undefined) setSortKey(patch.sortKey);
    if (patch.schoolId !== undefined) setSchoolId(patch.schoolId);
    if (patch.schoolKm !== undefined) setSchoolKm(patch.schoolKm);
    if (patch.schoolKw !== undefined) setSchoolKw(patch.schoolKw);
    if (patch.filterTypes !== undefined) setFilterTypes(patch.filterTypes);
  }, []);

  const handlePanelOpen = useCallback(
    (key: 'region' | 'price' | 'more' | 'sort') => {
      if (key === 'more') loadSchools();
    },
    [loadSchools],
  );

  // 「附近」：切换离我最近排序（与 C 端同款；/properties 无坐标时降级提示）
  const handleToggleNearby = useCallback(async () => {
    if (nearby) {
      setNearby(false);
      return;
    }
    let pos = userPos;
    if (!pos) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          notify(t('common.hint'), t('list.nearbyDenied'));
          return;
        }
        const cur = await Location.getCurrentPositionAsync({});
        pos = { lat: cur.coords.latitude, lng: cur.coords.longitude };
        setUserPos(pos);
      } catch {
        notify(t('common.hint'), t('list.nearbyDenied'));
        return;
      }
    }
    if (!visibleItems.some((it) => it.lat != null && it.lng != null)) {
      notify(t('common.hint'), t('list.nearbyNoData'));
      return;
    }
    setNearby(true);
  }, [nearby, userPos, visibleItems, t]);

  // 翻译（与 C 端同款：源文取描述/地址，结果以提示展示）
  const handleTranslate = useCallback(
    async (item: Listing) => {
      const source = translateSource(item);
      if (!source) {
        notify(t('common.hint'), t('list.noDesc'));
        return;
      }
      setTranslatingId(item.id);
      try {
        const res = await translateApi.translate(source, 'zh');
        const text = res.data?.translated_text ?? '';
        notify(t('list.translateResult'), text || t('list.translateNoKey'));
      } catch {
        notify(t('list.translateFail'), t('prop.retryLater'));
      } finally {
        setTranslatingId(null);
      }
    },
    [t],
  );

  // 地图点位（与 C 端同款：消费 /public/map-points）
  const loadMapPoints = useCallback(async () => {
    setMapLoading(true);
    setMapError(false);
    try {
      const params: any = {
        limit: 50,
        listing_type: biz === 'sale' ? 'sell' : 'rent',
        ...(locSel.cityKey ? { city: locSel.cityKey } : {}),
        ...(keyword.trim() ? { q: keyword.trim() } : {}),
      };
      const res = await publicApi.mapPoints(params);
      const data = res?.data;
      const items = Array.isArray(data) ? data : (data as any)?.items ?? (data as any)?.data ?? [];
      setMapPoints(items as PublicMapPoint[]);
    } catch {
      setMapPoints([]);
      setMapError(true);
    } finally {
      setMapLoading(false);
    }
  }, [biz, locSel.cityKey, keyword]);

  // 「去地图看」：打开共享地图弹层（与 C 端同款）
  const handleGoMap = useCallback(() => {
    setMapOpen(true);
    if (!userPos) {
      Location.requestForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status !== 'granted') return;
          return Location.getCurrentPositionAsync({}).then((cur) =>
            setUserPos({ lat: cur.coords.latitude, lng: cur.coords.longitude }),
          );
        })
        .catch(() => {});
    }
    void loadMapPoints();
  }, [userPos, loadMapPoints]);

  const handleOpenDetail = useCallback(
    (item: Listing) => navigation.navigate('PropertyDetail', { id: String(item.id) }),
    [navigation],
  );

  return (
    <View style={styles.container}>
      <ListingsFeed
        items={visibleItems}
        loading={loading}
        error={error}
        refreshing={refreshing}
        hasMore={page < totalPages}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        onRefresh={onRefresh}
        onRetry={onRetry}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        favSet={favSet}
        favPending={{}}
        onToggleFav={toggleFav}
        biz={biz}
        onBizChange={setBiz}
        onOpenDetail={handleOpenDetail}
        districts={districts}
        metroLines={metroLines}
        cityLabel={locCity?.cityLabel ?? ''}
        schools={schools}
        schoolsLoaded={schoolsLoaded}
        enableNearby
        nearby={nearby}
        onToggleNearby={handleToggleNearby}
        translatingId={translatingId}
        onTranslate={handleTranslate}
        showMapButton
        onOpenMap={handleGoMap}
        onPanelOpen={handlePanelOpen}
        defaultMetroLineKey={METRO_LINES[0].key}
      />

      {/* 地图找房弹层：与 C 端共用同一组件 */}
      <ListingsMapModal
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        loading={mapLoading}
        error={mapError}
        points={mapPoints}
        userPos={userPos}
        onRetry={loadMapPoints}
        onOpenPoint={(p) => {
          setMapOpen(false);
          navigation.navigate('PropertyDetail', { id: p.id });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
