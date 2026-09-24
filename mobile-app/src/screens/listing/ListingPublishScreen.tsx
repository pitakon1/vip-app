/**
 * 发布房源（上架单）表单。
 * 业主自主发布 → publisher=owner（owner_id 由后端按当前用户绑定，佣金默认 100%）。
 * 经纪人/员工/管理员代发必须指定「归属业主」owner_id：本页内置业主检索选择器
 * （GET /owners，员工权限），不再把代发挡在门外。
 * 支持两种模式：创建（listingApi.create）与编辑（listingApi.update）。
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { notify, notifyError } from '@/utils/feedback';
import { listingApi, ownersApi } from '@/services/api';
import { useI18n } from '@/i18n';
import { useAuthStore } from '@/stores/auth';

const RENTAL_MONTHS = [
  { key: '1', label: '1 个月' },
  { key: '1.5', label: '1.5 个月' },
  { key: '2', label: '2 个月' },
  { key: '3', label: '3 个月' },
];
const SALE_RATES = [
  { key: '3', label: '3%' },
  { key: '4', label: '4%' },
  { key: '5', label: '5%' },
  { key: '6', label: '6%' },
];
const TYPE_OPTIONS = [
  { key: 'apartment', label: '公寓' },
  { key: 'condo', label: '康都' },
  { key: 'house', label: '别墅' },
  { key: 'commercial', label: '商铺' },
  { key: 'office', label: '写字楼' },
];
const CURRENCY_OPTIONS = ['THB', 'USD', 'CNY', 'MYR'];
// 非独家分成档位（客源方:房源方）——带说明
const SPLIT_OPTIONS: { key: string; label: string; sub: string }[] = [
  { key: 'sp_65_35', label: '65 : 35', sub: '客源占多，适合快速带客成交' },
  { key: 'sp_50_50', label: '50 : 50', sub: '对半分成，合作均衡' },
  { key: 'sp_30_70', label: '30 : 70', sub: '房源方占多，客源比例低' },
  { key: 'sp_20_80', label: '20 : 80', sub: '房源方大幅占多' },
];

const normalizeMoney = (v: string) => v.replace(/[^\d.-]/g, '');

interface FormState {
  listing_type: 'rent' | 'sell';
  address: string;
  room_number: string;
  building: string;
  floor: string;
  property_type: string;
  size_sqm: string;
  bedrooms: string;
  bathrooms: string;
  description: string;
  monthly_rent: string;
  asking_price: string;
  currency: string;
  furnished: boolean;
  available_from: string;
  photos: string;
  rental_commission_months: string;
  sale_commission_rate: string;
  mandate_type: 'exclusive' | 'non_exclusive';
  buyer_side_rate: string;
  split_option: string;
  owner_contact_name: string;
  owner_contact_phone: string;
  owner_contact_channel: string;
  owner_contact_visible: boolean;
}

const emptyForm = (): FormState => ({
  listing_type: 'rent',
  address: '',
  room_number: '',
  building: '',
  floor: '',
  property_type: 'apartment',
  size_sqm: '',
  bedrooms: '',
  bathrooms: '',
  description: '',
  monthly_rent: '',
  asking_price: '',
  currency: 'THB',
  furnished: false,
  available_from: '',
  photos: '',
  rental_commission_months: '1',
  sale_commission_rate: '3',
  mandate_type: 'non_exclusive',
  buyer_side_rate: '70',
  split_option: 'sp_65_35',
  owner_contact_name: '',
  owner_contact_phone: '',
  owner_contact_channel: '',
  owner_contact_visible: false,
});

export default function ListingPublishScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  // 编辑模式：route.params.id（拉取既有上架单）
  const editId: string | undefined = route?.params?.id;

  const isOwner = user?.role === 'owner';
  // 非业主本号发布（经纪人/员工/管理员代发）必须选「归属业主」，后端强制 owner_id
  const needsOwnerPick = !isOwner;

  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  // 归属业主选择器（代发用）
  const [ownerId, setOwnerId] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [ownerModal, setOwnerModal] = useState(false);
  const [ownerKeyword, setOwnerKeyword] = useState('');
  const [ownerList, setOwnerList] = useState<any[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const ownerTimer = useRef<any>(null);

  const loadOwners = async (kw: string) => {
    setOwnerLoading(true);
    try {
      const res: any = await ownersApi.list({
        keyword: kw || undefined,
        page_size: 50,
      });
      const payload = res?.data ?? {};
      setOwnerList(Array.isArray(payload.items) ? payload.items : []);
    } catch (e: any) {
      console.error('[ListingPublish] 业主检索失败', e);
      setOwnerList([]);
    } finally {
      setOwnerLoading(false);
    }
  };

  useEffect(() => () => {
    if (ownerTimer.current) clearTimeout(ownerTimer.current);
  }, []);

  const onOwnerKeyword = (v: string) => {
    setOwnerKeyword(v);
    if (ownerTimer.current) clearTimeout(ownerTimer.current);
    ownerTimer.current = setTimeout(() => loadOwners(v), 300);
  };

  const openOwnerModal = () => {
    setOwnerModal(true);
    if (!ownerList.length) loadOwners(ownerKeyword);
  };

  const pickOwner = (o: any) => {
    setOwnerId(o.id);
    setOwnerLabel(`${o.name || o.email || o.id}${o.phone ? ` · ${o.phone}` : ''}`);
    setOwnerModal(false);
  };

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      try {
        const res: any = await listingApi.get(editId);
        if (!alive) return;
        const d = res?.data ?? {};
        setForm({
          ...emptyForm(),
          listing_type: d.listing_type === 'sell' ? 'sell' : 'rent',
          address: d.address ?? '',
          room_number: d.room_number ?? '',
          property_type: d.property_type ?? 'apartment',
          currency: d.currency ?? 'THB',
          furnished: !!d.furnished,
          available_from: d.available_from ? String(d.available_from).slice(0, 10) : '',
          photos: Array.isArray(d.photos) ? d.photos.join('\n') : '',
          rental_commission_months:
            d.rental_commission_months != null ? String(d.rental_commission_months) : '1',
          sale_commission_rate:
            d.sale_commission_rate != null ? String(d.sale_commission_rate) : '3',
          mandate_type: d.mandate_type === 'exclusive' ? 'exclusive' : 'non_exclusive',
          buyer_side_rate: d.buyer_side_rate != null ? String(d.buyer_side_rate) : '70',
          split_option: d.split_option ?? 'sp_65_35',
          owner_contact_name: d.owner_contact_name ?? '',
          owner_contact_phone: d.owner_contact_phone ?? '',
          owner_contact_channel: d.owner_contact_channel ?? '',
          owner_contact_visible: !!d.owner_contact_visible,
        });
      } catch (e: any) {
        notifyError('加载失败', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [editId]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!editId && needsOwnerPick && !ownerId) {
      notify('请选择归属业主', '员工/经纪人代业主发布时必须指定业主归属');
      return;
    }
    if (!form.address.trim() || !form.room_number.trim()) {
      notify('请完善信息', '地址与房号/名称为必填');
      return;
    }
    if (!form.photos.trim()) {
      notify('请完善信息', '请至少填写一行图片 URL');
      return;
    }
    // 分佣校验
    if (form.mandate_type === 'exclusive') {
      const b = Number(form.buyer_side_rate);
      if (Number.isNaN(b) || b < 70 || b > 100) {
        notify('分佣配置有误', '独家/快速成交：客源方可分比例须在 70%-100%');
        return;
      }
    }

    const base = {
      listing_type: form.listing_type,
      address: form.address.trim(),
      room_number: form.room_number.trim().slice(0, 200),
      building: form.building.trim() || undefined,
      floor: form.floor ? Number(form.floor) : undefined,
      property_type: form.property_type,
      size_sqm: form.size_sqm ? Number(form.size_sqm) : undefined,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      description: form.description.trim() || undefined,
      furnished: form.furnished,
      available_from: form.available_from.trim() || undefined,
      currency: form.currency,
      photos: form.photos
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      sale_commission_rate:
        form.listing_type === 'sell' && form.sale_commission_rate
          ? Number(form.sale_commission_rate)
          : undefined,
      rental_commission_months:
        form.listing_type === 'rent' && form.rental_commission_months
          ? Number(form.rental_commission_months)
          : undefined,
      mandate_type: form.mandate_type,
      split_option:
        form.mandate_type === 'non_exclusive' ? form.split_option : undefined,
      buyer_side_rate:
        form.mandate_type === 'exclusive' ? Number(form.buyer_side_rate) : undefined,
      owner_contact_name: form.owner_contact_name.trim() || undefined,
      owner_contact_phone: form.owner_contact_phone.trim() || undefined,
      owner_contact_channel: form.owner_contact_channel.trim() || undefined,
      owner_contact_visible: form.owner_contact_visible,
      // 代发时必须带上归属业主（后端返回 Owner.id，非 User.id）
      owner_id: !editId && needsOwnerPick && ownerId ? ownerId : undefined,
    };

    setSaving(true);
    try {
      if (editId) {
        await listingApi.update(editId, base);
        notify('已保存', '上架单信息已更新');
      } else {
        await listingApi.create(base);
        notify('发布成功', '上架单已提交，请等待平台审核');
      }
      navigation.goBack();
    } catch (e: any) {
      notifyError('发布失败', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // 非业主本号、且非编辑 → 需要先选归属业主（见页内选择器），不再直接挡住整页

  const isRent = form.listing_type === 'rent';
  const isSell = !isRent;

  const field = (label: string, val: string, key: keyof FormState, opts?: {
    numeric?: boolean; placeholder?: string; multiline?: boolean;
  }) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, opts?.multiline && styles.inputMultiline]}
        value={val}
        onChangeText={(v) => setField(key, opts?.numeric ? normalizeMoney(v) : v)}
        keyboardType={opts?.numeric ? 'numeric' : 'default'}
        placeholder={opts?.placeholder ?? ''}
        placeholderTextColor={colors.ink3}
        multiline={opts?.multiline}
        textAlignVertical={opts?.multiline ? 'top' : 'center'}
      />
    </View>
  );

  const chipRow = <K extends string>(list: { key: string; label: string }[], sel: K, onPick: (k: string) => void) => (
    <View style={styles.chipWrap}>
      {list.map((c) => (
        <TouchableOpacity
          key={c.key}
          style={[styles.chip, sel === c.key && styles.chipActive]}
          activeOpacity={0.7}
          onPress={() => onPick(c.key)}
        >
          <Text style={[styles.chipText, sel === c.key && styles.chipTextActive]}>{c.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headTitle}>{editId ? '编辑上架单' : '发布房源'}</Text>
      <Text style={styles.headSub}>
        {editId
          ? '编辑上架单信息'
          : isOwner
            ? '业主本号发布，佣金 100% 归您'
            : '员工代业主发布，需指定归属业主'}
      </Text>

      {/* 归属业主（代发必选） */}
      {!editId && needsOwnerPick && (
        <>
          <Text style={styles.sectionTitle}>归属业主 *</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.ownerTrig} activeOpacity={0.7} onPress={openOwnerModal}>
              <Text style={[styles.ownerTrigText, !ownerId && styles.ownerTrigPlaceholder]} numberOfLines={1}>
                {ownerLabel || '搜索并选择业主（姓名 / 手机 / 邮箱）'}
              </Text>
              <Text style={styles.ownerTrigArrow}>选择</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>房源将挂在该业主名下；业主自主发布由系统自动绑定</Text>
          </View>
        </>
      )}

      {/* 上架类型 */}
      <Text style={styles.sectionTitle}>上架类型</Text>
      <View style={styles.card}>
        <View style={styles.chipWrap}>
          <TouchableOpacity style={[styles.chip, isRent && styles.chipActive]} onPress={() => setField('listing_type', 'rent')}>
            <Text style={[styles.chipText, isRent && styles.chipTextActive]}>出租</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, isSell && styles.chipActive]} onPress={() => setField('listing_type', 'sell')}>
            <Text style={[styles.chipText, isSell && styles.chipTextActive]}>出售</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 房源信息 */}
      <Text style={styles.sectionTitle}>房源信息</Text>
      <View style={styles.card}>
        {field('地址（必填）', form.address, 'address', { placeholder: '详细地址，如曼谷素坤逸 24 巷' })}
        {field('房号/名称（必填）', form.room_number, 'room_number', { placeholder: '如 A-101' })}
        <View style={styles.row}>
          <View style={styles.rowItem}>{field('楼栋', form.building, 'building', { placeholder: '如 A 栋' })}</View>
          <View style={styles.rowItem}>{field('楼层', form.floor, 'floor', { numeric: true, placeholder: '如 12' })}</View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('prop.type')}</Text>
          {chipRow(TYPE_OPTIONS, form.property_type, (k) => setField('property_type', k))}
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{field('面积(㎡)', form.size_sqm, 'size_sqm', { numeric: true })}</View>
          <View style={styles.rowItem}>{field('卧室数', form.bedrooms, 'bedrooms', { numeric: true })}</View>
          <View style={styles.rowItem}>{field('卫浴数', form.bathrooms, 'bathrooms', { numeric: true })}</View>
        </View>
        {field('描述', form.description, 'description', { multiline: true, placeholder: '周边配套、交通、特色等' })}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            {field(isRent ? '月租（必填）' : '售价/总价（必填）', isRent ? form.monthly_rent : form.asking_price, isRent ? 'monthly_rent' : 'asking_price', { numeric: true, placeholder: '0' })}
          </View>
          <View style={styles.rowItem}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('prop.currency')}</Text>
              <View style={styles.chipWrap}>
                {CURRENCY_OPTIONS.map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, form.currency === c && styles.chipActive]} onPress={() => setField('currency', c)}>
                    <Text style={[styles.chipText, form.currency === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
        {field('可入住/可交易日期', form.available_from, 'available_from', { placeholder: 'YYYY-MM-DD 如 2026-10-01' })}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchTitle}>带家具</Text>
            <Text style={styles.switchSub}>是否提供家具（精装）</Text>
          </View>
          <Switch value={form.furnished} onValueChange={(v) => setField('furnished', v)} trackColor={{ false: colors.ink3, true: colors.primary }} thumbColor={colors.surface} />
        </View>
        {field('图片 URL（每行一个）', form.photos, 'photos', { multiline: true, placeholder: 'https://...' })}
      </View>

      {/* 分佣配置 */}
      <Text style={styles.sectionTitle}>分佣配置</Text>
      <View style={styles.card}>
        {isRent ? (
          <View style={styles.field}>
            <Text style={styles.label}>{t('listing.rentCommission')}</Text>
            {chipRow(RENTAL_MONTHS, form.rental_commission_months, (k) => setField('rental_commission_months', k))}
            <Text style={styles.hint}>以月租金为基数收取佣金</Text>
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={styles.label}>{t('listing.saleCommission')}</Text>
            {chipRow(SALE_RATES, form.sale_commission_rate, (k) => setField('sale_commission_rate', k))}
            <Text style={styles.hint}>以成交总价为基数，按比例收取</Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>{t('listing.mandateType')}</Text>
          {chipRow(
            [{ key: 'exclusive', label: '独家/快速成交' }, { key: 'non_exclusive', label: '非独家' }],
            form.mandate_type,
            (k) => setField('mandate_type', k as 'exclusive' | 'non_exclusive'),
          )}
        </View>

        {form.mandate_type === 'exclusive' ? (
          <View style={styles.field}>
            <Text style={styles.label}>{t('listing.buyerSideRate')}</Text>
            {field('客源方可分比例', form.buyer_side_rate, 'buyer_side_rate', { numeric: true, placeholder: '70' })}
            <Text style={styles.hint}>独家/快速成交：客源方 70-100%，剩余归房源方</Text>
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={styles.label}>{t('listing.splitTiers')}</Text>
            <View style={styles.chipWrap}>
              {SPLIT_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, form.split_option === s.key && styles.chipActive]}
                  activeOpacity={0.7}
                  onPress={() => setField('split_option', s.key)}
                >
                  <Text style={[styles.chipText, form.split_option === s.key && styles.chipTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>{SPLIT_OPTIONS.find((s) => s.key === form.split_option)?.sub}</Text>
          </View>
        )}

        {isOwner ? (
          <View style={styles.ownerNote}>
            <Text style={styles.ownerNoteText}>业主自主发布，佣金 100% 归您</Text>
          </View>
        ) : null}
      </View>

      {/* 业主联系方式 */}
      <Text style={styles.sectionTitle}>业主联系方式</Text>
      <View style={styles.card}>
        {field('联系人', form.owner_contact_name, 'owner_contact_name')}
        {field('联系电话', form.owner_contact_phone, 'owner_contact_phone', { numeric: true })}
        {field('联系渠道', form.owner_contact_channel, 'owner_contact_channel', { placeholder: '如微信 / Line / 邮箱' })}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchTitle}>公开展示联系方式</Text>
            <Text style={styles.switchSub}>关闭则仅平台与您可见，不向下游客源方公开</Text>
          </View>
          <Switch value={form.owner_contact_visible} onValueChange={(v) => setField('owner_contact_visible', v)} trackColor={{ false: colors.ink3, true: colors.primary }} thumbColor={colors.surface} />
        </View>
      </View>

      <TouchableOpacity style={styles.saveBtn} activeOpacity={0.8} onPress={submit} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.saveText}>{editId ? '保存修改' : '提交上架'}</Text>
        )}
      </TouchableOpacity>

      {/* 归属业主选择弹层 */}
      <Modal visible={ownerModal} animationType="slide" transparent onRequestClose={() => setOwnerModal(false)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>选择归属业主</Text>
              <TouchableOpacity onPress={() => setOwnerModal(false)}>
                <Text style={styles.modalClose}>关闭</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              value={ownerKeyword}
              onChangeText={onOwnerKeyword}
              placeholder="搜索业主姓名 / 手机 / 邮箱"
              placeholderTextColor={colors.ink3}
            />
            {ownerLoading && !ownerList.length ? (
              <ActivityIndicator style={styles.modalLoading} color={colors.primary} />
            ) : ownerList.length === 0 ? (
              <Text style={styles.modalEmpty}>未找到匹配的业主</Text>
            ) : (
              <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
                {ownerList.map((o: any) => (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.ownerItem, ownerId === o.id && styles.ownerItemActive]}
                    activeOpacity={0.7}
                    onPress={() => pickOwner(o)}
                  >
                    <Text style={styles.ownerItemName}>{o.name || o.email || o.id}</Text>
                    <Text style={styles.ownerItemMeta}>
                      {[o.phone, o.email, `在管 ${o.property_count ?? 0} 套`].filter(Boolean).join(' · ')}
                    </Text>
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

  headTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: 18, marginHorizontal: 20, letterSpacing: -0.4 },
  headSub: { fontSize: 13, color: colors.ink3, marginHorizontal: 20, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.ink2, marginHorizontal: 20, marginTop: 22, marginBottom: 8, letterSpacing: -0.2 },

  card: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 14, gap: 12, ...colors.shadow.card },
  field: { gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  rowItem: { flex: 1 },
  label: { fontSize: 12, color: colors.ink3 },
  hint: { fontSize: 12, color: colors.ink3, marginTop: 2 },
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
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: colors.radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchInfo: { flex: 1, paddingRight: 12 },
  switchTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  switchSub: { fontSize: 12, color: colors.ink3, marginTop: 3 },

  ownerNote: { backgroundColor: colors.successLight, borderRadius: colors.radius.md, padding: 12 },
  ownerNoteText: { fontSize: 13, color: colors.success, fontWeight: '600' },

  saveBtn: { marginTop: 28, marginHorizontal: 20, height: 50, borderRadius: colors.radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...colors.shadow.primary },
  saveText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },

  // 归属业主（代发）选择器
  ownerTrig: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius.md, backgroundColor: colors.surface },
  ownerTrigText: { flex: 1, fontSize: 14, color: colors.ink, marginRight: 10 },
  ownerTrigPlaceholder: { color: colors.ink3 },
  ownerTrigArrow: { fontSize: 13, fontWeight: '700', color: colors.primary },

  modalMask: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: colors.radius.xl, borderTopRightRadius: colors.radius.xl, padding: 16, maxHeight: '78%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  modalClose: { fontSize: 14, color: colors.ink3 },
  modalSearch: { height: 42, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius.md, backgroundColor: colors.surface2, fontSize: 14, color: colors.ink },
  modalLoading: { marginTop: 28, marginBottom: 16 },
  modalEmpty: { textAlign: 'center', fontSize: 13, color: colors.ink3, paddingVertical: 36 },
  modalList: { marginTop: 10 },
  ownerItem: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  ownerItemActive: { backgroundColor: colors.surface2, borderRadius: colors.radius.md },
  ownerItemName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  ownerItemMeta: { fontSize: 12, color: colors.ink3, marginTop: 3 },
});