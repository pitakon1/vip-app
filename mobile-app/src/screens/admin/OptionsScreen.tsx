/**
 * 数据字典（管理端「我的 → 系统管理 → 数据字典」全屏子页）。
 *
 * 对齐 Web 端 `/system/options`：按分组维护通用枚举字典（朝向/装修/配套/房源类型等）。
 * 前端筛选优先取接口字典、缺失时回落硬编码，故这里的启停/新增会直接影响 C 端筛选文案。
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
import { optionsApi } from '@/services/api';
import { useI18n } from '@/i18n';

interface OptionItem {
  id: string;
  type: string;
  value: string;
  label?: string;
  label_i18n?: Record<string, string>;
  sort?: number;
  is_active?: boolean;
  is_system?: boolean;
}

export default function OptionsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [items, setItems] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OptionItem | null>(null);
  const [form, setForm] = useState({
    type: '',
    value: '',
    label: '',
    zh: '',
    en: '',
    th: '',
    sort: '0',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await optionsApi.list({ active_only: false });
      setItems(data?.data ?? data ?? []);
    } catch (e) {
      notifyError(t('dict.loadFailed'), e);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<string, OptionItem[]> = {};
    items.forEach((it) => {
      map[it.type] = map[it.type] ?? [];
      map[it.type].push(it);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const openCreate = (type?: string) => {
    setEditing(null);
    setForm({ type: type ?? '', value: '', label: '', zh: '', en: '', th: '', sort: '0' });
    setModalOpen(true);
  };

  const openEdit = (row: OptionItem) => {
    setEditing(row);
    setForm({
      type: row.type,
      value: row.value,
      label: row.label ?? '',
      zh: row.label_i18n?.zh ?? '',
      en: row.label_i18n?.en ?? '',
      th: row.label_i18n?.th ?? '',
      sort: String(row.sort ?? 0),
    });
    setModalOpen(true);
  };

  const cleanI18n = () => {
    const out: Record<string, string> = {};
    if (form.zh.trim()) out.zh = form.zh.trim();
    if (form.en.trim()) out.en = form.en.trim();
    if (form.th.trim()) out.th = form.th.trim();
    return out;
  };

  const submit = async () => {
    if (!editing && (!form.type.trim() || !form.value.trim())) {
      notify(t('dict.title'), t('dict.requiredType'));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await optionsApi.update(editing.id, {
          label: form.label.trim(),
          label_i18n: cleanI18n(),
          sort: Number(form.sort) || 0,
        });
        notify(t('dict.title'), t('dict.updateOk'));
      } else {
        await optionsApi.create({
          type: form.type.trim(),
          value: form.value.trim(),
          label: form.label.trim(),
          label_i18n: cleanI18n(),
          sort: Number(form.sort) || 0,
          is_active: true,
        });
        notify(t('dict.title'), t('dict.createOk'));
      }
      setModalOpen(false);
      load();
    } catch (e) {
      notifyError(t('dict.saveFailed'), e);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: OptionItem, next: boolean) => {
    setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, is_active: next } : it)));
    try {
      await optionsApi.update(row.id, { is_active: next });
    } catch (e) {
      notifyError(t('dict.saveFailed'), e);
      load();
    }
  };

  const confirmDelete = (row: OptionItem) => {
    Alert.alert(t('dict.delete'), t('dict.deleteConfirm'), [
      { text: t('dict.cancel'), style: 'cancel' },
      {
        text: t('dict.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await optionsApi.remove(row.id);
            notify(t('dict.title'), t('dict.deleteOk'));
            load();
          } catch (e) {
            notifyError(t('dict.removeFailed'), e);
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
          <Text style={styles.addBtnText}>{t('dict.add')}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : grouped.length === 0 ? (
          <Text style={styles.empty}>{t('dict.empty')}</Text>
        ) : (
          grouped.map(([type, list]) => (
            <View key={type} style={styles.group}>
              <Text style={styles.groupTitle}>
                {type} ({list.length})
              </Text>
              {list.map((row) => (
                <View key={row.id} style={styles.card}>
                  <View style={styles.rowMain}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.value}>{row.value}</Text>
                      <Text style={styles.label}>
                        {row.label || row.label_i18n?.zh || '—'}
                      </Text>
                      <Text style={styles.i18n}>
                        {[
                          row.label_i18n?.zh ? `zh:${row.label_i18n.zh}` : '',
                          row.label_i18n?.en ? `en:${row.label_i18n.en}` : '',
                          row.label_i18n?.th ? `th:${row.label_i18n.th}` : '',
                        ]
                          .filter(Boolean)
                          .join('  ')}
                      </Text>
                      {row.is_system ? (
                        <Text style={styles.sysTag}>{t('dict.system')}</Text>
                      ) : null}
                    </View>
                    <View style={styles.actions}>
                      <Switch value={!!row.is_active} onValueChange={(v) => toggleActive(row, v)} />
                      <TouchableOpacity onPress={() => openEdit(row)} hitSlop={8}>
                        <Ionicons name="create-outline" size={19} color={colors.ink2} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => confirmDelete(row)}
                        hitSlop={8}
                        disabled={!!row.is_system}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={19}
                          color={row.is_system ? colors.ink3 : colors.error}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.mask}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <Text style={styles.modalTitle}>{editing ? t('dict.edit') : t('dict.add')}</Text>
            <Text style={styles.formLabel}>{t('dict.formType')}</Text>
            <TextInput
              style={styles.input}
              value={form.type}
              onChangeText={(v) => setForm((f) => ({ ...f, type: v }))}
              editable={!editing}
              placeholder={t('dict.formType')}
            />
            <Text style={styles.formLabel}>{t('dict.formValue')}</Text>
            <TextInput
              style={styles.input}
              value={form.value}
              onChangeText={(v) => setForm((f) => ({ ...f, value: v }))}
              editable={!editing}
              placeholder={t('dict.formValue')}
            />
            <Text style={styles.formLabel}>{t('dict.formLabel')}</Text>
            <TextInput
              style={styles.input}
              value={form.label}
              onChangeText={(v) => setForm((f) => ({ ...f, label: v }))}
            />
            <Text style={styles.formLabel}>zh</Text>
            <TextInput style={styles.input} value={form.zh} onChangeText={(v) => setForm((f) => ({ ...f, zh: v }))} />
            <Text style={styles.formLabel}>en</Text>
            <TextInput style={styles.input} value={form.en} onChangeText={(v) => setForm((f) => ({ ...f, en: v }))} />
            <Text style={styles.formLabel}>th</Text>
            <TextInput style={styles.input} value={form.th} onChangeText={(v) => setForm((f) => ({ ...f, th: v }))} />
            <Text style={styles.formLabel}>{t('dict.formSort')}</Text>
            <TextInput
              style={styles.input}
              value={form.sort}
              onChangeText={(v) => setForm((f) => ({ ...f, sort: v }))}
              keyboardType="number-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalOpen(false)}>
                <Text style={styles.cancelText}>{t('dict.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={submit} disabled={saving}>
                <Text style={styles.saveText}>{saving ? t('dict.saving') : t('dict.save')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  group: { marginBottom: 6 },
  groupTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8, marginTop: 8 },
  card: {
    padding: 12,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 8,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { fontSize: 14, fontWeight: '600', color: colors.ink },
  label: { marginTop: 2, fontSize: 13, color: colors.text },
  i18n: { marginTop: 3, fontSize: 11, color: colors.ink3 },
  sysTag: { marginTop: 4, fontSize: 11, color: colors.warning, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '86%' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 20,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  formLabel: { fontSize: 12, color: colors.ink2, marginTop: 8, marginBottom: 4 },
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
