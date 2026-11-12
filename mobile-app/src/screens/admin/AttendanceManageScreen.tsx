﻿import { OPTION_PAGE_SIZE } from '@/lib/pagination';
import { BANGKOK_CENTER } from '@/constants/location';
/**
 * 管理端「考勤管理」（对标企业微信考勤应用，四个页签）：
 *   考勤核对 —— P0：全员考勤明细 + 行内校准（改状态 / 补上下班时间 / 备注）
 *   考勤组   —— P1-a：多办公点 / 多班次规则与成员分配
 *   请假审批 —— P1-b：假勤审批（通过与后端考勤联动）
 *   异常报表 —— P1-c：异常分类统计与逐日趋势
 *
 * 口径与 Web 端 frontend-web/src/pages/AttendanceManage/index.tsx 保持一致。
 * 本页文案统一走 i18n 字典（attAdm.*），中/英/泰三语。
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
import ListState from '@/components/ListState';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import { attendanceApi, employeesApi } from '@/services/api';
import { useI18n } from '@/i18n';

type AttStatus = 'present' | 'late' | 'early_out' | 'absent' | 'leave' | 'field_work';
type LeaveType = 'annual' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'other';
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

const STATUSES: AttStatus[] = ['present', 'late', 'early_out', 'absent', 'leave', 'field_work'];
const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'unpaid', 'maternity', 'other'];
const LEAVE_STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

const STATUS_META: Record<AttStatus, { key: string; color: string; bg: string }> = {
  present: { key: 'attAdm.status.present', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
  late: { key: 'attAdm.status.late', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  early_out: { key: 'attAdm.status.earlyOut', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  absent: { key: 'attAdm.status.absent', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.12) },
  leave: { key: 'attAdm.status.leave', color: colors.ink2, bg: colors.surface2 },
  field_work: { key: 'attAdm.status.fieldWork', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.12) },
};

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'attAdm.leaveType.annual',
  sick: 'attAdm.leaveType.sick',
  personal: 'attAdm.leaveType.personal',
  unpaid: 'attAdm.leaveType.unpaid',
  maternity: 'attAdm.leaveType.maternity',
  other: 'attAdm.leaveType.other',
};

const LEAVE_STATUS_META: Record<LeaveStatus, { key: string; color: string; bg: string }> = {
  pending: { key: 'attAdm.leaveStatus.pending', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  approved: { key: 'attAdm.leaveStatus.approved', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
  rejected: { key: 'attAdm.leaveStatus.rejected', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.12) },
  cancelled: { key: 'attAdm.leaveStatus.cancelled', color: colors.ink2, bg: colors.surface2 },
};

const TABS = [
  { key: 'records' as const, labelKey: 'attAdm.tab.records' },
  { key: 'groups' as const, labelKey: 'attAdm.tab.groups' },
  { key: 'leave' as const, labelKey: 'attAdm.tab.leave' },
  { key: 'report' as const, labelKey: 'attAdm.tab.report' },
];

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
  office_lat: String(BANGKOK_CENTER.lat),
  office_lng: String(BANGKOK_CENTER.lng),
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
  style,
  children,
}: {
  label: string;
  hint?: string;
  style?: any;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function StatusBadge({ status }: { status: AttStatus }) {
  const { t } = useI18n();
  const meta = STATUS_META[status] ?? STATUS_META.present;
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>{t(meta.key)}</Text>
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
  const { t } = useI18n();
  const [tab, setTab] = useState<'records' | 'groups' | 'leave' | 'report'>('records');
  const [refreshing, setRefreshing] = useState(false);
  const [empOptions, setEmpOptions] = useState<EmpOption[]>([]);
  const [saving, setSaving] = useState(false);

  // 员工列表（部门筛选 / 考勤组成员多选共用）
  // 显式按 page_size 分页取全量：此前只取第一页（后端默认 20 人），
  // 排在后面的人在部门筛选与考勤组多选里永远选不到。
  const loadEmployees = useCallback(async () => {
    try {
      const collected: EmpOption[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const res = await employeesApi.list({ page, page_size: OPTION_PAGE_SIZE });
        const payload = res.data?.data ?? res.data;
        const batch = (payload?.items ?? []) as EmpOption[];
        collected.push(...batch);
        const total = Number(payload?.total ?? 0);
        if (!batch.length || collected.length >= total || batch.length < OPTION_PAGE_SIZE) break;
      }
      setEmpOptions(collected);
    } catch {
      setEmpOptions([]);
    }
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
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);

  const loadRecords = useCallback(() => {
    setLoadingRecords(true);
    setRecordsError(null);
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
      .catch((err) => {
        setRecordsError(t('attAdm.records.loadFailInline'));
        notifyError(t('attAdm.records.loadFail'), err);
      })
      .finally(() => setLoadingRecords(false));
  }, [range.start, range.end, recordsDept, t]);

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
      notify(t('attAdm.calib.badDateTitle'), t('attAdm.calib.badDateMsg'));
      return;
    }
    const payload: Record<string, unknown> = { date };
    if (calibForm.status) payload.status = calibForm.status;
    if (calibForm.check_in) payload.check_in_time = `${date}T${calibForm.check_in}:00`;
    if (calibForm.check_out) payload.check_out_time = `${date}T${calibForm.check_out}:00`;
    if (calibForm.notes) payload.notes = calibForm.notes;
    // 补录（当日无记录）必须带状态
    if (!calib.day && !calibForm.status) {
      notify(t('attAdm.calib.missStatusTitle'), t('attAdm.calib.missStatusMsg'));
      return;
    }
    if (Object.keys(payload).length === 1) {
      notify(t('attAdm.calib.noChangeTitle'), t('attAdm.calib.noChangeMsg'));
      return;
    }
    if (calibForm.check_in && calibForm.check_out && calibForm.check_out < calibForm.check_in) {
      notify(t('attAdm.calib.badRangeTitle'), t('attAdm.calib.badRangeMsg'));
      return;
    }
    setSaving(true);
    try {
      await attendanceApi.calibrate(calib.employee.employee_id, payload);
      notify(t('attAdm.calib.okTitle'), t('attAdm.calib.okMsg'));
      setCalib(null);
      loadRecords();
    } catch (err) {
      notifyError(t('attAdm.calib.failTitle'), err);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- 考勤组
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupModal, setGroupModal] = useState<{ id: string | null } | null>(null);
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm());
  const [membersModal, setMembersModal] = useState<GroupItem | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pickedEmployees, setPickedEmployees] = useState<string[]>([]);
  const [memberKw, setMemberKw] = useState('');

  const loadGroups = useCallback(() => {
    setLoadingGroups(true);
    setGroupsError(null);
    attendanceApi
      .groups()
      .then((res) => {
        setGroupsError(null);
        setGroups(res.data ?? []);
      })
      .catch((err) => {
        setGroupsError(t('attAdm.groups.loadFailInline'));
        notifyError(t('attAdm.groups.loadFail'), err);
      })
      .finally(() => setLoadingGroups(false));
  }, [t]);

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
      notify(t('attAdm.groups.needName'), undefined);
      return;
    }
    if (!isHm(groupForm.work_start) || !isHm(groupForm.work_end)) {
      notify(t('attAdm.groups.badTimeTitle'), t('attAdm.groups.badTimeMsg'));
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
      notify(t('attAdm.groups.savedTitle'), t('attAdm.groups.savedMsg'));
      setGroupModal(null);
      loadGroups();
    } catch (err) {
      notifyError(t('attAdm.groups.saveFail'), err);
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = (group: GroupItem) => {
    Alert.alert(
      t('attAdm.groups.deleteTitle'),
      t('attAdm.groups.deleteMsg', { name: group.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('attAdm.groups.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await attendanceApi.deleteGroup(group.id);
              notify(t('attAdm.groups.deletedTitle'), t('attAdm.groups.deletedMsg'));
              loadGroups();
            } catch (err) {
              notifyError(t('attAdm.groups.deleteFail'), err);
            }
          },
        },
      ],
    );
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
      notifyError(t('attAdm.members.loadFail'), err);
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
      notify(t('attAdm.members.addedTitle'), t('attAdm.members.addedMsg', { n: pickedEmployees.length }));
      loadGroups();
    } catch (err) {
      notifyError(t('attAdm.members.addFail'), err);
    }
  };

  const dropMember = async (employeeId: string) => {
    if (!membersModal) return;
    try {
      await attendanceApi.removeGroupMember(membersModal.id, employeeId);
      setMembers((prev) => prev.filter((m) => m.employee_id !== employeeId));
      loadGroups();
    } catch (err) {
      notifyError(t('attAdm.members.removeFail'), err);
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
      .catch((err) => notifyError(t('attAdm.leave.loadFail'), err))
      .finally(() => setLoadingLeaves(false));
  }, [leaveFilter, t]);

  const submitReview = async () => {
    if (!review) return;
    setSaving(true);
    try {
      await attendanceApi.approveLeave(review.leave.id, {
        action: review.action,
        reply_note: replyNote || null,
      });
      notify(
        review.action === 'approved'
          ? t('attAdm.leaveStatus.approved')
          : t('attAdm.leaveStatus.rejected'),
        t('attAdm.review.submitted'),
      );
      setReview(null);
      setReplyNote('');
      loadLeaves();
    } catch (err) {
      notifyError(t('attAdm.review.fail'), err);
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
      .catch((err) => notifyError(t('attAdm.report.loadFail'), err))
      .finally(() => setLoadingReport(false));
  }, [reportRange.start, reportRange.end, reportDept, t]);

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
        <Text style={styles.cardTitle}>{t('attAdm.filter.title')}</Text>
        <View style={styles.quickRow}>
          <Chip
            label={t('attAdm.filter.month')}
            active={range.start === dayjs().startOf('month').format(DATE_FMT)}
            onPress={() =>
              setRange({ start: dayjs().startOf('month').format(DATE_FMT), end: dayjs().format(DATE_FMT) })
            }
          />
          <Chip
            label={t('attAdm.filter.last7')}
            onPress={() =>
              setRange({
                start: dayjs().subtract(6, 'day').format(DATE_FMT),
                end: dayjs().format(DATE_FMT),
              })
            }
          />
          <Chip
            label={t('attAdm.filter.today')}
            onPress={() => {
              const d = dayjs().format(DATE_FMT);
              setRange({ start: d, end: d });
            }}
          />
        </View>
        <Field label={t('attAdm.filter.range')}>
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
        <Field label={t('attAdm.field.dept')}>
          <View style={styles.chipWrap}>
            <Chip label={t('common.all')} active={!recordsDept} onPress={() => setRecordsDept('')} />
            {deptOptions.map((d) => (
              <Chip key={d} label={d} active={recordsDept === d} onPress={() => setRecordsDept(d)} />
            ))}
          </View>
        </Field>
        <TouchableOpacity style={styles.primaryBtn} onPress={loadRecords} activeOpacity={0.8}>
          <Ionicons name="search" size={16} color={colors.primaryForeground} />
          <Text style={styles.primaryBtnText}>{t('attAdm.filter.search')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('attAdm.summary')}</Text>
        <View style={styles.chipWrap}>
          {STATUSES.map((s) => {
            const meta = STATUS_META[s];
            return (
              <View key={s} style={[styles.badge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.badgeText, { color: meta.color }]}>
                  {t(meta.key)} {summary[s] ?? 0}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardTitle}>{t('attAdm.records.title')}</Text>
          <Text style={styles.cardCaption}>{t('attAdm.count.people', { n: records.length })}</Text>
        </View>
        {recordsError && records.length > 0 ? (
          <View
            style={{
              marginBottom: 8,
              padding: 10,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.alpha(colors.errorRgb, 0.08),
            }}
          >
            <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>{recordsError}</Text>
            <TouchableOpacity onPress={() => loadRecords()} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: colors.primary }}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {loadingRecords ? (
          <ListState loading />
        ) : recordsError && records.length === 0 ? (
          <ListState
            error={recordsError}
            retryLabel={t('common.retry')}
            onRetry={() => loadRecords()}
          />
        ) : records.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title={t('attAdm.records.emptyTitle')}
            sub={t('attAdm.records.emptySub')}
          />
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
                      {[emp.employee_code || t('attAdm.noCode'), emp.department || t('attAdm.noDept')].join(
                        ' · ',
                      )}
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
                      {t('attAdm.abnormalCount', { n: abnormal })}
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
                      <Text style={styles.emptyHint}>{t('attAdm.records.noDay')}</Text>
                    ) : (
                      emp.days.map((d) => (
                        <View key={d.date} style={styles.dayRow}>
                          <View style={styles.flex1}>
                            <Text style={styles.dayDate}>{d.date.slice(0, 10)}</Text>
                            <Text style={styles.daySub}>
                              {t('attAdm.records.inOut', {
                                in: fmtTime(d.check_in),
                                out: fmtTime(d.check_out),
                              })}
                            </Text>
                            <Text style={styles.daySub}>
                              {[
                                d.late_minutes
                                  ? t('attAdm.records.lateMin', { n: d.late_minutes })
                                  : '',
                                d.early_out_minutes
                                  ? t('attAdm.records.earlyMin', { n: d.early_out_minutes })
                                  : '',
                                d.notes ? t('attAdm.records.notes', { text: d.notes }) : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            </Text>
                          </View>
                          <View style={styles.dayRowRight}>
                            <StatusBadge status={d.status} />
                            <TouchableOpacity
                              style={styles.ghostBtn}
                              onPress={() => openCalibrate(emp, d)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.ghostBtnText} numberOfLines={1}>
                                {t('attAdm.records.calibrate')}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                    <TouchableOpacity
                      style={styles.ghostBtnWide}
                      onPress={() => openCalibrate(emp, null)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
                      <Text style={styles.ghostBtnText}>{t('attAdm.records.addRecord')}</Text>
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
          <Text style={styles.cardTitle}>{t('attAdm.groups.title')}</Text>
          <TouchableOpacity style={styles.smallPrimaryBtn} onPress={() => openGroupModal()} activeOpacity={0.8}>
            <Ionicons name="add" size={15} color={colors.primaryForeground} />
            <Text style={styles.smallPrimaryBtnText}>{t('attAdm.groups.create')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cardHint}>{t('attAdm.groups.hint')}</Text>
      </View>

      {groupsError && groups.length > 0 ? (
        <View
          style={{
            marginBottom: 8,
            padding: 10,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.alpha(colors.errorRgb, 0.08),
          }}
        >
          <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>{groupsError}</Text>
          <TouchableOpacity onPress={() => loadGroups()} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, color: colors.primary }}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {loadingGroups ? (
        <ListState loading />
      ) : groupsError && groups.length === 0 ? (
        <ListState
          error={groupsError}
          retryLabel={t('common.retry')}
          onRetry={() => loadGroups()}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title={t('attAdm.groups.emptyTitle')}
          sub={t('attAdm.groups.emptySub')}
        />
      ) : (
        groups.map((g) => (
          <View key={g.id} style={styles.card}>
            <View style={styles.cardHeadRow}>
              <View style={styles.flex1}>
                <View style={styles.groupNameRow}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  {g.is_default ? (
                    <View style={[styles.badge, { backgroundColor: colors.alpha(colors.primaryRgb, 0.12) }]}>
                      <Text style={[styles.badgeText, { color: colors.primary }]}>
                        {t('attAdm.groups.isDefault')}
                      </Text>
                    </View>
                  ) : null}
                  {g.is_active === false ? (
                    <View style={[styles.badge, { backgroundColor: colors.surface2 }]}>
                      <Text style={[styles.badgeText, { color: colors.ink2 }]}>
                        {t('attAdm.groups.inactive')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {g.description ? <Text style={styles.cardHint}>{g.description}</Text> : null}
              </View>
              <Text style={styles.cardCaption}>
                {t('attAdm.count.people', { n: g.member_count ?? 0 })}
              </Text>
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>{t('attAdm.groups.workHours')}</Text>
                <Text style={styles.metaValue}>
                  {g.work_start ?? '--:--'} - {g.work_end ?? '--:--'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>{t('attAdm.groups.radius')}</Text>
                <Text style={styles.metaValue}>{g.radius_km ?? '—'} km</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>{t('attAdm.groups.grace')}</Text>
                <Text style={styles.metaValue}>
                  {t('attAdm.groups.graceValue', {
                    late: g.late_grace_minutes ?? 0,
                    early: g.early_grace_minutes ?? 0,
                  })}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>{t('attAdm.field.dept')}</Text>
                <Text style={styles.metaValue}>{g.department || t('common.all')}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>{t('attAdm.groups.office')}</Text>
                <Text style={styles.metaValue}>
                  {g.office_lat ?? '—'}, {g.office_lng ?? '—'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>{t('attAdm.groups.timezone')}</Text>
                <Text style={styles.metaValue}>UTC+{g.utc_offset_hours ?? 0}</Text>
              </View>
            </View>

            <View style={styles.rowActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => openMembers(g)} activeOpacity={0.8}>
                <Text style={styles.ghostBtnText}>{t('attAdm.groups.members')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => openGroupModal(g)} activeOpacity={0.8}>
                <Text style={styles.ghostBtnText}>{t('attAdm.groups.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghostBtn, styles.ghostBtnDanger]}
                onPress={() => removeGroup(g)}
                activeOpacity={0.8}
              >
                <Text style={[styles.ghostBtnText, styles.ghostBtnTextDanger]}>
                  {t('attAdm.groups.delete')}
                </Text>
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
        <Text style={styles.cardTitle}>{t('attAdm.leave.filterTitle')}</Text>
        <View style={styles.chipWrap}>
          <Chip label={t('common.all')} active={leaveFilter === ''} onPress={() => setLeaveFilter('')} />
          {LEAVE_STATUSES.map((s) => (
            <Chip
              key={s}
              label={t(LEAVE_STATUS_META[s].key)}
              active={leaveFilter === s}
              onPress={() => setLeaveFilter(s)}
            />
          ))}
        </View>
      </View>

      {loadingLeaves ? (
        <LoadingState label={t('common.loading')} />
      ) : leaves.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={t('attAdm.leave.emptyTitle')}
          sub={t('attAdm.leave.emptySub')}
        />
      ) : (
        leaves.map((l) => {
          const meta = LEAVE_STATUS_META[l.status] ?? LEAVE_STATUS_META.pending;
          return (
            <View key={l.id} style={styles.card}>
              <View style={styles.cardHeadRow}>
                <View style={styles.flex1}>
                  <Text style={styles.empName}>{l.name || '—'}</Text>
                  <Text style={styles.empSub}>{l.department || t('attAdm.noDept')}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{t(meta.key)}</Text>
                </View>
              </View>

              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t('attAdm.leave.type')}</Text>
                  <Text style={styles.metaValue}>
                    {LEAVE_TYPE_LABEL[l.leave_type]
                      ? t(LEAVE_TYPE_LABEL[l.leave_type])
                      : l.leave_type}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t('attAdm.leave.days')}</Text>
                  <Text style={styles.metaValue}>{t('attAdm.leave.daysValue', { n: l.days })}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t('attAdm.leave.period')}</Text>
                  <Text style={styles.metaValue}>
                    {l.start_date} ~ {l.end_date}
                  </Text>
                </View>
              </View>
              <Text style={styles.leaveReason}>
                {t('attAdm.leave.reason', { text: l.reason })}
              </Text>
              {l.reply_note ? (
                <Text style={styles.cardHint}>
                  {t('attAdm.leave.replyNote', { text: l.reply_note })}
                </Text>
              ) : null}

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
                    <Text style={styles.ghostBtnText}>{t('attAdm.leave.approve')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ghostBtn, styles.ghostBtnDanger]}
                    onPress={() => {
                      setReview({ leave: l, action: 'rejected' });
                      setReplyNote('');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.ghostBtnText, styles.ghostBtnTextDanger]}>
                      {t('attAdm.leave.reject')}
                    </Text>
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
          <Text style={styles.cardTitle}>{t('attAdm.filter.title')}</Text>
          <View style={styles.quickRow}>
            <Chip
              label={t('attAdm.filter.month')}
              onPress={() =>
                setReportRange({
                  start: dayjs().startOf('month').format(DATE_FMT),
                  end: dayjs().format(DATE_FMT),
                })
              }
            />
            <Chip
              label={t('attAdm.filter.last7')}
              onPress={() =>
                setReportRange({
                  start: dayjs().subtract(6, 'day').format(DATE_FMT),
                  end: dayjs().format(DATE_FMT),
                })
              }
            />
          </View>
          <Field label={t('attAdm.filter.range')} hint={t('attAdm.filter.rangeMax')}>
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
          <Field label={t('attAdm.field.dept')}>
            <View style={styles.chipWrap}>
              <Chip label={t('common.all')} active={!reportDept} onPress={() => setReportDept('')} />
              {deptOptions.map((d) => (
                <Chip key={d} label={d} active={reportDept === d} onPress={() => setReportDept(d)} />
              ))}
            </View>
          </Field>
          <TouchableOpacity style={styles.primaryBtn} onPress={loadReport} activeOpacity={0.8}>
            <Ionicons name="search" size={16} color={colors.primaryForeground} />
            <Text style={styles.primaryBtnText}>{t('attAdm.filter.search')}</Text>
          </TouchableOpacity>
        </View>

        {loadingReport ? (
          <LoadingState label={t('common.loading')} />
        ) : !report ? (
          <EmptyState
            icon="bar-chart-outline"
            title={t('attAdm.report.emptyTitle')}
            sub={t('attAdm.report.emptySub')}
          />
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t('attAdm.report.kpiLate')}</Text>
                <Text style={[styles.kpiValue, { color: colors.warning }]}>{totals.late ?? 0}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t('attAdm.report.kpiEarly')}</Text>
                <Text style={[styles.kpiValue, { color: colors.warning }]}>
                  {totals.early_out ?? 0}
                </Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t('attAdm.report.kpiAbsent')}</Text>
                <Text style={[styles.kpiValue, { color: colors.error }]}>{totals.absent ?? 0}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t('attAdm.report.kpiAbnormal')}</Text>
                <Text style={[styles.kpiValue, { color: colors.error }]}>
                  {totals.abnormal ?? 0}
                </Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t('attAdm.report.kpiRate')}</Text>
                <Text style={[styles.kpiValue, { color: colors.primary }]}>
                  {totals.attendance_rate ?? 0}
                  <Text style={styles.kpiUnit}> %</Text>
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('attAdm.report.byDept')}</Text>
              {(report.departments ?? []).length === 0 ? (
                <Text style={styles.emptyHint}>{t('attAdm.report.noDept')}</Text>
              ) : (
                <View style={styles.reportList}>
                  {(report.departments ?? []).map((d: any) => {
                    const abn = d.abnormal ?? 0;
                    return (
                      <View key={d.department} style={styles.reportCard}>
                        <View style={styles.reportCardHead}>
                          <Text style={styles.reportCardIcon}>🏢</Text>
                          <Text style={styles.reportCardName}>{d.department || '—'}</Text>
                          <View
                            style={[
                              styles.reportBadge,
                              {
                                backgroundColor: abn === 0
                                  ? colors.alpha(colors.successRgb, 0.12)
                                  : colors.alpha(colors.errorRgb, 0.12),
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.reportBadgeText,
                                { color: abn === 0 ? colors.success : colors.error },
                              ]}
                            >
                              {t('attAdm.abnormalCount', { n: abn })}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.reportStats}>
                          <View style={styles.reportStatChip}>
                            <Text style={[styles.reportStatChipLabel, { color: colors.warning }]}>
                              {t('attAdm.status.late')}
                            </Text>
                            <Text style={styles.reportStatChipText}>{d.late ?? 0}</Text>
                          </View>
                          <View style={styles.reportStatChip}>
                            <Text style={[styles.reportStatChipLabel, { color: colors.warning }]}>
                              {t('attAdm.status.earlyOut')}
                            </Text>
                            <Text style={styles.reportStatChipText}>{d.early_out ?? 0}</Text>
                          </View>
                          <View style={styles.reportStatChip}>
                            <Text style={[styles.reportStatChipLabel, { color: colors.error }]}>
                              {t('attAdm.status.absent')}
                            </Text>
                            <Text style={styles.reportStatChipText}>{d.absent ?? 0}</Text>
                          </View>
                          <View style={styles.reportStatChip}>
                            <Text style={styles.reportStatChipLabel}>{t('attAdm.status.leave')}</Text>
                            <Text style={styles.reportStatChipText}>{d.leave ?? 0}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('attAdm.report.trend')}</Text>
              {daily.length === 0 ? (
                <Text style={styles.emptyHint}>{t('attAdm.report.noTrend')}</Text>
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
                <Text style={styles.cardTitle}>{t('attAdm.report.byEmployee')}</Text>
                <Text style={styles.cardCaption}>
                  {t('attAdm.count.people', { n: report.total_employees ?? 0 })}
                </Text>
              </View>
              {topEmployees.length === 0 ? (
                <Text style={styles.emptyHint}>{t('attAdm.report.noEmployee')}</Text>
              ) : (
                <View style={styles.reportList}>
                  {topEmployees.map((e: any) => {
                    const abn = e.abnormal ?? 0;
                    return (
                      <View key={e.employee_id} style={styles.reportCard}>
                        <View style={styles.reportCardHead}>
                          <Text style={styles.reportCardIcon}>👤</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.reportCardName}>{e.name || '—'}</Text>
                            {e.email ? (
                              <Text style={styles.reportCardEmail}>{e.email}</Text>
                            ) : null}
                          </View>
                          <View
                            style={[
                              styles.reportBadge,
                              {
                                backgroundColor: abn === 0
                                  ? colors.alpha(colors.successRgb, 0.12)
                                  : colors.alpha(colors.errorRgb, 0.12),
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.reportBadgeText,
                                { color: abn === 0 ? colors.success : colors.error },
                              ]}
                            >
                              {t('attAdm.abnormalCount', { n: abn })}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.reportStats}>
                          <View style={styles.reportStatChip}>
                            <Text style={[styles.reportStatChipLabel, { color: colors.success }]}>
                              {t('attAdm.status.present')}
                            </Text>
                            <Text style={styles.reportStatChipText}>{e.present ?? 0}</Text>
                          </View>
                          <View style={styles.reportStatChip}>
                            <Text style={[styles.reportStatChipLabel, { color: colors.warning }]}>
                              {t('attAdm.status.late')}
                            </Text>
                            <Text style={styles.reportStatChipText}>{e.late ?? 0}</Text>
                          </View>
                          <View style={styles.reportStatChip}>
                            <Text style={[styles.reportStatChipLabel, { color: colors.warning }]}>
                              {t('attAdm.status.earlyOut')}
                            </Text>
                            <Text style={styles.reportStatChipText}>{e.early_out ?? 0}</Text>
                          </View>
                          <View style={styles.reportStatChip}>
                            <Text style={[styles.reportStatChipLabel, { color: colors.error }]}>
                              {t('attAdm.status.absent')}
                            </Text>
                            <Text style={styles.reportStatChipText}>{e.absent ?? 0}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBar}
        showsHorizontalScrollIndicator={false}
      >
        {TABS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tab, tab === item.key && styles.tabActive]}
            onPress={() => setTab(item.key)}
            activeOpacity={0.85}
          >
            <Text
              style={[styles.tabText, tab === item.key && styles.tabTextActive]}
              numberOfLines={1}
            >
              {t(item.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
        title={t('attAdm.calib.title', {
          name: calib?.employee.name || calib?.employee.email || '',
        })}
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
              <Text style={styles.primaryBtnText}>{t('attAdm.save')}</Text>
            )}
          </TouchableOpacity>
        }
      >
        <Field
          label={t('attAdm.calib.date')}
          hint={calib?.day ? t('attAdm.calib.dateLocked') : t('attAdm.calib.needStatus')}
        >
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
        <Field label={t('attAdm.calib.status')}>
          <View style={styles.chipWrap}>
            {calib?.day ? (
              <Chip
                label={t('attAdm.calib.keepStatus')}
                active={!calibForm.status}
                onPress={() => setCalibForm((p) => ({ ...p, status: '' }))}
              />
            ) : null}
            {STATUSES.map((s) => (
              <Chip
                key={s}
                label={t(STATUS_META[s].key)}
                active={calibForm.status === s}
                onPress={() => setCalibForm((p) => ({ ...p, status: s }))}
              />
            ))}
          </View>
        </Field>
        <Field label={t('attAdm.calib.checkIn')}>
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
        <Field label={t('attAdm.calib.checkOut')}>
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
        <Field label={t('attAdm.calib.notes')}>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={calibForm.notes}
            onChangeText={(v) => setCalibForm((p) => ({ ...p, notes: v }))}
            placeholder={t('attAdm.calib.notesPlaceholder')}
            placeholderTextColor={colors.ink3}
            multiline
          />
        </Field>
      </Sheet>

      {/* 考勤组表单弹窗 */}
      <Sheet
        visible={!!groupModal}
        title={groupModal?.id ? t('attAdm.groups.editTitle') : t('attAdm.groups.createTitle')}
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
              <Text style={styles.primaryBtnText}>{t('attAdm.save')}</Text>
            )}
          </TouchableOpacity>
        }
      >
        <Field label={t('attAdm.groups.name')}>
          <TextInput
            style={styles.input}
            value={groupForm.name}
            onChangeText={(v) => setGroupForm((p) => ({ ...p, name: v }))}
            placeholder={t('attAdm.groups.namePlaceholder')}
            placeholderTextColor={colors.ink3}
          />
        </Field>
        <Field label={t('attAdm.groups.description')}>
          <TextInput
            style={styles.input}
            value={groupForm.description}
            onChangeText={(v) => setGroupForm((p) => ({ ...p, description: v }))}
            placeholder={t('attAdm.optional')}
            placeholderTextColor={colors.ink3}
          />
        </Field>
        <View style={styles.twoCol}>
          <Field label={t('attAdm.groups.workStart')} style={styles.flex1}>
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
          <Field label={t('attAdm.groups.workEnd')} style={styles.flex1}>
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
          <Field label={t('attAdm.groups.lateGrace')} style={styles.flex1}>
            <TextInput
              style={styles.input}
              value={groupForm.late_grace_minutes}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, late_grace_minutes: v }))}
              keyboardType="number-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
          <Field label={t('attAdm.groups.earlyGrace')} style={styles.flex1}>
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
          <Field label={t('attAdm.groups.lat')} style={styles.flex1}>
            <TextInput
              style={styles.input}
              value={groupForm.office_lat}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, office_lat: v }))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
          <Field label={t('attAdm.groups.lng')} style={styles.flex1}>
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
          <Field label={t('attAdm.groups.radiusKm')} style={styles.flex1}>
            <TextInput
              style={styles.input}
              value={groupForm.radius_km}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, radius_km: v }))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
          <Field label={t('attAdm.groups.utc')} style={styles.flex1}>
            <TextInput
              style={styles.input}
              value={groupForm.utc_offset_hours}
              onChangeText={(v) => setGroupForm((p) => ({ ...p, utc_offset_hours: v }))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.ink3}
            />
          </Field>
        </View>
        <Field label={t('attAdm.field.dept')} hint={t('attAdm.groups.deptHint')}>
          <TextInput
            style={styles.input}
            value={groupForm.department}
            onChangeText={(v) => setGroupForm((p) => ({ ...p, department: v }))}
            placeholder={t('attAdm.optional')}
            placeholderTextColor={colors.ink3}
          />
        </Field>
        <Field label={t('attAdm.groups.defaultField')}>
          <View style={styles.chipWrap}>
            <Chip
              label={t('attAdm.yes')}
              active={groupForm.is_default}
              onPress={() => setGroupForm((p) => ({ ...p, is_default: true }))}
            />
            <Chip
              label={t('attAdm.no')}
              active={!groupForm.is_default}
              onPress={() => setGroupForm((p) => ({ ...p, is_default: false }))}
            />
          </View>
        </Field>
        <Field label={t('attAdm.groups.activeField')}>
          <View style={styles.chipWrap}>
            <Chip
              label={t('attAdm.groups.enable')}
              active={groupForm.is_active}
              onPress={() => setGroupForm((p) => ({ ...p, is_active: true }))}
            />
            <Chip
              label={t('attAdm.groups.disable')}
              active={!groupForm.is_active}
              onPress={() => setGroupForm((p) => ({ ...p, is_active: false }))}
            />
          </View>
        </Field>
      </Sheet>

      {/* 成员管理弹窗 */}
      <Sheet
        visible={!!membersModal}
        title={t('attAdm.members.title', { name: membersModal?.name ?? '' })}
        onClose={() => setMembersModal(null)}
      >
        <Field label={t('attAdm.members.current', { n: members.length })}>
          {members.length === 0 ? (
            <Text style={styles.emptyHint}>{t('attAdm.members.empty')}</Text>
          ) : (
            members.map((m) => (
              <View key={m.employee_id} style={styles.memberRow}>
                <View style={styles.flex1}>
                  <Text style={styles.empName}>{m.name || m.email || m.employee_id}</Text>
                  <Text style={styles.empSub}>{m.department || t('attAdm.noDept')}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.ghostBtn, styles.ghostBtnDanger]}
                  onPress={() => dropMember(m.employee_id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.ghostBtnText, styles.ghostBtnTextDanger]}>
                    {t('attAdm.members.remove')}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </Field>

        <Field
          label={t('attAdm.members.addTitle')}
          hint={t('attAdm.members.addHint')}
        >
          <TextInput
            style={styles.input}
            value={memberKw}
            onChangeText={setMemberKw}
            placeholder={t('attAdm.members.searchPlaceholder')}
            placeholderTextColor={colors.ink3}
          />
          <View style={styles.chipWrap}>
            {filteredEmployees.length === 0 ? (
              <Text style={styles.emptyHint}>{t('attAdm.members.noMatch')}</Text>
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
          <Text style={styles.primaryBtnText}>
            {t('attAdm.members.addSelected', { n: pickedEmployees.length })}
          </Text>
        </TouchableOpacity>
      </Sheet>

      {/* 审批弹窗 */}
      <Sheet
        visible={!!review}
        title={
          review?.action === 'approved'
            ? t('attAdm.review.approveTitle')
            : t('attAdm.review.rejectTitle')
        }
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
              <Text style={styles.primaryBtnText}>{t('common.confirm')}</Text>
            )}
          </TouchableOpacity>
        }
      >
        {review ? (
          <>
            <Text style={styles.reviewSummary}>
              {review.leave.name} ·{' '}
              {LEAVE_TYPE_LABEL[review.leave.leave_type]
                ? t(LEAVE_TYPE_LABEL[review.leave.leave_type])
                : review.leave.leave_type}{' '}
              · {review.leave.start_date} ~ {review.leave.end_date} ·{' '}
              {t('attAdm.leave.daysValue', { n: review.leave.days })}
            </Text>
            <Field label={t('attAdm.review.note')}>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={replyNote}
                onChangeText={setReplyNote}
                placeholder={t('attAdm.review.notePlaceholder')}
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

  tabBarScroll: { flexGrow: 0, flexShrink: 0 },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.ink2, textAlign: 'center', lineHeight: 18 },
  tabTextActive: { color: colors.primaryForeground },

  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
  },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2, flexShrink: 1 },
  cardCaption: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  cardHint: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 6, lineHeight: 16 },

  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  field: { marginTop: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink2,
    marginBottom: 6,
    // 泰文长标签可能两行：统一给两行高度，保证两列表单输入框基线对齐
    minHeight: 34,
  },
  fieldHint: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 4, lineHeight: colors.lineHeight.tight},
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    minHeight: colors.touch.chip,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.fieldFillBorder,
    maxWidth: '100%',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink2, fontWeight: '500', flexShrink: 1 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  input: {
    width: '100%',
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
  twoCol: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  flex1: { flex: 1 },

  primaryBtn: {
    minHeight: 42,
    marginTop: 14,
    paddingVertical: 9,
    paddingHorizontal: 14,
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
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '600', lineHeight: colors.lineHeight.tight},

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
  // 右侧徽标 + 校准按钮固定不被压缩，把窄屏余量留给左侧日期/备注
  dayRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  dayDate: { fontSize: 13, fontWeight: '600', color: colors.ink },
  daySub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2, lineHeight: colors.lineHeight.tight},
  emptyHint: { fontSize: 12, color: colors.ink3, paddingVertical: 8 },

  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  groupName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  metaItem: { width: '50%', marginTop: 10, paddingRight: 8 },
  metaLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, marginBottom: 3, lineHeight: colors.lineHeight.tight},
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
    minHeight: 96,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  kpiLabel: { fontSize: 12, color: colors.ink3, fontWeight: '500', lineHeight: 16, flexShrink: 1 },
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
  th: { flex: 1, fontSize: colors.fontSize.xs, color: colors.ink3, fontWeight: '600', textAlign: 'center', lineHeight: colors.lineHeight.tight},
  td: { flex: 1, fontSize: 12, color: colors.ink2, textAlign: 'center' },
  tdStrong: { color: colors.ink, fontWeight: '600', textAlign: 'left' },
  tdWarn: { color: colors.warning, fontWeight: '700' },
  cellDept: { flex: 1.6 },
  cellEmp: { flex: 1.8 },

  // --- 异常报表 · 卡片流（替代 tableHead / tableRow）---
  reportList: { gap: 10 },
  reportCard: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reportCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  reportCardIcon: { fontSize: 16, marginRight: 6 },
  reportCardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
  },
  reportCardEmail: { fontSize: colors.fontSize.xs, color: colors.ink3, fontWeight: '500', lineHeight: colors.lineHeight.tight},
  reportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: colors.radius.full,
  },
  reportBadgeText: { fontSize: 12, fontWeight: '700' },
  reportStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  reportStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  reportStatChipText: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
  reportStatChipLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: colors.lineHeight.tight},

  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  trendLabel: { width: 40, fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: colors.lineHeight.tight},
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
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    maxHeight: '88%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { flex: 1, paddingRight: 8, fontSize: 16, fontWeight: '700', color: colors.ink },
  sheetBody: { paddingHorizontal: colors.spacing.lg },
  sheetBodyContent: { paddingBottom: 8 },
  sheetFooter: { paddingHorizontal: colors.spacing.lg, paddingVertical: 14 },
});