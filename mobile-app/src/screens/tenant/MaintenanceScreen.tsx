import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { maintenanceApi } from '@/services/api';
import type { MaintenanceTicket } from '@/types';

const PRIORITY_OPTIONS: Array<{ label: string; value: MaintenanceTicket['priority'] }> = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '紧急', value: 'urgent' },
];

const statusMeta: Record<string, { text: string; color: string; bg: string }> = {
  submitted: { text: '已提交', color: colors.warning, bg: '#fff6e6' },
  accepted: { text: '已受理', color: colors.info, bg: '#e6f4fd' },
  in_progress: { text: '处理中', color: colors.primary, bg: colors.sidebarActive },
  resolved: { text: '已解决', color: colors.success, bg: '#e7f6ee' },
  closed: { text: '已关闭', color: colors.ink3, bg: '#f2f3f5' },
};

const formatDate = (x?: string) =>
  x ? x.replace('T', ' ').slice(0, 16) : '—';

interface TicketRow extends MaintenanceTicket {}

export default function MaintenanceScreen() {
  // 提交表单
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenanceTicket['priority']>('medium');
  const [submitting, setSubmitting] = useState(false);

  // 工单列表
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 详情弹窗
  const [selected, setSelected] = useState<TicketRow | null>(null);
  // 评价
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const res: any = await maintenanceApi.list({ page: 1, page_size: 100 });
      const d = res?.data;
      const items = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
      setTickets(items as TicketRow[]);
    } catch {
      // 忽略加载失败
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('提示', '请输入报修标题');
      return;
    }
    setSubmitting(true);
    try {
      await maintenanceApi.create({
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      Alert.alert('提交成功', '您的报修工单已提交，工作人员将尽快处理');
      setTitle('');
      setDescription('');
      setPriority('medium');
      loadTickets();
    } catch (err: any) {
      Alert.alert('提交失败', err?.response?.data?.message || '请稍后重试');
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
      Alert.alert('感谢评价', '您的评价已提交，感谢您的反馈');
      setSelected(null);
      loadTickets();
    } catch (err: any) {
      Alert.alert('评价失败', err?.response?.data?.detail || err?.response?.data?.message || '请稍后重试');
    } finally {
      setRatingLoading(false);
    }
  };

  const renderTicket = ({ item }: { item: TicketRow }) => {
    const meta = statusMeta[item.status] ?? statusMeta.submitted;
    return (
      <TouchableOpacity
        style={styles.ticketCard}
        activeOpacity={0.8}
        onPress={() => openDetail(item)}
      >
        <View style={styles.ticketTop}>
          <Text style={styles.ticketTitle} numberOfLines={1}>
            {item.title || '报修工单'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.text}</Text>
          </View>
        </View>
        {!!item.description && (
          <Text style={styles.ticketDesc} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <Text style={styles.ticketMeta}>
          {PRIORITY_OPTIONS.find((p) => p.value === item.priority)?.label ?? '—'}优先级 · {formatDate(item.createdAt)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card title="提交报修">
        <Text style={styles.label}>标题</Text>
        <TextInput
          style={styles.input}
          placeholder="请简述问题，如：水管漏水"
          placeholderTextColor={colors.ink3}
          value={title}
          onChangeText={setTitle}
        />
        <Text style={styles.label}>详细描述</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="请描述问题详情"
          placeholderTextColor={colors.ink3}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Text style={styles.label}>优先级</Text>
        <View style={styles.priorityRow}>
          {PRIORITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.priorityBtn, priority === opt.value && styles.priorityBtnActive]}
              onPress={() => setPriority(opt.value)}
            >
              <Text
                style={[styles.priorityText, priority === opt.value && styles.priorityTextActive]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.submitText}>提交工单</Text>
          )}
        </TouchableOpacity>
      </Card>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>我的报修记录</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tickets.length === 0 ? (
        <Text style={styles.empty}>暂无报修记录</Text>
      ) : (
        tickets.map((t) => renderTicket({ item: t }))
      )}

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
              <TouchableOpacity onPress={() => setSelected(null)} activeOpacity={0.7}>
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
                        <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7}>
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
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  textarea: { minHeight: 90 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  priorityBtnActive: { borderColor: colors.primary, backgroundColor: colors.sidebarActive },
  priorityText: { fontSize: 14, color: colors.ink2 },
  priorityTextActive: { color: colors.primary, fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '600' },

  sectionHeader: { paddingHorizontal: 12, marginTop: 12, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 20 },
  ticketCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 6,
  },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  ticketDesc: { fontSize: 13, color: colors.ink2, marginTop: 6 },
  ticketMeta: { fontSize: 11, color: colors.ink3, marginTop: 8 },

  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
  modalLabel: { fontSize: 12, color: colors.ink3, marginTop: 12, marginBottom: 4 },
  modalText: { fontSize: 14, color: colors.ink2, lineHeight: 20 },
  rateArea: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  starRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  feedbackInput: { minHeight: 70 },
  rateBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  rateBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '600' },
});