import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import api from '@/lib/api';

interface DayRow {
  date: string;
  status: string;
  check_in?: string | null;
  check_out?: string | null;
}
interface EmpRow {
  employee_id: string;
  name?: string | null;
  email?: string | null;
  department?: string | null;
  employee_code?: string | null;
  days: DayRow[];
}

const STATUS_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  present: { label: '出勤', color: colors.success, icon: 'checkmark-circle' },
  late: { label: '迟到', color: colors.warning, icon: 'time' },
  absent: { label: '缺勤', color: colors.error, icon: 'close-circle' },
  leave: { label: '请假', color: colors.ink3, icon: 'calendar-outline' },
  field_work: { label: '外勤', color: colors.primary, icon: 'walk' },
};
const getStatus = (s: string) => STATUS_META[s] ?? { label: s, color: colors.ink3, icon: 'ellipse-outline' as const };

export default function AttendanceReviewScreen() {
  const [records, setRecords] = useState<EmpRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [range, setRange] = useState<{ start: string; end: string; days: number }>({ start: '', end: '', days: 7 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res: any = await api.get('/attendance/admin/records');
      const d = res?.data ?? {};
      setRecords(d.records ?? []);
      setSummary(d.summary ?? {});
      setTotalEmployees(d.total_employees ?? 0);
      setRange(d.range ?? { start: '', end: '', days: 7 });
    } catch (e: any) {
      Alert.alert('加载失败', e?.response?.data?.detail || '无法获取考勤记录');
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

  const statusKeys = ['present', 'late', 'absent', 'leave', 'field_work'].filter((k) => (summary[k] ?? 0) > 0);

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} colors={[colors.primary]} tintColor={colors.primary} />}
    >
      <View style={styles.head}>
        <Text style={styles.title}>考勤核对</Text>
        <Text style={styles.subtitle}>
          {range.start || '-'} ~ {range.end || '-'} · {range.days} 天 · 员工 {totalEmployees} 人
        </Text>
      </View>

      {/* 汇总 */}
      <View style={styles.summaryRow}>
        {statusKeys.length === 0 ? (
          <Text style={styles.summaryEmpty}>该时段暂无考勤记录</Text>
        ) : (
          statusKeys.map((k) => {
            const m = getStatus(k);
            return (
              <View key={k} style={[styles.summaryCard, { borderLeftColor: m.color }]}>
                <Ionicons name={m.icon} size={16} color={m.color} />
                <Text style={[styles.summaryNum, { color: m.color }]}>{summary[k] ?? 0}</Text>
                <Text style={styles.summaryLabel}>{m.label}</Text>
              </View>
            );
          })
        )}
      </View>

      {/* 员工列表 */}
      {records.length === 0 ? (
        <EmptyState icon="people-outline" title="暂无员工考勤" sub="员工打卡后将在此展示" />
      ) : (
        records.map((emp) => (
          <View key={emp.employee_id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(emp.name || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.cardTitle}>
                <Text style={styles.empName}>{emp.name || '未命名'}</Text>
                <Text style={styles.empMeta}>
                  {emp.employee_code || ''} {emp.department ? `· ${emp.department}` : ''}
                </Text>
              </View>
              <Text style={styles.empDays}>{emp.days.length} 天记录</Text>
            </View>
            {emp.days.length === 0 ? (
              <Text style={styles.noDays}>该时段无打卡</Text>
            ) : (
              emp.days.map((d) => {
                const m = getStatus(d.status);
                return (
                  <View key={d.date} style={styles.dayRow}>
                    <Text style={styles.dayDate}>{d.date.slice(5)}</Text>
                    <View style={[styles.dayStatus, { backgroundColor: `${m.color}1A` }]}>
                      <Ionicons name={m.icon} size={11} color={m.color} />
                      <Text style={[styles.dayStatusText, { color: m.color }]}>{m.label}</Text>
                    </View>
                    <Text style={styles.dayTime}>
                      {d.check_in ? String(d.check_in).slice(11, 16) : '--:--'}
                      {d.check_out ? ` ~ ${String(d.check_out).slice(11, 16)}` : ''}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  head: { paddingHorizontal: 20, paddingTop: 20, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.ink3 },

  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, marginBottom: 16 },
  summaryCard: {
    flexBasis: '30%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: 12,
  },
  summaryNum: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: colors.ink3 },
  summaryEmpty: { fontSize: 13, color: colors.ink3, padding: 8 },

  card: { marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.surface, borderRadius: colors.radius.xl, borderWidth: 1, borderColor: colors.border, padding: 14, ...colors.shadow.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  cardTitle: { flex: 1 },
  empName: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  empMeta: { fontSize: 11, color: colors.ink3 },
  empDays: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  noDays: { fontSize: 12, color: colors.ink3, paddingVertical: 6 },

  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dayDate: { width: 44, fontSize: 12, fontWeight: '600', color: colors.ink2 },
  dayStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  dayStatusText: { fontSize: 11, fontWeight: '600' },
  dayTime: { flex: 1, textAlign: 'right', fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] },
});