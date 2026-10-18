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
  ScrollView,
  Animated,
  Platform,
  Keyboard,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import * as Location from 'expo-location';
import { useResponsiveContainerStyle } from '@/theme/responsive';
import { translateApi, favoritesApi } from '@/services/api';
import {
  publicApi,
  unwrapPage,
  type PublicSchool,
  type PublicDistrict,
  type PublicMapPoint,
} from '@/services/publicApi';
import { SCHOOL_RADIUS_OPTIONS, listingTypeLabel } from '@/lib/publicSite';
import { fmtMoney as formatRent } from '@/utils/format';
import { notify, notifyError } from '@/utils/feedback';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import RemoteImage from '@/components/RemoteImage';
import { useI18n } from '@/i18n';
import { AREA_GROUPS } from '@/data/locationArea';
import { METRO_LINES } from '@/data/locationMetro';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore, findCityByKey } from '@/stores/location';
import { getCached, isFresh, setCached } from '@/lib/cache';
import { getItem, setItem } from '@/lib/kv';

// 搜索历史（最近搜索）：本地持久化，去重置顶、上限 10 条
const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

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

type TFunc = (key: string, params?: Record<string, string | number>) => string;

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

// 顶部找房卡「居室」快选：不限 / 1居 / 2居 / 3居+（3居+ = 3 室及以上）
type HeroBedKey = '' | '1' | '2' | '3p';
const heroBedOptions = (t: TFunc): { key: HeroBedKey; label: string }[] => [
  { key: '', label: t('common.any') },
  { key: '1', label: t('prop.bedroomN', { n: 1 }) },
  { key: '2', label: t('prop.bedroomN', { n: 2 }) },
  { key: '3p', label: t('list.bed3plus') },
];

// 业务归属 Tab（对齐原型 rv17-bizbar：整租 / 买房）
type BizKey = 'rent' | 'sale';
const bizTabs = (t: TFunc): { key: BizKey; label: string }[] => [
  { key: 'rent', label: t('list.biz.rent') },
  { key: 'sale', label: t('list.biz.sale') },
];

// 房源类型：链家式单行筛选栏容不下，收进「更多」面板
const propertyTypeFilters = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: 'apartment', label: t('prop.type.apartment') },
  { key: 'condo', label: t('prop.type.condoStyle') },
  { key: 'villa', label: t('prop.type.house') },
  { key: 'house', label: t('prop.type.detached') },
  { key: 'office', label: t('prop.type.office') },
  { key: 'shop', label: t('prop.type.commercial') },
  { key: 'factory', label: t('prop.type.factory') },
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
const priceRanges = (t: TFunc): PricePreset[] => [
  { key: '', label: t('common.any'), min: 0, max: Infinity },
  { key: 'u3', label: t('prop.priceLt3'), min: 0, max: 30000 },
  { key: '3-5', label: t('prop.price3to5'), min: 30000, max: 50000 },
  { key: '5-8', label: t('prop.price5to8'), min: 50000, max: 80000 },
  { key: 'g8', label: t('prop.priceGt8'), min: 80000, max: Infinity },
];

// 户型筛选（贝壳式：1-5 室+）
const bedroomOptions = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: '1', label: t('prop.bedroomN', { n: 1 }) },
  { key: '2', label: t('prop.bedroomN', { n: 2 }) },
  { key: '3', label: t('prop.bedroomN', { n: 3 }) },
  { key: '4', label: t('prop.bedroomN', { n: 4 }) },
  { key: '5', label: t('prop.bedroom5plus') },
];

// 状态筛选（贝壳式，与 Web / 小程序一致）
const statusFilters = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: 'vacant', label: t('status.vacant') },
  { key: 'rented', label: t('status.rented') },
  { key: 'reserved', label: t('status.reserved') },
  { key: 'maintenance', label: t('status.maintenance') },
];

// 朝向筛选（贝壳式 8 向；东南亚西晒极强，朝向是硬决策因素）
const orientationOptions = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: 'north', label: t('prop.orient.north') },
  { key: 'south', label: t('prop.orient.south') },
  { key: 'east', label: t('prop.orient.east') },
  { key: 'west', label: t('prop.orient.west') },
  { key: 'northeast', label: t('prop.orient.northeast') },
  { key: 'northwest', label: t('prop.orient.northwest') },
  { key: 'southeast', label: t('prop.orient.southeast') },
  { key: 'southwest', label: t('prop.orient.southwest') },
];

// 楼层筛选（贝壳式低/中/高；低层 1-5 / 中层 6-15 / 高层 16+）
const floorLevelOptions = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: 'low', label: t('prop.floorLow') },
  { key: 'mid', label: t('prop.floorMid') },
  { key: 'high', label: t('prop.floorHigh') },
];

