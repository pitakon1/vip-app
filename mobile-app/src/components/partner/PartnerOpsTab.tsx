/**
 * 合作公司控制台 · 公司运营
 * GET /partner/announcements · /partner/tasks · /partner/approvals · /partner/materials
 * POST /partner/tasks/{id}/complete · /partner/approvals/{id}/review
 */
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { getErrorMessage, notify, notifyError } from '@/utils/feedback';
import { partnerAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';
import {
  Badge,
  SubTabs,
  fmtDateTime,
  shared,
  statusText,
  statusTone,
  symOf,
  unwrapBody,
} from './PartnerShared';

type OpsTab = 'announcements' | 'tasks' | 'approvals' | 'materials';

interface AnnouncementRow {
  id: string;
  title?: string | null;
  content?: string | null;
  category?: string | null;
  is_pinned?: boolean;
  scope?: string | null;
  publisher_name?: string | null;
  published_at?: string | null;
}

interface TaskRow {
  id: string;
  title?: string | null;
  content?: string | null;
  assignee_name?: string | null;
  due_at?: string | null;
  status?: string | null;
  completed_at?: string | null;
}

interface ApprovalRow {
  id: string;
  kind?: string | null;
  title?: string | null;
  amount?: number | null;
  content?: string | null;
  status?: string | null;
  applicant_name?: string | null;
  reply_note?: string | null;
  created_at?: string | null;
}

interface MaterialRow {
  id: string;
  title?: string | null;
  category?: string | null;
  url?: string | null;
  description?: string | null;
  scope?: string | null;
}

export default function PartnerOpsTab() {
  const { t } = useI18n();
  const [tab, setTab] = useState<OpsTab>('announcements');
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (spinner = true) => {
      if (spinner) setLoading(true);
      setError('');
      try {
        const [annRes, taskRes, apprRes, matRes] = await Promise.all([
          partnerAdminApi.announcements(),
          partnerAdminApi.tasks(),
          partnerAdminApi.approvals(),
          partnerAdminApi.materials(),
        ]);
        setAnnouncements(unwrapBody<AnnouncementRow[]>(annRes.data) ?? []);
        setTasks(unwrapBody<TaskRow[]>(taskRes.data) ?? []);
        setApprovals(unwrapBody<ApprovalRow[]>(apprRes.data) ?? []);
        setMaterials(unwrapBody<MaterialRow[]>(matRes.data) ?? []);
      } catch (e: any) {
        setError(getErrorMessage(e, t('partner.loadFailed')));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }, [load]);

  const completeTask = (row: TaskRow) => {
    Alert.alert(t('partner.ops.complete'), t('partner.ops.completeConfirm', { title: row.title || '' }), [
      { text: t('acc.cancel'), style: 'cancel' },
      {
        text: t('partner.ops.complete'),
        onPress: async () => {
          try {
            await partnerAdminApi.completeTask(row.id);
            notify(t('acc.success'), t('partner.ops.completed'));
            await load(false);
          } catch (e: any) {
            notifyError(t('partner.actionFailed'), e);
          }
        },
      },
    ]);
  };

  const reviewApproval = (row: ApprovalRow, approved: boolean) => {
    const action = approved ? t('partner.ops.approve') : t('partner.ops.reject');
    Alert.alert(action, t('partner.ops.reviewConfirm', { action, title: row.title || '' }), [
      { text: t('acc.cancel'), style: 'cancel' },
      {
        text: action,
        style: approved ? 'default' : 'destructive',
        onPress: async () => {
          try {
            await partnerAdminApi.reviewApproval(row.id, { approved });
            notify(t('acc.success'), t('partner.ops.reviewed'));
            await load(false);
          } catch (e: any) {
            notifyError(t('partner.actionFailed'), e);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  const data: (AnnouncementRow | TaskRow | ApprovalRow | MaterialRow)[] =
    tab === 'announcements'
      ? announcements
      : tab === 'tasks'
        ? tasks
        : tab === 'approvals'
          ? approvals
          : materials;

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
              { key: 'announcements', label: t('partner.ops.announcements') },
              { key: 'tasks', label: t('partner.ops.tasks') },
              { key: 'approvals', label: t('partner.ops.approvals') },
              { key: 'materials', label: t('partner.ops.materials') },
            ]}
          />
          {!!error && <Text style={shared.errorText}>{error}</Text>}
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
            icon="megaphone-outline"
            title={
              tab === 'announcements'
                ? t('partner.ops.annEmpty')
                : tab === 'tasks'
                  ? t('partner.ops.taskEmpty')
                  : tab === 'approvals'
                    ? t('partner.ops.approvalEmpty')
                    : t('partner.ops.materialEmpty')
            }
            sub={t('member.pullRefresh')}
          />
        )
      }
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={({ item }) => {
        if (tab === 'announcements') {
          const r = item as AnnouncementRow;
          return (
            <View style={shared.card}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={2}>
                    {r.title || '—'}
                  </Text>
                  <Text style={shared.rowSub}>
                    {r.publisher_name || '—'} · {fmtDateTime(r.published_at)}
                  </Text>
                </View>
                {r.is_pinned ? <Badge text={t('partner.ops.pinned')} tone="warning" /> : null}
              </View>
              {!!r.content && (
                <Text style={[shared.rowSub, { marginTop: 8 }]} numberOfLines={4}>
                  {r.content}
                </Text>
              )}
              <View style={shared.chipRow}>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.ops.scope')}</Text>
                  <Text style={shared.chipValue}>
                    {r.scope === 'platform' ? t('partner.ops.platform') : t('partner.ops.company')}
                  </Text>
                </View>
                {!!r.category && (
                  <View style={shared.chip}>
                    <Text style={shared.chipLabel}>{t('partner.ops.category')}</Text>
                    <Text style={shared.chipValue}>{r.category}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }
        if (tab === 'tasks') {
          const r = item as TaskRow;
          const done = r.status === 'completed';
          return (
            <View style={shared.card}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={2}>
                    {r.title || '—'}
                  </Text>
                  <Text style={shared.rowSub}>
                    {t('partner.ops.assignee')}: {r.assignee_name || '—'}
                    {r.due_at ? ` · ${t('partner.ops.dueAt')} ${fmtDateTime(r.due_at)}` : ''}
                  </Text>
                </View>
                <Badge
                  text={statusText(t, 'partner.status', r.status)}
                  tone={done ? 'success' : statusTone(r.status)}
                />
              </View>
              {!!r.content && (
                <Text style={[shared.rowSub, { marginTop: 8 }]} numberOfLines={3}>
                  {r.content}
                </Text>
              )}
              {!done && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    activeOpacity={0.7}
                    onPress={() => completeTask(r)}
                  >
                    <Text style={styles.btnPrimaryText}>{t('partner.ops.complete')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }
        if (tab === 'approvals') {
          const r = item as ApprovalRow;
          const pending = r.status === 'pending';
          return (
            <View style={shared.card}>
              <View style={shared.rowHead}>
                <View style={shared.rowMain}>
                  <Text style={shared.rowTitle} numberOfLines={2}>
                    {r.title || '—'}
                  </Text>
                  <Text style={shared.rowSub}>
                    {t('partner.ops.applicant')}: {r.applicant_name || '—'} · {fmtDateTime(r.created_at)}
                  </Text>
                </View>
                <Badge text={statusText(t, 'partner.status', r.status)} tone={statusTone(r.status)} />
              </View>
              <View style={shared.chipRow}>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.ops.kind')}</Text>
                  <Text style={shared.chipValue}>{r.kind || '—'}</Text>
                </View>
                {r.amount != null && (
                  <View style={shared.chip}>
                    <Text style={shared.chipLabel}>{t('partner.ops.amount')}</Text>
                    <Text style={shared.chipValue}>
                      {symOf()}
                      {Number(r.amount).toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>
              {!!r.content && (
                <Text style={[shared.rowSub, { marginTop: 8 }]} numberOfLines={3}>
                  {r.content}
                </Text>
              )}
              {!!r.reply_note && (
                <Text style={[shared.rowSub, { marginTop: 8, color: colors.ink2 }]} numberOfLines={2}>
                  {r.reply_note}
                </Text>
              )}
              {pending && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    activeOpacity={0.7}
                    onPress={() => reviewApproval(r, true)}
                  >
                    <Text style={styles.btnPrimaryText}>{t('partner.ops.approve')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    activeOpacity={0.7}
                    onPress={() => reviewApproval(r, false)}
                  >
                    <Text style={styles.btnRejectText}>{t('partner.ops.reject')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }
        const r = item as MaterialRow;
        return (
          <View style={shared.card}>
            <View style={shared.rowHead}>
              <View style={shared.rowMain}>
                <Text style={shared.rowTitle} numberOfLines={2}>
                  {r.title || '—'}
                </Text>
                <Text style={shared.rowSub} numberOfLines={2}>
                  {r.url || '—'}
                </Text>
              </View>
              <Badge
                text={r.scope === 'platform' ? t('partner.ops.platform') : t('partner.ops.company')}
                tone="info"
              />
            </View>
            {!!r.description && (
              <Text style={[shared.rowSub, { marginTop: 8 }]} numberOfLines={3}>
                {r.description}
              </Text>
            )}
            {!!r.category && (
              <View style={shared.chipRow}>
                <View style={shared.chip}>
                  <Text style={shared.chipLabel}>{t('partner.ops.category')}</Text>
                  <Text style={shared.chipValue}>{r.category}</Text>
                </View>
              </View>
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
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.primaryForeground, fontWeight: '700', fontSize: colors.fontSize.sm },
  btnReject: { backgroundColor: colors.alpha(colors.errorRgb, 0.1) },
  btnRejectText: { color: colors.errorInk, fontWeight: '700', fontSize: colors.fontSize.sm },
});
