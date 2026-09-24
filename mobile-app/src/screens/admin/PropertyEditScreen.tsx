/**
 * 房源新增 / 编辑（管理端）
 * 区块：顶部标题 → 基础信息 → 归属（业主/小区）→ 租态 → 房源描述 → 朝向装修配套 → 照片 → 底部保存
 * 数据源：
 *   - 新建：POST /properties（created_by 由后端按当前登录账号写入）
 *   - 编辑：PATCH /properties/{id}
 *   - 照片：POST /properties/{id}/photos（上传）、DELETE /properties/{id}/photos?url=（删除）
 *   - 业主检索：GET /owners（员工侧）；小区检索：GET /public/projects
 * 进入方式：
 *   - route.params.mode === 'create'：新建模式（无 id，保存走 create）。
 *   - 传 route.params.id：打开时先 GET /properties/{id} 拉取初值。
 *   - 传 route.params.initial（完整 Property 对象）：直接作为初值，不额外请求。
 * 说明：房源无独立上架/下架，删除即下架，故不处理 listing_status。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import { propertiesApi, ownersApi } from '@/services/api';
import { publicApi } from '@/services/publicApi';
import { useI18n } from '@/i18n';
import { useAuthStore } from '@/stores/auth';

interface PropertyForm {
  room_number: string;
  monthly_rent: string;
  deposit_amount: string;
  deposit_months: string;
  size_sqm: string;
  bedrooms: string;
  bathrooms: string;
  status: string;
  description: string;
  address: string;
  building: string;
  floor: string;
  property_type: string;
  currency: string;
  available_from: string;
  furnished: boolean;
  owner_id: string;
  project_id: string;
  orientation: string;
  decoration: string;
  video_url: string;
}

type TFunc = (key: string, params?: Record<string, string | number>) => string;

const statusOptions = (t: TFunc): { key: string; label: string }[] => [
  { key: 'vacant', label: t('edit.statusVacant') },
  { key: 'rented', label: t('status.rented') },
  { key: 'renewing', label: t('prop.status.renewing') },
  { key: 'maintenance', label: t('status.maintenance') },
];

const typeOptions = (t: TFunc): { key: string; label: string }[] => [
  { key: 'apartment', label: t('prop.type.apartment') },
  { key: 'condo', label: t('prop.type.condo') },
  { key: 'house', label: t('prop.type.house') },
  { key: 'commercial', label: t('prop.type.commercial') },
  { key: 'office', label: t('prop.type.office') },
];

const CURRENCY_OPTIONS: { key: string; label: string }[] = [
  { key: 'THB', label: 'THB' },
  { key: 'USD', label: 'USD' },
  { key: 'CNY', label: 'CNY' },
  { key: 'MYR', label: 'MYR' },
];

// 朝向 / 装修 / 配套的取值与文案必须与 C 端筛选栏同口径（后端按枚举值过滤），
// 这里只去掉筛选栏的「不限」项——编辑表单里清空靠再次点击取消选中。
const orientationOptions = (t: TFunc): { key: string; label: string }[] => [
  { key: 'north', label: t('prop.orient.north') },
  { key: 'south', label: t('prop.orient.south') },
  { key: 'east', label: t('prop.orient.east') },
  { key: 'west', label: t('prop.orient.west') },
  { key: 'northeast', label: t('prop.orient.northeast') },
  { key: 'northwest', label: t('prop.orient.northwest') },
  { key: 'southeast', label: t('prop.orient.southeast') },
  { key: 'southwest', label: t('prop.orient.southwest') },
];

const decorationOptions = (t: TFunc): { key: string; label: string }[] => [
  { key: 'bare', label: t('pub.decoration.bare') },
  { key: 'simple', label: t('pub.decoration.simple') },
  { key: 'standard', label: t('pub.decoration.standard') },
  { key: 'luxury', label: t('pub.decoration.luxury') },
  { key: 'fully_furnished', label: t('pub.decoration.fully_furnished') },
];

const amenityOptions = (t: TFunc): { key: string; label: string }[] => [
  { key: 'aircon', label: t('prop.amenity.aircon') },
  { key: 'pool', label: t('prop.amenity.pool') },
  { key: 'gym', label: t('prop.amenity.gym') },
  { key: 'parking', label: t('prop.amenity.parking') },
  { key: 'elevator', label: t('prop.amenity.elevator') },
  { key: 'balcony', label: t('prop.amenity.balcony') },
  { key: 'garden', label: t('prop.amenity.garden') },
];

type PickerKind = 'owner' | 'project';


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

export default function PropertyEditScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const STATUS_OPTIONS = useMemo(() => statusOptions(t), [t]);
  const TYPE_OPTIONS = useMemo(() => typeOptions(t), [t]);
  const ORIENTATION_OPTIONS = useMemo(() => orientationOptions(t), [t]);
  const DECORATION_OPTIONS = useMemo(() => decorationOptions(t), [t]);
  const AMENITY_OPTIONS = useMemo(() => amenityOptions(t), [t]);
  const currentUser = useAuthStore((s) => s.user);
  const isCreate: boolean = route?.params?.mode === 'create';
  const paramId: string | undefined = isCreate ? undefined : route?.params?.id;
  const initialData: any = isCreate ? undefined : route?.params?.initial;
  const currentId: string | undefined = paramId ?? initialData?.id;
  // 业主账号新增房源时 owner_id 由后端按当前用户绑定，不需要（也不允许）在前端选业主
  const canPickOwner = currentUser?.role !== 'owner';

  const [loading, setLoading] = useState(!initialData && !isCreate);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  // 新建模式下还没 id，照片先只存在本地，保存成功拿到 id 后再上传
  const [pendingPhotos, setPendingPhotos] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [ownerLabel, setOwnerLabel] = useState('');
  const [projectLabel, setProjectLabel] = useState('');
  const [picker, setPicker] = useState<{
    kind: PickerKind | null;
    q: string;
    items: any[];
    loading: boolean;
  }>({ kind: null, q: '', items: [], loading: false });
  const [form, setForm] = useState<PropertyForm>(() => ({
    room_number: '',
    monthly_rent: '',
    deposit_amount: '',
    deposit_months: '',
    size_sqm: '',
    bedrooms: '',
    bathrooms: '',
    status: 'vacant',
    description: '',
    address: '',
    building: '',
    floor: '',
    property_type: 'apartment',
    currency: 'THB',
    available_from: '',
    furnished: false,
    owner_id: '',
    project_id: '',
    orientation: '',
    decoration: '',
    video_url: '',
  }));

  const applyInitial = useCallback((data: any) => {
    if (!data) return;
    setForm({
      room_number: String(data.room_number ?? ''),
      monthly_rent: data.monthly_rent != null ? String(data.monthly_rent) : '',
      deposit_amount: data.deposit_amount != null ? String(data.deposit_amount) : '',
      deposit_months: data.deposit_months != null ? String(data.deposit_months) : '',
      size_sqm: data.size_sqm != null ? String(data.size_sqm) : '',
      bedrooms: data.bedrooms != null ? String(data.bedrooms) : '',
      bathrooms: data.bathrooms != null ? String(data.bathrooms) : '',
      status: data.status || 'vacant',
      description: data.description || '',
      address: data.address || '',
      building: data.building || '',
      floor: data.floor != null ? String(data.floor) : '',
      property_type: data.property_type || 'apartment',
      currency: data.currency || 'THB',
      available_from: data.available_from ? String(data.available_from).slice(0, 10) : '',
      furnished: Boolean(data.furnished),
      owner_id: data.owner_id ? String(data.owner_id) : '',
      project_id: data.project_id ? String(data.project_id) : '',
      orientation: data.orientation || '',
      decoration: data.decoration || '',
      video_url: data.video_url || '',
    });
    setAmenities(Array.isArray(data.amenities) ? (data.amenities as string[]) : []);
    setPhotos(normalizePhotos(data.photos));
    setOwnerLabel(data.owner_name || '');
    setProjectLabel(data.project_name || '');
  }, []);

  // 拉取初值：优先用传入的 initial，否则用 id 请求
  useEffect(() => {
    if (initialData) {
      setLoading(false);
      applyInitial(initialData);
      return;
    }
    if (!paramId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await propertiesApi.get(paramId);
        if (cancelled) return;
        applyInitial((res as any)?.data ?? null);
      } catch (e: any) {
        if (!cancelled) notifyError(t('acc.loadFailed'), e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramId, initialData, applyInitial]);

  const setField = (key: keyof PropertyForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleAmenity = (key: string) =>
    setAmenities((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key],
    );

  // 业主 / 小区选择器的数据源：业主走员工侧检索接口，小区走公开楼盘接口
  const loadPickerItems = async (kind: PickerKind, q: string) => {
    setPicker((p) => ({ ...p, kind, q, loading: true }));
    try {
      const res: any =
        kind === 'owner'
          ? await ownersApi.list({ keyword: q || undefined, page_size: 50 })
          : await publicApi.projects({ q: q || undefined, page_size: 30 });
      const items: any[] = res?.data?.items ?? [];
      // 期间可能已关闭或切换到另一个选择器，过期响应直接丢弃，避免串数据
      setPicker((p) => (p.kind === kind ? { ...p, items, loading: false } : p));
    } catch {
      setPicker((p) => (p.kind === kind ? { ...p, items: [], loading: false } : p));
    }
  };

  const closePicker = () => setPicker({ kind: null, q: '', items: [], loading: false });

  const choosePickerItem = (item: any) => {
    if (picker.kind === 'owner') {
      setField('owner_id', String(item.id));
      setOwnerLabel(item.name || item.phone || item.email || '');
    } else if (picker.kind === 'project') {
      setField('project_id', String(item.id));
      setProjectLabel(item.name || '');
    }
    closePicker();
  };

  const buildPayload = () => ({
    room_number: form.room_number.trim() || undefined,
    monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : undefined,
    deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : undefined,
    deposit_months: form.deposit_months ? Number(form.deposit_months) : undefined,
    size_sqm: form.size_sqm ? Number(form.size_sqm) : undefined,
    bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
    bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
    floor: form.floor ? Number(form.floor) : undefined,
    status: form.status,
    description: form.description?.trim() || undefined,
    address: form.address?.trim() || undefined,
    building: form.building?.trim() || undefined,
    property_type: form.property_type,
    currency: form.currency,
    available_from: form.available_from?.trim() || undefined,
    furnished: form.furnished,
    orientation: form.orientation || undefined,
    decoration: form.decoration || undefined,
    amenities: amenities.length ? amenities : undefined,
    video_url: form.video_url.trim() || undefined,
    project_id: form.project_id || undefined,
  });

  const onSave = async () => {
    if (isCreate) {
      // 新建时后端必填：房号、地址、月租；内部角色还要选归属业主
      if (!form.room_number.trim()) {
        notifyError(t('edit.cannotSave'), { message: t('edit.roomRequired') });
        return;
      }
      if (!form.address.trim()) {
        notifyError(t('edit.cannotSave'), { message: t('prop.addressRequired') });
        return;
      }
      if (!form.monthly_rent) {
        notifyError(t('edit.cannotSave'), { message: t('edit.rentRequired') });
        return;
      }
      if (canPickOwner && !form.owner_id) {
        notifyError(t('edit.cannotSave'), { message: t('edit.ownerRequiredMsg') });
        return;
      }
    } else if (!currentId) {
      notifyError(t('edit.cannotSave'), { message: t('edit.missingId') });
      return;
    }

    const payload: any = buildPayload();
    // owner_id 只由内部角色提交；业主账号由后端按当前用户绑定，传了也会被忽略
    if (canPickOwner && form.owner_id) payload.owner_id = form.owner_id;

    setSaving(true);
    try {
      if (isCreate) {
        const res: any = await propertiesApi.create(payload);
        const newId: string | undefined = res?.data?.id;
        // 新建时选的照片本地还没有房源可挂，等拿到 id 再补传；
        // 补传失败不影响房源本身已建成，只提示一次
        if (newId && pendingPhotos.length) {
          try {
            await propertiesApi.uploadPhotos(newId, pendingPhotos as any[]);
          } catch (e: any) {
            notifyError(t('edit.photoUploadFail'), e);
          }
        }
      } else {
        payload.photos = photos;
        await propertiesApi.update(currentId as string, payload);
      }
      navigation.goBack();
    } catch (e: any) {
      notifyError(t('prop.saveFail'), e);
    } finally {
      setSaving(false);
    }
  };

  const pickAndUpload = async () => {
    if (photoBusy) return;
    let result;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
    } catch {
      notifyError(t('prop.albumFailTitle'), { message: t('prop.albumFailMsg') });
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    const picked = result.assets.filter((a) => !!a.uri);
    if (!picked.length) return;
    const files = picked.map((a) => ({
      uri: a.uri,
      name: a.fileName ?? `photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      type: a.mimeType ?? 'image/jpeg',
    }));
    if (!currentId) {
      // 新建模式：房源还没有 id，先攒在本地，保存成功后再统一上传
      setPendingPhotos((prev) => [...prev, ...files]);
      setPhotos((prev) => [...prev, ...picked.map((a) => a.uri)]);
      return;
    }
    setPhotoBusy(true);
    try {
      const up: any = await propertiesApi.uploadPhotos(currentId, files as any[]);
      const d = up?.data ?? {};
      if (Array.isArray(d.photos)) setPhotos(d.photos as string[]);
      else setPhotos((prev) => [...prev, ...picked.map((a) => a.uri)]);
      notify(t('prop.uploadOk'), t('prop.uploadOkMsg'));
    } catch (e: any) {
      notifyError(t('prop.uploadFail'), e);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async (url: string) => {
    if (photoBusy) return;
    if (!currentId) {
      // 新建模式：照片还没上传，直接从本地待传列表里摘掉即可
      setPendingPhotos((prev) => prev.filter((f) => f.uri !== url));
      setPhotos((prev) => prev.filter((p) => p !== url));
      return;
    }
    setPhotoBusy(true);
    try {
      const del: any = await propertiesApi.deletePhoto(currentId, url);
      const d = del?.data ?? {};
      if (Array.isArray(d.photos)) setPhotos(d.photos as string[]);
      else setPhotos((prev) => prev.filter((p) => p !== url));
    } catch (e: any) {
      notifyError(t('prop.deleteFail'), e);
    } finally {
      setPhotoBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headTitle}>{isCreate ? t('prop.createTitle') : t('prop.editTitle')}</Text>
      <Text style={styles.headSub}>
        {isCreate ? t('edit.subCreate') : t('edit.subEdit')}
      </Text>

      {/* 基础信息 */}
      <Text style={styles.sectionTitle}>{t('prop.sectionBasic')}</Text>
      <View style={styles.card}>
        {field(t('edit.labelRoom'), form.room_number, 'room_number', { placeholder: t('prop.fieldRoomPlaceholder') })}
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('edit.labelRent'), form.monthly_rent, 'monthly_rent', { keyboard: 'numeric', placeholder: '0' })}</View>
          <View style={styles.rowItem}>{field(t('prop.fieldDeposit'), form.deposit_amount, 'deposit_amount', { keyboard: 'numeric', placeholder: '0' })}</View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('prop.fieldDepositMonths'), form.deposit_months, 'deposit_months', { keyboard: 'number-pad', placeholder: '1' })}</View>
          <View style={styles.rowItem}>{field(t('edit.labelArea'), form.size_sqm, 'size_sqm', { keyboard: 'numeric', placeholder: '0' })}</View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('prop.fieldBedrooms'), form.bedrooms, 'bedrooms', { keyboard: 'number-pad', placeholder: '1' })}</View>
          <View style={styles.rowItem}>{field(t('prop.fieldBathrooms'), form.bathrooms, 'bathrooms', { keyboard: 'number-pad', placeholder: '1' })}</View>
        </View>
        {field(t('pub.address'), form.address, 'address', { placeholder: t('prop.fieldAddressPlaceholder') })}
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('prop.fieldBuilding'), form.building, 'building', { placeholder: t('prop.fieldBuildingPlaceholder') })}</View>
          <View style={styles.rowItem}>{field(t('prop.fieldFloor'), form.floor, 'floor', { keyboard: 'number-pad', placeholder: t('prop.fieldFloorPlaceholder') })}</View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('prop.type')}</Text>
          <View style={styles.chipWrap}>
            {TYPE_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, form.property_type === s.key && styles.chipActive]}
                activeOpacity={0.7}
                onPress={() => setField('property_type', s.key)}
              >
                <Text style={[styles.chipText, form.property_type === s.key && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('prop.currency')}</Text>
          <View style={styles.chipWrap}>
            {CURRENCY_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, form.currency === s.key && styles.chipActive]}
                activeOpacity={0.7}
                onPress={() => setField('currency', s.key)}
              >
                <Text style={[styles.chipText, form.currency === s.key && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {field(t('prop.fieldAvailableFrom'), form.available_from, 'available_from', { placeholder: t('prop.fieldAvailableFromPlaceholder') })}
      </View>

      {/* 归属：业主（员工侧必选）与所属小区 */}
      <Text style={styles.sectionTitle}>{t('edit.sectionOwner')}</Text>
      <View style={styles.card}>
        {canPickOwner ? (
          <View style={styles.field}>
            <Text style={styles.label}>{t('prop.ownerRequired')}</Text>
            <TouchableOpacity
              style={styles.selectRow}
              activeOpacity={0.7}
              onPress={() => loadPickerItems('owner', '')}
            >
              <Text style={ownerLabel ? styles.selectValue : styles.selectPlaceholder}>
                {ownerLabel || t('edit.selectOwner')}
              </Text>
              <Text style={styles.selectArrow}>›</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hintText}>{t('edit.ownerAutoHint')}</Text>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>{t('prop.projectOptional')}</Text>
          <TouchableOpacity
            style={styles.selectRow}
            activeOpacity={0.7}
            onPress={() => loadPickerItems('project', '')}
          >
            <Text style={projectLabel ? styles.selectValue : styles.selectPlaceholder}>
              {projectLabel || t('edit.selectProject')}
            </Text>
            <Text style={styles.selectArrow}>›</Text>
          </TouchableOpacity>
          {form.project_id ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setField('project_id', '');
                setProjectLabel('');
              }}
            >
              <Text style={styles.clearText}>{t('edit.clearProject')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* 租态 */}
      <Text style={styles.sectionTitle}>{t('prop.sectionLease')}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{t('prop.status')}</Text>
        <View style={styles.chipWrap}>
          {STATUS_OPTIONS.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.chip, form.status === s.key && styles.chipActive]}
              activeOpacity={0.7}
              onPress={() => setField('status', s.key)}
            >
              <Text style={[styles.chipText, form.status === s.key && styles.chipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 描述 */}
      <Text style={styles.sectionTitle}>{t('prop.sectionDesc')}</Text>
      <View style={styles.card}>
        {field(t('prop.fieldDesc'), form.description, 'description', { multiline: true, placeholder: t('prop.fieldDescPlaceholder') })}
      </View>

      {/* 朝向 / 装修 / 配套 / 视频：取值与 C 端筛选栏同口径，否则筛不出来 */}
      <Text style={styles.sectionTitle}>{t('edit.sectionOrientation')}</Text>
      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('prop.orientation')}</Text>
          <View style={styles.chipWrap}>
            {ORIENTATION_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.key}
                style={[styles.chip, form.orientation === o.key && styles.chipActive]}
                activeOpacity={0.7}
                // 再次点击已选项即取消，表单里不需要「不限」这个伪选项
                onPress={() => setField('orientation', form.orientation === o.key ? '' : o.key)}
              >
                <Text style={[styles.chipText, form.orientation === o.key && styles.chipTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('prop.decoration')}</Text>
          <View style={styles.chipWrap}>
            {DECORATION_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d.key}
                style={[styles.chip, form.decoration === d.key && styles.chipActive]}
                activeOpacity={0.7}
                onPress={() => setField('decoration', form.decoration === d.key ? '' : d.key)}
              >
                <Text style={[styles.chipText, form.decoration === d.key && styles.chipTextActive]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {field(t('edit.labelVideo'), form.video_url, 'video_url', { placeholder: t('edit.videoPlaceholder') })}
      </View>

      {/* 带家具 */}
      <Text style={styles.sectionTitle}>{t('prop.sectionFacilities')}</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchTitle}>{t('prop.furnished')}</Text>
            <Text style={styles.switchSub}>{t('prop.furnishedSub')}</Text>
          </View>
          <Switch
            value={form.furnished}
            onValueChange={(v) => setForm((prev) => ({ ...prev, furnished: v }))}
            trackColor={{ false: colors.ink3, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('prop.amenities')}</Text>
          <View style={styles.chipWrap}>
            {AMENITY_OPTIONS.map((a) => (
              <TouchableOpacity
                key={a.key}
                style={[styles.chip, amenities.includes(a.key) && styles.chipActive]}
                activeOpacity={0.7}
                onPress={() => toggleAmenity(a.key)}
              >
                <Text style={[styles.chipText, amenities.includes(a.key) && styles.chipTextActive]}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* 照片 */}
      <Text style={styles.sectionTitle}>{t('prop.sectionPhotos')}</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.8} onPress={pickAndUpload} disabled={photoBusy}>
          {photoBusy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.uploadText}>{t('prop.uploadPhoto')}</Text>
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
                  accessibilityRole="button"
                  accessibilityLabel={t('edit.deletePhoto')}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.photoDelText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.photoHint}>
            {isCreate ? t('edit.photoEmptyCreate') : t('prop.photoEmpty')}
          </Text>
        )}
      </View>

      {/* 保存 */}
      <TouchableOpacity style={styles.saveBtn} activeOpacity={0.8} onPress={onSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.saveText}>{isCreate ? t('edit.createBtn') : t('acc.save')}</Text>
        )}
      </TouchableOpacity>

      {/* 业主 / 小区选择器（同一套弹层，按 kind 切换数据源） */}
      <Modal
        visible={picker.kind !== null}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                {picker.kind === 'owner' ? t('edit.modalTitleOwner') : t('edit.modalTitleProject')}
              </Text>
              <TouchableOpacity onPress={closePicker} accessibilityRole="button" accessibilityLabel={t('edit.close')}>
                <Text style={styles.modalClose}>{t('edit.close')}</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              value={picker.q}
              onChangeText={(v) => {
                setPicker((p) => ({ ...p, q: v }));
                if (picker.kind) loadPickerItems(picker.kind, v);
              }}
              placeholder={picker.kind === 'owner' ? t('edit.searchOwnerPh') : t('edit.searchProjectPh')}
              placeholderTextColor={colors.ink3}
              autoCorrect={false}
            />
            {picker.loading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : picker.items.length === 0 ? (
              <Text style={styles.modalEmpty}>{t('edit.noMatch')}</Text>
            ) : (
              <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
                {picker.items.map((item) => (
                  <TouchableOpacity
                    key={String(item.id)}
                    style={styles.modalItem}
                    activeOpacity={0.7}
                    onPress={() => choosePickerItem(item)}
                  >
                    <Text style={styles.modalItemTitle} numberOfLines={1}>
                      {picker.kind === 'owner'
                        ? item.name || item.phone || item.email || t('edit.unnamedOwner')
                        : item.name || t('edit.unnamedProject')}
                    </Text>
                    {picker.kind === 'owner' ? (
                      <Text style={styles.modalItemSub} numberOfLines={1}>
                        {[item.phone, item.email, t('edit.managedCount', { n: item.property_count ?? 0 })]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : (
                      <Text style={styles.modalItemSub} numberOfLines={1}>
                        {[item.district, item.city].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  headTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 18,
    marginHorizontal: 20,
    letterSpacing: -0.4,
  },
  headSub: { fontSize: 13, color: colors.ink3, marginHorizontal: 20, marginTop: 4 },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink2,
    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 8,
    letterSpacing: -0.2,
  },

  card: {
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 14,
    gap: 12,
    ...colors.shadow.card,
  },

  field: { gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  rowItem: { flex: 1 },
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
  inputMultiline: { height: 96, paddingTop: 10 },

  // 选择器触发行（业主 / 小区）
  selectRow: {
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: { fontSize: 14, color: colors.ink, flex: 1 },
  selectPlaceholder: { fontSize: 14, color: colors.ink3, flex: 1 },
  selectArrow: { fontSize: 18, color: colors.ink3, marginLeft: 8 },
  clearText: { fontSize: 12, color: colors.primary, marginTop: 6 },
  hintText: { fontSize: 12, color: colors.ink3, lineHeight: 18 },

  // 选择器弹层
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: '80%',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  modalClose: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  modalSearch: {
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    fontSize: 14,
    color: colors.ink,
  },
  modalLoading: { paddingVertical: 28, alignItems: 'center' },
  modalEmpty: { paddingVertical: 28, textAlign: 'center', fontSize: 13, color: colors.ink3 },
  modalList: { marginTop: 8 },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 3,
  },
  modalItemTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  modalItemSub: { fontSize: 12, color: colors.ink3 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDelText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  photoHint: { fontSize: 12, color: colors.ink3 },

  saveBtn: {
    marginTop: 28,
    marginHorizontal: 20,
    height: 50,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.primary,
  },
  saveText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
});