// 装修筛选（东南亚口径：带家具家电是最常见出租形态）
const decorationOptions = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: 'bare', label: t('pub.decoration.bare') },
  { key: 'simple', label: t('pub.decoration.simple') },
  { key: 'standard', label: t('pub.decoration.standard') },
  { key: 'luxury', label: t('pub.decoration.luxury') },
  { key: 'fully_furnished', label: t('pub.decoration.fully_furnished') },
];

// 配套设施筛选（东南亚口径，多选任一命中；无供暖/暖气/天然气——东南亚无冬季）
const amenityOptions = (t: TFunc) => [
  { key: 'aircon', label: t('prop.amenity.aircon') },
  { key: 'pool', label: t('prop.amenity.pool') },
  { key: 'gym', label: t('prop.amenity.gym') },
  { key: 'parking', label: t('prop.amenity.parking') },
  { key: 'elevator', label: t('prop.amenity.elevator') },
  { key: 'balcony', label: t('prop.amenity.balcony') },
  { key: 'garden', label: t('prop.amenity.garden') },
];

// 面积筛选（贝壳式：预设快捷区间 + 自定义最低/最高 ㎡）
interface AreaPreset { key: string; label: string; min: number; max: number }
const areaPresets = (t: TFunc): AreaPreset[] => [
  { key: '', label: t('common.any'), min: 0, max: Infinity },
  { key: 'u50', label: t('prop.areaLt50'), min: 0, max: 50 },
  { key: '50-100', label: t('prop.area50to100'), min: 50, max: 100 },
  { key: '100-150', label: t('prop.area100to150'), min: 100, max: 150 },
  { key: '150-200', label: t('prop.area150to200'), min: 150, max: 200 },
  { key: 'g200', label: t('prop.areaGt200'), min: 200, max: Infinity },
];

// 排序（贝壳式下拉 Tab）
const sortOptions = (t: TFunc) => [
  { key: 'default', label: t('prop.sort.default') },
  { key: 'latest', label: t('prop.sort.latest') },
  { key: 'price_asc', label: t('prop.sort.priceLowHigh') },
  { key: 'price_desc', label: t('prop.sort.priceHighLow') },
  { key: 'area_desc', label: t('prop.sort.areaDesc') },
];

const typeLabels = (t: TFunc): Record<string, string> => ({
  apartment: t('prop.type.apartment'),
  condo: t('prop.type.apartment'),
  villa: t('prop.type.house'),
  house: t('prop.type.house'),
  shop: t('prop.type.commercial'),
  commercial: t('prop.type.commercial'),
  office: t('prop.type.office'),
});

