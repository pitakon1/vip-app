/**
 * 房源编辑（管理端）
 * 区块：顶部标题「编辑房源」→ 基础信息 → 租态 → 房源描述 → 带家具 → 照片 → 底部保存
 * 数据源：PATCH /properties/{id}（普通编辑字段）、POST /properties/{id}/photos（上传）、DELETE /properties/{id}/photos?url=（删除）
 * 进入方式：
 *   - 传 route.params.id：打开时先 GET /properties/{id} 拉取初值。
 *   - 传 route.params.initial（完整 Property 对象）：直接作为初值，不额外请求。
 * 说明：房源无独立上架/下架，删除即下架，故不处理 listing_status。
 */
import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import { propertiesApi } from '@/services/api';

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
}

const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: 'vacant', label: '空置中' },
  { key: 'rented', label: '已出租' },
  { key: 'renewing', label: '续约中' },
  { key: 'maintenance', label: '维护中' },
];

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
  { key: 'MYR', label: 'MYR' },
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

export default function PropertyEditScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const paramId: string | undefined = route?.params?.id;
  const initialData: any = route?.params?.initial;
  const currentId: string | undefined = paramId ?? initialData?.id;

  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
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
    });
    setPhotos(normalizePhotos(data.photos));
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
        if (!cancelled) notifyError('加载失败', e);
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

  const onSave = async () => {
    if (!currentId) {
      notifyError('无法保存', { message: '缺少房源 ID' });
      return;
    }
    const payload = {
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
      photos,
    };
    setSaving(true);
    try {
      await propertiesApi.update(currentId, payload);
      navigation.goBack();
    } catch (e: any) {
      notifyError('保存失败', e);
    } finally {
      setSaving(false);
    }
  };

  const pickAndUpload = async () => {
    if (!currentId) {
      notifyError('无法上传', { message: '缺少房源 ID，请先保存房源' });
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
      notifyError('无法打开相册', { message: '请检查相册权限后重试' });
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
      const up: any = await propertiesApi.uploadPhotos(currentId, files as any[]);
      const d = up?.data ?? {};
      if (Array.isArray(d.photos)) setPhotos(d.photos as string[]);
      else setPhotos((prev) => [...prev, ...picked.map((a) => a.uri)]);
      notify('上传成功', '照片已添加到房源');
    } catch (e: any) {
      notifyError('上传失败', e);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async (url: string) => {
    if (!currentId || photoBusy) return;
    setPhotoBusy(true);
    try {
      const del: any = await propertiesApi.deletePhoto(currentId, url);
      const d = del?.data ?? {};
      if (Array.isArray(d.photos)) setPhotos(d.photos as string[]);
      else setPhotos((prev) => prev.filter((p) => p !== url));
    } catch (e: any) {
      notifyError('删除失败', e);
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
      <Text style={styles.headTitle}>编辑房源</Text>
      <Text style={styles.headSub}>修改房源信息，保存后生效</Text>

      {/* 基础信息 */}
      <Text style={styles.sectionTitle}>基础信息</Text>
      <View style={styles.card}>
        {field('房号/名称', form.room_number, 'room_number', { placeholder: '如 A-101 或 曼谷 Asok 1 栋' })}
        <View style={styles.row}>
          <View style={styles.rowItem}>{field('月租', form.monthly_rent, 'monthly_rent', { keyboard: 'numeric', placeholder: '0' })}</View>
          <View style={styles.rowItem}>{field('押金', form.deposit_amount, 'deposit_amount', { keyboard: 'numeric', placeholder: '0' })}</View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{field('押金月数', form.deposit_months, 'deposit_months', { keyboard: 'number-pad', placeholder: '1' })}</View>
          <View style={styles.rowItem}>{field('面积(㎡)', form.size_sqm, 'size_sqm', { keyboard: 'numeric', placeholder: '0' })}</View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{field('卧室数', form.bedrooms, 'bedrooms', { keyboard: 'number-pad', placeholder: '1' })}</View>
          <View style={styles.rowItem}>{field('卫浴数', form.bathrooms, 'bathrooms', { keyboard: 'number-pad', placeholder: '1' })}</View>
        </View>
        {field('地址', form.address, 'address', { placeholder: '详细地址，如素坤逸 24 巷' })}
        <View style={styles.row}>
          <View style={styles.rowItem}>{field('楼栋', form.building, 'building', { placeholder: '如 A 栋' })}</View>
          <View style={styles.rowItem}>{field('楼层', form.floor, 'floor', { keyboard: 'number-pad', placeholder: '如 12' })}</View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>房源类型</Text>
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
          <Text style={styles.label}>币种</Text>
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

        {field('可入住日期', form.available_from, 'available_from', { placeholder: 'YYYY-MM-DD，如 2026-10-01' })}
      </View>

      {/* 租态 */}
      <Text style={styles.sectionTitle}>租态</Text>
      <View style={styles.card}>
        <Text style={styles.label}>当前状态</Text>
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
      <Text style={styles.sectionTitle}>房源描述</Text>
      <View style={styles.card}>
        {field('描述', form.description, 'description', { multiline: true, placeholder: '周边配套、交通、特色等' })}
      </View>

      {/* 带家具 */}
      <Text style={styles.sectionTitle}>设施</Text>
      <View style={styles.card}>
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
      </View>

      {/* 照片 */}
      <Text style={styles.sectionTitle}>房源照片</Text>
      <View style={styles.card}>
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
                  accessibilityRole="button"
                  accessibilityLabel="删除本张照片"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.photoDelText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.photoHint}>暂无照片，点击上方按钮上传</Text>
        )}
      </View>

      {/* 保存 */}
      <TouchableOpacity style={styles.saveBtn} activeOpacity={0.8} onPress={onSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.saveText}>保存</Text>
        )}
      </TouchableOpacity>
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