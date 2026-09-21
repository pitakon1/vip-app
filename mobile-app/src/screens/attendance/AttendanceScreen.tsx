import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import dayjs from 'dayjs';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import colors from '@/theme/colors';
import api from '@/lib/api';
import { geoApi, attendanceApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';

// 打卡半径（业务确认 C6：考勤地图定位；500 米）
const RADIUS_KM = 0.5;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type AttStatus = 'present' | 'late' | 'absent' | 'leave' | 'field_work';

interface TodayInfo {
  checked_in: boolean;
  checked_out: boolean;
  status?: AttStatus | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  radius_km?: number;
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

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState<TodayInfo | null>(null);
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [checking, setChecking] = useState<'checkin' | 'checkout' | null>(null);
  const [now, setNow] = useState(() => new Date());

  // 打卡大卡的实时时钟
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const [todayRes, recordsRes] = await Promise.allSettled([
      attendanceApi.today(),
      api.get('/attendance/me'),
    ]);
    setToday(
      todayRes.status === 'fulfilled' ? ((todayRes.value.data as TodayInfo) ?? null) : null,
    );
    setRecords(
      recordsRes.status === 'fulfilled' && Array.isArray(recordsRes.value.data)
        ? (recordsRes.value.data as AttRecord[])
        : [],
    );
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const monthRecords = useMemo(
    () => records.filter((r) => dayjs(r.date).isSame(dayjs(), 'month')),
    [records],
  );

  const stats = useMemo(() => {
    const count = (s: AttStatus) => monthRecords.filter((r) => r.status === s).length;
    // 最近一次发生日期（徽章用于补充信息，避免与主数值重复）
    const lastLabel = (s: AttStatus, empty: string) => {
      const list = monthRecords.filter((r) => r.status === s);
      if (list.length === 0) return empty;
      const latest = list.reduce((a, b) => (dayjs(b.date).isAfter(dayjs(a.date)) ? b : a));
      return `最近 ${dayjs(latest.date).format('M月D日')}`;
    };
    return {
      present: count('present') + count('late') + count('field_work'),
      late: count('late'),
      leave: count('leave'),
      field: count('field_work'),
      leaveHint: lastLabel('leave', '本月无请假'),
      fieldHint: lastLabel('field_work', '本月无外勤'),
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

  // 本月工作日（用于对照出勤天数，仅按自然周的周一至周五计算）
  const workdays = useMemo(() => {
    const days = dayjs().daysInMonth();
    let n = 0;
    for (let i = 0; i < days; i += 1) {
      const w = dayjs().startOf('month').add(i, 'day').day();
      if (w !== 0 && w !== 6) n += 1;
    }
    return n;
  }, []);

  const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('无定位权限', '请在设置中允许访问位置');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({});
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      Alert.alert('定位失败', '无法获取当前定位');
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
      const withinRadius = gd?.within_radius ?? (gd?.distance_km ?? 99) <= RADIUS_KM;

      if (withinRadius) {
        if (type === 'checkin') {
          await attendanceApi.checkIn({ lat: coord.latitude, lng: coord.longitude });
        } else {
          await attendanceApi.checkOut({ lat: coord.latitude, lng: coord.longitude });
        }
        notify('打卡成功', type === 'checkin' ? '已签到' : '已签退');
        await load();
      } else {
        // 不在半径内，引导填写外勤申请
        notify(
          '不在打卡半径内',
          `您距离打卡点超过 ${RADIUS_KM * 1000} 米，请填写外勤申请。`,
        );
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
      }
    } catch (err: any) {
      notifyError('打卡失败', err);
    } finally {
      setChecking(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label="加载考勤数据…" />
      </View>
    );
  }

  const todayStatus = today?.status ? STATUS_META[today.status] : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* 打卡大卡：日期 + 实时时钟 + 上下班打卡 + 今日三项 */}
        <View style={styles.clockCard}>
          <View style={styles.clockDateRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.alpha('255, 255, 255', 0.85)} />
            <Text style={styles.clockDate}>
              {dayjs(now).format('YYYY年M月D日')} {WEEKDAYS[now.getDay()]}
            </Text>
          </View>
          <Text style={styles.clockTime}>{dayjs(now).format('HH:mm:ss')}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[
                styles.clockBtn,
                styles.checkInBtn,
                (checking !== null || today?.checked_in) && styles.btnDisabled,
              ]}
              onPress={handleCheckIn}
              disabled={checking !== null || !!today?.checked_in}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={today?.checked_in ? '已签到' : '上班打卡'}
            >
              {checking === 'checkin' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="time-outline" size={17} color={colors.primary} />
                  <Text style={styles.checkInText}>
                    {today?.checked_in ? '已签到' : '上班打卡'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.clockBtn,
                styles.checkOutBtn,
                (checking !== null || !today?.checked_in || today?.checked_out) &&
                  styles.btnDisabled,
              ]}
              onPress={handleCheckOut}
              disabled={checking !== null || !today?.checked_in || !!today?.checked_out}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={today?.checked_out ? '已签退' : '下班打卡'}
            >
              {checking === 'checkout' ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name="time-outline" size={17} color={colors.primaryForeground} />
                  <Text style={styles.checkOutText}>
                    {today?.checked_out ? '已签退' : '下班打卡'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.radiusHint}>
            GPS 定位打卡 · 半径 {Math.round((today?.radius_km ?? RADIUS_KM) * 1000)} 米 · 超出需先提交外勤申请
          </Text>

          <View style={styles.clockStats}>
            <View style={styles.clockStat}>
              <Text style={styles.clockStatLabel}>上班签到</Text>
              <Text style={styles.clockStatValue}>{fmtTime(today?.check_in_time)}</Text>
            </View>
            <View style={styles.vDivider} />
            <View style={styles.clockStat}>
              <Text style={styles.clockStatLabel}>下班签退</Text>
              <Text
                style={[
                  styles.clockStatValue,
                  !today?.check_out_time && styles.clockStatValueMuted,
                ]}
              >
                {fmtTime(today?.check_out_time)}
              </Text>
            </View>
            <View style={styles.vDivider} />
            <View style={styles.clockStat}>
              <Text style={styles.clockStatLabel}>今日状态</Text>
              <Text style={styles.clockStatValue}>{todayStatus ? todayStatus.label : '未打卡'}</Text>
            </View>
          </View>
        </View>

        {/* 本月统计 */}
        <Text style={styles.sectionTitle}>本月统计</Text>
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>出勤</Text>
            <Text style={styles.statValue}>
              {stats.present}
              <Text style={styles.statUnit}> 天</Text>
            </Text>
            <View style={[styles.statBadge, { backgroundColor: colors.alpha(colors.successRgb, 0.12) }]}>
              <Text style={[styles.statBadgeText, { color: colors.success }]}>
                应出勤 {workdays} 天
              </Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>迟到</Text>
            <Text style={[styles.statValue, { color: colors.warning }]}>
              {stats.late}
              <Text style={styles.statUnit}> 次</Text>
            </Text>
            <View style={[styles.statBadge, { backgroundColor: colors.alpha(colors.warningRgb, 0.12) }]}>
              <Text style={[styles.statBadgeText, { color: colors.warning }]}>
                {stats.late === lastMonthLate
                  ? '较上月持平'
                  : stats.late > lastMonthLate
                    ? `较上月多 ${stats.late - lastMonthLate} 次`
                    : `较上月少 ${lastMonthLate - stats.late} 次`}
              </Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>请假</Text>
            <Text style={styles.statValue}>
              {stats.leave}
              <Text style={styles.statUnit}> 天</Text>
            </Text>
            <View style={[styles.statBadge, { backgroundColor: colors.surface2 }]}>
              <Text style={[styles.statBadgeText, { color: colors.ink2 }]}>
                {stats.leaveHint}
              </Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>外勤</Text>
            <Text style={styles.statValue}>
              {stats.field}
              <Text style={styles.statUnit}> 次</Text>
            </Text>
            <View style={[styles.statBadge, { backgroundColor: colors.alpha(colors.infoRgb, 0.12) }]}>
              <Text style={[styles.statBadgeText, { color: colors.info }]}>
                {stats.fieldHint}
              </Text>
            </View>
          </View>
        </View>

        {/* 考勤记录 */}
        <Text style={styles.sectionTitle}>考勤记录</Text>
        <View style={styles.listCard}>
          {records.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="暂无考勤记录"
              sub="完成首次上下班打卡后，记录会展示在这里"
            />
          ) : (
            records.slice(0, 30).map((r, idx) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.present;
              const place =
                r.status === 'field_work'
                  ? '外勤'
                  : r.check_in_location
                    ? r.check_in_location.within_radius === false
                      ? '外勤'
                      : '办公室'
                    : '';
              const sub = [place, WEEKDAYS[dayjs(r.date).day()]].filter(Boolean).join(' · ');
              const isToday = dayjs(r.date).isSame(dayjs(), 'day');
              const isOff = r.status === 'leave' || r.status === 'absent';
              const title = isOff
                ? r.status === 'leave'
                  ? '全天请假'
                  : meta.label
                : `上班 ${fmtTime(r.check_in_time)} · 下班 ${fmtTime(r.check_out_time)}`;
              const subText = isOff
                ? [r.notes, place].filter(Boolean).join(' · ') || '已审批'
                : isToday
                  ? `${place || '办公室'} · 今日`
                  : sub;
              return (
                <View
                  key={r.id ?? `${r.date}-${idx}`}
                  style={[styles.recordRow, idx === 0 && styles.recordRowFirst]}
                >
                  <View style={[styles.dateBadge, { backgroundColor: colors.alpha(colors.primaryRgb, 0.08) }]}>
                    <Text style={styles.dateBadgeMonth}>{dayjs(r.date).format('M月')}</Text>
                    <Text style={styles.dateBadgeDay}>{dayjs(r.date).format('DD')}</Text>
                  </View>
                  <View style={styles.recordBody}>
                    <Text style={styles.recordTitle}>{title}</Text>
                    <Text style={styles.recordSub}>{subText}</Text>
                  </View>
                  <View style={[styles.recordBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.recordBadgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },

  clockCard: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.xl,
    marginHorizontal: colors.spacing.md,
    marginTop: colors.spacing.md,
    paddingVertical: colors.spacing.xxl,
    paddingHorizontal: colors.spacing.lg,
    alignItems: 'center',
    ...colors.shadow.primary,
  },
  clockDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clockDate: {
    fontSize: 13,
    color: colors.alpha('255, 255, 255', 0.85),
    fontWeight: '500',
  },
  clockTime: {
    fontSize: 42,
    fontWeight: '700',
    color: colors.primaryForeground,
    letterSpacing: -0.5,
    lineHeight: 50,
    marginTop: colors.spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  btnRow: { flexDirection: 'row', gap: colors.spacing.md, marginTop: colors.spacing.xl, alignSelf: 'stretch' },
  clockBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: colors.radius.lg,
  },
  checkInBtn: { backgroundColor: colors.primaryForeground },
  checkInText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  checkOutBtn: {
    backgroundColor: colors.alpha('255, 255, 255', 0.15),
    borderWidth: 1,
    borderColor: colors.alpha('255, 255, 255', 0.35),
  },
  checkOutText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  radiusHint: {
    fontSize: colors.fontSize.xs,
    color: colors.alpha('255, 255, 255', 0.7),
    marginTop: colors.spacing.md,
    textAlign: 'center',
  },
  clockStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: colors.spacing.lg,
    paddingTop: colors.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.alpha('255, 255, 255', 0.25),
    alignSelf: 'stretch',
  },
  clockStat: { flex: 1, alignItems: 'center' },
  clockStatLabel: { fontSize: colors.fontSize.xs, color: colors.alpha('255, 255, 255', 0.7) },
  clockStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  clockStatValueMuted: { color: colors.alpha('255, 255, 255', 0.6) },
  vDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.alpha('255, 255, 255', 0.25) },

  sectionTitle: {
    fontSize: colors.fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
    marginTop: colors.spacing.xxl,
    marginBottom: colors.spacing.md,
    marginHorizontal: colors.spacing.lg,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: colors.spacing.md,
    marginHorizontal: colors.spacing.md,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: colors.spacing.lg,
    ...colors.shadow.card,
  },
  statLabel: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },
  statValue: {
    fontSize: colors.fontSize['3xl'],
    fontWeight: '700',
    color: colors.ink,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  statUnit: { fontSize: 15, fontWeight: '500', color: colors.ink3 },
  statBadge: {
    alignSelf: 'flex-start',
    borderRadius: colors.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: colors.spacing.md,
  },
  statBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },

  listCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: colors.spacing.md,
    paddingHorizontal: colors.spacing.lg,
    ...colors.shadow.card,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.md,
    paddingVertical: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  recordRowFirst: { borderTopWidth: 0 },
  dateBadge: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadgeMonth: { fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: 14 },
  dateBadgeDay: { fontSize: 17, fontWeight: '700', color: colors.primary, lineHeight: 20 },
  recordBody: { flex: 1 },
  recordTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  recordSub: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  recordBadge: {
    borderRadius: colors.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recordBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
});