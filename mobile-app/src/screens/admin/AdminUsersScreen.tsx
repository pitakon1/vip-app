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
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';
import { authApi, employeesApi, usersAdminApi } from '@/services/api';

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
const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '在职' },
  { key: 'inactive', label: '离职' },
  { key: 'probation', label: '试用期' },
];

const PROBATION_DAYS = 90; // 后端无试用期字段，按入职 90 天内视为试用期
const DAY_MS = 86400000;

const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

const STATUS_META: Record<string, { label: string; color: string; rgb: string }> = {
  active: { label: '在职', color: colors.success, rgb: colors.successRgb },
  probation: { label: '试用期', color: colors.info, rgb: colors.infoRgb },
  inactive: { label: '离职', color: colors.ink3, rgb: colors.primaryRgb },
};

export default function AdminUsersScreen() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [perfMap, setPerfMap] = useState<Record<string, LeaderRow>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<EmployeeRow | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [kw, setKw] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [meId, setMeId] = useState<string | null>(null);

  // 新建员工账号
  const [showCreate, setShowCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    department: '',
    position: '',
    password: '123456',
  });
  const openCreate = () => {
    setForm({ full_name: '', email: '', department: '', position: '', password: '123456' });
    setShowCreate(true);
  };
  const doCreate = async () => {
    if (!form.full_name.trim()) {
      Alert.alert('提示', '请填写姓名');
      return;
    }
    const email = form.email.trim();
    if (!email) {
      Alert.alert('提示', '请填写邮箱');
      return;
    }
    if (!form.password || form.password.length < 6) {
      Alert.alert('提示', '初始密码至少 6 位');
      return;
    }
    setCreateSaving(true);
    try {
      await usersAdminApi.create({
        role: 'employee',
        full_name: form.full_name.trim(),
        email,
        department: form.department.trim() || undefined,
        position: form.position.trim() || undefined,
        password: form.password,
      });
      Alert.alert('成功', '员工账号已创建');
      setShowCreate(false);
      fetchData();
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '创建失败');
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const toggleActive = async (emp: EmployeeRow) => {
    if (!emp.user_id) {
      Alert.alert('无法操作', '该员工未绑定登录账号');
      return;
    }
    try {
      await api.post(`/admin/users/${emp.user_id}/${emp.is_active ? 'deactivate' : 'activate'}`);
      Alert.alert('成功', emp.is_active ? '账号已停用' : '账号已启用');
      fetchData();
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '操作失败');
    }
  };

  const deleteUser = (emp: EmployeeRow) => {
    if (!emp.user_id) {
      Alert.alert('无法操作', '该员工未绑定登录账号');
      return;
    }
    Alert.alert(
      '删除账号',
      `确认删除「${emp.full_name || emp.user_id}」的账号？删除后历史单据保留，账号立即失效且不可恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await usersAdminApi.deleteUser(emp.user_id as string);
              Alert.alert('成功', '账号已删除');
              fetchData();
            } catch (e: any) {
              Alert.alert('失败', e?.response?.data?.detail || '删除失败');
            }
          },
        },
      ],
    );
  };

  const doResetPwd = async () => {
    if (!newPwd || newPwd.length < 6) {
      Alert.alert('提示', '新密码至少 6 位');
      return;
    }
    if (!pwdTarget?.user_id) {
      Alert.alert('无法操作', '该员工未绑定登录账号');
      return;
    }
    try {
      await api.post(`/admin/users/${pwdTarget.user_id}/reset-password`, { new_password: newPwd });
      Alert.alert('成功', '密码已重置');
      setPwdTarget(null);
      setNewPwd('');
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '重置失败');
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

  const statusOf = (e: EmployeeRow) =>
    !e.is_active ? STATUS_META.inactive : isProbation(e) ? STATUS_META.probation : STATUS_META.active;

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
      contentContainerStyle={styles.content}
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
          <Text style={styles.statLabel}>总员工</Text>
          <Text style={styles.statValue}>{total}</Text>
          <View style={[styles.statBadge, { backgroundColor: colors.alpha(colors.primaryRgb, 0.12) }]}>
            <Text style={[styles.statBadgeText, { color: colors.primary }]}>全员</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>在职</Text>
          <Text style={styles.statValue}>{activeCount}</Text>
          <View style={[styles.statBadge, { backgroundColor: colors.alpha(colors.successRgb, 0.12) }]}>
            <Text style={[styles.statBadgeText, { color: colors.success }]}>{activeRate}%</Text>
          </View>
        </View>
      </View>
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>离职</Text>
          <Text style={styles.statValue}>{inactiveCount}</Text>
          <View style={[styles.statBadge, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.statBadgeText, { color: colors.ink2 }]}>已离岗</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>本月新入职</Text>
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
          placeholder="搜索员工姓名/工号"
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
      </View>

      {/* 状态筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 列表 */}
      <View style={styles.listHead}>
        <Text style={styles.listTitle}>员工列表</Text>
        <View style={styles.listHeadRight}>
          <Text style={styles.listHint}>
            共 {total} 人{probationCount > 0 ? ` · 试用期 ${probationCount} 人` : ''}
          </Text>
          <TouchableOpacity style={styles.createBtn} activeOpacity={0.7} onPress={openCreate}>
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={styles.createBtnText}>新建</Text>
          </TouchableOpacity>
        </View>
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={employees.length === 0 ? '暂无员工' : '无匹配员工'}
          sub={employees.length === 0 ? '下拉刷新重试' : '换个关键词或筛选条件试试'}
        />
      ) : (
        visible.map((emp) => {
          const meta = statusOf(emp);
          const perf = perfMap[emp.id];
          const performance = Number(perf?.performance ?? 0);
          const bar = maxPerf > 0 ? Math.max(0, Math.min(performance / maxPerf, 1)) : 0;
          const shareRate = maxPerf > 0 ? Math.round(bar * 100) : 0;
          return (
            <View key={emp.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: colors.alpha(meta.rgb, 0.12) }]}>
                  <Text style={[styles.avatarText, { color: meta.color }]}>
                    {(emp.full_name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{emp.full_name || '未命名员工'}</Text>
                    <View style={[styles.roleTag, { backgroundColor: colors.alpha(meta.rgb, 0.12) }]}>
                      <Text style={[styles.roleText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.empCode}>{emp.employee_no || emp.employee_code || '无工号'}</Text>
                  <Text style={styles.deptLine} numberOfLines={1}>
                    {[emp.position, emp.department].filter(Boolean).join(' · ') || '未分配部门'}
                  </Text>
                  {!!emp.phone && (
                    <View style={styles.contactRow}>
                      <Ionicons name="call-outline" size={13} color={colors.ink3} />
                      <Text style={styles.contactText}>{emp.phone}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* 业绩（系统按佣金结算自动核算） */}
              <View style={styles.perfRow}>
                <Text style={styles.perfLabel}>累计业绩</Text>
                <Text style={styles.perfValue}>
                  {symOf(undefined)}
                  {performance.toLocaleString()}
                </Text>
                <Text style={styles.perfDeals}>{perf?.deals ?? 0} 单</Text>
              </View>
              <View style={styles.perfTrack}>
                <View style={[styles.perfBar, { flex: Math.max(bar, 0.02) }]} />
                <View style={{ flex: Math.max(1 - bar, 0) }} />
              </View>
              <Text style={styles.perfHint}>团队占比 {shareRate}%</Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionLink}
                  activeOpacity={0.7}
                  onPress={() => {
                    setPwdTarget(emp);
                    setNewPwd('');
                  }}
                >
                  <Ionicons name="key-outline" size={14} color={colors.primary} />
                  <Text style={styles.actionText}>重置密码</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionLink} activeOpacity={0.7} onPress={() => toggleActive(emp)}>
                  <Ionicons name="power-outline" size={14} color={colors.ink2} />
                  <Text style={[styles.actionText, { color: colors.ink2 }]}>
                    {emp.is_active ? '停用账号' : '启用账号'}
                  </Text>
                </TouchableOpacity>
                {emp.user_id && emp.user_id !== meId ? (
                  <TouchableOpacity style={styles.actionLink} activeOpacity={0.7} onPress={() => deleteUser(emp)}>
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>删除账号</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })
      )}

      <Modal visible={!!pwdTarget} transparent animationType="fade" onRequestClose={() => setPwdTarget(null)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>重置密码 · {pwdTarget?.full_name}</Text>
            <TextInput
              style={styles.modalInput}
              value={newPwd}
              onChangeText={setNewPwd}
              placeholder="输入新密码（至少 6 位）"
              placeholderTextColor={colors.ink3}
              secureTextEntry
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setPwdTarget(null)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} activeOpacity={0.7} onPress={doResetPwd}>
                <Text style={styles.modalOkText}>确认重置</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 新建员工账号 */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>新建员工账号</Text>
            <TextInput
              style={styles.modalInput}
              value={form.full_name}
              onChangeText={(t) => setForm((f) => ({ ...f, full_name: t }))}
              placeholder="姓名 *"
              placeholderTextColor={colors.ink3}
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              value={form.email}
              onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
              placeholder="邮箱 *"
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.modalInput}
              value={form.department}
              onChangeText={(t) => setForm((f) => ({ ...f, department: t }))}
              placeholder="部门（选填）"
              placeholderTextColor={colors.ink3}
            />
            <TextInput
              style={styles.modalInput}
              value={form.position}
              onChangeText={(t) => setForm((f) => ({ ...f, position: t }))}
              placeholder="职位（选填）"
              placeholderTextColor={colors.ink3}
            />
            <TextInput
              style={styles.modalInput}
              value={form.password}
              onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
              placeholder="初始密码（至少 6 位）"
              placeholderTextColor={colors.ink3}
              secureTextEntry
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setShowCreate(false)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalOk, createSaving && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={createSaving}
                onPress={doCreate}
              >
                <Text style={styles.modalOkText}>{createSaving ? '创建中…' : '创建'}</Text>
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
    borderWidth: 1,
    borderColor: colors.border,
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
    borderWidth: 1,
    borderColor: colors.border,
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
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  modalCancel: { backgroundColor: colors.surface2 },
  modalCancelText: { color: colors.ink2, fontWeight: '600' },
  modalOk: { backgroundColor: colors.primary },
  modalOkText: { color: '#fff', fontWeight: '600' },
  modalBtnDisabled: { opacity: 0.6 },
});