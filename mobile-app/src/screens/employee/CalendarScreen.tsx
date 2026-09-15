import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';

type ItemType = 'viewing' | 'todo' | 'contract' | 'maintenance';

interface CalendarItem {
  id: string;
  type: ItemType;
  title: string;
  time: string;
  sub?: string;
  status?: string;
}

const typeConfig: Record<ItemType, { color: string; bg: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  viewing: { color: colors.primary, bg: 'rgba(20, 184, 166, 0.12)', label: '带看', icon: 'eye-outline' },
  todo: { color: colors.warning, bg: 'rgba(217, 119, 6, 0.12)', label: '待办', icon: 'checkbox-outline' },
  contract: { color: '#7a5cd6', bg: 'rgba(122, 92, 214, 0.12)', label: '合同', icon: 'document-text-outline' },
  maintenance: { color: colors.error, bg: 'rgba(220, 38, 38, 0.12)', label: '维护', icon: 'construct-outline' },
};

// 生成月历日期
const generateMonthDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay(); // 0 = 周日
  const totalDays = lastDay.getDate();

  const days: { date: Date; day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

  // 上月补位
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLast - i);
    days.push({ date: d, day: prevMonthLast - i, isCurrentMonth: false, isToday: false });
  }

  // 当月
  const today = new Date();
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i);
    const isToday =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    days.push({ date: d, day: i, isCurrentMonth: true, isToday });
  }

  // 下月补位到 42 格（6 周）
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d, day: i, isCurrentMonth: false, isToday: false });
  }

  return days;
};

