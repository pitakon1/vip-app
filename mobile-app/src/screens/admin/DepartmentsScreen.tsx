/**
 * 部门管理（管理端「我的 → 系统管理 → 部门管理」全屏子页）。
 *
 * 对齐 Web 端 `/system/departments`：维护组织架构部门树（名称/编码/上级/排序/启停），
 * 员工归属在 Web 端完成，App 端聚焦部门树的增删改与查看（成员数为后端统计）。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { notify, notifyError } from '@/utils/feedback';
import { departmentsAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';

interface DeptNode {
  id: string;
  name: string;
  code: string;
  parent_id?: string | null;
  leader_name?: string | null;
  sort?: number;
  is_active?: boolean;
  member_count?: number;
  children?: DeptNode[];
}

interface FlatNode extends DeptNode {
  depth: number;
}

const flatten = (nodes: DeptNode[], depth = 0): FlatNode[] =>
  nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children ?? [], depth + 1)]);

export default function DepartmentsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [tree, setTree] = useState<DeptNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeptNode | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sort, setSort] = useState('0');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await departmentsAdminApi.tree();
      setTree(data?.data ?? data ?? []);
    } catch (e) {
      notifyError(t('dept.loadFailed'), e);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => flatten(tree), [tree]);

  const openCreate = (parent?: DeptNode) => {
    setEditing(null);
    setParentId(parent?.id ?? null);
    setName('');
    setCode('');
    setSort('0');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (row: DeptNode) => {
    setEditing(row);
    setParentId(row.parent_id ?? null);
    setName(row.name);
    setCode(row.code);
    setSort(String(row.sort ?? 0));
    setIsActive(row.is_active ?? true);
    setModalOpen(true);
  };

  const submit = async () => {
    if (!name.trim() || !code.trim()) {
      notify(t('dept.title'), t('dept.requiredName'));
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        code: code.trim(),
        sort: Number(sort) || 0,
      };
      if (editing) {
        payload.is_active = isActive;
        await departmentsAdminApi.update(editing.id, payload);
        notify(t('dept.title'), t('dept.updateOk'));
      } else {
        payload.parent_id = parentId;
        await departmentsAdminApi.create(payload);
        notify(t('dept.title'), t('dept.createOk'));
      }
      setModalOpen(false);
      load();
    } catch (e) {
      notifyError(t('dept.saveFailed'), e);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (row: DeptNode) => {
    Alert.alert(t('dept.delete'), t('dept.deleteConfirm'), [
      { text: t('dept.cancel'), style: 'cancel' },
      {
        text: t('dept.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await departmentsAdminApi.remove(row.id);
            notify(t('dept.title'), t('dept.deleteOk'));
            load();
          } catch (e) {
            notifyError(t('dept.removeFailed'), e);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={() => openCreate()}>
          <Ionicons name="add" size={18} color={colors.primaryForeground} />
          <Text style={styles.addBtnText}>{t('dept.add')}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>{t('dept.empty')}</Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={[styles.card, { marginLeft: row.depth * 14 }]}>
              <View style={styles.rowMain}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{row.name}</Text>
                  <Text style={styles.meta}>
                    {row.code}
                    {row.leader_name ? ` · ${row.leader_name}` : ''}
                  </Text>
                  <View style={styles.tagRow}>
                    <Text style={styles.countTag}>
                      {t('dept.members')}: {row.member_count ?? 0}
                    </Text>
                    <Text style={[styles.stateTag, row.is_active ? styles.stateOn : styles.stateOff]}>
                      {row.is_active ? t('dept.active') : t('dept.inactive')}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => openCreate(row)} hitSlop={8}>
                    <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(row)} hitSlop={8}>
                    <Ionicons name="create-outline" size={19} color={colors.ink2} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(row)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={19} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.mask}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.modalTitle}>{editing ? t('dept.edit') : t('dept.add')}</Text>
            <Text style={styles.label}>{t('dept.formName')}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t('dept.formName')} />
            <Text style={styles.label}>{t('dept.formCode')}</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder={t('dept.formCode')}
              editable={!editing}
              autoCapitalize="characters"
            />
            <Text style={styles.label}>{t('dept.formSort')}</Text>
            <TextInput style={styles.input} value={sort} onChangeText={setSort} keyboardType="number-pad" />
            {editing ? (
              <View style={styles.switchRow}>
                <Text style={styles.label}>{t('dept.formActive')}</Text>
                <Switch value={isActive} onValueChange={setIsActive} />
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalOpen(false)}>
                <Text style={styles.cancelText}>{t('dept.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={submit} disabled={saving}>
                <Text style={styles.saveText}>{saving ? t('dept.saving') : t('dept.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  loading: { marginTop: 40 },
  empty: { marginTop: 32, textAlign: 'center', color: colors.ink3, fontSize: 13 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    marginBottom: 14,
  },
  addBtnText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  card: {
    padding: 14,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 10,
    ...colors.shadow.card,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { marginTop: 2, fontSize: 12, color: colors.ink3 },
  tagRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  countTag: { fontSize: 11, color: colors.ink2 },
  stateTag: { fontSize: 11, fontWeight: '600' },
  stateOn: { color: colors.primary },
  stateOff: { color: colors.ink3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 20,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  label: { fontSize: 12, color: colors.ink2, marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, color: colors.ink2 },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveText: { fontSize: 14, fontWeight: '600', color: colors.primaryForeground },
});
