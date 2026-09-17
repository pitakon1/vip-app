/**
 * 客户管理（CRM）
 * 原型：admin-mobile-crm.html
 * 区块：搜索 → 阶段筛选（带计数）→ 统计行 → 客户列表
 * 数据源：/leads（真实客户线索 + 各阶段计数）、/employees/directory
 * 说明：与管理员端一致支持填写/修改客户阶段（leadsApi.update），不对员工开放新建/删除
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import colors from '../../theme/colors';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import api from '../../lib/api';
import { chatApi, leadsApi } from '../../services/api';

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

const STAGES: { key: string; label: string; color: string; rgb: string }[] = [
  { key: 'inquiring', label: '咨询中', color: colors.info, rgb: colors.infoRgb },
  { key: 'viewing_scheduled', label: '看房中', color: colors.primary, rgb: colors.primaryRgb },
  { key: 'negotiating', label: '谈判中', color: colors.warning, rgb: colors.warningRgb },
  { key: 'pending_contract', label: '待签约', color: colors.info, rgb: colors.infoRgb },
  { key: 'closed', label: '已成交', color: colors.success, rgb: colors.successRgb },
];

const stageMeta = (key?: string | null) =>
  STAGES.find((s) => s.key === key) ?? {
    key: 'inquiring',
    label: key || '未知',
    color: colors.ink2,
    rgb: colors.primaryRgb,
  };

const symOf = (c?: string | null) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

export default function CRMScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stageTotals, setStageTotals] = useState<Record<string, number>>({});
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [monthNew, setMonthNew] = useState<number | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [stage, setStage] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 编辑线索弹窗（对齐管理员端：可填写姓名/电话/来源/意向项目/阶段/备注）
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
  const navigation = useNavigation<any>();

  // 联系客户：直接拨打
  const callCustomer = (l: Lead) => {
    const phone = (l.phone || '').trim();
    if (!phone) {
      Alert.alert('联系客户', '该客户未留电话');
      return;
    }
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => {
      Alert.alert('联系客户', '无法拨打电话');
    });
  };

  // 联系客户：App 内发消息（按手机号解析客户账号并创建/进入会话）
  const chatCustomer = async (l: Lead) => {
    const phone = (l.phone || '').trim();
    if (!phone) {
      Alert.alert('联系客户', '该客户未留电话，无法发起会话');
      return;
    }
    try {
      const res = await chatApi.createConversation({
        title: l.name?.trim() || '客户咨询',
        participant_phones: [phone],
      });
      const conv = res.data?.data ?? res.data;
      navigation.navigate('ChatDetail', {
        conversationId: conv?.id,
        title: conv?.title ?? l.name ?? '会话',
      });
    } catch (e: any) {
      Alert.alert(
        '无法发消息',
        e?.response?.data?.detail ||
          e?.response?.data?.message ||
          '该客户尚未注册账号，请先通过电话联系',
      );
    }
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
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.name.trim()) {
      Alert.alert('编辑线索', '请填写客户姓名');
      return;
    }
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
      }
      Alert.alert('编辑线索', '保存成功');
      setFormOpen(false);
      load();
    } catch (e: any) {
      Alert.alert('编辑线索', e?.response?.data?.detail || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
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

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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

  const renderLead = (l: Lead) => {
    const meta = stageMeta(l.stage);
    const budget =
      l.budget_max || l.budget_min
        ? `预算 ${symOf(l.budget_currency)}${Number(l.budget_max || l.budget_min || 0).toLocaleString()}`
        : null;
    const tags = [
      budget,
      l.interested_projects?.length ? `意向项目 ${l.interested_projects.length}` : null,
      l.recommended_projects?.length ? `推荐房源 ${l.recommended_projects.length}` : null,
      l.source ? `来源 ${l.source}` : null,
    ].filter(Boolean) as string[];
    const contact = l.phone || l.line_id || l.wechat_id || l.email || '未留联系方式';
    const owner = l.assigned_to ? nameMap[l.assigned_to] : null;
    const lastFollow = l.updated_at || l.created_at;

    return (
      <View key={l.id} style={styles.leadCard}>
        <View style={styles.leadTop}>
          <View style={[styles.avatar, { backgroundColor: colors.alpha(meta.rgb, 0.12) }]}>
            <Text style={[styles.avatarText, { color: meta.color }]}>
              {(l.name || '?').charAt(0)}
            </Text>
          </View>
          <View style={styles.leadInfo}>
            <View style={styles.leadHead}>
              <Text style={styles.leadName} numberOfLines={1}>
                {l.name || '未命名客户'}
              </Text>
              <View style={[styles.stageBadge, { backgroundColor: colors.alpha(meta.rgb, 0.12) }]}>
                <Text style={[styles.stageBadgeText, { color: meta.color }]}>{meta.label}</Text>
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
            {tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.followRow}>
          <Ionicons name="time-outline" size={12} color={colors.ink3} />
          <Text style={styles.followText}>
            {lastFollow ? `最后跟进: ${dayjs(lastFollow).format('MM-DD')}` : '暂无跟进记录'}
            {owner ? ` · 负责人 ${owner}` : ''}
          </Text>
        </View>

        <View style={styles.leadActions}>
          <TouchableOpacity style={styles.leadActionBtn} activeOpacity={0.7} onPress={() => callCustomer(l)}>
            <Ionicons name="call-outline" size={14} color={colors.primary} />
            <Text style={[styles.leadActionText, { color: colors.primary }]}>电话</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.leadActionBtn} activeOpacity={0.7} onPress={() => chatCustomer(l)}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
            <Text style={[styles.leadActionText, { color: colors.primary }]}>发消息</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.leadActionBtn} activeOpacity={0.7} onPress={() => openEdit(l)}>
            <Ionicons name="create-outline" size={14} color={colors.primary} />
            <Text style={[styles.leadActionText, { color: colors.primary }]}>编辑状态</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label="正在加载客户数据…" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
      {/* 搜索 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索客户姓名/电话"
          placeholderTextColor={colors.ink3}
        />
        {keyword ? (
          <TouchableOpacity onPress={() => setKeyword('')} activeOpacity={0.7}>
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
            全部 <Text style={styles.chipCount}>{totalCustomers}</Text>
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
              {s.label} <Text style={styles.chipCount}>{stageTotals[s.key] ?? 0}</Text>
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 统计行 */}
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>总客户</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{totalCustomers}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>意向</Text>
          <Text style={[styles.statValue, { color: colors.info }]}>
            {stageTotals.inquiring ?? 0}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>已签约</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {stageTotals.closed ?? 0}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>本月新增</Text>
          <Text style={[styles.statValue, { color: colors.warning }]}>{monthNew ?? '—'}</Text>
        </View>
      </View>

      {/* 客户列表 */}
      <Text style={styles.sectionTitle}>客户列表</Text>
      {visibleLeads.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={keyword ? '没有找到客户' : '暂无客户线索'}
          sub={keyword ? '换个姓名或电话试试' : '分配给你的客户线索会展示在这里'}
        />
      ) : (
        <View style={styles.list}>{visibleLeads.map((l) => renderLead(l))}</View>
      )}
      </ScrollView>

      {/* 编辑客户状态弹窗（对齐管理员端表单） */}
      <Modal visible={formOpen} transparent animationType="fade" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalMask}>
          <ScrollView contentContainerStyle={styles.modalCardWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>编辑客户状态</Text>

              <Text style={styles.fieldLabel}>姓名 *</Text>
              <TextInput style={styles.fieldInput} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholderTextColor={colors.ink3} />

              <Text style={styles.fieldLabel}>电话</Text>
              <TextInput style={styles.fieldInput} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholderTextColor={colors.ink3} />

              <Text style={styles.fieldLabel}>来源</Text>
              <TextInput style={styles.fieldInput} value={form.source} onChangeText={(v) => setForm((f) => ({ ...f, source: v }))} placeholderTextColor={colors.ink3} />

              <Text style={styles.fieldLabel}>意向房产</Text>
              <TextInput style={styles.fieldInput} value={form.property} onChangeText={(v) => setForm((f) => ({ ...f, property: v }))} placeholderTextColor={colors.ink3} />

              <Text style={styles.fieldLabel}>客户状态</Text>
              <View style={styles.chipWrapper}>
                {STAGES.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chipInline, form.stage === s.key && styles.chipInlineActive]}
                    onPress={() => setForm((f) => ({ ...f, stage: s.key }))}
                  >
                    <Text style={[styles.chipInlineText, form.stage === s.key && styles.chipInlineTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>备注</Text>
              <TextInput style={[styles.fieldInput, styles.multilineInput]} value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline placeholderTextColor={colors.ink3} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setFormOpen(false)}>
                  <Text style={styles.modalCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} activeOpacity={0.7} disabled={saving} onPress={submitForm}>
                  <Text style={styles.modalOkText}>{saving ? '...' : '保存'}</Text>
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
  list: { paddingHorizontal: colors.spacing.md, gap: colors.spacing.md },

  leadCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: colors.spacing.lg,
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

  /* ===== 编辑操作行 ===== */
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

  /* ===== 编辑弹窗 ===== */
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center',
    padding: 28,
  },
  modalCardWrap: { justifyContent: 'center' },
  modalCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  fieldLabel: { fontSize: 12, color: colors.ink3, fontWeight: '600', marginTop: 12, marginBottom: 6 },
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
});