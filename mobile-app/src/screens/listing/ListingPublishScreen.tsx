/**
 * 发布房源（上架单）表单。
 * 业主自主发布 → publisher=owner（owner_id 由后端按当前用户绑定，佣金默认 100%）。
 * 经纪人/员工/管理员代发必须指定「归属业主」owner_id：本页内置业主检索选择器
 * （GET /owners，员工权限），不再把代发挡在门外。
 * 支持两种模式：创建（listingApi.create）与编辑（listingApi.update）。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

type TFunc = (key: string, params?: Record<string, string | number>) => string;

const rentalMonths = (t: TFunc) => [
  { key: '1', label: t('listing.pubMonth1') },
  { key: '1.5', label: t('listing.pubMonth1_5') },
  { key: '2', label: t('listing.pubMonth2') },
  { key: '3', label: t('listing.pubMonth3') },
];
const SALE_RATES = [
  { key: '3', label: '3%' },
  { key: '4', label: '4%' },
  { key: '5', label: '5%' },
  { key: '6', label: '6%' },
];
const typeOptions = (t: TFunc) => [
  { key: 'apartment', label: t('prop.type.apartment') },
  { key: 'condo', label: t('prop.type.condo') },
  { key: 'house', label: t('prop.type.house') },
  { key: 'commercial', label: t('prop.type.commercial') },
  { key: 'office', label: t('prop.type.office') },
];
const CURRENCY_OPTIONS = ['THB', 'USD', 'CNY', 'MYR'];
// 非独家分成档位（客源方:房源方）——带说明
const splitOptions = (t: TFunc): { key: string; label: string; sub: string }[] => [
  { key: 'sp_65_35', label: '65 : 35', sub: t('listing.splitSub1') },
  { key: 'sp_50_50', label: '50 : 50', sub: t('listing.splitSub2') },
  { key: 'sp_30_70', label: '30 : 70', sub: t('listing.splitSub3') },
  { key: 'sp_20_80', label: '20 : 80', sub: t('listing.splitSub4') },
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
  const RENTAL_MONTHS = useMemo(() => rentalMonths(t), [t]);
  const TYPE_OPTIONS = useMemo(() => typeOptions(t), [t]);
  const SPLIT_OPTIONS = useMemo(() => splitOptions(t), [t]);
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
      console.error('[ListingPublish] owner search failed', e);
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
        notifyError(t('listing.loadFailTitle'), e);
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
      notify(t('listing.errOwnerTitle'), t('listing.errOwnerBody'));
      return;
    }
    if (!form.address.trim() || !form.room_number.trim()) {
      notify(t('listing.errIncomplete'), t('listing.errAddressBody'));
      return;
    }
    if (!form.photos.trim()) {
      notify(t('listing.errIncomplete'), t('listing.errPhotosBody'));
      return;
    }
    // 价格校验：租金/售价缺失或非正数后端会 422，先在前端拦住
    if (form.listing_type === 'rent' && !(Number(form.monthly_rent) > 0)) {
      notify(t('listing.errIncomplete'), t('listing.errRentBody'));
      return;
    }
    if (form.listing_type === 'sell' && !(Number(form.asking_price) > 0)) {
      notify(t('listing.errIncomplete'), t('listing.errSellBody'));
      return;
    }
    // 分佣校验
    if (form.mandate_type === 'exclusive') {
      const b = Number(form.buyer_side_rate);
      if (Number.isNaN(b) || b < 70 || b > 100) {
        notify(t('listing.errCommissionTitle'), t('listing.errCommissionBody'));
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
      // 价格字段与后端 CreateListing 对齐：rent 必填 monthly_rent，sell 必填 asking_price
      monthly_rent:
        form.listing_type === 'rent' && form.monthly_rent
          ? Number(form.monthly_rent)
          : undefined,
      asking_price:
        form.listing_type === 'sell' && form.asking_price
          ? Number(form.asking_price)
          : undefined,
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
        notify(t('listing.savedTitle'), t('listing.savedBody'));
      } else {
        await listingApi.create(base);
        notify(t('listing.publishSuccessTitle'), t('listing.publishSuccessBody'));
      }
      navigation.goBack();
    } catch (e: any) {
      notifyError(t('listing.publishFailTitle'), e);
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
      <Text style={styles.headTitle}>{editId ? t('listing.pubEditTitle') : t('listing.pubNewTitle')}</Text>
      <Text style={styles.headSub}>
        {editId
          ? t('listing.pubEditSub')
          : isOwner
            ? t('listing.pubOwnerSub')
            : t('listing.pubAgentSub')}
      </Text>

      {/* 归属业主（代发必选） */}
      {!editId && needsOwnerPick && (
        <>
          <Text style={styles.sectionTitle}>{t('listing.ownerPickLabel')}</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.ownerTrig} activeOpacity={0.7} onPress={openOwnerModal}>
              <Text style={[styles.ownerTrigText, !ownerId && styles.ownerTrigPlaceholder]} numberOfLines={1}>
                {ownerLabel || t('listing.ownerPickPlaceholder')}
              </Text>
              <Text style={styles.ownerTrigArrow}>{t('listing.pick')}</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>{t('listing.ownerPickHint')}</Text>
          </View>
        </>
      )}

      {/* 上架类型 */}
      <Text style={styles.sectionTitle}>{t('listing.listingType')}</Text>
      <View style={styles.card}>
        <View style={styles.chipWrap}>
          <TouchableOpacity style={[styles.chip, isRent && styles.chipActive]} onPress={() => setField('listing_type', 'rent')}>
            <Text style={[styles.chipText, isRent && styles.chipTextActive]}>{t('listing.forRent')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, isSell && styles.chipActive]} onPress={() => setField('listing_type', 'sell')}>
            <Text style={[styles.chipText, isSell && styles.chipTextActive]}>{t('listing.forSale')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 房源信息 */}
      <Text style={styles.sectionTitle}>{t('listing.propInfo')}</Text>
      <View style={styles.card}>
        {field(t('listing.fAddr'), form.address, 'address', { placeholder: t('listing.fAddrPh') })}
        {field(t('listing.fRoomNo'), form.room_number, 'room_number', { placeholder: t('listing.fRoomNoPh') })}
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('listing.fBuilding'), form.building, 'building', { placeholder: t('listing.fBuildingPh') })}</View>
          <View style={styles.rowItem}>{field(t('listing.fFloor'), form.floor, 'floor', { numeric: true, placeholder: t('listing.fFloorPh') })}</View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('prop.type')}</Text>
          {chipRow(TYPE_OPTIONS, form.property_type, (k) => setField('property_type', k))}
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('listing.fSize'), form.size_sqm, 'size_sqm', { numeric: true })}</View>
          <View style={styles.rowItem}>{field(t('listing.fBedrooms'), form.bedrooms, 'bedrooms', { numeric: true })}</View>
          <View style={styles.rowItem}>{field(t('listing.fBathrooms'), form.bathrooms, 'bathrooms', { numeric: true })}</View>
        </View>
        {field(t('listing.fDesc'), form.description, 'description', { multiline: true, placeholder: t('listing.fDescPh') })}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            {field(isRent ? t('listing.fMonthlyRent') : t('listing.fAskingPrice'), isRent ? form.monthly_rent : form.asking_price, isRent ? 'monthly_rent' : 'asking_price', { numeric: true, placeholder: '0' })}
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
        {field(t('listing.fAvailableFrom'), form.available_from, 'available_from', { placeholder: t('listing.fAvailableFromPh') })}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchTitle}>{t('listing.furnished')}</Text>
            <Text style={styles.switchSub}>{t('listing.furnishedSub')}</Text>
          </View>
          <Switch value={form.furnished} onValueChange={(v) => setField('furnished', v)} trackColor={{ false: colors.ink3, true: colors.primary }} thumbColor={colors.surface} />
        </View>
        {field(t('listing.fPhotos'), form.photos, 'photos', { multiline: true, placeholder: 'https://...' })}
      </View>

      {/* 分佣配置 */}
      <Text style={styles.sectionTitle}>{t('listing.commissionCfg')}</Text>
      <View style={styles.card}>
        {isRent ? (
          <View style={styles.field}>
            <Text style={styles.label}>{t('listing.rentCommission')}</Text>
            {chipRow(RENTAL_MONTHS, form.rental_commission_months, (k) => setField('rental_commission_months', k))}
            <Text style={styles.hint}>{t('listing.rentCommissionBase')}</Text>
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={styles.label}>{t('listing.saleCommission')}</Text>
            {chipRow(SALE_RATES, form.sale_commission_rate, (k) => setField('sale_commission_rate', k))}
            <Text style={styles.hint}>{t('listing.saleCommissionBase')}</Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>{t('listing.mandateType')}</Text>
          {chipRow(
            [{ key: 'exclusive', label: t('listing.exclusiveFast') }, { key: 'non_exclusive', label: t('listing.nonExclusive') }],
            form.mandate_type,
            (k) => setField('mandate_type', k as 'exclusive' | 'non_exclusive'),
          )}
        </View>

        {form.mandate_type === 'exclusive' ? (
          <View style={styles.field}>
            <Text style={styles.label}>{t('listing.buyerSideRate')}</Text>
            {field(t('listing.fBuyerSideRate'), form.buyer_side_rate, 'buyer_side_rate', { numeric: true, placeholder: '70' })}
            <Text style={styles.hint}>{t('listing.exclusiveRateHint')}</Text>
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
            <Text style={styles.ownerNoteText}>{t('listing.ownerFullCommission')}</Text>
          </View>
        ) : null}
      </View>

      {/* 业主联系方式 */}
      <Text style={styles.sectionTitle}>{t('listing.ownerContact')}</Text>
      <View style={styles.card}>
        {field(t('listing.fContactName'), form.owner_contact_name, 'owner_contact_name')}
        {field(t('listing.fContactPhone'), form.owner_contact_phone, 'owner_contact_phone', { numeric: true })}
        {field(t('listing.fContactChannel'), form.owner_contact_channel, 'owner_contact_channel', { placeholder: t('listing.fContactChannelPh') })}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchTitle}>{t('listing.contactVisible')}</Text>
            <Text style={styles.switchSub}>{t('listing.contactVisibleSub')}</Text>
          </View>
          <Switch value={form.owner_contact_visible} onValueChange={(v) => setField('owner_contact_visible', v)} trackColor={{ false: colors.ink3, true: colors.primary }} thumbColor={colors.surface} />
        </View>
      </View>

      <TouchableOpacity style={styles.saveBtn} activeOpacity={0.8} onPress={submit} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.saveText}>{editId ? t('listing.saveChanges') : t('listing.submitListing')}</Text>
        )}
      </TouchableOpacity>

      {/* 归属业主选择弹层 */}
      <Modal visible={ownerModal} animationType="slide" transparent onRequestClose={() => setOwnerModal(false)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('listing.pickOwnerTitle')}</Text>
              <TouchableOpacity onPress={() => setOwnerModal(false)}>
                <Text style={styles.modalClose}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              value={ownerKeyword}
              onChangeText={onOwnerKeyword}
              placeholder={t('listing.searchOwnerPh')}
              placeholderTextColor={colors.ink3}
            />
            {ownerLoading && !ownerList.length ? (
              <ActivityIndicator style={styles.modalLoading} color={colors.primary} />
            ) : ownerList.length === 0 ? (
              <Text style={styles.modalEmpty}>{t('listing.ownerNotFound')}</Text>
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
                      {[o.phone, o.email, t('listing.managedCount', { n: o.property_count ?? 0 })].filter(Boolean).join(' · ')}
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