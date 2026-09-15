import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert, Modal, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';

interface Account {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  groups: string[];
  employee?: { employee_code?: string; department?: string; position?: string };
}

const ROLE_LABEL: Record<string, string> = { admin: '管理员', agent: '经纪人', employee: '员工', owner: '业主', tenant: '租客' };
const ROLE_COLOR: Record<string, string> = { admin: colors.error, agent: colors.primary, employee: '#0ea5e9', owner: colors.warning, tenant: colors.success };

export default function AdminUsersScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<Account | null>(null);
  const [newPwd, setNewPwd] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res: any = await api.get('/admin/users', { params: { page_size: 100 } });
      const d = res?.data ?? {};
      setAccounts(d.items ?? []);
      setTotal(d.total ?? 0);
    } catch (e: any) {
      Alert.alert('加载失败', e?.response?.data?.detail || '无法获取账号');
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

  const toggleActive = async (acc: Account) => {
    try {
      await api.post(`/admin/users/${acc.id}/${acc.is_active ? 'deactivate' : 'activate'}`);
      Alert.alert('成功', acc.is_active ? '账号已停用' : '账号已启用');
      fetchData();
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '操作失败');
    }
  };

  const doResetPwd = async () => {
    if (!newPwd || newPwd.length < 6) {
      Alert.alert('提示', '新密码至少 6 位');
      return;
    }
    try {
      await api.post(`/admin/users/${pwdTarget!.id}/reset-password`, { new_password: newPwd });
      Alert.alert('成功', '密码已重置');
      setPwdTarget(null);
      setNewPwd('');
    } catch (e: any) {
      Alert.alert('失败', e?.response?.data?.detail || '重置失败');
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
      <View style={styles.head}>
        <Text style={styles.title}>账号管理</Text>
        <Text style={styles.subtitle}>共 {total} 个账号 · 完整管理请在 Web 后台</Text>
      </View>

      {accounts.length === 0 ? (
        <EmptyState icon="people-outline" title="暂无账号" sub="下拉刷新重试" />
      ) : (
        accounts.map((acc) => (
          <View key={acc.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.avatar, { backgroundColor: ROLE_COLOR[acc.role] || colors.ink3 }]}>
                <Text style={styles.avatarText}>{(acc.full_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.name}>{acc.full_name}</Text>
                <Text style={styles.email}>{acc.email}</Text>
                <View style={styles.metaRow}>
                  <View style={[styles.roleTag, { backgroundColor: `${ROLE_COLOR[acc.role] || colors.ink3}1A` }]}>
                    <Text style={[styles.roleText, { color: ROLE_COLOR[acc.role] || colors.ink3 }]}>
                      {ROLE_LABEL[acc.role] || acc.role}
                    </Text>
                  </View>
                  {acc.employee?.department ? <Text style={styles.dept}>{acc.employee.department}</Text> : null}
                  {acc.groups?.length ? <Text style={styles.dept}>{acc.groups.join(' / ')}</Text> : null}
                </View>
              </View>
              <TouchableOpacity style={styles.switchBtn} activeOpacity={0.7} onPress={() => toggleActive(acc)}>
                <View style={[styles.dot, { backgroundColor: acc.is_active ? colors.success : colors.ink3 }]} />
                <Text style={[styles.switchText, { color: acc.is_active ? colors.success : colors.ink3 }]}>
                  {acc.is_active ? '启用' : '停用'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.resetLink} activeOpacity={0.7} onPress={() => { setPwdTarget(acc); setNewPwd(''); }}>
              <Ionicons name="key-outline" size={14} color={colors.primary} />
              <Text style={styles.resetText}>重置密码</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Modal visible={!!pwdTarget} transparent animationType="fade" onRequestClose={() => setPwdTarget(null)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>重置密码 · {pwdTarget?.full_name}</Text>
            <TextInput
              style={styles.modalInput}
              value={newPwd}
              onChangeText={setNewPwd}
              placeholder="输入新密码（至少 6 位）"
              placeholderTextColor={colors.ink3}
              secureTextEntry
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setPwdTarget(null)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} activeOpacity={0.7} onPress={doResetPwd}>
                <Text style={styles.modalOkText}>确认重置</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...colors.shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  email: { fontSize: 12, color: colors.ink3, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  roleTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  roleText: { fontSize: 11, fontWeight: '600' },
  dept: { fontSize: 11, color: colors.ink3 },
  switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  switchText: { fontSize: 12, fontWeight: '600' },
  resetLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  resetText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  modalMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 14 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  modalCancel: { backgroundColor: colors.surface2 },
  modalCancelText: { color: colors.ink2, fontWeight: '600' },
  modalOk: { backgroundColor: colors.primary },
  modalOkText: { color: '#fff', fontWeight: '600' },
});