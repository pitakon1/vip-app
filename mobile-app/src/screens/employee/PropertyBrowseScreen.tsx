/**
 * 员工端房源浏览：搜索 + 筛选（区域/价格/更多/排序；学校/户型/面积/朝向/楼层/装修/配套/状态/类型 收进「更多」）
 * + 房源卡片（收藏 / 分享客户 / 预约带看）+ 加载更多
 * 原型：employee-mobile-property-browse.html（底部导航「房源」Tab）
 * 数据源：/properties（分页 + 关键词/区域同义词/学校半径/价格/面积/房型/朝向/装修/配套/状态/排序）、/favorites
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
  Share,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';
import { favoritesApi } from '@/services/api';
import { publicApi, unwrapPage, type PublicSchool } from '@/services/publicApi';
import { SCHOOL_RADIUS_OPTIONS } from '@/lib/publicSite';
import { AREA_GROUPS } from '@/data/locationArea';

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
  floor?: number | null;
  furnished?: boolean;
  photos?: unknown[] | null;
  video_url?: string | null;
}

const TYPE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  apartment: { label: '住宅', icon: 'business-outline', color: colors.primary },
  condo: { label: '公寓', icon: 'business-outline', color: colors.info },
  house: { label: '别墅', icon: 'home-outline', color: colors.success },
  villa: { label: '别墅', icon: 'home-outline', color: colors.success },
  commercial: { label: '商铺', icon: 'storefront-outline', color: colors.warning },
  office: { label: '写字楼', icon: 'business-outline', color: colors.ink2 },
};

// ---------- 与 C 端找房页对齐的筛选口径 ----------

// 价格快捷区间（月租 THB；3 万 = 30000，走接口 price_min/price_max）
const PRICE_RANGES: { key: string; label: string; min: number; max: number }[] = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u3', label: '≤3万', min: 0, max: 30000 },
  { key: '3-5', label: '3-5万', min: 30000, max: 50000 },
  { key: '5-8', label: '5-8万', min: 50000, max: 80000 },
  { key: 'g8', label: '≥8万', min: 80000, max: Infinity },
];

// 户型（走接口 bedrooms_min / bedrooms_max）
const BEDROOM_OPTIONS: { key: string; label: string; min?: number; max?: number }[] = [
  { key: '', label: '不限' },
  { key: '1', label: '1室', min: 1, max: 1 },
  { key: '2', label: '2室', min: 2, max: 2 },
  { key: '3', label: '3室', min: 3, max: 3 },
  { key: '4', label: '4室', min: 4, max: 4 },
  { key: '5', label: '5室+', min: 5 },
];

// 房源类型（后端 /properties 无该参数，前端本地过滤）
const PROPERTY_TYPE_FILTERS = [
  { key: '', label: '不限' },
  { key: 'apartment', label: '公寓' },
  { key: 'condo', label: '公寓式' },
  { key: 'villa', label: '别墅' },
  { key: 'house', label: '独栋' },
  { key: 'office', label: '写字楼' },
  { key: 'shop', label: '商铺' },
];

// 朝向（后端 orientation 参数）
const ORIENTATION_OPTIONS = [
  { key: '', label: '不限' },
  { key: 'north', label: '北' },
  { key: 'south', label: '南' },
  { key: 'east', label: '东' },
  { key: 'west', label: '西' },
  { key: 'northeast', label: '东北' },
  { key: 'northwest', label: '西北' },
  { key: 'southeast', label: '东南' },
  { key: 'southwest', label: '西南' },
];

// 楼层段（后端 floor_level 参数 low/mid/high）
const FLOOR_LEVEL_OPTIONS = [
  { key: '', label: '不限' },
  { key: 'low', label: '低楼层(1-5层)' },
  { key: 'mid', label: '中楼层(6-15层)' },
  { key: 'high', label: '高楼层(16层+)' },
];

// 装修（后端 decoration 参数）
const DECORATION_OPTIONS = [
  { key: '', label: '不限' },
  { key: 'bare', label: '毛坯' },
  { key: 'simple', label: '简装' },
  { key: 'standard', label: '精装' },
  { key: 'luxury', label: '豪装' },
  { key: 'fully_furnished', label: '带家具家电' },
];

// 配套设施（后端 amenity 多选任一命中）
const AMENITY_OPTIONS = [
  { key: 'aircon', label: '空调' },
  { key: 'pool', label: '泳池' },
  { key: 'gym', label: '健身房' },
  { key: 'parking', label: '停车位' },
  { key: 'elevator', label: '电梯' },
  { key: 'balcony', label: '阳台' },
  { key: 'garden', label: '花园/庭院' },
];

// 面积快捷区间（㎡，走接口 area_min/area_max）
const AREA_PRESETS: { key: string; label: string; min: number; max: number }[] = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u50', label: '≤50㎡', min: 0, max: 50 },
  { key: '50-100', label: '50-100㎡', min: 50, max: 100 },
  { key: '100-150', label: '100-150㎡', min: 100, max: 150 },
  { key: '150-200', label: '150-200㎡', min: 150, max: 200 },
  { key: 'g200', label: '≥200㎡', min: 200, max: Infinity },
];

// 房源状态（后端 status 参数）
const STATUS_FILTERS = [
  { key: '', label: '不限' },
  { key: 'vacant', label: '空置' },
  { key: 'rented', label: '已出租' },
  { key: 'reserved', label: '已预订' },
  { key: 'maintenance', label: '维护中' },
];

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'default', label: '默认排序' },
  { key: 'latest', label: '最新发布' },
  { key: 'price_asc', label: '价格从低到高' },
  { key: 'price_desc', label: '价格从高到低' },
  { key: 'area_desc', label: '面积从大到小' },
];

const ALL_DISTRICTS = AREA_GROUPS.flatMap((g) => g.children);

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

type OpenTab = null | 'region' | 'price' | 'more' | 'sort';

export default function PropertyBrowseScreen() {
  const [items, setItems] = useState<PropertyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [districtKey, setDistrictKey] = useState('');
  // 区域面板：国家 → 省市 → 城区 三级下钻。左栏只列国家，右栏默认是该国家的省市列表，
  // 点某个省市后右栏才换成它的城区 chips（顶部「返回」回到省市列表）。
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country);
  const [areaDrill, setAreaDrill] = useState<string>(''); // 已下钻的省市 cityKey，空 = 停在省市列表
  // 学校筛选（收进「更多」）：后端按学校坐标 + 半径反查覆盖的小区
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolKm, setSchoolKm] = useState(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [schoolKw, setSchoolKw] = useState('');
  // 价格筛选（快捷区间 + 自定义最低/最高，单位 万/月 → THB）
  const [priceKey, setPriceKey] = useState('');
  const [customMin, setCustomMin] = useState('');
  const [customMax, setCustomMax] = useState('');
  // 户型筛选（收进「更多」）
  const [bedKey, setBedKey] = useState('');
  // 「更多」面板收纳：房源类型 / 户型 / 学校 / 朝向 / 楼层 / 面积 / 装修 / 配套 / 状态
  const [propType, setPropType] = useState('');
  const [orientationSel, setOrientationSel] = useState('');
  const [floorSel, setFloorSel] = useState('');
  const [areaRange, setAreaRange] = useState('');
  const [areaCustomMin, setAreaCustomMin] = useState('');
  const [areaCustomMax, setAreaCustomMax] = useState('');
  const [decorSel, setDecorSel] = useState('');
  const [amenitySel, setAmenitySel] = useState<string[]>([]);
  const [statusSel, setStatusSel] = useState('');
  const [sortKey, setSortKey] = useState('default');
  const [openTab, setOpenTab] = useState<OpenTab>(null);
  const [favSet, setFavSet] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);

  // 组装查询参数：除「房源类型」为本地产过滤外，其余均走服务端 /properties
  const buildParams = useCallback(
    (targetPage: number) => {
      const params: Record<string, unknown> = { page: targetPage, page_size: PAGE_SIZE };
      // 后端 sort 无「默认排序」取值：default 不传，由后端落回最新/相关性
      if (sortKey !== 'default') params.sort = sortKey;
      const kw = keyword.trim();
      if (kw) params.q = kw;
      const district = ALL_DISTRICTS.find((d) => d.key === districtKey);
      if (district) params.keywords = district.kws;
      if (schoolId) {
        params.school_id = schoolId;
        params.school_radius_km = schoolKm;
      }
      let pMin = 0;
      let pMax = Infinity;
      const preset = PRICE_RANGES.find((p) => p.key === priceKey);
      if (preset && preset.key) {
        pMin = preset.min;
        pMax = preset.max;
      } else if (customMin || customMax) {
        pMin = (Number(customMin) || 0) * 10000;
        pMax = (Number(customMax) || 0) * 10000;
      }
      if (isFinite(pMin) && pMin > 0) params.price_min = pMin;
      if (isFinite(pMax) && pMax !== Infinity) params.price_max = pMax;
      const bed = BEDROOM_OPTIONS.find((b) => b.key === bedKey);
      if (bed?.min !== undefined) params.bedrooms_min = bed.min;
      if (bed?.max !== undefined) params.bedrooms_max = bed.max;
      if (orientationSel) params.orientation = orientationSel;
      if (floorSel) params.floor_level = floorSel;
      if (decorSel) params.decoration = decorSel;
      if (amenitySel.length) params.amenity = amenitySel;
      if (statusSel) params.status = statusSel;
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
    [keyword, districtKey, schoolId, schoolKm, priceKey, customMin, customMax, bedKey, orientationSel, floorSel, decorSel, amenitySel, statusSel, areaRange, areaCustomMin, areaCustomMax, sortKey],
  );

  const load = useCallback(
    async (options?: { nextPage?: number }) => {
      const targetPage = options?.nextPage ?? 1;
      try {
        const res = await api.get('/properties', {
          params: buildParams(targetPage),
          paramsSerializer: { indexes: null },
        });
        const data = res.data as { items?: PropertyItem[]; total?: number; total_pages?: number };
        const list = Array.isArray(data) ? (data as unknown as PropertyItem[]) : (data?.items ?? []);
        setItems((prev) => (targetPage === 1 ? list : [...prev, ...list]));
        setTotal(data?.total ?? list.length);
        setTotalPages(data?.total_pages ?? 1);
        setPage(targetPage);
      } catch {
        if (targetPage === 1) {
          setItems([]);
          setTotal(0);
          setTotalPages(1);
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
  }, [keyword, districtKey, schoolId, schoolKm, priceKey, customMin, customMax, bedKey, orientationSel, floorSel, decorSel, amenitySel, statusSel, areaRange, areaCustomMin, areaCustomMax, sortKey]);

  // 学校候选：首次展开「更多」面板时懒加载一次
  useEffect(() => {
    if (openTab !== 'more' || schoolsLoaded) return;
    setSchoolsLoaded(true);
    publicApi
      .schools({ page_size: 100 })
      .then((res: any) => setSchools(unwrapPage<PublicSchool>(res?.data).items))
      .catch(() => setSchools([]));
  }, [openTab, schoolsLoaded]);

  const filteredSchools = useMemo(() => {
    const kw = schoolKw.trim().toLowerCase();
    if (!kw) return schools;
    return schools.filter((s) =>
      `${s.name ?? ''} ${s.name_en ?? ''} ${s.district ?? ''}`.toLowerCase().includes(kw),
    );
  }, [schools, schoolKw]);

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

  const toggleFav = async (p: PropertyItem) => {
    const current = !!favSet[p.id];
    try {
      if (current) {
        await favoritesApi.remove(p.id);
      } else {
        await favoritesApi.toggle(p.id);
      }
      setFavSet((s) => ({ ...s, [p.id]: !current }));
    } catch {
      Alert.alert('操作失败', '请稍后重试');
    }
  };

  // 分享客户：调用系统分享，把房源关键信息发给客户
  const shareToClient = async (p: PropertyItem) => {
    const title = [p.room_number, p.building].filter(Boolean).join(' ') || p.address || '房源';
    const price = `${symOf(p.currency)}${Number(p.monthly_rent || 0).toLocaleString()}/月`;
    const spec = [
      p.size_sqm ? `${p.size_sqm}㎡` : null,
      p.bedrooms ? `${p.bedrooms}室` : null,
      p.bathrooms ? `${p.bathrooms}卫` : null,
    ]
      .filter(Boolean)
      .join(' ');
    try {
      await Share.share({
        message: [title, p.address, [spec, price].filter(Boolean).join(' · ')]
          .filter(Boolean)
          .join('\n'),
      });
    } catch {
      // 用户取消分享无需提示
    }
  };

  // 区域面板左栏：国家清单（按 AREA_GROUPS 出现顺序去重，保持「泰国 → 越南 → …」的业务顺序）
  const countryList = useMemo(() => Array.from(new Set(AREA_GROUPS.map((g) => g.country))), []);
  // 左栏宽度按最长国家名动态推导（避免留白）：最长字幕数×字号13 + 条目横向padding 6×2 + 2缓冲
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

  // ---------- 贝壳式 Tab 下拉面板：开合 / 重置 / 确定 ----------
  const hasPriceFilter = !!(priceKey || customMin || customMax);
  const hasAreaFilter = !!(areaRange || areaCustomMin || areaCustomMax);
  // 「更多」收纳了学校 / 户型 / 面积 / 朝向 / 楼层 / 装修 / 配套 / 状态 / 房源类型，角标按已生效组数计
  const moreBadge =
    (propType ? 1 : 0) +
    (schoolId ? 1 : 0) +
    (bedKey ? 1 : 0) +
    (hasAreaFilter ? 1 : 0) +
    (statusSel ? 1 : 0) +
    (orientationSel ? 1 : 0) +
    (floorSel ? 1 : 0) +
    (decorSel ? 1 : 0) +
    (amenitySel.length ? 1 : 0);

  // 筛选 chip 当前展示文案
  const regionLabel = districtKey
    ? ALL_DISTRICTS.find((d) => d.key === districtKey)?.label ?? '区域'
    : '区域';
  const priceLabel = priceKey
    ? PRICE_RANGES.find((p) => p.key === priceKey)?.label ?? '价格'
    : customMin || customMax
    ? '自定义'
    : '价格';
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label ?? '排序';
  const chips: { key: Exclude<OpenTab, null>; label: string; active: boolean; badge?: number }[] = [
    { key: 'region', label: regionLabel, active: !!districtKey },
    { key: 'price', label: hasPriceFilter ? priceLabel : '价格', active: hasPriceFilter },
    { key: 'more', label: '更多', active: moreBadge > 0, badge: moreBadge },
    { key: 'sort', label: sortKey !== 'default' ? sortLabel : '排序', active: sortKey !== 'default' },
  ];

  // 面板开合：打开区域面板时回显——已选城区则直接下钻到它所在的省市，
  // 否则停在省市列表，用户不必再从长列表里找回已选城市
  const toggleTab = (key: Exclude<OpenTab, null>) => {
    if (openTab === key) {
      setOpenTab(null);
      return;
    }
    if (key === 'region' && districtKey) {
      const g = AREA_GROUPS.find((x) => x.children.some((d) => d.key === districtKey));
      if (g) {
        setAreaCountry(g.country);
        setAreaDrill(g.cityKey);
      }
    }
    setOpenTab(key);
  };

  const resetCurrent = (key: Exclude<OpenTab, null>) => {
    if (key === 'region') {
      setDistrictKey('');
    } else if (key === 'price') {
      setPriceKey('');
      setCustomMin('');
      setCustomMax('');
    } else if (key === 'more') {
      setSchoolId('');
      setSchoolName('');
      setSchoolKm(3);
      setBedKey('');
      setPropType('');
      setAreaRange('');
      setAreaCustomMin('');
      setAreaCustomMax('');
      setStatusSel('');
      setOrientationSel('');
      setFloorSel('');
      setDecorSel('');
      setAmenitySel([]);
    } else if (key === 'sort') {
      setSortKey('default');
    }
  };

  // 「房源类型」后端无参数，前端本地过滤（其余维度均已在服务端收敛）
  const visibleItems = useMemo(
    () => (propType ? items.filter((it) => it.property_type === propType) : items),
    [items, propType],
  );
  const shownTotal = propType ? visibleItems.length : total;

  const renderCard = (p: PropertyItem) => {
    const type = TYPE_META[p.property_type ?? 'apartment'] ?? TYPE_META.apartment;
    const title = [p.room_number, p.building].filter(Boolean).join(' · ') || p.address || '房源';
    // 特征行：面积 | 楼层 | 装修（均为真实字段）
    const feature = [
      p.size_sqm ? `${p.size_sqm}㎡` : null,
      p.bedrooms ? `${p.bedrooms}室${p.bathrooms ?? 0}卫` : null,
      p.floor ? `${p.floor} 层` : null,
      p.furnished ? '精装修' : null,
    ]
      .filter(Boolean)
      .join(' | ');
    const tags = [
      p.video_url ? '视频看房' : null,
      Array.isArray(p.photos) && p.photos.length > 0 ? `${p.photos.length} 张照片` : null,
      p.status === 'vacant' ? '随时看房' : null,
    ].filter(Boolean) as string[];

    return (
      <View key={p.id} style={styles.card}>
        <View style={[styles.thumb, { backgroundColor: type.color }]}>
          <Ionicons name={type.icon} size={26} color={colors.primaryForeground} />
          <TouchableOpacity
            style={styles.favBtn}
            activeOpacity={0.8}
            onPress={() => toggleFav(p)}
          >
            <Ionicons
              name={favSet[p.id] ? 'heart' : 'heart-outline'}
              size={15}
              color={colors.primary}
            />
          </TouchableOpacity>
          <View style={styles.typeBadge}>
            <Text style={[styles.typeBadgeText, { color: type.color }]}>{type.label}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.price}>
              {symOf(p.currency)}
              {Number(p.monthly_rent || 0).toLocaleString()}
              <Text style={styles.priceUnit}>/月</Text>
            </Text>
          </View>
          <Text style={styles.addr} numberOfLines={1}>
            {p.address || '暂无地址'}
          </Text>
          {feature ? <Text style={styles.feature}>{feature}</Text> : null}
          {tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.ghostBtn}
              activeOpacity={0.8}
              onPress={() => shareToClient(p)}
            >
              <Text style={styles.ghostBtnText}>分享客户</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label="正在加载房源…" />
      </View>
    );
  }

  const hasFilter = !!(
    keyword ||
    districtKey ||
    hasPriceFilter ||
    moreBadge ||
    sortKey !== 'default'
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* 搜索 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索小区、地址、地铁..."
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
        {keyword ? (
          <TouchableOpacity onPress={() => setKeyword('')} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={16} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 筛选 chips（区域/价格/更多/排序，精简顶栏避免拥挤截断） */}
      <View style={styles.chipRow}>
        {chips.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.chip, (c.active || openTab === c.key) && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => toggleTab(c.key)}
          >
            <Text
              numberOfLines={1}
              style={[styles.chipText, (c.active || openTab === c.key) && styles.chipTextActive]}
            >
              {c.label}
            </Text>
            {!!c.badge && (
              <View style={styles.chipBadge}>
                <Text style={styles.chipBadgeText}>{c.badge}</Text>
              </View>
            )}
            <Ionicons
              name={openTab === c.key ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={c.active || openTab === c.key ? colors.primary : colors.ink3}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* 下拉面板 */}
      {openTab !== null ? (
        <View style={styles.panel}>
          {openTab === 'region' ? (
            <>
              <Text style={styles.panelTitle}>按区域筛选</Text>
              <View style={styles.panelArea}>
                <ScrollView style={[styles.areaCol, { width: areaLeftWidth, flexGrow: 0, flexShrink: 0 }]} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {countryList.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.areaColItem, areaCountry === c && styles.areaColItemActive]}
                      activeOpacity={0.7}
                      onPress={() => pickAreaCountry(c)}
                    >
                      <Text style={[styles.areaColText, areaCountry === c && styles.areaColTextActive]}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <ScrollView style={styles.areaBody} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {activeAreaGroup ? (
                    <>
                      <View style={styles.areaHead}>
                        <TouchableOpacity
                          style={styles.areaBack}
                          activeOpacity={0.7}
                          onPress={() => setAreaDrill('')}
                        >
                          <Ionicons name="chevron-back" size={12} color={colors.ink3} />
                          <Text style={styles.areaBackText}>{areaCountry}</Text>
                        </TouchableOpacity>
                        <Text style={styles.areaHeadTitle}>{activeAreaGroup.cityLabel}</Text>
                      </View>
                      <View style={styles.panelChips}>
                        <TouchableOpacity
                          style={[styles.optionChip, !districtKey && styles.optionChipActive]}
                          activeOpacity={0.7}
                          onPress={() => {
                            setDistrictKey('');
                            setOpenTab(null);
                          }}
                        >
                          <Text style={[styles.optionText, !districtKey && styles.optionTextActive]}>
                            不限
                          </Text>
                        </TouchableOpacity>
                        {activeAreaGroup.children.map((d) => (
                          <TouchableOpacity
                            key={d.key}
                            style={[styles.optionChip, districtKey === d.key && styles.optionChipActive]}
                            activeOpacity={0.7}
                            onPress={() => {
                              setDistrictKey(districtKey === d.key ? '' : d.key);
                              setOpenTab(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.optionText,
                                districtKey === d.key && styles.optionTextActive,
                              ]}
                            >
                              {d.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.areaHeadTitle}>{areaCountry}</Text>
                      <View style={styles.panelChips}>
                        {countryGroups.map((g) => (
                          <TouchableOpacity
                            key={g.cityKey}
                            style={[styles.optionChip, areaDrill === g.cityKey && styles.optionChipActive]}
                            activeOpacity={0.7}
                            onPress={() => setAreaDrill(g.cityKey)}
                          >
                            <Text
                              style={[styles.optionText, areaDrill === g.cityKey && styles.optionTextActive]}
                            >
                              {g.cityLabel}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </ScrollView>
              </View>
            </>
          ) : null}

          {openTab === 'price' ? (
            <>
              <Text style={styles.panelTitle}>按价格筛选</Text>
              <Text style={styles.panelGroupTitle}>快捷选择</Text>
              <View style={styles.panelChips}>
                {PRICE_RANGES.map((p) => (
                  <TouchableOpacity
                    key={p.key || 'all'}
                    style={[styles.optionChip, priceKey === p.key && styles.optionChipActive]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setPriceKey(p.key);
                      if (p.key) {
                        setCustomMin('');
                        setCustomMax('');
                      }
                    }}
                  >
                    <Text style={[styles.optionText, priceKey === p.key && styles.optionTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.panelGroupTitle}>自定义价格</Text>
              <View style={styles.priceCustomRow}>
                <View style={styles.priceCustomInput}>
                  <Text style={styles.priceCustomPrefix}>฿</Text>
                  <TextInput
                    style={styles.priceCustomField}
                    value={customMin}
                    onChangeText={(v) => {
                      setCustomMin(v.replace(/[^\d]/g, ''));
                      if (v) setPriceKey('');
                    }}
                    placeholder="最低价"
                    placeholderTextColor={colors.ink3}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.priceCustomUnit}>万/月</Text>
                </View>
                <Text style={styles.priceCustomDivider}>至</Text>
                <View style={styles.priceCustomInput}>
                  <Text style={styles.priceCustomPrefix}>฿</Text>
                  <TextInput
                    style={styles.priceCustomField}
                    value={customMax}
                    onChangeText={(v) => {
                      setCustomMax(v.replace(/[^\d]/g, ''));
                      if (v) setPriceKey('');
                    }}
                    placeholder="最高价"
                    placeholderTextColor={colors.ink3}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.priceCustomUnit}>万/月</Text>
                </View>
              </View>
              <View style={styles.panelActions}>
                <TouchableOpacity style={styles.resetBtn} activeOpacity={0.7} onPress={() => resetCurrent('price')}>
                  <Text style={styles.resetText}>重置</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} activeOpacity={0.7} onPress={() => setOpenTab(null)}>
                  <Text style={styles.confirmText}>确定</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {openTab === 'more' ? (
            <>
              <Text style={styles.panelTitle}>更多筛选</Text>
              <ScrollView style={styles.dropBodyTall} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {/* 户型 */}
                <Text style={styles.panelGroupTitle}>户型</Text>
                <View style={styles.panelChips}>
                  {BEDROOM_OPTIONS.map((b) => (
                    <TouchableOpacity
                      key={b.key || 'all'}
                      style={[styles.optionChip, bedKey === b.key && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => setBedKey(b.key)}
                    >
                      <Text style={[styles.optionText, bedKey === b.key && styles.optionTextActive]}>
                        {b.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {/* 学校：距离范围 + 搜索 + 学校列表 */}
                <Text style={styles.panelGroupTitle}>学校 · 距离</Text>
                <View style={styles.panelChips}>
                  {SCHOOL_RADIUS_OPTIONS.map((km) => (
                    <TouchableOpacity
                      key={km}
                      style={[styles.optionChip, schoolKm === km && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => setSchoolKm(km)}
                    >
                      <Text style={[styles.optionText, schoolKm === km && styles.optionTextActive]}>
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
                <View style={styles.panelChips}>
                  <TouchableOpacity
                    style={[styles.optionChip, !schoolId && styles.optionChipActive]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSchoolId('');
                      setSchoolName('');
                    }}
                  >
                    <Text style={[styles.optionText, !schoolId && styles.optionTextActive]}>不限</Text>
                  </TouchableOpacity>
                  {filteredSchools.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.optionChip, schoolId === s.id && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSchoolId(s.id);
                        setSchoolName(s.name ?? '学校');
                      }}
                    >
                      <Text style={[styles.optionText, schoolId === s.id && styles.optionTextActive]}>
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {schoolsLoaded && !filteredSchools.length && (
                  <Text style={styles.dropEmpty}>暂无匹配学校</Text>
                )}
                {/* 房源类型 */}
                <Text style={styles.panelGroupTitle}>房源类型</Text>
                <View style={styles.panelChips}>
                  {PROPERTY_TYPE_FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f.key || 'all'}
                      style={[styles.optionChip, propType === f.key && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => setPropType(f.key)}
                    >
                      <Text style={[styles.optionText, propType === f.key && styles.optionTextActive]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {/* 面积 */}
                <Text style={styles.panelGroupTitle}>面积</Text>
                <View style={styles.panelChips}>
                  {AREA_PRESETS.map((a) => (
                    <TouchableOpacity
                      key={a.key || 'all'}
                      style={[styles.optionChip, areaRange === a.key && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setAreaRange(a.key);
                        if (a.key) {
                          setAreaCustomMin('');
                          setAreaCustomMax('');
                        }
                      }}
                    >
                      <Text style={[styles.optionText, areaRange === a.key && styles.optionTextActive]}>
                        {a.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.priceCustomRow}>
                  <View style={styles.priceCustomInput}>
                    <TextInput
                      style={styles.priceCustomField}
                      value={areaCustomMin}
                      onChangeText={(v) => {
                        setAreaCustomMin(v.replace(/[^\d]/g, ''));
                        if (v) setAreaRange('');
                      }}
                      placeholder="最低㎡"
                      placeholderTextColor={colors.ink3}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.priceCustomUnit}>㎡</Text>
                  </View>
                  <Text style={styles.priceCustomDivider}>至</Text>
                  <View style={styles.priceCustomInput}>
                    <TextInput
                      style={styles.priceCustomField}
                      value={areaCustomMax}
                      onChangeText={(v) => {
                        setAreaCustomMax(v.replace(/[^\d]/g, ''));
                        if (v) setAreaRange('');
                      }}
                      placeholder="最高㎡"
                      placeholderTextColor={colors.ink3}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.priceCustomUnit}>㎡</Text>
                  </View>
                </View>
                {/* 朝向 */}
                <Text style={styles.panelGroupTitle}>朝向</Text>
                <View style={styles.panelChips}>
                  {ORIENTATION_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o.key || 'all'}
                      style={[styles.optionChip, orientationSel === o.key && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => setOrientationSel(o.key)}
                    >
                      <Text style={[styles.optionText, orientationSel === o.key && styles.optionTextActive]}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {/* 楼层 */}
                <Text style={styles.panelGroupTitle}>楼层</Text>
                <View style={styles.panelChips}>
                  {FLOOR_LEVEL_OPTIONS.map((fl) => (
                    <TouchableOpacity
                      key={fl.key || 'all'}
                      style={[styles.optionChip, floorSel === fl.key && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => setFloorSel(fl.key)}
                    >
                      <Text style={[styles.optionText, floorSel === fl.key && styles.optionTextActive]}>
                        {fl.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {/* 装修 */}
                <Text style={styles.panelGroupTitle}>装修</Text>
                <View style={styles.panelChips}>
                  {DECORATION_OPTIONS.map((d) => (
                    <TouchableOpacity
                      key={d.key || 'all'}
                      style={[styles.optionChip, decorSel === d.key && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => setDecorSel(d.key)}
                    >
                      <Text style={[styles.optionText, decorSel === d.key && styles.optionTextActive]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {/* 配套设施 */}
                <Text style={styles.panelGroupTitle}>配套设施</Text>
                <View style={styles.panelChips}>
                  {AMENITY_OPTIONS.map((a) => {
                    const on = amenitySel.includes(a.key);
                    return (
                      <TouchableOpacity
                        key={a.key}
                        style={[styles.optionChip, on && styles.optionChipActive]}
                        activeOpacity={0.7}
                        onPress={() =>
                          setAmenitySel((cur) =>
                            on ? cur.filter((k) => k !== a.key) : [...cur, a.key],
                          )
                        }
                      >
                        <Text style={[styles.optionText, on && styles.optionTextActive]}>{a.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* 房源状态 */}
                <Text style={styles.panelGroupTitle}>房源状态</Text>
                <View style={styles.panelChips}>
                  {STATUS_FILTERS.map((s) => (
                    <TouchableOpacity
                      key={s.key || 'all'}
                      style={[styles.optionChip, statusSel === s.key && styles.optionChipActive]}
                      activeOpacity={0.7}
                      onPress={() => setStatusSel(s.key)}
                    >
                      <Text style={[styles.optionText, statusSel === s.key && styles.optionTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.panelActions}>
                <TouchableOpacity style={styles.resetBtn} activeOpacity={0.7} onPress={() => resetCurrent('more')}>
                  <Text style={styles.resetText}>重置</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} activeOpacity={0.7} onPress={() => setOpenTab(null)}>
                  <Text style={styles.confirmText}>确定</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {openTab === 'sort' ? (
            <>
              <Text style={styles.panelTitle}>排序方式</Text>
              {SORT_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={styles.sortItem}
                  onPress={() => {
                    setSortKey(s.key);
                    setOpenTab(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sortText, sortKey === s.key && styles.sortTextActive]}>
                    {s.label}
                  </Text>
                  {sortKey === s.key ? (
                    <Ionicons name="checkmark" size={16} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      {/* 结果统计 */}
      <Text style={styles.countRow}>
        共 <Text style={styles.countStrong}>{shownTotal}</Text> 套房源
      </Text>

      {visibleItems.length === 0 ? (
        <EmptyState
          icon="home-outline"
          title="暂无房源"
          sub={hasFilter ? '换个关键词或筛选条件试试' : '暂无可浏览的房源'}
        />
      ) : (
        <View style={styles.list}>
          {visibleItems.map((p) => renderCard(p))}

          {page < totalPages ? (
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
          ) : null}
        </View>
      )}
    </ScrollView>
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

  chipRow: {
    flexDirection: 'row',
    gap: colors.spacing.sm,
    paddingHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.md,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
  },
  // 4 个筛选按钮等分铺满整行（flex:1），避免右侧留白；选中态浅底高亮
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  chipActive: { backgroundColor: colors.alpha(colors.primaryRgb, 0.08) },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '500', maxWidth: 96 },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  chipBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  chipBadgeText: { fontSize: 10, fontWeight: '700', color: colors.primaryForeground },

  panel: {
    marginHorizontal: 0,
    marginTop: 6,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 0,
    borderWidth: 0,
    ...colors.shadow.card,
  },
  panelTitle: { fontSize: 12, color: colors.ink3, marginBottom: colors.spacing.sm },
  panelGroupTitle: { fontSize: 12, color: colors.ink2, fontWeight: '600', marginBottom: 6, marginTop: colors.spacing.sm },
  panelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: colors.spacing.sm },
  // 区域面板两栏：左栏固定宽度只放国家，右栏放省市 / 城区（链家式两栏观感）
  panelArea: { flexDirection: 'row', maxHeight: 240 },
  areaCol: {
    width: 66,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  areaColItem: { paddingVertical: 9, paddingHorizontal: 6 },
  areaColItemActive: { backgroundColor: colors.alpha(colors.primaryRgb, 0.08) },
  areaColText: { fontSize: 13, color: colors.ink2 },
  areaColTextActive: { color: colors.primary, fontWeight: '600' },
  areaBody: { flex: 1, paddingLeft: colors.spacing.md },
  areaHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  areaBack: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  areaBackText: { fontSize: 12, color: colors.ink3 },
  areaHeadTitle: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  optionChipActive: { backgroundColor: colors.primary },
  optionText: { fontSize: 13, color: colors.ink2 },
  optionTextActive: { color: colors.primaryForeground, fontWeight: '600' },

  dropSearch: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.ink,
    marginTop: colors.spacing.sm,
    marginBottom: colors.spacing.sm,
  },
  dropBodyTall: { maxHeight: 380 },
  dropEmpty: { fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: colors.spacing.sm },

  priceCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: colors.spacing.sm },
  priceCustomInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 8,
  },
  priceCustomPrefix: { fontSize: 12, color: colors.ink3 },
  priceCustomField: { flex: 1, paddingVertical: 8, fontSize: 13, color: colors.ink },
  priceCustomUnit: { fontSize: 12, color: colors.ink3 },
  priceCustomDivider: { fontSize: 12, color: colors.ink3 },

  panelActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: colors.spacing.sm,
    marginTop: colors.spacing.md,
    paddingTop: colors.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  resetBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  resetText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  confirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
  },
  confirmText: { fontSize: 13, fontWeight: '600', color: colors.primaryForeground },

  sortItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  sortText: { fontSize: 14, color: colors.ink2 },
  sortTextActive: { color: colors.primary, fontWeight: '600' },

  countRow: {
    fontSize: 13,
    color: colors.ink3,
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.lg,
    marginBottom: colors.spacing.sm,
  },
  countStrong: { fontSize: 14, fontWeight: '700', color: colors.ink },

  list: { paddingHorizontal: colors.spacing.md, gap: colors.spacing.md },
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
  favBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.alpha('255, 255, 255', 0.92),
    alignItems: 'center',
    justifyContent: 'center',
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
  topRow: { flexDirection: 'row', alignItems: 'baseline', gap: colors.spacing.sm },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  price: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  priceUnit: { fontSize: 11, fontWeight: '500', color: colors.ink3 },
  addr: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  feature: { fontSize: 12, color: colors.ink2, marginTop: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: colors.spacing.sm },
  tag: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontSize: colors.fontSize.xs, color: colors.ink2 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: colors.spacing.sm,
    marginTop: colors.spacing.md,
    paddingTop: colors.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  ghostBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  ghostBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },

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
});