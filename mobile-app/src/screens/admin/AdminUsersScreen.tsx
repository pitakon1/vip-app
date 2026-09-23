/**
 * 员工管理
 * 原型：admin-mobile-employees.html
 * 区块：统计行（总员工/在员率/离职/本月新入职）→ 搜索 → 状态筛选 → 员工列表（工号/部门职位/电话/业绩进度）
 * 数据源：/employees（真实员工档案）、/employees/leaderboard（系统按佣金结算自动核算的业绩）
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import api from '@/lib/api';
import { authApi, employeesApi, usersAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';

interface EmployeeRow {
  id: string;
  user_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  employee_no?: string | null;
  employee_code?: string | null;
  department?: string | null;
  position?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  is_active?: boolean;
  status?: string | null;
  broker_id?: string | null;
}

interface LeaderRow {
  id: string;
  performance?: number;
  deals?: number;
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'probation';
/** 状态筛选（文案走 i18n：acc.filter.*） */
const FILTERS: StatusFilter[] = ['all', 'active', 'inactive', 'probation'];

const PROBATION_DAYS = 90; // 后端无试用期字段，按入职 90 天内视为试用期
const DAY_MS = 86400000;

/** 可分配的员工账号角色（与 Web 账号管理的角色口径一致，此处只列员工侧角色） */
const ROLE_KEYS = ['employee', 'agent', 'admin'] as const;

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

