import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';

interface ReviewItem {
  type: string;
  id: string;
  title: string;
  applicant: string;
  reason: string;
  status: string;
  created_at?: string;
}

const TYPE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  trip: { label: '外勤申请', icon: 'walk-outline', color: colors.warning },
  maintenance: { label: '报修工单', icon: 'construct-outline', color: colors.primary },
  service: { label: '服务订单', icon: 'sparkles-outline', color: colors.success },
  contract: { label: '合同流转', icon: 'document-text-outline', color: '#8b5cf6' },
};
const getType = (t: string) => TYPE_META[t] ?? { label: t, icon: 'ellipse-outline' as const, color: colors.ink3 };

export default function AdminReviewScreen() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res: any = await api.get('/review-center/todos');
      const d = res?.data ?? {};
      setItems(d.items ?? []);
      setSummary(d.summary ?? {});
    } catch (e: any) {
      Alert.alert('加载失败', e?.response?.data?.detail || '无法获取待办');
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

  // 外勤审批（action: approved/rejected）
  const handleTrip = async (id: string, action: string) => {
    try {
      await api.post(`/attendance/external-trips/${id}/approve`, { action, reply_note: action === 'approved' ? '管理员审批通过' : '管理员驳回' });
      Alert.alert('成功', action === 'approved' ? '已通过' : '已驳回');
      fetchData();
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '操作失败');
    }
  };

  // 报修受理 / 完结
  const handleTicket = async (id: string, status: string) => {
    try {
      await api.patch(`/maintenance/${id}`, { status });
      Alert.alert('成功', '工单状态已更新');
      fetchData();
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '操作失败');
    }
  };

  // 服务订单受理
  const handleOrder = async (id: string, status: string) => {
    try {
      await api.patch(`/service-orders/${id}`, { status });
      Alert.alert('成功', '订单状态已更新');
      fetchData();
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '操作失败');
    }
  };

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
      {/* 汇总卡 */}
      <View style={styles.summaryRow}>
        {Object.entries(TYPE_META).map(([k, m]) => (
          <View key={k} style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: `${m.color}1A` }]}>
              <Ionicons name={m.icon} size={18} color={m.color} />
            </View>
            <View style={styles.summaryBody}>
              <Text style={[styles.summaryNum, { color: m.color }]}>{summary[k] ?? 0}</Text>
              <Text style={styles.summaryLabel}>{m.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* 待办列表 */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>待办审核</Text>
        <Text style={styles.sectionHint}>共 {items.length} 项</Text>
      </View>

      {items.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title="暂无待办" sub="所有工单已处理完毕" />
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const meta = getType(item.type);
            return (
              <View key={`${item.type}-${item.id}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.tag, { backgroundColor: `${meta.color}1A` }]}>
                    <Ionicons name={meta.icon} size={12} color={meta.color} />
                    <Text style={[styles.tagText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.time}>{item.created_at ? String(item.created_at).replace('T', ' ').slice(5, 16) : ''}</Text>
                </View>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.reason} numberOfLines={2}>
                  申请人：{item.applicant} · {item.reason}
                </Text>
                <View style={styles.actions}>
                  {item.type === 'trip' && (
                    <>
                      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} activeOpacity={0.7} onPress={() => handleTrip(item.id, 'approved')}>
                        <Text style={styles.btnPrimaryText}>通过</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, styles.btnDanger]} activeOpacity={0.7} onPress={() => handleTrip(item.id, 'rejected')}>
                        <Text style={styles.btnDangerText}>驳回</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {item.type === 'maintenance' && (
                    <>
                      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} activeOpacity={0.7} onPress={() => handleTicket(item.id, 'assigned')}>
                        <Text style={styles.btnPrimaryText}>受理</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, styles.btnGhost]} activeOpacity={0.7} onPress={() => handleTicket(item.id, 'resolved')}>
                        <Text style={styles.btnGhostText}>完结</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {item.type === 'service' && (
                    <TouchableOpacity style={[styles.btn, styles.btnPrimary]} activeOpacity={0.7} onPress={() => handleOrder(item.id, 'assigned')}>
                      <Text style={styles.btnPrimaryText}>受理</Text>
                    </TouchableOpacity>
                  )}
                  {item.type === 'contract' && <Text style={styles.hint}>请在 Web 合同管理处理</Text>}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  summaryCard: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...colors.shadow.sm,
  },
  summaryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryBody: { flex: 1 },
  summaryNum: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  summaryLabel: { fontSize: 12, color: colors.ink3, fontWeight: '500' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  sectionHint: { fontSize: 12, color: colors.ink3 },

  list: { paddingHorizontal: 20, gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, borderWidth: 1, borderColor: colors.border, padding: 14, ...colors.shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: '600' },
  time: { fontSize: 11, color: colors.ink3 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  reason: { fontSize: 12, color: colors.ink2, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnDanger: { backgroundColor: 'rgba(220, 38, 38, 0.1)' },
  btnDangerText: { color: colors.error, fontSize: 13, fontWeight: '600' },
  btnGhost: { backgroundColor: colors.surface2 },
  btnGhostText: { color: colors.ink2, fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.ink3 },
});