/**
 * 房源管理（业主端）
 * 结构对齐管理端 PropertiesScreen：搜索 → 状态筛选 → 房型/价格/面积/排序筛选 → 统计行 → 房源卡片
 * 数据源：GET /owners/me/properties（全量后客户端过滤/排序）
 * 新增/编辑：RN Modal 表单（字段对齐管理端 PropertyEditScreen），编辑态支持照片上传/删除
 * 操作：编辑（弹窗）/ 委托挂牌（OwnerMarketing）/ 删除
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  Switch,
  ActivityIndicator,
  Image,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import colors from '@/theme/colors';
import { useResponsiveContainerStyle } from '@/theme/responsive';
import { ownerApi } from '@/services/api';
import { publicApi, type PublicSchool } from '@/services/publicApi';
import { SCHOOL_RADIUS_OPTIONS } from '@/lib/publicSite';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '@/navigation/RootNavigator';

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

interface OwnerProperty {
  id: string;
  name?: string;
  room_number?: string | null;
  building?: string | null;
  floor?: number | null;
  address?: string | null;
  property_type?: string | null;
  status?: string | null;
  monthly_rent?: number;
  sale_price?: number;
  currency?: string;
  deposit_amount?: number | null;
  deposit_months?: number | null;
  size_sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnished?: boolean;
  available_from?: string;
  description?: string;
  video_url?: string;
  photos?: unknown[] | null;
  project_name?: string;
  tenant_name?: string;
}

interface PropertyForm {
  room_number: string;
  building: string;
  floor: string;
  address: string;
  property_type: string;
  currency: string;
  monthly_rent: string;
  deposit_amount: string;
  deposit_months: string;
  size_sqm: string;
  bedrooms: string;
  bathrooms: string;
  status: string;
  available_from: string;
  furnished: boolean;
  description: string;
  video_url: string;
}

const emptyForm = (): PropertyForm => ({
  room_number: '',
  building: '',
  floor: '',
  address: '',
  property_type: 'apartment',
  currency: 'THB',
  monthly_rent: '',
  deposit_amount: '',
  deposit_months: '',
  size_sqm: '',
  bedrooms: '',
  bathrooms: '',
  status: 'vacant',
  available_from: '',
  furnished: false,
  description: '',
  video_url: '',
});

const propTitle = (p: OwnerProperty) =>
  p.name ||
  (p.project_name ? `${p.project_name}·${p.room_number ?? ''}` : p.room_number || p.address || '房源');

const TYPE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  apartment: { label: '公寓', icon: 'business-outline', color: colors.primary },
  condo: { label: '公寓', icon: 'business-outline', color: colors.primary },
  house: { label: '别墅', icon: 'home-outline', color: colors.success },
  commercial: { label: '商铺', icon: 'storefront-outline', color: colors.warning },
  office: { label: '写字楼', icon: 'briefcase-outline', color: colors.info },
};

const STATUS_META: Record<string, { label: string; color: string; rgb: string }> = {
  vacant: { label: '空置', color: colors.warning, rgb: colors.warningRgb },
  rented: { label: '在租', color: colors.success, rgb: colors.successRgb },
  reserved: { label: '已预订', color: colors.primary, rgb: colors.primaryRgb },
  maintenance: { label: '维护中', color: colors.info, rgb: colors.infoRgb },
  renewing: { label: '续约中', color: colors.primary, rgb: colors.primaryRgb },
};

const propStatusMeta = (p: OwnerProperty) => {
  const s = String(p.status || '').toLowerCase();
  if (s === 'for_sale' || s === 'on_sale' || s === 'sale') {
    return { label: '在售', color: colors.warning, rgb: colors.warningRgb };
  }
  return STATUS_META[s] ?? { label: s || '未知', color: colors.ink2, rgb: colors.primaryRgb };
};

// 宫格色块卡顶部背景用状态色（在租 success / 空置 ink3 / 在售 warning 的浅色）
const gridStatusColor = (p: OwnerProperty) => {
  const s = String(p.status || '').toLowerCase();
  if (s === 'for_sale' || s === 'on_sale' || s === 'sale') return colors.warning; // 在售
  if (s === 'vacant' || s === 'available') return colors.ink3; // 空置
  return colors.success; // 在租
};

// 宫格卡价格：优先月租，其次售价
const gridPrice = (p: OwnerProperty) => {
  if (p.monthly_rent) {
    return { text: `${cur(p.currency)}${Number(p.monthly_rent).toLocaleString()}`, suffix: '/月' };
  }
  if (p.sale_price) {
    return { text: `${cur(p.currency)}${Number(p.sale_price).toLocaleString()}`, suffix: '' };
  }
  return { text: '暂无挂牌价', suffix: '' };
};

// 状态筛选（对齐管理端：全部/空置/在租/维护中/已预订）
const STATUS_CHIPS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'vacant', label: '空置' },
  { key: 'rented', label: '在租' },
  { key: 'maintenance', label: '维护中' },
  { key: 'reserved', label: '已预订' },
];

// 房型筛选
const BEDROOM_OPTIONS: { key: string; label: string }[] = [
  { key: '', label: '不限房型' },
  { key: '0', label: '单间' },
  { key: '1', label: '1室' },
  { key: '2', label: '2室' },
  { key: '3', label: '3室' },
  { key: '4', label: '4室+' },
];

// 价格区间（月租，THB，万 → ×10000）—— 对齐管理端
const PRICE_OPTIONS: { key: string; label: string; min: number; max: number }[] = [
  { key: '', label: '不限价格', min: 0, max: Infinity },
  { key: 'u3', label: '≤3万', min: 0, max: 30000 },
  { key: '3-5', label: '3-5万', min: 30000, max: 50000 },
  { key: '5-8', label: '5-8万', min: 50000, max: 80000 },
  { key: 'g8', label: '≥8万', min: 80000, max: Infinity },
  { key: 'custom', label: '自定义', min: 0, max: Infinity },
];

// 面积区间（㎡）—— 对齐管理端
const AREA_OPTIONS: { key: string; label: string; min: number; max: number }[] = [
  { key: '', label: '不限面积', min: 0, max: Infinity },
  { key: 'u50', label: '≤50㎡', min: 0, max: 50 },
  { key: '50-100', label: '50-100㎡', min: 50, max: 100 },
  { key: '100-150', label: '100-150㎡', min: 100, max: 150 },
  { key: '150-200', label: '150-200㎡', min: 150, max: 200 },
  { key: 'g200', label: '≥200㎡', min: 200, max: Infinity },
  { key: 'custom', label: '自定义', min: 0, max: Infinity },
];

// 排序（对齐任务要求：默认/租金升/租金降/面积降）
const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'default', label: '默认排序' },
  { key: 'price_asc', label: '租金从低到高' },
  { key: 'price_desc', label: '租金从高到低' },
  { key: 'area_desc', label: '面积从大到小' },
];

const optionLabel = (opts: { key: string; label: string }[], key: string, fallback: string) =>
  opts.find((o) => o.key === key)?.label ?? fallback;

// 表单选项（对齐管理端 PropertyEditScreen，币种按任务限定 THB/USD/CNY）
const TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: 'apartment', label: '公寓' },
  { key: 'condo', label: '公寓(康都)' },
  { key: 'house', label: '别墅' },
  { key: 'commercial', label: '商铺' },
  { key: 'office', label: '写字楼' },
];

const CURRENCY_OPTIONS: { key: string; label: string }[] = [
  { key: 'THB', label: 'THB' },
  { key: 'USD', label: 'USD' },
  { key: 'CNY', label: 'CNY' },
];

const FORM_STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: 'vacant', label: '空置' },
  { key: 'rented', label: '在租' },
  { key: 'maintenance', label: '维护中' },
  { key: 'reserved', label: '已预订' },
];

const normalizeMoney = (v: string) => v.replace(/[^\d.-]/g, '');

// 把后端返回的照片列表规整为 url 字符串数组（兼容字符串或 {url} 对象）
const normalizePhotos = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object') {
        const o = p as { url?: unknown };
        return typeof o.url === 'string' ? o.url : '';
      }
      return '';
    })
    .filter(Boolean) as string[];
};

// react-native-web 下 `Alert.alert` 是空实现（什么都不显示），会把新增/删除的结果与失败原因
// 静默吞掉，导致用户点击后「没有任何反应」。这里在 web 上降级到浏览器原生 `window.alert`，
// 让真实结果（成功/具体错误）对用户可见。
const notify = (title?: string, message?: string) => {
  const text = message ? `标题：${title ?? ''}\n${message}` : (title ?? '');
  if (Platform.OS === 'web') {
    window.alert(text);
  } else {
    Alert.alert(title ?? '', message ?? '');
  }
};

export default function PropertiesScreen() {
  const respContainer = useResponsiveContainerStyle();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const uid = user?.id ?? 'anon';
  const PROPERTIES_KEY: string[] = ['owner-properties', uid];

  // 搜索与筛选
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [priceCustomMin, setPriceCustomMin] = useState('');
  const [priceCustomMax, setPriceCustomMax] = useState('');
  const [areaRange, setAreaRange] = useState('');
  const [areaCustomMin, setAreaCustomMin] = useState('');
  const [areaCustomMax, setAreaCustomMax] = useState('');
  const [sort, setSort] = useState('default');
  const [activeFilter, setActiveFilter] = useState('');
  // C 端维度：学校（空间筛选，与 C 端找房口径一致）
  const [schoolId, setSchoolId] = useState('');
  const [schoolKm, setSchoolKm] = useState<number>(3);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [schoolKw, setSchoolKw] = useState('');
  // 列表 / 宫格 切换（默认列表）
  const [view, setView] = useState<'list' | 'grid'>('list');

  // 新增/编辑弹窗
  const [formModal, setFormModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [form, setForm] = useState<PropertyForm>(emptyForm);

  const q = useCachedQuery<OwnerProperty[]>({
    queryKey: schoolId
      ? [...PROPERTIES_KEY, 'school', schoolId, String(schoolKm)]
      : PROPERTIES_KEY,
    cacheKey: `owner-properties:${uid}`,
    queryFn: async () => {
      const res = schoolId
        ? await ownerApi.properties({ school_id: schoolId, school_radius_km: schoolKm })
        : await ownerApi.properties();
      const data: any = res.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      return Array.isArray(items) ? (items as OwnerProperty[]) : [];
    },
  });

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

  const properties = q.data ?? [];
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const onRefresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  // 客户端过滤 + 排序（数据源为全量）
  const filtered = useMemo(() => {
    let list = properties;
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter((p) =>
        [p.room_number, p.address, p.building, p.project_name, p.name]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
          .some((v) => v.includes(kw)),
      );
    }
    if (status) {
      list = list.filter((p) => String(p.status || '').toLowerCase() === status);
    }
    if (bedrooms !== '') {
      list = list.filter((p) => {
        const b = Number(p.bedrooms ?? 0);
        if (bedrooms === '0') return b === 0;
        if (bedrooms === '4') return b >= 4;
        return b === Number(bedrooms);
      });
    }
    if (priceRange === 'custom') {
      const mn = (Number(priceCustomMin) || 0) * 10000;
      const mx = (Number(priceCustomMax) || 0) * 10000;
      list = list.filter((p) => {
        const r = Number(p.monthly_rent ?? 0);
        if (priceCustomMin !== '' && r < mn) return false;
        if (priceCustomMax !== '' && r > mx) return false;
        return true;
      });
    } else if (priceRange) {
      const preset = PRICE_OPTIONS.find((o) => o.key === priceRange);
      if (preset) {
        list = list.filter((p) => {
          const r = Number(p.monthly_rent ?? 0);
          return r >= preset.min && r <= preset.max;
        });
      }
    }
    if (areaRange === 'custom') {
      const mn = Number(areaCustomMin);
      const mx = Number(areaCustomMax);
      list = list.filter((p) => {
        const a = Number(p.size_sqm ?? 0);
        if (areaCustomMin !== '' && !Number.isNaN(mn) && a < mn) return false;
        if (areaCustomMax !== '' && !Number.isNaN(mx) && a > mx) return false;
        return true;
      });
    } else if (areaRange) {
      const preset = AREA_OPTIONS.find((o) => o.key === areaRange);
      if (preset) {
        list = list.filter((p) => {
          const a = Number(p.size_sqm ?? 0);
          return a >= preset.min && a <= preset.max;
        });
      }
    }
    const sorted = [...list];
    if (sort === 'price_asc') sorted.sort((a, b) => (a.monthly_rent ?? 0) - (b.monthly_rent ?? 0));
    else if (sort === 'price_desc') sorted.sort((a, b) => (b.monthly_rent ?? 0) - (a.monthly_rent ?? 0));
    else if (sort === 'area_desc') sorted.sort((a, b) => (b.size_sqm ?? 0) - (a.size_sqm ?? 0));
    return sorted;
  }, [
    properties,
    keyword,
    status,
    bedrooms,
    priceRange,
    priceCustomMin,
    priceCustomMax,
    areaRange,
    areaCustomMin,
    areaCustomMax,
    sort,
  ]);

  // 统计（名下房源/在租/空置/在售，口径与旧版一致）
  const stats = useMemo(() => {
    const count = { total: properties.length, rented: 0, vacant: 0, forSale: 0 };
    properties.forEach((p) => {
      const s = String(p.status || '').toLowerCase();
      if (s === 'vacant' || s === 'available') count.vacant += 1;
      else if (s === 'for_sale' || s === 'on_sale' || s === 'sale') count.forSale += 1;
      else if (s === 'rented' || s === 'active') count.rented += 1;
    });
    return count;
  }, [properties]);

  const hasFilter =
    !!keyword.trim() || !!status || bedrooms !== '' || !!priceRange || !!areaRange || sort !== 'default' || !!schoolId;

  // ===== 新增 / 编辑 =====
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setPhotos([]);
    setFormModal(true);
  };

  const openEdit = (p: OwnerProperty) => {
    setEditingId(p.id);
    setForm({
      room_number: p.room_number != null ? String(p.room_number) : '',
      building: p.building || '',
      floor: p.floor != null ? String(p.floor) : '',
      address: p.address || '',
      property_type: p.property_type || 'apartment',
      currency: p.currency || 'THB',
      monthly_rent: p.monthly_rent != null ? String(p.monthly_rent) : '',
      deposit_amount: p.deposit_amount != null ? String(p.deposit_amount) : '',
      deposit_months: p.deposit_months != null ? String(p.deposit_months) : '',
      size_sqm: p.size_sqm != null ? String(p.size_sqm) : '',
      bedrooms: p.bedrooms != null ? String(p.bedrooms) : '',
      bathrooms: p.bathrooms != null ? String(p.bathrooms) : '',
      status: p.status || 'vacant',
      available_from: p.available_from ? String(p.available_from).slice(0, 10) : '',
      furnished: Boolean(p.furnished),
      description: p.description || '',
      video_url: p.video_url || '',
    });
    setPhotos(normalizePhotos(p.photos));
    setFormModal(true);
  };

  const closeForm = () => {
    setFormModal(false);
    setEditingId(null);
    setPhotos([]);
    setSubmitting(false);
  };

  const setField = (key: keyof PropertyForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submitForm = useCallback(async () => {
    if (!form.room_number.trim()) {
      Alert.alert('提示', '请填写房号');
      return;
    }
    if (!form.address.trim()) {
      Alert.alert('提示', '请填写地址');
      return;
    }
    const rent = Number(form.monthly_rent);
    if (!form.monthly_rent || Number.isNaN(rent) || rent <= 0) {
      Alert.alert('提示', '请填写有效的月租金额');
      return;
    }
    const area = Number(form.size_sqm);
    if (!form.size_sqm || Number.isNaN(area) || area <= 0) {
      Alert.alert('提示', '请填写有效的面积（㎡）');
      return;
    }
    const payload = {
      room_number: form.room_number.trim(),
      building: form.building.trim() || undefined,
      floor: form.floor ? Number(form.floor) : undefined,
      address: form.address.trim(),
      property_type: form.property_type,
      currency: form.currency,
      monthly_rent: rent,
      deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : undefined,
      deposit_months: form.deposit_months ? Number(form.deposit_months) : undefined,
      size_sqm: area,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      status: form.status,
      available_from: form.available_from?.trim() || undefined,
      furnished: form.furnished,
      description: form.description?.trim() || undefined,
      video_url: form.video_url?.trim() || undefined,
    };
    setSubmitting(true);
    try {
      if (editingId) {
        await ownerApi.update(editingId, payload);
        notify('保存成功', '房源信息已更新');
      } else {
        await ownerApi.create(payload);
        notify('新增成功');
      }
      closeForm();
      void q.refetch({ cancelRefetch: false });
    } catch (err: any) {
      notify(editingId ? '保存失败' : '新增失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [form, editingId, q]);

  // ===== 照片（仅编辑态）=====
  const pickAndUpload = async () => {
    if (!editingId) {
      Alert.alert('无法上传', '请先保存房源，再在编辑中上传照片');
      return;
    }
    if (photoBusy) return;
    let result;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
    } catch {
      Alert.alert('无法打开相册', '请检查相册权限后重试');
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    const picked = result.assets.filter((a) => !!a.uri);
    if (!picked.length) return;
    setPhotoBusy(true);
    try {
      const files = picked.map((a) => ({
        uri: a.uri,
        name: a.fileName ?? `photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
        type: a.mimeType ?? 'image/jpeg',
      }));
      const up: any = await ownerApi.uploadPhotos(editingId, files as any[]);
      const d = up?.data ?? {};
      if (Array.isArray(d.photos)) setPhotos(d.photos as string[]);
      else setPhotos((prev) => [...prev, ...picked.map((a) => a.uri)]);
      Alert.alert('上传成功', '照片已添加到房源');
    } catch (e: any) {
      Alert.alert('上传失败', e?.response?.data?.detail || '请稍后重试');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async (url: string) => {
    if (!editingId || photoBusy) return;
    setPhotoBusy(true);
    try {
      const del: any = await ownerApi.deletePhoto(editingId, url);
      const d = del?.data ?? {};
      if (Array.isArray(d.photos)) setPhotos(d.photos as string[]);
      else setPhotos((prev) => prev.filter((p) => p !== url));
    } catch (e: any) {
      Alert.alert('删除失败', e?.response?.data?.detail || '请稍后重试');
    } finally {
      setPhotoBusy(false);
    }
  };

  // ===== 删除 =====
  const confirmDelete = (item: OwnerProperty) => {
    const title = propTitle(item);
    const doDelete = async () => {
      try {
        await ownerApi.remove(item.id);
        queryClient.setQueryData<OwnerProperty[]>(PROPERTIES_KEY, (prev) =>
          (prev ?? []).filter((p) => p.id !== item.id),
        );
        notify('删除成功', '房源已删除');
      } catch (err: any) {
        notify('删除失败', err?.response?.data?.detail || '请稍后重试');
      }
    };
    // react-native-web 下 Alert.alert 是空实现，用浏览器原生 confirm
    if (Platform.OS === 'web') {
      if (window.confirm(`确定删除「${title}」吗？删除后不可恢复。`)) {
        doDelete();
      }
      return;
    }
    Alert.alert('删除房源', `确定删除「${title}」吗？删除后不可恢复。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: doDelete },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载房源…" />
      </View>
    );
  }

  const field = (label: string, value: string, key: keyof PropertyForm, opts?: {
    keyboard?: 'numeric' | 'default' | 'number-pad';
    placeholder?: string;
    multiline?: boolean;
  }) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, opts?.multiline && styles.inputMultiline]}
        value={value}
        onChangeText={(v) => setField(key, opts?.keyboard === 'numeric' ? normalizeMoney(v) : v)}
        keyboardType={opts?.keyboard ?? 'default'}
        placeholder={opts?.placeholder ?? ''}
        placeholderTextColor={colors.ink3}
        multiline={opts?.multiline}
        textAlignVertical={opts?.multiline ? 'top' : 'center'}
      />
    </View>
  );

  const chipGroup = (
    label: string,
    value: string,
    options: { key: string; label: string }[],
    onChange: (k: string) => void,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map((o) => {
          const active = value === o.key;
          return (
            <TouchableOpacity
              key={o.key}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.7}
              onPress={() => onChange(o.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, respContainer]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* 搜索（按房号/地址/楼栋，客户端过滤） */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={colors.ink3} />
          <TextInput
            style={styles.searchInput}
            value={keyword}
            onChangeText={setKeyword}
            placeholder="搜索房号/地址/楼栋"
            placeholderTextColor={colors.ink3}
            returnKeyType="search"
          />
          {keyword ? (
            <TouchableOpacity onPress={() => setKeyword('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={16} color={colors.ink3} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 状态筛选 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          {STATUS_CHIPS.map((c) => (
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

        {/* 筛选：房型 / 价格 / 面积 / 排序 */}
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
            style={[styles.filterChip, activeFilter === 'sort' && styles.filterChipActive]}
            activeOpacity={0.7}
            onPress={() => setActiveFilter(activeFilter === 'sort' ? '' : 'sort')}
          >
            <Text style={[styles.filterChipText, activeFilter === 'sort' && styles.filterChipTextActive]}>
              排序：{optionLabel(SORT_OPTIONS, sort, '默认排序')}
            </Text>
            <Ionicons name="chevron-down" size={13} color={activeFilter === 'sort' ? colors.primary : colors.ink3} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'school' && styles.filterChipActive]}
            activeOpacity={0.7}
            onPress={() => setActiveFilter(activeFilter === 'school' ? '' : 'school')}
          >
            <Text style={[styles.filterChipText, activeFilter === 'school' && styles.filterChipTextActive]}>
              学校{schoolId ? ' · 已选' : ''}
            </Text>
            <Ionicons name="chevron-down" size={13} color={activeFilter === 'school' ? colors.primary : colors.ink3} />
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

        {/* 学校（C 端维度：按学校 + 半径找房） */}
        {activeFilter === 'school' && (
          <View style={styles.schoolPanel}>
            <View style={styles.locGroupLabelWrap}>
              <Text style={styles.locGroupLabelTxt}>距离</Text>
            </View>
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

        {/* 统计行 */}
        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>名下房源</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.total}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>在租</Text>
            <Text style={[styles.statValue, { color: colors.success }]}>{stats.rented}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>空置</Text>
            <Text style={[styles.statValue, { color: colors.warning }]}>{stats.vacant}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>在售</Text>
            <Text style={[styles.statValue, { color: colors.ink3 }]}>{stats.forSale}</Text>
          </View>
        </View>

        {/* 房源列表 */}
        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>房源列表</Text>
            <Text style={styles.sectionCount}>{filtered.length} 套</Text>
          </View>
          <View style={styles.sectionActions}>
            {/* 列表↔宫格切换 */}
            <TouchableOpacity
              style={styles.viewToggle}
              activeOpacity={0.8}
              onPress={() => setView((v) => (v === 'list' ? 'grid' : 'list'))}
              hitSlop={8}
            >
              <Ionicons
                name={view === 'list' ? 'grid-outline' : 'list-outline'}
                size={18}
                color={colors.ink2}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={openCreate}>
              <Ionicons name="add" size={16} color={colors.primaryForeground} />
              <Text style={styles.addBtnText}>新增房源</Text>
            </TouchableOpacity>
          </View>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="business-outline"
            title={hasFilter ? '没有找到房源' : '暂无房源'}
            sub={hasFilter ? '换个名称、地址或筛选条件试试' : '点击右上角「新增房源」登记你的第一套房'}
          />
        ) : view === 'grid' ? (
          /* ===== 宫格视图：2 列色块卡（顶部状态色浅背景）===== */
          <View style={styles.gridWrap}>
            {filtered.map((p) => {
              const sc = gridStatusColor(p);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.gridCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('OwnerPropertyDetail', { id: p.id })}
                >
                  <View style={[styles.gridBanner, { backgroundColor: `${sc}1A` }]}>
                    {normalizePhotos(p.photos)[0] ? (
                      <Image source={{ uri: normalizePhotos(p.photos)[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : null}
                    <View style={[styles.gridBadge, { backgroundColor: `${sc}2E` }]}>
                      <Text style={[styles.gridBadgeText, { color: sc }]}>{propStatusMeta(p).label}</Text>
                    </View>
                  </View>
                  <Text style={styles.gridName} numberOfLines={1}>{propTitle(p)}</Text>
                  <Text style={[styles.gridPrice, { color: colors.primary }]} numberOfLines={1}>
                    {gridPrice(p).text}
                    {gridPrice(p).suffix ? (
                      <Text style={styles.gridPriceUnit}>{gridPrice(p).suffix}</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.gridAddr} numberOfLines={1}>{p.address || '暂无地址'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          filtered.map((p) => {
            const type = TYPE_META[p.property_type ?? 'apartment'] ?? TYPE_META.apartment;
            const meta = propStatusMeta(p);
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
                  {normalizePhotos(p.photos)[0] ? (
                    <Image source={{ uri: normalizePhotos(p.photos)[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
                  onPress={() => navigation.navigate('OwnerPropertyDetail', { id: p.id })}
                >
                  <Text style={styles.name} numberOfLines={1}>{propTitle(p)}</Text>
                  <View style={styles.addrRow}>
                    <Ionicons name="location-outline" size={13} color={colors.ink3} />
                    <Text style={styles.addr} numberOfLines={1}>{p.address || '暂无地址'}</Text>
                  </View>
                  {!!spec && <Text style={styles.spec}>{spec}{p.tenant_name ? ` · 租客 ${p.tenant_name}` : ''}</Text>}
                  <View style={styles.priceRow}>
                    {p.monthly_rent ? (
                      <Text style={styles.price}>
                        {cur(p.currency)}
                        {Number(p.monthly_rent).toLocaleString()}
                        <Text style={styles.priceUnit}> /月</Text>
                      </Text>
                    ) : p.sale_price ? (
                      <Text style={styles.price}>
                        {cur(p.currency)}
                        {Number(p.sale_price).toLocaleString()}
                      </Text>
                    ) : (
                      <Text style={styles.noPrice}>暂无挂牌价</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <View style={styles.cardFoot}>
                  <TouchableOpacity
                    style={[styles.footBtn, styles.footGhost]}
                    activeOpacity={0.8}
                    onPress={() => openEdit(p)}
                  >
                    <Ionicons name="create-outline" size={14} color={colors.primary} />
                    <Text style={[styles.footText, { color: colors.primary }]}>编辑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.footBtn, styles.footGhost]}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('OwnerMarketing')}
                  >
                    <Ionicons name="megaphone-outline" size={14} color={colors.info} />
                    <Text style={[styles.footText, { color: colors.info }]}>委托挂牌</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.footBtn, styles.footDanger]}
                    activeOpacity={0.8}
                    onPress={() => confirmDelete(p)}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={[styles.footText, { color: colors.error }]}>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 新增 / 编辑弹窗 */}
      <Modal
        visible={formModal}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <View style={styles.mask}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{editingId ? '编辑房源' : '新增房源'}</Text>
              <TouchableOpacity onPress={closeForm} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.ink3} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetSection}>基础信息</Text>
              {field('房号/名称 *', form.room_number, 'room_number', { placeholder: '如 A-101 或 曼谷 Asok 1 栋' })}
              <View style={styles.fieldRow}>
                <View style={styles.fieldRowItem}>{field('月租 *', form.monthly_rent, 'monthly_rent', { keyboard: 'numeric', placeholder: '0' })}</View>
                <View style={styles.fieldRowItem}>{field('押金', form.deposit_amount, 'deposit_amount', { keyboard: 'numeric', placeholder: '0' })}</View>
              </View>
              <View style={styles.fieldRow}>
                <View style={styles.fieldRowItem}>{field('押金月数', form.deposit_months, 'deposit_months', { keyboard: 'number-pad', placeholder: '1' })}</View>
                <View style={styles.fieldRowItem}>{field('面积(㎡) *', form.size_sqm, 'size_sqm', { keyboard: 'numeric', placeholder: '0' })}</View>
              </View>
              <View style={styles.fieldRow}>
                <View style={styles.fieldRowItem}>{field('卧室数', form.bedrooms, 'bedrooms', { keyboard: 'number-pad', placeholder: '1' })}</View>
                <View style={styles.fieldRowItem}>{field('卫浴数', form.bathrooms, 'bathrooms', { keyboard: 'number-pad', placeholder: '1' })}</View>
              </View>
              {field('地址 *', form.address, 'address', { placeholder: '详细地址，如素坤逸 24 巷' })}
              <View style={styles.fieldRow}>
                <View style={styles.fieldRowItem}>{field('楼栋', form.building, 'building', { placeholder: '如 A 栋' })}</View>
                <View style={styles.fieldRowItem}>{field('楼层', form.floor, 'floor', { keyboard: 'number-pad', placeholder: '如 12' })}</View>
              </View>
              {chipGroup('房源类型', form.property_type, TYPE_OPTIONS, (k) => setField('property_type', k))}
              {chipGroup('币种', form.currency, CURRENCY_OPTIONS, (k) => setField('currency', k))}
              {field('可入住日期', form.available_from, 'available_from', { placeholder: 'YYYY-MM-DD，如 2026-10-01' })}

              <Text style={styles.sheetSection}>租态</Text>
              {chipGroup('当前状态', form.status, FORM_STATUS_OPTIONS, (k) => setField('status', k))}

              <Text style={styles.sheetSection}>房源描述</Text>
              {field('描述', form.description, 'description', { multiline: true, placeholder: '周边配套、交通、特色等' })}
              {field('视频链接', form.video_url, 'video_url', { placeholder: 'https://…（选填）' })}

              <Text style={styles.sheetSection}>设施</Text>
              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <Text style={styles.switchTitle}>带家具</Text>
                  <Text style={styles.switchSub}>是否提供家具（精装）</Text>
                </View>
                <Switch
                  value={form.furnished}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, furnished: v }))}
                  trackColor={{ false: colors.ink3, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>

              {/* 照片：仅编辑态 */}
              {editingId && (
                <>
                  <Text style={styles.sheetSection}>房源照片</Text>
                  <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.8} onPress={pickAndUpload} disabled={photoBusy}>
                    {photoBusy ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <Text style={styles.uploadText}>上传照片</Text>
                    )}
                  </TouchableOpacity>
                  {photos.length > 0 ? (
                    <View style={styles.photoGrid}>
                      {photos.map((url) => (
                        <View key={url} style={styles.photoItem}>
                          <Image source={{ uri: url }} style={styles.photoImg} resizeMode="cover" />
                          <TouchableOpacity
                            style={styles.photoDel}
                            activeOpacity={0.8}
                            onPress={() => removePhoto(url)}
                          >
                            <Text style={styles.photoDelText}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.photoHint}>暂无照片，点击上方按钮上传</Text>
                  )}
                </>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                disabled={submitting}
                onPress={submitForm}
              >
                <Text style={styles.submitBtnText}>{submitting ? '提交中…' : editingId ? '保存修改' : '确认新增'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 32 },

  /* 搜索 */
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

  /* 状态 chips */
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

  /* 筛选行 */
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

  /* 学校筛选项（C 端维度） */
  schoolPanel: { marginHorizontal: 20, marginBottom: 12 },
  locGroupLabelWrap: { marginBottom: 4 },
  locGroupLabelTxt: { fontSize: 12, color: colors.ink3, fontWeight: '600' },
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

  /* 展开选项 */
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

  /* 统计行 */
  statRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20 },
  statCell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: 11, color: colors.ink3 },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },

  /* 列表标题 + 新增按钮 */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
  },
  addBtnText: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.primaryForeground },

  /* 列表/宫格 切换 + 计数 */
  sectionCount: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewToggle: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* 宫格视图（2 列色块卡） */
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 20,
  },
  gridCard: {
    flexGrow: 1,
    flexBasis: '44%',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 4,
    ...colors.shadow.sm,
  },
  gridBanner: {
    height: 64,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    paddingRight: 8,
  },
  gridBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.radius.full,
  },
  gridBadgeText: { fontSize: 10, fontWeight: '700' },
  gridName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  gridPrice: { fontSize: 15, fontWeight: '800', paddingHorizontal: 12, marginTop: 4, fontVariant: ['tabular-nums'] },
  gridPriceUnit: { fontSize: 10, fontWeight: '500', color: colors.ink3 },
  gridAddr: { fontSize: 11, color: colors.ink3, paddingHorizontal: 12, paddingBottom: 12, marginTop: 4 },

  /* 房源卡片（对齐管理端） */
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
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
  noPrice: { fontSize: 12, color: colors.ink3 },

  /* 卡片底部操作 */
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
  },
  footGhost: { borderColor: colors.primary, backgroundColor: `${colors.primary}0F` },
  footDanger: { borderColor: colors.error, backgroundColor: `${colors.error}0A` },
  footText: { fontSize: 13, fontWeight: '600' },

  /* 弹窗 */
  mask: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: colors.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  sheetBody: {
    paddingHorizontal: colors.spacing.lg,
    paddingTop: colors.spacing.md,
    paddingBottom: 12,
  },
  sheetSection: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink2,
    marginTop: 12,
    marginBottom: 8,
  },

  /* 弹窗表单 */
  field: { gap: 6, marginBottom: 10 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldRowItem: { flex: 1 },
  label: { fontSize: 12, color: colors.ink3 },
  input: {
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface,
    fontSize: 14,
    color: colors.ink,
  },
  inputMultiline: { height: 88, paddingTop: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 4,
  },
  switchInfo: { flex: 1, paddingRight: 12 },
  switchTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  switchSub: { fontSize: 12, color: colors.ink3, marginTop: 3 },

  uploadBtn: {
    height: 46,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoItem: { width: 76, height: 76, borderRadius: colors.radius.md, overflow: 'hidden', position: 'relative' },
  photoImg: { width: '100%', height: '100%' },
  photoDel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDelText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  photoHint: { fontSize: 12, color: colors.ink3, marginTop: 8 },

  submitBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    ...colors.shadow.primary,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
});
