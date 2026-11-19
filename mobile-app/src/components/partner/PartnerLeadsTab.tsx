/**
 * 合作公司控制台 · 线索 / 报备 / 带看
 * GET /partner/leads · /partner/claims · /partner/viewings
 * POST /partner/leads/claim · /partner/leads/{id}/assign ·
 *      /partner/viewings/{id}/assign · /partner/viewings/{id}/result
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { getErrorMessage, notify, notifyError } from '@/utils/feedback';
import { partnerAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';
import {
  Badge,
  EmployeePickerModal,
  FormModal,
  PartnerMemberLite,
  SubTabs,
  fmtDate,
  fmtDateTime,
  shared,
  statusText,
  statusTone,
  unwrapBody,
} from './PartnerShared';

type LeadsTab = 'leads' | 'claims' | 'viewings';

interface LeadRow {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  stage?: string | null;
  assigned_to?: string | null;
  assignee_name?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  source?: string | null;
  created_at?: string | null;
}

interface ClaimRow {
  id: string;
  fingerprint?: string | null;
  fingerprint_type?: string | null;
  lead_id?: string | null;
  expires_at?: string | null;
  status?: string | null;
}

interface ViewingRow {
  id: string;
  property_id?: string;
  property_address?: string | null;
  visitor_name?: string | null;
  visitor_phone?: string | null;
  scheduled_at?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  assignee_name?: string | null;
}

interface AssignTarget {
  kind: 'lead' | 'viewing';
  id: string;
  name: string;
}

export default function PartnerLeadsTab() {
  const { t } = useI18n();
  const [tab, setTab] = useState<LeadsTab>('leads');
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [viewings, setViewings] = useState<ViewingRow[]>([]);
  const [members, setMembers] = useState<PartnerMemberLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [resultTarget, setResultTarget] = useState<ViewingRow | null>(null);
  const [resultSaving, setResultSaving] = useState(false);

  // 客户报备表单
  const [showClaim, setShowClaim] = useState(false);
  const [claimName, setClaimName] = useState('');
  const [claimPhone, setClaimPhone] = useState('');
  const [claimEmail, setClaimEmail] = useState('');
  const [claimErr, setClaimErr] = useState('');
  const [claimSaving, setClaimSaving] = useState(false);

  const load = useCallback(
    async (spinner = true) => {
      if (spinner) setLoading(true);
      setError('');
      try {
        const [leadRes, claimRes, viewingRes] = await Promise.all([
          partnerAdminApi.leads({ page: 1, page_size: 100 }),
          partnerAdminApi.claims(),
          partnerAdminApi.viewings(),
        ]);
        const leadBody = unwrapBody<{ items?: LeadRow[] }>(leadRes.data);
        setLeads(Array.isArray(leadBody?.items) ? leadBody.items ?? [] : []);
        setClaims(unwrapBody<ClaimRow[]>(claimRes.data) ?? []);
        setViewings(unwrapBody<ViewingRow[]>(viewingRes.data) ?? []);
      } catch (e: any) {
        setError(getErrorMessage(e, t('partner.loadFailed')));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const loadMembers = useCallback(async () => {
    try {
      const { data } = await partnerAdminApi.members();
      const rows = unwrapBody<PartnerMemberLite[]>(data);
      setMembers(Array.isArray(rows) ? rows : []);
    } catch {
      // 非阻塞：分配时可提示暂无成员
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(true);
      loadMembers();
    }, [load, loadMembers]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }, [load]);

  const doAssign = async (member: PartnerMemberLite) => {
    const target = assignTarget;
    if (!target) return;
    setAssignTarget(null);
    try {
      const employeeId = member.employee_id;
      if (!employeeId) throw new Error(t('partner.ld.noEmployee'));
      if (target.kind === 'lead') await partnerAdminApi.assignLead(target.id, employeeId);
      else await partnerAdminApi.assignViewing(target.id, employeeId);
      notify(t('acc.success'), target.kind === 'lead' ? t('partner.ld.assigned') : t('partner.ld.dispatched'));
      await load(false);
    } catch (e: any) {
      notifyError(t('partner.actionFailed'), e);
    }
  };

  const submitClaim = async () => {
    if (!claimName.trim()) {
      setClaimErr(t('acc.nameRequired'));
      return;
    }
    if (!claimPhone.trim() && !claimEmail.trim()) {
      setClaimErr(t('partner.ld.claimNeedContact'));
      return;
    }
    setClaimErr('');
    setClaimSaving(true);
    try {
      const { data } = await partnerAdminApi.claimLead({
        name: claimName.trim(),
        phone: claimPhone.trim() || undefined,
        email: claimEmail.trim() || undefined,
      });
      const body = unwrapBody<{ expires_at?: string; duplicated?: boolean }>(data);
      const date = fmtDate(body?.expires_at);
      notify(
        t('acc.success'),
        body?.duplicated
          ? t('partner.ld.claimDuplicated', { date })
          : t('partner.ld.claimSuccess', { date }),
      );
      setShowClaim(false);
      setClaimName('');
      setClaimPhone('');
      setClaimEmail('');
      await load(false);
    } catch (e: any) {
      const status = e?.response?.status ?? e?.status;
      const detail = e?.response?.data?.detail;
      if (status === 409 && typeof detail === 'string' && detail) {
        setClaimErr(detail);
      } else {
        setClaimErr(getErrorMessage(e, t('partner.ld.claimFailed')));
      }
    } finally {
      setClaimSaving(false);
    }
  };

  const submitResult = (status: 'completed' | 'no_show' | 'cancelled') => {
    const target = resultTarget;
    if (!target) return;
    Alert.alert(
      t('partner.ld.resultTitle'),
      t('partner.ld.resultConfirm', { name: target.visitor_name || target.property_address || '' }),
      [
        { text: t('acc.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: status === 'completed' ? 'default' : 'destructive',
          onPress: async () => {
            setResultSaving(true);
            try {
              await partnerAdminApi.viewingResult(target.id, { status });
              notify(t('acc.success'), t('partner.ld.resultSaved'));
              setResultTarget(null);
              await load(false);
            } catch (e: any) {
              notifyError(t('partner.actionFailed'), e);
            } finally {
              setResultSaving(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  const data: (LeadRow | ClaimRow | ViewingRow)[] =
    tab === 'leads' ? leads : tab === 'claims' ? claims : viewings;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <SubTabs
              value={tab}
              onChange={setTab}
              items={[
                { key: 'leads', label: `${t('partner.ld.leads')} (${leads.length})` },
                { key: 'claims', label: `${t('partner.ld.claims')} (${claims.length})` },
                { key: 'viewings', label: `${t('partner.ld.viewings')} (${viewings.length})` },
              ]}
            />
            {!!error && <Text style={shared.errorText}>{error}</Text>}
            {tab === 'claims' && (
              <TouchableOpacity
                style={styles.claimBtn}
                activeOpacity={0.7}
                onPress={() => {
                  setClaimErr('');
                  setShowClaim(true);
                }}
              >
                <Text style={styles.claimBtnText}>{t('partner.ld.claimBtn')}</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 12 }} />
          </View>
        }
        ListEmptyComponent={
          error ? (
            <EmptyState
              icon="cloud-offline-outline"
              tone="error"
              title={error}
              actionLabel={t('common.retry')}
              onAction={() => load(true)}
            />
          ) : (
            <EmptyState
              icon="person-add-outline"
              title={
                tab === 'leads'
                  ? t('partner.ld.leadEmpty')
                  : tab === 'claims'
                    ? t('partner.ld.claimEmpty')
                    : t('partner.ld.viewingEmpty')
              }
              sub={t('member.pullRefresh')}
            />
          )
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          if (tab === 'leads') {
            const r = item as LeadRow;
            return (
              <View style={shared.card}>
                <View style={shared.rowHead}>
                  <View style={shared.rowMain}>
                    <Text style={shared.rowTitle} numberOfLines={1}>
                      {r.name || '—'}
                    </Text>
                    <Text style={shared.rowSub} numberOfLines={1}>
                      {[r.phone, r.email].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                  <Badge text={r.stage || '—'} />
                </View>
                <View style={shared.chipRow}>
                  <View style={shared.chip}>
                    <Text style={shared.chipLabel}>{t('partner.ld.assignee')}</Text>
                    <Text style={shared.chipValue}>{r.assignee_name || t('partner.ld.unassigned')}</Text>
                  </View>
                  <View style={shared.chip}>
                    <Text style={shared.chipLabel}>{t('partner.ld.createdAt')}</Text>
                    <Text style={shared.chipValue}>{fmtDateTime(r.created_at)}</Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    activeOpacity={0.7}
                    onPress={() => setAssignTarget({ kind: 'lead', id: r.id, name: r.name || '' })}
                  >
                    <Text style={styles.btnPrimaryText}>{t('partner.ld.assign')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }
          if (tab === 'claims') {
            const r = item as ClaimRow;
            return (
              <View style={shared.card}>
                <View style={shared.rowHead}>
                  <View style={shared.rowMain}>
                    <Text style={shared.rowTitle} numberOfLines={1}>
                      {r.fingerprint || '—'}
                    </Text>
                    <Text style={shared.rowSub}>
                      {t('partner.ld.fingerprintType')}: {r.fingerprint_type || '—'}
                    </Text>
                  </View>
                  <Badge
                    text={r.status === 'expired' ? t('partner.status.expired') : r.status || '—'}
                    tone={r.status === 'expired' ? 'neutral' : statusTone(r.status)}
                  />
                </View>
                <View style={shared.chipRow}>
                  <View style={shared.chip}>
                    <Text style={shared.chipLabel}>{t('partner.ld.protectUntil')}</Text>
                    <Text style={shared.chipValue}>{fmtDate(r.expires_at)}</Text>
                  </View>
                </View>
              </View>
            );
          }
          const r = item as ViewingRow;
          return (
            <View style={shared.card}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={1}>
                    {r.property_address || '—'}
                  </Text>
                  <Text style={shared.rowSub} numberOfLines={1}>
                    {t('partner.ld.visitor')}: {r.visitor_name || '—'}
                    {r.visitor_phone ? ` · ${r.visitor_phone}` : ''}
                  </Text>
                </View>
                <Badge text={statusText(t, 'partner.status', r.status)} tone={statusTone(r.status)} />
              </View>
              <View style={shared.chipRow}>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.ld.scheduledAt')}</Text>
                  <Text style={shared.chipValue}>{fmtDateTime(r.scheduled_at)}</Text>
                </View>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.ld.assignee')}</Text>
                  <Text style={shared.chipValue}>{r.assignee_name || t('partner.ld.unassigned')}</Text>
                </View>
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost]}
                  activeOpacity={0.7}
                  onPress={() => setAssignTarget({ kind: 'viewing', id: r.id, name: r.visitor_name || '' })}
                >
                  <Text style={styles.btnGhostText}>{t('partner.ld.dispatch')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  activeOpacity={0.7}
                  onPress={() => setResultTarget(r)}
                >
                  <Text style={styles.btnPrimaryText}>{t('partner.ld.result')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      <EmployeePickerModal
        visible={!!assignTarget}
        title={assignTarget?.kind === 'lead' ? t('partner.ld.assignTitle') : t('partner.ld.dispatchTitle')}
        members={members.filter((m) => m.employee_id)}
        onClose={() => setAssignTarget(null)}
        onPick={doAssign}
      />

      <FormModal
        visible={showClaim}
        title={t('partner.ld.claimTitle')}
        saving={claimSaving}
        submitLabel={t('partner.ld.claimSubmit')}
        onSubmit={submitClaim}
        onClose={() => setShowClaim(false)}
      >
        <Text style={shared.modalLabel}>{t('partner.ld.claimName')} *</Text>
        <TextInput
          style={shared.modalInput}
          value={claimName}
          onChangeText={(v) => {
            setClaimName(v);
            if (claimErr) setClaimErr('');
          }}
          placeholder={t('partner.ld.claimName')}
          placeholderTextColor={colors.ink3}
        />
        <Text style={shared.modalLabel}>{t('partner.ld.claimPhone')}</Text>
        <TextInput
          style={shared.modalInput}
          value={claimPhone}
          onChangeText={(v) => {
            setClaimPhone(v);
            if (claimErr) setClaimErr('');
          }}
          placeholder={t('member.phonePlaceholder')}
          placeholderTextColor={colors.ink3}
          keyboardType="phone-pad"
        />
        <Text style={shared.modalLabel}>{t('partner.ld.claimEmail')}</Text>
        <TextInput
          style={shared.modalInput}
          value={claimEmail}
          onChangeText={(v) => {
            setClaimEmail(v);
            if (claimErr) setClaimErr('');
          }}
          placeholder={t('acc.email')}
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {!!claimErr && <Text style={shared.fieldError}>{claimErr}</Text>}
      </FormModal>

      <Modal visible={!!resultTarget} transparent animationType="fade" onRequestClose={() => setResultTarget(null)}>
        <View style={shared.modalMask}>
          <View style={shared.modalCard}>
            <Text style={shared.modalTitle}>{t('partner.ld.resultTitle')}</Text>
            <Text style={[shared.rowSub, { marginBottom: 14 }]} numberOfLines={2}>
              {resultTarget?.property_address || resultTarget?.visitor_name || ''}
            </Text>
            {(['completed', 'no_show', 'cancelled'] as const).map((k) => (
              <TouchableOpacity
                key={k}
                style={styles.resultOption}
                activeOpacity={0.7}
                disabled={resultSaving}
                onPress={() => submitResult(k)}
              >
                <Text style={styles.resultOptionText}>{statusText(t, 'partner.status', k)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[shared.modalBtn, shared.modalCancel, { marginTop: 8 }]}
              activeOpacity={0.7}
              onPress={() => setResultTarget(null)}
            >
              <Text style={shared.modalCancelText}>{t('acc.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  claimBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    minHeight: 40,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBtnText: { color: colors.primaryForeground, fontWeight: '700', fontSize: colors.fontSize.sm },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, minHeight: 38, borderRadius: colors.radius.md, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.primaryForeground, fontWeight: '700', fontSize: colors.fontSize.sm },
  btnGhost: { backgroundColor: colors.surface2 },
  btnGhostText: { color: colors.ink2, fontWeight: '700', fontSize: colors.fontSize.sm },
  resultOption: {
    minHeight: 44,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  resultOptionText: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.ink },
});
