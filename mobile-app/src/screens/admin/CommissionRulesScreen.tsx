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
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { commissionRulesApi, brokerApi, employeesApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

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

const DEAL_TYPE: Record<string, string> = {
  new_rental: '新租',
  renewal: '续约',
  purchase: '购房',
  sale: '出租',
};
const SCOPE: Record<string, string> = {
  all_employees: '全体员工',
  by_department: '部门',
  department: '部门',
  by_employee: '员工',
  individual: '员工',
  by_broker: '分销商',
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
          {current ? current.label : `请选择${label}`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
      </TouchableOpacity>
      {open && (
        <View style={styles.selectMenu}>
          {searchable && (
            <TextInput
              style={styles.selectSearch}
              placeholder="搜索..."
              placeholderTextColor={colors.ink3}
              value={kw}
              onChangeText={setKw}
            />
          )}
          {filtered.length === 0 && <Text style={styles.selectEmpty}>无匹配选项</Text>}
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
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

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
    if (!name || !rate) {
      Alert.alert('提示', '请填写规则名称与佣金比例');
      return;
    }
    if (scope === 'by_broker' && isAdmin && !brokerId) {
      Alert.alert('提示', '请选择分销商');
      return;
    }
    if (scope === 'by_employee' && isAdmin && !employeeId) {
      Alert.alert('提示', '请选择员工');
      return;
    }
    if (scope === 'broker_employee') {
      if (!brokerId) {
        Alert.alert('提示', '请先选择分销商');
        return;
      }
      if (!brokerEmployeeId) {
        Alert.alert('提示', '请选择该分销商的员工');
        return;
      }
    }
    if (scope === 'by_department' && !department) {
      Alert.alert('提示', '请输入部门名称');
      return;
    }
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
      Alert.alert('新增成功', `佣金设置「${ruleName}」已生效`);
    } catch (e: any) {
      Alert.alert('新增失败', e?.response?.data?.message || '请稍后重试');
    }
  };

  const scopeNameOf = (r: CommissionRule) => {
    if (r.scope === 'by_broker') {
      const b = brokers.find((x) => x.id === r.broker_id);
      return (b?.partner_name || b?.name) || r.broker_id || '分销商';
    }
    if (r.scope === 'by_employee') {
      const e = employees.find((x) => x.id === r.employee_id);
      return (e?.full_name || e?.name) || r.employee_id || '员工';
    }
    if (r.scope === 'by_department' || r.scope === 'department') return r.department || '部门';
    return SCOPE[r.scope || ''] || '全体员工';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.bodyContent}
      showsVerticalScrollIndicator={false}
    >
      {loading ? (
        <LoadingState label="正在加载佣金设置…" />
      ) : (
        <>
          {/* 新增设置 */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>新增设置</Text>
            <Text style={styles.sectionHint}>按层级差异化定价</Text>
          </View>
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>规则名称</Text>
            <TextInput
              style={styles.formInput}
              placeholder="如：新签成交佣"
              placeholderTextColor={colors.ink3}
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.formLabel}>交易类型</Text>
            <View style={styles.chipRow}>
              {Object.keys(DEAL_TYPE).map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, dealType === k && styles.chipActive]}
                  onPress={() => setDealType(k)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, dealType === k && styles.chipTextActive]}>{DEAL_TYPE[k]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {isAdmin ? (
              <SelectDropdown
                label="适用对象"
                value={scope}
                options={[
                  { key: 'all_employees', label: '全体员工' },
                  { key: 'by_department', label: '部门' },
                  { key: 'by_employee', label: '员工' },
                  { key: 'by_broker', label: '分销商' },
                  { key: 'broker_employee', label: '分销商员工' },
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
                label="适用对象"
                value={scope}
                options={[
                  { key: 'by_broker', label: '本渠道（差异化定价）' },
                  { key: 'by_employee', label: '本渠道员工' },
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
              <Text style={styles.formHint}>分销商管理员仅可为本渠道及本渠道员工配置差异化费率</Text>
            )}
            {(scope === 'by_broker' || scope === 'broker_employee') && isAdmin && brokers.length > 0 && (
              <SelectDropdown
                label="选择分销商"
                value={brokerId}
                options={brokers.map((b) => ({ key: b.id, label: b.partner_name || b.name }))}
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
                      ? '该分销商员工'
                      : '本渠道员工'
                    : isAdmin
                      ? '员工'
                      : '本渠道员工'
                }
                value={scope === 'broker_employee' ? brokerEmployeeId : employeeId}
                options={(scope === 'broker_employee' && isAdmin && brokerId
                  ? employees.filter((e) => e.broker_id === brokerId)
                  : employees
                ).map((e) => ({ key: e.id, label: e.full_name || e.name }))}
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
                <Text style={styles.formLabel}>部门名称</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="如：租赁部"
                  placeholderTextColor={colors.ink3}
                  value={department}
                  onChangeText={setDepartment}
                />
              </View>
            )}
            <Text style={styles.formLabel}>佣金比例 %</Text>
            <TextInput
              style={styles.formInput}
              placeholder="请输入比例"
              placeholderTextColor={colors.ink3}
              keyboardType="numeric"
              value={rate}
              onChangeText={setRate}
            />
            <TouchableOpacity style={styles.submitBtn} onPress={addRule} activeOpacity={0.7}>
              <Text style={styles.submitBtnText}>新增设置</Text>
            </TouchableOpacity>
          </View>

          {/* 已有设置 */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>已有设置</Text>
            <Text style={styles.sectionHint}>共 {rules.length} 条</Text>
          </View>
          {rules.length === 0 ? (
            <EmptyState icon="settings-outline" title="暂无佣金设置" sub="新增一条设置即可生效" />
          ) : (
            rules.map((r) => (
              <View key={r.id} style={styles.ruleCard}>
                <View style={styles.ruleHead}>
                  <Text style={styles.ruleName} numberOfLines={1}>{r.name}</Text>
                  <View style={[styles.tag, r.is_active === false ? styles.tagWarning : styles.tagSuccess]}>
                    <Text style={[styles.tagText, r.is_active === false ? styles.tagWarning_text : styles.tagSuccess_text]}>
                      {r.is_active === false ? '停用' : '启用'}
                    </Text>
                  </View>
                </View>
                <View style={styles.ruleMeta}>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>类型</Text>
                    <Text style={styles.ruleMetaValue}>{DEAL_TYPE[r.deal_type] || r.deal_type}</Text>
                  </View>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>比例</Text>
                    <Text style={styles.ruleMetaPrimary}>{r.rate}%</Text>
                  </View>
                  <View style={styles.ruleMetaItem}>
                    <Text style={styles.ruleMetaLabel}>适用对象</Text>
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
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 8, marginTop: 4 },
  formGroup: { marginBottom: 4 },
  formHint: { fontSize: 11, color: colors.ink3, marginTop: 2, marginBottom: 4 },
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
    borderWidth: 1,
    borderColor: colors.border,
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