// 生成模拟数据（按日期 key）
const generateMockItems = (year: number, month: number): Record<string, CalendarItem[]> => {
  const items: Record<string, CalendarItem[]> = {};
  const today = new Date();

  const samples: { offset: number; type: ItemType; title: string; time: string; sub: string }[] = [
    { offset: -3, type: 'viewing', title: '带看 - 素坤逸公寓', time: '10:00', sub: '客户：李先生' },
    { offset: -2, type: 'todo', title: '跟进客户回访', time: '14:00', sub: '3 位潜在客户' },
    { offset: -1, type: 'contract', title: '合同签约 - 501室', time: '15:30', sub: '业主：王先生' },
    { offset: 0, type: 'viewing', title: '带看 - Asoke 一居', time: '09:30', sub: '客户：张女士' },
    { offset: 0, type: 'viewing', title: '带看 - Phrom Phong', time: '14:00', sub: '客户：陈先生' },
    { offset: 0, type: 'todo', title: '提交本月报表', time: '18:00', sub: '业绩汇总' },
    { offset: 1, type: 'viewing', title: '带看 - Thonglor 两居', time: '11:00', sub: '客户：刘女士' },
    { offset: 1, type: 'maintenance', title: '房屋维修跟进', time: '15:00', sub: '302室空调' },
    { offset: 2, type: 'contract', title: '续租签约 - 201室', time: '10:00', sub: '客户：Brown 先生' },
    { offset: 3, type: 'viewing', title: '带看 - Ekkamai 三居', time: '13:00', sub: '客户：赵先生' },
    { offset: 5, type: 'todo', title: '月度客户回访', time: '全天', sub: '15 位客户' },
    { offset: 7, type: 'contract', title: '新合同起租', time: '09:00', sub: '405室 / 2年' },
    { offset: 10, type: 'viewing', title: 'VIP 客户带看', time: '10:00', sub: '3 套房源' },
    { offset: 14, type: 'maintenance', title: '季度设施检查', time: '全天', sub: '共 8 套房源' },
  ];

  samples.forEach((s, idx) => {
    const d = new Date(today);
    d.setDate(d.getDate() + s.offset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!items[key]) items[key] = [];
    items[key].push({
      id: `item-${idx}`,
      type: s.type,
      title: s.title,
      time: s.time,
      sub: s.sub,
    });
  });

  return items;
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function CalendarScreen() {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(now);
  const [refreshing, setRefreshing] = useState(false);

  const days = useMemo(() => generateMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);

  // 模拟数据
  const itemsByDate = useMemo(
    () => generateMockItems(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const selectedKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const selectedItems = itemsByDate[selectedKey] ?? [];

  const hasItems = (dateStr: string) => (itemsByDate[dateStr]?.length ?? 0) > 0;
  const getItemTypes = (dateStr: string) => {
    const items = itemsByDate[dateStr] ?? [];
    const types = new Set(items.map((i) => i.type));
    return Array.from(types);
  };

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToday = () => {
    const t = new Date();
    setCurrentYear(t.getFullYear());
    setCurrentMonth(t.getMonth());
    setSelectedDate(t);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

  const isSelected = (d: Date) =>
    d.getFullYear() === selectedDate.getFullYear() &&
    d.getMonth() === selectedDate.getMonth() &&
    d.getDate() === selectedDate.getDate();

  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const isSameMonth = (d: Date) => d.getMonth() === currentMonth && d.getFullYear() === currentYear;

  return (
    <View style={styles.container}>
      {/* 顶部月份导航 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.navBtn} onPress={prevMonth}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.monthInfo}>
          <Text style={styles.monthText}>{monthNames[currentMonth]}</Text>
          <Text style={styles.yearText}>{currentYear}</Text>
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={nextMonth}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 今天按钮 */}
        <View style={styles.todayRow}>
          <TouchableOpacity style={styles.todayBtn} onPress={goToday}>
            <Text style={styles.todayBtnText}>今天</Text>
          </TouchableOpacity>
          <View style={styles.legendRow}>
            {(['viewing', 'todo', 'contract', 'maintenance'] as ItemType[]).map((t) => (
              <View key={t} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: typeConfig[t].color }]} />
                <Text style={styles.legendLabel}>{typeConfig[t].label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 月历 */}
        <View style={styles.calendarCard}>
          {/* 星期头 */}
          <View style={styles.weekHeader}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.weekDay, i === 0 && styles.weekend, i === 6 && styles.weekend]}>
                {w}
              </Text>
            ))}
          </View>
          {/* 日期格 */}
          <View style={styles.daysGrid}>
            {days.map((d, idx) => {
              const key = dateKey(d.date);
              const selected = isSelected(d.date);
              const hasData = hasItems(key);
              const itemTypes = getItemTypes(key);
              const weekday = idx % 7;
              const isWeekend = weekday === 0 || weekday === 6;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dayCell,
                    selected && styles.dayCellSelected,
                  ]}
                  onPress={() => setSelectedDate(d.date)}
                  activeOpacity={0.6}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !d.isCurrentMonth && styles.dayNumberMuted,
                      selected && styles.dayNumberSelected,
                      d.isToday && styles.dayNumberToday,
                      isWeekend && d.isCurrentMonth && !selected && styles.dayNumberWeekend,
                    ]}
                  >
                    {d.day}
                  </Text>
                  {/* 事件标记点 */}
                  {hasData && d.isCurrentMonth && (
                    <View style={styles.eventDots}>
                      {itemTypes.slice(0, 3).map((t, i) => (
                        <View
                          key={i}
                          style={[
                            styles.eventDot,
                            { backgroundColor: selected ? '#fff' : typeConfig[t].color },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 选中日期的日程 */}
        <View style={styles.scheduleSection}>
          <View style={styles.scheduleHeader}>
            <Text style={styles.scheduleTitle}>
              {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 · 周日程
            </Text>
            <Text style={styles.scheduleCount}>{selectedItems.length} 项</Text>
          </View>

          {selectedItems.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="暂无安排"
              sub="这一天没有预约和待办"
            />
          ) : (
            <View style={styles.scheduleList}>
              {selectedItems.map((item) => {
                const cfg = typeConfig[item.type];
                return (
                  <View key={item.id} style={styles.scheduleItem}>
                    <View style={styles.scheduleTimeCol}>
                      <Text style={[styles.scheduleTime, { color: cfg.color }]}>{item.time}</Text>
                      <View style={[styles.scheduleLine, { backgroundColor: cfg.color }]} />
                    </View>
                    <View style={[styles.scheduleCard, { borderLeftColor: cfg.color }]}>
                      <View style={styles.scheduleCardTop}>
                        <View style={[styles.scheduleTypeTag, { backgroundColor: cfg.bg }]}>
                          <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                          <Text style={[styles.scheduleTypeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                      </View>
                      <Text style={styles.scheduleTitleItem} numberOfLines={1}>{item.title}</Text>
                      {item.sub && <Text style={styles.scheduleSub}>{item.sub}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },

  /* 顶部 */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface2,
  },
  monthInfo: { alignItems: 'center' },
  monthText: { fontSize: 18, fontWeight: '700', color: colors.text },
  yearText: { fontSize: 12, color: colors.ink3, marginTop: 1 },

  /* 今天 & 图例 */
  todayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
  },
  todayBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  legendLabel: { fontSize: 11, color: colors.ink3 },

  /* 日历卡片 */
  calendarCard: {
    marginHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink2,
    paddingVertical: 6,
  },
  weekend: { color: colors.error },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  dayNumberMuted: { color: colors.ink3, opacity: 0.5 },
  dayNumberSelected: { color: '#fff', fontWeight: '700' },
  dayNumberToday: {
    fontWeight: '700',
  },
  dayNumberWeekend: { color: colors.error },
  eventDots: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  /* 日程列表 */
  scheduleSection: {
    marginTop: 18,
    paddingHorizontal: 12,
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  scheduleTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  scheduleCount: { fontSize: 12, color: colors.ink3 },
  scheduleList: { gap: 10 },
  scheduleItem: {
    flexDirection: 'row',
  },
  scheduleTimeCol: {
    width: 56,
    alignItems: 'center',
  },
  scheduleTime: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  scheduleLine: {
    width: 2,
    flex: 1,
    minHeight: 40,
    opacity: 0.3,
  },
  scheduleCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginLeft: 12,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  scheduleCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  scheduleTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  scheduleTypeText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
  },
  scheduleTitleItem: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  scheduleSub: {
    fontSize: 12,
    color: colors.ink3,
    marginTop: 3,
  },
});
