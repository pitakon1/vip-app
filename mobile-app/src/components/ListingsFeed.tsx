/**
 * 找房列表（共享展示组件）
 *
 * 从 C 端「找房」页（screens/tenant/ListingsScreen.tsx）抽取的**纯展示层**：
 * 顶部头部区 / 找房卡（业务 Tab + 搜索 + 居室快选 + 查看N套 + 去地图）/ 筛选 Tab 栏
 * 与四个顶部下拉面板（区域 / 价格 / 更多 / 排序）/ 房源卡片 / 空态 / 加载更多。
 *
 * 设计原则：**完全受控**。列表数据、筛选值、收藏态、业务 Tab 均由 props 传入，
 * 组件只持有「瞬时 UI 状态」（哪个下拉面板打开、面板内草稿、搜索焦点、最近搜索），
 * 一切筛选值变化都通过 `onFiltersChange` 回写父级，由父级负责数据逻辑。
 * 员工端 / C 端复用同一份渲染，保证 UI 1:1。
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
  ScrollView,
  Animated,
  Platform,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useResponsiveContainerStyle } from '@/theme/responsive';
import { SCHOOL_RADIUS_OPTIONS } from '@/lib/publicSite';
import { metroLineDisplayName, metroLineFullName } from '@/data/locationNames';
import { AREA_PRESETS as AREA_PRESET_TIERS, PRICE_PRESETS } from '@/constants/filters';
import { fmtMoney as formatRent, currencySymbol, formatArea } from '@/utils/format';
import { joinFacts } from '@/lib/displayValue';
import { notify } from '@/utils/feedback';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import RemoteImage from '@/components/RemoteImage';
import { PanelBackdrop, usePanelAnchor } from '@/components/PanelBackdrop';
import { useI18n } from '@/i18n';
import { getItem, setItem } from '@/lib/kv';
import type { PublicSchool } from '@/services/publicApi';

// 搜索历史（最近搜索）：本地持久化，去重置顶、上限 10 条
const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

export type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** 业务归属 Tab：租房 / 二手房 / 新房（C 端沿用整租·买房两个入口） */
export type BizKey = 'all' | 'rent' | 'sale' | 'resale' | 'new';

/** 顶部找房卡「居室」快选：不限 / 1居 / 2居 / 3居+ */
export type HeroBedKey = '' | '1' | '2' | '3p';

type OpenTab = null | 'region' | 'type' | 'price' | 'more' | 'sort';

/** 列表卡片数据模型（C 端公开层与员工端归一化后共用） */
export interface Listing {
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
  /** 买卖挂牌价（买房 Tab 卡片用） */
  asking_price?: number;
  [key: string]: any;
}

/** 区域面板数据源（区/街道） */
export interface RegionDistrict {
  key: string;
  label: string;
  kws: string[];
}

/** 区域面板地铁数据源 */
export interface RegionMetroLine {
  key: string;
  name: string;
  cityLabel: string;
  stations: { name: string; kws: string[] }[];
}

/** 受控筛选值（父级持有真实状态，组件只读 + 通过 onFiltersChange 提交变更） */
export interface ListingsFilters {
  keyword: string;
  /** 已选城区（区/街道）key；null = 不限 */
  districtSel: string | null;
  /** 已确认的地铁站点 name 列表 */
  metroSel: string[];
  /** 价格预设 key */
  priceRange: string;
  customMin: string;
  customMax: string;
  /** 户型 key（'' / '1'..'5' / '3p'） */
  bedFilter: string;
  statusFilter: string;
  orientationSel: string;
  floorSel: string;
  decorSel: string;
  amenitySel: string[];
  areaRange: string;
  areaCustomMin: string;
  areaCustomMax: string;
  sortKey: string;
  schoolId: string;
  schoolKm: number;
  schoolKw: string;
  /** 房源类型（多选，服务端 property_type） */
  filterTypes: string[];
  /** 新房/二手房（仅买房业务；undefined = 不限） */
  isNew?: boolean;
  /** 二手房单价（THB/㎡，服务端 unit_price_min/max） */
  unitPriceMin?: string;
  unitPriceMax?: string;
  /** 租房押金月数（'' / '1' / '2' / '3'），服务端 deposit_months_min/max */
  depositMonths?: string;
  /** 租房可入住时间（'' / '1' / '3'：N 个月内可入住） */
  availableWithin?: string;
  /** 房龄（二手房）/ 交房年份（新房）：服务端 completion_year_min/max */
  completionYearMin?: string;
  completionYearMax?: string;
}

export interface ListingsFeedProps {
  /** 已完成筛选/排序的最终数据（组件不做任何数据加工） */
  items: Listing[];
  loading: boolean;
  /** 当前业务 Tab 是否加载失败（父级按 biz 汇总） */
  error: boolean;
  /** 空列表时的加载态（买房挂牌加载中） */
  emptyLoading?: boolean;
  refreshing: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onRefresh: () => void;
  /** 空态「重试」回调（父级按 biz 决定重拉哪份数据） */
  onRetry: () => void;
  filters: ListingsFilters;
  onFiltersChange: (patch: Partial<ListingsFilters>) => void;
  favSet: Record<string, boolean>;
  favPending: Record<string, boolean>;
  onToggleFav: (item: Listing) => void;
  biz: BizKey;
  onBizChange: (b: BizKey) => void;
  /** 自定义价格筛选的展示币种（跟随当前市场，默认 THB） */
  currency?: string;
  onOpenDetail: (item: Listing) => void;
  /** 区域面板数据源（区/街道） */
  districts: RegionDistrict[];
  /** 区域面板地铁线路（父级已按定位城市过滤） */
  metroLines: RegionMetroLine[];
  /** 定位城市名（区域面板标题 + 顶部城市胶囊） */
  cityLabel: string;
  schools: PublicSchool[];
  schoolsLoaded: boolean;
  /** 「附近」排序入口（默认不展示） */
  enableNearby?: boolean;
  nearby?: boolean;
  onToggleNearby?: () => void;
  /** 翻译入口（默认展示，仅语言不一致时出现） */
  enableTranslate?: boolean;
  translatingId?: string | null;
  onTranslate?: (item: Listing) => void;
  /** 「去地图看」入口（默认展示） */
  showMapButton?: boolean;
  onOpenMap?: () => void;
  /** 面板首次展开回调（父级据此懒加载学校候选等） */
  onPanelOpen?: (key: 'region' | 'price' | 'more' | 'sort') => void;
  /** 地铁面板默认选中线路（不传则取 metroLines[0]） */
  defaultMetroLineKey?: string;
  /** 展示形态：default=C 端找房；employee=销售端（三条业务线 + 类型 Tab + 条件回显） */
  variant?: 'default' | 'employee';
  /** 结果总数（服务端 total；用于「查看 N 套房源」，与分页同口径） */
  total?: number;
  /** 业务线入口（employee 传租房/二手房/新房三项；默认 C 端整租/买房） */
  bizOptions?: { key: BizKey; label: string }[];
  /** 员工端卡片「编辑」入口（不传则不展示） */
  onEditItem?: (item: Listing) => void;
  /** 搜索框占位文案（业务线不同文案不同；不传用默认） */
  searchPlaceholder?: string;
  /** 进入页面即聚焦搜索框（首页搜索条直达） */
  autoFocusSearch?: boolean;
  /** 聚焦触发时间戳：重复从首页进入时也能重新聚焦 */
  searchFocusTs?: number;
}

// ==================== 选项数据（纯 UI 用，父级可复用价格/面积预设做筛选） ====================

export interface PricePreset {
  key: string;
  label: string;
  min: number;
  max: number;
}

/** 价格区间（月租，THB）—— 贝壳式：预设快捷区间 + 自定义最低/最高 */
const PRICE_LABELS: Record<string, string> = {
  u3: 'prop.priceLt3',
  '3-5': 'prop.price3to5',
  '5-8': 'prop.price5to8',
  g8: 'prop.priceGt8',
};
export const priceRanges = (t: TFunc): PricePreset[] =>
  PRICE_PRESETS.map((p) => ({ ...p, label: p.key ? t(PRICE_LABELS[p.key]) : t('common.any') }));

/** 当前年份：房龄 / 新房交房年份的快筛基准 */
const NOW_YEAR = new Date().getFullYear();

export interface AreaPreset {
  key: string;
  label: string;
  min: number;
  max: number;
}

