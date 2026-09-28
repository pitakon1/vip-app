/**
 * 管理端「考勤管理」（对标企业微信考勤应用，四个页签）：
 *   考勤核对 —— P0：全员考勤明细 + 行内校准（改状态 / 补上下班时间 / 备注）
 *   考勤组   —— P1-a：多办公点 / 多班次规则与成员分配
 *   请假审批 —— P1-b：假勤审批（通过与后端考勤联动）
 *   异常报表 —— P1-c：异常分类统计与逐日趋势
 *
 * 口径与 Web 端 frontend-web/src/pages/AttendanceManage/index.tsx 保持一致。
 * 本页为管理端页面，文案沿用仓库 App 管理页的硬编码中文风格。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import dayjs from 'dayjs';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import { attendanceApi, employeesApi } from '@/services/api';

type AttStatus = 'present' | 'late' | 'early_out' | 'absent' | 'leave' | 'field_work';
type LeaveType = 'annual' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'other';
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

const STATUSES: AttStatus[] = ['present', 'late', 'early_out', 'absent', 'leave', 'field_work'];
const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'unpaid', 'maternity', 'other'];
const LEAVE_STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

const STATUS_META: Record<AttStatus, { label: string; color: string; bg: string }> = {
  present: { label: '正常', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
  late: { label: '迟到', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  early_out: { label: '早退', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  absent: { label: '缺勤', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.12) },
  leave: { label: '请假', color: colors.ink2, bg: colors.surface2 },
  field_work: { label: '外勤', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.12) },
};

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: '年假',
  sick: '病假',
  personal: '事假',
  unpaid: '无薪假',
  maternity: '产假',
  other: '其他',
};

const LEAVE_STATUS_META: Record<LeaveStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '待审批', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  approved: { label: '已通过', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
  rejected: { label: '已驳回', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.12) },
  cancelled: { label: '已撤销', color: colors.ink2, bg: colors.surface2 },
};

interface DayRow {
  date: string;
  status: AttStatus;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
  late_minutes: number | null;
  early_out_minutes: number | null;
}

interface EmployeeRecord {
  employee_id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  employee_code: string | null;
  days: DayRow[];
}

interface GroupItem {
  id: string;
  name: string;
  description?: string | null;
  office_lat?: number | null;
  office_lng?: number | null;
  radius_km?: number | null;
  utc_offset_hours?: number | null;
  work_start?: string | null;
  work_end?: string | null;
  late_grace_minutes?: number | null;
  early_grace_minutes?: number | null;
  department?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  member_count?: number;
}

interface GroupMember {
  employee_id: string;
  member_id?: string;
  name?: string | null;
  email?: string | null;
  department?: string | null;
  employee_code?: string | null;
}

interface EmpOption {
  id: string;
  full_name?: string | null;
  email?: string | null;
  department?: string | null;
  employee_code?: string | null;
}

interface LeaveReq {
  id: string;
  employee_id: string;
  name: string | null;
  department: string | null;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reply_note?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
}

interface GroupForm {
  name: string;
  description: string;
  department: string;
  office_lat: string;
  office_lng: string;
  radius_km: string;
  utc_offset_hours: string;
  work_start: string;
  work_end: string;
  late_grace_minutes: string;
  early_grace_minutes: string;
  is_default: boolean;
  is_active: boolean;
}

const emptyGroupForm = (): GroupForm => ({
  name: '',
  description: '',
  department: '',
  office_lat: '13.7563',
  office_lng: '100.5018',
  radius_km: '0.5',
  utc_offset_hours: '7',
  work_start: '09:00',
  work_end: '18:00',
  late_grace_minutes: '0',
  early_grace_minutes: '0',
  is_default: false,
  is_active: true,
});

const DATE_FMT = 'YYYY-MM-DD';
const fmtTime = (v?: string | null) => (v ? dayjs(v).format('HH:mm') : '--:--');
const isDateStr = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
const isHm = (v: string) => /^\d{2}:\d{2}$/.test(v.trim());

/** 药丸标签（页签 / 筛选项 / 表单选项统一使用） */
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function StatusBadge({ status }: { status: AttStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.present;
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

/** 弹层骨架：遮罩 + 卡片 + 可滚动内容 + 底部操作 */
function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheetCard}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.ink3} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={styles.sheetBodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export default function AttendanceManageScreen() {
  const [tab, setTab] = useState<'records' | 'groups' | 'leave' | 'report'>('records');
  const [refreshing, setRefreshing] = useState(false);
  const [empOptions, setEmpOptions] = useState<EmpOption[]>([]);
  const [saving, setSaving] = useState(false);

  // 员工列表（部门筛选 / 考勤组成员多选共用）
  const loadEmployees = useCallback(() => {
    employeesApi
      .list({ page: 1, pageSize: 100 })
      .then((res) => {
        const payload = res.data?.data ?? res.data;
        setEmpOptions(payload?.items ?? []);
      })
      .catch(() => setEmpOptions([]));
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // ---------------------------------------------------------------- 考勤核对
  const [range, setRange] = useState({
    start: dayjs().startOf('month').format(DATE_FMT),
    end: dayjs().format(DATE_FMT),
  });
  const [recordsDept, setRecordsDept] = useState('');
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<EmployeeRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  const loadRecords = useCallback(() => {
    setLoadingRecords(true);
    attendanceApi
      .adminRecords({
        start_date: range.start,
        end_date: range.end,
        ...(recordsDept ? { department: recordsDept } : {}),
      })
      .then((res) => {
        setRecords(res.data?.records ?? []);
        setSummary(res.data?.summary ?? {});
      })
      .catch((err) => notifyError('加载考勤明细失败', err))
      .finally(() => setLoadingRecords(false));
  }, [range.start, range.end, recordsDept]);

  // 校准弹窗
  const [calib, setCalib] = useState<{ employee: EmployeeRecord; day: DayRow | null } | null>(null);
  const [calibForm, setCalibForm] = useState({
    date: '',
    status: '' as '' | AttStatus,
    check_in: '',
    check_out: '',
    notes: '',
  });

  const openCalibrate = (employee: EmployeeRecord, day: DayRow | null) => {
    setCalib({ employee, day });
    setCalibForm({
      date: day?.date ? day.date.slice(0, 10) : range.start,
      status: (day?.status ?? '') as '' | AttStatus,
      check_in: day?.check_in ? dayjs(day.check_in).format('HH:mm') : '',
      check_out: day?.check_out ? dayjs(day.check_out).format('HH:mm') : '',
      notes: day?.notes ?? '',
    });
  };

  const submitCalibrate = async () => {
    if (!calib) return;
    const date = calibForm.date.trim();
    if (!isDateStr(date)) {
      notify('日期格式不正确', '请使用 YYYY-MM-DD');
      return;
    }
    const payload: Record<string, unknown> = { date };
    if (calibForm.status) payload.status = calibForm.status;
    if (calibForm.check_in) payload.check_in_time = `${date}T${calibForm.check_in}:00`;
    if (calibForm.check_out) payload.check_out_time = `${date}T${calibForm.check_out}:00`;
    if (calibForm.notes) payload.notes = calibForm.notes;
    // 补录（当日无记录）必须带状态
    if (!calib.day && !calibForm.status) {
      notify('缺少状态', '补录记录时必须选择考勤状态');
      return;
    }
    if (Object.keys(payload).length === 1) {
      notify('无改动内容', '请至少修改一项后再提交');
      return;
    }
    if (calibForm.check_in && calibForm.check_out && calibForm.check_out < calibForm.check_in) {
      notify('时间区间有误', '下班时间不能早于上班时间');
      return;
    }
    setSaving(true);
    try {
      await attendanceApi.calibrate(calib.employee.employee_id, payload);
      notify('校准成功', '考勤记录已更新');
      setCalib(null);
      loadRecords();
    } catch (err) {
      notifyError('校准失败', err);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- 考勤组
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupModal, setGroupModal] = useState<{ id: string | null } | null>(null);
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm());
  const [membersModal, setMembersModal] = useState<GroupItem | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pickedEmployees, setPickedEmployees] = useState<string[]>([]);
  const [memberKw, setMemberKw] = useState('');

  const loadGroups = useCallback(() => {
    setLoadingGroups(true);
    attendanceApi
      .groups()
      .then((res) => setGroups(res.data ?? []))
      .catch((err) => notifyError('加载考勤组失败', err))
      .finally(() => setLoadingGroups(false));
  }, []);

  const openGroupModal = (group?: GroupItem) => {
    if (group) {
      setGroupForm({
        name: group.name ?? '',
        description: group.description ?? '',
        department: group.department ?? '',
        office_lat: String(group.office_lat ?? ''),
        office_lng: String(group.office_lng ?? ''),
        radius_km: String(group.radius_km ?? ''),
        utc_offset_hours: String(group.utc_offset_hours ?? ''),
        work_start: group.work_start ?? '09:00',
        work_end: group.work_end ?? '18:00',
        late_grace_minutes: String(group.late_grace_minutes ?? 0),
        early_grace_minutes: String(group.early_grace_minutes ?? 0),
        is_default: !!group.is_default,
        is_active: group.is_active !== false,
      });
      setGroupModal({ id: group.id });
    } else {
      setGroupForm(emptyGroupForm());
      setGroupModal({ id: null });
    }
  };

  const submitGroup = async () => {
    if (!groupForm.name.trim()) {
      notify('请填写考勤组名称', undefined);
      return;
    }
    if (!isHm(groupForm.work_start) || !isHm(groupForm.work_end)) {
      notify('作息时间格式不正确', '请使用 HH:mm，例如 09:00');
      return;
    }
    const body: Record<string, unknown> = {
      name: groupForm.name.trim(),
      description: groupForm.description || null,
      department: groupForm.department || null,
      office_lat: Number(groupForm.office_lat),
      office_lng: Number(groupForm.office_lng),
      radius_km: Number(groupForm.radius_km),
      utc_offset_hours: Number(groupForm.utc_offset_hours),
      work_start: groupForm.work_start,
      work_end: groupForm.work_end,
      late_grace_minutes: Number(groupForm.late_grace_minutes || 0),
      early_grace_minutes: Number(groupForm.early_grace_minutes || 0),
      is_default: groupForm.is_default,
      is_active: groupForm.is_active,
    };
    setSaving(true);
    try {
      if (groupModal?.id) {
        await attendanceApi.updateGroup(groupModal.id, body);
      } else {
        await attendanceApi.createGroup(body);
      }
      notify('保存成功', '考勤组已更新');
      setGroupModal(null);
      loadGroups();
    } catch (err) {
      notifyError('保存考勤组失败', err);
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = (group: GroupItem) => {
    Alert.alert('删除考勤组', `确定删除「${group.name}」吗？删除后成员将回落到默认规则。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await attendanceApi.deleteGroup(group.id);
            notify('已删除', '考勤组已移除');
            loadGroups();
          } catch (err) {
            notifyError('删除考勤组失败', err);
          }
        },
      },
    ]);
  };

  const openMembers = async (group: GroupItem) => {
    setMembersModal(group);
    setPickedEmployees([]);
    setMemberKw('');
    loadEmployees();
    try {
      const res = await attendanceApi.groupMembers(group.id);
      setMembers(res.data ?? []);
    } catch (err) {
      setMembers([]);
      notifyError('加载成员失败', err);
    }
  };

  const addMembers = async () => {
    if (!membersModal || pickedEmployees.length === 0) return;
    try {
      const res = await attendanceApi.assignGroupMembers(membersModal.id, {
        employee_ids: pickedEmployees,
      });
      setMembers(res.data ?? []);
      setPickedEmployees([]);
      notify('已添加成员', `共新增 ${pickedEmployees.length} 人`);
      loadGroups();
    } catch (err) {
      notifyError('添加成员失败', err);
    }
  };

  const dropMember = async (employeeId: string) => {
    if (!membersModal) return;
    try {
      await attendanceApi.removeGroupMember(membersModal.id, employeeId);
      setMembers((prev) => prev.filter((m) => m.employee_id !== employeeId));
      loadGroups();
    } catch (err) {
      notifyError('移除成员失败', err);
    }
  };

  // ---------------------------------------------------------------- 请假审批
  const [leaveFilter, setLeaveFilter] = useState<'' | LeaveStatus>('pending');
  const [leaves, setLeaves] = useState<LeaveReq[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [review, setReview] = useState<{ leave: LeaveReq; action: 'approved' | 'rejected' } | null>(
    null,
  );
  const [replyNote, setReplyNote] = useState('');

  const loadLeaves = useCallback(() => {
    setLoadingLeaves(true);
    attendanceApi
      .leaveRequests(leaveFilter ? { status: leaveFilter } : undefined)
      .then((res) => setLeaves(res.data ?? []))
      .catch((err) => notifyError('加载请假申请失败', err))
      .finally(() => setLoadingLeaves(false));
  }, [leaveFilter]);

  const submitReview = async () => {
    if (!review) return;
    setSaving(true);
    try {
      await attendanceApi.approveLeave(review.leave.id, {
        action: review.action,
        reply_note: replyNote || null,
      });
      notify(review.action === 'approved' ? '已通过' : '已驳回', '审批结果已提交');
      setReview(null);
      setReplyNote('');
      loadLeaves();
    } catch (err) {
      notifyError('审批失败', err);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- 异常报表
  const [reportRange, setReportRange] = useState({
    start: dayjs().startOf('month').format(DATE_FMT),
    end: dayjs().format(DATE_FMT),
  });
  const [reportDept, setReportDept] = useState('');
  const [report, setReport] = useState<any | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const loadReport = useCallback(() => {
    setLoadingReport(true);
    attendanceApi
      .summary({
        start_date: reportRange.start,
        end_date: reportRange.end,
        ...(reportDept ? { department: reportDept } : {}),
      })
      .then((res) => setReport(res.data))
      .catch((err) => notifyError('加载异常报表失败', err))
      .finally(() => setLoadingReport(false));
  }, [reportRange.start, reportRange.end, reportDept]);

  // 进入页签或筛选变化时加载；日期必须完整合法才发请求（避免输入中途打出无效区间）
  useEffect(() => {
    if (tab === 'records') {
      if (!isDateStr(range.start) || !isDateStr(range.end)) return;
      if (dayjs(range.start).isAfter(dayjs(range.end), 'day')) return;
      loadRecords();
    } else if (tab === 'groups') {
      loadGroups();
    } else if (tab === 'leave') {
      loadLeaves();
    } else if (tab === 'report') {
      if (!isDateStr(reportRange.start) || !isDateStr(reportRange.end)) return;
      if (dayjs(reportRange.start).isAfter(dayjs(reportRange.end), 'day')) return;
      loadReport();
    }
  }, [tab, range.start, range.end, recordsDept, reportRange.start, reportRange.end, reportDept, loadRecords, loadGroups, loadLeaves, loadReport]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (tab === 'records') loadRecords();
    else if (tab === 'groups') loadGroups();
    else if (tab === 'leave') loadLeaves();
    else loadReport();
    // 各 loader 内部 setLoading*，这里给下拉动画一个最短时长
    setTimeout(() => setRefreshing(false), 400);
  };

  const deptOptions = useMemo(
    () => [...new Set(empOptions.map((e) => e.department).filter(Boolean))] as string[],
    [empOptions],
  );

  const filteredEmployees = useMemo(() => {
    const kw = memberKw.trim().toLowerCase();
    const list = kw
      ? empOptions.filter((e) =>
          `${e.full_name ?? ''} ${e.employee_code ?? ''} ${e.department ?? ''}`
            .toLowerCase()
            .includes(kw),
        )
      : empOptions;
    return list.slice(0, 50);
  }, [empOptions, memberKw]);

  // ---------------------------------------------------------------- 渲染：核对
  const renderRecords = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>筛选</Text>
        <View style={styles.quickRow}>
          <Chip
            label="本月"
            active={range.start === dayjs().startOf('month').format(DATE_FMT)}
            onPress={() =>
              setRange({ start: dayjs().startOf('month').format(DATE_FMT), end: dayjs().format(DATE_FMT) })
            }
          />
          <Chip
            label="近 7 天"
            onPress={() =>
              setRange({
                start: dayjs().subtract(6, 'day').format(DATE_FMT),
                end: dayjs().format(DATE_FMT),
              })
            }
          />
          <Chip
            label="今天"
            onPress={() => {
              const d = dayjs().format(DATE_FMT);
              setRange({ start: d, end: d });
            }}
          />
        </View>
        <Field label="日期区间">
          <View style={styles.rangeRow}>
            <TextInput
              style={[styles.input, styles.rangeInput]}
              value={range.start}
              onChangeText={(v) => setRange((p) => ({ ...p, start: v }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.ink3}
              maxLength={10}
              autoCapitalize="none"
            />
            <Text style={styles.rangeSep}>~</Text>
            <TextInput
              style={[styles.input, styles.rangeInput]}
              value={range.end}
              onChangeText={(v) => setRange((p) => ({ ...p, end: v }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.ink3}
              maxLength={10}
              autoCapitalize="none"
            />
          </View>
        </Field>
        <Field label="部门">
          <View style={styles.chipWrap}>
            <Chip label="全部" active={!recordsDept} onPress={() => setRecordsDept('')} />
            {deptOptions.map((d) => (
              <Chip key={d} label={d} active={recordsDept === d} onPress={() => setRecordsDept(d)} />
            ))}
          </View>
        </Field>
        <TouchableOpacity style={styles.primaryBtn} onPress={loadRecords} activeOpacity={0.8}>
          <Ionicons name="search" size={16} color={colors.primaryForeground} />
          <Text style={styles.primaryBtnText}>查询</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>汇总</Text>
        <View style={styles.chipWrap}>
          {STATUSES.map((s) => {
            const meta = STATUS_META[s];
            return (
              <View key={s} style={[styles.badge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.badgeText, { color: meta.color }]}>
                  {meta.label} {summary[s] ?? 0}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardTitle}>考勤明细</Text>
          <Text style={styles.cardCaption}>{records.length} 人</Text>
        </View>
        {loadingRecords ? (
          <LoadingState label="加载中…" />
        ) : records.length === 0 ? (
          <EmptyState icon="time-outline" title="暂无考勤数据" sub="换个日期区间或部门再试试" />
        ) : (
          records.map((emp) => {
            const abnormal = emp.days.filter(
              (d) => d.late_minutes || d.early_out_minutes || d.status === 'absent',
            ).length;
            const open = expanded.includes(emp.employee_id);
            return (
              <View key={emp.employee_id} style={styles.empBlock}>
                <TouchableOpacity
                  style={styles.empRow}
                  activeOpacity={0.8}
                  onPress={() =>
                    setExpanded((prev) =>
                      open ? prev.filter((id) => id !== emp.employee_id) : [...prev, emp.employee_id],
                    )
                  }
                >
                  <View style={styles.flex1}>
                    <Text style={styles.empName}>{emp.name || emp.email || '—'}</Text>
                    <Text style={styles.empSub}>
                      {[emp.employee_code || '无工号', emp.department || '未分组'].join(' · ')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          abnormal > 0
                            ? colors.alpha(colors.warningRgb, 0.12)
                            : colors.surface2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: abnormal > 0 ? colors.warning : colors.ink2 },
                      ]}
                    >
                      异常 {abnormal}
                    </Text>
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.ink3}
                  />
                </TouchableOpacity>

                {open ? (
                  <View style={styles.dayList}>
                    {emp.days.length === 0 ? (
                      <Text style={styles.emptyHint}>该区间内无考勤记录</Text>
                    ) : (
                      emp.days.map((d) => (
                        <View key={d.date} style={styles.dayRow}>
                          <View style={styles.flex1}>
                            <Text style={styles.dayDate}>{d.date.slice(0, 10)}</Text>
                            <Text style={styles.daySub}>
                              上班 {fmtTime(d.check_in)} · 下班 {fmtTime(d.check_out)}
                            </Text>
                            <Text style={styles.daySub}>
                              {d.late_minutes ? `迟到 ${d.late_minutes} 分 ` : ''}
                              {d.early_out_minutes ? `早退 ${d.early_out_minutes} 分 ` : ''}
                              {d.notes ? `备注：${d.notes}` : ''}
                            </Text>
                          </View>
                          <StatusBadge status={d.status} />
                          <TouchableOpacity
                            style={styles.ghostBtn}
                            onPress={() => openCalibrate(emp, d)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.ghostBtnText}>校准</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                    <TouchableOpacity
                      style={styles.ghostBtnWide}
                      onPress={() => openCalibrate(emp, null)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
                      <Text style={styles.ghostBtnText}>补录考勤</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </>
  );

  // ---------------------------------------------------------------- 渲染：考勤组
  const renderGroups = () => (
    <>
      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardTitle}>考勤组</Text>
          <TouchableOpacity style={styles.smallPrimaryBtn} onPress={() => openGroupModal()} activeOpacity={0.8}>
            <Ionicons name="add" size={15} color={colors.primaryForeground} />
            <Text style={styles.smallPrimaryBtnText}>新增</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cardHint}>
          同一员工命中多个考勤组时按部门优先级匹配；默认组全局唯一，设为默认会自动清除其它默认组。
        </Text>
      </View>

      {loadingGroups ? (
        <LoadingState label="加载中…" />
      ) : groups.length === 0 ? (
        <EmptyState icon="business-outline" title="暂无考勤组" sub="新增考勤组以区分办公点与班次" />
      ) : (
        groups.map((g) => (
          <View key={g.id} style={styles.card}>
            <View style={styles.cardHeadRow}>
              <View style={styles.flex1}>
                <View style={styles.groupNameRow}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  {g.is_default ? (
                    <View style={[styles.badge, { backgroundColor: colors.alpha(colors.primaryRgb, 0.12) }]}>
                      <Text style={[styles.badgeText, { color: colors.primary }]}>默认</Text>
                    </View>
                  ) : null}
                  {g.is_active === false ? (
                    <View style={[styles.badge, { backgroundColor: colors.surface2 }]}>
                      <Text style={[styles.badgeText, { color: colors.ink2 }]}>已停用</Text>
                    </View>
                  ) : null}
                </View>
                {g.description ? <Text style={styles.cardHint}>{g.description}</Text> : null}
              </View>
              <Text style={styles.cardCaption}>{g.member_count ?? 0} 人</Text>
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>作息</Text>
                <Text style={styles.metaValue}>
                  {g.work_start ?? '--:--'} - {g.work_end ?? '--:--'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>打卡半径</Text>
                <Text style={styles.metaValue}>{g.radius_km ?? '—'} km</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>宽限（迟到/早退）</Text>
                <Text style={styles.metaValue}>
                  {g.late_grace_minutes ?? 0} / {g.early_grace_minutes ?? 0} 分
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>部门</Text>
                <Text style={styles.metaValue}>{g.department || '全部'}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>办公点</Text>
                <Text style={styles.metaValue}>
                  {g.office_lat ?? '—'}, {g.office_lng ?? '—'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>时区</Text>
                <Text style={styles.metaValue}>UTC+{g.utc_offset_hours ?? 0}</Text>
              </View>
            </View>

            <View style={styles.rowActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => openMembers(g)} activeOpacity={0.8}>
                <Text style={styles.ghostBtnText}>成员</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => openGroupModal(g)} activeOpacity={0.8}>
                <Text style={styles.ghostBtnText}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghostBtn, styles.ghostBtnDanger]}
                onPress={() => removeGroup(g)}
                activeOpacity={0.8}
              >
                <Text style={[styles.ghostBtnText, styles.ghostBtnTextDanger]}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </>
  );

  // ---------------------------------------------------------------- 渲染：请假审批
  const renderLeave = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>状态筛选</Text>
        <View style={styles.chipWrap}>
          <Chip label="全部" active={leaveFilter === ''} onPress={() => setLeaveFilter('')} />
          {LEAVE_STATUSES.map((s) => (
            <Chip
              key={s}
              label={LEAVE_STATUS_META[s].label}
              active={leaveFilter === s}
              onPress={() => setLeaveFilter(s)}
            />
          ))}
        </View>
      </View>

      {loadingLeaves ? (
        <LoadingState label="加载中…" />
      ) : leaves.length === 0 ? (
        <EmptyState icon="document-text-outline" title="暂无请假申请" sub="当前筛选条件下没有记录" />
      ) : (
        leaves.map((l) => {
          const meta = LEAVE_STATUS_META[l.status] ?? LEAVE_STATUS_META.pending;
          return (
            <View key={l.id} style={styles.card}>
              <View style={styles.cardHeadRow}>
                <View style={styles.flex1}>
                  <Text style={styles.empName}>{l.name || '—'}</Text>
                  <Text style={styles.empSub}>{l.department || '未分组'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>

              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>类型</Text>
                  <Text style={styles.metaValue}>{LEAVE_TYPE_LABEL[l.leave_type] ?? l.leave_type}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>天数</Text>
                  <Text style={styles.metaValue}>{l.days} 天</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>起止</Text>
                  <Text style={styles.metaValue}>
                    {l.start_date} ~ {l.end_date}
                  </Text>
                </View>
              </View>
              <Text style={styles.leaveReason}>事由：{l.reason}</Text>
              {l.reply_note ? <Text style={styles.cardHint}>批注：{l.reply_note}</Text> : null}

              {l.status === 'pending' ? (
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={styles.ghostBtn}
                    onPress={() => {
                      setReview({ leave: l, action: 'approved' });
                      setReplyNote('');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.ghostBtnText}>通过</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ghostBtn, styles.ghostBtnDanger]}
                    onPress={() => {
                      setReview({ leave: l, action: 'rejected' });
                      setReplyNote('');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.ghostBtnText, styles.ghostBtnTextDanger]}>驳回</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </>
  );

  // ---------------------------------------------------------------- 渲染：异常报表
  const renderReport = () => {
    const totals = report?.totals ?? {};
    const daily: any[] = report?.daily ?? [];
    const dailyMax = Math.max(
      1,
      ...daily.map((d) => (d.late ?? 0) + (d.early_out ?? 0) + (d.absent ?? 0)),
    );
    const topEmployees = [...(report?.employees ?? [])]
      .sort((a: any, b: any) => (b.abnormal ?? 0) - (a.abnormal ?? 0))
      .slice(0, 10);

    return (
      <>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>筛选</Text>
          <View style={styles.quickRow}>
            <Chip
              label="本月"
              onPress={() =>
                setReportRange({
                  start: dayjs().startOf('month').format(DATE_FMT),
                  end: dayjs().format(DATE_FMT),
                })
              }
            />
            <Chip
              label="近 7 天"
              onPress={() =>
                setReportRange({
                  start: dayjs().subtract(6, 'day').format(DATE_FMT),
                  end: dayjs().format(DATE_FMT),
                })
              }
            />
          </View>
          <Field label="日期区间" hint="区间最长 92 天">
            <View style={styles.rangeRow}>
              <TextInput
                style={[styles.input, styles.rangeInput]}
                value={reportRange.start}
                onChangeText={(v) => setReportRange((p) => ({ ...p, start: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.ink3}
                maxLength={10}
                autoCapitalize="none"
              />
              <Text style={styles.rangeSep}>~</Text>
              <TextInput
                style={[styles.input, styles.rangeInput]}
                value={reportRange.end}
                onChangeText={(v) => setReportRange((p) => ({ ...p, end: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.ink3}
                maxLength={10}
                autoCapitalize="none"
              />
            </View>
          </Field>
          <Field label="部门">
            <View style={styles.chipWrap}>
              <Chip label="全部" active={!reportDept} onPress={() => setReportDept('')} />
              {deptOptions.map((d) => (
                <Chip key={d} label={d} active={reportDept === d} onPress={() => setReportDept(d)} />
              ))}
            </View>
          </Field>
          <TouchableOpacity style={styles.primaryBtn} onPress={loadReport} activeOpacity={0.8}>
            <Ionicons name="search" size={16} color={colors.primaryForeground} />
            <Text style={styles.primaryBtnText}>查询</Text>
          </TouchableOpacity>
        </View>

        {loadingReport ? (
          <LoadingState label="加载中…" />
        ) : !report ? (
          <EmptyState icon="bar-chart-outline" title="暂无报表数据" sub="选择区间后点击查询" />
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>迟到次数</Text>
                <Text style={[styles.kpiValue, { color: colors.warning }]}>{totals.late ?? 0}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>早退次数</Text>
                <Text style={[styles.kpiValue, { color: colors.warning }]}>
                  {totals.early_out ?? 0}
                </Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>缺勤次数</Text>
                <Text style={[styles.kpiValue, { color: colors.error }]}>{totals.absent ?? 0}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>异常合计</Text>
                <Text style={[styles.kpiValue, { color: colors.error }]}>
                  {totals.abnormal ?? 0}
                </Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>出勤率</Text>
                <Text style={[styles.kpiValue, { color: colors.primary }]}>
                  {totals.attendance_rate ?? 0}
                  <Text style={styles.kpiUnit}> %</Text>
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>部门维度</Text>
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.cellDept]}>部门</Text>
                <Text style={styles.th}>迟到</Text>
                <Text style={styles.th}>早退</Text>
                <Text style={styles.th}>缺勤</Text>
                <Text style={styles.th}>请假</Text>
                <Text style={styles.th}>异常</Text>
              </View>
              {(report.departments ?? []).length === 0 ? (
                <Text style={styles.emptyHint}>暂无部门数据</Text>
              ) : (
                report.departments.map((d: any) => (
                  <View key={d.department} style={styles.tableRow}>
                    <Text style={[styles.td, styles.cellDept, styles.tdStrong]} numberOfLines={1}>
                      {d.department}
                    </Text>
                    <Text style={styles.td}>{d.late}</Text>
                    <Text style={styles.td}>{d.early_out}</Text>
                    <Text style={styles.td}>{d.absent}</Text>
                    <Text style={styles.td}>{d.leave}</Text>
                    <Text style={[styles.td, styles.tdWarn]}>{d.abnormal}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>逐日趋势（异常数）</Text>
              {daily.length === 0 ? (
                <Text style={styles.emptyHint}>暂无趋势数据</Text>
              ) : (
                daily.map((d) => {
                  const value = (d.late ?? 0) + (d.early_out ?? 0) + (d.absent ?? 0);
                  const pct = Math.round((value / dailyMax) * 100);
                  return (
                    <View key={d.date} style={styles.trendRow}>
                      <Text style={styles.trendLabel}>{d.date.slice(5)}</Text>
                      <View style={styles.trendBarTrack}>
                        <View style={[styles.trendBarFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.trendValue}>{value}</Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeadRow}>
                <Text style={styles.cardTitle}>员工维度（异常降序）</Text>
                <Text style={styles.cardCaption}>{report.total_employees ?? 0} 人</Text>
              </View>
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.cellEmp]}>员工</Text>
                <Text style={styles.th}>正常</Text>
                <Text style={styles.th}>迟到</Text>
                <Text style={styles.th}>早退</Text>
                <Text style={styles.th}>缺勤</Text>
                <Text style={styles.th}>异常</Text>
              </View>
              {topEmployees.length === 0 ? (
                <Text style={styles.emptyHint}>暂无员工数据</Text>
              ) : (
                topEmployees.map((e: any) => (
                  <View key={e.employee_id} style={styles.tableRow}>
                    <Text style={[styles.td, styles.cellEmp, styles.tdStrong]} numberOfLines={1}>
                      {e.name || e.email || '—'}
                    </Text>
                    <Text style={styles.td}>{e.present}</Text>
                    <Text style={styles.td}>{e.late}</Text>
                    <Text style={styles.td}>{e.early_out}</Text>
                    <Text style={styles.td}>{e.absent}</Text>
                    <Text style={[styles.td, styles.tdWarn]}>{e.abnormal}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </>
    );
  };

  const TABS = [
    { key: 'records' as const, label: '考勤核对' },
    { key: 'groups' as const, label: '考勤组' },
    { key: 'leave' as const, label: '请假审批' },
    { key: 'report' as const, label: '异常报表' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {TABS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tab, tab === item.key && styles.tabActive]}
            onPress={() => setTab(item.key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {tab === 'records' ? renderRecords() : null}
        {tab === 'groups' ? renderGroups() : null}
        {tab === 'leave' ? renderLeave() : null}
        {tab === 'report' ? renderReport() : null}
      </ScrollView>

      {/* 校准弹窗 */}
      <Sheet
        visible={!!calib}
        title={`校准 · ${calib?.employee.name || calib?.employee.email || ''}`}
        onClose={() => setCalib(null)}
        footer={
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={submitCalibrate}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryBtnText}>保存</Text>
            )}
          </TouchableOpacity>
        }
      >
        <Field label="日期" hint={calib?.day ? '已有记录不可改日期' : '补录需选择考勤状态'}>
          <TextInput
            style={[styles.input, calib?.day ? styles.inputDisabled : null]}
            value={calibForm.date}
            onChangeText={(v) => setCalibForm((p) => ({ ...p, date: v }))}
            editable={!calib?.day}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.ink3}
            maxLength={10}
            autoCapitalize="none"
          />
        </Field>
        <Field label="状态">
          <View style={styles.chipWrap}>
            {calib?.day ? (
              <Chip
                label="保持原状态"
                active={!calibForm.status}
                onPress={() => setCalibForm((p) => ({ ...p, status: '' }))}
              />
            ) : null}
            {STATUSES.map((s) => (
              <Chip
                key={s}
                label={STATUS_META[s].label}
                active={calibForm.status === s}
                onPress={() => setCalibForm((p) => ({ ...p, status: s }))}
              />
            ))}
          </View>
        </Field>
        <Field label="上班时间（HH:mm）">
          <TextInput
            style={styles.input}
            value={calibForm.check_in}
            onChangeText={(v) => setCalibForm((p) => ({ ...p, check_in: v }))}
            placeholder="09:00"
            placeholderTextColor={colors.ink3}
            maxLength={5}
            autoCapitalize="none"
          />
        </Field>
        <Field label="下班时间（HH:mm）">
          <TextInput
            style={styles.input}
            value={calibForm.check_out}
            onChangeText={(v) => setCalibForm((p) => ({ ...p, check_out: v }))}
            placeholder="18:00"
            placeholderTextColor={colors.ink3}
            maxLength={5}
            autoCapitalize="none"
          />
        </Field>
        <Field label="备注">
          <TextInput
            style={[styles.input, styles.textarea]}
            value={calibForm.notes}
            onChangeText={(v) => setCalibForm((p) => ({ ...p, notes: v }))}
            placeholder="如：外勤补卡、请假类型备注"
            placeholderTextColor={colors.ink3}
            multiline
          />
        </Field>
      </Sheet>

      {/* 考勤组表单弹窗 */}
      <Sheet
        visible={!!groupModal}
        title={groupModal?.id ? '编辑考勤组' : '新增考勤组'}
        onClose={() => setGroupModal(null)}
        footer={
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={submitGroup}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryBtnText}>保存</Text>
            )}
          </TouchableOpacity>
        }
      >
        <Field label="名称（必填）">
          <TextInput
            style={styles.input}
            value={groupForm.name}
            onChangeText={(v) => setGroupForm((p) => ({ ...p, name: v }))}
            placeholder="如：总部-标准班"
            placeholderTextColor={colors.ink3}
          />
        </Field>
        <Field label="描述">
          <TextInput
            style={styles.input}
            value={groupForm.description}
            onChangeText={(v) => setGroupForm((p) => ({ ...p, description: v }))}
            placeholder="选填"
            placeholderTextColor={colors.ink3}
          />
        </Field>
        <View style={styles.twoCol}>
          <Field label="上班时间">
            <TextInput
              style={styles.input}
              value={groupForm.work_start}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, work_start: v }))}
              placeholder="09:00"
              placeholderTextColor={colors.ink3}
              maxLength={5}
              autoCapitalize="none"
            />
          </Field>
          <Field label="下班时间">
            <TextInput
              style={styles.input}
              value={groupForm.work_end}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, work_end: v }))}
              placeholder="18:00"
              placeholderTextColor={colors.ink3}
              maxLength={5}
              autoCapitalize="none"
            />
          </Field>
        </View>
        <View style={styles.twoCol}>
          <Field label="迟到宽限（分）">
            <TextInput
              style={styles.input}
              value={groupForm.late_grace_minutes}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, late_grace_minutes: v }))}
              keyboardType="number-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
          <Field label="早退宽限（分）">
            <TextInput
              style={styles.input}
              value={groupForm.early_grace_minutes}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, early_grace_minutes: v }))}
              keyboardType="number-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
        </View>
        <View style={styles.twoCol}>
          <Field label="办公点纬度">
            <TextInput
              style={styles.input}
              value={groupForm.office_lat}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, office_lat: v }))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
          <Field label="办公点经度">
            <TextInput
              style={styles.input}
              value={groupForm.office_lng}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, office_lng: v }))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
        </View>
        <View style={styles.twoCol}>
          <Field label="打卡半径（km）">
            <TextInput
              style={styles.input}
              value={groupForm.radius_km}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, radius_km: v }))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
          <Field label="时区（UTC+）">
            <TextInput
              style={styles.input}
              value={groupForm.utc_offset_hours}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, utc_offset_hours: v }))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
        </View>
        <Field label="部门" hint="留空表示对所有部门生效">
          <TextInput
            style={styles.input}
            value={groupForm.department}
            onChangeText={(v) => setGroupForm((p) => ({ ...p, department: v }))}
            placeholder="选填"
            placeholderTextColor={colors.ink3}
          />
        </Field>
        <Field label="是否默认组">
          <View style={styles.chipWrap}>
            <Chip
              label="是"
              active={groupForm.is_default}
              onPress={() => setGroupForm((p) => ({ ...p, is_default: true }))}
            />
            <Chip
              label="否"
              active={!groupForm.is_default}
              onPress={() => setGroupForm((p) => ({ ...p, is_default: false }))}
            />
          </View>
        </Field>
        <Field label="是否启用">
          <View style={styles.chipWrap}>
            <Chip
              label="启用"
              active={groupForm.is_active}
              onPress={() => setGroupForm((p) => ({ ...p, is_active: true }))}
            />
            <Chip
              label="停用"
              active={!groupForm.is_active}
              onPress={() => setGroupForm((p) => ({ ...p, is_active: false }))}
            />
          </View>
        </Field>
      </Sheet>

      {/* 成员管理弹窗 */}
      <Sheet
        visible={!!membersModal}
        title={`成员 · ${membersModal?.name ?? ''}`}
        onClose={() => setMembersModal(null)}
      >
        <Field label={`当前成员（${members.length}）`}>
          {members.length === 0 ? (
            <Text style={styles.emptyHint}>暂无成员</Text>
          ) : (
            members.map((m) => (
              <View key={m.employee_id} style={styles.memberRow}>
                <View style={styles.flex1}>
                  <Text style={styles.empName}>{m.name || m.email || m.employee_id}</Text>
                  <Text style={styles.empSub}>{m.department || '未分组'}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.ghostBtn, styles.ghostBtnDanger]}
                  onPress={() => dropMember(m.employee_id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.ghostBtnText, styles.ghostBtnTextDanger]}>移除</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </Field>

        <Field label="添加成员（多选）" hint="同一员工只归属一个考勤组，重复添加会自动迁移">
          <TextInput
            style={styles.input}
            value={memberKw}
            onChangeText={setMemberKw}
            placeholder="搜索姓名 / 工号 / 部门"
            placeholderTextColor={colors.ink3}
          />
          <View style={styles.chipWrap}>
            {filteredEmployees.length === 0 ? (
              <Text style={styles.emptyHint}>无匹配员工</Text>
            ) : (
              filteredEmployees.map((e) => (
                <Chip
                  key={e.id}
                  label={e.full_name || e.employee_code || e.id}
                  active={pickedEmployees.includes(e.id)}
                  onPress={() =>
                    setPickedEmployees((prev) =>
                      prev.includes(e.id) ? prev.filter((id) => id !== e.id) : [...prev, e.id],
                    )
                  }
                />
              ))
            )}
          </View>
        </Field>
        <TouchableOpacity
          style={[styles.primaryBtn, pickedEmployees.length === 0 && styles.btnDisabled]}
          onPress={addMembers}
          disabled={pickedEmployees.length === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>添加所选（{pickedEmployees.length}）</Text>
        </TouchableOpacity>
      </Sheet>

      {/* 审批弹窗 */}
      <Sheet
        visible={!!review}
        title={review?.action === 'approved' ? '通过申请' : '驳回申请'}
        onClose={() => setReview(null)}
        footer={
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={submitReview}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryBtnText}>确认</Text>
            )}
          </TouchableOpacity>
        }
      >
        {review ? (
          <>
            <Text style={styles.reviewSummary}>
              {review.leave.name} · {LEAVE_TYPE_LABEL[review.leave.leave_type]} ·{' '}
              {review.leave.start_date} ~ {review.leave.end_date} · {review.leave.days} 天
            </Text>
            <Field label="批注">
              <TextInput
                style={[styles.input, styles.textarea]}
                value={replyNote}
                onChangeText={setReplyNote}
                placeholder="选填，将同步给申请人"
                placeholderTextColor={colors.ink3}
                multiline
              />
            </Field>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 12 },

  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  tabTextActive: { color: colors.primaryForeground },

  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    ...colors.shadow.card,
  },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  cardCaption: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  cardHint: { fontSize: 11, color: colors.ink3, marginTop: 6, lineHeight: 16 },

  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  field: { marginTop: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.ink2, marginBottom: 6 },
  fieldHint: { fontSize: 11, color: colors.ink3, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.fieldFillBorder,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  input: {
    height: 42,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.fieldFill,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
  },
  inputDisabled: { backgroundColor: colors.surface2, color: colors.ink3 },
  textarea: { height: 84, paddingTop: 10, textAlignVertical: 'top' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeInput: { flex: 1 },
  rangeSep: { color: colors.ink3, fontWeight: '600' },
  twoCol: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },

  primaryBtn: {
    height: 42,
    marginTop: 14,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
  smallPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
  },
  smallPrimaryBtnText: { color: colors.primaryForeground, fontSize: 12, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  badge: {
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '600' },

  empBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginTop: 8 },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  empName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  empSub: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  dayList: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.lg,
    padding: 12,
    marginBottom: 8,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayDate: { fontSize: 13, fontWeight: '600', color: colors.ink },
  daySub: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  emptyHint: { fontSize: 12, color: colors.ink3, paddingVertical: 8 },

  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  groupName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  metaItem: { width: '50%', marginTop: 10, paddingRight: 8 },
  metaLabel: { fontSize: 11, color: colors.ink3, marginBottom: 3 },
  metaValue: { fontSize: 13, fontWeight: '600', color: colors.ink2 },

  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ghostBtnWide: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ghostBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  ghostBtnDanger: { borderColor: colors.errorBorder },
  ghostBtnTextDanger: { color: colors.error },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },

  leaveReason: { fontSize: 12, color: colors.ink2, marginTop: 10, lineHeight: 18 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    ...colors.shadow.card,
  },
  kpiLabel: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  kpiValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  kpiUnit: { fontSize: 13, fontWeight: '500', color: colors.ink3 },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  th: { flex: 1, fontSize: 11, color: colors.ink3, fontWeight: '600', textAlign: 'center' },
  td: { flex: 1, fontSize: 12, color: colors.ink2, textAlign: 'center' },
  tdStrong: { color: colors.ink, fontWeight: '600', textAlign: 'left' },
  tdWarn: { color: colors.warning, fontWeight: '700' },
  cellDept: { flex: 1.6 },
  cellEmp: { flex: 1.8 },

  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  trendLabel: { width: 40, fontSize: 11, color: colors.ink3 },
  trendBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  trendBarFill: {
    height: 10,
    borderRadius: colors.radius.full,
    backgroundColor: colors.warning,
    minWidth: 2,
  },
  trendValue: { width: 28, fontSize: 12, fontWeight: '700', color: colors.ink2, textAlign: 'right' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  reviewSummary: { fontSize: 12, color: colors.ink2, lineHeight: 18 },

  sheetOverlay: {
    flex: 1,
    backgroundColor: colors.alpha('0, 0, 0', 0.4),
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xxl,
    borderTopRightRadius: colors.radius.xxl,
    maxHeight: '88%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sheetBody: { paddingHorizontal: 20 },
  sheetBodyContent: { paddingBottom: 8 },
  sheetFooter: { paddingHorizontal: 20, paddingVertical: 14 },
});