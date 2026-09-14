import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { propertiesApi, viewingsApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const MANAGER_ROLES = ['admin', 'employee', 'agent'];

interface Property {
  id: string;
  title?: string;
  address?: string;
  price?: number;
}

interface Viewing {
  id: string;
  property_id: string;
  property_title?: string;
  property_address?: string;
  scheduled_at?: string;
  status?: string;
  visitor_name?: string | null;
  visitor_phone?: string | null;
}

const statusMeta: Record<string, { text: string; color: string }> = {
  pending: { text: '待确认', color: colors.warning },
  confirmed: { text: '已确认', color: colors.success },
  completed: { text: '已完成', color: colors.info },
  cancelled: { text: '已取消', color: colors.ink3 },
  no_show: { text: '爽约', color: colors.error },
};

const formatDate = (x?: string) =>
  x ? x.replace('T', ' ').slice(0, 16) : '—';

export default function ViewingsScreen() {
  const user = useAuthStore((state: any) => state.user);
  const isManager = !!(user && MANAGER_ROLES.includes(user.role));
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 新建预约表单
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProp, setSelectedProp] = useState<string>('');
  const [timeText, setTimeText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const calls = [
        isManager
          ? viewingsApi.list().catch(() => ({ data: { items: [] } }))
          : viewingsApi.mine().catch(() => ({ data: { items: [] } })),
        propertiesApi.list({ available: true }),
      ];
      const [vRes, pRes]: any[] = await Promise.allSettled(calls);
      if (vRes.status === 'fulfilled') {
        const d = vRes.value?.data;
        const items = Array.isArray(d?.items)
          ? d.items
          : Array.isArray(d)
          ? d
          : [];
        setViewings(items as Viewing[]);
      } else {
        setViewings([]);
      }
      if (pRes.status === 'fulfilled') {
        const d = pRes.value?.data;
        const items = Array.isArray(d?.items)
          ? d.items
          : Array.isArray(d)
          ? d
          : [];
        setProperties(items as Property[]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isManager]);

  const handleUpdate = async (id: string, status: string) => {
    try {
      await viewingsApi.updateStatus(id, { status });
      Alert.alert('已更新', '预约状态已更新');
      load();
    } catch (err: any) {
      Alert.alert('更新失败', err?.response?.data?.detail || '请稍后重试');
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!selectedProp) {
      Alert.alert('提示', '请选择要参观的房源');
      return;
    }
    if (!timeText.trim()) {
      Alert.alert('提示', '请填写看房时间，如 2026-09-20 10:00');
      return;
    }
    setSubmitting(true);
    try {
      await viewingsApi.create({
        property_id: selectedProp,
        scheduled_at: timeText.trim().replace(' ', 'T'),
        notes: noteText.trim() || undefined,
      });
      Alert.alert('提交成功', '预约已提交，工作人员将尽快与您确认');
      setTimeText('');
      setNoteText('');
      load();
    } catch (err: any) {
      Alert.alert(
        '提交失败',
        err?.response?.data?.detail || '请稍后重试'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: Viewing }) => {
    const meta = statusMeta[item.status ?? ''] ?? statusMeta.pending;
    const canAct =
      isManager && (item.status === 'pending' || item.status === 'confirmed');
    return (
      <Card>
        <View style={styles.rowTop}>
          <Text style={styles.propTitle} numberOfLines={1}>
            {item.property_title || '房源'}
          </Text>
          <Text style={[styles.status, { color: meta.color }]}>{meta.text}</Text>
        </View>
        {!!item.property_address && (
          <Text style={styles.address} numberOfLines={1}>
            {item.property_address}
          </Text>
        )}
        <Text style={styles.time}>看房时间 {formatDate(item.scheduled_at)}</Text>
        {isManager && (item.visitor_name || item.visitor_phone) && (
          <Text style={styles.time}>
            访客：{item.visitor_name || '—'} {item.visitor_phone || ''}
          </Text>
        )}
        {canAct && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() =>
                handleUpdate(
                  item.id,
                  item.status === 'pending' ? 'confirmed' : 'completed'
                )
              }
            >
              <Text style={styles.actionPrimaryText}>
                {item.status === 'pending' ? '确认' : '完成'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionWarn]}
              onPress={() => handleUpdate(item.id, 'no_show')}
            >
              <Text style={styles.actionWarnText}>爽约</Text>
            </TouchableOpacity>
            {item.status === 'pending' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionGhost]}
                onPress={() => handleUpdate(item.id, 'cancelled')}
              >
                <Text style={styles.actionGhostText}>取消</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={viewings}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListHeaderComponent={
        <View>
          {!isManager && (
            <Card title="预约看房">
              <Text style={styles.label}>选择房源</Text>
              <FlatList
                horizontal
                data={properties}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.propRow}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.propChip,
                      selectedProp === item.id && styles.propChipActive,
                    ]}
                    onPress={() => setSelectedProp(item.id)}
                  >
                    <Text
                      style={[
                        styles.propChipText,
                        selectedProp === item.id && styles.propChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.title || '房源'}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptySub}>暂无可预约房源</Text>
                }
              />
              <Text style={styles.label}>希望时间</Text>
              <TextInput
                style={styles.input}
                placeholder="如 2026-09-20 10:00"
                placeholderTextColor={colors.ink3}
                value={timeText}
                onChangeText={setTimeText}
              />
              <Text style={styles.label}>备注（可选）</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="如：希望看白天时段"
                placeholderTextColor={colors.ink3}
                value={noteText}
                onChangeText={setNoteText}
                multiline
                numberOfLines={2}
              />
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.submitText}>提交预约</Text>
                )}
              </TouchableOpacity>
            </Card>
          )}
          <Text style={styles.sectionTitle}>
            {isManager ? '全部看房预约' : '我的预约'}
          </Text>
        </View>
      }
      ListEmptyComponent={
        !loading && viewings.length === 0 ? (
          <Text style={styles.empty}>暂无预约记录</Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 12, paddingBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: colors.ink2,
    marginTop: 12,
    marginBottom: 6,
  },
  propRow: { paddingBottom: 4 },
  propChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: 8,
    maxWidth: 200,
  },
  propChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.sidebarActive,
  },
  propChipText: { fontSize: 13, color: colors.ink2 },
  propChipTextActive: { color: colors.primary, fontWeight: '600' },
  emptySub: { fontSize: 12, color: colors.ink3, paddingVertical: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  textarea: { minHeight: 56, textAlignVertical: 'top' },
  submitBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 999,
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  propTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  status: { fontSize: 12, fontWeight: '600', marginLeft: 8 },
  address: { fontSize: 12, color: colors.ink2, marginTop: 6 },
  time: { fontSize: 12, color: colors.ink3, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { color: colors.primaryForeground, fontSize: 12, fontWeight: '600' },
  actionWarn: { backgroundColor: colors.errorLight },
  actionWarnText: { color: colors.error, fontSize: 12, fontWeight: '600' },
  actionGhost: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  actionGhostText: { color: colors.ink2, fontSize: 12 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 24 },
});