/** 面积筛选（贝壳式：预设快捷区间 + 自定义最低/最高 ㎡） */
const AREA_LABELS: Record<string, string> = {
  u50: 'prop.areaLt50',
  '50-100': 'prop.area50to100',
  '100-150': 'prop.area100to150',
  '150-200': 'prop.area150to200',
  g200: 'prop.areaGt200',
};
export const areaPresets = (t: TFunc): AreaPreset[] =>
  AREA_PRESET_TIERS.map((p) => ({ ...p, label: p.key ? t(AREA_LABELS[p.key]) : t('common.any') }));

/** 售侧总价区间（THB）：租房的月租档位不能复用，单独一套买卖口径 */
export const salePriceRanges = (t: TFunc): PricePreset[] => [
  { key: '', min: 0, max: Infinity, label: t('common.any') },
  { key: 's2m', min: 0, max: 2000000, label: `≤${formatRent(2000000, 'THB')}` },
  { key: 's2-5m', min: 2000000, max: 5000000, label: `${formatRent(2000000, 'THB')} - ${formatRent(5000000, 'THB')}` },
  { key: 's5-10m', min: 5000000, max: 10000000, label: `${formatRent(5000000, 'THB')} - ${formatRent(10000000, 'THB')}` },
  { key: 's10m', min: 10000000, max: Infinity, label: `≥${formatRent(10000000, 'THB')}` },
];

/** 房源类型分组（销售端共用层：公寓=apartment+condo、商铺办公=office+shop） */
const TYPE_CLASS_GROUPS: { key: string; labelKey: string; types: string[] }[] = [
  { key: '', labelKey: 'pub.filterAny', types: [] },
  { key: 'apartment', labelKey: 'prop.type.apartment', types: ['apartment', 'condo'] },
  { key: 'villa', labelKey: 'prop.type.house', types: ['villa', 'house'] },
  { key: 'commercial', labelKey: 'category.commTitle', types: ['office', 'shop'] },
  { key: 'factory', labelKey: 'prop.type.factory', types: ['factory'] },
  { key: 'hotel', labelKey: 'prop.type.hotel', types: ['hotel'] },
  { key: 'land', labelKey: 'prop.type.land', types: ['land'] },
];

// 顶部找房卡「居室」快选：不限 / 1居 / 2居 / 3居+（3居+ = 3 室及以上）
const heroBedOptions = (t: TFunc): { key: HeroBedKey; label: string }[] => [
  { key: '', label: t('common.any') },
  { key: '1', label: t('prop.bedroomN', { n: 1 }) },
  { key: '2', label: t('prop.bedroomN', { n: 2 }) },
  { key: '3p', label: t('list.bed3plus') },
];

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
  { key: 'townhouse', label: t('prop.type.townhouse') },
  { key: 'shop', label: t('prop.type.commercial') },
  { key: 'coworking', label: t('prop.type.coworking') },
  { key: 'homeoffice', label: t('prop.type.homeoffice') },
  { key: 'showroom', label: t('prop.type.showroom') },
  { key: 'factory', label: t('prop.type.factory') },
  { key: 'warehouse', label: t('prop.type.warehouse') },
  { key: 'hotel', label: t('prop.type.hotel') },
  { key: 'land', label: t('prop.type.land') },
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

const statusFilters = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: 'vacant', label: t('status.vacant') },
  { key: 'rented', label: t('status.rented') },
  { key: 'renewing', label: t('status.renewing') },
  { key: 'maintenance', label: t('status.maintenance') },
];

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

const floorLevelOptions = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: 'low', label: t('prop.floorLow') },
  { key: 'mid', label: t('prop.floorMid') },
  { key: 'high', label: t('prop.floorHigh') },
];

const decorationOptions = (t: TFunc) => [
  { key: '', label: t('common.any') },
  { key: 'bare', label: t('pub.decoration.bare') },
  { key: 'simple', label: t('pub.decoration.simple') },
  { key: 'standard', label: t('pub.decoration.standard') },
  { key: 'luxury', label: t('pub.decoration.luxury') },
  { key: 'fully_furnished', label: t('pub.decoration.fully_furnished') },
];

const amenityOptions = (t: TFunc) => [
  { key: 'aircon', label: t('prop.amenity.aircon') },
  { key: 'pool', label: t('prop.amenity.pool') },
  { key: 'gym', label: t('prop.amenity.gym') },
  { key: 'parking', label: t('prop.amenity.parking') },
  { key: 'elevator', label: t('prop.amenity.elevator') },
  { key: 'balcony', label: t('prop.amenity.balcony') },
  { key: 'garden', label: t('prop.amenity.garden') },
];

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
  townhouse: t('prop.type.townhouse'),
  coworking: t('prop.type.coworking'),
  homeoffice: t('prop.type.homeoffice'),
  showroom: t('prop.type.showroom'),
  factory: t('prop.type.factory'),
  warehouse: t('prop.type.warehouse'),
  hotel: t('prop.type.hotel'),
  land: t('prop.type.land'),
});

const statusLabels = (t: TFunc): Record<string, string> => ({
  vacant: t('status.vacant'),
  rented: t('status.rented'),
  renewing: t('status.renewing'),
  maintenance: t('status.maintenance'),
});

// ==================== 语言判定（决定是否展示翻译入口） ====================
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const THAI_RE = /[\u0e00-\u0e7f]/;

// 文本语言是否与界面语言一致（无文本视为一致 → 不展示翻译按钮）
export const isSameLang = (text: string, uiLang: string): boolean => {
  const s = (text || '').trim();
  if (!s) return true;
  if (uiLang === 'zh') return CJK_RE.test(s);
  if (uiLang === 'th') return THAI_RE.test(s);
  return !CJK_RE.test(s) && !THAI_RE.test(s);
};

// 用于语言判定与翻译的源文本
export const translateSource = (item: Listing): string =>
  (item.description || item.address || '').trim();

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
  /** 员工端「编辑卡片」入口（不传则不展示） */
  onEdit?: (item: Listing) => void;
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
  onEdit,
}: ListingCardProps) {
  const { t } = useI18n();
  const typeBadge = colors.badge;
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
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="home-outline" size={28} color={colors.ink3} />
          </View>
        )}
        <View style={styles.typeBadge}>
          <Text style={[styles.typeBadgeText, { color: typeBadge.fg }]}>
            {typeLabels(t)[item.property_type ?? ''] ?? t('listingFallback')}
          </Text>
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
              color={favorited ? colors.error : colors.onDark}
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
          {(() => {
            const facts = joinFacts([
              item.bedrooms != null ? t('prop.bedroomN', { n: item.bedrooms }) : null,
              item.size_sqm != null ? formatArea(item.size_sqm, t('pub.sqm')) : null,
            ])
            return facts ? <Text style={styles.tag}>{facts}</Text> : null
          })()}
          <Text style={styles.tag}>{statusLabels(t)[item.status ?? 'vacant'] ?? '—'}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.rent}>
            {formatRent(item.monthly_rent, item.currency)}
            <Text style={styles.rentUnit}>{t('rent.perMonth')}</Text>
          </Text>
          {onEdit ? (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => onEdit(item)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('adm.psManage')}
            >
              <Text style={styles.editText}>{t('adm.psManage')}</Text>
            </TouchableOpacity>
          ) : null}
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

