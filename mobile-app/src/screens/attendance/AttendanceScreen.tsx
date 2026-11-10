import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import DataState, { type DataStateErrorKind } from '@/components/DataState';
import { confirm } from '@/components/ConfirmDialog';
import { errorKind, errorText } from '@/lib/errorText';
import colors from '@/theme/colors';
import api from '@/lib/api';
import { EARTH_RADIUS_KM } from '@/constants/location';
import { geoApi, attendanceApi } from '@/services/api';
import { useI18n } from '@/i18n';
import { notify, notifyError } from '@/utils/feedback';

// 打卡半径兜底（业务确认 C6：考勤地图定位；500 米）
const RADIUS_KM = 0.5;
const CAL_LEGEND: AttStatus[] = ['present', 'late', 'early_out', 'absent', 'leave', 'field_work'];

// 页签导航（打卡 / 统计 / 申请）
type CheckinTab = 'checkin' | 'apply' | 'stats';
// 底部导航对齐企业微信「打卡」模块：员工端为 打卡 / 申请 / 统计（官方为
// 打卡 / 申请 / 统计 / 考勤机，本项目无考勤机硬件故不设该项），图标+文字等宽排列
const CHECKIN_TABS: {
  key: CheckinTab;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'checkin', labelKey: 'att.tab.checkin', icon: 'location' },
  { key: 'apply', labelKey: 'att.tab.apply', icon: 'document-text' },
  { key: 'stats', labelKey: 'att.tab.stats', icon: 'stats-chart' },
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

