﻿/**
 * 客户管理（CRM）· 管理端专属
 * 原型：admin-mobile-crm.html
 * 区块：搜索 → 阶段筛选（带计数）→ 统计行 → 客户列表
 * 数据源：/leads（真实客户线索 + 各阶段计数）、/employees/directory
 * 说明：与员工端 CRM 相互独立（员工端见 screens/employee/CRMScreen.tsx），
 *       底部导航「客户」Tab 与管理端首页快捷入口均指向本页。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  Linking,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import colors from '../../theme/colors';
import { bottomSheetStyles } from '@/theme/bottomSheetStyles';
import EmptyState from '../../components/EmptyState';
import ListState from '../../components/ListState';
import { confirm } from '../../components/ConfirmDialog';
import { notify, notifyError } from '../../utils/feedback';
import { chatApi, leadsApi } from '../../services/api';
import { useI18n } from '../../i18n';
import { useRefreshList } from '../../hooks/useRefreshList';
import { useCrmLeads, type Lead } from '@/hooks/useCrmLeads';
import { currencySymbol } from '@/lib/currency';

const STAGES: { key: string; labelKey: string; color: string; rgb: string }[] = [
  { key: 'inquiring', labelKey: 'crm.stage.inquiring', color: colors.info, rgb: colors.infoRgb },
  { key: 'viewing_scheduled', labelKey: 'crm.stage.viewing', color: colors.primary, rgb: colors.primaryRgb },
  { key: 'negotiating', labelKey: 'crm.stage.negotiating', color: colors.warning, rgb: colors.warningRgb },
  { key: 'pending_contract', labelKey: 'crm.stage.pending', color: colors.info, rgb: colors.infoRgb },
  { key: 'closed', labelKey: 'crm.stage.closed', color: colors.success, rgb: colors.successRgb },
];

export default function AdminCRMScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState('');
  const [keyword, setKeyword] = useState('');
  // 关键词防抖后再交给服务端搜索：避免逐字请求，也避免旧词结果覆盖新词
  const [query, setQuery] = useState('');
  const {
    leads,
    stageTotals,
    totalCustomers,
    monthNew,
    nameMap,
    hasMore,
    loadingMore,
    load,
    loadMore,
    loadError,
  } = useCrmLeads(stage, { keyword: query });

  useEffect(() => {
    const handle = setTimeout(() => setQuery(keyword.trim()), 400);
    return () => clearTimeout(handle);
  }, [keyword]);

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
  const confirmDelete = async (l: Lead) => {
    const ok = await confirm({
      title: t('crm.delete'),
      message: `${t('crm.deleteConfirm')}「${l.name || t('crm.unnamed')}」？`,
      confirmLabel: t('crm.delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await leadsApi.delete(l.id);
      notify(t('crm.delete'), t('crm.deleted'));
      load();
    } catch (e: any) {
      notifyError(t('crm.delete'), e);
    }
  };

  const { loading, refreshControl } = useRefreshList(load);

  const navigation = useNavigation<any>();

  // 联系客户：直接拨打
  const callCustomer = (l: Lead) => {
    const phone = (l.phone || '').trim();
    if (!phone) {
      notify(t('crm.contactCustomer'), t('crm.noPhone'));
      return;
    }
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => {
      notify(t('crm.contactCustomer'), t('crm.callFail'));
    });
  };

  // 联系客户：App 内发消息（按手机号/邮箱解析客户账号并创建/进入会话）
  const chatCustomer = async (l: Lead) => {
    const phone = (l.phone || '').trim();
    const email = (l.email || '').trim();
    if (!phone && !email) {
      notify(t('crm.contactCustomer'), t('crm.noContactInfo'));
      return;
    }
    try {
      const res = await chatApi.createConversation({
        title: l.name?.trim() || t('crm.leadTitle'),
        ...(phone ? { participant_phones: [phone] } : {}),
        ...(email ? { participant_emails: [email] } : {}),
      });
      const conv = res.data?.data ?? res.data;
      navigation.navigate('ChatDetail', {
        conversationId: conv?.id,
        title: conv?.title ?? l.name ?? t('crm.conversation'),
      });
    } catch (e: any) {
      notifyError(t('crm.cannotSend'), e);
    }
  };

  const renderItem = useCallback(
    ({ item: l }: { item: Lead }) => {
      const meta = STAGES.find((s) => s.key === l.stage);
      const metaColor = meta?.color ?? colors.ink2;
      const metaRgb = meta?.rgb ?? colors.primaryRgb;
      const metaLabel = meta ? t(meta.labelKey) : l.stage || t('crm.unknownStage');
      const budget =
        l.budget_max || l.budget_min
          ? `${t('crm.budget')} ${currencySymbol(l.budget_currency)}${Number(l.budget_max || l.budget_min || 0).toLocaleString()}`
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
                  <Text style={[styles.stageBadgeText, { color: metaColor }]} numberOfLines={1}>{metaLabel}</Text>
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
            <Text style={styles.followText} numberOfLines={1}>
              {lastFollow ? `${t('crm.lastFollow')}: ${dayjs(lastFollow).format('MM-DD')}` : t('crm.noFollow')}
              {owner ? ` · ${t('crm.owner')} ${owner}` : ''}
            </Text>
          </View>

          <View style={styles.leadActions}>
            <TouchableOpacity style={styles.leadActionBtn} activeOpacity={0.7} onPress={() => callCustomer(l)}>
              <Ionicons name="call-outline" size={14} color={colors.primary} />
              <Text style={[styles.leadActionText, { color: colors.primary }]}>{t('crm.actionCall')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.leadActionBtn} activeOpacity={0.7} onPress={() => chatCustomer(l)}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
              <Text style={[styles.leadActionText, { color: colors.primary }]}>{t('crm.actionMessage')}</Text>
            </TouchableOpacity>
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
    [nameMap, t, callCustomer, chatCustomer],
  );

  if (loading) {
    return <ListState loading loadingLabel={t('crm.loading')} />;
  }

  if (loadError && leads.length === 0) {
    return <ListState error={t('crm.loadFailed')} retryLabel={t('common.retry')} onRetry={load} />;
  }

  const listHeader = (
    <>
      {loadError && leads.length > 0 ? (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            padding: 10,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.alpha(colors.errorRgb, 0.08),
          }}
        >
          <Text style={{ flex: 1, fontSize: 12, color: colors.error }}>{t('crm.loadFailed')}</Text>
          <TouchableOpacity onPress={load} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, color: colors.primary }}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
        data={leads}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasMore && !loadingMore) loadMore();
        }}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={
          leads.length > 0 ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: colors.ink3 }}>
                {loadingMore ? t('crm.loading') : hasMore ? t('pub.loadMore') : t('pub.noMore')}
              </Text>
            </View>
          ) : null
        }
      />

      {/* 新建 / 编辑线索弹层 */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={bottomSheetStyles.bsMask}>
          <View style={bottomSheetStyles.bsSheet}>
            <View style={bottomSheetStyles.bsGrabber} />
            <ScrollView contentContainerStyle={bottomSheetStyles.bsContent}>
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
            </ScrollView>
            <View style={bottomSheetStyles.bsActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setFormOpen(false)}>
                <Text style={styles.modalCancelText}>{t('crm.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} activeOpacity={0.7} disabled={saving} onPress={submitForm}>
                <Text style={styles.modalOkText}>{saving ? '...' : t('crm.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    minHeight: colors.touch.chip,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  fieldErrorText: { fontSize: colors.fontSize.xs, color: colors.error, marginTop: 5, lineHeight: colors.lineHeight.tight},
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
  stageBadge: { flexShrink: 1, borderRadius: colors.radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  stageBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  contactText: { flexShrink: 1, fontSize: 13, color: colors.ink3, fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: colors.spacing.md },
  tag: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { fontSize: colors.fontSize.xs, color: colors.ink2, fontWeight: '500' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: colors.spacing.md },
  followText: { flexShrink: 1, fontSize: colors.fontSize.xs, color: colors.ink3 },
});