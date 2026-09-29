import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import colors from '@/theme/colors';
import api from '@/lib/api';
import { geoApi, attendanceApi } from '@/services/api';
import { useI18n } from '@/i18n';
import { notify, notifyError } from '@/utils/feedback';

// 打卡半径兜底（业务确认 C6：考勤地图定位；500 米）
const RADIUS_KM = 0.5;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CAL_WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const CAL_LEGEND: AttStatus[] = ['present', 'late', 'early_out', 'absent', 'leave', 'field_work'];

// 页签导航（打卡 / 统计 / 申请）
type CheckinTab = 'checkin' | 'apply' | 'stats';
// 底部导航对齐企业微信「打卡」模块：员工端为 打卡 / 申请 / 统计（官方为
// 打卡 / 申请 / 统计 / 考勤机，本项目无考勤机硬件故不设该项），图标+文字等宽排列
const CHECKIN_TABS: {
  key: CheckinTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'checkin', label: '打卡', icon: 'location' },
  { key: 'apply', label: '申请', icon: 'document-text' },
  { key: 'stats', label: '统计', icon: 'stats-chart' },
];

type AttStatus = 'present' | 'late' | 'early_out' | 'absent' | 'leave' | 'field_work';

interface TodayInfo {
  checked_in: boolean;
  checked_out: boolean;
  status?: AttStatus | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  radius_km?: number;
  late_minutes?: number | null;
  early_out_minutes?: number | null;
  work_start?: string | null;
  work_end?: string | null;
  group_name?: string | null;
  office?: { lat?: number | null; lng?: number | null } | null;
  check_in_location?: { address?: string; within_radius?: boolean } | null;
}

interface AttRecord {
  id: string;
  date: string;
  status: AttStatus;
  check_in_time?: string | null;
  check_out_time?: string | null;
  check_in_location?: { address?: string; within_radius?: boolean } | null;
  notes?: string | null;
}

