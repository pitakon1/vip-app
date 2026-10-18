/**
 * 新增楼盘（管理端/员工端）
 * 调用 projectsApi.create（ProjectCreate 契约，需 agent/admin 权限，勿向业主/租客暴露入口）。
 * 字段：name/address/city/district/developer/total_units/completion_year/tenure/avg_price/sale_status/open_date。
 * tenure 取值与后端 models.project.Tenure 一致：freehold | leasehold | mixed。
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { notify, notifyError } from '@/utils/feedback';
import { projectsApi } from '@/services/api';
import { useI18n } from '@/i18n';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

const tenureOptions = (t: TFunc): { key: string; label: string }[] => [
  { key: 'freehold', label: t('pj.tenureFreehold') },
  { key: 'leasehold', label: t('pj.tenureLeasehold') },
  { key: 'mixed', label: t('pj.tenureMixed') },
];

const saleStatusOptions = (t: TFunc): { key: string; label: string }[] => [
  { key: 'pre_sale', label: t('pj.salePreSale') },
  { key: 'on_sale', label: t('pj.saleOnSale') },
  { key: 'sold_out', label: t('pj.saleSoldOut') },
];

const normalizeInt = (v: string) => v.replace(/[^\d]/g, '');
const normalizeMoney = (v: string) => v.replace(/[^\d.-]/g, '');

interface ProjectForm {
  name: string;
  address: string;
  city: string;
  district: string;
  developer: string;
  total_units: string;
  completion_year: string;
  tenure: string;
  avg_price: string;
  sale_status: string;
  open_date: string;
}

const emptyForm = (): ProjectForm => ({
  name: '',
  address: '',
  city: '',
  district: '',
  developer: '',
  total_units: '',
  completion_year: '',
  tenure: '',
  avg_price: '',
  sale_status: '',
  open_date: '',
});

export default function ProjectCreateScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const TENURE_OPTIONS = useMemo(() => tenureOptions(t), [t]);
  const SALE_STATUS_OPTIONS = useMemo(() => saleStatusOptions(t), [t]);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProjectForm>(emptyForm);

  const setField = (key: keyof ProjectForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      notify(t('common.hint'), t('pj.nameRequired'));
      return;
    }
    if (!form.address.trim()) {
      notify(t('common.hint'), t('pj.addressRequired'));
      return;
    }
    const payload: any = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim() || undefined,
      district: form.district.trim() || undefined,
      developer: form.developer.trim() || undefined,
      total_units: form.total_units ? Number(form.total_units) : undefined,
      completion_year: form.completion_year ? Number(form.completion_year) : undefined,
      tenure: form.tenure || undefined,
      avg_price: form.avg_price ? Number(form.avg_price) : undefined,
      sale_status: form.sale_status || undefined,
      open_date: form.open_date.trim() || undefined,
    };
    setSaving(true);
    try {
      await projectsApi.create(payload);
      notify(t('pj.savedTitle'), t('pj.savedBody'));
      navigation.goBack();
    } catch (e: any) {
      notifyError(t('pj.failTitle'), e);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, key: keyof ProjectForm, opts?: {
    keyboard?: 'numeric' | 'default' | 'number-pad';
    placeholder?: string;
  }) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(v) =>
          setField(
            key,
            opts?.keyboard === 'numeric'
              ? normalizeMoney(v)
              : opts?.keyboard === 'number-pad'
                ? normalizeInt(v)
                : v,
          )
        }
        keyboardType={opts?.keyboard ?? 'default'}
        placeholder={opts?.placeholder ?? ''}
        placeholderTextColor={colors.ink3}
      />
    </View>
  );

  const chipRow = (list: { key: string; label: string }[], sel: string, onPick: (k: string) => void) => (
    <View style={styles.chipWrap}>
      {list.map((c) => (
        <TouchableOpacity
          key={c.key}
          style={[styles.chip, sel === c.key && styles.chipActive]}
          activeOpacity={0.7}
          // 再次点击已选项即取消
          onPress={() => onPick(sel === c.key ? '' : c.key)}
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
      <Text style={styles.headTitle}>{t('pj.title')}</Text>
      <Text style={styles.headSub}>{t('pj.sub')}</Text>

      {/* 基础信息 */}
      <Text style={styles.sectionTitle}>{t('pj.sectionBasic')}</Text>
      <View style={styles.card}>
        {field(t('pj.name'), form.name, 'name', { placeholder: t('pj.namePh') })}
        {field(t('pj.address'), form.address, 'address', { placeholder: t('pj.addressPh') })}
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('pj.city'), form.city, 'city')}</View>
          <View style={styles.rowItem}>{field(t('pj.district'), form.district, 'district')}</View>
        </View>
        {field(t('pj.developer'), form.developer, 'developer')}
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('pj.totalUnits'), form.total_units, 'total_units', { keyboard: 'number-pad', placeholder: '0' })}</View>
          <View style={styles.rowItem}>{field(t('pj.completionYear'), form.completion_year, 'completion_year', { keyboard: 'number-pad', placeholder: '2026' })}</View>
        </View>
      </View>

      {/* 销售信息 */}
      <Text style={styles.sectionTitle}>{t('pj.sectionSale')}</Text>
      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('pj.tenure')}</Text>
          {chipRow(TENURE_OPTIONS, form.tenure, (k) => setField('tenure', k))}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('pj.saleStatus')}</Text>
          {chipRow(SALE_STATUS_OPTIONS, form.sale_status, (k) => setField('sale_status', k))}
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{field(t('pj.avgPrice'), form.avg_price, 'avg_price', { keyboard: 'numeric', placeholder: '0' })}</View>
          <View style={styles.rowItem}>{field(t('pj.openDate'), form.open_date, 'open_date', { placeholder: t('pj.openDatePh') })}</View>
        </View>
      </View>

      <TouchableOpacity style={styles.saveBtn} activeOpacity={0.8} onPress={submit} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.saveText}>{t('pj.submit')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },

  headTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: 18, marginHorizontal: 20, letterSpacing: -0.4 },
  headSub: { fontSize: 13, color: colors.ink3, marginHorizontal: 20, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.ink2, marginHorizontal: 20, marginTop: 22, marginBottom: 8, letterSpacing: -0.2 },

  card: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 14, gap: 12, ...colors.shadow.card },
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

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: colors.radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },

  saveBtn: { marginTop: 28, marginHorizontal: 20, height: 50, borderRadius: colors.radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...colors.shadow.primary },
  saveText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
});
