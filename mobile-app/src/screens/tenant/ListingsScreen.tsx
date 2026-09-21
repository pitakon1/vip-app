/**
 * 租客找工作台（链家风格）
 * 顶部搜索 + 筛选条 + 房源卡片列表（图片 / 标题 / 租金 / 户型面积）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { translateApi, favoritesApi } from '@/services/api';
import { publicApi, unwrapPage, type PublicSchool } from '@/services/publicApi';
import { SCHOOL_RADIUS_OPTIONS } from '@/lib/publicSite';
import { fmtMoney as formatRent } from '@/utils/format';
import { notify, notifyError } from '@/utils/feedback';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { useI18n } from '@/i18n';
import { AREA_GROUPS } from '@/data/locationArea';
import { METRO_LINES } from '@/data/locationMetro';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore, findCityByKey } from '@/stores/location';
import { getCached, isFresh, setCached } from '@/lib/cache';

interface Listing {
  id: string;
  title?: string;
  room_number?: string;
  address?: string;
  property_type?: string;
  monthly_rent?: number;
  currency?: string;
  bedrooms?: number;
  bathrooms?: number;
  size_sqm?: number;
  status?: string;
  description?: string;
  photos?: string[];
  [key: string]: any;
}

// 业务归属 Tab（对齐原型 rv17-bizbar：整租 / 合租 / 买房）
type BizKey = 'rent' | 'share' | 'sale';
const BIZ_TABS: { key: BizKey; label: string }[] = [
  { key: 'rent', label: '整租' },
  { key: 'share', label: '合租' },
  { key: 'sale', label: '买房' },
];

// 房源类型：链家式单行筛选栏容不下，收进「更多」面板
const PROPERTY_TYPE_FILTERS = [
  { key: '', label: '不限' },
  { key: 'apartment', label: '公寓' },
  { key: 'condo', label: '公寓式' },
  { key: 'villa', label: '别墅' },
  { key: 'house', label: '独栋' },
  { key: 'office', label: '写字楼' },
  { key: 'shop', label: '商铺' },
];

// 买卖挂牌（真实数据源：GET /sale-listings）
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

// 价格区间（月租，THB）—— 贝壳式：预设快捷区间 + 自定义最低/最高
interface PricePreset { key: string; label: string; min: number; max: number }
const PRICE_RANGES: PricePreset[] = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u3', label: '≤3万', min: 0, max: 30000 },
  { key: '3-5', label: '3-5万', min: 30000, max: 50000 },
  { key: '5-8', label: '5-8万', min: 50000, max: 80000 },
  { key: 'g8', label: '≥8万', min: 80000, max: Infinity },
];

// 户型筛选（贝壳式：1-5 室+）
const BEDROOM_OPTIONS = [
  { key: '', label: '不限' },
  { key: '1', label: '1室' },
  { key: '2', label: '2室' },
  { key: '3', label: '3室' },
  { key: '4', label: '4室' },
  { key: '5', label: '5室+' },
];

// 状态筛选（贝壳式，与 Web / 小程序一致）
const STATUS_FILTERS = [
  { key: '', label: '不限' },
  { key: 'vacant', label: '空置' },
  { key: 'rented', label: '已出租' },
  { key: 'reserved', label: '已预订' },
  { key: 'maintenance', label: '维护中' },
];

// 朝向筛选（贝壳式 8 向；东南亚西晒极强，朝向是硬决策因素）
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

// 楼层筛选（贝壳式低/中/高；低层 1-5 / 中层 6-15 / 高层 16+）
const FLOOR_LEVEL_OPTIONS = [
  { key: '', label: '不限' },
  { key: 'low', label: '低楼层(1-5层)' },
  { key: 'mid', label: '中楼层(6-15层)' },
  { key: 'high', label: '高楼层(16层+)' },
];

// 装修筛选（东南亚口径：带家具家电是最常见出租形态）
const DECORATION_OPTIONS = [
  { key: '', label: '不限' },
  { key: 'bare', label: '毛坯' },
  { key: 'simple', label: '简装' },
  { key: 'standard', label: '精装' },
  { key: 'luxury', label: '豪装' },
  { key: 'fully_furnished', label: '带家具家电' },
];

// 配套设施筛选（东南亚口径，多选任一命中；无供暖/暖气/天然气——东南亚无冬季）
const AMENITY_OPTIONS = [
  { key: 'aircon', label: '空调' },
  { key: 'pool', label: '泳池' },
  { key: 'gym', label: '健身房' },
  { key: 'parking', label: '停车位' },
  { key: 'elevator', label: '电梯' },
  { key: 'balcony', label: '阳台' },
  { key: 'garden', label: '花园/庭院' },
];

// 面积筛选（贝壳式：预设快捷区间 + 自定义最低/最高 ㎡）
interface AreaPreset { key: string; label: string; min: number; max: number }
const AREA_PRESETS: AreaPreset[] = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u50', label: '≤50㎡', min: 0, max: 50 },
  { key: '50-100', label: '50-100㎡', min: 50, max: 100 },
  { key: '100-150', label: '100-150㎡', min: 100, max: 150 },
  { key: '150-200', label: '150-200㎡', min: 150, max: 200 },
  { key: 'g200', label: '≥200㎡', min: 200, max: Infinity },
];

// 排序（贝壳式下拉 Tab）
const SORT_OPTIONS = [
  { key: 'default', label: '默认排序' },
  { key: 'latest', label: '最新发布' },
  { key: 'price_asc', label: '价格从低到高' },
  { key: 'price_desc', label: '价格从高到低' },
  { key: 'area_desc', label: '面积从大到小' },
];

const typeLabels: Record<string, string> = {
  apartment: '公寓',
  condo: '公寓',
  villa: '别墅',
  house: '别墅',
  shop: '商铺',
  commercial: '商铺',
  office: '写字楼',
};

const statusLabels: Record<string, string> = {
  vacant: '空置',
  rented: '已出租',
  reserved: '已预订',
  maintenance: '维护中',
};

// ==================== 按区域 / 按地铁找房（对齐贝壳「区域 | 地铁」；与 Web 端数据保持一致） ====================

// 区域/轨交数据集中于 src/data/locationArea.ts 与 locationMetro.ts
// （AREA_GROUPS / METRO_LINES 与接口已在文件顶部 import）

// 命中关键词：房源地址/标题任一包含即可
const matchLocation = (item: any, kws: string[]): boolean =>
  kws.some((k) =>
    [item.address, item.title, item.room_number, item.city, item.district, item.area]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase())
      .some((v) => v.includes(k))
  );

// ==================== 语言判定（决定是否展示翻译入口） ====================
// 中日韩表意文字 / 泰文区间
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const THAI_RE = /[\u0e00-\u0e7f]/;

// 文本语言是否与界面语言一致（无文本视为一致 → 不展示翻译按钮）
const isSameLang = (text: string, uiLang: string): boolean => {
  const s = (text || '').trim();
  if (!s) return true;
  if (uiLang === 'zh') return CJK_RE.test(s);
  if (uiLang === 'th') return THAI_RE.test(s);
  return !CJK_RE.test(s) && !THAI_RE.test(s);
};

// 用于语言判定与翻译的源文本
const translateSource = (item: Listing): string => (item.description || item.address || '').trim();

// 房源状态徽标底色
const statusColors = (s?: string) => {
  switch (s) {
    case 'vacant':
      return colors.success;
    case 'rented':
    case 'reserved':
      return colors.primary;
    case 'maintenance':
      return colors.warning;
    default:
      return colors.ink3;
  }
};

// 房源卡片（React.memo：滚动/筛选面板开合时避免无关卡片重渲染）
interface ListingCardProps {
  item: Listing;
  favorited: boolean;
  favBusy: boolean;
  translating: boolean;
  showTranslate: boolean;
  onPress: (item: Listing) => void;
  onToggleFav: (item: Listing) => void;
  onTranslate: (item: Listing) => void;
}

const ListingCard = React.memo(function ListingCard({
  item,
  favorited,
  favBusy,
  translating,
  showTranslate,
  onPress,
  onToggleFav,
  onTranslate,
}: ListingCardProps) {
  const photo = Array.isArray(item.photos) && item.photos.length ? item.photos[0] : null;
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onPress(item)}>
      <View style={styles.thumbWrap}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} resizeMode="cover" />
        ) : (
          // 无图占位分支（保证图片区不塌陷）
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="home-outline" size={28} color={colors.ink3} />
          </View>
        )}
        <View style={[styles.statusBadge, { backgroundColor: statusColors(item.status) }]}>
          <Text style={styles.statusText}>{statusLabels[item.status ?? 'vacant'] ?? '—'}</Text>
        </View>
        <TouchableOpacity
          style={styles.favBtn}
          onPress={() => onToggleFav(item)}
          disabled={favBusy}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={favorited ? '取消收藏' : '收藏房源'}
          accessibilityState={{ disabled: favBusy }}
        >
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={18}
            color={favorited ? colors.error : colors.primaryForeground}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title || item.room_number || '未命名房源'}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {item.address || '暂无地址'}
        </Text>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>{typeLabels[item.property_type ?? ''] ?? '房源'}</Text>
          <Text style={styles.tag}>
            {item.bedrooms ?? 0}室·{item.size_sqm ?? 0}㎡
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.rent}>
            {formatRent(item.monthly_rent, item.currency)}
            <Text style={styles.rentUnit}>/月</Text>
          </Text>
          {/* 仅当房源文本语言与界面语言不一致时才展示翻译入口 */}
          {showTranslate ? (
            <TouchableOpacity
              style={styles.translateBtn}
              onPress={() => onTranslate(item)}
              disabled={translating}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Google 翻译"
              accessibilityState={{ disabled: translating }}
            >
              <Text style={styles.translateText}>
                {translating ? '翻译中...' : 'Google 翻译'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function ListingsScreen() {
  const { t, lang } = useI18n();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [keyword, setKeyword] = useState('');
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
  type OpenTab = null | 'region' | 'school' | 'price' | 'layout' | 'more' | 'sort';
  const [openTab, setOpenTab] = useState<OpenTab>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  // 业务归属 Tab（整租 / 合租 / 买房）
  const [biz, setBiz] = useState<BizKey>('rent');
  const [saleListings, setSaleListings] = useState<SaleListing[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleLoaded, setSaleLoaded] = useState(false);
  const [saleError, setSaleError] = useState(false);
  // 按区域/按地铁（对齐贝壳「区域 | 地铁」双Tab）
  // 城市由全局定位 Store 决定（主页左上角选择国家/城市），找房页只做「区/街道」与地铁（链家式：
  // 区街道颗粒度留在找房页，国家/省市切换回到主页左上角）。
  const locSel = useLocationStore((s) => s.selection);
  const locCity = useMemo(() => findCityByKey(locSel.cityKey), [locSel.cityKey]);
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area');
  const [districtSel, setDistrictSel] = useState<string | null>(null); // 已选城区（区/街道）key
  const [metroSel, setMetroSel] = useState<string[]>([]);              // 已选站点 name（已确认）
  const [metroDraft, setMetroDraft] = useState<string[]>([]);          // 站点多选草稿（确定后提交）
  // 地铁线路：仅列当前定位城市的线路（链家式——定位城市后，地铁只看该市）
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key);
  // 学校筛选（空间）：后端按学校坐标 + 半径反查覆盖的小区，必须走服务端
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolKm, setSchoolKm] = useState(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [schoolKw, setSchoolKw] = useState('');
  // 请求序号：连续切换筛选时丢弃先发后到的过期响应
  const listReqSeq = useRef(0);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // 顶部安全区：本页同时作为底部 Tab（无 header）与堆栈页使用，补 insets.top 避免内容顶到状态栏
  const insets = useSafeAreaInsets();
  // 支持金刚区分类直达：路由参数 filter 预设房源类型
  const [filter, setFilter] = useState(route.params?.filter || '');
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
        const params: any = { page: 1, page_size: 50, listing_type: 'rent' };
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
        notifyError('加载失败', err, () => {
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
    [schoolFilter],
  );

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  // 学校候选：首次展开面板时懒加载一次
  useEffect(() => {
    if (openTab !== 'school' || schoolsLoaded) return;
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

  // 买房 Tab：懒加载真实在售挂牌（GET /sale-listings）
  const loadSaleListings = useCallback(async () => {
    setSaleLoading(true);
    setSaleError(false);
    try {
      const res = await publicApi.listings({ page: 1, page_size: 50, listing_type: 'sell' });
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
      setSaleLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (biz === 'sale' && !saleLoaded) loadSaleListings();
  }, [biz, saleLoaded, loadSaleListings]);

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
        notify('操作失败', '请稍后重试');
      } finally {
        setFavLoading((s) => ({ ...s, [pid]: false }));
      }
    },
    [queryClient, token, navigation],
  );

  // 金刚区分类直达：路由参数变化时同步筛选
  useEffect(() => {
    if (route.params?.filter !== undefined) {
      setFilter(route.params.filter);
    }
  }, [route.params?.filter]);

  // 首页学校卡片直达：带着学校跳到本页并预选学校筛选。
  // 依赖用 schoolTs（时间戳）而非 schoolId —— 连续点同一所学校也要重新生效。
  useEffect(() => {
    if (!route.params?.schoolTs) return;
    setSchoolId(route.params.schoolId ?? '');
    setSchoolName(route.params.schoolName ?? '');
    setSchoolKm(route.params.schoolKm ?? 3);
  }, [route.params?.schoolTs]);

  // ---------- 按区域 / 按地铁（对齐贝壳「区域 | 地铁」） ----------
  // 当前定位城市的城区（区/街道）平铺列表：找房页不出现国家/省市，只留 区/街道 颗粒度
  const cityDistricts = locCity?.children ?? [];
  // 地铁仅列当前定位城市的线路
  const cityMetroLines = useMemo(
    () => METRO_LINES.filter((l) => l.cityKey === locSel.cityKey),
    [locSel.cityKey],
  );
  const activeLine = useMemo(
    () => cityMetroLines.find((l) => l.key === metroLine),
    [cityMetroLines, metroLine],
  );
  // 已选区域/地铁的关键词，用于匹配房源地址/标题；
  // 「城市」不再参与（全局定位决定城市，找房页只做区/街道与地铁）
  const activeLocationKw = useMemo(() => {
    if (districtSel) {
      const node = locCity?.children.find((d) => d.key === districtSel);
      return node ? node.kws : [];
    }
    if (metroSel.length) {
      const stations = METRO_LINES.flatMap((l) => l.stations);
      return stations.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws);
    }
    return [];
  }, [districtSel, metroSel, locCity]);

  const regionLabel = useMemo(() => {
    if (districtSel) {
      const node = locCity?.children.find((d) => d.key === districtSel);
      return node ? node.label : '区域';
    }
    if (metroSel.length) {
      const first = metroSel[0];
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first;
    }
    return '区域';
  }, [districtSel, metroSel, locCity]);

  // 全局城市作用域：当前定位城市下，房源必须命中该城任一城区关键词（整体过滤，链家式「定位城市看房」）
  const globalCityKw = useMemo(
    () => (locCity ? locCity.children.flatMap((d) => d.kws) : []),
    [locCity],
  );

  // 区域=实时单选；城区与地铁互斥
  const applyDistrict = (key: string | null) => {
    if (districtSel === key) {
      setDistrictSel(null);
      return;
    }
    setDistrictSel(key);
    setMetroSel([]);
    setMetroDraft([]);
  };
  // 地铁=草稿多选，确定后提交
  const toggleStation = (name: string) => {
    setMetroDraft((d) => (d.includes(name) ? d.filter((s) => s !== name) : [...d, name]));
  };
  const clearMetroDraft = () => {
    setMetroDraft([]);
    setMetroSel([]);
  };
  const confirmMetro = () => {
    setMetroSel(metroDraft);
    if (metroDraft.length) setDistrictSel(null);
  };
  const resetLocation = () => {
    setDistrictSel(null);
    setMetroSel([]);
    setMetroDraft([]);
  };

  // ---------- 贝壳式 Tab 下拉面板：开合 / 重置 / 确定 ----------
  const hasPriceFilter = !!(priceRange || customMin || customMax);
  const hasAreaFilter = !!(areaRange || areaCustomMin || areaCustomMax);
  const priceLabel = priceRange
    ? PRICE_RANGES.find((r) => r.key === priceRange)?.label ?? '价格'
    : customMin || customMax
    ? '自定义'
    : '价格';
  const bedLabel = bedFilter ? BEDROOM_OPTIONS.find((b) => b.key === bedFilter)?.label ?? '户型' : '户型';
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label ?? '排序';
  // 「更多」收纳了房源类型 / 居室外的朝向 / 楼层 / 面积 / 装修 / 配套 / 状态，角标按已生效组数计
  const moreBadge =
    (filter ? 1 : 0) +
    (hasAreaFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (orientationSel ? 1 : 0) +
    (floorSel ? 1 : 0) +
    (decorSel ? 1 : 0) +
    (amenitySel.length ? 1 : 0);

  const toggleTab = (key: OpenTab) => {
    if (openTab === key) {
      setOpenTab(null);
      return;
    }
    setOpenTab(key);
    if (key === 'region') {
      setMetroDraft(metroSel);
      if (!districtSel && metroSel.length) setLocTab('metro');
    }
  };

  const resetCurrent = (key: OpenTab) => {
    if (key === 'region') {
      if (locTab === 'metro') clearMetroDraft();
      else resetLocation();
    } else if (key === 'price') {
      setPriceRange('');
      setCustomMin('');
      setCustomMax('');
    } else if (key === 'layout') {
      setBedFilter('');
    } else if (key === 'more') {
      setFilter('');
      setAreaRange('');
      setAreaCustomMin('');
      setAreaCustomMax('');
      setStatusFilter('');
      setOrientationSel('');
      setFloorSel('');
      setDecorSel('');
      setAmenitySel([]);
    } else if (key === 'sort') {
      setSortKey('default');
    }
  };

  const confirmCurrent = (key: OpenTab) => {
    if (key === 'region') {
      if (locTab === 'metro') confirmMetro();
      setOpenTab(null);
    } else if (key) {
      setOpenTab(null);
    }
  };

  // 贝壳式 Tab 栏展示数据
  const filterTabs = [
    { key: 'region', label: districtSel || metroSel.length ? regionLabel : '区域', active: !!activeLocationKw.length, badge: 0 },
    { key: 'school', label: schoolId ? `${schoolName} · ${schoolKm}km` : '学校', active: !!schoolId, badge: 0 },
    { key: 'price', label: hasPriceFilter ? priceLabel : '价格', active: hasPriceFilter, badge: 0 },
    { key: 'layout', label: bedFilter ? bedLabel : '户型', active: !!bedFilter, badge: 0 },
    { key: 'more', label: '更多', active: moreBadge > 0, badge: moreBadge },
    { key: 'sort', label: sortKey !== 'default' ? sortLabel : '排序', active: sortKey !== 'default', badge: 0 },
  ] as { key: OpenTab; label: string; active: boolean; badge: number }[];

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
      notify('提示', '该房源暂无描述文本');
      return;
    }
    setTranslatingId(item.id);
    try {
      const res = await translateApi.translate(source, 'zh');
      const data = res.data;
      const text = data?.translated_text ?? '';
      notify('翻译结果（中文）', text || '翻译服务未配置密钥，已返回原文本。');
    } catch {
      notify('翻译失败', '请稍后重试');
    } finally {
      setTranslatingId(null);
    }
  }, []);

  // 进入房源详情（useCallback：引用稳定）；公开层卡片 id 为挂牌 id → 公开详情页（匿名可看）
  const goDetail = useCallback(
    (item: Listing) => navigation.navigate('PublicListingDetail', { id: item.id }),
    [navigation],
  );

  const filtered = useMemo(
    () =>
      listings.filter((it) => {
    if (filter && it.property_type !== filter) return false;
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
    // 户型（1-4 室精确匹配；5室+ 覆盖 >=5）
    if (bedFilter) {
      const beds = Number(it.bedrooms ?? 0);
      if (bedFilter === '5') {
        if (beds < 5) return false;
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
    [listings, filter, statusFilter, bedFilter, orientationSel, floorSel, decorSel, amenitySel, priceRange, customMin, customMax, areaRange, areaCustomMin, areaCustomMax, keyword, activeLocationKw, globalCityKw],
  );

  // 排序（贝壳式 Tab）
  const sortedData = useMemo(() => {
    const arr = [...filtered];
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
  }, [filtered, sortKey]);

  // 买房 Tab 数据（真实挂牌，仅按关键字过滤）
  const saleFiltered = useMemo(() => {
    if (!keyword) return saleListings;
    const kw = keyword.toLowerCase();
    return saleListings.filter((s) =>
      `${s.title ?? ''} ${s.address ?? ''}`.toLowerCase().includes(kw),
    );
  }, [saleListings, keyword]);

  // 房源卡片渲染（抽成 memo 组件，仅传必要 props）
  const renderItem = useCallback(
    ({ item }: { item: Listing }) => (
      <ListingCard
        item={item}
        favorited={!!favSet[item.property_id ?? item.id]}
        favBusy={!!favLoading[item.property_id ?? item.id]}
        translating={translatingId === item.id}
        showTranslate={!isSameLang(translateSource(item), lang)}
        onPress={goDetail}
        onToggleFav={handleToggleFav}
        onTranslate={handleTranslate}
      />
    ),
    [favSet, favLoading, translatingId, lang, goDetail, handleToggleFav, handleTranslate],
  );

  // 买房挂牌卡片（真实数据：挂牌价 / 面积 / 户型）
  const renderSaleItem = ({ item }: { item: SaleListing }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => {
        if (item.id) {
          navigation.navigate('PublicListingDetail', { id: item.id });
        } else {
          Alert.alert('提示', '该挂牌暂未关联房源详情');
        }
      }}
    >
      <View style={styles.thumbWrap}>
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="pricetag-outline" size={28} color={colors.ink3} />
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.warning }]}>
          <Text style={styles.statusText}>在售</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title || '未命名挂牌'}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {item.address || '暂无地址'}
        </Text>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>
            {item.bedrooms ?? 0}室·{item.size_sqm ?? 0}㎡
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.rent}>
            {formatRent(item.asking_price, item.currency)}
            <Text style={styles.rentUnit}> 总价</Text>
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // 加载态（统一 LoadingState，含文案说明）
  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label="加载房源中…" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 搜索栏 */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索小区 / 地址 / 房号"
            placeholderTextColor={colors.ink3}
            value={keyword}
            onChangeText={setKeyword}
            returnKeyType="search"
          />
        </View>
      </View>
      {/* 业务归属 Tab（整租 / 合租 / 买房）+ 地图入口 */}
      <View style={styles.bizBar}>
        {BIZ_TABS.map((b) => (
          <TouchableOpacity
            key={b.key}
            style={[styles.bizItem, biz === b.key && styles.bizItemActive]}
            onPress={() => {
              setBiz(b.key);
              setOpenTab(null);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.bizText, biz === b.key && styles.bizTextActive]}>
              {b.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* 结果计数 */}
      <View style={styles.resultCount}>
        <Text style={styles.resultCountText}>
          共 <Text style={styles.resultCountNum}>
            {biz === 'sale' ? saleFiltered.length : biz === 'share' ? 0 : sortedData.length}
          </Text> 套房源
        </Text>
      </View>
      {/* 链家式单行筛选栏（点击后从顶部下拉面板，非底部弹层）—— 买卖挂牌不适用租赁筛选维度 */}
      {biz !== 'sale' && (
        <>
      <View style={styles.filterZone}>
        {/* 7 个筛选维度：宽度够时等分铺满，不够时按内容撑开并横向滚动 */}
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
              onPress={() => toggleTab(tb.key as OpenTab)}
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
                {/* 贝壳式三栏面板（照搬贝壳找房 App 筛选）：
                    ① 类目栏(浅灰，选中白底主色字) ② 一级列表(不限+国家/线路) ③ 选项列表(城市→城区 / 站点，行尾单选圈) */}
                <View style={styles.keSheet}>
                  {/* ① 类目导航 */}
                  <View style={styles.keRail}>
                    {(['area', 'metro'] as const).map((tab) => (
                      <TouchableOpacity
                        key={tab}
                        style={[styles.keRailItem, locTab === tab && styles.keRailItemActive]}
                        onPress={() => setLocTab(tab)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.keRailText, locTab === tab && styles.keRailTextActive]}>
                          {tab === 'area' ? '区域' : '地铁'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {locTab === 'area' ? (
                    <>
                      {/* 当前定位城市下的 区/街道 平铺列表：找房页不做国家/省市，只留 区/街道 颗粒度（链家样式） */}
                      <ScrollView style={styles.keCol3} showsVerticalScrollIndicator={false}>
                        <Text style={styles.keSection}>{locSel.cityLabel} · 区/街道</Text>
                        <TouchableOpacity
                          style={styles.keOption}
                          onPress={() => applyDistrict(null)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.keOptionMain}>
                            <Text style={[styles.keOptionText, districtSel === null && styles.keOptionTextActive]}>
                              不限
                            </Text>
                          </View>
                          <View style={[styles.keRadio, districtSel === null && styles.keRadioOn]}>
                            {districtSel === null && <View style={styles.keRadioDot} />}
                          </View>
                        </TouchableOpacity>
                        {cityDistricts.map((d) => (
                          <TouchableOpacity
                            key={d.key}
                            style={styles.keOption}
                            onPress={() => applyDistrict(d.key)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.keOptionMain}>
                              <Text style={[styles.keOptionText, districtSel === d.key && styles.keOptionTextActive]}>
                                {d.label}
                              </Text>
                            </View>
                            <View style={[styles.keRadio, districtSel === d.key && styles.keRadioOn]}>
                              {districtSel === d.key && <View style={styles.keRadioDot} />}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </>
                  ) : (
                    <>
                      {/* ② 线路列表（不限 + 线路） */}
                      <ScrollView style={[styles.keCol2, { flexGrow: 0, flexShrink: 0 }]} showsVerticalScrollIndicator={false}>
                        <TouchableOpacity
                          style={styles.keRow}
                          onPress={clearMetroDraft}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.keRowText, !metroDraft.length && styles.keRowTextActive]}>不限</Text>
                        </TouchableOpacity>
                        {cityMetroLines.map((l) => (
                          <TouchableOpacity
                            key={l.key}
                            style={[styles.keRow, metroLine === l.key && styles.keRowActive]}
                            onPress={() => setMetroLine(l.key)}
                            activeOpacity={0.7}
                          >
                            <Text
                              numberOfLines={1}
                              style={[styles.keRowText, metroLine === l.key && styles.keRowTextActive]}
                            >
                              {l.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      {/* ③ 站点（多选，行尾勾选圈） */}
                      <ScrollView style={styles.keCol3} showsVerticalScrollIndicator={false}>
                        <Text style={styles.keSection}>
                          {activeLine ? `${activeLine.cityLabel} · ${activeLine.name}` : ''}
                          {metroDraft.length ? ` · 已选 ${metroDraft.length}` : ''}
                        </Text>
                        {activeLine?.stations.map((s) => (
                          <TouchableOpacity
                            key={s.name}
                            style={styles.keOption}
                            onPress={() => toggleStation(s.name)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.keOptionMain}>
                              <Text style={[styles.keOptionText, metroDraft.includes(s.name) && styles.keOptionTextActive]}>
                                {s.name}
                              </Text>
                            </View>
                            <View style={[styles.keRadio, metroDraft.includes(s.name) && styles.keRadioOn]}>
                              {metroDraft.includes(s.name) && <View style={styles.keRadioDot} />}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </>
                  )}
                </View>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={() => resetCurrent('region')} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCurrent('region')} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {openTab === 'school' && (
              <>
                <Text style={styles.dropGroupTitle}>距离范围</Text>
                <View style={styles.filterGroup}>
                  {SCHOOL_RADIUS_OPTIONS.map((km) => (
                    <TouchableOpacity
                      key={km}
                      style={[styles.filterChip, schoolKm === km && styles.filterChipActive]}
                      onPress={() => setSchoolKm(km)}
                    >
                      <Text style={[styles.filterText, schoolKm === km && styles.filterTextActive]}>
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
                <ScrollView style={styles.dropBody}>
                  <View style={styles.filterGroup}>
                    <TouchableOpacity
                      style={[styles.filterChip, !schoolId && styles.filterChipActive]}
                      onPress={() => {
                        setSchoolId('');
                        setSchoolName('');
                        setOpenTab(null);
                      }}
                    >
                      <Text style={[styles.filterText, !schoolId && styles.filterTextActive]}>不限</Text>
                    </TouchableOpacity>
                    {filteredSchools.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.filterChip, schoolId === s.id && styles.filterChipActive]}
                        onPress={() => {
                          setSchoolId(s.id);
                          setSchoolName(s.name ?? '学校');
                          setOpenTab(null);
                        }}
                      >
                        <Text style={[styles.filterText, schoolId === s.id && styles.filterTextActive]}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {schoolsLoaded && !filteredSchools.length && (
                    <Text style={styles.dropEmpty}>暂无匹配学校</Text>
                  )}
                </ScrollView>
              </>
            )}

            {openTab === 'price' && (
              <>
                <Text style={styles.dropGroupTitle}>快捷选择</Text>
                <View style={styles.filterGroup}>
                  {PRICE_RANGES.map((r) => (
                    <TouchableOpacity
                      key={r.key}
                      style={[styles.filterChip, priceRange === r.key && styles.filterChipActive]}
                      onPress={() => {
                        setPriceRange(r.key);
                        if (r.key) { setCustomMin(''); setCustomMax(''); }
                      }}
                    >
                      <Text style={[styles.filterText, priceRange === r.key && styles.filterTextActive]}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.dropGroupTitle}>自定义价格</Text>
                <View style={styles.priceCustomRow}>
                  <View style={styles.priceCustomInput}>
                    <Text style={styles.priceCustomPrefix}>฿</Text>
                    <TextInput
                      style={styles.priceCustomField}
                      value={customMin}
                      onChangeText={(v) => { setCustomMin(v.replace(/[^\d]/g, '')); if (v) setPriceRange(''); }}
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
                      onChangeText={(v) => { setCustomMax(v.replace(/[^\d]/g, '')); if (v) setPriceRange(''); }}
                      placeholder="最高价"
                      placeholderTextColor={colors.ink3}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.priceCustomUnit}>万/月</Text>
                  </View>
                </View>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={() => resetCurrent('price')} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCurrent('price')} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {openTab === 'layout' && (
              <>
                <Text style={styles.dropGroupTitle}>户型</Text>
                <View style={styles.filterGroup}>
                  {BEDROOM_OPTIONS.map((b) => (
                    <TouchableOpacity
                      key={b.key}
                      style={[styles.filterChip, bedFilter === b.key && styles.filterChipActive]}
                      onPress={() => setBedFilter(b.key)}
                    >
                      <Text style={[styles.filterText, bedFilter === b.key && styles.filterTextActive]}>{b.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={() => resetCurrent('layout')} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCurrent('layout')} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {openTab === 'more' && (
              <>
                {/* 三组条件叠加后超出面板高度，内容区独立滚动，操作行常驻可见 */}
                <ScrollView style={styles.dropBodyTall}>
                  <Text style={styles.dropGroupTitle}>房源类型</Text>
                  <View style={styles.filterGroup}>
                    {PROPERTY_TYPE_FILTERS.map((f) => (
                      <TouchableOpacity
                        key={f.key || 'all'}
                        style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                        onPress={() => setFilter(f.key)}
                      >
                        <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dropGroupTitle}>朝向</Text>
                  <View style={styles.filterGroup}>
                    {ORIENTATION_OPTIONS.map((o) => (
                      <TouchableOpacity
                        key={o.key || 'all'}
                        style={[styles.filterChip, orientationSel === o.key && styles.filterChipActive]}
                        onPress={() => setOrientationSel(o.key)}
                      >
                        <Text style={[styles.filterText, orientationSel === o.key && styles.filterTextActive]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dropGroupTitle}>楼层</Text>
                  <View style={styles.filterGroup}>
                    {FLOOR_LEVEL_OPTIONS.map((fl) => (
                      <TouchableOpacity
                        key={fl.key || 'all'}
                        style={[styles.filterChip, floorSel === fl.key && styles.filterChipActive]}
                        onPress={() => setFloorSel(fl.key)}
                      >
                        <Text style={[styles.filterText, floorSel === fl.key && styles.filterTextActive]}>{fl.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dropGroupTitle}>面积</Text>
                  <View style={styles.filterGroup}>
                    {AREA_PRESETS.map((a) => (
                      <TouchableOpacity
                        key={a.key || 'all'}
                        style={[styles.filterChip, areaRange === a.key && styles.filterChipActive]}
                        onPress={() => {
                          setAreaRange(a.key);
                          if (a.key) { setAreaCustomMin(''); setAreaCustomMax(''); }
                        }}
                      >
                        <Text style={[styles.filterText, areaRange === a.key && styles.filterTextActive]}>{a.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.priceCustomRow}>
                    <View style={styles.priceCustomInput}>
                      <TextInput
                        style={styles.priceCustomField}
                        value={areaCustomMin}
                        onChangeText={(v) => { setAreaCustomMin(v.replace(/[^\d]/g, '')); if (v) setAreaRange(''); }}
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
                        onChangeText={(v) => { setAreaCustomMax(v.replace(/[^\d]/g, '')); if (v) setAreaRange(''); }}
                        placeholder="最高㎡"
                        placeholderTextColor={colors.ink3}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.priceCustomUnit}>㎡</Text>
                    </View>
                  </View>
                  <Text style={styles.dropGroupTitle}>装修</Text>
                  <View style={styles.filterGroup}>
                    {DECORATION_OPTIONS.map((d) => (
                      <TouchableOpacity
                        key={d.key || 'all'}
                        style={[styles.filterChip, decorSel === d.key && styles.filterChipActive]}
                        onPress={() => setDecorSel(d.key)}
                      >
                        <Text style={[styles.filterText, decorSel === d.key && styles.filterTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dropGroupTitle}>配套设施</Text>
                  <View style={styles.filterGroup}>
                    {AMENITY_OPTIONS.map((a) => {
                      const on = amenitySel.includes(a.key);
                      return (
                        <TouchableOpacity
                          key={a.key}
                          style={[styles.filterChip, on && styles.filterChipActive]}
                          onPress={() =>
                            setAmenitySel((cur) =>
                              on ? cur.filter((k) => k !== a.key) : [...cur, a.key],
                            )
                          }
                        >
                          <Text style={[styles.filterText, on && styles.filterTextActive]}>{a.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.dropGroupTitle}>房源状态</Text>
                  <View style={styles.filterGroup}>
                    {STATUS_FILTERS.map((s) => (
                      <TouchableOpacity
                        key={s.key || 'all'}
                        style={[styles.filterChip, statusFilter === s.key && styles.filterChipActive]}
                        onPress={() => setStatusFilter(s.key)}
                      >
                        <Text style={[styles.filterText, statusFilter === s.key && styles.filterTextActive]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={() => resetCurrent('more')} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCurrent('more')} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {openTab === 'sort' && (
              <View style={styles.dropSort}>
                {SORT_OPTIONS.map((so) => (
                  <TouchableOpacity
                    key={so.key}
                    style={[styles.dropSortItem, sortKey === so.key && styles.dropSortItemActive]}
                    onPress={() => {
                      setSortKey(so.key);
                      setOpenTab(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dropSortText, sortKey === so.key && styles.dropSortTextActive]}>{so.label}</Text>
                    {sortKey === so.key && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
      </>
      )}
      {/* 列表：整租=真实租赁房源 / 合租=暂无数据源 / 买房=真实在售挂牌 */}
      <FlatList
        data={(biz === 'sale' ? saleFiltered : biz === 'share' ? [] : sortedData) as any[]}
        keyExtractor={(item) => item.id}
        renderItem={(biz === 'sale' ? renderSaleItem : renderItem) as any}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        /* 长列表性能：控制首屏/批次渲染数量与视窗外回收 */
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          biz === 'sale' && saleLoading ? (
            <LoadingState label="加载在售挂牌中…" />
          ) : (
            <View style={styles.emptyBox}>
              {loadError && biz !== 'sale' ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title={t('loadFailed')}
                  sub={t('loadFailedSub')}
                  actionLabel={t('retry')}
                  onAction={() => {
                    setLoading(true);
                    loadListings();
                  }}
                />
              ) : biz === 'sale' && saleError ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title={t('loadFailed')}
                  sub={t('loadFailedSub')}
                  actionLabel={t('retry')}
                  onAction={() => loadSaleListings()}
                />
              ) : (
                <>
                  <Ionicons
                    name={biz === 'share' ? 'people-outline' : 'home-outline'}
                    size={44}
                    color={colors.ink3}
                  />
                  <Text style={styles.empty}>
                    {biz === 'share' ? '暂无合租房源' : '没有找到合适的房源'}
                  </Text>
                  <Text style={styles.emptySub}>
                    {biz === 'share'
                      ? '当前房源数据未区分合租/整租'
                      : biz === 'sale'
                      ? '暂无在售挂牌'
                      : '试试调整关键字或筛选条件'}
                  </Text>
                </>
              )}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // 业务归属 Tab（整租 / 合租 / 买房）+ 地图
  bizBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  bizItem: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  bizItemActive: { backgroundColor: colors.primary },
  bizText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  bizTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  mapBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  mapBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  resultCount: { paddingHorizontal: 16, paddingBottom: 8 },
  resultCountText: { fontSize: 12, color: colors.ink2 },
  resultCountNum: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  searchInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  filterBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: colors.sidebarActive,
    borderColor: colors.primary,
  },
  filterBtnText: { fontSize: 14, color: colors.ink2 },
  filterBtnTextActive: { color: colors.primary, fontWeight: '600' },
  filterGroupLabel: {
    fontSize: 12,
    color: colors.ink3,
    marginBottom: 8,
    marginTop: 4,
  },
  filterGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  // 贝壳式 Tab 筛选栏 + 顶部下拉面板
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
    position: 'relative',
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
    // 不使用 maxHeight 裁切：内层 dropBody 已限高（260），
    // 否则区域面板的「重置 / 确定」操作行在小屏上会被裁掉
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: colors.radius.lg,
    borderBottomRightRadius: colors.radius.lg,
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
  // 「更多」面板三组条件：内容区限高滚动，操作行常驻在面板底部
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
  dropGroupTitle: {
    fontSize: 12,
    color: colors.ink2,
    marginBottom: 8,
    marginTop: 4,
  },
  dropSort: { paddingVertical: 4 },
  dropSortItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropSortItemActive: {},
  dropSortText: { fontSize: 14, color: colors.ink },
  dropSortTextActive: { color: colors.primary, fontWeight: '600' },
  priceCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  priceCustomInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  priceCustomPrefix: { fontSize: 13, color: colors.ink2, marginRight: 4 },
  priceCustomField: { flex: 1, fontSize: 14, color: colors.text, padding: 4 },
  priceCustomUnit: { fontSize: 12, color: colors.ink2 },
  priceCustomDivider: { fontSize: 13, color: colors.ink2 },
  // 底部筛选弹层（对齐贝壳）
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.alpha('0,0,0', 0.45),
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    paddingTop: 6,
    maxHeight: '85%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 6,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 16, color: colors.text, fontWeight: '600' },
  sheetClose: { padding: 2 },
  sheetBody: { flexGrow: 0 },
  sheetBodyContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  panelActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  // 贝壳式底部操作条：重置=浅灰块、确定=主色块，等宽、直角小圆角、无边框
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
  // ---------- 贝壳式三栏筛选面板（结构照抄贝壳找房 App） ----------
  // ① keRail 类目栏：浅灰底，选中项白底 + 主色字（宽 84 ≈ 屏宽 21%，与贝壳一致）
  // ② keCol2 一级列表：白底，不限 + 国家/线路（宽 104 ≈ 屏宽 26%）
  // ③ keCol3 选项列表：城市（行尾 › 下钻）/ 城区·站点（行尾单选圈），占余下全部宽度
  keSheet: {
    flexDirection: 'row',
    height: 400,
    // 通栏：抵消 dropPanel 的水平内距与顶部内距（贝壳面板无留白、直角）
    marginHorizontal: -16,
    marginTop: -12,
    overflow: 'hidden',
  },
  keRail: {
    width: 84,
    flexShrink: 0,
    backgroundColor: colors.surface2,
  },
  keRailItem: {
    height: 48,
    justifyContent: 'center',
    paddingLeft: 16,
  },
  keRailItemActive: {
    backgroundColor: colors.surface,
  },
  keRailText: { fontSize: 14, color: colors.ink2 },
  keRailTextActive: { color: colors.primary, fontWeight: '600' },
  keCol2: {
    width: 104,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  // ⚠️ keCol2/keCol3 都是 ScrollView：react-native-web 给 ScrollView 基准样式带 flexGrow:1，
  // 渲染处必须内联 flexGrow:0 / flexShrink:0（keCol2）压过它，否则 ② 栏会被撑宽、③ 栏被挤窄。
  // keCol3 用 flex:1（basis 0）吃掉剩余宽度，行为正确，无需处理。
  keCol3: { flex: 1, backgroundColor: colors.surface },
  keRow: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  keRowActive: { backgroundColor: colors.surface },
  keRowText: { fontSize: 14, color: colors.ink },
  keRowTextActive: { color: colors.primary, fontWeight: '600' },
  keSection: {
    fontSize: 12,
    color: colors.ink3,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  keOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  keOptionMain: { flex: 1, paddingRight: 8 },
  keOptionText: { fontSize: 14, color: colors.ink },
  keOptionTextActive: { color: colors.primary, fontWeight: '600' },
  keRowSub: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  keChevron: { fontSize: 18, color: colors.ink3, marginLeft: 4 },
  keRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.ink3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  keRadioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  keRadioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ffffff' },
  keBack: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  keBackText: { fontSize: 12, color: colors.ink3 },
  filterChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.sidebarActive,
    borderColor: colors.primary,
  },
  filterText: { fontSize: 13, color: colors.ink2 },
  filterTextActive: { color: colors.primary, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  thumbWrap: { width: 110 },
  thumb: { width: 110, height: 110 },
  thumbPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: { fontSize: 13, color: colors.ink3 },
  statusBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: { color: colors.primaryForeground, fontSize: 12, fontWeight: '600' },
  favBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.alpha('0,0,0', 0.25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, padding: 10, justifyContent: 'space-between' },
  title: { fontSize: 15, color: colors.text, fontWeight: '600' },
  address: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 5 },
  tag: {
    fontSize: 12,
    color: colors.ink2,
    backgroundColor: colors.surface2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  rent: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  rentUnit: { fontSize: 12, fontWeight: '400', color: colors.ink2 },
  // 翻译入口：次要操作，弱化为中性描边（仅在语言不一致时出现）
  translateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  translateText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  emptyBox: { alignItems: 'center', paddingTop: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 8, opacity: 0.6 },
  empty: { fontSize: 15, color: colors.ink2 },
  emptySub: { fontSize: 12, color: colors.ink2, marginTop: 4 },
});