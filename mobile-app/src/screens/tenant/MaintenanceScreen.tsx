import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { maintenanceApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { useI18n } from '@/i18n';
import type { MaintenanceTicket } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';

const PRIORITY_OPTIONS: Array<{ label: string; value: MaintenanceTicket['priority'] }> = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '紧急', value: 'urgent' },
];

const statusMeta: Record<string, { text: string; color: string; bg: string }> = {
  submitted: { text: '待处理', color: colors.warning, bg: colors.warningLight },
  accepted: { text: '已受理', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  in_progress: { text: '处理中', color: colors.primary, bg: colors.sidebarActive },
  resolved: { text: '已完成', color: colors.success, bg: colors.successLight },
  closed: { text: '已关闭', color: colors.ink3, bg: colors.surface2 },
};

// 优先级徽标（对齐原型：紧急=红 / 高=橙 / 中=蓝 / 低=灰）
const priorityMeta: Record<string, { color: string; bg: string }> = {
  urgent: { color: colors.error, bg: colors.errorLight },
  high: { color: colors.warning, bg: colors.warningLight },
  medium: { color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  low: { color: colors.ink2, bg: colors.surface2 },
};

// 状态 Tabs（对齐原型：全部 / 待处理 / 处理中 / 已完成）
type StatusTabKey = 'all' | 'pending' | 'processing' | 'done';
const STATUS_TABS: { key: StatusTabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'processing', label: '处理中' },
  { key: 'done', label: '已完成' },
];

const matchTab = (status: string, tab: StatusTabKey) => {
  if (tab === 'all') return true;
  if (tab === 'pending') return status === 'submitted';
  if (tab === 'processing') return status === 'accepted' || status === 'in_progress';
  return status === 'resolved' || status === 'closed';
};

const formatDate = (x?: string) =>
  x ? x.replace('T', ' ').slice(0, 16) : '—';

// 工单编号（原型 #MT-001；此处用真实 id 前缀派生，不虚构编号）
const ticketCode = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

interface TicketRow extends MaintenanceTicket {}

export default function MaintenanceScreen() {
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView>(null);
  // 提交表单
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenanceTicket['priority']>('medium');
  const [submitting, setSubmitting] = useState(false);
  // 内联校验（红边 + 文案，放在字段旁）
  const [titleError, setTitleError] = useState('');
  const [descError, setDescError] = useState('');

  // 工单列表
  const user = useAuthStore((s) => s.user);
  const q = useCachedQuery<TicketRow[]>({
    queryKey: ['maint', 'list', user?.id ?? 'anon'],
    cacheKey: `maint:list:${user?.id ?? 'anon'}`,
    queryFn: async () => {
      const res: any = await maintenanceApi.list({ page: 1, page_size: 100 });
      const d = res?.data;
      return Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
    },
  });
  const tickets = q.data ?? [];
  const loading = q.isPending && !q.data;
  const loadError = q.isError && !q.data;
  const [statusTab, setStatusTab] = useState<StatusTabKey>('all');
  // 历史工单折叠（默认收起，保持「提交报修」表单优先可见）
  const [historyOpen, setHistoryOpen] = useState(false);

  const refreshTickets = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  // 详情弹窗
  const [selected, setSelected] = useState<TicketRow | null>(null);
  // 评价
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);
  // 主 CTA 按压反馈：按下缩至 0.97、松手 spring 回弹（原生驱动；web 退化默认）
  const submitScale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(submitScale, {
      toValue: 0.97,
      speed: 30,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  const pressOut = () =>
    Animated.spring(submitScale, {
      toValue: 1,
      speed: 30,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

  // 空态点「去报修」：滚动到底部的提交表单
  const scrollToForm = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const handleSubmit = async () => {
    // 内联校验：必填标题；描述非空时至少 2 字
    let ok = true;
    if (!title.trim()) {
      setTitleError(t('maint.titleRequired'));
      ok = false;
    } else {
      setTitleError('');
    }
    if (description.trim() && description.trim().length < 2) {
      setDescError(t('maint.descInvalid'));
      ok = false;
    } else {
      setDescError('');
    }
    if (!ok) return;
    setSubmitting(true);
    try {
      await maintenanceApi.create({
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      notify(t('maint.submitSuccess'), t('maint.submitSuccessMsg'));
      setTitle('');
      setDescription('');
      setPriority('medium');
      setTitleError('');
      setDescError('');
      refreshTickets();
    } catch (err: any) {
      notifyError(t('maint.submitFail'), err, () => handleSubmit());
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = (t: TicketRow) => {
    setSelected(t);
    setRating(5);
    setFeedback('');
  };

  const canRate = (t: TicketRow | null) =>
    !!t && (t.status === 'resolved' || t.status === 'closed');

  const handleRate = async () => {
    if (!selected) return;
    setRatingLoading(true);
    try {
      await maintenanceApi.rate(selected.id, { rating, feedback: feedback.trim() || undefined });
      notify(t('maint.rateSuccess'), t('maint.rateSuccessMsg'));
      setSelected(null);
      refreshTickets();
    } catch (err: any) {
      notifyError(t('maint.rateFail'), err, () => handleRate());
    } finally {
      setRatingLoading(false);
    }
  };

  const renderTicket = ({ item }: { item: TicketRow }) => {
    const meta = statusMeta[item.status] ?? statusMeta.submitted;
    const prio = priorityMeta[item.priority] ?? priorityMeta.medium;
    const prioLabel =
      PRIORITY_OPTIONS.find((p) => p.value === item.priority)?.label ?? '—';
    return (
      <TouchableOpacity
        style={styles.ticketCard}
        activeOpacity={0.8}
        onPress={() => openDetail(item)}
      >
        <View style={styles.ticketTop}>
          <Text style={styles.ticketCode}>{ticketCode(item.id)}</Text>
          <Text style={styles.ticketTitle} numberOfLines={1}>
            {item.title || '报修工单'}
          </Text>
        </View>
        {!!item.description && (
          <Text style={styles.ticketDesc} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.ticketBottom}>
          <View style={styles.ticketBadges}>
            <View style={[styles.chip, { backgroundColor: prio.bg }]}>
              <Text style={[styles.chipText, { color: prio.color }]}>{prioLabel}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: meta.bg }]}>
              <Text style={[styles.chipText, { color: meta.color }]}>{meta.text}</Text>
            </View>
          </View>
          <Text style={styles.ticketDate}>{formatDate(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Stat Row / Tabs 计数均来自真实工单
  const pendingCount = tickets.filter((t) => t.status === 'submitted').length;
  const processingCount = tickets.filter(
    (t) => t.status === 'accepted' || t.status === 'in_progress'
  ).length;
  const tabCount = (key: StatusTabKey) =>
    tickets.filter((t) => matchTab(t.status, key)).length;
  const visibleTickets = tickets.filter((t) => matchTab(t.status, statusTab));

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Stat Row（真实工单统计） */}
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>待处理</Text>
          <Text
            style={[styles.statValue, pendingCount > 0 && { color: colors.warning }]}
          >
            {pendingCount} 个
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>处理中</Text>
          <Text
            style={[styles.statValue, processingCount > 0 && { color: colors.primary }]}
          >
            {processingCount} 个
          </Text>
        </View>
      </View>

      {/* 状态 Tabs（计数来自真实工单） */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statusTabs}
      >
        {STATUS_TABS.map((t) => {
          const active = statusTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.statusTab, active && styles.statusTabActive]}
              onPress={() => setStatusTab(t.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusTabText, active && styles.statusTabTextActive]}>
                {t.label} {tabCount(t.key)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 历史工单（可折叠：默认收起，避免历史挤占，保持表单区优先可见） */}
      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>工单列表</Text>
        {!loading && (
          <TouchableOpacity
            onPress={() => setHistoryOpen((v) => !v)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={historyOpen ? '收起工单列表' : '展开全部工单列表'}
          >
            <Text style={styles.historyToggleText}>
              {historyOpen ? '收起' : `展开全部(${visibleTickets.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {historyOpen &&
        (loading ? (
          <View style={styles.center}>
            <LoadingState label="加载工单中…" />
          </View>
        ) : loadError && visibleTickets.length === 0 ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t('loadFailed')}
            sub={t('loadFailedSub')}
            actionLabel={t('retry')}
            onAction={refreshTickets}
          />
        ) : visibleTickets.length === 0 ? (
          <EmptyState
            icon="construct-outline"
            title={t('empty.maintenance')}
            sub={t('empty.maintenanceSub')}
            actionLabel={t('maint.goSubmit')}
            onAction={scrollToForm}
          />
        ) : (
          visibleTickets.map((t) => renderTicket({ item: t }))
        ))}

      {/* 提交报修（现有业务逻辑保留，按原型置于列表之后） */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>提交报修</Text>
      </View>
      <Card>
        <Text style={styles.label}>{t('maint.title')}</Text>
        <TextInput
          style={[styles.input, !!titleError && styles.inputError]}
          placeholder={t('maint.titlePlaceholder')}
          placeholderTextColor={colors.ink3}
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (titleError) setTitleError('');
          }}
        />
        {!!titleError && <Text style={styles.fieldError}>{titleError}</Text>}
        <Text style={styles.label}>{t('maint.desc')}</Text>
        <TextInput
          style={[styles.input, styles.textarea, !!descError && styles.inputError]}
          placeholder={t('maint.descPlaceholder')}
          placeholderTextColor={colors.ink3}
          value={description}
          onChangeText={(v) => {
            setDescription(v);
            if (descError) setDescError('');
          }}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        {!!descError && <Text style={styles.fieldError}>{descError}</Text>}
        <Text style={styles.label}>{t('maint.priority')}</Text>
        <View style={styles.priorityRow}>
          {PRIORITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.priorityBtn, priority === opt.value && styles.priorityBtnActive]}
              onPress={() => setPriority(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={`优先级 ${opt.label}`}
            >
              <Text
                style={[styles.priorityText, priority === opt.value && styles.priorityTextActive]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Animated.View style={{ transform: [{ scale: submitScale }] }}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
            onPressIn={pressIn}
            onPressOut={pressOut}
            accessibilityRole="button"
            accessibilityLabel={t('maint.submit')}
            accessibilityState={{ disabled: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.submitText}>{t('maint.submit')}</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </Card>

      {/* 工单详情 + 评价弹窗 */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>工单详情</Text>
              <TouchableOpacity
                onPress={() => setSelected(null)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="关闭"
              >
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            {selected && (
              <>
                <Text style={styles.modalProp}>{selected.title || '报修工单'}</Text>
                <Text style={styles.modalLabel}>详情描述</Text>
                <Text style={styles.modalText}>{selected.description || '无描述'}</Text>
                <Text style={styles.modalLabel}>状态</Text>
                <Text style={styles.modalText}>
                  {statusMeta[selected.status]?.text ?? selected.status} ·{' '}
                  {PRIORITY_OPTIONS.find((p) => p.value === selected.priority)?.label ?? '—'}优先级
                </Text>
                <Text style={styles.modalLabel}>提交时间</Text>
                <Text style={styles.modalText}>{formatDate(selected.createdAt)}</Text>

                {canRate(selected) && (
                  <View style={styles.rateArea}>
                    <Text style={styles.modalLabel}>服务评价</Text>
                    <View style={styles.starRow}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <TouchableOpacity
                          key={s}
                          onPress={() => setRating(s)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          accessibilityRole="button"
                          accessibilityLabel={`${s} 星`}
                        >
                          <Ionicons
                            name={rating >= s ? 'star' : 'star-outline'}
                            size={28}
                            color={rating >= s ? colors.warning : colors.ink3}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={[styles.input, styles.textarea, styles.feedbackInput]}
                      placeholder="留下您的反馈（可选）"
                      placeholderTextColor={colors.ink3}
                      value={feedback}
                      onChangeText={setFeedback}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={[styles.rateBtn, ratingLoading && styles.submitBtnDisabled]}
                      onPress={handleRate}
                      disabled={ratingLoading}
                      activeOpacity={0.8}
                    >
                      {ratingLoading ? (
                        <ActivityIndicator color={colors.primaryForeground} size="small" />
                      ) : (
                        <Text style={styles.rateBtnText}>提交评价</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingVertical: 8, paddingBottom: 24 },
  center: { paddingVertical: 32, alignItems: 'center' },
  label: { fontSize: 14, color: colors.text, fontWeight: '500', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  inputError: { borderColor: colors.error, backgroundColor: colors.surface },
  fieldError: { fontSize: 12, color: colors.error, marginTop: 6, marginBottom: -2 },
  textarea: { minHeight: 90 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityBtn: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: colors.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  priorityBtnActive: { borderColor: colors.primary, backgroundColor: colors.sidebarActive },
  priorityText: { fontSize: 14, color: colors.ink2 },
  priorityTextActive: { color: colors.primary, fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '600' },

  sectionHeader: { paddingHorizontal: 12, marginTop: 12, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  // 历史工单折叠头：标题 + 展开/收起按钮
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  historyToggleText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  // Stat Row
  statRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statLabel: { fontSize: 12, color: colors.ink2 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 4 },
  // 状态 Tabs
  statusTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 4 },
  statusTab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  statusTabActive: { backgroundColor: colors.primary },
  statusTabText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  statusTabTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 20 },
  ticketCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 6,
  },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ticketCode: { fontSize: 13, color: colors.ink2 },
  ticketTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.sm },
  chipText: { fontSize: 12, fontWeight: '600' },
  ticketDesc: { fontSize: 13, color: colors.ink2, marginBottom: 8 },
  ticketBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketBadges: { flexDirection: 'row', gap: 6 },
  ticketDate: { fontSize: 13, color: colors.ink2 },

  modalWrap: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.4),
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 16,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalProp: { fontSize: 15, fontWeight: '600', color: colors.text },
  modalLabel: { fontSize: 12, color: colors.ink2, marginTop: 12, marginBottom: 4 },
  modalText: { fontSize: 14, color: colors.ink2, lineHeight: 20 },
  rateArea: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  starRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  feedbackInput: { minHeight: 70 },
  rateBtn: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  rateBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '600' },
});