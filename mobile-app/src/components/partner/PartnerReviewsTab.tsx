/**
 * 合作公司控制台 · 审批与排班
 * GET/POST /partner/trips/{id}/review · /partner/appeals/{id}/review · /partner/shifts
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
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
  PartnerMemberLite,
  SubTabs,
  fmtDate,
  shared,
  statusText,
  statusTone,
  todayKey,
  unwrapBody,
} from './PartnerShared';

type ReviewTab = 'trips' | 'appeals' | 'shifts';

interface TripRow {
  id: string;
  employee_id?: string;
  employee_name?: string | null;
  trip_date?: string | null;
  from_location?: string | null;
  to_location?: string | null;
  reason?: string | null;
  status?: string | null;
  reply_note?: string | null;
  created_at?: string | null;
}

interface AppealRow {
  id: string;
  employee_id?: string;
  employee_name?: string | null;
  date?: string | null;
  reason?: string | null;
  status?: string | null;
  reply_note?: string | null;
}

interface ShiftRow {
  id: string;
  employee_id?: string;
  employee_name?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
}

export default function PartnerReviewsTab() {
  const { t } = useI18n();
  const [tab, setTab] = useState<ReviewTab>('trips');
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [members, setMembers] = useState<PartnerMemberLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // 新建排班
  const [shiftEmp, setShiftEmp] = useState<string>('');
  const [shiftDate, setShiftDate] = useState(todayKey());
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');
  const [shiftNote, setShiftNote] = useState('');
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftErr, setShiftErr] = useState('');

  const load = useCallback(
    async (spinner = true) => {
      if (spinner) setLoading(true);
      setError('');
      try {
        const [tripRes, appealRes, shiftRes] = await Promise.all([
          partnerAdminApi.trips(),
          partnerAdminApi.appeals(),
          partnerAdminApi.shifts(),
        ]);
        setTrips(unwrapBody<TripRow[]>(tripRes.data) ?? []);
        setAppeals(unwrapBody<AppealRow[]>(appealRes.data) ?? []);
        setShifts(unwrapBody<ShiftRow[]>(shiftRes.data) ?? []);
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
      // 成员列表仅用于排班选择，失败不阻塞审批列表
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

  const doReview = (kind: 'trips' | 'appeals', id: string, name: string, approved: boolean) => {
    const action = approved ? t('partner.rv.approve') : t('partner.rv.reject');
    Alert.alert(action, t('partner.rv.reviewConfirm', { action, name }), [
      { text: t('acc.cancel'), style: 'cancel' },
      {
        text: action,
        style: approved ? 'default' : 'destructive',
        onPress: async () => {
          try {
            if (kind === 'trips') await partnerAdminApi.reviewTrip(id, { approved });
            else await partnerAdminApi.reviewAppeal(id, { approved });
            notify(t('acc.success'), t('partner.rv.reviewed', { action }));
            load(false);
          } catch (e: any) {
            notifyError(t('partner.actionFailed'), e);
          }
        },
      },
    ]);
  };

  const saveShift = async () => {
    if (!shiftEmp) {
      setShiftErr(t('partner.rv.selectEmployee'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate.trim())) {
      setShiftErr(t('partner.rv.dateInvalid'));
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(shiftStart.trim()) || !/^\d{2}:\d{2}$/.test(shiftEnd.trim())) {
      setShiftErr(t('partner.rv.timeInvalid'));
      return;
    }
    setShiftErr('');
    setShiftSaving(true);
    try {
      await partnerAdminApi.createShifts([
        {
          employee_id: shiftEmp,
          date: shiftDate.trim(),
          start_time: shiftStart.trim(),
          end_time: shiftEnd.trim(),
          note: shiftNote.trim() || undefined,
        },
      ]);
      notify(t('acc.success'), t('partner.rv.saved'));
      setShiftNote('');
      await load(false);
    } catch (e: any) {
      notifyError(t('partner.actionFailed'), e);
    } finally {
      setShiftSaving(false);
    }
  };

  const actionRow = (onApprove: () => void, onReject: () => void) => (
    <View style={styles.actionRow}>
      <TouchableOpacity style={[styles.btn, styles.btnOk]} activeOpacity={0.7} onPress={onApprove}>
        <Text style={styles.btnOkText}>{t('partner.rv.approve')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, styles.btnReject]} activeOpacity={0.7} onPress={onReject}>
        <Text style={styles.btnRejectText}>{t('partner.rv.reject')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderShiftForm = () => (
    <View style={[shared.card, { marginTop: 12 }]}>
      <Text style={shared.rowTitle}>{t('partner.rv.newShift')}</Text>
      <Text style={[shared.modalLabel, { marginTop: 10 }]}>{t('partner.rv.employee')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {members.filter((m) => m.employee_id).map((m) => {
          const active = m.employee_id === shiftEmp;
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.empChip, active && styles.empChipActive]}
              activeOpacity={0.7}
              onPress={() => setShiftEmp(m.employee_id as string)}
            >
              <Text style={[styles.empChipText, active && styles.empChipTextActive]} numberOfLines={1}>
                {m.full_name || m.email || t('acc.unnamed')}
              </Text>
            </TouchableOpacity>
          );
        })}
        {members.length === 0 && <Text style={shared.rowSub}>{t('partner.ld.noMembers')}</Text>}
      </ScrollView>

      <Text style={[shared.modalLabel, { marginTop: 12 }]}>{t('partner.rv.date')} (YYYY-MM-DD)</Text>
      <TextInput
        style={shared.modalInput}
        value={shiftDate}
        onChangeText={setShiftDate}
        placeholder="2026-11-19"
        placeholderTextColor={colors.ink3}
        autoCapitalize="none"
      />
      <View style={styles.timeRow}>
        <View style={{ flex: 1 }}>
          <Text style={shared.modalLabel}>{t('partner.rv.startTime')} (HH:MM)</Text>
          <TextInput
            style={shared.modalInput}
            value={shiftStart}
            onChangeText={setShiftStart}
            placeholder="09:00"
            placeholderTextColor={colors.ink3}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={shared.modalLabel}>{t('partner.rv.endTime')} (HH:MM)</Text>
          <TextInput
            style={shared.modalInput}
            value={shiftEnd}
            onChangeText={setShiftEnd}
            placeholder="18:00"
            placeholderTextColor={colors.ink3}
          />
        </View>
      </View>
      <Text style={shared.modalLabel}>{t('partner.rv.note')}</Text>
      <TextInput
        style={shared.modalInput}
        value={shiftNote}
        onChangeText={setShiftNote}
        placeholder={t('partner.rv.note')}
        placeholderTextColor={colors.ink3}
      />
      {!!shiftErr && <Text style={shared.fieldError}>{shiftErr}</Text>}
      <TouchableOpacity
        style={[styles.saveBtn, shiftSaving && shared.modalBtnDisabled]}
        activeOpacity={0.7}
        disabled={shiftSaving}
        onPress={saveShift}
      >
        <Text style={styles.saveBtnText}>{shiftSaving ? t('acc.saving') : t('partner.rv.save')}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  const data: (TripRow | AppealRow | ShiftRow)[] =
    tab === 'trips' ? trips : tab === 'appeals' ? appeals : shifts;

  return (
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
              { key: 'trips', label: `${t('partner.rv.trips')} (${trips.length})` },
              { key: 'appeals', label: `${t('partner.rv.appeals')} (${appeals.length})` },
              { key: 'shifts', label: t('partner.rv.shifts') },
            ]}
          />
          {!!error && <Text style={shared.errorText}>{error}</Text>}
          {tab === 'shifts' && renderShiftForm()}
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
            icon="checkmark-done-outline"
            title={
              tab === 'trips'
                ? t('partner.rv.tripEmpty')
                : tab === 'appeals'
                  ? t('partner.rv.appealEmpty')
                  : t('partner.rv.shiftEmpty')
            }
            sub={t('member.pullRefresh')}
          />
        )
      }
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={({ item }) => {
        if (tab === 'trips') {
          const r = item as TripRow;
          return (
            <View style={shared.card}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={1}>
                    {r.employee_name || t('acc.unnamed')}
                  </Text>
                  <Text style={shared.rowSub}>
                    {t('partner.rv.tripDate')} {fmtDate(r.trip_date)}
                  </Text>
                </View>
                <Badge text={statusText(t, 'partner.status', r.status)} tone={statusTone(r.status)} />
              </View>
              <View style={shared.chipRow}>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.rv.route')}</Text>
                  <Text style={shared.chipValue} numberOfLines={1}>
                    {`${r.from_location || '—'} → ${r.to_location || '—'}`}
                  </Text>
                </View>
              </View>
              {!!r.reason && (
                <Text style={[shared.rowSub, { marginTop: 8 }]} numberOfLines={2}>
                  {t('partner.rv.reason')}: {r.reason}
                </Text>
              )}
              {r.status === 'pending' &&
                actionRow(
                  () => doReview('trips', r.id, r.employee_name || '', true),
                  () => doReview('trips', r.id, r.employee_name || '', false),
                )}
            </View>
          );
        }
        if (tab === 'appeals') {
          const r = item as AppealRow;
          return (
            <View style={shared.card}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={1}>
                    {r.employee_name || t('acc.unnamed')}
                  </Text>
                  <Text style={shared.rowSub}>
                    {t('partner.rv.tripDate')} {fmtDate(r.date)}
                  </Text>
                </View>
                <Badge text={statusText(t, 'partner.status', r.status)} tone={statusTone(r.status)} />
              </View>
              {!!r.reason && (
                <Text style={[shared.rowSub, { marginTop: 8 }]} numberOfLines={3}>
                  {t('partner.rv.reason')}: {r.reason}
                </Text>
              )}
              {r.status === 'pending' &&
                actionRow(
                  () => doReview('appeals', r.id, r.employee_name || '', true),
                  () => doReview('appeals', r.id, r.employee_name || '', false),
                )}
            </View>
          );
        }
        const r = item as ShiftRow;
        return (
          <View style={shared.card}>
            <View style={shared.rowHead}>
              <View style={shared.rowMain}>
                <Text style={shared.rowTitle} numberOfLines={1}>
                  {r.employee_name || t('acc.unnamed')}
                </Text>
                <Text style={shared.rowSub}>{fmtDate(r.date)}</Text>
              </View>
              <Badge text={`${r.start_time || '—'} - ${r.end_time || '—'}`} tone="info" />
            </View>
            {!!r.note && (
              <Text style={[shared.rowSub, { marginTop: 8 }]} numberOfLines={2}>
                {t('partner.rv.note')}: {r.note}
              </Text>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, minHeight: 38, borderRadius: colors.radius.md, alignItems: 'center', justifyContent: 'center' },
  btnOk: { backgroundColor: colors.primary },
  btnOkText: { color: colors.primaryForeground, fontWeight: '700', fontSize: colors.fontSize.sm },
  btnReject: { backgroundColor: colors.alpha(colors.errorRgb, 0.1) },
  btnRejectText: { color: colors.errorInk, fontWeight: '700', fontSize: colors.fontSize.sm },
  empChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
    maxWidth: 160,
  },
  empChipActive: { backgroundColor: colors.surface, borderColor: colors.primary },
  empChipText: { fontSize: colors.fontSize.xs, fontWeight: '600', color: colors.ink2 },
  empChipTextActive: { color: colors.primary, fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    minHeight: 44,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: colors.primaryForeground, fontWeight: '700', fontSize: colors.fontSize.sm },
});
