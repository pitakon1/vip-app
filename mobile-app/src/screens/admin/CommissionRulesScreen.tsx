import { OPTION_PAGE_SIZE } from '@/lib/pagination';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import ListState from '@/components/ListState';
import { notify, notifyError } from '@/utils/feedback';
import { commissionRulesApi, brokerApi, employeesApi, partnersAdminApi } from '@/services/api';
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

interface Partner {
  id: string;
  name?: string;
  partner_name?: string;
}

// 成交类型必须与后端 DealType 对齐（new_rental / renewal / management）。
// 此前用 purchase / sale，创建规则直接 422。
const DEAL_TYPE_KEYS = ['new_rental', 'renewal', 'management'];
const DEAL_TYPE_LABEL_KEY: Record<string, string> = {
  new_rental: 'comm.deal.newRental',
  renewal: 'comm.deal.renewal',
};
// management 文案未进 i18n 词表（该文件由产品维护，避免冲突），本地兜底三语
const DEAL_TYPE_FALLBACK: Record<string, Record<string, string>> = {
  management: { zh: '托管', en: 'Management', th: 'จัดการ' },
};
const SCOPE_LABEL_KEY: Record<string, string> = {
  all_employees: 'comm.allEmployees',
  by_department: 'comm.department',
  department: 'comm.department',
  by_employee: 'comm.employee',
  individual: 'comm.employee',
  by_broker: 'comm.broker',
};
// 后端 scope 枚举含 by_partner（按合作公司），App 此前既不显示也认不出
const SCOPE_FALLBACK: Record<string, Record<string, string>> = {
  by_partner: { zh: '合作公司', en: 'Partner company', th: 'บริษัทพาร์ทเนอร์' },
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
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const dealTypeLabel = (key: string) =>
    DEAL_TYPE_LABEL_KEY[key] ? t(DEAL_TYPE_LABEL_KEY[key]) : DEAL_TYPE_FALLBACK[key]?.[lang] ?? key;
  const scopeLabel = (key: string) =>
    SCOPE_LABEL_KEY[key] ? t(SCOPE_LABEL_KEY[key]) : SCOPE_FALLBACK[key]?.[lang] ?? key;

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);

  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [dealType, setDealType] = useState('new_rental');
  const [scope, setScope] = useState('all_employees');
  const [brokerId, setBrokerId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [department, setDepartment] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [brokerEmployeeId, setBrokerEmployeeId] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // 分页读取：此前只拉第一页（100 条）并把当前页长度当总数，规则超过一页就看不全。
  const load = useCallback(
    async (targetPage = 1, append = false) => {
      setLoadError(null);
      const results = await Promise.allSettled([
        commissionRulesApi.list({ page: targetPage, page_size: OPTION_PAGE_SIZE }),
        brokerApi.list({ page_size: OPTION_PAGE_SIZE }).catch(() => ({ data: { items: [] } })),
        employeesApi.list({ page: 1, page_size: OPTION_PAGE_SIZE }).catch(() => ({ data: { items: [] } })),
        partnersAdminApi.list({ page_size: OPTION_PAGE_SIZE }).catch(() => ({ data: { items: [] } })),
      ]);
      const unwrap = (res: PromiseSettledResult<any>) => {
        if (res.status !== 'fulfilled') return [];
        const d = res.value?.data;
        return Array.isArray(d) ? d : (d?.items ?? []);
      };
      if (results[0].status === 'fulfilled') {
        const d = results[0].value?.data;
        const items = unwrap(results[0]) as CommissionRule[];
        const serverTotal = Array.isArray(d) ? items.length : Number(d?.total ?? items.length);
        setRules((prev) => {
          if (!append) return items;
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...items.filter((r) => !seen.has(r.id))];
        });
        setTotal(serverTotal);
        setPage(targetPage);
      } else {
        setLoadError(t('comm.loadFailed'));
      }
      setBrokers(unwrap(results[1]));
      const empD = results[2].status === 'fulfilled' ? results[2].value?.data : {};
      setEmployees(Array.isArray(empD) ? empD : (empD?.items ?? []));
      setPartners(unwrap(results[3]));
    },
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      load(1, false).finally(() => setLoading(false));
    }, [load]),
  );

  const loadMore = () => {
    if (loadingMore || rules.length >= total) return;
    setLoadingMore(true);
    load(page + 1, true).finally(() => setLoadingMore(false));
  };

  // 分销商管理员无全局规则权限，默认回退到本渠道
  useEffect(() => {
    if (!isAdmin && (scope === 'all_employees' || scope === 'by_department')) {
      setScope('by_broker');
    }
  }, [isAdmin]);

  const resetForm = () => {
    setName('');
    setRate('');
    setDealType('new_rental');
    setScope(isAdmin ? 'all_employees' : 'by_broker');
    setBrokerId('');
    setPartnerId('');
    setDepartment('');
    setEmployeeId('');
    setBrokerEmployeeId('');
    setEditingId(null);
    setFormErrors({});
  };

  const beginEdit = (r: CommissionRule) => {
    setEditingId(r.id);
    setName(r.name ?? '');
    setRate(String(r.rate ?? ''));
    setDealType(r.deal_type ?? 'new_rental');
    setScope(r.scope ?? (isAdmin ? 'all_employees' : 'by_broker'));
    setBrokerId(r.broker_id ?? '');
    setPartnerId(r.partner_id ?? '');
    setDepartment(r.department ?? '');
    setEmployeeId(r.employee_id ?? '');
    setBrokerEmployeeId('');
    setFormErrors({});
  };

  const toggleActive = async (r: CommissionRule) => {
    if (togglingId) return;
    setTogglingId(r.id);
    try {
      await commissionRulesApi.update(r.id, { is_active: r.is_active === false });
      await load(1, false);
      notify(
        r.is_active === false ? t('comm.enable') : t('comm.disable'),
        r.name,
      );
    } catch (e: any) {
      notifyError(t('comm.addFail'), e);
    } finally {
      setTogglingId(null);
    }
  };

  const submitRule = async () => {
    const errs: Record<string, string> = {};
    if (!name || !rate) {
      const msg = t('comm.ruleNameRateRequired');
      if (!name) errs.name = msg;
      if (!rate) errs.rate = msg;
    }
    if (scope === 'by_broker' && isAdmin && !brokerId) errs.brokerId = t('comm.selBroker');
    if (scope === 'by_partner' && isAdmin && !partnerId) {
      errs.partnerId = `${t('comm.pleaseSelect')}${scopeLabel('by_partner')}`;
    }
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
        ...(scope === 'by_partner' && isAdmin ? { partner_id: partnerId } : {}),
        ...(scope === 'by_department' ? { department } : {}),
      };
      if (editingId) {
        await commissionRulesApi.update(editingId, payload);
        notify(t('contract.save'), ruleName);
      } else {
        await commissionRulesApi.create(payload);
        notify(t('comm.addSuccess'), t('comm.addSuccessMsg').replace('{name}', ruleName));
      }
      resetForm();
      await load(1, false);
    } catch (e: any) {
      notifyError(editingId ? t('comm.addFail') : t('comm.addFail'), e);
    }
  };

  const scopeNameOf = (r: CommissionRule) => {
    if (r.scope === 'by_partner') {
      // 合作公司名称由后端 partner_name 返回；缺失时回退到本地下拉匹配 / id
      if (r.partner_name) return r.partner_name;
      const p = partners.find((x) => x.id === r.partner_id);
      return (p?.name || p?.partner_name) || r.partner_id || scopeLabel('by_partner');
    }
    if (r.scope === 'by_broker') {
      const b = brokers.find((x) => x.id === r.broker_id);
      return (b?.partner_name || b?.name) || r.broker_id || t('comm.broker');
    }
    if (r.scope === 'by_employee') {
      const e = employees.find((x) => x.id === r.employee_id);
      return (e?.full_name || e?.name) || r.employee_id || t('comm.employee');
    }
    if (r.scope === 'by_department' || r.scope === 'department') return r.department || t('comm.department');
    return scopeLabel(r.scope || 'all_employees');
  };

  const retry = () => {
    setLoading(true);
    load().finally(() => setLoading(false));
  };

  if (loading) {
    return <ListState loading loadingLabel={t('comm.loading')} />;
  }

  if (loadError && rules.length === 0) {
    return <ListState error={loadError} retryLabel={t('common.retry')} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
      {loadError ? (
        <View
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.alpha(colors.errorRgb, 0.08),
          }}
        >
          <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>{loadError}</Text>
          <TouchableOpacity onPress={retry} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, color: colors.primary }}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {(
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
                  { key: 'by_partner', label: scopeLabel('by_partner') },
                  { key: 'broker_employee', label: t('comm.brokerEmployee') },
                ]}
                open={scopeOpen}
                onToggle={() => setScopeOpen(!scopeOpen)}
                onSelect={(k) => {
                  setScope(k);
                  setBrokerId('');
                  setPartnerId('');
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
            {scope === 'by_partner' && isAdmin && (
              <>
                {partners.length > 0 ? (
                  <SelectDropdown
                    label={scopeLabel('by_partner')}
                    value={partnerId}
                    options={partners.map((p) => ({ key: p.id, label: p.name || p.partner_name || p.id }))}
                    open={partnerOpen}
                    onToggle={() => setPartnerOpen(!partnerOpen)}
                    onSelect={(k) => {
                      setPartnerId(k);
                      if (formErrors.partnerId) setFormErrors((e) => ({ ...e, partnerId: '' }));
                    }}
                    searchable
                  />
                ) : (
                  <Text style={styles.formHint}>{t('comm.noMatch')}</Text>
                )}
                {!!formErrors.partnerId && <Text style={styles.errorText}>{formErrors.partnerId}</Text>}
              </>
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
          </View>

          {/* 已有设置 */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('comm.existing')}</Text>
            <Text style={styles.sectionHint}>{t('comm.totalCount').replace('{n}', String(total))}</Text>
          </View>
          {rules.length === 0 && !loadError ? (
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
                    <Text style={styles.ruleMetaValue}>{dealTypeLabel(r.deal_type)}</Text>
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
                <View style={styles.ruleActions}>
                  <TouchableOpacity
                    style={styles.ruleActionBtn}
                    activeOpacity={0.7}
                    onPress={() => beginEdit(r)}
                  >
                    <Text style={styles.ruleActionText}>{t('crm.actionEdit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ruleActionBtn}
                    activeOpacity={0.7}
                    disabled={!!togglingId}
                    onPress={() => toggleActive(r)}
                  >
                    <Text style={styles.ruleActionText}>
                      {r.is_active === false ? t('comm.enable') : t('comm.disable')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          {rules.length < total && (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              activeOpacity={0.7}
              disabled={loadingMore}
              onPress={loadMore}
            >
              <Text style={styles.loadMoreText}>
                {loadingMore ? t('comm.loading') : t('comm.totalCount').replace('{n}', String(total - rules.length))}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
    <View style={[styles.submitBtnWrap, { paddingBottom: insets.bottom + 68 }]}>
      {editingId && (
        <TouchableOpacity style={styles.cancelEditBtn} onPress={resetForm} activeOpacity={0.7}>
          <Text style={styles.cancelEditText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.submitBtn} onPress={submitRule} activeOpacity={0.7}>
        <Text style={styles.submitBtnText}>
          {editingId ? t('contract.save') : t('comm.addNew')}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  bodyContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 160 },

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
  formLabel: { fontSize: colors.fontSize.caption, fontWeight: '600', color: colors.ink, marginBottom: 8, marginTop: 4 },
  formGroup: { marginBottom: 4 },
  formHint: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2, marginBottom: 4, lineHeight: colors.lineHeight.tight},
  inputError: { borderColor: colors.error },
  errorText: { fontSize: colors.fontSize.xs, color: colors.error, marginTop: 2, lineHeight: colors.lineHeight.tight},
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
    fontSize: colors.fontSize.caption,
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
    minHeight: colors.touch.chip,
    alignItems: 'center',
    justifyContent: 'center',
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
  submitBtnWrap: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

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
  ruleMetaLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, marginBottom: 4, lineHeight: colors.lineHeight.tight},
  ruleMetaValue: { fontSize: colors.fontSize.caption, fontWeight: '600', color: colors.ink2 },
  ruleMetaPrimary: { fontSize: 15, fontWeight: '800', color: colors.primary },
  ruleActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  ruleActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ruleActionText: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
  loadMoreBtn: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: colors.radius.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMoreText: { fontSize: colors.fontSize.caption, fontWeight: '600', color: colors.primary },
  cancelEditBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelEditText: { fontSize: 14, fontWeight: '600', color: colors.ink2 },

  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.full },
  tagText: { fontSize: colors.fontSize.xs, fontWeight: '600', lineHeight: colors.lineHeight.tight},
  tagWarning: { backgroundColor: `rgba(${colors.warningRgb}, 0.12)` },
  tagSuccess: { backgroundColor: `rgba(${colors.successRgb}, 0.12)` },
  tagWarning_text: { color: colors.warning },
  tagSuccess_text: { color: colors.success },
});