const STATUS_META: Record<AttStatus, { label: string; color: string; bg: string }> = {
  present: {
    label: '正常',
    color: colors.success,
    bg: colors.alpha(colors.successRgb, 0.12),
  },
  late: {
    label: '迟到',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
  early_out: {
    label: '早退',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
  absent: {
    label: '缺勤',
    color: colors.error,
    bg: colors.alpha(colors.errorRgb, 0.12),
  },
  leave: { label: '请假', color: colors.ink2, bg: colors.surface2 },
  field_work: {
    label: '外勤',
    color: colors.info,
    bg: colors.alpha(colors.infoRgb, 0.12),
  },
};

const fmtTime = (iso?: string | null) => (iso ? dayjs(iso).format('HH:mm') : '--:--');

/** 解析 "HH:MM" 为当日分钟数，非法返回 null（不猜） */
const parseHM = (v?: string | null): number | null => {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/** 两点球面距离（公里）——Haversine，纯函数，无外部依赖 */
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** 打卡按钮 5 态 */
type CheckPhase = 'before' | 'checkin' | 'checkedin' | 'checkout' | 'done';
type GpsStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'error';

// —— 员工自助：我的考勤规则 / 请假申请 / 请假记录 ——
type LeaveType = 'annual' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'other';
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'unpaid', 'maternity', 'other'];
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

interface MyRule {
  group_id: string | null;
  group_name: string | null;
  office_lat?: number | null;
  office_lng?: number | null;
  radius_km?: number | null;
  utc_offset_hours?: number | null;
  work_start?: string | null;
  work_end?: string | null;
  late_grace_minutes?: number | null;
  early_grace_minutes?: number | null;
}

interface LeaveReq {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reply_note?: string | null;
}

type AppealStatus = 'pending' | 'approved' | 'rejected';

interface AppealReq {
  id: string;
  date: string;
  reason: string;
  status: AppealStatus;
  reply_note?: string | null;
}

const APPEAL_STATUS_META: Record<
  AppealStatus,
  { labelKey: string; color: string; bg: string }
> = {
  pending: { labelKey: 'att.appealStatus.pending', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  approved: { labelKey: 'att.appealStatus.approved', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
  rejected: { labelKey: 'att.appealStatus.rejected', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.12) },
};

const DATE_HINT = 'YYYY-MM-DD';
const isDateStr = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

export default function AttendanceScreen() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState<TodayInfo | null>(null);
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [checking, setChecking] = useState<'checkin' | 'checkout' | null>(null);
  const [now, setNow] = useState(() => new Date());

  // 页签导航：默认打卡；数据仍一次性加载，切页签只切内容、不重新请求
  const [tab, setTab] = useState<CheckinTab>('checkin');
  const scrollRef = useRef<ScrollView>(null);
  // 底部页签栏贴屏幕底边，需自行处理 iPhone 底部安全区（自绘栏不像 TabNavigator 会自动处理）
  const insets = useSafeAreaInsets();
  const switchTab = (next: CheckinTab) => {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // 定位状态（打卡范围校验）
  const [geoInfo, setGeoInfo] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');

  // 员工自助：我的考勤规则 / 请假申请 / 请假记录
  const [myRule, setMyRule] = useState<MyRule | null>(null);
  const [leaves, setLeaves] = useState<LeaveReq[]>([]);
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [leaveStart, setLeaveStart] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [leaveEnd, setLeaveEnd] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [leaveReason, setLeaveReason] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // 打卡异常申诉（提交表单 + 我的申诉列表）
  const [appeals, setAppeals] = useState<AppealReq[]>([]);
  const [appealDate, setAppealDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [appealReason, setAppealReason] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  // 外勤登记（默认收起）
  const [tripOpen, setTripOpen] = useState(false);
  const [tripDate, setTripDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [tripReason, setTripReason] = useState('');
  const [submittingTrip, setSubmittingTrip] = useState(false);

  // 打卡大卡的实时时钟
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const [todayRes, recordsRes, ruleRes, leaveRes, appealRes] = await Promise.allSettled([
      attendanceApi.today(),
      api.get('/attendance/me'),
      attendanceApi.myRule(),
      attendanceApi.leaveRequests(),
      attendanceApi.appeals(),
    ]);
    if (todayRes.status === 'rejected') {
      notifyError('加载今日考勤失败', todayRes.reason);
    }
    setToday(
      todayRes.status === 'fulfilled' ? ((todayRes.value.data as TodayInfo) ?? null) : null,
    );
    setRecords(
      recordsRes.status === 'fulfilled' && Array.isArray(recordsRes.value.data)
        ? (recordsRes.value.data as AttRecord[])
        : [],
    );
    setMyRule(
      ruleRes.status === 'fulfilled' ? ((ruleRes.value.data as MyRule) ?? null) : null,
    );
    setLeaves(
      leaveRes.status === 'fulfilled' && Array.isArray(leaveRes.value.data)
        ? (leaveRes.value.data as LeaveReq[])
        : [],
    );
    setAppeals(
      appealRes.status === 'fulfilled' && Array.isArray(appealRes.value.data)
        ? (appealRes.value.data as AppealReq[])
        : [],
    );
  }, []);

  // 读取当前定位（不弹授权框，仅消费已授权状态）
  const locate = useCallback(async () => {
    setGpsStatus('locating');
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        setGeoInfo(null);
        setGpsStatus('denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setGeoInfo({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setGpsStatus('ok');
    } catch {
      setGeoInfo(null);
      setGpsStatus('error');
    }
  }, []);

  // 主动申请定位权限后重新定位
  const enableLocation = async () => {
    setGpsStatus('locating');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGeoInfo(null);
        setGpsStatus('denied');
        return;
      }
      await locate();
    } catch {
      setGeoInfo(null);
      setGpsStatus('error');
    }
  };

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  useEffect(() => {
    void locate();
  }, [locate]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    void locate();
    setRefreshing(false);
  };

  // 请假天数（自然日预览，最终以后端计算为准）
  const leaveDays = useMemo(() => {
    if (!isDateStr(leaveStart) || !isDateStr(leaveEnd)) return 0;
    const diff = dayjs(leaveEnd).diff(dayjs(leaveStart), 'day') + 1;
    return diff > 0 ? diff : 0;
  }, [leaveStart, leaveEnd]);

  const submitLeave = async () => {
    if (!isDateStr(leaveStart) || !isDateStr(leaveEnd)) {
      notify('日期格式不正确', `请使用 ${DATE_HINT}`);
      return;
    }
    if (dayjs(leaveStart).isBefore(dayjs(), 'day')) {
      notify('开始日期不能早于今天', undefined);
      return;
    }
    if (dayjs(leaveEnd).isBefore(dayjs(leaveStart), 'day')) {
      notify('结束日期不能早于开始日期', undefined);
      return;
    }
    if (!leaveReason.trim()) {
      notify('请填写请假事由', undefined);
      return;
    }
    setSubmittingLeave(true);
    try {
      await attendanceApi.applyLeave({
        leave_type: leaveType,
        start_date: leaveStart,
        end_date: leaveEnd,
        reason: leaveReason.trim(),
      });
      notify('申请已提交', '等待管理员审批');
      setLeaveReason('');
      await load();
    } catch (err) {
      notifyError('提交请假申请失败', err);
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleCancelLeave = (item: LeaveReq) => {
    const doCancel = async () => {
      try {
        await attendanceApi.cancelLeave(item.id);
        notify('已撤销', '请假申请已取消');
        await load();
      } catch (err) {
        notifyError('撤销失败', err);
      }
    };
    Alert.alert(
      '撤销申请',
      `确定撤销 ${item.start_date} ~ ${item.end_date}（${item.days} 天）的请假申请吗？`,
      [
        { text: '取消', style: 'cancel' },
        { text: '撤销', style: 'destructive', onPress: doCancel },
      ],
    );
  };

  const submitAppeal = async () => {
    if (!isDateStr(appealDate)) {
      notify('日期格式不正确', `请使用 ${DATE_HINT}`);
      return;
    }
    if (!appealReason.trim()) {
      notify(t('att.appealReason'), t('att.appealPlaceholder'));
      return;
    }
    setSubmittingAppeal(true);
    try {
      await attendanceApi.applyAppeal({
        date: appealDate,
        reason: appealReason.trim(),
      });
      notify(t('att.appealSubmitted'), undefined);
      setAppealReason('');
      await load();
    } catch (err) {
      notifyError(t('att.appealSubmit'), err);
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const monthRecords = useMemo(
    () => records.filter((r) => dayjs(r.date).isSame(dayjs(), 'month')),
    [records],
  );

  const stats = useMemo(() => {
    const count = (s: AttStatus) => monthRecords.filter((r) => r.status === s).length;
    const lastLabel = (s: AttStatus, empty: string) => {
      const list = monthRecords.filter((r) => r.status === s);
      if (list.length === 0) return empty;
      const latest = list.reduce((a, b) => (dayjs(b.date).isAfter(dayjs(a.date)) ? b : a));
      return `最近 ${dayjs(latest.date).format('M月D日')}`;
    };
    return {
      present: count('present') + count('late') + count('early_out') + count('field_work'),
      late: count('late'),
      earlyOut: count('early_out'),
      leave: count('leave'),
      leaveHint: lastLabel('leave', '本月无请假'),
    };
  }, [monthRecords]);

  // 上月迟到次数（用于「较上月」环比提示）
  const lastMonthLate = useMemo(
    () =>
      records.filter(
        (r) => r.status === 'late' && dayjs(r.date).isSame(dayjs().subtract(1, 'month'), 'month'),
      ).length,
    [records],
  );

  // 本月工作日（对照出勤天数，仅按自然周周一至周五）
  const workdays = useMemo(() => {
    const days = dayjs().daysInMonth();
    let n = 0;
    for (let i = 0; i < days; i += 1) {
      const w = dayjs().startOf('month').add(i, 'day').day();
      if (w !== 0 && w !== 6) n += 1;
    }
    return n;
  }, []);

  // 办公点坐标（考勤规则优先，其次今日接口返回的 office）
  const office = useMemo(() => {
    const lat = myRule?.office_lat ?? today?.office?.lat ?? null;
    const lng = myRule?.office_lng ?? today?.office?.lng ?? null;
    return lat != null && lng != null ? { lat, lng } : null;
  }, [myRule, today]);

  const radiusKm = myRule?.radius_km ?? today?.radius_km ?? RADIUS_KM;

  const distanceKm = useMemo(() => {
    if (!geoInfo || !office) return null;
    return haversineKm(geoInfo.latitude, geoInfo.longitude, office.lat, office.lng);
  }, [geoInfo, office]);

  const withinRadius = distanceKm != null ? distanceKm <= radiusKm : null;

  const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('att.noPermTitle'), t('att.noPermMsg'));
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({});
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      Alert.alert(t('att.locFailTitle'), t('att.locFailMsg'));
      return null;
    }
  };

  const handleCheckIn = async () => {
    const coord = await getCurrentLocation();
    if (!coord) return;
    await doCheck(coord, 'checkin');
  };

  const handleCheckOut = async () => {
    const coord = await getCurrentLocation();
    if (!coord) return;
    await doCheck(coord, 'checkout');
  };

  const doCheck = async (
    coord: { latitude: number; longitude: number },
    type: 'checkin' | 'checkout',
  ) => {
    setChecking(type);
    try {
      // 调 geoApi.attendance 做半径校验（默认 500 米）
      const gRes = await geoApi.attendance(coord.latitude, coord.longitude);
      const gd = gRes.data as { within_radius?: boolean; distance_km?: number };
      const within = gd?.within_radius ?? (gd?.distance_km ?? 99) <= RADIUS_KM;

      if (within) {
        if (type === 'checkin') {
          await attendanceApi.checkIn({ lat: coord.latitude, lng: coord.longitude });
        } else {
          await attendanceApi.checkOut({ lat: coord.latitude, lng: coord.longitude });
        }
        notify('打卡成功', type === 'checkin' ? '已签到' : '已签退');
        await load();
        void locate();
      } else {
        // 不在半径内，自动登记外勤并引导补充事由
        try {
          await attendanceApi.createExternalTrip({
            trip_date: dayjs().format('YYYY-MM-DD'),
            to_lat: coord.latitude,
            to_lng: coord.longitude,
            reason: '远程考勤打卡',
          });
        } catch {
          // 外勤申请提交失败不阻断提示
        }
        notify(
          '不在打卡半径内',
          `您距离打卡点超过 ${RADIUS_KM * 1000} 米，已为您登记外勤，可在「申请」页签补充事由。`,
        );
        // 外勤登记表单在「申请」页签且默认收起：不切页签+展开的话用户看不到要填的表单
        setTripOpen(true);
        switchTab('apply');
      }
    } catch (err: any) {
      notifyError('打卡失败', err);
    } finally {
      setChecking(null);
    }
  };

  const submitTrip = async () => {
    if (!isDateStr(tripDate)) {
      notify('日期格式不正确', `请使用 ${DATE_HINT}`);
      return;
    }
    if (!tripReason.trim()) {
      notify('请填写外勤事由', undefined);
      return;
    }
    const coord = await getCurrentLocation();
    if (!coord) return;
    setSubmittingTrip(true);
    try {
      await attendanceApi.createExternalTrip({
        trip_date: tripDate,
        to_lat: coord.latitude,
        to_lng: coord.longitude,
        reason: tripReason.trim(),
      });
      notify('外勤登记已提交', '等待管理员审批');
      setTripReason('');
      await load();
    } catch (err) {
      notifyError('外勤登记提交失败', err);
    } finally {
      setSubmittingTrip(false);
    }
  };

  // —— 打卡按钮 5 态判定（当前时间 vs 作息，及今日上下班记录）——
  const checkedIn = !!today?.checked_in;
  const checkedOut = !!today?.checked_out;
  const workStart = myRule?.work_start ?? today?.work_start ?? null;
  const workEnd = myRule?.work_end ?? today?.work_end ?? null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMin = parseHM(workStart);
  const endMin = parseHM(workEnd);

  const phase: CheckPhase = (() => {
    if (checkedIn && checkedOut) return 'done';
    if (!checkedIn) {
      if (startMin != null && nowMinutes < startMin) return 'before';
      return 'checkin';
    }
    if (endMin != null && nowMinutes < endMin) return 'checkedin';
    return 'checkout';
  })();

  const dialActive = phase === 'checkin' || phase === 'checkout';
  const dialLabel =
    phase === 'before'
      ? '未到上班时间'
      : phase === 'checkin'
        ? '上班打卡'
        : phase === 'checkedin'
          ? '已打卡上班'
          : phase === 'checkout'
            ? '下班打卡'
            : '今日打卡已完成';
  const dialHint =
    phase === 'checkedin'
      ? `上班打卡 ${fmtTime(today?.check_in_time)} · 下班时间 ${workEnd ?? '--:--'}`
      : phase === 'done'
        ? `上班 ${fmtTime(today?.check_in_time)} · 下班 ${fmtTime(today?.check_out_time)}`
        : phase === 'checkout'
          ? `下班时间 ${workEnd ?? '--:--'}`
          : `上班时间 ${workStart ?? '--:--'}`;

  const onDialPress = () => {
    if (checking !== null || !dialActive) return;
    if (phase === 'checkin') void handleCheckIn();
    else if (phase === 'checkout') void handleCheckOut();
  };

  // 本月日历网格
  const calendar = useMemo(() => {
    const start = dayjs().startOf('month');
    const total = start.daysInMonth();
    const lead = (start.day() + 6) % 7; // 周一为一周起始
    const byDate = new Map<string, AttRecord>();
    monthRecords.forEach((r) => byDate.set(dayjs(r.date).format('YYYY-MM-DD'), r));
    const cells: (number | null)[] = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let d = 1; d <= total; d += 1) cells.push(d);
    return { start, cells, byDate };
  }, [monthRecords]);

  // 近期打卡明细：月历只能表达状态色块，当天的上下班时间与备注必须单独列出，否则信息丢失
  const recentRecords = useMemo(
    () =>
      [...monthRecords]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 10),
    [monthRecords],
  );
  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label="加载考勤数据…" />
      </View>
    );
  }

  const groupName = myRule?.group_name || today?.group_name || '默认打卡点';
  const distanceM = distanceKm != null ? Math.round(distanceKm * 1000) : null;
  const distanceText =
    distanceKm == null
      ? null
      : distanceKm >= 1
        ? `${distanceKm.toFixed(1)} 公里`
        : `${distanceM} 米`;

  const locSub: string = (() => {
    if (gpsStatus === 'locating' || gpsStatus === 'idle') return '正在定位…';
    if (gpsStatus === 'denied') return '未授权定位，无法校验打卡范围';
    if (gpsStatus === 'error') return '定位失败，请点击重试';
    if (distanceText == null) return `已定位 · 允许范围 ${Math.round(radiusKm * 1000)} 米`;
    return withinRadius
      ? `距打卡点约 ${distanceText} · 允许范围 ${Math.round(radiusKm * 1000)} 米`
      : `距打卡点 ${distanceText}（超出范围）`;
  })();

  const locPill: { label: string; color: string; bg: string } | null = (() => {
    if (gpsStatus !== 'ok' || withinRadius == null) return null;
    return withinRadius
      ? { label: t('att.inRange'), color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) }
      : { label: t('att.outOfRange'), color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) };
  })();

  const inBadge = !checkedIn
    ? { label: '未打卡', color: colors.ink3, bg: colors.surface2 }
    : (today?.late_minutes ?? 0) > 0
      ? {
          label: `迟到 ${today?.late_minutes} 分钟`,
          color: colors.warning,
          bg: colors.alpha(colors.warningRgb, 0.12),
        }
      : today?.status === 'field_work'
        ? { label: '外勤', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.12) }
        : { label: '正常', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) };

  const outBadge = !checkedOut
    ? { label: '未打卡', color: colors.ink3, bg: colors.surface2 }
    : (today?.early_out_minutes ?? 0) > 0
      ? {
          label: `早退 ${today?.early_out_minutes} 分钟`,
          color: colors.warning,
          bg: colors.alpha(colors.warningRgb, 0.12),
        }
      : { label: '正常', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) };

  const overviewItems: {
    key: string;
    label: string;
    value: number;
    unit: string;
    color: string;
    caption: string;
  }[] = [
    {
      key: 'present',
      label: '出勤',
      value: stats.present,
      unit: '天',
      color: colors.ink,
      caption: `应出勤 ${workdays} 天`,
    },
    {
      key: 'late',
      label: '迟到',
      value: stats.late,
      unit: '次',
      color: colors.warning,
      caption:
        stats.late === lastMonthLate
          ? '较上月持平'
          : stats.late > lastMonthLate
            ? `较上月多 ${stats.late - lastMonthLate} 次`
            : `较上月少 ${lastMonthLate - stats.late} 次`,
    },
    {
      key: 'early',
      label: '早退',
      value: stats.earlyOut,
      unit: '次',
      color: colors.warning,
      caption: stats.earlyOut === 0 ? '本月无早退' : '本月累计',
    },
    {
      key: 'leave',
      label: '请假',
      value: stats.leave,
      unit: '天',
      color: colors.ink,
      caption: stats.leaveHint,
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {tab === 'stats' && (
          <>
        {/* ① 当月统计概览条 */}
        <View style={styles.overviewCard}>
          {overviewItems.map((it, i) => (
            <React.Fragment key={it.key}>
              {i > 0 ? <View style={styles.overviewDivider} /> : null}
              <View style={styles.overviewItem}>
                <Text style={[styles.overviewValue, { color: it.color }]}>
                  {it.value}
                  <Text style={styles.overviewUnit}> {it.unit}</Text>
                </Text>
                <Text style={styles.overviewLabel}>{it.label}</Text>
                <Text style={styles.overviewCaption} numberOfLines={1}>
                  {it.caption}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
          </>
        )}

        {tab === 'checkin' && (
          <>
        {/* ② 定位状态卡 */}
        <View style={styles.locCard}>
          <View
            style={[
              styles.locIconWrap,
              {
                backgroundColor:
                  gpsStatus === 'ok' && withinRadius === false
                    ? colors.alpha(colors.warningRgb, 0.12)
                    : colors.alpha(colors.primaryRgb, 0.1),
              },
            ]}
          >
            <Ionicons
              name={
                gpsStatus === 'ok' && withinRadius
                  ? 'checkmark-circle'
                  : gpsStatus === 'ok' && withinRadius === false
                    ? 'navigate-outline'
                    : 'location-outline'
              }
              size={20}
              color={
                gpsStatus === 'ok' && withinRadius === false ? colors.warning : colors.primary
              }
            />
          </View>
          <View style={styles.locBody}>
            <Text style={styles.locTitle} numberOfLines={1}>
              {groupName}
            </Text>
            <Text
              style={[
                styles.locSub,
                gpsStatus === 'ok' && withinRadius === false && styles.locSubWarn,
                gpsStatus === 'ok' && withinRadius === true && styles.locSubOk,
              ]}
              numberOfLines={2}
            >
              {locSub}
            </Text>
          </View>
          {locPill ? (
            <View style={[styles.locPill, { backgroundColor: locPill.bg }]}>
              <Text style={[styles.locPillText, { color: locPill.color }]}>{locPill.label}</Text>
            </View>
          ) : gpsStatus === 'denied' || gpsStatus === 'error' ? (
            <TouchableOpacity
              style={styles.locActionBtn}
              onPress={enableLocation}
              activeOpacity={0.8}
            >
              <Text style={styles.locActionText}>
                {gpsStatus === 'denied' ? '允许定位' : '重试'}
              </Text>
            </TouchableOpacity>
          ) : (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
        </View>

        {/* ③ 超大圆形打卡按钮 */}
        <View style={styles.dialSection}>
          <View style={[styles.dialOuter, dialActive ? styles.dialOuterActive : styles.dialOuterIdle]}>
            <TouchableOpacity
              style={[styles.dial, dialActive ? styles.dialActive : styles.dialIdle, !dialActive && styles.dialDisabled]}
              onPress={onDialPress}
              disabled={checking !== null || !dialActive}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={dialLabel}
              accessibilityState={{ disabled: checking !== null || !dialActive }}
            >
              <Text style={[styles.dialClock, dialActive ? styles.dialTextOn : styles.dialTextOff]}>
                {dayjs(now).format('HH:mm:ss')}
              </Text>
              {checking !== null ? (
                <ActivityIndicator
                  size="small"
                  color={dialActive ? colors.primaryForeground : colors.ink2}
                />
              ) : (
                <Text style={[styles.dialLabel, dialActive ? styles.dialTextOn : styles.dialTextOff]}>
                  {dialLabel}
                </Text>
              )}
              <Text
                style={[styles.dialDate, dialActive ? styles.dialDateOn : styles.dialTextOff]}
              >
                {dayjs(now).format('M月D日')} · {WEEKDAYS[now.getDay()]}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dialHint}>{dialHint}</Text>
        </View>

        {/* ④ 今日打卡记录 */}
        <Text style={styles.sectionTitle}>今日打卡</Text>
        <View style={styles.todayCard}>
          <View style={[styles.todayRow, styles.todayRowFirst]}>
            <Text style={styles.todayLabel}>上班打卡</Text>
            <Text style={styles.todayValue}>{fmtTime(today?.check_in_time)}</Text>
            <View style={[styles.todayBadge, { backgroundColor: inBadge.bg }]}>
              <Text style={[styles.todayBadgeText, { color: inBadge.color }]}>{inBadge.label}</Text>
            </View>
          </View>
          <View style={styles.todayRow}>
            <Text style={styles.todayLabel}>下班打卡</Text>
            <Text style={styles.todayValue}>{fmtTime(today?.check_out_time)}</Text>
            <View style={[styles.todayBadge, { backgroundColor: outBadge.bg }]}>
              <Text style={[styles.todayBadgeText, { color: outBadge.color }]}>
                {outBadge.label}
              </Text>
            </View>
          </View>
          {checkedIn && today?.check_in_location?.address ? (
            <Text style={styles.todayPlace} numberOfLines={2}>
              打卡地点：{today.check_in_location.address}
            </Text>
          ) : null}
        </View>
          </>
        )}

        {tab === 'stats' && (
          <>
        {/* ⑤ 打卡日历（月视图） */}
        <Text style={styles.sectionTitle}>打卡日历</Text>
        <View style={styles.calCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{dayjs().format('YYYY年M月')}</Text>
            <Text style={styles.cardHeadSub}>本月 {monthRecords.length} 天有记录</Text>
          </View>
          <View style={styles.calWeekRow}>
            {CAL_WEEK.map((w) => (
              <Text key={w} style={styles.calWeekText}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {calendar.cells.map((d, i) => {
              if (d === null) {
                return <View key={`blank-${i}`} style={styles.calCell} />;
              }
              const dateKey = calendar.start.date(d).format('YYYY-MM-DD');
              const rec = calendar.byDate.get(dateKey);
              const isToday = dayjs().isSame(calendar.start.date(d), 'day');
              const meta = rec ? STATUS_META[rec.status] : null;
              const isRest = calendar.start.date(d).day() === 0 || calendar.start.date(d).day() === 6;
              return (
                <View key={dateKey} style={styles.calCell}>
                  <View
                    style={[
                      styles.calDayWrap,
                      isToday && styles.calDayToday,
                      !isToday && isRest && styles.calDayRest,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calDayText,
                        isToday && styles.calDayTextToday,
                        !isToday && isRest && styles.calDayTextRest,
                      ]}
                    >
                      {d}
                    </Text>
                    {meta ? (
                      <View style={[styles.calDot, { backgroundColor: meta.color }]} />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.legendRow}>
            {CAL_LEGEND.map((s) => (
              <View key={s} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: STATUS_META[s].color }]} />
                <Text style={styles.legendText}>{STATUS_META[s].label}</Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>{t('att.workday')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.surface2 }]} />
              <Text style={styles.legendText}>{t('att.restday')}</Text>
            </View>
          </View>
        </View>

        {/* ⑤-2 近期打卡明细（补足月历看不到的具体上下班时间与备注） */}
        <Text style={styles.sectionTitle}>近期打卡记录</Text>
        <View style={styles.recCard}>
          {recentRecords.length === 0 ? (
            <EmptyState icon="list-outline" title="暂无考勤记录" sub="完成打卡后这里会显示明细" />
          ) : (
            recentRecords.map((r, idx) => {
              const meta = STATUS_META[r.status];
              const dt = dayjs(r.date);
              const isToday = dt.isSame(dayjs(), 'day');
              return (
                <View
                  key={r.id ?? r.date}
                  style={[styles.recRow, idx === recentRecords.length - 1 && styles.recRowLast]}
                >
                  <View style={styles.recRowMain}>
                    <Text style={styles.recDate}>
                      {dt.format('M月D日')}
                      <Text style={styles.recWeek}> 周{WEEK_CN[dt.day()]}</Text>
                      {isToday ? <Text style={styles.recToday}> 今天</Text> : null}
                    </Text>
                    <View style={[styles.recBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.recBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <View style={styles.recRowSub}>
                    <Text style={styles.recTimes}>
                      上班 {fmtTime(r.check_in_time)} · 下班 {fmtTime(r.check_out_time)}
                    </Text>
                    {r.check_in_location?.address ? (
                      <Text style={styles.recAddr} numberOfLines={1}>
                        {r.check_in_location.address}
                      </Text>
                    ) : null}
                    {r.notes ? (
                      <Text style={styles.recNote} numberOfLines={1}>
                        {r.notes}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>
          </>
        )}

        {tab === 'checkin' && (
          <>
        {/* ⑥ 我的考勤规则 */}
        <Text style={styles.sectionTitle}>我的考勤规则</Text>
        <View style={styles.ruleCard}>
          <View style={styles.ruleHead}>
            <Ionicons name="business-outline" size={18} color={colors.primary} />
            <Text style={styles.ruleName} numberOfLines={1}>
              {myRule?.group_id ? myRule.group_name || '考勤组' : '默认规则'}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>作息时间</Text>
            <Text style={styles.ruleRowValue}>
              {workStart ?? '--:--'} - {workEnd ?? '--:--'}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>打卡半径</Text>
            <Text style={styles.ruleRowValue}>{Math.round(radiusKm * 1000)} 米</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>迟到 / 早退宽限</Text>
            <Text style={styles.ruleRowValue}>
              {myRule?.late_grace_minutes ?? 0} / {myRule?.early_grace_minutes ?? 0} 分
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>考勤时区</Text>
            <Text style={styles.ruleRowValue}>
              UTC+{myRule?.utc_offset_hours != null ? myRule.utc_offset_hours : 0}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>办公点</Text>
            <Text style={styles.ruleRowValue}>
              {office ? `${office.lat.toFixed(4)}, ${office.lng.toFixed(4)}` : '--'}
            </Text>
          </View>
        </View>
          </>
        )}

        {tab === 'apply' && (
          <>
        {/* ⑦ 请假申请 */}
        <Text style={styles.sectionTitle}>请假申请</Text>
        <View style={styles.leaveFormCard}>
          <Text style={styles.formLabel}>请假类型</Text>
          <View style={styles.chipWrap}>
            {LEAVE_TYPES.map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, leaveType === k && styles.chipActive]}
                onPress={() => setLeaveType(k)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, leaveType === k && styles.chipTextActive]}>
                  {LEAVE_TYPE_LABEL[k]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.formLabel}>开始日期</Text>
          <TextInput
            style={styles.formInput}
            value={leaveStart}
            onChangeText={setLeaveStart}
            placeholder={DATE_HINT}
            placeholderTextColor={colors.ink3}
            maxLength={10}
            autoCapitalize="none"
          />
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={styles.quickChip}
              onPress={() => {
                const d = dayjs().format('YYYY-MM-DD');
                setLeaveStart(d);
                if (dayjs(leaveEnd).isBefore(dayjs(d), 'day')) setLeaveEnd(d);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.quickChipText}>今天</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickChip}
              onPress={() => {
                const d = dayjs().add(1, 'day').format('YYYY-MM-DD');
                setLeaveStart(d);
                if (dayjs(leaveEnd).isBefore(dayjs(d), 'day')) setLeaveEnd(d);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.quickChipText}>明天</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formLabel}>结束日期</Text>
          <TextInput
            style={styles.formInput}
            value={leaveEnd}
            onChangeText={setLeaveEnd}
            placeholder={DATE_HINT}
            placeholderTextColor={colors.ink3}
            maxLength={10}
            autoCapitalize="none"
          />

          <View style={styles.daysRow}>
            <Text style={styles.formLabel}>请假天数</Text>
            <Text style={styles.daysValue}>{leaveDays} 天</Text>
          </View>

          <Text style={styles.formLabel}>请假事由</Text>
          <TextInput
            style={[styles.formInput, styles.formTextarea]}
            value={leaveReason}
            onChangeText={setLeaveReason}
            placeholder="请说明请假原因"
            placeholderTextColor={colors.ink3}
            multiline
          />

          <TouchableOpacity
            style={[styles.submitBtn, submittingLeave && styles.submitBtnDisabled]}
            onPress={submitLeave}
            disabled={submittingLeave}
            activeOpacity={0.85}
          >
            {submittingLeave ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={styles.submitBtnText}>提交申请</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ⑧ 外勤登记（默认收起） */}
        <View style={styles.tripCard}>
          <TouchableOpacity
            style={styles.tripHead}
            onPress={() => setTripOpen((v) => !v)}
            activeOpacity={0.8}
          >
            <View style={styles.tripTitleWrap}>
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
              <Text style={styles.tripTitle}>外勤登记</Text>
            </View>
            <Ionicons
              name={tripOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.ink3}
            />
          </TouchableOpacity>
          {tripOpen ? (
            <View style={styles.tripBody}>
              <Text style={styles.formLabel}>外勤日期</Text>
              <TextInput
                style={styles.formInput}
                value={tripDate}
                onChangeText={setTripDate}
                placeholder={DATE_HINT}
                placeholderTextColor={colors.ink3}
                maxLength={10}
                autoCapitalize="none"
              />
              <Text style={styles.formLabel}>外勤事由</Text>
              <TextInput
                style={[styles.formInput, styles.formTextarea]}
                value={tripReason}
                onChangeText={setTripReason}
                placeholder="请说明外勤原因"
                placeholderTextColor={colors.ink3}
                multiline
              />
              <Text style={styles.tripNote}>提交时将采集当前定位作为外勤地点，需管理员审批。</Text>
              <TouchableOpacity
                style={[styles.submitBtn, submittingTrip && styles.submitBtnDisabled]}
                onPress={submitTrip}
                disabled={submittingTrip}
                activeOpacity={0.85}
              >
                {submittingTrip ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.submitBtnText}>提交外勤登记</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* ⑨ 我的请假记录 */}
        <Text style={styles.sectionTitle}>我的请假记录</Text>
        <View style={styles.listCard}>
          {leaves.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="暂无请假申请"
              sub="提交后可在此查看审批进度并撤销待审批的申请"
            />
          ) : (
            leaves.map((l, idx) => {
              const meta = LEAVE_STATUS_META[l.status] ?? LEAVE_STATUS_META.pending;
              return (
                <View key={l.id ?? idx} style={[styles.leaveRow, idx === 0 && styles.leaveRowFirst]}>
                  <View style={styles.leaveBody}>
                    <Text style={styles.leaveTitle}>
                      {LEAVE_TYPE_LABEL[l.leave_type] ?? l.leave_type} · {l.days} 天
                    </Text>
                    <Text style={styles.leaveSub}>
                      {l.start_date} ~ {l.end_date}
                    </Text>
                    {l.reason ? <Text style={styles.leaveSub}>事由：{l.reason}</Text> : null}
                    {l.reply_note ? (
                      <Text style={styles.leaveSub}>批注：{l.reply_note}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.leaveBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.leaveBadgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  {l.status === 'pending' ? (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => handleCancelLeave(l)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelBtnText}>撤销</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* ⑨-2 打卡异常申诉 */}
        <Text style={styles.sectionTitle}>{t('att.appeal')}</Text>

        {/* 提交申诉表单 */}
        <View style={styles.leaveFormCard}>
          <Text style={styles.formLabel}>{t('att.appealDate')}</Text>
          <TextInput
            style={styles.formInput}
            value={appealDate}
            onChangeText={setAppealDate}
            placeholder={DATE_HINT}
            placeholderTextColor={colors.ink3}
            maxLength={10}
            autoCapitalize="none"
          />

          <Text style={styles.formLabel}>{t('att.appealReason')}</Text>
          <TextInput
            style={[styles.formInput, styles.formTextarea]}
            value={appealReason}
            onChangeText={setAppealReason}
            placeholder={t('att.appealPlaceholder')}
            placeholderTextColor={colors.ink3}
            multiline
          />

          <TouchableOpacity
            style={[styles.submitBtn, submittingAppeal && styles.submitBtnDisabled]}
            onPress={submitAppeal}
            disabled={submittingAppeal}
            activeOpacity={0.85}
          >
            {submittingAppeal ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={styles.submitBtnText}>{t('att.appealSubmit')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 我的申诉列表 */}
        <Text style={styles.sectionTitle}>{t('att.appealList')}</Text>
        <View style={styles.listCard}>
          {appeals.length === 0 ? (
            <EmptyState icon="clipboard-outline" title={t('att.noAppeal')} />
          ) : (
            appeals.map((a, idx) => {
              const meta = APPEAL_STATUS_META[a.status] ?? APPEAL_STATUS_META.pending;
              return (
                <View key={a.id ?? idx} style={[styles.leaveRow, idx === 0 && styles.leaveRowFirst]}>
                  <View style={styles.leaveBody}>
                    <Text style={styles.leaveTitle}>{a.date}</Text>
                    {a.reason ? <Text style={styles.leaveSub}>事由：{a.reason}</Text> : null}
                    {a.reply_note ? (
                      <Text style={styles.leaveSub}>批注：{a.reply_note}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.leaveBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.leaveBadgeText, { color: meta.color }]}>
                      {t(meta.labelKey)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
          </>
        )}
      </ScrollView>

      {/* 底部页签栏（对齐企业微信「打卡」模块的导航形态：图标在上、文字在下、等宽排列，
          选中项用品牌色，未选中为中性灰；此处为自绘栏，需自行补底部安全区内边距） */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, colors.spacing.sm) }]}>
        {CHECKIN_TABS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.tab}
            onPress={() => switchTab(item.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={item.icon}
              size={22}
              color={tab === item.key ? colors.primary : colors.ink3}
            />
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },

  // 底部页签栏（打卡 / 申请 / 统计）——等宽图标+文字，顶边 hairline 与内容分隔
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: colors.spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabText: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  tabTextActive: { color: colors.primary, fontWeight: '700' },

  // 分区标题：对齐企业微信的紧凑分组头（小字号粗体黑 + 收紧上下留白）
  sectionTitle: {
    fontSize: colors.fontSize.base,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.1,
    marginTop: colors.spacing.xl,
    marginBottom: colors.spacing.sm,
    marginHorizontal: colors.spacing.lg,
  },

  // ① 当月统计概览条
  overviewCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    marginTop: colors.spacing.md,
    paddingVertical: colors.spacing.lg,
    ...colors.shadow.card,
  },
  overviewItem: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  overviewValue: {
    fontSize: colors.fontSize['3xl'],
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  overviewUnit: { fontSize: colors.fontSize.xs, fontWeight: '500', color: colors.ink3 },
  overviewLabel: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 4, fontWeight: '600' },
  overviewCaption: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 3 },
  overviewDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line },

  // ② 定位状态卡
  locCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.md,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    marginTop: colors.spacing.md,
    padding: colors.spacing.lg,
    ...colors.shadow.card,
  },
  locIconWrap: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locBody: { flex: 1 },
  locTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  locSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 3, lineHeight: 17 },
  locSubOk: { color: colors.success },
  locSubWarn: { color: colors.warning },
  locPill: {
    borderRadius: colors.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  locPillText: { fontSize: colors.fontSize.xs, fontWeight: '700' },
  locActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  locActionText: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.primary },

  // ③ 超大圆形打卡按钮
  dialSection: { alignItems: 'center', paddingTop: colors.spacing.xxl, paddingBottom: colors.spacing.sm },
  dialOuter: {
    width: 216,
    height: 216,
    borderRadius: 108,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialOuterActive: {
    borderColor: colors.alpha(colors.primaryRgb, 0.22),
    ...colors.shadow.primary,
  },
  dialOuterIdle: { borderColor: colors.border, ...colors.shadow.card },
  dial: {
    width: 192,
    height: 192,
    borderRadius: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dialActive: { backgroundColor: colors.primary },
  dialIdle: { backgroundColor: colors.surface2 },
  dialDisabled: { opacity: 0.85 },
  dialClock: {
    fontSize: 46,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  dialLabel: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  dialDate: { fontSize: colors.fontSize.sm, marginTop: 8 },
  dialTextOn: { color: colors.primaryForeground },
  dialTextOff: { color: colors.ink2 },
  dialDateOn: { color: colors.alpha('255, 255, 255', 0.85) },
  dialHint: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    marginTop: colors.spacing.lg,
    textAlign: 'center',
  },

  // ④ 今日打卡
  todayCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    paddingHorizontal: colors.spacing.lg,
    ...colors.shadow.card,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.md,
    paddingVertical: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  todayRowFirst: { borderTopWidth: 0 },
  todayLabel: { fontSize: 14, fontWeight: '600', color: colors.ink2, width: 72 },
  todayValue: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  todayBadge: { borderRadius: colors.radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  todayBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '700' },
  todayPlace: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    paddingBottom: colors.spacing.md,
  },

  // ⑤ 打卡日历
  calCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    paddingHorizontal: colors.spacing.md,
    paddingTop: colors.spacing.lg,
    paddingBottom: colors.spacing.md,
    ...colors.shadow.card,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.sm,
    paddingBottom: colors.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardHeadSub: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  calWeekRow: { flexDirection: 'row', marginTop: colors.spacing.md },
  calWeekText: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: colors.fontSize.xs,
    color: colors.ink3,
    fontWeight: '600',
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: colors.spacing.xs },
  calCell: { width: '14.2857%', alignItems: 'center', paddingVertical: 4 },
  calDayWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.06),
  },
  calDayText: { fontSize: colors.fontSize.sm, color: colors.ink2, fontWeight: '600' },
  calDayTextToday: { color: colors.primary, fontWeight: '800' },
  calDayRest: { backgroundColor: colors.surface2 },
  calDayTextRest: { color: colors.ink3 },
  calDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3 },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: colors.spacing.md,
    marginTop: colors.spacing.md,
    paddingTop: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingHorizontal: colors.spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: colors.fontSize.xs, color: colors.ink3 },

  // ⑤-2 近期打卡明细
  recCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    paddingHorizontal: colors.spacing.md,
    ...colors.shadow.card,
  },
  recRow: {
    paddingVertical: colors.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  recRowLast: { borderBottomWidth: 0 },
  recRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recDate: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.ink },
  recWeek: { fontSize: colors.fontSize.xs, fontWeight: '400', color: colors.ink3 },
  recToday: { fontSize: colors.fontSize.xs, fontWeight: '700', color: colors.primary },
  recBadge: {
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 2,
    borderRadius: colors.radius.sm,
  },
  recBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '700' },
  recRowSub: { marginTop: 5, gap: 2 },
  recTimes: { fontSize: colors.fontSize.xs, color: colors.ink2 },
  recAddr: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  recNote: { fontSize: colors.fontSize.xs, color: colors.ink3, fontStyle: 'italic' },

  // ⑥ 我的考勤规则
  ruleCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    paddingHorizontal: colors.spacing.lg,
    ...colors.shadow.card,
  },
  ruleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: colors.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  ruleName: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: colors.spacing.md,
    paddingVertical: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  ruleRowLabel: { fontSize: 13, color: colors.ink3 },
  ruleRowValue: { fontSize: 13, fontWeight: '700', color: colors.ink2, textAlign: 'right', flexShrink: 1 },

  // ⑥ 请假申请表单
  leaveFormCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    padding: colors.spacing.lg,
    ...colors.shadow.card,
  },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: colors.spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: colors.spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.fieldFillBorder,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.sm, color: colors.ink2, fontWeight: '500' },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },
  formInput: {
    height: 44,
    marginTop: colors.spacing.sm,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.fieldFill,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
  },
  formTextarea: { height: 88, paddingTop: 10, textAlignVertical: 'top' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
  },
  quickChipText: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: colors.spacing.md,
  },
  daysValue: { fontSize: 15, fontWeight: '800', color: colors.primary },
  submitBtn: {
    marginTop: colors.spacing.lg,
    height: 46,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.primary,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },

  // ⑦ 外勤登记
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    marginTop: colors.spacing.md,
    ...colors.shadow.card,
  },
  tripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: colors.spacing.md,
  },
  tripTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  tripBody: {
    paddingHorizontal: colors.spacing.lg,
    paddingBottom: colors.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  tripNote: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: colors.spacing.md },

  // ⑥ 我的请假记录
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    paddingHorizontal: colors.spacing.lg,
    ...colors.shadow.card,
  },
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.md,
    paddingVertical: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  leaveRowFirst: { borderTopWidth: 0 },
  leaveBody: { flex: 1 },
  leaveTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  leaveSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 3 },
  leaveBadge: {
    borderRadius: colors.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  leaveBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.errorBorder,
  },
  cancelBtnText: { fontSize: colors.fontSize.sm, fontWeight: '600', color: colors.error },
});