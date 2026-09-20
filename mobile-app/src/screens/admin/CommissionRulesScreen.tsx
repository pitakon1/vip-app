/**
 * 佣金设置（管理端独立页）
 * 原型：admin-commission-rules.html
 * 区块：新增设置（规则名 / 交易类型 / 适用对象 / 佣金比例）→ 已有设置列表
 * 适用对象：全体员工 / 部门 / 员工 / 分销商 / 分销商员工（可搜索 + 二级联动）
 * 角色：管理员可选全部层级；分销商管理员仅本渠道 + 本渠道员工
 * 数据源：/commission-rules（列表 + 创建）、/brokers、/employees/directory
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import { commissionRulesApi, brokerApi, employeesApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/i18n';

interface CommissionRule {
  id: string;
  name: string;
  deal_type: string;
  rate: number;
  scope?: string;
  department?: string | null;
  employee_id?: string | null;
  broker_id?: string | null;
  is_active?: boolean;
  [k: string]: any;
}

interface Broker {
  id: string;
  name?: string;
  partner_name?: string;
}

interface Employee {
  id: string;
  name?: string;
  full_name?: string;
  broker_id?: string;
}

const DEAL_TYPE_KEYS = ['new_rental', 'renewal', 'purchase', 'sale'];
const DEAL_TYPE_LABEL_KEY: Record<string, string> = {
  new_rental: 'comm.deal.newRental',
  renewal: 'comm.deal.renewal',
  purchase: 'comm.deal.purchase',
  sale: 'comm.deal.sale',
};
const SCOPE_LABEL_KEY: Record<string, string> = {
  all_employees: 'comm.allEmployees',
  by_department: 'comm.department',
  department: 'comm.department',
  by_employee: 'comm.employee',
  individual: 'comm.employee',
  by_broker: 'comm.broker',
};

interface ScopeOption {
  key: string;
  label: string;
}

function SelectDropdown({
  label,
  value,
  options,
  open,
  onToggle,
  onSelect,
  searchable = false,
}: {
  label: string;
  value: string;
  options: ScopeOption[];
  open: boolean;
  onToggle: () => void;
  onSelect: (key: string) => void;
  searchable?: boolean;
}) {
  const { t } = useI18n();
  const [kw, setKw] = useState('');
  const filtered = kw.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(kw.trim().toLowerCase()))
    : options;
  const current = options.find((o) => o.key === value);
  return (
    <View style={styles.formGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      <TouchableOpacity style={styles.selectBox} onPress={onToggle} activeOpacity={0.7}>
        <Text style={[styles.selectText, !current && styles.selectPlaceholder]} numberOfLines={1}>
          {current ? current.label : `${t('comm.pleaseSelect')}${label}`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
      </TouchableOpacity>
      {open && (
        <View style={styles.selectMenu}>
          {searchable && (
            <TextInput
              style={styles.selectSearch}
              placeholder={t('comm.search')}
              placeholderTextColor={colors.ink3}
              value={kw}
              onChangeText={setKw}
            />
          )}
          {filtered.length === 0 && <Text style={styles.selectEmpty}>{t('comm.noMatch')}</Text>}
          {filtered.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={styles.selectOption}
              onPress={() => {
                setKw('');
                onSelect(o.key);
                onToggle();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.selectOptionText, value === o.key && styles.selectOptionTextActive]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function CommissionRulesScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);

  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [dealType, setDealType] = useState('new_rental');
  const [scope, setScope] = useState('all_employees');
  const [brokerId, setBrokerId] = useState('');
  const [department, setDepartment] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [brokerEmployeeId, setBrokerEmployeeId] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      commissionRulesApi.list({ page: 1, page_size: 100 }),
      brokerApi.list({ page_size: 100 }).catch(() => ({ data: { items: [] } })),
      employeesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: { items: [] } })),
    ]);
    const unwrap = (res: PromiseSettledResult<any>) => {
      if (res.status !== 'fulfilled') return [];
      const d = res.value?.data;
      return Array.isArray(d) ? d : (d?.items ?? []);
    };
    setRules(unwrap(results[0]) as CommissionRule[]);
    setBrokers(unwrap(results[1]));
    const empD = results[2].status === 'fulfilled' ? results[2].value?.data : {};
    setEmployees(Array.isArray(empD) ? empD : (empD?.items ?? []));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  // 分销商管理员无全局规则权限，默认回退到本渠道
  useEffect(() => {
    if (!isAdmin && (scope === 'all_employees' || scope === 'by_department')) {
      setScope('by_broker');
    }
  }, [isAdmin]);

  const addRule = async () => {
    const errs: Record<string, string> = {};
    if (!name || !rate) {
      const msg = t('comm.ruleNameRateRequired');
      if (!name) errs.name = msg;
      if (!rate) errs.rate = msg;
    }
    if (scope === 'by_broker' && isAdmin && !brokerId) errs.brokerId = t('comm.selBroker');
    if (scope === 'by_employee' && isAdmin && !employeeId) errs.employeeId = t('comm.selEmployee');
    if (scope === 'broker_employee') {
      if (!brokerId) errs.brokerId = t('comm.selBrokerFirst');
      if (!brokerEmployeeId) errs.brokerEmployeeId = t('comm.selBrokerEmployee');
    }
    if (scope === 'by_department' && !department) errs.department = t('comm.enterDept');
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    const ruleName = name;
    try {
      const payload: any = {
        name,
        rate: Number(rate),
        deal_type: dealType,
        scope: scope === 'broker_employee' ? 'by_employee' : scope,
        ...(scope === 'by_employee' || scope === 'broker_employee'
          ? { employee_id: scope === 'broker_employee' ? brokerEmployeeId : employeeId }
          : {}),
        ...(scope === 'broker_employee' ? { broker_id: brokerId } : {}),
        ...(scope === 'by_broker' && isAdmin ? { broker_id: brokerId } : {}),
        ...(scope === 'by_department' ? { department } : {}),
      };
      await commissionRulesApi.create(payload);
      setName('');
      setRate('');
      setDealType('new_rental');
      setScope('all_employees');
      setBrokerId('');
      setDepartment('');
      setEmployeeId('');
      setBrokerEmployeeId('');
      await load();
      notify(t('comm.addSuccess'), t('comm.addSuccessMsg').replace('{name}', ruleName));
    } catch (e: any) {
      notifyError(t('comm.addFail'), e);
    }
  };

  const scopeNameOf = (r: CommissionRule) => {
    if (r.scope === 'by_broker') {
      const b = brokers.find((x) => x.id === r.broker_id);
      return (b?.partner_name || b?.name) || r.broker_id || t('comm.broker');
    }
    if (r.scope === 'by_employee') {
      const e = employees.find((x) => x.id === r.employee_id);
      return (e?.full_name || e?.name) || r.employee_id || t('comm.employee');
    }
    if (r.scope === 'by_department' || r.scope === 'department') return r.department || t('comm.department');
    return t(SCOPE_LABEL_KEY[r.scope || ''] || 'comm.allEmployees');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}
    >
      {loading ? (
        <LoadingState label={t('comm.loading')} />
      ) : (
        <>
          {/* 新增设置 */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('comm.addNew')}</Text>
            <Text style={styles.sectionHint}>{t('comm.byLevelHint')}</Text>
          </View>
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>{t('comm.ruleName')}</Text>
            <TextInput
              style={[styles.formInput, formErrors.name ? styles.inputError : null]}
              placeholder={t('comm.ruleNamePlaceholder')}
              placeholderTextColor={colors.ink3}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (formErrors.name) setFormErrors((e) => ({ ...e, name: '' }));
              }}
            />
            {!!formErrors.name && <Text style={styles.errorText}>{formErrors.name}</Text>}
            <Text style={styles.formLabel}>{t('comm.dealType')}</Text>
            <View style={styles.chipRow}>
              {DEAL_TYPE_KEYS.map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, dealType === k && styles.chipActive]}
                  onPress={() => setDealType(k)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, dealType === k && styles.chipTextActive]}>{t(DEAL_TYPE_LABEL_KEY[k])}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {isAdmin ? (
              <SelectDropdown
                label={t('comm.appliedTo')}
                value={scope}
                options={[
                  { key: 'all_employees', label: t('comm.allEmployees') },
                  { key: 'by_department', label: t('comm.department') },
                  { key: 'by_employee', label: t('comm.employee') },
                  { key: 'by_broker', label: t('comm.broker') },
                  { key: 'broker_employee', label: t('comm.brokerEmployee') },
                ]}
                open={scopeOpen}
                onToggle={() => setScopeOpen(!scopeOpen)}
                onSelect={(k) => {
                  setScope(k);
                  setBrokerId('');
                  setDepartment('');
                  setEmployeeId('');
                }}
              />
            ) : (
              <SelectDropdown
                label={t('comm.appliedTo')}
                value={scope}
                options={[
                  { key: 'by_broker', label: t('comm.ourChannel') },
                  { key: 'by_employee', label: t('comm.ourChannelEmployee') },
                ]}
                open={scopeOpen}
                onToggle={() => setScopeOpen(!scopeOpen)}
                onSelect={(k) => {
                  setScope(k);
                  setBrokerId('');
                  setEmployeeId('');
                }}
              />
            )}
            {!isAdmin && (
              <Text style={styles.formHint}>{t('comm.dealerHint')}</Text>
            )}
            {(scope === 'by_broker' || scope === 'broker_employee') && isAdmin && brokers.length > 0 && (
              <SelectDropdown
                label={t('comm.brokerSelectLabel')}
                value={brokerId}
                options={brokers.map((b) => ({ key: b.id, label: b.partner_name || b.name || b.id }))}
                open={brokerOpen}
                onToggle={() => {
                  setBrokerOpen(!brokerOpen);
                  if (brokerOpen) setBrokerEmployeeId('');
                }}
                onSelect={(k) => {
                  setBrokerId(k);
                  if (scope === 'broker_employee') setBrokerEmployeeId('');
                }}
                searchable
              />
            )}
            {(scope === 'by_employee' || scope === 'broker_employee') && employees.length > 0 && (
              <SelectDropdown
                label={
                  scope === 'broker_employee'
                    ? isAdmin
                      ? t('comm.thisBrokerEmployee')
                      : t('comm.ourChannelEmployee')
                    : isAdmin
                      ? t('comm.employee')
                      : t('comm.ourChannelEmployee')
                }
                value={scope === 'broker_employee' ? brokerEmployeeId : employeeId}
                options={(scope === 'broker_employee' && isAdmin && brokerId
                  ? employees.filter((e) => e.broker_id === brokerId)
                  : employees
                ).map((e) => ({ key: e.id, label: e.full_name || e.name || e.id }))}
                open={employeeOpen}
                onToggle={() => setEmployeeOpen(!employeeOpen)}
                onSelect={(k) => {
                  if (scope === 'broker_employee') setBrokerEmployeeId(k);
                  else setEmployeeId(k);
                }}
                searchable
              />
            )}
            {scope === 'by_department' && isAdmin && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('comm.departmentLabel')}</Text>
                <TextInput
                  style={[styles.formInput, formErrors.department ? styles.inputError : null]}
                  placeholder={t('comm.deptPlaceholder')}
                  placeholderTextColor={colors.ink3}
                  value={department}
                  onChangeText={(v) => {
                    setDepartment(v);
                    if (formErrors.department) setFormErrors((e) => ({ ...e, department: '' }));
                  }}
                />
                {!!formErrors.department && <Text style={styles.errorText}>{formErrors.department}</Text>}
              </View>
            )}
            <Text style={styles.formLabel}>{t('comm.rateLabel')}</Text>
            <TextInput
              style={[styles.formInput, formErrors.rate ? styles.inputError : null]}
              placeholder={t('comm.ratePlaceholder')}
              placeholderTextColor={colors.ink3}
              keyboardType="numeric"
              value={rate}
              onChangeText={(v) => {
                setRate(v);
                if (formErrors.rate) setFormErrors((e) => ({ ...e, rate: '' }));
              }}
            />
            {!!formErrors.rate && <Text style={styles.errorText}>{formErrors.rate}</Text>}
            <TouchableOpacity style={styles.submitBtn} onPress={addRule} activeOpacity={0.7}>
              <Text style={styles.submitBtnText}>{t('comm.addNew')}</Text>
            </TouchableOpacity>
          </View>

          {/* 已有设置 */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('comm.existing')}</Text>
            <Text style={styles.sectionHint}>{t('comm.totalCount').replace('{n}', String(rules.length))}</Text>
          </View>
          {rules.length === 0 ? (
            <EmptyState icon="settings-outline" title={t('comm.noRules')} sub={t('comm.noRulesSub')} />
          ) : (
            rules.map((r) => (
              <View key={r.id} style={styles.ruleCard}>
                <View style={styles.ruleHead}>
                  <Text style={styles.ruleName} numberOfLines={1}>{r.name}</Text>
                  <View style={[styles.tag, r.is_active === false ? styles.tagWarning : styles.tagSuccess]}>
                    <Text style={[styles.tagText, r.is_active === false ? styles.tagWarning_text : styles.tagSuccess_text]}>
                      {r.is_active === false ? t('comm.disable') : t('comm.enable')}
                    </Text>
                  </View>
                </View>
                <View style={styles.ruleMeta}>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>{t('comm.type')}</Text>
                    <Text style={styles.ruleMetaValue}>{t(DEAL_TYPE_LABEL_KEY[r.deal_type] || '') || r.deal_type}</Text>
                  </View>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>{t('comm.rateShort')}</Text>
                    <Text style={styles.ruleMetaPrimary}>{r.rate}%</Text>
                  </View>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>{t('comm.appliedTo')}</Text>
                    <Text style={styles.ruleMetaValue} numberOfLines={1}>
                      {scopeNameOf(r)}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

  formCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 18,
    ...colors.shadow.sm,
  },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 8, marginTop: 4 },
  formGroup: { marginBottom: 4 },
  formHint: { fontSize: 11, color: colors.ink3, marginTop: 2, marginBottom: 4 },
  inputError: { borderColor: colors.error },
  errorText: { fontSize: 11, color: colors.error, marginTop: 2 },
  selectBox: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  selectText: { fontSize: 14, color: colors.ink },
  selectPlaceholder: { color: colors.ink3 },
  selectSearch: {
    height: 40,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 13,
    color: colors.ink,
  },
  selectEmpty: { paddingVertical: 12, paddingHorizontal: 14, fontSize: 12, color: colors.ink3 },
  selectMenu: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    overflow: 'hidden',
    marginBottom: 8,
    ...colors.shadow.sm,
  },
  selectOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  selectOptionText: { fontSize: 14, color: colors.ink2 },
  selectOptionTextActive: { color: colors.primary, fontWeight: '700' },
  formInput: {
    height: 44,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink3 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    ...colors.shadow.primary,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  ruleCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 16,
    marginBottom: 10,
    ...colors.shadow.sm,
  },
  ruleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ruleName: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1, marginRight: 8 },
  ruleMeta: { flexDirection: 'row', gap: 12 },
  ruleMetaItem: { flex: 1 },
  ruleMetaLabel: { fontSize: 11, color: colors.ink3, marginBottom: 4 },
  ruleMetaValue: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  ruleMetaPrimary: { fontSize: 15, fontWeight: '800', color: colors.primary },

  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.full },
  tagText: { fontSize: 11, fontWeight: '600' },
  tagWarning: { backgroundColor: `rgba(${colors.warningRgb}, 0.12)` },
  tagSuccess: { backgroundColor: `rgba(${colors.successRgb}, 0.12)` },
  tagWarning_text: { color: colors.warning },
  tagSuccess_text: { color: colors.success },
});