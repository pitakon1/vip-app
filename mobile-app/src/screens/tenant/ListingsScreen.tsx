/**
 * 租客找工作台（链家风格）
 * 顶部搜索 + 筛选条 + 房源卡片列表（图片 / 标题 / 租金 / 户型面积）
 *
 * 展示层已抽取为共享组件 `@/components/ListingsFeed`（与员工端「房源」页 1:1 复用），
 * 本页只保留**数据逻辑**：公开接口拉取 / 本地缓存 / 过滤排序 / 收藏 / 翻译 / 区域与地铁数据 / 地图弹层。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import colors from '@/theme/colors';
import * as Location from 'expo-location';
import { translateApi, favoritesApi } from '@/services/api';
import {
  publicApi,
  unwrapPage,
  type PublicSchool,
  type PublicDistrict,
  type PublicMapPoint,
} from '@/services/publicApi';
import { notify, notifyError } from '@/utils/feedback';
import ListingsMapModal from '@/components/ListingsMapModal';
import ListingsFeed, {
  priceRanges,
  areaPresets,
  translateSource,
  type BizKey,
  type Listing,
  type ListingsFilters,
  type RegionDistrict,
  type RegionMetroLine,
} from '@/components/ListingsFeed';
import { useI18n } from '@/i18n';
import { METRO_LINES } from '@/data/locationMetro';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore, findCityByKey } from '@/stores/location';
import { getCached, isFresh, setCached } from '@/lib/cache';

// 买卖挂牌（真实数据源：GET /public/listings?listing_type=sell）
interface SaleListing {
  id: string;
  property_id?: string | null;
  title?: string;
  address?: string;
  asking_price?: number;
  currency?: string;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  status?: string;
  [key: string]: any;
}

// 「附近」排序：用户定位与楼盘坐标间的球面距离（km）；坐标缺失的房源排到最后
const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// 命中关键词：房源地址/标题任一包含即可
const matchLocation = (item: any, kws: string[]): boolean =>
  kws.some((k) =>
    [item.address, item.title, item.room_number, item.city, item.district, item.area]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase())
      .some((v) => v.includes(k)),
  );

export default function ListingsScreen() {
  const { t } = useI18n();
  const PRICE_RANGES = useMemo(() => priceRanges(t), [t]);
  const AREA_PRESETS = useMemo(() => areaPresets(t), [t]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [keyword, setKeyword] = useState('');
  // 「附近」：按离我最近排序（首次开启时才申请定位权限）
  const [nearby, setNearby] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [priceRange, setPriceRange] = useState('');
  const [customMin, setCustomMin] = useState(''); // 自定义最低价（万）
  const [customMax, setCustomMax] = useState(''); // 自定义最高价（万）
  const [bedFilter, setBedFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orientationSel, setOrientationSel] = useState('');   // 朝向
  const [floorSel, setFloorSel] = useState('');               // 楼层段
  const [decorSel, setDecorSel] = useState('');               // 装修
  const [amenitySel, setAmenitySel] = useState<string[]>([]); // 配套多选
  const [areaRange, setAreaRange] = useState(''); // 面积预设 key
  const [areaCustomMin, setAreaCustomMin] = useState(''); // 自定义最低面积（㎡）
  const [areaCustomMax, setAreaCustomMax] = useState(''); // 自定义最高面积（㎡）
  const [sortKey, setSortKey] = useState('default');
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  // 路由参数（首页黄金导航 business=sale / filter=property_type 直达）
  const route = useRoute<any>();
  // 业务归属 Tab（整租 / 买房）：初值支持从路由参数 business 直达
  const [biz, setBiz] = useState<BizKey>(route.params?.business === 'sale' ? 'sale' : 'rent');
  const [saleListings, setSaleListings] = useState<SaleListing[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState(false);
  // 按区域/按地铁（对齐贝壳「区域 | 地铁」双Tab）
  // 城市由全局定位 Store 决定（主页左上角选择国家/城市），找房页只做「区/街道」与地铁。
  const locSel = useLocationStore((s) => s.selection);
  const locCity = useMemo(() => findCityByKey(locSel.cityKey), [locSel.cityKey]);
  const [districtSel, setDistrictSel] = useState<string | null>(null); // 已选城区（区/街道）key
  const [metroSel, setMetroSel] = useState<string[]>([]);              // 已选站点 name（已确认）
  // 学校筛选（空间）：后端按学校坐标 + 半径反查覆盖的小区，必须走服务端
  const [schoolId, setSchoolId] = useState('');
  const [schoolKm, setSchoolKm] = useState(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [schoolKw, setSchoolKw] = useState('');
  // 请求序号：连续切换筛选时丢弃先发后到的过期响应
  const listReqSeq = useRef(0);
  const navigation = useNavigation<any>();
  // 支持金刚区分类直达：路由参数 filter 预设房源类型。可为字符串或数组——
  // 数组用于「商铺办公」= office+shop 这类一次直达多个类型。筛选改由服务端执行。
  const [filterTypes, setFilterTypes] = useState<string[]>(() => {
    const f = route.params?.filter;
    if (Array.isArray(f)) return f.filter(Boolean).map(String);
    return f ? [String(f)] : [];
  });
  // 新房/二手房（仅买房业务）：路由参数 is_new_development 直达；undefined=不限
  const [isNew, setIsNew] = useState<boolean | undefined>(
    typeof route.params?.is_new_development === 'boolean'
      ? route.params.is_new_development
      : undefined,
  );
  // 收藏集合：propertyId -> 是否已收藏
  const [favSet, setFavSet] = useState<Record<string, boolean>>({});
  const [favLoading, setFavLoading] = useState<Record<string, boolean>>({});

  // 学校筛选参数：未选学校时恒为 null（引用不变），避免只调半径也触发重新拉取
  const schoolFilter = useMemo(
    () => (schoolId ? { id: schoolId, km: schoolKm } : null),
    [schoolId, schoolKm],
  );

  const loadListings = useCallback(
    async (opts?: { force?: boolean }) => {
      // SWR：先渲染磁盘缓存（秒开），再后台请求刷新并回写缓存；公开数据全局一份。
      // 学校筛选下结果集不同，不进这份全局缓存，避免把筛选结果当首屏数据回灌。
      const cacheKey = 'tenant-listings';
      const scoped = !!schoolFilter;
      const seq = ++listReqSeq.current;
      try {
        if (!scoped) {
          const cached = await getCached<Listing[]>(cacheKey);
          if (cached && cached.length) {
            setListings(cached);
            setLoadError(false);
            setLoading(false);
            if (!opts?.force && (await isFresh(cacheKey))) {
              setRefreshing(false);
              return;
            }
          }
        }
        const params: any = {
          page: 1,
          page_size: 50,
          listing_type: 'rent',
          // 城市作用域：传定位 Store 的 cityKey（后端做 slug 归一化），不传中文 cityLabel
          ...(locSel.cityKey ? { city: locSel.cityKey } : {}),
          // 房源类型 / 新房二手房改由服务端过滤：多值数组经 axios paramsSerializer
          // （indexes:null）序列化为重复键，与 FastAPI 的 List[str] Query 对齐。
          ...(filterTypes.length ? { property_type: filterTypes } : {}),
          ...(isNew === undefined ? {} : { is_new_development: isNew }),
        };
        if (schoolFilter) {
          params.school_id = schoolFilter.id;
          params.school_radius_km = schoolFilter.km;
        }
        // 登录/未登录统一走匿名公开层（对齐贝壳：浏览/搜索无需注册），内容对所有访客一致
        const res = await publicApi.listings(params);
        // 过期响应直接丢弃：连续切换学校等筛选时，先发的请求可能后到
        if (seq !== listReqSeq.current) return;
        const data = res.data;
        const items = Array.isArray(data)
          ? data
          : (data as any)?.items ?? (data as any)?.data ?? [];
        setListings(items as Listing[]);
        setLoadError(false);
        if (items.length && !scoped) setCached(cacheKey, items);
      } catch (err: any) {
        if (seq !== listReqSeq.current) return;
        setLoadError(true);
        // web 下 Alert.alert 是空实现，这里统一走 web 安全反馈（失败可见 + 可重试）
        notifyError(t('loadFailed'), err, () => {
          setLoading(true);
          loadListings();
        });
      } finally {
        if (seq === listReqSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [schoolFilter, t, filterTypes, isNew, locSel.cityKey],
  );

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  // 学校候选：首次展开「更多」面板时懒加载一次（由 ListingsFeed 的 onPanelOpen 触发）
  const loadSchools = useCallback(() => {
    if (schoolsLoaded) return;
    setSchoolsLoaded(true);
    publicApi
      .schools({ page_size: 100 })
      .then((res: any) => setSchools(unwrapPage<PublicSchool>(res?.data).items))
      .catch(() => setSchools([]));
  }, [schoolsLoaded]);

  // 买房 Tab：真实在售挂牌（GET /public/listings?listing_type=sell）
  const loadSaleListings = useCallback(async () => {
    setSaleLoading(true);
    setSaleError(false);
    try {
      const res = await publicApi.listings({
        page: 1,
        page_size: 50,
        listing_type: 'sell',
        ...(locSel.cityKey ? { city: locSel.cityKey } : {}),
        ...(filterTypes.length ? { property_type: filterTypes } : {}),
        ...(isNew === undefined ? {} : { is_new_development: isNew }),
      });
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      setSaleListings(items as SaleListing[]);
    } catch {
      // 挂牌加载失败：置错误态（列表内提供重试），不再静默为空
      setSaleListings([]);
      setSaleError(true);
    } finally {
      setSaleLoading(false);
    }
  }, [filterTypes, isNew, locSel.cityKey]);

  useEffect(() => {
    // 筛选条件变化时 loadSaleListings 引用会变，此处随之重新拉取（不再只认首次加载）
    if (biz === 'sale') loadSaleListings();
  }, [biz, loadSaleListings]);

  // 收藏状态：TanStack Query 批量查询（同 key 去重 + 60s 新鲜 + 切换后失效）
  const token = useAuthStore((s) => s.token);
  // 收藏按 property_id 记账（公开层卡片带 property_id），列表按公开层挂牌 id 渲染
  const favIds = listings.map((l) => l.property_id ?? l.id).join(',');
  const favQ = useQuery({
    queryKey: ['fav-status', token ? favIds : ''],
    queryFn: async () => {
      const map: Record<string, boolean> = {};
      if (!token || !favIds) return map;
      const r: any = await favoritesApi.batchStatus(favIds.split(','));
      (r?.data?.items || []).forEach((item: any) => {
        map[item.property_id] = !!item.favorited;
      });
      return map;
    },
    enabled: !!token && favIds.length > 0,
    staleTime: 60 * 1000,
  });
  useEffect(() => {
    if (favQ.data) setFavSet(favQ.data);
  }, [favQ.data]);
  const queryClient = useQueryClient();

  // 收藏态镜像：供稳定回调读取，避免依赖 favSet 导致卡片 memo 失效
  const favSetRef = useRef(favSet);
  favSetRef.current = favSet;

  // 收藏 / 取消收藏（useCallback：保持引用稳定，配合 ListingCard 的 memo）
  const handleToggleFav = useCallback(
    async (item: Listing) => {
      // 收藏是需登录的动作：未登录先弹登录，登录成功后回到本页继续（对齐贝壳）
      if (!token) {
        navigation.navigate('Login');
        return;
      }
      const pid = item.property_id ?? item.id;
      const current = !!favSetRef.current[pid];
      setFavLoading((s) => ({ ...s, [pid]: true }));
      try {
        if (current) {
          await favoritesApi.remove(pid);
          setFavSet((s) => ({ ...s, [pid]: false }));
        } else {
          await favoritesApi.toggle(pid);
          setFavSet((s) => ({ ...s, [pid]: true }));
        }
        queryClient.invalidateQueries({ queryKey: ['fav-status'] });
      } catch {
        notify(t('acc.opFailed'), t('prop.retryLater'));
      } finally {
        setFavLoading((s) => ({ ...s, [pid]: false }));
      }
    },
    [queryClient, token, navigation, t],
  );

  // 金刚区分类直达：路由参数变化时同步筛选（支持字符串与数组两种形式）
  useEffect(() => {
    const f = route.params?.filter;
    if (f === undefined) return;
    setFilterTypes(Array.isArray(f) ? f.filter(Boolean).map(String) : [String(f)]);
  }, [route.params?.filter]);

  // 新房/二手房直达：路由参数变化时同步
  useEffect(() => {
    const n = route.params?.is_new_development;
    if (typeof n === 'boolean') setIsNew(n);
  }, [route.params?.is_new_development]);

  // 首页学校卡片直达：带着学校跳到本页并预选学校筛选。
  // 依赖用 schoolTs（时间戳）而非 schoolId —— 连续点同一所学校也要重新生效。
  useEffect(() => {
    if (!route.params?.schoolTs) return;
    setSchoolId(route.params.schoolId ?? '');
    setSchoolKm(route.params.schoolKm ?? 3);
  }, [route.params?.schoolTs]);

  // ---------- 按区域 / 按地铁（对齐贝壳「区域 | 地铁」） ----------
  // 当前定位城市的城区（区/街道）平铺列表：找房页不出现国家/省市，只留 区/街道 颗粒度
  const cityDistricts = locCity?.children ?? [];
  // 区域下拉数据源：优先后端真实区域（当前城市 + 当前业务/房型，可显示套数），
  // 为空回退定位城市静态城区 —— 避免 dev 库稀疏时筛选器变成死界面。
  const [apiDistricts, setApiDistricts] = useState<PublicDistrict[] | null>(null);
  const filterTypesKey = filterTypes.join(',');
  useEffect(() => {
    let cancelled = false;
    const types = filterTypesKey ? filterTypesKey.split(',') : [];
    publicApi
      .districts({
        city: locSel.cityKey || undefined,
        listing_type: biz === 'sale' ? 'sell' : 'rent',
        ...(types.length ? { property_type: types } : {}),
      })
      .then((res: any) => {
        if (cancelled) return;
        const body = res?.data?.data ?? res?.data ?? [];
        setApiDistricts(Array.isArray(body) ? body : []);
      })
      .catch(() => {
        if (!cancelled) setApiDistricts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [locSel.cityKey, biz, filterTypesKey]);

  const districtList: RegionDistrict[] = useMemo(() => {
    if (apiDistricts && apiDistricts.length) {
      return apiDistricts.map((d) => ({
        key: String(d.district),
        label: d.listing_count > 0 ? `${d.district} (${d.listing_count})` : String(d.district),
        kws: [String(d.district).toLowerCase()],
      }));
    }
    return cityDistricts.map((c) => ({ key: c.key, label: c.label, kws: c.kws }));
  }, [apiDistricts, cityDistricts]);

  // 地图找房弹层：App 无原生地图库（Expo Go 不能加载原生地图模块），
  // 以「视野内房源列表」消费 /public/map-points。
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPoints, setMapPoints] = useState<PublicMapPoint[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState(false);
  // 地铁仅列当前定位城市的线路
  const cityMetroLines: RegionMetroLine[] = useMemo(
    () => METRO_LINES.filter((l) => l.cityKey === locSel.cityKey),
    [locSel.cityKey],
  );
  // 已选区域/地铁的关键词，用于匹配房源地址/标题
  const activeLocationKw = useMemo(() => {
    if (districtSel) {
      const node = districtList.find((d) => d.key === districtSel);
      return node ? node.kws : [];
    }
    if (metroSel.length) {
      const stations = METRO_LINES.flatMap((l) => l.stations);
      return stations.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws);
    }
    return [];
  }, [districtSel, metroSel, districtList]);

  // 全局城市作用域：当前定位城市下，房源必须命中该城任一城区关键词（整体过滤，链家式「定位城市看房」）
  const globalCityKw = useMemo(
    () => (locCity ? locCity.children.flatMap((d) => d.kws) : []),
    [locCity],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (biz === 'sale') {
      loadSaleListings().finally(() => setRefreshing(false));
    } else {
      loadListings({ force: true });
    }
  }, [loadListings, biz, loadSaleListings]);

  // 翻译（useCallback：引用稳定，配合 ListingCard 的 memo）
  const handleTranslate = useCallback(async (item: Listing) => {
    const source = translateSource(item);
    if (!source) {
      notify(t('common.hint'), t('list.noDesc'));
      return;
    }
    setTranslatingId(item.id);
    try {
      const res = await translateApi.translate(source, 'zh');
      const data = res.data;
      const text = data?.translated_text ?? '';
      notify(t('list.translateResult'), text || t('list.translateNoKey'));
    } catch {
      notify(t('list.translateFail'), t('prop.retryLater'));
    } finally {
      setTranslatingId(null);
    }
  }, [t]);

  // 进入房源详情（useCallback：引用稳定）；公开层卡片 id 为挂牌 id → 公开详情页（匿名可看）
  const goDetail = useCallback(
    (item: Listing) => navigation.navigate('PublicListingDetail', { id: item.id }),
    [navigation],
  );

  const filtered = useMemo(
    () =>
      listings.filter((it) => {
    if (statusFilter && it.status !== statusFilter) return false;
    // 朝向
    if (orientationSel && it.orientation !== orientationSel) return false;
    // 楼层段（低层 1-5 / 中层 6-15 / 高层 16+）
    if (floorSel) {
      const fl = Number(it.floor ?? 0);
      if (floorSel === 'low' && (fl < 1 || fl > 5)) return false;
      if (floorSel === 'mid' && (fl < 6 || fl > 15)) return false;
      if (floorSel === 'high' && fl < 16) return false;
    }
    // 装修
    if (decorSel && it.decoration !== decorSel) return false;
    // 配套设施（多选任一命中）
    if (amenitySel.length) {
      const tags = Array.isArray(it.amenities)
        ? it.amenities.map((a: any) => String(a))
        : [];
      if (!amenitySel.some((a) => tags.includes(a))) return false;
    }
    // 户型（1-4 室精确匹配；5室+ 覆盖 >=5；3居+ 覆盖 >=3）
    if (bedFilter) {
      const beds = Number(it.bedrooms ?? 0);
      if (bedFilter === '5') {
        if (beds < 5) return false;
      } else if (bedFilter === '3p') {
        if (beds < 3) return false;
      } else if (beds !== Number(bedFilter)) {
        return false;
      }
    }
    // 价格筛选（贝壳式：预设快捷区间 或 自定义最低/最高，万元 → THB）
    const rent = Number(it.monthly_rent ?? 0);
    let pMin = 0, pMax = Infinity;
    const preset = PRICE_RANGES.find((x) => x.key === priceRange);
    if (preset && preset.key) {
      pMin = preset.min;
      pMax = preset.max;
    } else if (customMin || customMax) {
      pMin = (Number(customMin) || 0) * 10000;
      pMax = (Number(customMax) || 0) * 10000;
    }
    if (rent < pMin || rent > pMax) return false;
    // 面积筛选（贝壳式：预设快捷区间 或 自定义最低/最高 ㎡）
    const sqm = Number(it.size_sqm ?? 0);
    let aMin = 0, aMax = Infinity;
    const areaPreset = AREA_PRESETS.find((x) => x.key === areaRange);
    if (areaPreset && areaPreset.key) {
      aMin = areaPreset.min;
      aMax = areaPreset.max;
    } else if (areaCustomMin || areaCustomMax) {
      aMin = Number(areaCustomMin) || 0;
      aMax = Number(areaCustomMax) || 0;
    }
    if ((aMin > 0 && sqm < aMin) || (isFinite(aMax) && aMax > 0 && sqm > aMax)) return false;
    if (keyword) {
      const kw = keyword.toLowerCase();
      const hay = `${it.title ?? ''} ${it.address ?? ''} ${it.room_number ?? ''}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    // 按区域/按地铁：命中已选城区/站点关键词
    if (activeLocationKw.length && !matchLocation(it, activeLocationKw)) {
      return false;
    }
    // 全局城市作用域（链家式：定位城市后只看该市房源）
    if (globalCityKw.length && !matchLocation(it, globalCityKw)) {
      return false;
    }
    return true;
      }),
    [listings, statusFilter, bedFilter, orientationSel, floorSel, decorSel, amenitySel, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax, keyword, activeLocationKw, globalCityKw, PRICE_RANGES, AREA_PRESETS],
  );

  // 排序（贝壳式 Tab）；「附近」开启时按离我最近优先，无坐标的房源排到最后
  const sortedData = useMemo(() => {
    const arr = [...filtered];
    if (nearby && userPos) {
      const pos = userPos;
      arr.sort((a, b) => {
        const da =
          a.lat != null && a.lng != null
            ? haversineKm(pos, { lat: a.lat, lng: a.lng })
            : Infinity;
        const db =
          b.lat != null && b.lng != null
            ? haversineKm(pos, { lat: b.lat, lng: b.lng })
            : Infinity;
        return da - db;
      });
      return arr;
    }
    switch (sortKey) {
      case 'price_asc':
        arr.sort((a, b) => (a.monthly_rent ?? 0) - (b.monthly_rent ?? 0));
        break;
      case 'price_desc':
        arr.sort((a, b) => (b.monthly_rent ?? 0) - (a.monthly_rent ?? 0));
        break;
      case 'area_desc':
        arr.sort((a, b) => (b.size_sqm ?? 0) - (a.size_sqm ?? 0));
        break;
      default:
        break;
    }
    return arr;
  }, [filtered, sortKey, nearby, userPos]);

  // 买房 Tab 数据（真实挂牌，按关键字 + 居室快选过滤）
  const saleFiltered = useMemo(() => {
    let arr = saleListings;
    if (bedFilter) {
      arr = arr.filter((s) => {
        const n = Number(s.bedrooms ?? 0);
        return bedFilter === '3p' ? n >= 3 : n === Number(bedFilter);
      });
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      arr = arr.filter((s) =>
        `${s.title ?? ''} ${s.address ?? ''}`.toLowerCase().includes(kw),
      );
    }
    return arr;
  }, [saleListings, keyword, bedFilter]);

  // 「附近」：切换离我最近排序。首次开启才申请定位权限（避免一进页面就弹权限框）
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
    // 当前数据集里一个坐标都没有时排序无从谈起，如实提示而不是假装排好了
    const src = biz === 'sale' ? saleFiltered : filtered;
    if (!src.some((it: any) => it.lat != null && it.lng != null)) {
      notify(t('common.hint'), t('list.nearbyNoData'));
      return;
    }
    setNearby(true);
  }, [nearby, userPos, biz, saleFiltered, filtered, t]);

  // 地图点位拉取：覆盖全业务（租/售/新房/二手房/商办/厂房），按当前筛选收敛
  const loadMapPoints = useCallback(async () => {
    setMapLoading(true);
    setMapError(false);
    try {
      const params: any = {
        limit: 50,
        listing_type: biz === 'sale' ? 'sell' : 'rent',
        ...(locSel.cityKey ? { city: locSel.cityKey } : {}),
        ...(filterTypes.length ? { property_type: filterTypes } : {}),
        ...(isNew === undefined ? {} : { is_new_development: isNew }),
        ...(keyword.trim() ? { q: keyword.trim() } : {}),
        // 区域仅在拿到真实区域时才作为服务端参数（静态回退 key 不是真实区域名，传了反而空）
        ...(apiDistricts && apiDistricts.length && districtSel ? { district: districtSel } : {}),
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
  }, [biz, locSel.cityKey, filterTypes, isNew, keyword, apiDistricts, districtSel]);

  // 「去地图看」：App 无原生地图库（Expo Go 不能加载原生地图模块），
  // 以「视野内房源列表」消费 /public/map-points（价格/面积/房型/距离），点行进公开详情。
  const handleGoMap = useCallback(() => {
    setMapOpen(true);
    // 非阻塞取定位：拿到就显示距离，拿不到（拒绝/失败）不显示距离，不影响列表
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

  // ---------- 受控筛选：聚合为 filters 下发给展示组件，回写时按字段分发 ----------
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
      isNew,
    }),
    [
      keyword, districtSel, metroSel, priceRange, customMin, customMax, bedFilter,
      statusFilter, orientationSel, floorSel, decorSel, amenitySel, areaRange,
      areaCustomMin, areaCustomMax, sortKey, schoolId, schoolKm, schoolKw, filterTypes, isNew,
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
    if ('isNew' in patch) setIsNew(patch.isNew);
  }, []);

  const handlePanelOpen = useCallback(
    (key: 'region' | 'price' | 'more' | 'sort') => {
      if (key === 'more') loadSchools();
    },
    [loadSchools],
  );

  // 空态重试：按当前业务 Tab 重拉对应数据源
  const handleRetry = useCallback(() => {
    if (biz === 'sale') {
      loadSaleListings();
    } else {
      setLoading(true);
      loadListings();
    }
  }, [biz, loadSaleListings, loadListings]);

  return (
    <View style={styles.container}>
      <ListingsFeed
        items={biz === 'sale' ? saleFiltered : sortedData}
        loading={loading}
        error={biz === 'sale' ? saleError : loadError}
        emptyLoading={biz === 'sale' && saleLoading}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onRetry={handleRetry}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        favSet={favSet}
        favPending={favLoading}
        onToggleFav={handleToggleFav}
        biz={biz}
        onBizChange={setBiz}
        onOpenDetail={goDetail}
        districts={districtList}
        metroLines={cityMetroLines}
        cityLabel={locSel.cityLabel}
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

      {/* 地图找房弹层：共享组件（员工端「房源」页复用同一弹层，保证 1:1）。
          App 无原生地图库（Expo Go 不能加载原生地图模块），以「视野内房源列表」
          消费 /public/map-points（价格/面积/房型/距离），点行进房源详情。 */}
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
          navigation.navigate('PublicListingDetail', { id: p.id });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
