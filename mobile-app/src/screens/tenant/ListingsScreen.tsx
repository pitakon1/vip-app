/**
 * 租客找工作台（链家风格）
 * 顶部搜索 + 筛选条 + 房源卡片列表（图片 / 标题 / 租金 / 户型面积）
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import { propertiesApi, translateApi, favoritesApi, saleListingApi } from '@/services/api';
import { fmtMoney as formatRent } from '@/utils/format';
import { notify, notifyError } from '@/utils/feedback';
import EmptyState from '@/components/EmptyState';
import { useI18n } from '@/i18n';
import { AREA_GROUPS } from '@/data/locationArea';
import { METRO_LINES } from '@/data/locationMetro';

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

const FILTERS = [
  { key: '', label: '全部' },
  { key: 'apartment', label: '公寓' },
  { key: 'villa', label: '别墅' },
  { key: 'condo', label: '公寓' },
  { key: 'office', label: '写字楼' },
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

// 户型筛选
const BEDROOM_OPTIONS = [
  { key: '', label: '不限' },
  { key: '1', label: '1室' },
  { key: '2', label: '2室' },
  { key: '3', label: '3室+' },
];

// 状态筛选（贝壳式，与 Web / 小程序一致）
const STATUS_FILTERS = [
  { key: '', label: '不限' },
  { key: 'vacant', label: '空置' },
  { key: 'rented', label: '已出租' },
  { key: 'reserved', label: '已预订' },
  { key: 'maintenance', label: '维护中' },
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

export default function ListingsScreen() {
  const { t } = useI18n();
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
  const [areaRange, setAreaRange] = useState(''); // 面积预设 key
  const [areaCustomMin, setAreaCustomMin] = useState(''); // 自定义最低面积（㎡）
  const [areaCustomMax, setAreaCustomMax] = useState(''); // 自定义最高面积（㎡）
  const [sortKey, setSortKey] = useState('default');
  type OpenTab = null | 'region' | 'price' | 'layout' | 'area' | 'more' | 'sort';
  const [openTab, setOpenTab] = useState<OpenTab>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  // 业务归属 Tab（整租 / 合租 / 买房）
  const [biz, setBiz] = useState<BizKey>('rent');
  const [saleListings, setSaleListings] = useState<SaleListing[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleLoaded, setSaleLoaded] = useState(false);
  // 按区域/按地铁（对齐贝壳「区域 | 地铁」双Tab）
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area');
  const [districtSel, setDistrictSel] = useState<string | null>(null); // 已选城区 key
  const [metroSel, setMetroSel] = useState<string[]>([]);              // 已选站点 name（已确认）
  const [metroDraft, setMetroDraft] = useState<string[]>([]);          // 站点多选草稿（确定后提交）
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // 支持金刚区分类直达：路由参数 filter 预设房源类型
  const [filter, setFilter] = useState(route.params?.filter || '');
  // 收藏集合：propertyId -> 是否已收藏
  const [favSet, setFavSet] = useState<Record<string, boolean>>({});
  const [favLoading, setFavLoading] = useState<Record<string, boolean>>({});

  const loadListings = useCallback(
    async (geo?: Record<string, string | undefined>) => {
      try {
        const params: any = { page: 1, page_size: 50 };
        if (geo) {
          Object.entries(geo).forEach(([k, v]) => {
            if (v) params[k] = v;
          });
        }
        const res = await propertiesApi.list(params);
        const data = res.data;
        const items = Array.isArray(data)
          ? data
          : (data as any)?.items ?? (data as any)?.data ?? [];
        setListings(items as Listing[]);
        setLoadError(false);
      } catch (err: any) {
        setLoadError(true);
        // web 下 Alert.alert 是空实现，这里统一走 web 安全反馈（失败可见 + 可重试）
        notifyError('加载失败', err, () => {
          setLoading(true);
          loadListings();
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  // 买房 Tab：懒加载真实在售挂牌（GET /sale-listings）
  const loadSaleListings = useCallback(async () => {
    setSaleLoading(true);
    try {
      const res = await saleListingApi.list({ page: 1, page_size: 50 });
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      setSaleListings(items as SaleListing[]);
    } catch {
      setSaleListings([]);
    } finally {
      setSaleLoading(false);
      setSaleLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (biz === 'sale' && !saleLoaded) loadSaleListings();
  }, [biz, saleLoaded, loadSaleListings]);

  // 批量拉取当前列表的收藏状态
  useEffect(() => {
    if (!listings.length) return;
    const ids = listings.map((l) => l.id);
    Promise.all(
      ids.map((id) =>
        favoritesApi
          .status(id)
          .then((r: any) => ({ id, ok: !!r?.data?.favorited }))
          .catch(() => ({ id, ok: false })),
      ),
    ).then((results) => {
      const map: Record<string, boolean> = {};
      results.forEach((r) => {
        map[r.id] = r.ok;
      });
      setFavSet(map);
    });
  }, [listings]);

  // 收藏 / 取消收藏
  const handleToggleFav = async (item: Listing) => {
    const current = !!favSet[item.id];
    setFavLoading((s) => ({ ...s, [item.id]: true }));
    try {
      if (current) {
        await favoritesApi.remove(item.id);
        setFavSet((s) => ({ ...s, [item.id]: false }));
      } else {
        await favoritesApi.toggle(item.id);
        setFavSet((s) => ({ ...s, [item.id]: true }));
      }
    } catch {
      notify('操作失败', '请稍后重试');
    } finally {
      setFavLoading((s) => ({ ...s, [item.id]: false }));
    }
  };

  // 金刚区分类直达：路由参数变化时同步筛选
  useEffect(() => {
    if (route.params?.filter !== undefined) {
      setFilter(route.params.filter);
    }
  }, [route.params?.filter]);

  // ---------- 按区域 / 按地铁（对齐贝壳「区域 | 地铁」） ----------
  const allDistricts = AREA_GROUPS.flatMap((g) => g.children);
  const activeLine = useMemo(
    () => METRO_LINES.find((l) => l.key === metroLine),
    [metroLine],
  );
  // 已选区域/地铁的关键词，用于匹配房源地址/标题
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

  const regionLabel = useMemo(() => {
    if (districtSel) {
      const node = allDistricts.find((d) => d.key === districtSel);
      return node ? node.label : '区域';
    }
    if (metroSel.length) {
      const first = metroSel[0];
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first;
    }
    return '区域';
  }, [districtSel, metroSel]);

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
  const areaLabel = areaRange
    ? AREA_PRESETS.find((a) => a.key === areaRange)?.label ?? '面积'
    : areaCustomMin || areaCustomMax
    ? '自定义'
    : '面积';
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label ?? '排序';
  const moreBadge = statusFilter ? 1 : 0;

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
    } else if (key === 'area') {
      setAreaRange('');
      setAreaCustomMin('');
      setAreaCustomMax('');
    } else if (key === 'more') {
      setStatusFilter('');
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
    { key: 'price', label: hasPriceFilter ? priceLabel : '价格', active: hasPriceFilter, badge: 0 },
    { key: 'layout', label: bedFilter ? bedLabel : '户型', active: !!bedFilter, badge: 0 },
    { key: 'area', label: areaLabel, active: hasAreaFilter, badge: 0 },
    { key: 'more', label: '更多', active: moreBadge > 0, badge: moreBadge },
    { key: 'sort', label: sortKey !== 'default' ? sortLabel : '排序', active: sortKey !== 'default', badge: 0 },
  ] as { key: OpenTab; label: string; active: boolean; badge: number }[];

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (biz === 'sale') {
      loadSaleListings().finally(() => setRefreshing(false));
    } else {
      loadListings();
    }
  }, [loadListings, biz, loadSaleListings]);

  const handleTranslate = async (item: Listing) => {
    const source = item.description || item.address || '';
    if (!source) {
      Alert.alert('提示', '该房源暂无描述文本');
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
  };

  const filtered = listings.filter((it) => {
    if (filter && it.property_type !== filter) return false;
    if (statusFilter && it.status !== statusFilter) return false;
    // 户型（3室+ 覆盖 >=3）
    if (bedFilter) {
      const beds = Number(it.bedrooms ?? 0);
      if (bedFilter === '3') {
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
    return true;
  });

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

  const renderItem = ({ item }: { item: Listing }) => {
    const photo = Array.isArray(item.photos) && item.photos.length ? item.photos[0] : null;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PropertyDetail', { id: item.id })}
      >
        <View style={styles.thumbWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="home-outline" size={28} color={colors.ink3} />
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: statusColors(item.status) }]}>
            <Text style={styles.statusText}>{statusLabels[item.status ?? 'vacant'] ?? '—'}</Text>
          </View>
          <TouchableOpacity
            style={styles.favBtn}
            onPress={() => handleToggleFav(item)}
            disabled={favLoading[item.id]}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={favSet[item.id] ? '取消收藏' : '收藏房源'}
            accessibilityState={{ disabled: !!favLoading[item.id] }}
          >
            <Ionicons
              name={favSet[item.id] ? 'heart' : 'heart-outline'}
              size={18}
              color={favSet[item.id] ? colors.error : colors.primaryForeground}
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
            <TouchableOpacity
              style={styles.translateBtn}
              onPress={() => handleTranslate(item)}
              disabled={translatingId === item.id}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Google 翻译"
              accessibilityState={{ disabled: translatingId === item.id }}
            >
              <Text style={styles.translateText}>
                {translatingId === item.id ? '翻译中...' : 'Google 翻译'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // 买房挂牌卡片（真实数据：挂牌价 / 面积 / 户型）
  const renderSaleItem = ({ item }: { item: SaleListing }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => {
        if (item.property_id) {
          navigation.navigate('PropertyDetail', { id: item.property_id });
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
      {/* 类型筛选条（金刚区直达） —— 买卖挂牌不适用租赁筛选维度 */}
      {biz !== 'sale' && (
        <>
      <View style={styles.filterBar}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* 贝壳式 Tab 筛选栏（点击后从顶部下拉面板，非底部弹层） */}
      <View style={styles.filterZone}>
        <View style={styles.filterTabsRow}>
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
        </View>

        {openTab !== null && (
          <View style={styles.dropPanel}>
            {openTab === 'region' && (
              <>
                <View style={styles.locTabs}>
                  {(['area', 'metro'] as const).map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      style={[styles.locTab, locTab === tab && styles.locTabActive]}
                      onPress={() => setLocTab(tab)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.locTabText, locTab === tab && styles.locTabTextActive]}>
                        {tab === 'area' ? '区域' : '地铁'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {locTab === 'area' ? (
                  <ScrollView style={styles.dropBody} nestedScrollEnabled>
                    {AREA_GROUPS.map((g) => (
                      <View key={g.cityKey} style={styles.locGroup}>
                        <Text style={styles.dropGroupTitle}>{g.country} · {g.cityLabel}</Text>
                        <View style={styles.filterGroup}>
                          <TouchableOpacity
                            style={[styles.filterChip, districtSel === null && styles.filterChipActive]}
                            onPress={() => applyDistrict(null)}
                          >
                            <Text style={[styles.filterText, districtSel === null && styles.filterTextActive]}>不限</Text>
                          </TouchableOpacity>
                          {g.children.map((d) => (
                            <TouchableOpacity
                              key={d.key}
                              style={[styles.filterChip, districtSel === d.key && styles.filterChipActive]}
                              onPress={() => applyDistrict(d.key)}
                            >
                              <Text style={[styles.filterText, districtSel === d.key && styles.filterTextActive]}>{d.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.locMetro}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locLineRow}>
                      {METRO_LINES.map((l) => (
                        <TouchableOpacity
                          key={l.key}
                          style={[styles.locLineChip, metroLine === l.key && styles.locLineChipActive]}
                          onPress={() => setMetroLine(l.key)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.locLineText, metroLine === l.key && styles.locLineTextActive]}>{l.cityLabel} · {l.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <ScrollView style={styles.dropBody} nestedScrollEnabled>
                      <Text style={styles.dropGroupTitle}>
                        站点{metroDraft.length ? ` · 已选 ${metroDraft.length}` : ''}
                      </Text>
                      <View style={styles.filterGroup}>
                        {activeLine?.stations.map((s) => (
                          <TouchableOpacity
                            key={s.name}
                            style={[styles.filterChip, metroDraft.includes(s.name) && styles.filterChipActive]}
                            onPress={() => toggleStation(s.name)}
                          >
                            <Text style={[styles.filterText, metroDraft.includes(s.name) && styles.filterTextActive]}>{s.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
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

            {openTab === 'area' && (
              <>
                <Text style={styles.dropGroupTitle}>面积</Text>
                <View style={styles.filterGroup}>
                  {AREA_PRESETS.map((a) => (
                    <TouchableOpacity
                      key={a.key}
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
                <Text style={styles.dropGroupTitle}>自定义面积</Text>
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
                <View style={styles.panelActions}>
                  <TouchableOpacity style={styles.resetBtn} onPress={() => resetCurrent('area')} activeOpacity={0.7}>
                    <Text style={styles.resetText}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCurrent('area')} activeOpacity={0.7}>
                    <Text style={styles.confirmText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {openTab === 'more' && (
              <>
                <Text style={styles.dropGroupTitle}>房源状态</Text>
                <View style={styles.filterGroup}>
                  {STATUS_FILTERS.map((s) => (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.filterChip, statusFilter === s.key && styles.filterChipActive]}
                      onPress={() => setStatusFilter(s.key)}
                    >
                      <Text style={[styles.filterText, statusFilter === s.key && styles.filterTextActive]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {biz === 'sale' && saleLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : loadError && biz !== 'sale' ? (
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
    flexDirection: 'row',
    marginHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    overflow: 'hidden',
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
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
    maxWidth: 64,
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
  filterTabBadgeText: { color: colors.primaryForeground, fontSize: 10, fontWeight: '600' },
  dropPanel: {
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
    maxHeight: '62%',
  },
  dropBody: { flexGrow: 0, maxHeight: 260 },
  dropGroupTitle: {
    fontSize: 12,
    color: colors.ink3,
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
  priceCustomUnit: { fontSize: 11, color: colors.ink3 },
  priceCustomDivider: { fontSize: 13, color: colors.ink3 },
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
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  resetBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetText: { fontSize: 14, color: colors.ink2 },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
  },
  confirmText: { fontSize: 14, color: colors.primaryForeground, fontWeight: '600' },
  // 区域 / 地铁（对齐贝壳）
  locTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  locTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  locTabActive: {
    backgroundColor: colors.sidebarActive,
  },
  locTabText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  locTabTextActive: { color: colors.primary, fontWeight: '600' },
  locDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  locGroup: { marginBottom: 2 },
  locMetro: { marginBottom: 4 },
  locLineRow: { flexGrow: 0, marginBottom: 4 },
  locLineChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  locLineChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  locLineText: { fontSize: 13, color: colors.ink2 },
  locLineTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  filterChip: {
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
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: { color: colors.primaryForeground, fontSize: 10, fontWeight: '600' },
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
    fontSize: 11,
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
  rentUnit: { fontSize: 11, fontWeight: '400', color: colors.ink2 },
  translateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  translateText: { fontSize: 11, color: colors.primary, fontWeight: '500' },
  emptyBox: { alignItems: 'center', paddingTop: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 8, opacity: 0.6 },
  empty: { fontSize: 15, color: colors.ink2 },
  emptySub: { fontSize: 12, color: colors.ink3, marginTop: 4 },
});