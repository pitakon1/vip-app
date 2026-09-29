import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import BeikeHeader from '@/components/BeikeHeader';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import {
  employeesApi,
  viewingsApi,
  leasesApi,
  propertiesApi,
  calendarEventsApi,
} from '@/services/api';

type IoniconName = keyof typeof Ionicons.glyphMap;
type EventKind = 'viewing' | 'rent' | 'contract' | 'user';

interface CalEvent {
  id: string;
  kind: EventKind;
  title: string;
  sub: string;
  date: Date;
  timeLabel?: string;
  statusLabel?: string;
  actionLabel?: string;
  actionRoute?: string;
}

const KIND_META: Record<EventKind, { label: string; color: string; bg: string; icon: IoniconName }> = {
  viewing: {
    label: '带看',
    color: colors.primary,
    bg: colors.alpha(colors.primaryRgb, 0.12),
    icon: 'eye-outline',
  },
  rent: {
    label: '租金',
    color: colors.warning,
    bg: colors.alpha(colors.warningRgb, 0.12),
    icon: 'wallet-outline',
  },
  contract: {
    label: '合同',
    color: colors.info,
    bg: colors.alpha(colors.infoRgb, 0.12),
    icon: 'document-text-outline',
  },
  user: {
    label: '自定义',
    color: colors.success,
    bg: colors.alpha(colors.successRgb, 0.12),
    icon: 'calendar-outline',
  },
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hhmm = (iso?: string | null) => {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const dateLabel = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;

const symOf = (c?: string | null) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

interface ViewingItem {
  id: string;
  property_title?: string | null;
  property_address?: string | null;
  scheduled_at?: string | null;
  visitor_name?: string | null;
  status?: string | null;
}

interface LeaseItem {
  id: string;
  property_id?: string | null;
  agent_id?: string | null;
  monthly_rent?: number;
  currency?: string | null;
  end_date?: string | null;
  status?: string | null;
}

interface ReceivableItem {
  payment_id: string;
  amount?: number;
  currency?: string | null;
  due_date?: string | null;
  is_overdue?: boolean;
}

interface CalendarEventItem {
  id: string;
  title?: string | null;
  note?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean;
}

interface WorkbenchSummary {
  lease_count?: number;
  pending_receivable?: number;
  overdue_receivable?: number;
}

// 生成月历日期（含上下月补位）
const generateMonthDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const days: { date: Date; day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];
  const today = new Date();

  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthLast - i),
      day: prevMonthLast - i,
      isCurrentMonth: false,
      isToday: false,
    });
  }
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i);
    days.push({
      date: d,
      day: i,
      isCurrentMonth: true,
      isToday:
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate(),
    });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), day: i, isCurrentMonth: false, isToday: false });
  }
  return days;
};

// —— 滚轮式时间选择器（纯 JS，无原生依赖）——
const WHEEL_ITEM = 40;
const WHEEL_ROWS = 5;
const WHEEL_HEIGHT = WHEEL_ITEM * WHEEL_ROWS;

