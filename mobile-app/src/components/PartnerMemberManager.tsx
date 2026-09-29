/**
 * 合作公司成员管理
 * 供「合作公司管理员」使用（role=partner_admin），在 AdminUsersScreen（partner 分支）
 * 与 PartnerHubScreen（成员 Tab）中复用。
 * 数据源：GET /partner/members；创建 POST /partner/members；拉入 POST /partner/members/{id}/pull-in；
 * 移除 DELETE /partner/members/{id}。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { notify, notifyError } from '@/utils/feedback';
import { partnerAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';

interface MemberRow {
  id: string;
  user_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  user_type?: string | null;
  partner_id?: string | null;
  partner_name?: string | null;
  phone?: string | null;
  position?: string | null;
  is_active?: boolean;
}

export default function PartnerMemberManager({ style }: { style?: object }) {
  const { t } = useI18n();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // 新建成员
  const [showCreate, setShowCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [formErr, setFormErr] = useState<{ email?: string; full_name?: string; password?: string }>({});
  const [form, setForm] = useState({ email: '', full_name: '', password: '123456', phone: '', position: '' });

  // 拉入经纪人（POST /partner/members/{user_id}/pull-in）
  const [showPullIn, setShowPullIn] = useState(false);
  const [pullId, setPullId] = useState('');
  const [pullErr, setPullErr] = useState('');
  const [pullSaving, setPullSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await partnerAdminApi.members();
      const rows = (data?.data ?? data) as MemberRow[];
      setMembers(Array.isArray(rows) ? rows : []);
      setLoadError(false);
    } catch (e: any) {
      setLoadError(true);
      notifyError(t('member.loadFailed'), e);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const openCreate = () => {
    setForm({ email: '', full_name: '', password: '123456', phone: '', position: '' });
    setFormErr({});
    setShowCreate(true);
  };

  const doCreate = async () => {
    const err: typeof formErr = {};
    if (!form.full_name.trim()) err.full_name = t('acc.nameRequired');
    if (!form.email.trim()) {
      err.email = t('acc.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      err.email = t('acc.emailInvalid');
    }
    if (!form.password || form.password.length < 6) err.password = t('acc.initPwdError');
    setFormErr(err);
    if (Object.keys(err).length > 0) return;
    setCreateSaving(true);
    try {
      await partnerAdminApi.createMember({
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        position: form.position.trim() || undefined,
      });
      notify(t('acc.success'), t('member.created'));
      setShowCreate(false);
      fetchData();
    } catch (e: any) {
      notifyError(t('acc.createFailed'), e);
    } finally {
      setCreateSaving(false);
    }
  };

  const doPullIn = async () => {
    const id = pullId.trim();
    if (!id) {
      setPullErr(t('member.pullIdRequired'));
      return;
    }
    setPullErr('');
    setPullSaving(true);
    try {
      await partnerAdminApi.pullIn(id);
      notify(t('acc.success'), t('member.pulledIn'));
      setShowPullIn(false);
      setPullId('');
      fetchData();
    } catch (e: any) {
      notifyError(t('member.pullInFailed'), e);
    } finally {
      setPullSaving(false);
    }
  };

  const removeMember = (m: MemberRow) => {
    const memberId = m.user_id ?? m.id;
    Alert.alert(t('member.remove'), t('member.removeConfirm', { name: m.full_name || m.email || m.id }), [
      { text: t('acc.cancel'), style: 'cancel' },
      {
        text: t('acc.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await partnerAdminApi.removeMember(String(memberId));
            notify(t('acc.success'), t('member.removed'));
            fetchData();
          } catch (e: any) {
            notifyError(t('member.removeFailed'), e);
          }
        },
      },
    ]);
  };

  const renderRow = ({ item }: { item: MemberRow }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: colors.alpha(colors.primaryRgb, 0.12) }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {(item.full_name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.full_name || t('acc.unnamed')}</Text>
            {item.is_active === false ? (
              <View style={[styles.roleTag, { backgroundColor: colors.alpha(colors.ink3, 0.12) }]}>
                <Text style={[styles.roleText, { color: colors.ink2 }]}>{t('acc.filter.inactive')}</Text>
              </View>
            ) : item.role ? (
              <View style={[styles.roleTag, { backgroundColor: colors.alpha(colors.infoRgb, 0.12) }]}>
                <Text style={[styles.roleText, { color: colors.info }]}>{t(`perm.role.${item.role}`)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.subLine} numberOfLines={1}>
            {[item.email, item.phone].filter(Boolean).join(' · ') || t('member.noContact')}
          </Text>
          {!!item.position && <Text style={styles.subLine2} numberOfLines={1}>{t('member.position')}: {item.position}</Text>}
        </View>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionLink} activeOpacity={0.7} onPress={() => removeMember(item)}>
          <Ionicons name="trash-outline" size={14} color={colors.error} />
          <Text style={[styles.actionText, { color: colors.error }]}>{t('member.remove')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderList = () => {
    if (loading) {
      return (
        <View style={styles.center}>
          <LoadingState />
        </View>
      );
    }
    if (loadError && members.length === 0) {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('member.loadFailed')}
          sub={t('acc.loadFailedSub')}
          actionLabel={t('acc.retry')}
          onAction={fetchData}
        />
      );
    }
    if (members.length === 0) {
      return (
        <EmptyState
          icon="people-outline"
          title={t('member.empty')}
          sub={t('member.pullRefresh')}
        />
      );
    }
    return (
      <FlatList
        data={members}
        keyExtractor={(m) => String(m.user_id ?? m.id)}
        renderItem={renderRow}
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: 16 }}
      />
    );
  };

  return (
    <View style={[styles.container, style]}>
      {/* 头部操作 */}
      <View style={styles.head}>
        <Text style={styles.title}>{t('member.title')}</Text>
        <View style={styles.headActions}>
          <TouchableOpacity style={styles.ghostBtn} activeOpacity={0.7} onPress={() => { setPullId(''); setPullErr(''); setShowPullIn(true); }}>
            <Ionicons name="person-add-outline" size={15} color={colors.primary} />
            <Text style={styles.ghostBtnText}>{t('member.pullIn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.primary }]} activeOpacity={0.7} onPress={openCreate}>
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={styles.createBtnText}>{t('acc.create')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {renderList()}

      {/* 新建成员 */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('member.createTitle')}</Text>
            <Text style={styles.modalLabel}>{t('acc.name')} *</Text>
            <TextInput
              style={[styles.modalInput, !!formErr.full_name && styles.modalInputError]}
              value={form.full_name}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, full_name: v }));
                if (formErr.full_name) setFormErr((e) => ({ ...e, full_name: undefined }));
              }}
              placeholder={t('acc.namePlaceholder')}
              placeholderTextColor={colors.ink3}
              autoFocus
            />
            {!!formErr.full_name && <Text style={styles.fieldError}>{formErr.full_name}</Text>}
            <Text style={styles.modalLabel}>{t('acc.email')} *</Text>
            <TextInput
              style={[styles.modalInput, !!formErr.email && styles.modalInputError]}
              value={form.email}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, email: v }));
                if (formErr.email) setFormErr((e) => ({ ...e, email: undefined }));
              }}
              placeholder={t('acc.emailPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {!!formErr.email && <Text style={styles.fieldError}>{formErr.email}</Text>}
            <Text style={styles.modalLabel}>{t('acc.positionOptional')}</Text>
            <TextInput
              style={styles.modalInput}
              value={form.position}
              onChangeText={(v) => setForm((f) => ({ ...f, position: v }))}
              placeholder={t('acc.positionPlaceholder')}
              placeholderTextColor={colors.ink3}
            />
            <Text style={styles.modalLabel}>{t('member.phoneOptional')}</Text>
            <TextInput
              style={styles.modalInput}
              value={form.phone}
              onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
              placeholder={t('member.phonePlaceholder')}
              placeholderTextColor={colors.ink3}
              keyboardType="phone-pad"
            />
            <Text style={styles.modalLabel}>{t('acc.initPwd')} *</Text>
            <TextInput
              style={[styles.modalInput, !!formErr.password && styles.modalInputError]}
              value={form.password}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, password: v }));
                if (formErr.password) setFormErr((e) => ({ ...e, password: undefined }));
              }}
              placeholder={t('acc.initPwdPlaceholder')}
              placeholderTextColor={colors.ink3}
              secureTextEntry
            />
            {!!formErr.password && <Text style={styles.fieldError}>{formErr.password}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setShowCreate(false)} accessibilityRole="button">
                <Text style={styles.modalCancelText}>{t('acc.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalOk, createSaving && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={createSaving}
                onPress={doCreate}
                accessibilityRole="button"
              >
                <Text style={styles.modalOkText}>{createSaving ? t('acc.creating') : t('acc.createBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 拉入经纪人 */}
      <Modal visible={showPullIn} transparent animationType="fade" onRequestClose={() => setShowPullIn(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('member.pullInTitle')}</Text>
            <TextInput
              style={[styles.modalInput, !!pullErr && styles.modalInputError]}
              value={pullId}
              onChangeText={(v) => {
                setPullId(v);
                if (pullErr) setPullErr('');
              }}
              placeholder={t('member.pullIdPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
            />
            {!!pullErr && <Text style={styles.fieldError}>{pullErr}</Text>}
            <Text style={styles.pullHint}>{t('member.pullHint')}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} activeOpacity={0.7} onPress={() => setShowPullIn(false)} accessibilityRole="button">
                <Text style={styles.modalCancelText}>{t('acc.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalOk, pullSaving && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={pullSaving}
                onPress={doPullIn}
                accessibilityRole="button"
              >
                <Text style={styles.modalOkText}>{pullSaving ? t('acc.saving') : t('member.pullIn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginVertical: 14,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  ghostBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
  },
  createBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 14,
    ...colors.shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800' },
  cardBody: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  roleTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  roleText: { fontSize: 11, fontWeight: '600' },
  subLine: { fontSize: 12, color: colors.ink2, marginTop: 3, fontVariant: ['tabular-nums'] },
  subLine2: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, fontWeight: '600' },
  pullHint: { fontSize: 12, color: colors.ink3, marginBottom: 16 },

  modalMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 14 },
  modalLabel: { fontSize: 12, color: colors.ink2, marginBottom: 6 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink, marginBottom: 16 },
  modalInputError: { borderColor: colors.error },
  fieldError: { fontSize: 12, color: colors.error, marginTop: -10, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12 },
  modalCancel: { backgroundColor: colors.surface2 },
  modalCancelText: { color: colors.ink2, fontWeight: '600' },
  modalOk: { backgroundColor: colors.primary },
  modalOkText: { color: '#fff', fontWeight: '600' },
  modalBtnDisabled: { opacity: 0.6 },
});