export default function ListingsFeed({
  items,
  loading,
  error,
  emptyLoading = false,
  refreshing,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onRefresh,
  onRetry,
  filters,
  onFiltersChange,
  favSet,
  favPending,
  onToggleFav,
  biz,
  onBizChange,
  currency = 'THB',
  onOpenDetail,
  districts,
  metroLines,
  cityLabel,
  schools,
  schoolsLoaded,
  enableNearby = false,
  nearby = false,
  onToggleNearby,
  enableTranslate = true,
  translatingId = null,
  onTranslate,
  showMapButton = true,
  onOpenMap,
  onPanelOpen,
  defaultMetroLineKey,
  variant = 'default',
  total,
  bizOptions,
  onEditItem,
  searchPlaceholder,
  autoFocusSearch,
  searchFocusTs,
}: ListingsFeedProps) {
  const respContainer = useResponsiveContainerStyle();
  const { t, lang } = useI18n();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const isEmployee = variant === 'employee';
  // 买卖业务（C 端 sale / 销售端 resale、new）共用售侧口径
  const isSaleBiz = biz === 'sale' || biz === 'resale' || biz === 'new';
  // 顶部安全区：本组件同时服务底部 Tab（无 header）与堆栈页（有原生 header）。
  // 仅 Tab 场景补 insets.top；堆栈场景已由原生 header 让出安全区。
  const topInset = navigation.getState()?.type === 'tab' ? insets.top : 0;

  const BIZ_TABS = useMemo(() => bizOptions ?? bizTabs(t), [bizOptions, t]);
  const PROPERTY_TYPE_FILTERS = useMemo(() => propertyTypeFilters(t), [t]);
  const PRICE_RANGES = useMemo(() => priceRanges(t), [t]);
  const SALE_PRICE_RANGES = useMemo(() => salePriceRanges(t), [t]);
  const BEDROOM_OPTIONS = useMemo(() => bedroomOptions(t), [t]);
  const STATUS_FILTERS = useMemo(() => statusFilters(t), [t]);
  const ORIENTATION_OPTIONS = useMemo(() => orientationOptions(t), [t]);
  const FLOOR_LEVEL_OPTIONS = useMemo(() => floorLevelOptions(t), [t]);
  const DECORATION_OPTIONS = useMemo(() => decorationOptions(t), [t]);
  const AMENITY_OPTIONS = useMemo(() => amenityOptions(t), [t]);
  const AREA_PRESETS = useMemo(() => areaPresets(t), [t]);
  const SORT_OPTIONS = useMemo(() => sortOptions(t), [t]);
  const HERO_BED_OPTIONS = useMemo(() => heroBedOptions(t), [t]);

  // ---------- 组件自持的瞬时 UI 状态 ----------
  const [openTab, setOpenTab] = useState<OpenTab>(null);
  // 面板外点击收起：遮罩铺在「筛选条 + 面板」下沿以下，点列表区即关闭
  const { rootRef, anchorRef, backdropTop, measureAnchor } = usePanelAnchor();
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area');
  const [metroLine, setMetroLine] = useState<string>(
    defaultMetroLineKey ?? metroLines[0]?.key ?? '',
  );
  const [metroDraft, setMetroDraft] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  // 首页搜索条直达：延迟到页面转场结束后聚焦，避免键盘抢动画
  const searchRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!autoFocusSearch) return;
    const timer = setTimeout(() => {
      searchRef.current?.focus();
      setSearchFocused(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [autoFocusSearch, searchFocusTs]);
  // 收起最近搜索面板：失焦时延后关闭，避免点面板里的历史词时先被 blur 卸载导致点击丢失
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
    },
    [],
  );
  const closeSearchPanel = useCallback(() => {
    if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
    searchBlurTimer.current = null;
    setSearchFocused(false);
  }, []);
  const handleSearchBlur = useCallback(() => {
    if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
    searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150);
  }, []);
  // 列表 ref：点「查看 N 套房源」后回到列表顶部
  const listRef = useRef<FlatList<any>>(null);

  // 学校候选：按关键字过滤（数据由父级懒加载后传入）
  const filteredSchools = useMemo(() => {
    const kw = filters.schoolKw.trim().toLowerCase();
    if (!kw) return schools;
    return schools.filter((s) =>
      `${s.name ?? ''} ${s.name_en ?? ''} ${s.district ?? ''}`.toLowerCase().includes(kw),
    );
  }, [schools, filters.schoolKw]);

  // 地铁线路（父级已按城市过滤）；当前选中线路
  const activeLine = useMemo(
    () => metroLines.find((l) => l.key === metroLine),
    [metroLines, metroLine],
  );

  // 已选区域/地铁的关键词（用于筛选栏高亮判断）
  const activeLocationKw = useMemo(() => {
    if (filters.districtSel) {
      const node = districts.find((d) => d.key === filters.districtSel);
      return node ? node.kws : [];
    }
    if (filters.metroSel.length) {
      const stations = metroLines.flatMap((l) => l.stations);
      return stations.filter((s) => filters.metroSel.includes(s.name)).flatMap((s) => s.kws);
    }
    return [];
  }, [filters.districtSel, filters.metroSel, districts, metroLines]);

  const regionLabel = useMemo(() => {
    if (filters.districtSel) {
      const node = districts.find((d) => d.key === filters.districtSel);
      return node ? node.label : t('regionFilter.title');
    }
    if (filters.metroSel.length) {
      const first = filters.metroSel[0];
      return filters.metroSel.length > 1 ? `${first} +${filters.metroSel.length - 1}` : first;
    }
    return t('regionFilter.title');
  }, [filters.districtSel, filters.metroSel, districts, t]);

  // ---------- 贝壳式 Tab 下拉面板：开合 / 重置 / 确定 ----------
  const hasPriceFilter = !!(filters.priceRange || filters.customMin || filters.customMax);
  // 自定义价格区间：最低 > 最高时不下发（否则结果必空），面板内就地提示
  const customPriceInvalid =
    !!filters.customMin && !!filters.customMax && Number(filters.customMin) > Number(filters.customMax);
  const hasAreaFilter = !!(filters.areaRange || filters.areaCustomMin || filters.areaCustomMax);
  const activeTypeGroup = TYPE_CLASS_GROUPS.find(
    (g) => g.types.length > 0 && g.types.length === filters.filterTypes.length &&
      g.types.every((x) => filters.filterTypes.includes(x)),
  );
  const priceLabel = filters.priceRange
    ? [...PRICE_RANGES, ...SALE_PRICE_RANGES].find((r) => r.key === filters.priceRange)?.label ??
      t('list.filterPrice')
    : filters.customMin || filters.customMax
    ? t('prop.custom')
    : t('list.filterPrice');
  const sortLabel = SORT_OPTIONS.find((s) => s.key === filters.sortKey)?.label ?? t('list.filterSort');
  // 「更多」收纳了学校 / 户型 / 房源类型 / 朝向 / 楼层 / 面积 / 装修 / 配套 / 状态，角标按已生效组数计
  const moreBadge =
    (filters.schoolId ? 1 : 0) +
    (filters.bedFilter ? 1 : 0) +
    (isEmployee ? 0 : filters.filterTypes.length ? 1 : 0) +
    (hasAreaFilter ? 1 : 0) +
    (filters.statusFilter ? 1 : 0) +
    (filters.orientationSel ? 1 : 0) +
    (filters.floorSel ? 1 : 0) +
    (filters.decorSel ? 1 : 0) +
    (filters.amenitySel.length ? 1 : 0) +
    (isEmployee && filters.depositMonths ? 1 : 0) +
    (isEmployee && filters.availableWithin ? 1 : 0) +
    (isEmployee && (filters.completionYearMin || filters.completionYearMax) ? 1 : 0) +
    (isEmployee && (filters.unitPriceMin || filters.unitPriceMax) ? 1 : 0);

  // 区域=实时单选；城区与地铁互斥
  const applyDistrict = useCallback(
    (key: string | null) => {
      if (filters.districtSel === key) {
        onFiltersChange({ districtSel: null });
        return;
      }
      onFiltersChange({ districtSel: key, metroSel: [] });
      setMetroDraft([]);
    },
    [filters.districtSel, onFiltersChange],
  );
  // 地铁=草稿多选，确定后提交
  const toggleStation = useCallback((name: string) => {
    setMetroDraft((d) => (d.includes(name) ? d.filter((s) => s !== name) : [...d, name]));
  }, []);
  const clearMetroDraft = useCallback(() => {
    setMetroDraft([]);
    onFiltersChange({ metroSel: [] });
  }, [onFiltersChange]);
  const confirmMetro = useCallback(() => {
    if (metroDraft.length) onFiltersChange({ metroSel: metroDraft, districtSel: null });
    else onFiltersChange({ metroSel: metroDraft });
  }, [metroDraft, onFiltersChange]);
  const resetLocation = useCallback(() => {
    onFiltersChange({ districtSel: null, metroSel: [] });
    setMetroDraft([]);
  }, [onFiltersChange]);

  const toggleTab = useCallback(
    (key: Exclude<OpenTab, null>) => {
      if (openTab === key) {
        setOpenTab(null);
        return;
      }
      setOpenTab(key);
      // 「类型」是销售端新增的轻量面板，无懒加载副作用，不需要回调父级
      if (key !== 'type') onPanelOpen?.(key);
      if (key === 'region') {
        setMetroDraft(filters.metroSel);
        if (!filters.districtSel && filters.metroSel.length) setLocTab('metro');
      }
    },
    [openTab, filters.metroSel, filters.districtSel, onPanelOpen],
  );

  const resetCurrent = useCallback(
    (key: Exclude<OpenTab, null>) => {
      if (key === 'region') {
        if (locTab === 'metro') clearMetroDraft();
        else resetLocation();
      } else if (key === 'price') {
        onFiltersChange({ priceRange: '', customMin: '', customMax: '' });
      } else if (key === 'type') {
        onFiltersChange({ filterTypes: [] });
        // 业务线也属于「类型」，重置时一并回到「全部」
        if (isEmployee) onBizChange('all');
      } else if (key === 'more') {
        onFiltersChange({
          schoolId: '',
          schoolKm: 3,
          bedFilter: '',
          ...(isEmployee ? {} : { filterTypes: [] }),
          isNew: undefined,
          areaRange: '',
          areaCustomMin: '',
          areaCustomMax: '',
          statusFilter: '',
          orientationSel: '',
          floorSel: '',
          decorSel: '',
          amenitySel: [],
          ...(isEmployee
            ? {
                depositMonths: '',
                availableWithin: '',
                completionYearMin: '',
                completionYearMax: '',
                unitPriceMin: '',
                unitPriceMax: '',
              }
            : {}),
        });
      } else if (key === 'sort') {
        onFiltersChange({ sortKey: 'default' });
      }
    },
    [locTab, clearMetroDraft, resetLocation, onFiltersChange, isEmployee, onBizChange],
  );

  const confirmCurrent = useCallback(
    (key: Exclude<OpenTab, null>) => {
      if (key === 'region') {
        if (locTab === 'metro') confirmMetro();
        setOpenTab(null);
      } else if (key) {
        setOpenTab(null);
      }
    },
    [locTab, confirmMetro],
  );

  // 贝壳式 Tab 栏展示数据
  // 「类型」排第一位：业务线（租房/二手房/新房）+ 房产类型合成一个入口，不再有顶部独立分段
  const bizTabLabel = biz !== 'all' ? BIZ_TABS.find((b) => b.key === biz)?.label ?? '' : '';
  const typeTabLabel =
    [bizTabLabel, activeTypeGroup ? t(activeTypeGroup.labelKey) : ''].filter(Boolean).join('·') ||
    t('pub.filterType');
  const typeTabActive = biz !== 'all' || !!activeTypeGroup;
  const filterTabs = [
    {
      key: 'type' as OpenTab,
      label: typeTabLabel,
      active: typeTabActive,
      badge: 0,
    },
    {
      key: 'region' as OpenTab,
      label:
        filters.districtSel || filters.metroSel.length ? regionLabel : t('regionFilter.title'),
      active: !!activeLocationKw.length,
      badge: 0,
    },
    {
      key: 'price' as OpenTab,
      // 售侧说的是总价，租侧才是月租
      label: hasPriceFilter
        ? priceLabel
        : isSaleBiz
        ? t('list.totalPrice').trim()
        : t('list.filterPrice'),
      active: hasPriceFilter,
      badge: 0,
    },
    {
      key: 'more' as OpenTab,
      label: t('list.filterMore'),
      active: moreBadge > 0,
      badge: moreBadge,
    },
    {
      key: 'sort' as OpenTab,
      label: filters.sortKey !== 'default' ? sortLabel : t('list.filterSort'),
      active: filters.sortKey !== 'default',
      badge: 0,
    },
  ];

  // ---------- 员工端：当前生效条件回显（可单条清除 / 一键重置） ----------
  const clearAllPatch = useMemo<Partial<ListingsFilters>>(
    () => ({
      keyword: '',
      districtSel: null,
      metroSel: [],
      priceRange: '',
      customMin: '',
      customMax: '',
      bedFilter: '',
      statusFilter: '',
      orientationSel: '',
      floorSel: '',
      decorSel: '',
      amenitySel: [],
      areaRange: '',
      areaCustomMin: '',
      areaCustomMax: '',
      sortKey: 'default',
      schoolId: '',
      schoolKm: 3,
      schoolKw: '',
      filterTypes: [],
      isNew: undefined,
      unitPriceMin: '',
      unitPriceMax: '',
      depositMonths: '',
      availableWithin: '',
      completionYearMin: '',
      completionYearMax: '',
    }),
    [],
  );
  const activeChips = useMemo(() => {
    if (!isEmployee) return [] as { key: string; label: string; patch: Partial<ListingsFilters> }[];
    const arr: { key: string; label: string; patch: Partial<ListingsFilters> }[] = [];
    const kw = filters.keyword.trim();
    if (kw) arr.push({ key: 'kw', label: kw, patch: { keyword: '' } });
    if (filters.districtSel || filters.metroSel.length) {
      arr.push({ key: 'region', label: regionLabel, patch: { districtSel: null, metroSel: [] } });
    }
    if (isEmployee && biz !== 'all') {
      arr.push({ key: 'biz', label: bizTabLabel, patch: {} });
    }
    if (activeTypeGroup) {
      arr.push({
        key: 'type',
        label: t(activeTypeGroup.labelKey),
        patch: { filterTypes: [] },
      });
    }
    if (hasPriceFilter) {
      arr.push({
        key: 'price',
        label: priceLabel,
        patch: { priceRange: '', customMin: '', customMax: '' },
      });
    }
    if (filters.bedFilter) {
      const bed = BEDROOM_OPTIONS.find((b) => b.key === filters.bedFilter);
      arr.push({ key: 'bed', label: bed?.label ?? filters.bedFilter, patch: { bedFilter: '' } });
    }
    if (hasAreaFilter) {
      const area = AREA_PRESETS.find((a) => a.key === filters.areaRange);
      arr.push({
        key: 'area',
        label: area?.label ?? t('pub.filterArea'),
        patch: { areaRange: '', areaCustomMin: '', areaCustomMax: '' },
      });
    }
    if (filters.depositMonths) {
      arr.push({
        key: 'deposit',
        label: `${t('prop.fieldDepositMonths')} ${filters.depositMonths}`,
        patch: { depositMonths: '' },
      });
    }
    if (filters.availableWithin) {
      arr.push({
        key: 'available',
        label: t('prop.monthsN', { n: filters.availableWithin }),
        patch: { availableWithin: '' },
      });
    }
    if (filters.completionYearMin) {
      arr.push({
        key: 'yearMin',
        label: `≥ ${filters.completionYearMin}`,
        patch: { completionYearMin: '' },
      });
    }
    if (filters.completionYearMax) {
      arr.push({
        key: 'yearMax',
        label: `≤ ${filters.completionYearMax}`,
        patch: { completionYearMax: '' },
      });
    }
    if (filters.unitPriceMin || filters.unitPriceMax) {
      arr.push({
        key: 'unitPrice',
        label: t('pub.unitPrice'),
        patch: { unitPriceMin: '', unitPriceMax: '' },
      });
    }
    if (filters.statusFilter) {
      const s = STATUS_FILTERS.find((x) => x.key === filters.statusFilter);
      arr.push({ key: 'status', label: s?.label ?? '', patch: { statusFilter: '' } });
    }
    if (filters.orientationSel) {
      const o = ORIENTATION_OPTIONS.find((x) => x.key === filters.orientationSel);
      arr.push({ key: 'orientation', label: o?.label ?? '', patch: { orientationSel: '' } });
    }
    if (filters.floorSel) {
      const f = FLOOR_LEVEL_OPTIONS.find((x) => x.key === filters.floorSel);
      arr.push({ key: 'floor', label: f?.label ?? '', patch: { floorSel: '' } });
    }
    if (filters.decorSel) {
      const d = DECORATION_OPTIONS.find((x) => x.key === filters.decorSel);
      arr.push({ key: 'decor', label: d?.label ?? '', patch: { decorSel: '' } });
    }
    if (filters.amenitySel.length) {
      arr.push({
        key: 'amenity',
        label: t('list.amenities'),
        patch: { amenitySel: [] },
      });
    }
    if (filters.schoolId) {
      arr.push({ key: 'school', label: t('list.schoolDistance'), patch: { schoolId: '' } });
    }
    if (filters.sortKey !== 'default') {
      arr.push({ key: 'sort', label: sortLabel, patch: { sortKey: 'default' } });
    }
    return arr;
  }, [
    isEmployee, filters, regionLabel, activeTypeGroup, hasPriceFilter, priceLabel,
    hasAreaFilter, BEDROOM_OPTIONS, AREA_PRESETS, STATUS_FILTERS, ORIENTATION_OPTIONS,
    FLOOR_LEVEL_OPTIONS, DECORATION_OPTIONS, sortLabel, t, biz, bizTabLabel,
  ]);

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

  const clearRecentSearches = useCallback(async () => {
    setRecentSearches([]);
    try {
      await setItem(RECENT_SEARCHES_KEY, JSON.stringify([]));
    } catch {
      /* ignore */
    }
    notify(t('search.cleared'));
  }, [t]);

  // 点击历史词：填入输入框并立即触发搜索，同时置顶该词
  const applyRecentSearch = useCallback(
    (kw: string) => {
      onFiltersChange({ keyword: kw });
      saveRecentSearch(kw);
      Keyboard.dismiss();
      closeSearchPanel();
    },
    [onFiltersChange, saveRecentSearch, closeSearchPanel],
  );

  // 提交搜索：关键词写入历史，并收起历史面板 + 键盘
  const handleSearchSubmit = useCallback(() => {
    const kw = filters.keyword.trim();
    if (kw) saveRecentSearch(kw);
    Keyboard.dismiss();
    closeSearchPanel();
  }, [filters.keyword, saveRecentSearch, closeSearchPanel]);

  // 「查看 N 套房源」：筛选本就实时生效，这里只收起下拉面板并回到列表顶部
  const handleViewResults = useCallback(() => {
    setOpenTab(null);
    Keyboard.dismiss();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // ---------- 卡片渲染 ----------
  const renderItem = useCallback(
    ({ item }: { item: Listing }) => (
      <ListingCard
        item={item}
        favorited={!!favSet[item.property_id ?? item.id]}
        favBusy={!!favPending[item.property_id ?? item.id]}
        translating={translatingId === item.id}
        showTranslate={enableTranslate && !isSameLang(translateSource(item), lang)}
        onPress={onOpenDetail}
        onToggleFav={onToggleFav}
        onTranslate={onTranslate ?? (() => {})}
        onEdit={onEditItem}
      />
    ),
    [favSet, favPending, translatingId, lang, enableTranslate, onOpenDetail, onToggleFav, onTranslate, onEditItem],
  );

  // 买房挂牌卡片（真实数据：挂牌价 / 面积 / 户型）
  const renderSaleItem = useCallback(
    ({ item }: { item: Listing }) => {
      const photo = Array.isArray(item.photos) && item.photos.length ? String(item.photos[0]) : null;
      return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => {
          if (item.id) {
            onOpenDetail(item);
          } else {
            notify(t('common.hint'), t('list.noListingDetail'));
          }
        }}
      >
        <View style={styles.thumbWrap}>
          {photo ? (
            <RemoteImage uri={photo} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="pricetag-outline" size={28} color={colors.ink3} />
            </View>
          )}
          <View style={[styles.typeBadge, { backgroundColor: colors.badge.bg }]}>
            <Text style={[styles.typeBadgeText, { color: colors.badge.fg }]}>{t('prop.status.forSale')}</Text>
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
            {(() => {
              const facts = joinFacts([
                item.bedrooms != null ? t('prop.bedroomN', { n: item.bedrooms }) : null,
                item.size_sqm != null ? formatArea(item.size_sqm, t('pub.sqm')) : null,
              ])
              return facts ? <Text style={styles.tag}>{facts}</Text> : null
            })()}
          </View>
          <View style={styles.bottomRow}>
            <Text style={styles.rent}>
              {formatRent(item.asking_price, item.currency)}
              <Text style={styles.rentUnit}>{t('list.totalPrice')}</Text>
            </Text>
            {onEditItem ? (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => onEditItem(item)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('adm.psManage')}
              >
                <Text style={styles.editText}>{t('adm.psManage')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
      );
    },
    [onOpenDetail, t, onEditItem],
  );

  // 列表卡片的外部渲染态：稳定引用 + 只在变化时换 identity
  const listExtraData = useMemo(
    () => ({ favSet, favPending, translatingId, biz }),
    [favSet, favPending, translatingId, biz],
  );

  const visibleCount = total ?? items.length;

  return (
    <View ref={rootRef} style={[styles.container, { paddingTop: topInset }]}>
      {/* 顶部头部区：浅 teal 实底 + 大标题 + 城市定位 */}
      <View style={styles.heroBand}>
        <View style={styles.heroBandRow}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {t('list.heroTitle')}
          </Text>
          <TouchableOpacity
            style={styles.heroCityChip}
            onPress={() => navigation.navigate('LocationPicker')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('home.selectCity')}
          >
            <Ionicons name="location" size={13} color={colors.primary} />
            <Text style={styles.heroCityText} numberOfLines={1}>
              {cityLabel || t('home.selectCity')}
            </Text>
            <Ionicons name="chevron-down" size={11} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      {/* 顶部找房卡：业务 Tab 嵌入卡顶 / 搜索行 / 分隔线 / 居室快选 / 查看N套 + 去地图看 */}
      <View style={styles.heroCard}>
        <View style={styles.heroBody}>
          <View style={styles.heroSearchRow}>
            <Ionicons name="search-outline" size={18} color={colors.ink3} />
            <TextInput
              ref={searchRef}
              style={styles.heroSearchInput}
              placeholder={searchPlaceholder ?? t('list.searchPlaceholder')}
              placeholderTextColor={colors.ink3}
              value={filters.keyword}
              onChangeText={(v) => onFiltersChange({ keyword: v })}
              returnKeyType="search"
              onFocus={() => setSearchFocused(true)}
              onBlur={handleSearchBlur}
              onSubmitEditing={handleSearchSubmit}
            />
            {filters.keyword ? (
              <TouchableOpacity
                onPress={() => onFiltersChange({ keyword: '' })}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear')}
              >
                <Ionicons name="close-circle" size={16} color={colors.ink3} />
              </TouchableOpacity>
            ) : null}
            {enableNearby ? (
              <>
                <View style={styles.heroSearchSplit} />
                <TouchableOpacity
                  style={styles.heroNearby}
                  onPress={onToggleNearby}
                  activeOpacity={0.8}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
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
              </>
            ) : null}
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
              const on = filters.bedFilter === b.key;
              return (
                <TouchableOpacity
                  key={b.key || 'any'}
                  style={styles.heroBedItem}
                  onPress={() => onFiltersChange({ bedFilter: b.key })}
                  activeOpacity={0.8}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={b.label}
                >
                  {on ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : (
                    <View style={styles.heroBedCircle} />
                  )}
                  <Text style={[styles.heroBedText, on && styles.heroBedTextActive]}>{b.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.heroPrimary}
              onPress={handleViewResults}
              activeOpacity={0.9}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={styles.heroPrimaryText}>{t('list.viewCount', { n: visibleCount })}</Text>
              )}
            </TouchableOpacity>
            {showMapButton ? (
              <TouchableOpacity style={styles.heroMapBtn} onPress={onOpenMap} activeOpacity={0.9}>
                <Ionicons name="location" size={16} color={colors.primary} />
                <Text style={styles.heroMapText}>{t('list.goMap')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
      {/* 链家式单行筛选栏（点击后从顶部下拉面板）—— C 端买卖挂牌不适用租赁筛选维度；
          销售端三条业务线都要能筛（售侧是总价/房龄等另一套面板） */}
      {(isEmployee || !isSaleBiz) && (
        <View style={styles.filterZone} ref={anchorRef} onLayout={measureAnchor}>
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
                onPress={() => toggleTab(tb.key as Exclude<OpenTab, null>)}
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
                  {/* 贝壳式三栏面板：① 类目栏 ② 线路列表 ③ 城区/站点 */}
                  <View style={styles.keSheet}>
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
                      <ScrollView style={styles.keCol3} showsVerticalScrollIndicator={false}>
                        <Text style={styles.keSection}>
                          {t('list.districtSuffix', { city: cityLabel })}
                        </Text>
                        <TouchableOpacity
                          style={styles.keOption}
                          onPress={() => applyDistrict(null)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.keOptionMain}>
                            <Text
                              style={[styles.keOptionText, filters.districtSel === null && styles.keOptionTextActive]}
                            >
                              {t('common.any')}
                            </Text>
                          </View>
                          <View style={[styles.keRadio, filters.districtSel === null && styles.keRadioOn]}>
                            {filters.districtSel === null && <View style={styles.keRadioDot} />}
                          </View>
                        </TouchableOpacity>
                        {districts.map((d) => (
                          <TouchableOpacity
                            key={d.key}
                            style={styles.keOption}
                            onPress={() => applyDistrict(d.key)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.keOptionMain}>
                              <Text
                                style={[styles.keOptionText, filters.districtSel === d.key && styles.keOptionTextActive]}
                              >
                                {d.label}
                              </Text>
                            </View>
                            <View style={[styles.keRadio, filters.districtSel === d.key && styles.keRadioOn]}>
                              {filters.districtSel === d.key && <View style={styles.keRadioDot} />}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : (
                      <>
                        <ScrollView
                          style={[styles.keCol2, { flexGrow: 0, flexShrink: 0 }]}
                          showsVerticalScrollIndicator={false}
                        >
                          <TouchableOpacity style={styles.keRow} onPress={clearMetroDraft} activeOpacity={0.7}>
                            <Text style={[styles.keRowText, !metroDraft.length && styles.keRowTextActive]}>
                              {t('common.any')}
                            </Text>
                          </TouchableOpacity>
                          {metroLines.map((l) => (
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
                                {metroLineDisplayName(l.key, l.name, lang)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <ScrollView style={styles.keCol3} showsVerticalScrollIndicator={false}>
                          <Text style={styles.keSection}>
                            {activeLine ? metroLineFullName(activeLine, lang) : ''}
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
                                <Text
                                  style={[styles.keOptionText, metroDraft.includes(s.name) && styles.keOptionTextActive]}
                                >
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
                    <TouchableOpacity
                      style={styles.resetBtn}
                      onPress={() => resetCurrent('region')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.resetText}>{t('pub.reset')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmBtn}
                      onPress={() => confirmCurrent('region')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.confirmText}>{t('common.confirm')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {openTab === 'type' && (
                <>
                  {isEmployee && (
                    <>
                      <Text style={styles.dropGroupTitle}>{t('pub.bizLine')}</Text>
                      <View style={styles.filterGroup}>
                        {[{ key: 'all' as BizKey, label: t('pub.bizAll') }, ...BIZ_TABS].map((b) => (
                          <TouchableOpacity
                            key={b.key}
                            style={[styles.filterChip, biz === b.key && styles.filterChipActive]}
                            onPress={() => onBizChange(b.key)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.filterText, biz === b.key && styles.filterTextActive]}>
                              {b.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                  <Text style={styles.dropGroupTitle}>{t('pub.propertyTypeGroup')}</Text>
                  <View style={styles.filterGroup}>
                    {TYPE_CLASS_GROUPS.map((g) => {
                      const on = g.key
                        ? !!activeTypeGroup && activeTypeGroup.key === g.key
                        : !filters.filterTypes.length;
                      return (
                        <TouchableOpacity
                          key={g.key || 'type-any'}
                          style={[styles.filterChip, on && styles.filterChipActive]}
                          onPress={() => onFiltersChange({ filterTypes: [...g.types] })}
                        >
                          <Text style={[styles.filterText, on && styles.filterTextActive]}>
                            {t(g.labelKey)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.panelActions}>
                    <TouchableOpacity
                      style={styles.resetBtn}
                      onPress={() => resetCurrent('type')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.resetText}>{t('pub.reset')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmBtn}
                      onPress={() => confirmCurrent('type')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.confirmText}>{t('common.confirm')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {openTab === 'price' && (
                <>
                  <Text style={styles.dropGroupTitle}>{t('list.quickSelect')}</Text>
                  <View style={styles.filterGroup}>
                    {(isSaleBiz ? SALE_PRICE_RANGES : PRICE_RANGES).map((r) => (
                      <TouchableOpacity
                        key={r.key}
                        style={[styles.filterChip, filters.priceRange === r.key && styles.filterChipActive]}
                        onPress={() => {
                          if (r.key) onFiltersChange({ priceRange: r.key, customMin: '', customMax: '' });
                          else onFiltersChange({ priceRange: r.key });
                        }}
                      >
                        <Text
                          style={[styles.filterText, filters.priceRange === r.key && styles.filterTextActive]}
                        >
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dropGroupTitle}>{t('list.customPrice')}</Text>
                  <View style={styles.priceCustomRow}>
                    <View style={styles.priceCustomInput}>
                      <Text style={styles.priceCustomPrefix}>{currencySymbol(currency)}</Text>
                      <TextInput
                        style={styles.priceCustomField}
                        value={filters.customMin}
                        onChangeText={(v) =>
                          onFiltersChange({
                            customMin: v.replace(/[^\d]/g, ''),
                            ...(v ? { priceRange: '' } : {}),
                          })
                        }
                        placeholder={t('list.minPrice')}
                        placeholderTextColor={colors.ink3}
                        keyboardType="number-pad"
                      />
                      {!isSaleBiz ? (
                        <Text style={styles.priceCustomUnit}>{t('prop.tenThousandPerMonth')}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.priceCustomDivider}>{t('list.to')}</Text>
                    <View style={styles.priceCustomInput}>
                      <Text style={styles.priceCustomPrefix}>{currencySymbol(currency)}</Text>
                      <TextInput
                        style={styles.priceCustomField}
                        value={filters.customMax}
                        onChangeText={(v) =>
                          onFiltersChange({
                            customMax: v.replace(/[^\d]/g, ''),
                            ...(v ? { priceRange: '' } : {}),
                          })
                        }
                        placeholder={t('list.maxPrice')}
                        placeholderTextColor={colors.ink3}
                        keyboardType="number-pad"
                      />
                      {!isSaleBiz ? (
                        <Text style={styles.priceCustomUnit}>{t('prop.tenThousandPerMonth')}</Text>
                      ) : null}
                    </View>
                  </View>
                  {customPriceInvalid ? (
                    <Text style={styles.priceInvalidHint}>{t('list.priceRangeInvalid')}</Text>
                  ) : null}
                  {/* 二手房单价：总价/面积，和总价区间可组合 */}
                  {isEmployee && biz === 'resale' ? (
                    <>
                      <Text style={styles.dropGroupTitle}>{t('pub.unitPrice')}</Text>
                      <View style={styles.priceCustomRow}>
                        <View style={styles.priceCustomInput}>
                          <TextInput
                            style={styles.priceCustomField}
                            value={filters.unitPriceMin}
                            onChangeText={(v) =>
                              onFiltersChange({ unitPriceMin: v.replace(/[^\d]/g, '') })
                            }
                            placeholder={t('list.minPrice')}
                            placeholderTextColor={colors.ink3}
                            keyboardType="number-pad"
                          />
                          <Text style={styles.priceCustomUnit}>/㎡</Text>
                        </View>
                        <Text style={styles.priceCustomDivider}>{t('list.to')}</Text>
                        <View style={styles.priceCustomInput}>
                          <TextInput
                            style={styles.priceCustomField}
                            value={filters.unitPriceMax}
                            onChangeText={(v) =>
                              onFiltersChange({ unitPriceMax: v.replace(/[^\d]/g, '') })
                            }
                            placeholder={t('list.maxPrice')}
                            placeholderTextColor={colors.ink3}
                            keyboardType="number-pad"
                          />
                          <Text style={styles.priceCustomUnit}>/㎡</Text>
                        </View>
                      </View>
                    </>
                  ) : null}
                  <View style={styles.panelActions}>
                    <TouchableOpacity
                      style={styles.resetBtn}
                      onPress={() => resetCurrent('price')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.resetText}>{t('pub.reset')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.confirmBtn, customPriceInvalid && styles.confirmBtnDisabled]}
                      onPress={() => confirmCurrent('price')}
                      activeOpacity={0.7}
                      disabled={customPriceInvalid}
                    >
                      <Text style={styles.confirmText}>{t('common.confirm')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {openTab === 'more' && (
                <>
                  <ScrollView style={styles.dropBodyTall}>
                    <Text style={styles.dropGroupTitle}>{t('list.layout')}</Text>
                    <View style={styles.filterGroup}>
                      {BEDROOM_OPTIONS.map((b) => (
                        <TouchableOpacity
                          key={b.key}
                          style={[styles.filterChip, filters.bedFilter === b.key && styles.filterChipActive]}
                          onPress={() => onFiltersChange({ bedFilter: b.key })}
                        >
                          <Text
                            style={[styles.filterText, filters.bedFilter === b.key && styles.filterTextActive]}
                          >
                            {b.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {/* 业务层：随当前业务线切换，只显示该业务真实可筛的维度 */}
                    {isEmployee && biz === 'rent' ? (
                      <>
                        <Text style={styles.dropGroupTitle}>{t('prop.fieldDepositMonths')}</Text>
                        <View style={styles.filterGroup}>
                          {[
                            { key: '', label: t('common.any') },
                            { key: '1', label: '1' },
                            { key: '2', label: '2' },
                            { key: '3', label: '3+' },
                          ].map((d) => (
                            <TouchableOpacity
                              key={d.key || 'deposit-any'}
                              style={[styles.filterChip, filters.depositMonths === d.key && styles.filterChipActive]}
                              onPress={() => onFiltersChange({ depositMonths: d.key })}
                            >
                              <Text
                                style={[styles.filterText, filters.depositMonths === d.key && styles.filterTextActive]}
                              >
                                {d.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Text style={styles.dropGroupTitle}>{t('listing.fAvailableFrom')}</Text>
                        <View style={styles.filterGroup}>
                          {[
                            { key: '', label: t('common.any') },
                            { key: '1', label: t('prop.monthsN', { n: 1 }) },
                            { key: '3', label: t('prop.monthsN', { n: 3 }) },
                          ].map((d) => (
                            <TouchableOpacity
                              key={d.key || 'available-any'}
                              style={[styles.filterChip, filters.availableWithin === d.key && styles.filterChipActive]}
                              onPress={() => onFiltersChange({ availableWithin: d.key })}
                            >
                              <Text
                                style={[styles.filterText, filters.availableWithin === d.key && styles.filterTextActive]}
                              >
                                {d.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : null}
                    {isEmployee && biz === 'resale' ? (
                      <>
                        <Text style={styles.dropGroupTitle}>{t('pub.completionYear')}</Text>
                        <View style={styles.filterGroup}>
                          {[
                            { key: '', label: t('common.any') },
                            { key: '5', label: `≥ ${NOW_YEAR - 5}` },
                            { key: '10', label: `≥ ${NOW_YEAR - 10}` },
                            { key: '20', label: `≥ ${NOW_YEAR - 20}` },
                          ].map((d) => (
                            <TouchableOpacity
                              key={d.key || 'age-any'}
                              style={[
                                styles.filterChip,
                                (d.key ? filters.completionYearMin === String(NOW_YEAR - Number(d.key)) : !filters.completionYearMin) &&
                                  styles.filterChipActive,
                              ]}
                              onPress={() =>
                                onFiltersChange({
                                  completionYearMin: d.key ? String(NOW_YEAR - Number(d.key)) : '',
                                  completionYearMax: '',
                                })
                              }
                            >
                              <Text
                                style={[
                                  styles.filterText,
                                  (d.key ? filters.completionYearMin === String(NOW_YEAR - Number(d.key)) : !filters.completionYearMin) &&
                                    styles.filterTextActive,
                                ]}
                              >
                                {d.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : null}
                    {isEmployee && biz === 'new' ? (
                      <>
                        <Text style={styles.dropGroupTitle}>{t('pub.completionYear')}</Text>
                        <View style={styles.filterGroup}>
                          {[
                            { key: '', label: t('common.any') },
                            { key: '1', label: `≤ ${NOW_YEAR + 1}` },
                            { key: '2', label: `≤ ${NOW_YEAR + 2}` },
                            { key: '3', label: `≤ ${NOW_YEAR + 3}` },
                          ].map((d) => (
                            <TouchableOpacity
                              key={d.key || 'handover-any'}
                              style={[
                                styles.filterChip,
                                (d.key ? filters.completionYearMax === String(NOW_YEAR + Number(d.key)) : !filters.completionYearMax) &&
                                  styles.filterChipActive,
                              ]}
                              onPress={() =>
                                onFiltersChange({
                                  completionYearMax: d.key ? String(NOW_YEAR + Number(d.key)) : '',
                                  completionYearMin: '',
                                })
                              }
                            >
                              <Text
                                style={[
                                  styles.filterText,
                                  (d.key ? filters.completionYearMax === String(NOW_YEAR + Number(d.key)) : !filters.completionYearMax) &&
                                    styles.filterTextActive,
                                ]}
                              >
                                {d.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : null}
                    <Text style={styles.dropGroupTitle}>{t('list.schoolDistance')}</Text>
                    <View style={styles.filterGroup}>
                      {SCHOOL_RADIUS_OPTIONS.map((km) => (
                        <TouchableOpacity
                          key={km}
                          style={[styles.filterChip, filters.schoolKm === km && styles.filterChipActive]}
                          onPress={() => onFiltersChange({ schoolKm: km })}
                        >
                          <Text style={[styles.filterText, filters.schoolKm === km && styles.filterTextActive]}>
                            {km}km
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={styles.dropSearch}
                      value={filters.schoolKw}
                      onChangeText={(v) => onFiltersChange({ schoolKw: v })}
                      placeholder={t('prop.searchSchool')}
                      placeholderTextColor={colors.ink3}
                      returnKeyType="search"
                    />
                    <View style={styles.filterGroup}>
                      <TouchableOpacity
                        style={[styles.filterChip, !filters.schoolId && styles.filterChipActive]}
                        onPress={() => onFiltersChange({ schoolId: '' })}
                      >
                        <Text style={[styles.filterText, !filters.schoolId && styles.filterTextActive]}>
                          {t('common.any')}
                        </Text>
                      </TouchableOpacity>
                      {filteredSchools.map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.filterChip, filters.schoolId === s.id && styles.filterChipActive]}
                          onPress={() => onFiltersChange({ schoolId: s.id })}
                        >
                          <Text
                            style={[styles.filterText, filters.schoolId === s.id && styles.filterTextActive]}
                          >
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {schoolsLoaded && !filteredSchools.length && (
                      <Text style={styles.dropEmpty}>{t('list.noSchoolMatch')}</Text>
                    )}
                    {/* 员工端类型已独立为顶部「类型」Tab，不在「更多」里重复出现 */}
                    {!isEmployee ? (
                      <>
                        <Text style={styles.dropGroupTitle}>{t('prop.type')}</Text>
                        <View style={styles.filterGroup}>
                          {PROPERTY_TYPE_FILTERS.map((f) => (
                            <TouchableOpacity
                              key={f.key || 'all'}
                              style={[
                                styles.filterChip,
                                (f.key ? filters.filterTypes.includes(f.key) : !filters.filterTypes.length) &&
                                  styles.filterChipActive,
                              ]}
                              onPress={() => onFiltersChange({ filterTypes: f.key ? [f.key] : [] })}
                            >
                              <Text
                                style={[
                                  styles.filterText,
                                  (f.key ? filters.filterTypes.includes(f.key) : !filters.filterTypes.length) &&
                                    styles.filterTextActive,
                                ]}
                              >
                                {f.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : null}
                    <Text style={styles.dropGroupTitle}>{t('prop.orientation')}</Text>
                    <View style={styles.filterGroup}>
                      {ORIENTATION_OPTIONS.map((o) => (
                        <TouchableOpacity
                          key={o.key || 'all'}
                          style={[styles.filterChip, filters.orientationSel === o.key && styles.filterChipActive]}
                          onPress={() => onFiltersChange({ orientationSel: o.key })}
                        >
                          <Text
                            style={[styles.filterText, filters.orientationSel === o.key && styles.filterTextActive]}
                          >
                            {o.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.dropGroupTitle}>{t('list.floor')}</Text>
                    <View style={styles.filterGroup}>
                      {FLOOR_LEVEL_OPTIONS.map((fl) => (
                        <TouchableOpacity
                          key={fl.key || 'all'}
                          style={[styles.filterChip, filters.floorSel === fl.key && styles.filterChipActive]}
                          onPress={() => onFiltersChange({ floorSel: fl.key })}
                        >
                          <Text style={[styles.filterText, filters.floorSel === fl.key && styles.filterTextActive]}>
                            {fl.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.dropGroupTitle}>{t('pub.filterArea')}</Text>
                    <View style={styles.filterGroup}>
                      {AREA_PRESETS.map((a) => (
                        <TouchableOpacity
                          key={a.key || 'all'}
                          style={[styles.filterChip, filters.areaRange === a.key && styles.filterChipActive]}
                          onPress={() => {
                            if (a.key)
                              onFiltersChange({
                                areaRange: a.key,
                                areaCustomMin: '',
                                areaCustomMax: '',
                              });
                            else onFiltersChange({ areaRange: a.key });
                          }}
                        >
                          <Text
                            style={[styles.filterText, filters.areaRange === a.key && styles.filterTextActive]}
                          >
                            {a.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.priceCustomRow}>
                      <View style={styles.priceCustomInput}>
                        <TextInput
                          style={styles.priceCustomField}
                          value={filters.areaCustomMin}
                          onChangeText={(v) =>
                            onFiltersChange({
                              areaCustomMin: v.replace(/[^\d]/g, ''),
                              ...(v ? { areaRange: '' } : {}),
                            })
                          }
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
                          value={filters.areaCustomMax}
                          onChangeText={(v) =>
                            onFiltersChange({
                              areaCustomMax: v.replace(/[^\d]/g, ''),
                              ...(v ? { areaRange: '' } : {}),
                            })
                          }
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
                          style={[styles.filterChip, filters.decorSel === d.key && styles.filterChipActive]}
                          onPress={() => onFiltersChange({ decorSel: d.key })}
                        >
                          <Text style={[styles.filterText, filters.decorSel === d.key && styles.filterTextActive]}>
                            {d.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.dropGroupTitle}>{t('list.amenities')}</Text>
                    <View style={styles.filterGroup}>
                      {AMENITY_OPTIONS.map((a) => {
                        const on = filters.amenitySel.includes(a.key);
                        return (
                          <TouchableOpacity
                            key={a.key}
                            style={[styles.filterChip, on && styles.filterChipActive]}
                            onPress={() =>
                              onFiltersChange({
                                amenitySel: on
                                  ? filters.amenitySel.filter((k) => k !== a.key)
                                  : [...filters.amenitySel, a.key],
                              })
                            }
                          >
                            <Text style={[styles.filterText, on && styles.filterTextActive]}>{a.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {/* 房源状态（在租/空置/维修）是租赁运营口径，买卖业务不展示，避免假筛选 */}
                    {!isSaleBiz ? (
                      <>
                        <Text style={styles.dropGroupTitle}>{t('list.propertyStatus')}</Text>
                        <View style={styles.filterGroup}>
                          {STATUS_FILTERS.map((s) => (
                            <TouchableOpacity
                              key={s.key || 'all'}
                              style={[styles.filterChip, filters.statusFilter === s.key && styles.filterChipActive]}
                              onPress={() => onFiltersChange({ statusFilter: s.key })}
                            >
                              <Text
                                style={[styles.filterText, filters.statusFilter === s.key && styles.filterTextActive]}
                              >
                                {s.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : null}
                  </ScrollView>
                  <View style={styles.panelActions}>
                    <TouchableOpacity
                      style={styles.resetBtn}
                      onPress={() => resetCurrent('more')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.resetText}>{t('pub.reset')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmBtn}
                      onPress={() => confirmCurrent('more')}
                      activeOpacity={0.7}
                    >
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
                      style={[styles.dropSortItem, filters.sortKey === so.key && styles.dropSortItemActive]}
                      onPress={() => {
                        onFiltersChange({ sortKey: so.key });
                        setOpenTab(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.dropSortText, filters.sortKey === so.key && styles.dropSortTextActive]}
                      >
                        {so.label}
                      </Text>
                      {filters.sortKey === so.key && (
                        <Ionicons name="checkmark" size={16} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}
      {/* 当前生效条件回显：单条可清除 + 一键重置（销售端） */}
      {isEmployee && activeChips.length > 0 && (
        <View style={styles.chipsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
          >
            {activeChips.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={styles.activeChip}
                onPress={() => (c.key === 'biz' ? onBizChange('all') : onFiltersChange(c.patch))}
                activeOpacity={0.7}
              >
                <Text style={styles.activeChipText} numberOfLines={1}>
                  {c.label}
                </Text>
                <Ionicons name="close" size={13} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.chipsReset}
            onPress={() => {
              onFiltersChange(clearAllPatch);
              onBizChange('all');
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.chipsResetText}>{t('pub.reset')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* 列表：整租=真实租赁房源 / 买卖=真实在售挂牌。
          首屏加载只替换列表区——页头、搜索卡与筛选栏保持可见，避免整页跳动 */}
      {loading && (items as any[]).length === 0 ? (
        <LoadingState label={t('list.loadingListings')} />
      ) : (
      <FlatList
        ref={listRef}
        data={items as any[]}
        keyExtractor={(item) => item.id}
        renderItem={(isSaleBiz ? renderSaleItem : renderItem) as any}
        contentContainerStyle={[styles.list, respContainer]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        /* 长列表性能：控制首屏/批次渲染数量与视窗外回收 */
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        /* 收藏/翻译态属于 data 之外的父级状态：memo 化保证只在状态变化时才触发行重渲染 */
        extraData={listExtraData}
        ListHeaderComponent={
          error && (items as any[]).length > 0 ? (
            <View
              style={{
                marginBottom: 8,
                padding: 10,
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.alpha(colors.errorRgb, 0.08),
              }}
            >
              <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>{t('loadFailed')}</Text>
              <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
                <Text style={{ fontSize: 12, color: colors.primary }}>{t('retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              style={styles.loadMore}
              activeOpacity={0.8}
              onPress={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>{t('list.loadMoreListings')}</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          emptyLoading ? (
            <LoadingState label={t('list.loadingSale')} />
          ) : (
            <View style={styles.emptyBox}>
              {error ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title={t('loadFailed')}
                  sub={t('loadFailedSub')}
                  actionLabel={t('retry')}
                  onAction={onRetry}
                />
              ) : activeChips.some((c) => c.key !== 'sort') ? (
                <EmptyState
                  icon="funnel-outline"
                  title={t('prop.emptyFiltered')}
                  sub={t('prop.emptyFilteredSub')}
                  actionLabel={t('pub.reset')}
                  onAction={() => onFiltersChange(clearAllPatch)}
                />
              ) : (
                <EmptyState
                  icon="home-outline"
                  title={t('empty.listings')}
                  sub={isSaleBiz ? t('list.emptySale') : t('empty.listingsSub')}
                />
              )}
            </View>
          )
        }
      />
      )}
      {/* 面板展开时点击面板外的列表区即收起：与分类页筛选面板行为一致 */}
      {openTab !== null ? (
        <PanelBackdrop top={backdropTop} onClose={() => setOpenTab(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  // 城市文案最长可能是泰语，限宽 + 单行省略，避免把左侧标题挤到换行
  heroCityText: { fontSize: colors.fontSize.sm, fontWeight: '600', color: colors.primary, maxWidth: 120 },
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
    minHeight: colors.touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: colors.radius.md,
  },
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
  heroSearchInput: {
    flex: 1,
    minHeight: colors.touch.min,
    paddingVertical: 6,
    fontSize: colors.fontSize.base,
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
  heroPrimaryText: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.primaryForeground },
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
  // 最近搜索：标题行 + 横向换行 chips
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
    minHeight: colors.touch.min,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentChipText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
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
    fontSize: colors.fontSize.sm,
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
  filterTabBadgeText: { color: colors.onDark, fontSize: colors.fontSize.xs, fontWeight: '600', lineHeight: colors.lineHeight.tight},
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
  dropEmpty: { fontSize: colors.fontSize.sm, color: colors.ink3, paddingVertical: 12 },
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
  priceCustomPrefix: { fontSize: colors.fontSize.sm, color: colors.ink2, marginRight: 4 },
  priceCustomField: { flex: 1, fontSize: 14, color: colors.text, padding: 4 },
  priceCustomUnit: { fontSize: 12, color: colors.ink2 },
  priceCustomDivider: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  priceInvalidHint: { fontSize: 12, color: colors.error, marginBottom: 8 },
  panelActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  resetBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
  },
  resetText: { fontSize: colors.fontSize.base, color: colors.ink, fontWeight: '500' },
  confirmBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: colors.radius.sm,
    backgroundColor: colors.primary,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmText: { fontSize: colors.fontSize.base, color: colors.primaryForeground, fontWeight: '600' },
  // ---------- 贝壳式三栏筛选面板 ----------
  keSheet: {
    flexDirection: 'row',
    height: 400,
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
  // 筛选项：方块样式
  filterChip: {
    // 44pt 是移动端触控下限（FE-05 / UI-07），圆角统一走设计令牌
    minHeight: 44,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  filterText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
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
  typeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.badge.bg,
    borderWidth: 1,
    borderColor: colors.badge.border,
  },
  typeBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
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
  title: { fontSize: colors.fontSize.base, color: colors.text, fontWeight: '600' },
  address: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 5 },
  tag: {
    fontSize: colors.fontSize.xs,
    color: colors.ink3,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
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
  translateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: colors.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  translateText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  // 员工端卡片「管理/编辑」入口（与上架入口同源的小胶囊）
  editBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
  },
  editText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  // 生效条件回显条（横向滚动 + 右侧一键重置）
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  chipsContent: { gap: 6, paddingRight: 4 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
  },
  activeChipText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  chipsReset: { paddingHorizontal: 6, paddingVertical: 5 },
  chipsResetText: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingTop: 48 },
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