function Wheel({
  items,
  index,
  onIndex,
}: {
  items: string[];
  index: number;
  onIndex: (i: number) => void;
}) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const y = Math.max(0, Math.min(index, items.length - 1)) * WHEEL_ITEM;
    ref.current?.scrollTo({ y, animated: false });
  }, [items, index]);

  // 停稳后吸附到最近一格
  const snap = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    let i = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM);
    i = Math.max(0, Math.min(items.length - 1, i));
    ref.current?.scrollTo({ y: i * WHEEL_ITEM, animated: true });
    onIndex(i);
  };

  return (
    <View style={styles.wheelBox}>
      <ScrollView
        ref={ref}
        snapToInterval={WHEEL_ITEM}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={snap}
        onScrollEndDrag={snap}
        contentContainerStyle={styles.wheelInner}
      >
        {items.map((t, i) => (
          <View key={i} style={styles.wheelItemBox}>
            <Text style={[styles.wheelItem, i === index && styles.wheelItemActive]}>{t}</Text>
          </View>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.wheelCenter} />
    </View>
  );
}

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(now);
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');

  const [viewings, setViewings] = useState<ViewingItem[]>([]);
  const [leases, setLeases] = useState<LeaseItem[]>([]);
  const [receivables, setReceivables] = useState<ReceivableItem[]>([]);
  const [userEvents, setUserEvents] = useState<CalendarEventItem[]>([]);
  const [summary, setSummary] = useState<WorkbenchSummary>({});
  const [propNames, setPropNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 「添加自定义事件」弹窗
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState<Date>(now);
  const [eventHour, setEventHour] = useState(now.getHours());
  const [eventMinute, setEventMinute] = useState(now.getMinutes());

  const load = useCallback(async () => {
    const [meRes, vwRes, lsRes, wbRes, pvRes, ceRes] = await Promise.allSettled([
      employeesApi.mine(),
      viewingsApi.list({ pageSize: 100 }),
      leasesApi.list({ page: 1, page_size: 100 }),
      employeesApi.workbench(),
      propertiesApi.list({ page: 1, page_size: 100 }),
      calendarEventsApi.list({ page: 1, page_size: 100 }),
    ]);

    if (pvRes.status === 'fulfilled') {
      const raw = pvRes.value.data as any;
      const items = Array.isArray(raw) ? raw : raw?.items ?? [];
      const map: Record<string, string> = {};
      items.forEach((p: any) => {
        if (p?.id) map[p.id] = p.room_number || p.address || '';
      });
      setPropNames(map);
    }

    if (vwRes.status === 'fulfilled') {
      const raw = vwRes.value.data as any;
      const items = Array.isArray(raw) ? raw : raw?.items ?? [];
      setViewings(items as ViewingItem[]);
    }

    if (lsRes.status === 'fulfilled') {
      const raw = lsRes.value.data as any;
      const items = Array.isArray(raw) ? raw : raw?.items ?? [];
      const myId = meRes.status === 'fulfilled' ? (meRes.value as any)?.data?.id : null;
      const mine = myId ? (items as LeaseItem[]).filter((l) => l.agent_id === myId) : (items as LeaseItem[]);
      setLeases(mine);
    }

    if (wbRes.status === 'fulfilled') {
      const d = (wbRes.value as any)?.data;
      setSummary(d?.summary ?? {});
      const pending: ReceivableItem[] = d?.receivables?.pending ?? [];
      const overdue: ReceivableItem[] = d?.receivables?.overdue ?? [];
      setReceivables([...pending, ...overdue]);
    }

    if (ceRes.status === 'fulfilled') {
      const raw = ceRes.value.data as any;
      const items = Array.isArray(raw) ? raw : raw?.items ?? [];
      setUserEvents(items as CalendarEventItem[]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const today = useMemo(() => new Date(), []);

  const leaseName = useCallback(
    (l: LeaseItem) => {
      const fromMap = l.property_id ? propNames[l.property_id] : '';
      return fromMap || (l.property_id ? `房源 ${String(l.property_id).slice(0, 6)}` : '房源');
    },
    [propNames]
  );

  // 全部日程事件（带看 / 租金到期 / 合同到期）
  const events = useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = [];

    viewings.forEach((v) => {
      if (!v.scheduled_at) return;
      const d = new Date(v.scheduled_at);
      if (Number.isNaN(d.getTime())) return;
      list.push({
        id: `viewing-${v.id}`,
        kind: 'viewing',
        title: `${v.visitor_name || '待定客户'} 看房`,
        sub: v.property_title || v.property_address || '房源',
        date: d,
        timeLabel: hhmm(v.scheduled_at),
        statusLabel: v.status || undefined,
      });
    });

    receivables.forEach((r) => {
      if (!r.due_date) return;
      const d = new Date(r.due_date);
      if (Number.isNaN(d.getTime())) return;
      list.push({
        id: `rent-${r.payment_id}`,
        kind: 'rent',
        title: r.is_overdue ? '租金催收' : '租金到期',
        sub: `${symOf(r.currency)}${Number(r.amount || 0).toLocaleString()} · ${dateLabel(d)}到期`,
        date: d,
        statusLabel: r.is_overdue ? '已逾期' : '待收',
        actionLabel: '去催收',
        actionRoute: 'CRM',
      });
    });

    leases.forEach((l) => {
      if (!l.end_date) return;
      const d = new Date(l.end_date);
      if (Number.isNaN(d.getTime())) return;
      const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
      list.push({
        id: `contract-${l.id}`,
        kind: 'contract',
        title: '合同到期提醒',
        sub: `${leaseName(l)} · ${dateLabel(d)}到期${days >= 0 ? `（剩 ${days} 天）` : `（已过期 ${-days} 天）`}`,
        date: d,
        statusLabel: days >= 0 ? `${days} 天后` : '已到期',
      });
    });

    userEvents.forEach((u) => {
      if (!u.start_at) return;
      const d = new Date(u.start_at);
      if (Number.isNaN(d.getTime())) return;
      list.push({
        id: `user-${u.id}`,
        kind: 'user',
        title: u.title || '自定义事件',
        sub: u.note || '自定义日程',
        date: d,
        timeLabel: hhmm(u.start_at),
      });
    });

    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [viewings, receivables, leases, userEvents, leaseName, today]);

  // 今日待跟进（逾期/7 日内到期/今日带看）
  const todayFollowUps = useMemo(() => {
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    const weekLater = new Date(dayEnd.getTime() + 7 * 86400000);
    return events.filter((e) => {
      if (e.kind === 'viewing') return e.date.getTime() <= dayEnd.getTime() && e.date.getTime() >= new Date(today.toDateString()).getTime();
      return e.date.getTime() <= weekLater.getTime();
    });
  }, [events, today]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    events.forEach((e) => {
      const k = keyOf(e.date);
      if (!map[k]) map[k] = [];
      map[k].push(e);
    });
    return map;
  }, [events]);

  const monthEvents = useMemo(
    () =>
      events.filter(
        (e) => e.date.getFullYear() === currentYear && e.date.getMonth() === currentMonth
      ),
    [events, currentYear, currentMonth]
  );

  // 本月重点
  const monthStats = useMemo(() => {
    const pending = summary.pending_receivable ?? 0;
    const overdue = summary.overdue_receivable ?? 0;
    const total = pending + overdue;
    const onTimeRate = total > 0 ? Math.round(((total - overdue) / total) * 100) : 0;
    const contractsThisMonth = leases.filter((l) => {
      if (!l.end_date) return false;
      const d = new Date(l.end_date);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const contractsNextMonth = leases.filter((l) => {
      if (!l.end_date) return false;
      const d = new Date(l.end_date);
      return d.getFullYear() === nextYear && d.getMonth() === nextMonth;
    }).length;
    return { pending, overdue, total, onTimeRate, contractsThisMonth, contractsNextMonth };
  }, [summary, leases, currentYear, currentMonth]);

  // 下月到期预告
  const nextMonthExpiries = useMemo(() => {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    return leases
      .filter((l) => {
        if (!l.end_date) return false;
        const d = new Date(l.end_date);
        return d.getFullYear() === nextYear && d.getMonth() === nextMonth;
      })
      .sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime());
  }, [leases, currentYear, currentMonth]);

  // 近期带看（未开始的最近 3 场）
  const upcomingViewings = useMemo(
    () => events.filter((e) => e.kind === 'viewing' && e.date.getTime() >= new Date(today.toDateString()).getTime()).slice(0, 3),
    [events, today]
  );

  const days = useMemo(() => generateMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);
  const selectedItems = eventsByDate[keyOf(selectedDate)] ?? [];

  const dayKinds = (k: string) => Array.from(new Set((eventsByDate[k] ?? []).map((e) => e.kind)));

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

  const isSelected = (d: Date) =>
    d.getFullYear() === selectedDate.getFullYear() &&
    d.getMonth() === selectedDate.getMonth() &&
    d.getDate() === selectedDate.getDate();

  // —— 添加自定义事件 ——
  const openModal = () => {
    setEventTitle('');
    setEventDate(selectedDate);
    setEventHour(selectedDate.getHours());
    // 分钟吸附到最近的 0/15/30/45 档
    const nearest =
      minuteOptions.reduce((a, b) =>
        Math.abs(b - selectedDate.getMinutes()) < Math.abs(a - selectedDate.getMinutes()) ? b : a,
        minuteOptions[0]
      );
    setEventMinute(nearest);
    setModalVisible(true);
  };

  const saveEvent = useCallback(async () => {
    const title = eventTitle.trim();
    if (!title || saving) return;
    const d = new Date(eventDate);
    d.setHours(eventHour, eventMinute, 0, 0);
    setSaving(true);
    try {
      await calendarEventsApi.create({ title, start_at: d.toISOString() });
      setModalVisible(false);
      setEventTitle('');
      setSaving(false);
      load();
    } catch {
      setSaving(false);
    }
  }, [eventTitle, saving, eventDate, eventHour, eventMinute, load]);

  // 当前事件所在月份的「日」滚轮选项
  const dayOptions = useMemo(() => {
    const totalDays = new Date(eventDate.getFullYear(), eventDate.getMonth() + 1, 0).getDate();
    return Array.from({ length: totalDays }, (_, i) => `${eventDate.getMonth() + 1}月${i + 1}日`);
  }, [eventDate]);

  const minuteOptions = [0, 15, 30, 45];

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载日程…" />
      </View>
    );
  }

  // 删除自定义日程（user 事件）：剥离 user- 前缀取真实 id
  const confirmDelete = (e: CalEvent) => {
    if (e.kind !== 'user') return;
    const realId = e.id.replace(/^user-/, '');
    Alert.alert('删除日程', `确定删除「${e.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          calendarEventsApi
            .remove(realId)
            .then(() => {
              load();
              Alert.alert('已删除', '自定义日程已删除');
            })
            .catch(() => Alert.alert('删除失败', '请稍后重试'));
        },
      },
    ]);
  };

  const renderEventItem = (e: CalEvent) => {
    const meta = KIND_META[e.kind];
    return (
      <View key={e.id} style={styles.followItem}>
        <View style={[styles.followIcon, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={18} color={meta.color} />
        </View>
        <View style={styles.followBody}>
          <View style={styles.followTop}>
            <Text style={styles.followTitle} numberOfLines={1}>{e.title}</Text>
            {e.statusLabel ? (
              <View style={[styles.followBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.followBadgeText, { color: meta.color }]}>{e.statusLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.followSub} numberOfLines={2}>
            {e.timeLabel ? `${e.timeLabel} · ` : ''}
            {e.sub}
          </Text>
        </View>
        {e.actionLabel && e.actionRoute ? (
          <TouchableOpacity
            style={styles.followAction}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(e.actionRoute)}
          >
            <Text style={styles.followActionText}>{e.actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {e.kind === 'user' ? (
          <TouchableOpacity
            style={styles.followDelete}
            activeOpacity={0.7}
            onPress={() => confirmDelete(e)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <BeikeHeader title="我的日程" />
      {/* 顶部月份导航 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.navBtn} onPress={prevMonth}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.monthInfo}>
          <Text style={styles.monthText}>{monthNames[currentMonth]}</Text>
          <Text style={styles.yearText}>{currentYear}</Text>
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={nextMonth}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 今日待跟进（置顶） */}
        <View style={styles.followCard}>
          <View style={styles.followHead}>
            <View style={styles.followHeadLeft}>
              <Text style={styles.followHeadTitle}>今日待跟进</Text>
              <View style={styles.warnBadge}>
                <Text style={styles.warnBadgeText}>{todayFollowUps.length} 项</Text>
              </View>
            </View>
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeText}>{dateLabel(today)}</Text>
            </View>
          </View>
          {todayFollowUps.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="今天没有待跟进事项"
              sub="逾期租金、近期到期合同与今日带看会集中在这里"
            />
          ) : (
            todayFollowUps.map(renderEventItem)
          )}
        </View>

        {/* 月历卡片 */}
        <View style={styles.calendarCard}>
          <View style={styles.calCardHead}>
            <Text style={styles.calCardTitle}>
              {currentYear} 年 {currentMonth + 1} 月
            </Text>
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, viewMode === 'month' && styles.tabActive]}
                activeOpacity={0.8}
                onPress={() => setViewMode('month')}
              >
                <Text style={[styles.tabText, viewMode === 'month' && styles.tabTextActive]}>月视图</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, viewMode === 'list' && styles.tabActive]}
                activeOpacity={0.8}
                onPress={() => setViewMode('list')}
              >
                <Text style={[styles.tabText, viewMode === 'list' && styles.tabTextActive]}>列表</Text>
              </TouchableOpacity>
            </View>
          </View>

          {viewMode === 'month' ? (
            <View style={styles.calBody}>
              <View style={styles.todayRow}>
                <TouchableOpacity style={styles.todayBtn} onPress={goToday} activeOpacity={0.8}>
                  <Text style={styles.todayBtnText}>今天</Text>
                </TouchableOpacity>
                <View style={styles.legendRow}>
                  {(['rent', 'contract', 'viewing', 'user'] as EventKind[]).map((k) => (
                    <View key={k} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: KIND_META[k].color }]} />
                      <Text style={styles.legendLabel}>
                        {k === 'rent' ? '租金' : k === 'contract' ? '合同' : k === 'viewing' ? '带看' : '自定义'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.weekHeader}>
                {WEEKDAYS.map((w, i) => (
                  <Text key={i} style={styles.weekDay}>{w}</Text>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {days.map((d, idx) => {
                  const k = keyOf(d.date);
                  const selected = isSelected(d.date);
                  const kinds = dayKinds(k);
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.dayCell, selected && styles.dayCellSelected]}
                      onPress={() => setSelectedDate(d.date)}
                      activeOpacity={0.6}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          !d.isCurrentMonth && styles.dayNumberMuted,
                          selected && styles.dayNumberSelected,
                          d.isToday && !selected && styles.dayNumberToday,
                        ]}
                      >
                        {d.day}
                      </Text>
                      {d.isCurrentMonth && kinds.length > 0 && (
                        <View style={styles.eventDots}>
                          {kinds.slice(0, 3).map((kind, i) => (
                            <View
                              key={i}
                              style={[
                                styles.eventDot,
                                { backgroundColor: selected ? colors.primaryForeground : KIND_META[kind].color },
                              ]}
                            />
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 选中日期的日程 */}
              <View style={styles.selectedHead}>
                <Text style={styles.selectedTitle}>
                  {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 安排
                </Text>
                <Text style={styles.selectedCount}>{selectedItems.length} 项</Text>
              </View>
              {selectedItems.length === 0 ? (
                <Text style={styles.selectedEmpty}>这一天没有带看与到期跟进</Text>
              ) : (
                selectedItems.map(renderEventItem)
              )}
            </View>
          ) : monthEvents.length === 0 ? (
            <EmptyState icon="calendar-outline" title="本月暂无安排" sub="带看、租金与合同到期会按日期汇总在这里" />
          ) : (
            <View style={styles.calBody}>
              {monthEvents.map((e) => (
                <View key={e.id} style={styles.listEventRow}>
                  <View style={[styles.listEventTag, { backgroundColor: KIND_META[e.kind].bg }]}>
                    <Text style={[styles.listEventTagText, { color: KIND_META[e.kind].color }]}>
                      {KIND_META[e.kind].label}
                    </Text>
                  </View>
                  <View style={styles.listEventBody}>
                    <Text style={styles.listEventTitle} numberOfLines={1}>
                      {e.timeLabel ? `${e.timeLabel} ` : ''}
                      {e.title}
                    </Text>
                    <Text style={styles.listEventSub} numberOfLines={1}>
                      {dateLabel(e.date)} · {e.sub}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 问候行（日历提醒） */}
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>日历提醒</Text>
            <Text style={styles.heroSub}>
              {currentYear} 年 {currentMonth + 1} 月 · 今日 {todayFollowUps.length} 项待跟进 · 本月租金到期{' '}
              {monthStats.total} 户
            </Text>
          </View>
          <View style={styles.heroAvatar}>
            <Ionicons name="calendar-outline" size={18} color={colors.primaryForeground} />
          </View>
        </View>

        {/* 本月重点 */}
        <Text style={styles.sectionTitle}>本月重点</Text>
        <View style={styles.stripCard}>
          <View style={styles.stripRow}>
            <View style={styles.stripCell}>
              <Text style={styles.stripValue}>
                {monthStats.total}
                <Text style={styles.stripUnit}> 户</Text>
              </Text>
              <Text style={styles.stripLabel}>本月租金到期</Text>
              <Text style={styles.stripSub}>
                待收 {monthStats.pending} · 逾期 {monthStats.overdue}
              </Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={[styles.stripValue, { color: monthStats.total === 0 ? colors.ink : colors.primary }]}>
                {monthStats.total > 0 ? `${monthStats.onTimeRate}%` : '—'}
              </Text>
              <Text style={styles.stripLabel}>按时率</Text>
              <Text style={styles.stripSub}>
                {monthStats.total > 0 ? `逾期 ${monthStats.overdue} 单` : '暂无待收租金单'}
              </Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={styles.stripValue}>
                {monthStats.contractsThisMonth}
                <Text style={styles.stripUnit}> 份</Text>
              </Text>
              <Text style={styles.stripLabel}>本月合同到期</Text>
              <Text style={styles.stripSub}>下月预告 {monthStats.contractsNextMonth} 份</Text>
            </View>
          </View>
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${monthStats.total > 0 ? monthStats.onTimeRate : 0}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {monthStats.total > 0
                ? `本月待收租金按时率 ${monthStats.onTimeRate}% · 待收 ${monthStats.pending} 户建议优先跟进`
                : '暂无待收租金单'}
            </Text>
          </View>
        </View>

        {/* 下月到期预告 */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionHeadTitle}>下月到期预告</Text>
          {nextMonthExpiries.length > 0 ? (
            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeText}>{nextMonthExpiries.length} 份</Text>
            </View>
          ) : null}
        </View>
        {nextMonthExpiries.length === 0 ? (
          <EmptyState icon="document-text-outline" title="下月暂无到期合同" sub="负责租约的到期日会提前在这里汇总" />
        ) : (
          <View style={styles.listCard}>
            {nextMonthExpiries.map((l, idx) => {
              const d = new Date(l.end_date!);
              const daysLeft = Math.ceil((d.getTime() - today.getTime()) / 86400000);
              return (
                <View key={l.id} style={[styles.simpleRow, idx > 0 && styles.simpleRowDivided]}>
                  <View style={styles.simpleBody}>
                    <Text style={styles.simpleTitle} numberOfLines={1}>{leaseName(l)}</Text>
                    <Text style={styles.simpleSub}>
                      {dateLabel(d)} 到期 · {symOf(l.currency)}
                      {Number(l.monthly_rent || 0).toLocaleString()}/月
                    </Text>
                  </View>
                  <View style={[styles.expireBadge, daysLeft <= 30 && styles.expireBadgeWarn]}>
                    <Text style={[styles.expireBadgeText, daysLeft <= 30 && { color: colors.error }]}>
                      {daysLeft >= 0 ? `${daysLeft} 天后` : '已到期'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 近期带看 */}
        <Text style={styles.sectionTitle}>近期带看</Text>
        {upcomingViewings.length === 0 ? (
          <EmptyState icon="eye-outline" title="暂无近期带看" sub="客户预约的看房行程会展示在这里" />
        ) : (
          <View style={styles.listCard}>
            {upcomingViewings.map((e, idx) => (
              <View key={e.id} style={[styles.simpleRow, idx > 0 && styles.simpleRowDivided]}>
                <View style={styles.simpleBody}>
                  <Text style={styles.simpleTitle} numberOfLines={1}>
                    {dateLabel(e.date)} {e.timeLabel} · {e.title}
                  </Text>
                  <Text style={styles.simpleSub} numberOfLines={1}>{e.sub}</Text>
                </View>
                {e.statusLabel ? (
                  <View style={styles.expireBadge}>
                    <Text style={styles.expireBadgeText}>{e.statusLabel}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 添加自定义事件入口 */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openModal}>
        <Ionicons name="add" size={26} color={colors.primaryForeground} />
      </TouchableOpacity>

      {/* 添加自定义事件弹窗 */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>添加自定义事件</Text>

            <TextInput
              style={styles.eventInput}
              value={eventTitle}
              onChangeText={setEventTitle}
              placeholder="事件内容，如：跟进客户 / 续签沟通"
              placeholderTextColor={colors.ink3}
              maxLength={60}
            />

            <Text style={styles.modalLabel}>日期与时间</Text>
            <View style={styles.wheelRow}>
              <View style={styles.wheelCol}>
                <Text style={styles.wheelColLabel}>日期</Text>
                <Wheel
                  items={dayOptions}
                  index={Math.max(0, eventDate.getDate() - 1)}
                  onIndex={(i) =>
                    setEventDate(new Date(eventDate.getFullYear(), eventDate.getMonth(), i + 1))
                  }
                />
              </View>
              <View style={styles.wheelCol}>
                <Text style={styles.wheelColLabel}>时</Text>
                <Wheel
                  items={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))}
                  index={eventHour}
                  onIndex={setEventHour}
                />
              </View>
              <View style={styles.wheelCol}>
                <Text style={styles.wheelColLabel}>分</Text>
                <Wheel
                  items={minuteOptions.map((m) => String(m).padStart(2, '0'))}
                  index={Math.max(0, minuteOptions.indexOf(eventMinute))}
                  onIndex={(i) => setEventMinute(minuteOptions[i])}
                />
              </View>
            </View>

            <Text style={styles.eventPreview}>
              时间：{eventDate.getMonth() + 1}月{eventDate.getDate()}日{' '}
              {String(eventHour).padStart(2, '0')}:{String(eventMinute).padStart(2, '0')}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                activeOpacity={0.8}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, (saving || !eventTitle.trim()) && styles.modalSaveDisabled]}
                activeOpacity={0.85}
                disabled={saving || !eventTitle.trim()}
                onPress={saveEvent}
              >
                <Text style={styles.modalSaveText}>{saving ? '保存中…' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },

  /* 顶部月份导航 */
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
  monthText: { fontSize: 18, fontWeight: '700', color: colors.ink },
  yearText: { fontSize: 12, color: colors.ink3, marginTop: 1, fontVariant: ['tabular-nums'] },

  /* 问候行 */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    padding: 16,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  heroLeft: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryForeground, letterSpacing: -0.2 },
  heroSub: { fontSize: 12, color: colors.alpha('255, 255, 255', 0.85), marginTop: 2 },
  heroAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.alpha('255, 255, 255', 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* 今日待跟进 */
  followCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    ...colors.shadow.sm,
  },
  followHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  followHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  followHeadTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  warnBadge: {
    backgroundColor: colors.alpha(colors.warningRgb, 0.12),
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  warnBadgeText: { fontSize: 11, fontWeight: '600', color: colors.warning },
  dateBadge: {
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
    borderRadius: colors.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dateBadgeText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  followItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  followIcon: {
    width: 38,
    height: 38,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBody: { flex: 1, minWidth: 0 },
  followTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  followTitle: { fontSize: 15, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  followBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  followBadgeText: { fontSize: 10, fontWeight: '600' },
  followSub: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  followAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
  },
  followActionText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  followDelete: {
    marginLeft: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.alpha(colors.errorRgb, 0.08),
  },

  /* 月历卡片 */
  calendarCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.sm,
  },
  calCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  calCardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.full,
    padding: 2,
  },
  tab: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: colors.radius.full },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
  tabTextActive: { color: colors.primaryForeground },
  calBody: { paddingBottom: 8 },

  todayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
  },
  todayBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  legendLabel: { fontSize: 11, color: colors.ink3 },

  weekHeader: { flexDirection: 'row', marginTop: 8, paddingHorizontal: 8 },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink3,
    paddingVertical: 6,
  },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6 },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: colors.radius.md,
  },
  dayCellSelected: { backgroundColor: colors.alpha(colors.primaryRgb, 0.1) },
  dayNumber: { fontSize: 13, fontWeight: '500', color: colors.ink, fontVariant: ['tabular-nums'] },
  dayNumberMuted: { color: colors.ink3, opacity: 0.5 },
  dayNumberSelected: { color: colors.primary, fontWeight: '700' },
  dayNumberToday: { color: colors.primary, fontWeight: '800' },
  eventDots: { flexDirection: 'row', marginTop: 3, gap: 2 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },

  selectedHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  selectedTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  selectedCount: { fontSize: 12, color: colors.ink3 },
  selectedEmpty: { fontSize: 13, color: colors.ink3, paddingHorizontal: 16, paddingVertical: 14 },
  listEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listEventTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  listEventTagText: { fontSize: 11, fontWeight: '600' },
  listEventBody: { flex: 1, minWidth: 0 },
  listEventTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  listEventSub: { fontSize: 12, color: colors.ink3, marginTop: 3 },

  /* 区块标题 */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  // 区块标题行（标题 + 数量徽章）
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  infoBadge: {
    backgroundColor: colors.alpha(colors.infoRgb, 0.12),
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  infoBadgeText: { fontSize: 11, fontWeight: '600', color: colors.info },
  sectionHeadTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },

  /* 本月重点 */
  stripCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.sm,
  },
  stripRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 14 },
  stripCell: { flex: 1, alignItems: 'center', gap: 4 },
  stripDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  stripValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  stripUnit: { fontSize: 13, fontWeight: '500', color: colors.ink3 },
  stripLabel: { fontSize: 11, color: colors.ink3, fontWeight: '500' },
  stripSub: { fontSize: 10, color: colors.ink3, textAlign: 'center' },
  progressWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  progressLabel: { fontSize: 11, color: colors.ink3, marginTop: 6 },

  /* 列表卡 */
  listCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  simpleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  simpleRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  simpleBody: { flex: 1, minWidth: 0 },
  simpleTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  simpleSub: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  expireBadge: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  expireBadgeWarn: { backgroundColor: colors.alpha(colors.errorRgb, 0.1) },
  expireBadgeText: { fontSize: 11, fontWeight: '600', color: colors.ink2 },

  /* 添加事件悬浮按钮 */
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.primary,
  },

  /* 添加事件弹窗 */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 39, 51, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xxl,
    borderTopRightRadius: colors.radius.xxl,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 14 },
  eventInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  modalLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 16, marginBottom: 8 },

  /* 滚轮式时间选择器 */
  wheelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  wheelCol: { flex: 1, alignItems: 'center' },
  wheelColLabel: { fontSize: 11, fontWeight: '600', color: colors.ink3, marginBottom: 6 },
  wheelBox: {
    height: WHEEL_HEIGHT,
    width: '100%',
    overflow: 'hidden',
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wheelInner: { paddingVertical: (WHEEL_HEIGHT - WHEEL_ITEM) / 2 },
  wheelItemBox: { height: WHEEL_ITEM, justifyContent: 'center', alignItems: 'center' },
  wheelItem: { fontSize: 15, fontWeight: '500', color: colors.ink2 },
  wheelItemActive: { fontWeight: '700', color: colors.primary, fontSize: 17 },
  wheelCenter: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: (WHEEL_HEIGHT - WHEEL_ITEM) / 2,
    height: WHEEL_ITEM,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
  },
  eventPreview: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    marginTop: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: colors.ink2 },
  modalSave: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
  },
  modalSaveText: { fontSize: 15, fontWeight: '600', color: colors.primaryForeground },
  modalSaveDisabled: { opacity: 0.5 },
});