const statusLabels = (t: TFunc): Record<string, string> => ({
  vacant: t('status.vacant'),
  rented: t('status.rented'),
  reserved: t('status.reserved'),
  maintenance: t('status.maintenance'),
});

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
  const { t } = useI18n();
  const photo = Array.isArray(item.photos) && item.photos.length ? item.photos[0] : null;
  // 收藏红心点赞式弹簧动效：点击即弹（乐观反馈，不等后端）
  const favPop = useRef(new Animated.Value(1)).current;
  const popFav = () => {
    favPop.setValue(1);
    Animated.sequence([
      Animated.spring(favPop, {
        toValue: 1.4,
        speed: 30,
        bounciness: 14,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(favPop, {
        toValue: 1,
        speed: 30,
        bounciness: 4,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  };
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onPress(item)}>
      <View style={styles.thumbWrap}>
        {photo ? (
          <RemoteImage uri={photo} style={styles.thumb} resizeMode="cover" />
        ) : (
          // 无图占位分支（保证图片区不塌陷）
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="home-outline" size={28} color={colors.ink3} />
          </View>
        )}
        <View style={[styles.statusBadge, { backgroundColor: statusColors(item.status) }]}>
          <Text style={styles.statusText}>{statusLabels(t)[item.status ?? 'vacant'] ?? '—'}</Text>
        </View>
        <TouchableOpacity
          style={styles.favBtn}
          onPress={() => {
            popFav();
            onToggleFav(item);
          }}
          disabled={favBusy}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={favorited ? t('list.unfavorite') : t('list.favorite')}
          accessibilityState={{ disabled: favBusy }}
        >
          <Animated.View style={{ transform: [{ scale: favPop }] }}>
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={18}
              color={favorited ? colors.error : colors.primaryForeground}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title || item.room_number || t('list.unnamed')}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {item.address || t('prop.noAddress')}
        </Text>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>{typeLabels(t)[item.property_type ?? ''] ?? t('listingFallback')}</Text>
          <Text style={styles.tag}>
            {t('list.bedArea', { bed: item.bedrooms ?? 0, area: item.size_sqm ?? 0 })}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.rent}>
            {formatRent(item.monthly_rent, item.currency)}
            <Text style={styles.rentUnit}>{t('rent.perMonth')}</Text>
          </Text>
          {/* 仅当房源文本语言与界面语言不一致时才展示翻译入口 */}
          {showTranslate ? (
            <TouchableOpacity
              style={styles.translateBtn}
              onPress={() => onTranslate(item)}
              disabled={translating}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('list.googleTranslate')}
              accessibilityState={{ disabled: translating }}
            >
              <Text style={styles.translateText}>
                {translating ? t('list.translating') : t('list.googleTranslate')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function ListingsScreen() {
  const respContainer = useResponsiveContainerStyle();
  const { t, lang } = useI18n();
  const BIZ_TABS = useMemo(() => bizTabs(t), [t]);
  const PROPERTY_TYPE_FILTERS = useMemo(() => propertyTypeFilters(t), [t]);
  const PRICE_RANGES = useMemo(() => priceRanges(t), [t]);
  const BEDROOM_OPTIONS = useMemo(() => bedroomOptions(t), [t]);
  const STATUS_FILTERS = useMemo(() => statusFilters(t), [t]);
  const ORIENTATION_OPTIONS = useMemo(() => orientationOptions(t), [t]);
  const FLOOR_LEVEL_OPTIONS = useMemo(() => floorLevelOptions(t), [t]);
  const DECORATION_OPTIONS = useMemo(() => decorationOptions(t), [t]);
  const AMENITY_OPTIONS = useMemo(() => amenityOptions(t), [t]);
  const AREA_PRESETS = useMemo(() => areaPresets(t), [t]);
  const SORT_OPTIONS = useMemo(() => sortOptions(t), [t]);
  const HERO_BED_OPTIONS = useMemo(() => heroBedOptions(t), [t]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [keyword, setKeyword] = useState('');
  // 最近搜索（本地持久化）：焦点态 + 历史词非空时展示 chips
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
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
  type OpenTab = null | 'region' | 'price' | 'more' | 'sort';
  const [openTab, setOpenTab] = useState<OpenTab>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  // 路由参数（首页黄金导航 business=sale / filter=property_type 直达）
  const route = useRoute<any>();
  // 业务归属 Tab（整租 / 买房）：初值支持从路由参数 business 直达
  const [biz, setBiz] = useState<BizKey>(route.params?.business === 'sale' ? 'sale' : 'rent');
  const [saleListings, setSaleListings] = useState<SaleListing[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
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
  // 列表 ref：点「查看 N 套房源」后回到列表顶部
  const listRef = useRef<FlatList<any>>(null);
  const navigation = useNavigation<any>();
  // 顶部安全区：本页同时作为底部 Tab（无 header）与堆栈页（PropertySearch，有原生 header）使用。
  // 仅 Tab 场景补 insets.top；堆栈场景已由原生 header 让出安全区，再补会多出一条空隙把头部色块顶下去。
  const insets = useSafeAreaInsets();
  const topInset = navigation.getState()?.type === 'tab' ? insets.top : 0;
  // 支持金刚区分类直达：路由参数 filter 预设房源类型。可为字符串或数组——
  // 数组用于「商铺办公」= office+shop 这类一次直达多个类型。筛选改由服务端执行，
  // 客户端按 50 条本地过滤会在数据量大时漏筛（见 loadListings / loadSaleListings）。
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

  // 学校候选：首次展开面板时懒加载一次
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

  // ---------- 最近搜索（本地历史：去重置顶 / 上限 10 条 / 越界丢最旧） ----------
  const recentRef = useRef<string[]>([]);
  useEffect(() => {
    recentRef.current = recentSearches;
  }, [recentSearches]);

  // 首次挂载读取本地历史（MMKV → AsyncStorage 自动降级，失败静默）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await getItem(RECENT_SEARCHES_KEY);
        if (!cancelled && raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            setRecentSearches(
              arr.filter((x) => typeof x === 'string').slice(0, MAX_RECENT_SEARCHES),
            );
          }
        }
      } catch {
        /* 读取失败静默：历史缺失不影响搜索 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 写入历史：去重置顶、上限 10 条（越界丢弃最旧）
  const saveRecentSearch = useCallback(async (kw: string) => {
    const next = [kw, ...recentRef.current.filter((x) => x !== kw)].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(next);
    try {
      await setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
      /* 写入失败静默 */
    }
  }, []);

  // 右上角清空
  const clearRecentSearches = useCallback(async () => {
    setRecentSearches([]);
    try {
      await setItem(RECENT_SEARCHES_KEY, JSON.stringify([]));
    } catch {
      /* ignore */
    }
  }, []);

  // 点击历史词：填入输入框并立即触发搜索（列表为本地过滤，setKeyword 即生效），同时置顶该词
  const applyRecentSearch = useCallback(
    (kw: string) => {
      setKeyword(kw);
      saveRecentSearch(kw);
    },
    [saveRecentSearch],
  );

  // 提交搜索：关键词写入历史
  const handleSearchSubmit = useCallback(() => {
    const kw = keyword.trim();
    if (kw) saveRecentSearch(kw);
  }, [keyword, saveRecentSearch]);

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
    setSchoolName(route.params.schoolName ?? '');
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

  const districtList = useMemo(() => {
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
      const node = districtList.find((d) => d.key === districtSel);
      return node ? node.kws : [];
    }
    if (metroSel.length) {
      const stations = METRO_LINES.flatMap((l) => l.stations);
      return stations.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws);
    }
    return [];
  }, [districtSel, metroSel, districtList]);

  const regionLabel = useMemo(() => {
    if (districtSel) {
      const node = districtList.find((d) => d.key === districtSel);
      return node ? node.label : t('regionFilter.title');
    }
    if (metroSel.length) {
      const first = metroSel[0];
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first;
    }
    return t('regionFilter.title');
  }, [districtSel, metroSel, districtList, t]);

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
    ? PRICE_RANGES.find((r) => r.key === priceRange)?.label ?? t('list.filterPrice')
    : customMin || customMax
    ? t('prop.custom')
    : t('list.filterPrice');
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label ?? t('list.filterSort');
  // 「更多」收纳了学校 / 户型 / 房源类型 / 朝向 / 楼层 / 面积 / 装修 / 配套 / 状态，角标按已生效组数计
  const moreBadge =
    (schoolId ? 1 : 0) +
    (bedFilter ? 1 : 0) +
    (filterTypes.length ? 1 : 0) +
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
    } else if (key === 'more') {
      setSchoolId('');
      setSchoolName('');
      setBedFilter('');
      setFilterTypes([]);
      setIsNew(undefined);
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
    { key: 'region', label: districtSel || metroSel.length ? regionLabel : t('regionFilter.title'), active: !!activeLocationKw.length, badge: 0 },
    { key: 'price', label: hasPriceFilter ? priceLabel : t('list.filterPrice'), active: hasPriceFilter, badge: 0 },
    { key: 'more', label: t('list.filterMore'), active: moreBadge > 0, badge: moreBadge },
    { key: 'sort', label: sortKey !== 'default' ? sortLabel : t('list.filterSort'), active: sortKey !== 'default', badge: 0 },
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

  // 顶部找房卡「查看 N 套房源」上的套数：与下方列表是同一份数据
  const visibleCount = biz === 'sale' ? saleFiltered.length : sortedData.length;

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

  // 「查看 N 套房源」：筛选本就实时生效，这里只收起下拉面板并回到列表顶部
  const handleViewResults = useCallback(() => {
    setOpenTab(null);
    Keyboard.dismiss();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

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
  // 真地图需引入原生地图库并做 dev build。
  const handleGoMap = useCallback(() => {
    setOpenTab(null);
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
  const renderSaleItem = useCallback(
    ({ item }: { item: SaleListing }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => {
        if (item.id) {
          navigation.navigate('PublicListingDetail', { id: item.id });
        } else {
          Alert.alert(t('common.hint'), t('list.noListingDetail'));
        }
      }}
    >
      <View style={styles.thumbWrap}>
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="pricetag-outline" size={28} color={colors.ink3} />
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.warning }]}>
          <Text style={styles.statusText}>{t('prop.status.forSale')}</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title || t('list.unnamedSale')}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {item.address || t('prop.noAddress')}
        </Text>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>
            {t('list.bedArea', { bed: item.bedrooms ?? 0, area: item.size_sqm ?? 0 })}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.rent}>
            {formatRent(item.asking_price, item.currency)}
            <Text style={styles.rentUnit}>{t('list.totalPrice')}</Text>
          </Text>
        </View>
      </View>
    </TouchableOpacity>
    ),
    [navigation, t],
  );

  // 列表卡片的外部渲染态（收藏红心 / 收藏按钮忙碌 / 翻译中）：
  // 稳定引用 + 只在变化时换 identity，避免对象字面量导致 FlatList 每帧全量重渲
  const listExtraData = useMemo(
    () => ({ favSet, favLoading, translatingId }),
    [favSet, favLoading, translatingId],
  );

  // 加载态（统一 LoadingState，含文案说明）
  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label={t('list.loadingListings')} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* 顶部头部区：浅 teal 实底 + 大标题 + 城市定位（对齐参考图顶部，给卡片留出呼吸间距） */}
      <View style={styles.heroBand}>
        <View style={styles.heroBandRow}>
          <Text style={styles.heroTitle} numberOfLines={2}>{t('list.heroTitle')}</Text>
          <TouchableOpacity
            style={styles.heroCityChip}
            onPress={() => navigation.navigate('LocationPicker')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('home.selectCity')}
          >
            <Ionicons name="location" size={13} color={colors.primary} />
            <Text style={styles.heroCityText} numberOfLines={1}>
              {locSel.cityLabel || t('home.currentCity')}
            </Text>
            <Ionicons name="chevron-down" size={11} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      {/* 顶部找房卡：业务 Tab（整租 / 买房）嵌入卡顶 / 搜索行（放大镜 + 占位符 + ｜ + 附近）/ 分隔线 / 居室快选 / 查看N套 + 去地图看 */}
      <View style={styles.heroCard}>
        {/* 业务 Tab 嵌入卡顶：选中项为白色圆角块（对齐参考图） */}
        <View style={styles.heroTabs}>
          {BIZ_TABS.map((b) => (
            <TouchableOpacity
              key={b.key}
              style={[styles.heroTab, biz === b.key && styles.heroTabActive]}
              onPress={() => {
                setBiz(b.key);
                setOpenTab(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.heroTabText, biz === b.key && styles.heroTabTextActive]}>
                {b.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.heroBody}>
        <View style={styles.heroSearchRow}>
          <Ionicons name="search-outline" size={18} color={colors.ink3} />
          <TextInput
            style={styles.heroSearchInput}
            placeholder={t('list.searchPlaceholder')}
            placeholderTextColor={colors.ink3}
            value={keyword}
            onChangeText={setKeyword}
            returnKeyType="search"
            onFocus={() => setSearchFocused(true)}
            onSubmitEditing={handleSearchSubmit}
          />
          <View style={styles.heroSearchSplit} />
          <TouchableOpacity
            style={styles.heroNearby}
            onPress={handleToggleNearby}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('list.nearby')}
          >
            <Ionicons
              name="locate-outline"
              size={16}
              color={nearby ? colors.primary : colors.ink2}
            />
            <Text style={[styles.heroNearbyText, nearby && styles.heroNearbyTextActive]}>
              {t('list.nearby')}
            </Text>
          </TouchableOpacity>
        </View>
      {/* 最近搜索：输入框有焦点且本地有历史词时展示（无历史不渲染） */}
      {searchFocused && recentSearches.length > 0 && (
        <View style={styles.recentWrap}>
          <View style={styles.recentHead}>
            <Text style={styles.recentTitle}>{t('search.recent')}</Text>
            <TouchableOpacity
              onPress={clearRecentSearches}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('search.clearAll')}
            >
              <Text style={styles.recentClear}>{t('search.clearAll')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.recentGroup}>
            {recentSearches.map((kw) => (
              <TouchableOpacity
                key={kw}
                style={styles.recentChip}
                onPress={() => applyRecentSearch(kw)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.recentChipText}>{kw}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
        <View style={styles.heroDivider} />
        {/* 居室快选：不限 / 1居 / 2居 / 3居+（与「更多」面板共用同一个 bedFilter） */}
        <View style={styles.heroBeds}>
          {HERO_BED_OPTIONS.map((b) => {
            const on = bedFilter === b.key;
            return (
              <TouchableOpacity
                key={b.key || 'any'}
                style={styles.heroBedItem}
                onPress={() => setBedFilter(b.key)}
                activeOpacity={0.8}
              >
                {on ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                ) : (
                  <View style={styles.heroBedCircle} />
                )}
                <Text style={[styles.heroBedText, on && styles.heroBedTextActive]}>
                  {b.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroPrimary}
            onPress={handleViewResults}
            activeOpacity={0.9}
          >
            <Text style={styles.heroPrimaryText}>
              {t('list.viewCount', { n: visibleCount })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.heroMapBtn} onPress={handleGoMap} activeOpacity={0.9}>
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text style={styles.heroMapText}>{t('list.goMap')}</Text>
          </TouchableOpacity>
        </View>
        </View>
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
                          {tab === 'area' ? t('regionFilter.title') : t('list.metro')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {locTab === 'area' ? (
                    <>
                      {/* 当前定位城市下的 区/街道 平铺列表：找房页不做国家/省市，只留 区/街道 颗粒度（链家样式） */}
                      <ScrollView style={styles.keCol3} showsVerticalScrollIndicator={false}>
                        <Text style={styles.keSection}>{t('list.districtSuffix', { city: locSel.cityLabel })}</Text>
                        <TouchableOpacity
                          style={styles.keOption}
                          onPress={() => applyDistrict(null)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.keOptionMain}>
                            <Text style={[styles.keOptionText, districtSel === null && styles.keOptionTextActive]}>
                              {t('common.any')}
                            </Text>
                          </View>
                          <View style={[styles.keRadio, districtSel === null && styles.keRadioOn]}>
                            {districtSel === null && <View style={styles.keRadioDot} />}
                          </View>
                        </TouchableOpacity>
                        {districtList.map((d) => (
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
                          <Text style={[styles.keRowText, !metroDraft.length && styles.keRowTextActive]}>{t('common.any')}</Text>
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
                          {metroDraft.length ? t('list.selectedN', { n: metroDraft.length }) : ''}
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
                    <Text style={styles.resetText}>{t('pub.reset')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCurrent('region')} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>{t('common.confirm')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {openTab === 'price' && (
              <>
                <Text style={styles.dropGroupTitle}>{t('list.quickSelect')}</Text>
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
                <Text style={styles.dropGroupTitle}>{t('list.customPrice')}</Text>
                <View style={styles.priceCustomRow}>
                  <View style={styles.priceCustomInput}>
                    <Text style={styles.priceCustomPrefix}>฿</Text>
                    <TextInput
                      style={styles.priceCustomField}
                      value={customMin}
                      onChangeText={(v) => { setCustomMin(v.replace(/[^\d]/g, '')); if (v) setPriceRange(''); }}
                      placeholder={t('list.minPrice')}
                      placeholderTextColor={colors.ink3}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.priceCustomUnit}>{t('prop.tenThousandPerMonth')}</Text>
                  </View>
                  <Text style={styles.priceCustomDivider}>{t('list.to')}</Text>
                  <View style={styles.priceCustomInput}>
                    <Text style={styles.priceCustomPrefix}>฿</Text>
                    <TextInput
                      style={styles.priceCustomField}
                      value={customMax}
                      onChangeText={(v) => { setCustomMax(v.replace(/[^\d]/g, '')); if (v) setPriceRange(''); }}
                      placeholder={t('list.maxPrice')}
                      placeholderTextColor={colors.ink3}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.priceCustomUnit}>{t('prop.tenThousandPerMonth')}</Text>
                  </View>
                </View>
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={() => resetCurrent('price')} activeOpacity={0.7}>
                    <Text style={styles.resetText}>{t('pub.reset')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCurrent('price')} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>{t('common.confirm')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {openTab === 'more' && (
              <>
                {/* 多组条件叠加后超出面板高度，内容区独立滚动，操作行常驻可见 */}
                <ScrollView style={styles.dropBodyTall}>
                  <Text style={styles.dropGroupTitle}>{t('list.layout')}</Text>
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
                  <Text style={styles.dropGroupTitle}>{t('list.schoolDistance')}</Text>
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
                    placeholder={t('prop.searchSchool')}
                    placeholderTextColor={colors.ink3}
                    returnKeyType="search"
                  />
                  <View style={styles.filterGroup}>
                    <TouchableOpacity
                      style={[styles.filterChip, !schoolId && styles.filterChipActive]}
                      onPress={() => {
                        setSchoolId('');
                        setSchoolName('');
                      }}
                    >
                      <Text style={[styles.filterText, !schoolId && styles.filterTextActive]}>{t('common.any')}</Text>
                    </TouchableOpacity>
                    {filteredSchools.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.filterChip, schoolId === s.id && styles.filterChipActive]}
                        onPress={() => {
                          setSchoolId(s.id);
                          setSchoolName(s.name ?? t('prop.filterSchool'));
                        }}
                      >
                        <Text style={[styles.filterText, schoolId === s.id && styles.filterTextActive]}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {schoolsLoaded && !filteredSchools.length && (
                    <Text style={styles.dropEmpty}>{t('list.noSchoolMatch')}</Text>
                  )}
                  <Text style={styles.dropGroupTitle}>{t('prop.type')}</Text>
                  <View style={styles.filterGroup}>
                    {PROPERTY_TYPE_FILTERS.map((f) => (
                      <TouchableOpacity
                        key={f.key || 'all'}
                        style={[styles.filterChip, (f.key ? filterTypes.includes(f.key) : !filterTypes.length) && styles.filterChipActive]}
                        onPress={() => setFilterTypes(f.key ? [f.key] : [])}
                      >
                        <Text style={[styles.filterText, (f.key ? filterTypes.includes(f.key) : !filterTypes.length) && styles.filterTextActive]}>{f.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dropGroupTitle}>{t('prop.orientation')}</Text>
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
                  <Text style={styles.dropGroupTitle}>{t('list.floor')}</Text>
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
                  <Text style={styles.dropGroupTitle}>{t('pub.filterArea')}</Text>
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
                        placeholder={t('list.minArea')}
                        placeholderTextColor={colors.ink3}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.priceCustomUnit}>㎡</Text>
                    </View>
                    <Text style={styles.priceCustomDivider}>{t('list.to')}</Text>
                    <View style={styles.priceCustomInput}>
                      <TextInput
                        style={styles.priceCustomField}
                        value={areaCustomMax}
                        onChangeText={(v) => { setAreaCustomMax(v.replace(/[^\d]/g, '')); if (v) setAreaRange(''); }}
                        placeholder={t('list.maxArea')}
                        placeholderTextColor={colors.ink3}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.priceCustomUnit}>㎡</Text>
                    </View>
                  </View>
                  <Text style={styles.dropGroupTitle}>{t('prop.decoration')}</Text>
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
                  <Text style={styles.dropGroupTitle}>{t('list.amenities')}</Text>
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
                  <Text style={styles.dropGroupTitle}>{t('list.propertyStatus')}</Text>
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
                    <Text style={styles.resetText}>{t('pub.reset')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCurrent('more')} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>{t('common.confirm')}</Text>
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
      {/* 列表：整租=真实租赁房源 / 买房=真实在售挂牌 */}
      <FlatList
        ref={listRef}
        data={(biz === 'sale' ? saleFiltered : sortedData) as any[]}
        keyExtractor={(item) => item.id}
        renderItem={(biz === 'sale' ? renderSaleItem : renderItem) as any}
        contentContainerStyle={[styles.list, respContainer]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        /* 长列表性能：控制首屏/批次渲染数量与视窗外回收 */
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        /* 收藏/翻译态属于 data 之外的父级状态：不传 extraData 时 FlatList 不重渲染卡片，
           点收藏后红心不更新。memo 化保证只在收藏/加载/翻译状态变化时才触发行重渲染 */
        extraData={listExtraData}
        ListEmptyComponent={
          biz === 'sale' && saleLoading ? (
            <LoadingState label={t('list.loadingSale')} />
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
                    name="home-outline"
                    size={44}
                    color={colors.ink3}
                  />
                  <Text style={styles.empty}>
                    {t('empty.listings')}
                  </Text>
                  <Text style={styles.emptySub}>
                    {biz === 'sale' ? t('list.emptySale') : t('empty.listingsSub')}
                  </Text>
                </>
              )}
            </View>
          )
        }
      />

      {/* 地图找房弹层：App 无原生地图库（Expo Go 不能加载原生地图模块），
          以「视野内房源列表」消费 /public/map-points（价格/面积/房型/距离），点行进公开详情。
          真地图需引入原生地图库并做 dev build。 */}
      <Modal
        visible={mapOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMapOpen(false)}
      >
        <View style={styles.mapWrap}>
          <View style={[styles.mapCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.mapHead}>
              <View style={styles.mapHeadText}>
                <Text style={styles.mapTitle}>{t('map.title')}</Text>
                <Text style={styles.mapHint}>{t('map.hint')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMapOpen(false)}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            {mapLoading ? (
              <View style={styles.mapCenter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : mapError ? (
              <View style={styles.mapCenter}>
                <Text style={styles.mapEmpty}>{t('loadFailed')}</Text>
                <TouchableOpacity style={styles.mapRetry} onPress={() => loadMapPoints()} activeOpacity={0.8}>
                  <Text style={styles.mapRetryText}>{t('retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : mapPoints.length === 0 ? (
              <View style={styles.mapCenter}>
                <Text style={styles.mapEmpty}>{t('map.empty')}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.mapCount}>{t('map.pointCount', { n: mapPoints.length })}</Text>
                <FlatList
                  data={mapPoints}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.mapList}
                  renderItem={({ item }) => {
                    const price = item.price ?? item.monthly_rent;
                    const dist =
                      userPos && item.lat != null && item.lng != null
                        ? haversineKm(userPos, { lat: item.lat, lng: item.lng })
                        : null;
                    return (
                      <TouchableOpacity
                        style={styles.mapRow}
                        activeOpacity={0.85}
                        onPress={() => {
                          setMapOpen(false);
                          navigation.navigate('PublicListingDetail', { id: item.id });
                        }}
                      >
                        <View style={styles.mapBody}>
                          <Text style={styles.mapRowTitle} numberOfLines={1}>
                            {item.project_name || item.room_number || item.address || t('pub.listingsTitle')}
                          </Text>
                          <View style={styles.mapFactRow}>
                            {item.bedrooms != null ? (
                              <Text style={styles.mapFact}>{item.bedrooms} BED</Text>
                            ) : null}
                            {item.size_sqm != null ? (
                              <Text style={styles.mapFact}>
                                {item.size_sqm} {t('pub.sqm')}
                              </Text>
                            ) : null}
                            {item.listing_type ? (
                              <Text style={styles.mapFact}>{listingTypeLabel(item.listing_type, t)}</Text>
                            ) : null}
                          </View>
                          {item.address ? (
                            <Text style={styles.mapAddr} numberOfLines={1}>
                              {item.address}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.mapRight}>
                          {price != null ? (
                            <Text style={styles.mapPrice}>{formatRent(price, item.currency || 'THB')}</Text>
                          ) : null}
                          {dist != null ? (
                            <Text style={styles.mapDist}>
                              {dist.toFixed(1)} {t('pub.km')}
                            </Text>
                          ) : (
                            <Text style={styles.mapNoLoc}>{t('map.noLocation')}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // 顶部头部区：浅 teal 实色块通栏铺满，内含大标题 + 城市定位胶囊
  heroBand: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 30,
  },
  heroBandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: {
    flex: 1,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
  // 城市胶囊：白底浮在浅 teal 色块上，点击进全局定位选择器
  heroCityChip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
  },
  heroCityText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  // 顶部找房卡：业务 Tab（嵌入卡顶）/ 搜索行 / 分隔线 / 居室快选 / 查看N套 + 去地图看
  // marginTop 为负：卡片上压进色块，形成「卡片浮在头部色块上」的层次（对齐参考图）
  heroCard: {
    marginHorizontal: 12,
    marginTop: -15,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  // 业务 Tab 条：灰底铺满卡顶，选中项为白色圆角块（对齐参考图）
  heroTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: colors.surface2,
  },
  heroTab: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  // 选中块：白底 + 轻投影，与卡片主体连成一体
  heroTabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  heroTabText: { fontSize: 14, color: colors.ink2, fontWeight: '500' },
  heroTabTextActive: { color: colors.text, fontWeight: '700' },
  heroBody: { paddingHorizontal: 14, paddingVertical: 12 },
  heroSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  heroSearchInput: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 6,
    fontSize: 15,
    color: colors.text,
  },
  heroSearchSplit: { width: 1, height: 20, backgroundColor: colors.border },
  heroNearby: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10 },
  heroNearbyText: { fontSize: 14, color: colors.ink2 },
  heroNearbyTextActive: { color: colors.primary, fontWeight: '600' },
  heroDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  heroBeds: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  heroBedItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  heroBedCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  heroBedText: { fontSize: 14, color: colors.ink2 },
  heroBedTextActive: { color: colors.primary, fontWeight: '600' },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  heroPrimary: {
    flex: 1.6,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPrimaryText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  heroMapBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  heroMapText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  // 最近搜索：标题行 + 横向换行 chips（无历史词时不渲染该区块）
  recentWrap: { paddingTop: 10 },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recentTitle: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
  recentClear: { fontSize: 12, color: colors.ink3, paddingVertical: 2 },
  recentGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentChipText: { fontSize: 13, color: colors.ink2 },
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
  keRadioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.surface },
  keBack: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  keBackText: { fontSize: 12, color: colors.ink3 },
  // 筛选项：用方块（对齐图中方格选项，取代原胶囊）
  filterChip: {
    minHeight: 40,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: colors.surface,
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
  // 地图找房弹层：底部卡片 + 视野内房源列表（App 无原生地图库时的降级形态）
  mapWrap: { flex: 1, backgroundColor: colors.alpha('0,0,0', 0.45), justifyContent: 'flex-end' },
  mapCard: {
    maxHeight: '78%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.lg,
    borderTopRightRadius: colors.radius.lg,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  mapHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mapHeadText: { flex: 1 },
  mapTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  mapHint: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  mapCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  mapEmpty: { fontSize: 14, color: colors.ink2 },
  mapRetry: {
    marginTop: 12,
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapRetryText: { fontSize: 14, color: colors.primaryForeground, fontWeight: '600' },
  mapCount: { fontSize: 12, color: colors.ink3, marginTop: 12, marginBottom: 4 },
  mapList: { paddingBottom: 8 },
  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  mapBody: { flex: 1 },
  mapRowTitle: { fontSize: 15, color: colors.text, fontWeight: '600' },
  mapFactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  mapFact: { fontSize: 12, color: colors.ink2 },
  mapAddr: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  mapRight: { alignItems: 'flex-end', gap: 4 },
  mapPrice: { fontSize: 15, color: colors.primary, fontWeight: '700' },
  mapDist: { fontSize: 12, color: colors.ink2 },
  mapNoLoc: { fontSize: 11, color: colors.ink3, maxWidth: 96, textAlign: 'right' },
});