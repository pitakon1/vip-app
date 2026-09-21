/**
 * 客户管理（CRM）· 管理端专属
 * 原型：admin-mobile-crm.html
 * 区块：搜索 → 阶段筛选（带计数）→ 统计行 → 客户列表
 * 数据源：/leads（真实客户线索 + 各阶段计数）、/employees/directory
 * 说明：与员工端 CRM 相互独立（员工端见 screens/employee/CRMScreen.tsx），
 *       底部导航「客户」Tab 与管理端首页快捷入口均指向本页。
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import colors from '../../theme/colors';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import api from '../../lib/api';
import { notify, notifyError } from '../../utils/feedback';
import { leadsApi } from '../../services/api';
import { useI18n } from '../../i18n';
import { useRefreshList } from '../../hooks/useRefreshList';

interface Lead {
  id: string;
  name?: string | null;
  phone?: string | null;
  line_id?: string | null;
  wechat_id?: string | null;
  email?: string | null;
  nationality?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_currency?: string | null;
  interested_projects?: unknown[] | null;
  recommended_projects?: unknown[] | null;
  stage?: string | null;
  assigned_to?: string | null;
  source?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const STAGES: { key: string; labelKey: string; color: string; rgb: string }[] = [
  { key: 'inquiring', labelKey: 'crm.stage.inquiring', color: colors.info, rgb: colors.infoRgb },
  { key: 'viewing_scheduled', labelKey: 'crm.stage.viewing', color: colors.primary, rgb: colors.primaryRgb },
  { key: 'negotiating', labelKey: 'crm.stage.negotiating', color: colors.warning, rgb: colors.warningRgb },
  { key: 'pending_contract', labelKey: 'crm.stage.pending', color: colors.info, rgb: colors.infoRgb },
  { key: 'closed', labelKey: 'crm.stage.closed', color: colors.success, rgb: colors.successRgb },
];

const symOf = (c?: string | null) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

export default function AdminCRMScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stageTotals, setStageTotals] = useState<Record<string, number>>({});
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [monthNew, setMonthNew] = useState<number | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [stage, setStage] = useState('');
  const [keyword, setKeyword] = useState('');

  // 线索表单弹窗（id 存在为编辑，否则新建）
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    source: '',
    property: '',
    stage: STAGES[0].key,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', phone: '', source: '', property: '', stage: STAGES[0].key, notes: '' });
    setNameError('');
    setFormOpen(true);
  };
  const openEdit = (l: Lead) => {
    setEditingId(l.id);
    setForm({
      name: l.name || '',
      phone: l.phone || '',
      source: l.source || '',
      property: String(l.interested_projects?.[0] ?? ''),
      stage: l.stage || STAGES[0].key,
      notes: l.notes || '',
    });
    setNameError('');
    setFormOpen(true);
  };
  const submitForm = async () => {
    if (!form.name.trim()) {
      setNameError(t('crm.nameRequired'));
      return;
    }
    setNameError('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        source: form.source.trim() || null,
        stage: form.stage,
        notes: form.notes.trim() || null,
      };
      const prop = form.property.trim();
      payload.interested_projects = prop ? [prop] : [];
      if (editingId) {
        await leadsApi.update(editingId, payload);
      } else {
        await leadsApi.create(payload);
      }
      notify(t('crm.new'), editingId ? t('crm.saved') : t('crm.created'));
      setFormOpen(false);
      load();
    } catch (e: any) {
      notifyError(t('crm.new'), e);
    } finally {
      setSaving(false);
    }
  };
  const confirmDelete = (l: Lead) => {
    Alert.alert(t('crm.delete'), `${t('crm.deleteConfirm')}「${l.name || t('crm.unnamed')}」？`, [
      { text: t('crm.cancel'), style: 'cancel' },
      {
        text: t('crm.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await leadsApi.delete(l.id);
            notify(t('crm.delete'), t('crm.deleted'));
            load();
          } catch (e: any) {
            notifyError(t('crm.delete'), e);
          }
        },
      },
    ]);
  };

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      leadsApi.list({ page: 1, page_size: 100 }),
      leadsApi.list({ page: 1, page_size: 50, ...(stage ? { stage } : {}) }),
      ...STAGES.map((s) => leadsApi.list({ stage: s.key, page: 1, page_size: 1 })),
      api.get('/employees/directory'),
    ]);

    const itemsOf = (res: PromiseSettledResult<any>): any[] => {
      if (res.status !== 'fulfilled') return [];
      const d = res.value?.data;
      return Array.isArray(d) ? d : (d?.items ?? []);
    };

    // 全量首屏（按创建时间倒序）用于「本月新增」统计
    const allLeads = itemsOf(results[0]) as Lead[];
    setMonthNew(
      allLeads.filter((l) => l.created_at && dayjs(l.created_at).isSame(dayjs(), 'month')).length,
    );

    setLeads(itemsOf(results[1]) as Lead[]);

    const totals: Record<string, number> = {};
    STAGES.forEach((s, idx) => {
      const res = results[2 + idx];
      if (res.status === 'fulfilled') {
        const d = res.value?.data as { total?: number } | undefined;
        totals[s.key] = typeof d?.total === 'number' ? d.total : 0;
      } else {
        totals[s.key] = 0;
      }
    });
    setStageTotals(totals);
    setTotalCustomers(Object.values(totals).reduce((a, b) => a + b, 0));

    if (results[7].status === 'fulfilled') {
      const dir = results[7].value.data as { items?: { id: string; full_name?: string }[] };
      setNameMap(
        (dir?.items ?? []).reduce<Record<string, string>>((acc, e) => {
          if (e.full_name) acc[e.id] = e.full_name;
          return acc;
        }, {}),
      );
    }
  }, [stage]);

  const { loading, refreshControl } = useRefreshList(load);

  const visibleLeads = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return leads;
    return leads.filter((l) =>
      [l.name, l.phone, l.email, l.line_id, l.wechat_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(kw),
    );
  }, [leads, keyword]);

  const renderItem = useCallback(
    ({ item: l }: { item: Lead }) => {
      const meta = STAGES.find((s) => s.key === l.stage);
      const metaColor = meta?.color ?? colors.ink2;
      const metaRgb = meta?.rgb ?? colors.primaryRgb;
      const metaLabel = meta ? t(meta.labelKey) : l.stage || t('crm.unknownStage');
      const budget =
        l.budget_max || l.budget_min
          ? `${t('crm.budget')} ${symOf(l.budget_currency)}${Number(l.budget_max || l.budget_min || 0).toLocaleString()}`
          : null;
      const tags = [
        budget,
        l.interested_projects?.length ? `${t('crm.interestProject')} ${l.interested_projects.length}` : null,
        l.recommended_projects?.length ? `${t('crm.recommend')} ${l.recommended_projects.length}` : null,
        l.source ? `${t('crm.source')} ${l.source}` : null,
      ].filter(Boolean) as string[];
      const contact = l.phone || l.line_id || l.wechat_id || l.email || t('crm.noContact');
      const owner = l.assigned_to ? nameMap[l.assigned_to] : null;
      const lastFollow = l.updated_at || l.created_at;

      return (
        <View style={styles.leadCard}>
          <View style={styles.leadTop}>
            <View style={[styles.avatar, { backgroundColor: colors.alpha(metaRgb, 0.12) }]}>
              <Text style={[styles.avatarText, { color: metaColor }]}>
                {(l.name || '?').charAt(0)}
              </Text>
            </View>
            <View style={styles.leadInfo}>
              <View style={styles.leadHead}>
                <Text style={styles.leadName} numberOfLines={1}>
                  {l.name || t('crm.unnamed')}
                </Text>
                <View style={[styles.stageBadge, { backgroundColor: colors.alpha(metaRgb, 0.12) }]}>
                  <Text style={[styles.stageBadgeText, { color: metaColor }]}>{metaLabel}</Text>
                </View>
              </View>
              <View style={styles.contactRow}>
                <Ionicons name="call-outline" size={12} color={colors.ink3} />
                <Text style={styles.contactText} numberOfLines={1}>
                  {contact}
                </Text>
              </View>
            </View>
          </View>

          {tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.followRow}>
            <Ionicons name="time-outline" size={12} color={colors.ink3} />
            <Text style={styles.followText}>
              {lastFollow ? `${t('crm.lastFollow')}: ${dayjs(lastFollow).format('MM-DD')}` : t('crm.noFollow')}
              {owner ? ` · ${t('crm.owner')} ${owner}` : ''}
            </Text>
          </View>

          <View style={styles.leadActions}>
            <TouchableOpacity style={styles.leadActionBtn} activeOpacity={0.7} onPress={() => openEdit(l)}>
              <Ionicons name="create-outline" size={14} color={colors.primary} />
              <Text style={[styles.leadActionText, { color: colors.primary }]}>{t('crm.actionEdit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.leadActionBtn} activeOpacity={0.7} onPress={() => confirmDelete(l)}>
              <Ionicons name="trash-outline" size={14} color={colors.error} />
              <Text style={[styles.leadActionText, { color: colors.error }]}>{t('crm.actionDelete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [nameMap, t],
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label={t('crm.loading')} />
      </View>
    );
  }

  const listHeader = (
    <>
      {/* 搜索 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder={t('crm.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
        />
        {keyword ? (
          <TouchableOpacity
            onPress={() => setKeyword('')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('crm.clearSearch')}
          >
            <Ionicons name="close-circle" size={16} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 阶段筛选（带计数） */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setStage('')}
          style={[styles.chip, stage === '' && styles.chipActive]}
        >
          <Text style={[styles.chipText, stage === '' && styles.chipTextActive]}>
            {t('crm.all')} <Text style={styles.chipCount}>{totalCustomers}</Text>
          </Text>
        </TouchableOpacity>
        {STAGES.map((s) => (
          <TouchableOpacity
            key={s.key}
            activeOpacity={0.7}
            onPress={() => setStage(s.key)}
            style={[styles.chip, stage === s.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, stage === s.key && styles.chipTextActive]}>
              {t(s.labelKey)} <Text style={styles.chipCount}>{stageTotals[s.key] ?? 0}</Text>
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 统计行 */}
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>{t('crm.totalCustomers')}</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{totalCustomers}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>{t('crm.intent')}</Text>
          <Text style={[styles.statValue, { color: colors.info }]}>
            {stageTotals.inquiring ?? 0}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>{t('crm.signed')}</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {stageTotals.closed ?? 0}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>{t('crm.monthNew')}</Text>
          <Text style={[styles.statValue, { color: colors.warning }]}>{monthNew ?? '—'}</Text>
        </View>
      </View>

      {/* 客户列表 */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('crm.list')}</Text>
        <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={openNew}>
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={styles.addBtnText}>{t('crm.new')}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const listEmpty = (
    <EmptyState
      icon="people-outline"
      title={keyword ? t('crm.noFound') : t('crm.noLead')}
      sub={keyword ? t('crm.noFoundSub') : t('crm.noLeadSub')}
    />
  );

  const stageOptions = STAGES.map((s) => ({ key: s.key, label: t(s.labelKey) }));

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
        data={visibleLeads}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
      />

      {/* 新建 / 编辑线索弹窗 */}
      <Modal visible={formOpen} transparent animationType="fade" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalMask}>
          <ScrollView contentContainerStyle={styles.modalCardWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editingId ? t('crm.edit') : t('crm.new')}</Text>

              <Text style={styles.fieldLabel}>{t('crm.formName')} *</Text>
              <TextInput
                style={[styles.fieldInput, nameError ? styles.fieldInputError : null]}
                value={form.name}
                onChangeText={(v) => {
                  setForm((f) => ({ ...f, name: v }));
                  if (nameError) setNameError('');
                }}
                placeholderTextColor={colors.ink3}
              />
              {!!nameError && <Text style={styles.fieldErrorText}>{nameError}</Text>}

              <Text style={styles.fieldLabel}>{t('crm.formPhone')}</Text>
              <TextInput style={styles.fieldInput} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholderTextColor={colors.ink3} />

              <Text style={styles.fieldLabel}>{t('crm.formSource')}</Text>
              <TextInput style={styles.fieldInput} value={form.source} onChangeText={(v) => setForm((f) => ({ ...f, source: v }))} placeholderTextColor={colors.ink3} />

              <Text style={styles.fieldLabel}>{t('crm.formProperty')}</Text>
              <TextInput style={styles.fieldInput} value={form.property} onChangeText={(v) => setForm((f) => ({ ...f, property: v }))} placeholderTextColor={colors.ink3} />

              <Text style={styles.fieldLabel}>{t('crm.formStage')}</Text>
              <View style={styles.chipWrapper}>
                {stageOptions.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chipInline, form.stage === s.key && styles.chipInlineActive]}
                    onPress={() => setForm((f) => ({ ...f, stage: s.key }))}
                  >
                    <Text style={[styles.chipInlineText, form.stage === s.key && styles.chipInlineTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('crm.formNotes')}</Text>
              <TextInput style={[styles.fieldInput, styles.multilineInput]} value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline placeholderTextColor={colors.ink3} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setFormOpen(false)}>
                  <Text style={styles.modalCancelText}>{t('crm.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} activeOpacity={0.7} disabled={saving} onPress={submitForm}>
                  <Text style={styles.modalOkText}>{saving ? '...' : t('crm.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: colors.spacing.md,
    paddingVertical: 9,
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.md,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, padding: 0 },

  chipScroll: { marginTop: colors.spacing.md },
  chipRow: { gap: colors.spacing.sm, paddingHorizontal: colors.spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  chipCount: { fontSize: colors.fontSize.xs },

  statRow: {
    flexDirection: 'row',
    gap: colors.spacing.sm,
    marginHorizontal: colors.spacing.md,
    marginTop: colors.spacing.lg,
  },
  statCell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingVertical: colors.spacing.md,
    paddingHorizontal: colors.spacing.sm,
  },
  statLabel: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  statValue: {
    fontSize: colors.fontSize['2xl'],
    fontWeight: '700',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  sectionTitle: {
    fontSize: colors.fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.xl,
    marginBottom: colors.spacing.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: colors.spacing.lg,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: colors.radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { fontSize: 12, color: colors.primaryForeground, fontWeight: '600' },

  leadActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: colors.spacing.md,
    paddingTop: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  leadActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leadActionText: { fontSize: 12, fontWeight: '600' },

  /* ===== 表单弹窗 ===== */
  modalMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 28 },
  modalCardWrap: { justifyContent: 'center' },
  modalCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  fieldLabel: { fontSize: 12, color: colors.ink3, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  fieldInputError: { borderColor: colors.error, borderWidth: 1 },
  fieldErrorText: { fontSize: 11, color: colors.error, marginTop: 5 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  multilineInput: { minHeight: 72, textAlignVertical: 'top' },
  chipWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipInline: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipInlineActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipInlineText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  chipInlineTextActive: { color: '#fff', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: colors.radius.lg },
  modalCancel: { backgroundColor: colors.surface2 },
  modalCancelText: { color: colors.ink2, fontWeight: '600' },
  modalOk: { backgroundColor: colors.primary },
  modalOkText: { color: colors.primaryForeground, fontWeight: '600' },

  leadCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: colors.spacing.lg,
    marginHorizontal: colors.spacing.md,
    marginBottom: colors.spacing.md,
    ...colors.shadow.card,
  },
  leadTop: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: colors.spacing.md,
  },
  avatarText: { fontSize: 17, fontWeight: '600' },
  leadInfo: { flex: 1, minWidth: 0 },
  leadHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: colors.spacing.sm,
  },
  leadName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  stageBadge: { borderRadius: colors.radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  stageBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  contactText: { fontSize: 13, color: colors.ink3, fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: colors.spacing.md },
  tag: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { fontSize: colors.fontSize.xs, color: colors.ink2, fontWeight: '500' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: colors.spacing.md },
  followText: { fontSize: colors.fontSize.xs, color: colors.ink3 },
});