const STATUS_META: Record<AttStatus, { labelKey: string; color: string; bg: string }> = {
  present: {
    labelKey: 'att.status.present',
    color: colors.success,
    bg: colors.alpha(colors.successRgb, 0.12),
  },
  late: {
    labelKey: 'att.status.late',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
  early_out: {
    labelKey: 'att.status.earlyOut',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
  },
  absent: {
    labelKey: 'att.status.absent',
    color: colors.error,
    bg: colors.alpha(colors.errorRgb, 0.12),
  },
  leave: { labelKey: 'att.status.leave', color: colors.ink2, bg: colors.surface2 },
  field_work: {
    labelKey: 'att.status.fieldWork',
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
  const R = EARTH_RADIUS_KM;
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
  annual: 'att.leaveType.annual',
  sick: 'att.leaveType.sick',
  personal: 'att.leaveType.personal',
  unpaid: 'att.leaveType.unpaid',
  maternity: 'att.leaveType.maternity',
  other: 'att.leaveType.other',
};
const LEAVE_STATUS_META: Record<LeaveStatus, { labelKey: string; color: string; bg: string }> = {
  pending: { labelKey: 'att.leaveStatus.pending', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  approved: { labelKey: 'att.leaveStatus.approved', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
  rejected: { labelKey: 'att.leaveStatus.rejected', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.12) },
  cancelled: { labelKey: 'att.leaveStatus.cancelled', color: colors.ink2, bg: colors.surface2 },
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
  // 周名与「月/日」格式随语言：zh 用「周一 / 5月1日」，en/th 用短格式
  const weekdays = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((d) => t(`att.week.${d}`)), [t]);
  const calWeek = useMemo(() => [1, 2, 3, 4, 5, 6, 0].map((d) => t(`att.weekMin.${d}`)), [t]);
  const md = (dt: dayjs.Dayjs) => t('att.mdFormat', { m: dt.month() + 1, d: dt.date() });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState<TodayInfo | null>(null);
  const [records, setRecords] = useState<AttRecord[]>([]);
  // 五路请求此前只有 today 会提示失败，其余失败都落成空数组/默认规则。
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorKind, setLoadErrorKind] = useState<DataStateErrorKind>('unknown');
  const [leavesError, setLeavesError] = useState<string | null>(null);
  const [appealsError, setAppealsError] = useState<string | null>(null);
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
    setLoadError(null);
    // 核心三路（今日/记录/规则）任一失败即整页失败，不能把失败演成「未打卡 / 0 条 / 默认规则」
    const coreFailed = [todayRes, recordsRes, ruleRes].find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult | undefined;
    if (coreFailed) {
      setLoadError(errorText(coreFailed.reason, t('att.loadFail')));
      setLoadErrorKind(errorKind(coreFailed.reason));
    }
    setLeavesError(
      leaveRes.status === 'rejected' ? errorText(leaveRes.reason, t('att.leaveLoadFail')) : null,
    );
    setAppealsError(
      appealRes.status === 'rejected' ? errorText(appealRes.reason, t('att.appealLoadFail')) : null,
    );
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
  }, [t]);

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
      notify(t('att.dateInvalidTitle'), t('att.dateFormat', { format: DATE_HINT }));
      return;
    }
    if (dayjs(leaveStart).isBefore(dayjs(), 'day')) {
      notify(t('att.startBeforeToday'), undefined);
      return;
    }
    if (dayjs(leaveEnd).isBefore(dayjs(leaveStart), 'day')) {
      notify(t('att.endBeforeStart'), undefined);
      return;
    }
    if (!leaveReason.trim()) {
      notify(t('att.reasonRequired'), undefined);
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
      notify(t('att.leaveSubmitted'), t('att.pendingApproval'));
      setLeaveReason('');
      await load();
    } catch (err) {
      notifyError(t('att.leaveSubmitFail'), err);
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleCancelLeave = async (item: LeaveReq) => {
    const ok = await confirm({
      title: t('att.revokeConfirmTitle'),
      message: t('att.revokeConfirmMsg', {
        start: item.start_date,
        end: item.end_date,
        days: item.days,
      }),
      confirmLabel: t('att.revoke'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await attendanceApi.cancelLeave(item.id);
      notify(t('att.revokedTitle'), t('att.revokedMsg'));
      await load();
    } catch (err) {
      notifyError(t('att.revokeFail'), err);
    }
  };

  const submitAppeal = async () => {
    if (!isDateStr(appealDate)) {
      notify(t('att.dateInvalidTitle'), t('att.dateFormat', { format: DATE_HINT }));
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
      return t('att.latestOn', { d: md(dayjs(latest.date)) });
    };
    return {
      present: count('present') + count('late') + count('early_out') + count('field_work'),
      late: count('late'),
      earlyOut: count('early_out'),
      leave: count('leave'),
      leaveHint: lastLabel('leave', t('att.noLeaveThisMonth')),
    };
  }, [monthRecords, t]);

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
        notify(t('att.noPermTitle'), t('att.noPermMsg'));
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({});
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      notify(t('att.locFailTitle'), t('att.locFailMsg'));
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
        notify(
          t('att.checkinSuccess'),
          type === 'checkin' ? t('att.checkedIn') : t('att.checkedOut'),
        );
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
          t('att.outOfRangeTitle'),
          t('att.outOfRangeMsg', { n: RADIUS_KM * 1000 }),
        );
        // 外勤登记表单在「申请」页签且默认收起：不切页签+展开的话用户看不到要填的表单
        setTripOpen(true);
        switchTab('apply');
      }
    } catch (err: any) {
      notifyError(t('att.checkinFail'), err);
    } finally {
      setChecking(null);
    }
  };

  const submitTrip = async () => {
    if (!isDateStr(tripDate)) {
      notify(t('att.dateInvalidTitle'), t('att.dateFormat', { format: DATE_HINT }));
      return;
    }
    if (!tripReason.trim()) {
      notify(t('att.tripReasonRequired'), undefined);
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
      notify(t('att.tripSubmitted'), t('att.pendingApproval'));
      setTripReason('');
      await load();
    } catch (err) {
      notifyError(t('att.tripSubmitFail'), err);
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
  const dialLabel = t(`att.phase.${phase}`);
  const dialHint =
    phase === 'checkedin'
      ? t('att.dialHint.checkedin', {
          in: fmtTime(today?.check_in_time),
          end: workEnd ?? '--:--',
        })
      : phase === 'done'
        ? t('att.dialHint.done', {
            in: fmtTime(today?.check_in_time),
            out: fmtTime(today?.check_out_time),
          })
        : phase === 'checkout'
          ? t('att.dialHint.checkout', { end: workEnd ?? '--:--' })
          : t('att.dialHint.before', { start: workStart ?? '--:--' });

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
  const WEEK_CN = calWeek;

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label={t('att.loading')} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <DataState
          error={loadError}
          errorKind={loadErrorKind}
          onRetry={() => {
            setLoading(true);
            void load().finally(() => setLoading(false));
          }}
        />
      </View>
    );
  }

  const groupName = myRule?.group_name || today?.group_name || t('att.defaultPoint');
  const distanceM = distanceKm != null ? Math.round(distanceKm * 1000) : null;
  const distanceText =
    distanceKm == null
      ? null
      : distanceKm >= 1
        ? t('att.distanceKm', { n: distanceKm.toFixed(1) })
        : t('att.distanceM', { n: distanceM ?? 0 });

  const radiusM = Math.round(radiusKm * 1000);
  const locSub: string = (() => {
    if (gpsStatus === 'locating' || gpsStatus === 'idle') return t('att.locating');
    if (gpsStatus === 'denied') return t('att.locDenied');
    if (gpsStatus === 'error') return t('att.locError');
    if (distanceText == null) return t('att.locOkRange', { n: radiusM });
    return withinRadius
      ? t('att.locInRangeHint', { d: distanceText, n: radiusM })
      : t('att.locOutOfRangeHint', { d: distanceText });
  })();

  const locPill: { label: string; color: string; bg: string } | null = (() => {
    if (gpsStatus !== 'ok' || withinRadius == null) return null;
    return withinRadius
      ? { label: t('att.inRange'), color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) }
      : { label: t('att.outOfRange'), color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) };
  })();

  const inBadge = !checkedIn
    ? { label: t('att.notChecked'), color: colors.ink3, bg: colors.surface2 }
    : (today?.late_minutes ?? 0) > 0
      ? {
          label: t('att.lateMinutes', { n: today?.late_minutes ?? 0 }),
          color: colors.warning,
          bg: colors.alpha(colors.warningRgb, 0.12),
        }
      : today?.status === 'field_work'
        ? {
            label: t('att.status.fieldWork'),
            color: colors.info,
            bg: colors.alpha(colors.infoRgb, 0.12),
          }
        : {
            label: t('att.status.present'),
            color: colors.success,
            bg: colors.alpha(colors.successRgb, 0.12),
          };

  const outBadge = !checkedOut
    ? { label: t('att.notChecked'), color: colors.ink3, bg: colors.surface2 }
    : (today?.early_out_minutes ?? 0) > 0
      ? {
          label: t('att.earlyMinutes', { n: today?.early_out_minutes ?? 0 }),
          color: colors.warning,
          bg: colors.alpha(colors.warningRgb, 0.12),
        }
      : {
          label: t('att.status.present'),
          color: colors.success,
          bg: colors.alpha(colors.successRgb, 0.12),
        };

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
      label: t('att.overview.present'),
      value: stats.present,
      unit: t('att.unit.day'),
      color: colors.ink,
      caption: t('att.expectedDays', { n: workdays }),
    },
    {
      key: 'late',
      label: t('att.status.late'),
      value: stats.late,
      unit: t('att.unit.times'),
      color: colors.warning,
      caption:
        stats.late === lastMonthLate
          ? t('att.sameAsLast')
          : stats.late > lastMonthLate
            ? t('att.moreThanLast', { n: stats.late - lastMonthLate })
            : t('att.lessThanLast', { n: lastMonthLate - stats.late }),
    },
    {
      key: 'early',
      label: t('att.status.earlyOut'),
      value: stats.earlyOut,
      unit: t('att.unit.times'),
      color: colors.warning,
      caption: stats.earlyOut === 0 ? t('att.noEarlyThisMonth') : t('att.monthTotal'),
    },
    {
      key: 'leave',
      label: t('att.status.leave'),
      value: stats.leave,
      unit: t('att.unit.day'),
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
                {gpsStatus === 'denied' ? t('att.allowLocation') : t('common.retry')}
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
                {md(dayjs(now))} · {weekdays[now.getDay()]}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dialHint}>{dialHint}</Text>
        </View>

        {/* ④ 今日打卡记录 */}
        <Text style={styles.sectionTitle}>{t('att.todayCheckin')}</Text>
        <View style={styles.todayCard}>
          <View style={[styles.todayRow, styles.todayRowFirst]}>
            <Text style={styles.todayLabel}>{t('att.phase.checkin')}</Text>
            <Text style={styles.todayValue}>{fmtTime(today?.check_in_time)}</Text>
            <View style={[styles.todayBadge, { backgroundColor: inBadge.bg }]}>
              <Text style={[styles.todayBadgeText, { color: inBadge.color }]}>{inBadge.label}</Text>
            </View>
          </View>
          <View style={styles.todayRow}>
            <Text style={styles.todayLabel}>{t('att.phase.checkout')}</Text>
            <Text style={styles.todayValue}>{fmtTime(today?.check_out_time)}</Text>
            <View style={[styles.todayBadge, { backgroundColor: outBadge.bg }]}>
              <Text style={[styles.todayBadgeText, { color: outBadge.color }]}>
                {outBadge.label}
              </Text>
            </View>
          </View>
          {checkedIn && today?.check_in_location?.address ? (
            <Text style={styles.todayPlace} numberOfLines={2}>
              {t('att.place', { addr: today.check_in_location.address })}
            </Text>
          ) : null}
        </View>
          </>
        )}

        {tab === 'stats' && (
          <>
        {/* ⑤ 打卡日历（月视图） */}
        <Text style={styles.sectionTitle}>{t('att.calendar')}</Text>
        <View style={styles.calCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>
              {t('att.calMonth', { y: dayjs().year(), m: dayjs().month() + 1 })}
            </Text>
            <Text style={styles.cardHeadSub}>{t('att.nDaysRecorded', { n: monthRecords.length })}</Text>
          </View>
          <View style={styles.calWeekRow}>
            {calWeek.map((w) => (
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
                <Text style={styles.legendText}>{t(STATUS_META[s].labelKey)}</Text>
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
        <Text style={styles.sectionTitle}>{t('att.recentRecords')}</Text>
        <View style={styles.recCard}>
          {recentRecords.length === 0 ? (
            <EmptyState
              icon="list-outline"
              title={t('att.noRecords')}
              sub={t('att.noRecordsSub')}
            />
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
                      {md(dt)}
                      <Text style={styles.recWeek}> {weekdays[dt.day()]}</Text>
                      {isToday ? <Text style={styles.recToday}> {t('att.today')}</Text> : null}
                    </Text>
                    <View style={[styles.recBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.recBadgeText, { color: meta.color }]}>
                        {t(meta.labelKey)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recRowSub}>
                    <Text style={styles.recTimes}>
                      {t('att.timesLine', {
                        in: fmtTime(r.check_in_time),
                        out: fmtTime(r.check_out_time),
                      })}
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
        <Text style={styles.sectionTitle}>{t('att.myRule')}</Text>
        <View style={styles.ruleCard}>
          <View style={styles.ruleHead}>
            <Ionicons name="business-outline" size={18} color={colors.primary} />
            <Text style={styles.ruleName} numberOfLines={1}>
              {myRule?.group_id
                ? myRule.group_name || t('att.groupFallback')
                : t('att.defaultRule')}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>{t('att.workHours')}</Text>
            <Text style={styles.ruleRowValue}>
              {workStart ?? '--:--'} - {workEnd ?? '--:--'}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>{t('att.radiusLabel')}</Text>
            <Text style={styles.ruleRowValue}>{t('att.distanceM', { n: radiusM })}</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>{t('att.graceLabel')}</Text>
            <Text style={styles.ruleRowValue}>
              {t('att.graceValue', {
                late: myRule?.late_grace_minutes ?? 0,
                early: myRule?.early_grace_minutes ?? 0,
              })}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>{t('att.timezone')}</Text>
            <Text style={styles.ruleRowValue}>
              UTC+{myRule?.utc_offset_hours != null ? myRule.utc_offset_hours : 0}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleRowLabel}>{t('att.office')}</Text>
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
        <Text style={styles.sectionTitle}>{t('att.leaveApply')}</Text>
        <View style={styles.leaveFormCard}>
          <Text style={styles.formLabel}>{t('att.leaveTypeLabel')}</Text>
          <View style={styles.chipWrap}>
            {LEAVE_TYPES.map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, leaveType === k && styles.chipActive]}
                onPress={() => setLeaveType(k)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, leaveType === k && styles.chipTextActive]}>
                  {t(LEAVE_TYPE_LABEL[k])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.formLabel}>{t('att.startDate')}</Text>
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
              <Text style={styles.quickChipText}>{t('att.today')}</Text>
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
              <Text style={styles.quickChipText}>{t('att.tomorrow')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formLabel}>{t('att.endDate')}</Text>
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
            <Text style={styles.formLabel}>{t('att.leaveDaysCount')}</Text>
            <Text style={styles.daysValue}>{t('att.nDays', { n: leaveDays })}</Text>
          </View>

          <Text style={styles.formLabel}>{t('att.leaveReason')}</Text>
          <TextInput
            style={[styles.formInput, styles.formTextarea]}
            value={leaveReason}
            onChangeText={setLeaveReason}
            placeholder={t('att.leaveReasonPh')}
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
              <Text style={styles.submitBtnText}>{t('att.submitApply')}</Text>
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
              <Text style={styles.tripTitle}>{t('att.trip')}</Text>
            </View>
            <Ionicons
              name={tripOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.ink3}
            />
          </TouchableOpacity>
          {tripOpen ? (
            <View style={styles.tripBody}>
              <Text style={styles.formLabel}>{t('att.tripDate')}</Text>
              <TextInput
                style={styles.formInput}
                value={tripDate}
                onChangeText={setTripDate}
                placeholder={DATE_HINT}
                placeholderTextColor={colors.ink3}
                maxLength={10}
                autoCapitalize="none"
              />
              <Text style={styles.formLabel}>{t('att.tripReason')}</Text>
              <TextInput
                style={[styles.formInput, styles.formTextarea]}
                value={tripReason}
                onChangeText={setTripReason}
                placeholder={t('att.tripReasonPh')}
                placeholderTextColor={colors.ink3}
                multiline
              />
              <Text style={styles.tripNote}>{t('att.tripNote')}</Text>
              <TouchableOpacity
                style={[styles.submitBtn, submittingTrip && styles.submitBtnDisabled]}
                onPress={submitTrip}
                disabled={submittingTrip}
                activeOpacity={0.85}
              >
                {submittingTrip ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.submitBtnText}>{t('att.submitTrip')}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* ⑨ 我的请假记录 */}
        <Text style={styles.sectionTitle}>{t('att.myLeaves')}</Text>
        <View style={styles.listCard}>
          {leavesError ? (
            <EmptyState
              tone="error"
              title={leavesError}
              actionLabel={t('common.retry')}
              onAction={() => void load()}
            />
          ) : leaves.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title={t('att.noLeaves')}
              sub={t('att.noLeavesSub')}
            />
          ) : (
            leaves.map((l, idx) => {
              const meta = LEAVE_STATUS_META[l.status] ?? LEAVE_STATUS_META.pending;
              return (
                <View key={l.id ?? idx} style={[styles.leaveRow, idx === 0 && styles.leaveRowFirst]}>
                  <View style={styles.leaveBody}>
                    <Text style={styles.leaveTitle}>
                      {t(LEAVE_TYPE_LABEL[l.leave_type] ?? LEAVE_TYPE_LABEL.other)} ·{' '}
                      {t('att.nDays', { n: l.days })}
                    </Text>
                    <Text style={styles.leaveSub}>
                      {l.start_date} ~ {l.end_date}
                    </Text>
                    {l.reason ? (
                      <Text style={styles.leaveSub}>{t('att.reasonLabel', { v: l.reason })}</Text>
                    ) : null}
                    {l.reply_note ? (
                      <Text style={styles.leaveSub}>{t('att.replyLabel', { v: l.reply_note })}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.leaveBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.leaveBadgeText, { color: meta.color }]}>
                      {t(meta.labelKey)}
                    </Text>
                  </View>
                  {l.status === 'pending' ? (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => handleCancelLeave(l)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelBtnText}>{t('att.revoke')}</Text>
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
          {appealsError ? (
            <EmptyState tone="error" title={appealsError} actionLabel={t('common.retry')} onAction={() => void load()} />
          ) : appeals.length === 0 ? (
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
              {t(item.labelKey)}
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
  },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: colors.spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: colors.spacing.sm },
  chip: {
     minHeight: 44,
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