/** 状态色板（文案走 i18n：acc.filter.active / probation / inactive） */
const STATUS_META: Record<string, { color: string; rgb: string }> = {
  active: { color: colors.success, rgb: colors.successRgb },
  probation: { color: colors.info, rgb: colors.infoRgb },
  inactive: { color: colors.ink3, rgb: colors.primaryRgb },
};

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [perfMap, setPerfMap] = useState<Record<string, LeaderRow>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<EmployeeRow | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [kw, setKw] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [meId, setMeId] = useState<string | null>(null);

  // 修改账号角色（后端 PATCH /admin/users/{id}）。此前 App 端只能建号时定死 employee，
  // 账号建好后角色改不了，只能删了重建。
  const [roleTarget, setRoleTarget] = useState<EmployeeRow | null>(null);
  const [roleDraft, setRoleDraft] = useState('employee');
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);

  // 新建员工账号
  const [showCreate, setShowCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [formErr, setFormErr] = useState<{ full_name?: string; email?: string; password?: string }>({});
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    department: '',
    position: '',
    password: '123456',
    role: 'employee',
  });
  const openCreate = () => {
    setForm({ full_name: '', email: '', department: '', position: '', password: '123456', role: 'employee' });
    setFormErr({});
    setShowCreate(true);
  };
  const doCreate = async () => {
    const err: typeof formErr = {};
    if (!form.full_name.trim()) err.full_name = t('acc.nameRequired');
    if (!form.email.trim()) {
      err.email = t('acc.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      err.email = t('acc.emailInvalid');
    }
    if (!form.password || form.password.length < 6) err.password = t('acc.initPwdError');
    setFormErr(err);
    if (Object.keys(err).length > 0) return;
    setCreateSaving(true);
    try {
      await usersAdminApi.create({
        role: form.role,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        department: form.department.trim() || undefined,
        position: form.position.trim() || undefined,
        password: form.password,
      });
      notify(t('acc.success'), t('acc.created'));
      setShowCreate(false);
      fetchData();
    } catch (e: any) {
      notifyError(t('acc.createFailed'), e);
    } finally {
      setCreateSaving(false);
    }
  };

  const fetchData = useCallback(async () => {
    const [empRes, leadRes, meRes] = await Promise.allSettled([
      employeesApi.list({ page: 1, page_size: 100 }),
      employeesApi.leaderboard(),
      authApi.me(),
    ]);
    if (meRes.status === 'fulfilled') {
      const me = (meRes.value as any)?.data;
      if (me?.id) setMeId(me.id);
    }
    if (empRes.status === 'rejected') {
      setLoadError(true);
      notifyError(t('acc.loadFailed'), (empRes as any).reason);
    } else {
      setLoadError(false);
    }
    try {
      if (empRes.status === 'fulfilled') {
        const d = (empRes.value as any)?.data ?? {};
        const items = (d.items ?? d ?? []) as EmployeeRow[];
        setEmployees(items);
        setTotal(typeof d.total === 'number' ? d.total : items.length);
      } else {
        setEmployees([]);
        setTotal(0);
      }
      if (leadRes.status === 'fulfilled') {
        const rows = ((leadRes.value as any)?.data ?? []) as LeaderRow[];
        setPerfMap(
          rows.reduce<Record<string, LeaderRow>>((acc, r) => {
            if (r?.id) acc[r.id] = r;
            return acc;
          }, {}),
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const toggleActive = async (emp: EmployeeRow) => {
    if (!emp.user_id) {
      notifyError(t('acc.cannotOperate'), { message: t('acc.noBoundAccount') });
      return;
    }
    try {
      await api.post(`/admin/users/${emp.user_id}/${emp.is_active ? 'deactivate' : 'activate'}`);
      notify(t('acc.success'), emp.is_active ? t('acc.accountDisabled') : t('acc.accountEnabled'));
      fetchData();
    } catch (e: any) {
      notifyError(t('acc.opFailed'), e);
    }
  };

  const deleteUser = (emp: EmployeeRow) => {
    if (!emp.user_id) {
      Alert.alert(t('acc.cannotOperate'), t('acc.noBoundAccount'));
      return;
    }
    Alert.alert(
      t('acc.deleteAccount'),
      t('acc.deleteConfirm', { name: emp.full_name || emp.user_id }),
      [
        { text: t('acc.cancel'), style: 'cancel' },
        {
          text: t('acc.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await usersAdminApi.deleteUser(emp.user_id as string);
              notify(t('acc.success'), t('acc.deleted'));
              fetchData();
            } catch (e: any) {
              notifyError(t('acc.deleteFailed'), e);
            }
          },
        },
      ],
    );
  };

  const doResetPwd = async () => {
    if (!newPwd || newPwd.length < 6) {
      setPwdError(t('acc.newPwdError'));
      return;
    }
    setPwdError('');
    if (!pwdTarget?.user_id) {
      notifyError(t('acc.cannotOperate'), { message: t('acc.noBoundAccount') });
      return;
    }
    try {
      await api.post(`/admin/users/${pwdTarget.user_id}/reset-password`, { new_password: newPwd });
      notify(t('acc.success'), t('acc.pwdReset'));
      setPwdTarget(null);
      setNewPwd('');
      setPwdError('');
    } catch (e: any) {
      notifyError(t('acc.pwdResetFailed'), e);
    }
  };

  /** 打开「改角色」弹层：按邮箱回查账号拿到当前角色，避免默认值误导 */
  const openRole = async (emp: EmployeeRow) => {
    if (!emp.user_id) {
      notifyError(t('acc.cannotOperate'), { message: t('acc.noBoundAccount') });
      return;
    }
    setRoleTarget(emp);
    setRoleDraft('employee');
    setRoleLoading(true);
    try {
      const { data } = await usersAdminApi.list({
        keyword: emp.email ?? emp.full_name ?? '',
        page_size: 10,
      });
      const d = data?.data ?? data;
      const items: any[] = d?.items ?? d ?? [];
      const hit = items.find((u) => String(u.id) === String(emp.user_id)) ?? items[0];
      if (hit?.role) setRoleDraft(hit.role);
    } catch {
      /* 回查失败保留默认值，保存时仍以所选角色覆盖 */
    } finally {
      setRoleLoading(false);
    }
  };

  const doSaveRole = async () => {
    if (!roleTarget?.user_id) return;
    setRoleSaving(true);
    try {
      await usersAdminApi.update(roleTarget.user_id, { role: roleDraft });
      notify(t('acc.success'), t('acc.roleUpdated', { name: roleTarget.full_name || t('acc.title') }));
      setRoleTarget(null);
      fetchData();
    } catch (e: any) {
      notifyError(t('acc.saveFailed'), e);
    } finally {
      setRoleSaving(false);
    }
  };

  /* ===== 统计与筛选（全部由真实员工档案推导） ===== */
  const now = Date.now();
  const nowMonth = new Date();
  const isProbation = (e: EmployeeRow) => {
    if (!e.hire_date || e.is_active === false) return false;
    const t = new Date(e.hire_date).getTime();
    return !Number.isNaN(t) && now - t <= PROBATION_DAYS * DAY_MS && now >= t;
  };
  const activeCount = employees.filter((e) => e.is_active).length;
  const inactiveCount = employees.length - activeCount;
  const activeRate = employees.length > 0 ? Math.round((activeCount / employees.length) * 100) : 0;
  const probationCount = employees.filter(isProbation).length;
  const newThisMonth = employees.filter((e) => {
    if (!e.hire_date) return false;
    const d = new Date(e.hire_date);
    return (
      !Number.isNaN(d.getTime()) &&
      d.getFullYear() === nowMonth.getFullYear() &&
      d.getMonth() === nowMonth.getMonth()
    );
  }).length;

  const keyword = kw.trim().toLowerCase();
  const visible = employees.filter((e) => {
    const hitKw =
      !keyword ||
      (e.full_name || '').toLowerCase().includes(keyword) ||
      (e.employee_no || e.employee_code || '').toLowerCase().includes(keyword) ||
      (e.phone || '').includes(keyword) ||
      (e.department || '').toLowerCase().includes(keyword);
    const hitStatus =
      filter === 'all'
        ? true
        : filter === 'active'
          ? !!e.is_active
          : filter === 'inactive'
            ? !e.is_active
            : isProbation(e);
    return hitKw && hitStatus;
  });

  // 业绩进度以团队最高累计佣金为参照（后端无目标值，故展示团队占比而非目标完成率）
  const maxPerf = Math.max(
    0,
    ...Object.values(perfMap).map((r) => Number(r.performance ?? 0)),
  );

  const statusKeyOf = (e: EmployeeRow) =>
    !e.is_active ? 'inactive' : isProbation(e) ? 'probation' : 'active';

  const renderEmployee = useCallback(
    ({ item }: { item: EmployeeRow }) => {
      const statusKey = statusKeyOf(item);
      const meta = STATUS_META[statusKey];
      const perf = perfMap[item.id];
      const performance = Number(perf?.performance ?? 0);
      const bar = maxPerf > 0 ? Math.max(0, Math.min(performance / maxPerf, 1)) : 0;
      const shareRate = maxPerf > 0 ? Math.round(bar * 100) : 0;
      return (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={[styles.avatar, { backgroundColor: colors.alpha(meta.rgb, 0.12) }]}>
              <Text style={[styles.avatarText, { color: meta.color }]}>
                {(item.full_name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{item.full_name || t('acc.unnamed')}</Text>
                <View style={[styles.roleTag, { backgroundColor: colors.alpha(meta.rgb, 0.12) }]}>
                  <Text style={[styles.roleText, { color: meta.color }]}>
                    {t(`acc.filter.${statusKey}`)}
                  </Text>
                </View>
              </View>
              <Text style={styles.empCode}>{item.employee_no || item.employee_code || t('acc.noCode')}</Text>
              <Text style={styles.deptLine} numberOfLines={1}>
                {[item.position, item.department].filter(Boolean).join(' · ') || t('acc.noDept')}
              </Text>
              {!!item.phone && (
                <View style={styles.contactRow}>
                  <Ionicons name="call-outline" size={13} color={colors.ink3} />
                  <Text style={styles.contactText}>{item.phone}</Text>
                </View>
              )}
            </View>
          </View>

          {/* 业绩（系统按佣金结算自动核算） */}
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>{t('acc.totalPerf')}</Text>
            <Text style={styles.perfValue}>
              {symOf(undefined)}
              {performance.toLocaleString()}
            </Text>
            <Text style={styles.perfDeals}>{t('acc.ordersUnit', { n: perf?.deals ?? 0 })}</Text>
          </View>
          <View style={styles.perfTrack}>
            <View style={[styles.perfBar, { flex: Math.max(bar, 0.02) }]} />
            <View style={{ flex: Math.max(1 - bar, 0) }} />
          </View>
          <Text style={styles.perfHint}>{t('acc.teamShare', { n: shareRate })}</Text>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionLink}
              activeOpacity={0.7}
              onPress={() => {
                setPwdTarget(item);
                setNewPwd('');
              }}
            >
              <Ionicons name="key-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>{t('acc.resetPwd')}</Text>
            </TouchableOpacity>
            {item.user_id ? (
              <TouchableOpacity style={styles.actionLink} activeOpacity={0.7} onPress={() => openRole(item)}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
                <Text style={styles.actionText}>{t('acc.changeRole')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.actionLink} activeOpacity={0.7} onPress={() => toggleActive(item)}>
              <Ionicons name="power-outline" size={14} color={colors.ink2} />
              <Text style={[styles.actionText, { color: colors.ink2 }]}>
                {item.is_active ? t('acc.deactivate') : t('acc.activate')}
              </Text>
            </TouchableOpacity>
            {item.user_id && item.user_id !== meId ? (
              <TouchableOpacity style={styles.actionLink} activeOpacity={0.7} onPress={() => deleteUser(item)}>
                <Ionicons name="trash-outline" size={14} color={colors.error} />
                <Text style={[styles.actionText, { color: colors.error }]}>{t('acc.deleteAccount')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    },
    [perfMap, maxPerf, meId, t],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchData();
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* 概览统计 */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('acc.totalStaff')}</Text>
          <Text style={styles.statValue}>{total}</Text>
          <View style={[styles.statBadge, { backgroundColor: colors.alpha(colors.primaryRgb, 0.12) }]}>
            <Text style={[styles.statBadgeText, { color: colors.primary }]}>{t('acc.allStaff')}</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('acc.filter.active')}</Text>
          <Text style={styles.statValue}>{activeCount}</Text>
          <View style={[styles.statBadge, { backgroundColor: colors.alpha(colors.successRgb, 0.12) }]}>
            <Text style={[styles.statBadgeText, { color: colors.success }]}>{activeRate}%</Text>
          </View>
        </View>
      </View>
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('acc.filter.inactive')}</Text>
          <Text style={styles.statValue}>{inactiveCount}</Text>
          <View style={[styles.statBadge, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.statBadgeText, { color: colors.ink2 }]}>{t('acc.leftPost')}</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('acc.newThisMonth')}</Text>
          <Text style={styles.statValue}>{newThisMonth}</Text>
          <View style={[styles.statBadge, { backgroundColor: colors.alpha(colors.infoRgb, 0.12) }]}>
            <Text style={[styles.statBadgeText, { color: colors.info }]}>+{newThisMonth}</Text>
          </View>
        </View>
      </View>

      {/* 搜索 */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={kw}
          onChangeText={setKw}
          placeholder={t('acc.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
      </View>

      {/* 状态筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {t(`acc.filter.${f}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 列表 */}
      <View style={styles.listHead}>
        <Text style={styles.listTitle}>{t('acc.listTitle')}</Text>
        <View style={styles.listHeadRight}>
          <Text style={styles.listHint}>
            {t('acc.countPeople', { n: total })}
            {probationCount > 0 ? t('acc.probationCount', { n: probationCount }) : ''}
          </Text>
          <TouchableOpacity style={styles.createBtn} activeOpacity={0.7} onPress={openCreate}>
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={styles.createBtnText}>{t('acc.create')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loadError && employees.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('acc.loadFailed')}
          sub={t('acc.loadFailedSub')}
          actionLabel={t('acc.retry')}
          onAction={() => {
            setRefreshing(true);
            fetchData();
          }}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={employees.length === 0 ? t('acc.empty') : t('acc.emptySearch')}
          sub={employees.length === 0 ? t('acc.pullRefresh') : t('acc.tryOtherFilter')}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(e) => e.id}
          renderItem={renderEmployee}
          initialNumToRender={10}
          windowSize={7}
          scrollEnabled={false}
        />
      )}

      <Modal visible={!!pwdTarget} transparent animationType="fade" onRequestClose={() => { setPwdTarget(null); setPwdError(''); }}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('acc.resetPwdTitle', { name: pwdTarget?.full_name ?? '' })}
            </Text>
            <Text style={styles.modalLabel}>{t('acc.newPwd')}</Text>
            <TextInput
              style={[styles.modalInput, !!pwdError && styles.modalInputError]}
              value={newPwd}
              onChangeText={(t) => {
                setNewPwd(t);
                if (pwdError) setPwdError('');
              }}
              placeholder={t('acc.newPwdPlaceholder')}
              placeholderTextColor={colors.ink3}
              secureTextEntry
              autoFocus
            />
            {!!pwdError && <Text style={styles.fieldError}>{pwdError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => { setPwdTarget(null); setPwdError(''); }} accessibilityRole="button">
                <Text style={styles.modalCancelText}>{t('acc.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} activeOpacity={0.7} onPress={doResetPwd} accessibilityRole="button">
                <Text style={styles.modalOkText}>{t('acc.confirmReset')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 新建员工账号 */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('acc.createTitle')}</Text>
            <Text style={styles.modalLabel}>{t('acc.name')} *</Text>
            <TextInput
              style={[styles.modalInput, !!formErr.full_name && styles.modalInputError]}
              value={form.full_name}
              onChangeText={(t) => {
                setForm((f) => ({ ...f, full_name: t }));
                if (formErr.full_name) setFormErr((e) => ({ ...e, full_name: undefined }));
              }}
              placeholder={t('acc.namePlaceholder')}
              placeholderTextColor={colors.ink3}
              autoFocus
            />
            {!!formErr.full_name && <Text style={styles.fieldError}>{formErr.full_name}</Text>}
            <Text style={styles.modalLabel}>{t('acc.email')} *</Text>
            <TextInput
              style={[styles.modalInput, !!formErr.email && styles.modalInputError]}
              value={form.email}
              onChangeText={(t) => {
                setForm((f) => ({ ...f, email: t }));
                if (formErr.email) setFormErr((e) => ({ ...e, email: undefined }));
              }}
              placeholder={t('acc.emailPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {!!formErr.email && <Text style={styles.fieldError}>{formErr.email}</Text>}
            <Text style={styles.modalLabel}>{t('acc.role')}</Text>
            <View style={styles.roleChipRow}>
              {ROLE_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.roleChip, form.role === key && styles.roleChipActive]}
                  activeOpacity={0.8}
                  onPress={() => setForm((f) => ({ ...f, role: key }))}
                >
                  <Text style={[styles.roleChipText, form.role === key && styles.roleChipTextActive]}>
                    {t(`perm.role.${key}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>{t('acc.deptOptional')}</Text>
            <TextInput
              style={styles.modalInput}
              value={form.department}
              onChangeText={(t) => setForm((f) => ({ ...f, department: t }))}
              placeholder={t('acc.deptPlaceholder')}
              placeholderTextColor={colors.ink3}
            />
            <Text style={styles.modalLabel}>{t('acc.positionOptional')}</Text>
            <TextInput
              style={styles.modalInput}
              value={form.position}
              onChangeText={(t) => setForm((f) => ({ ...f, position: t }))}
              placeholder={t('acc.positionPlaceholder')}
              placeholderTextColor={colors.ink3}
            />
            <Text style={styles.modalLabel}>{t('acc.initPwd')} *</Text>
            <TextInput
              style={[styles.modalInput, !!formErr.password && styles.modalInputError]}
              value={form.password}
              onChangeText={(t) => {
                setForm((f) => ({ ...f, password: t }));
                if (formErr.password) setFormErr((e) => ({ ...e, password: undefined }));
              }}
              placeholder={t('acc.initPwdPlaceholder')}
              placeholderTextColor={colors.ink3}
              secureTextEntry
            />
            {!!formErr.password && <Text style={styles.fieldError}>{formErr.password}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setShowCreate(false)} accessibilityRole="button">
                <Text style={styles.modalCancelText}>{t('acc.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalOk, createSaving && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={createSaving}
                onPress={doCreate}
                accessibilityRole="button"
              >
                <Text style={styles.modalOkText}>{createSaving ? t('acc.creating') : t('acc.createBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 修改账号角色（PATCH /admin/users/{id}） */}
      <Modal
        visible={!!roleTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleTarget(null)}
      >
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('acc.roleTitle', { name: roleTarget?.full_name || t('acc.title') })}
            </Text>
            <Text style={styles.modalLabel}>{t('acc.role')}</Text>
            <View style={styles.roleChipRow}>
              {ROLE_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.roleChip, roleDraft === key && styles.roleChipActive]}
                  activeOpacity={0.8}
                  onPress={() => setRoleDraft(key)}
                >
                  <Text style={[styles.roleChipText, roleDraft === key && styles.roleChipTextActive]}>
                    {t(`perm.role.${key}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.roleHint}>
              {roleLoading ? t('acc.roleLoading') : t('acc.roleHint')}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                activeOpacity={0.7}
                onPress={() => setRoleTarget(null)}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>{t('acc.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalOk, (roleSaving || roleLoading) && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={roleSaving || roleLoading}
                onPress={doSaveRole}
                accessibilityRole="button"
              >
                <Text style={styles.modalOkText}>{roleSaving ? t('acc.saving') : t('acc.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ===== 概览统计 ===== */
  statRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 12 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: 12, color: colors.ink3, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'], marginBottom: 6 },
  statBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  statBadgeText: { fontSize: 11, fontWeight: '600' },

  /* ===== 搜索与筛选 ===== */
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

  /* ===== 列表 ===== */
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  listHint: { fontSize: 11, color: colors.ink3, flexShrink: 1, textAlign: 'right' },
  listHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
  },
  createBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },

  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 14,
    ...colors.shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800' },
  cardBody: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  empCode: { fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'], marginTop: 2 },
  deptLine: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  roleTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  roleText: { fontSize: 11, fontWeight: '600' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  contactText: { fontSize: 12, color: colors.ink2, fontVariant: ['tabular-nums'] },

  /* ===== 业绩 ===== */
  perfRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  perfLabel: { fontSize: 11, color: colors.ink3 },
  perfValue: { fontSize: 15, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  perfDeals: { fontSize: 11, color: colors.ink3, marginLeft: 'auto' },
  perfTrack: {
    flexDirection: 'row',
    height: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: 8,
  },
  perfBar: { height: 5, borderRadius: colors.radius.full, backgroundColor: colors.primary },
  perfHint: { fontSize: 11, color: colors.ink3, marginTop: 6 },

  actionRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  modalMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 14 },
  modalLabel: { fontSize: 12, color: colors.ink2, marginBottom: 6 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink, marginBottom: 16 },
  modalInputError: { borderColor: colors.error },
  fieldError: { fontSize: 12, color: colors.error, marginTop: -10, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12 },
  modalCancel: { backgroundColor: colors.surface2 },
  modalCancelText: { color: colors.ink2, fontWeight: '600' },
  modalOk: { backgroundColor: colors.primary },
  modalOkText: { color: '#fff', fontWeight: '600' },
  modalBtnDisabled: { opacity: 0.6 },
  roleChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleChipActive: { backgroundColor: colors.sidebarActive, borderColor: colors.primary },
  roleChipText: { fontSize: 13, color: colors.ink2 },
  roleChipTextActive: { color: colors.primary, fontWeight: '700' },
  roleHint: { fontSize: 12, color: colors.ink3, marginBottom: 16 },
});