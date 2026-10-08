/**
 * 租客 / 业主「我的合同」签署页（只读为主）。
 *
 * 列出当前用户可见的合同（contractsApi.list：本人作为签署方或挂在本人租约下）。
 * 详情页展示签署方；仅当「当前用户是签署方且尚未签署」时显示「签署」按钮。
 * 非本人或已签署只读展示。文本走 i18n 三语。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import SignaturePad from '@/components/SignaturePad';
import { contractsApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/i18n';

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '-');

const SIGN_TYPE_META: Record<string, { labelKey: string; icon: string }> = {
  signature: { labelKey: 'contract.signType.signature', icon: 'create-outline' },
  seal: { labelKey: 'contract.signType.seal', icon: 'business-outline' },
  date: { labelKey: 'contract.signType.date', icon: 'calendar-outline' },
};

const SOURCE_META: Record<string, { labelKey: string; color: string; bg: string; icon: string }> = {
  generated: { labelKey: 'contract.sourceGenerated', color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1), icon: 'document-text-outline' },
  uploaded: { labelKey: 'contract.sourceUploaded', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1), icon: 'cloud-upload-outline' },
};

const STATUS_META: Record<string, { color: string; bg: string }> = {
  draft: { color: colors.ink2, bg: colors.surface2 },
  sent: { color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  partially_signed: { color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  signed: { color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
  voided: { color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
  completed: { color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
};

const ROLE_META: Record<string, string> = {
  landlord: 'contract.roleLandlord',
  owner: 'contract.roleLandlord',
  tenant: 'contract.roleTenant',
  witness: 'contract.roleWitness',
  agent: 'contract.roleAgent',
};

export default function MyContractsScreen() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 签署交互：当前正在签署的 field + 手写 SVG 结果
  const [signField, setSignField] = useState<any>(null);
  const [signatureSvg, setSignatureSvg] = useState('');
  const [signing, setSigning] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res: any = await contractsApi.list();
      const data = res?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setList(Array.isArray(items) ? items : []);
      setError(false);
    } catch (e) {
      setError(true);
      notifyError(t('contract.loadFail'), e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res: any = await contractsApi.get(id);
      setDetail(res?.data ?? {});
    } catch (e) {
      notifyError(t('contract.loadFail'), e);
    } finally {
      setDetailLoading(false);
    }
  }, [t]);

  // 当前用户对应的签署方（party.user_id 命中或 email 命中）
  const myParty = Array.isArray(detail?.parties)
    ? detail.parties.find(
        (p: any) =>
          String(p?.user_id ?? '') === String(user?.id ?? '') ||
          String(p?.email ?? '').toLowerCase() === String(user?.email ?? '').toLowerCase(),
      )
    : null;

  const signFields: any[] = Array.isArray(detail?.sign_fields) ? detail.sign_fields : [];
  const myFields = signFields.filter(
    (f: any) => !!myParty && String(f?.party_id) === String(myParty?.id),
  );
  const myPendingFields = myFields.filter((f: any) => !f?.signed);
  const mySignedFields = myFields.filter((f: any) => !!f?.signed);
  const needsRealName = !!myParty && !myParty?.real_name_verified;
  const remountPad = signField?.id ?? 'signature-pad';

  const handleSign = async () => {
    if (!detail?.id || !signField || signing) return;
    const method = signField?.field_type || 'signature';
    setSigning(true);
    try {
      await contractsApi.sign(detail.id, {
        field_id: String(signField.id),
        method,
        ...(method === 'signature' && signatureSvg ? { signature_svg: signatureSvg } : {}),
      });
      notify(t('contract.signSingleDone'));
      setSignField(null);
      setSignatureSvg('');
      await openDetail(detail.id);
      await load(true);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        notifyError(t('contract.realNameDenied'), e);
      } else {
        notifyError(t('contract.signSelf'), e);
      }
    } finally {
      setSigning(false);
    }
  };

  const openSignField = (f: any) => {
    setSignatureSvg('');
    setSignField(f);
  };

  // 渲染待签署 / 已签署的字段行
  const renderSignField = (f: any, signed: boolean, idx: number) => {
    const meta = SIGN_TYPE_META[f?.field_type ?? 'signature'] ?? SIGN_TYPE_META.signature;
    return (
      <TouchableOpacity
        key={f?.id ?? idx}
        style={styles.fieldCard}
        activeOpacity={0.8}
        disabled={signed}
        onPress={() => openSignField(f)}
      >
        <Ionicons name={meta.icon as any} size={18} color={signed ? colors.success : colors.primary} />
        <View style={styles.fieldBody}>
          <Text style={styles.fieldTitle}>{t(meta.labelKey)}</Text>
          {!!f?.page && (
            <Text style={styles.fieldMeta}>
              {t('contract.page')} {f.page}
            </Text>
          )}
          {!!f?.signed_at && (
            <Text style={styles.fieldMeta}>
              {t('contract.signedAt')}：{fmtDate(f.signed_at)}
            </Text>
          )}
        </View>
        {signed ? (
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        )}
      </TouchableOpacity>
    );
  };

  const renderSource = (source?: string) => {
    const meta = SOURCE_META[source ?? ''] ?? SOURCE_META.generated;
    return (
      <View style={[styles.badge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.badgeText, { color: meta.color }]}>{t(meta.labelKey)}</Text>
      </View>
    );
  };

  const renderStatus = (status?: string) => {
    const meta = STATUS_META[status ?? ''] ?? STATUS_META.draft;
    return (
      <View style={[styles.badge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.badgeText, { color: meta.color }]}>
          {t(`contract.status.${status ?? 'draft'}`)}
        </Text>
      </View>
    );
  };

  const renderRow = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => openDetail(item.id)}>
      <View style={styles.rowIcon}>
        <Ionicons
          name={(SOURCE_META[item.source ?? ''] ?? SOURCE_META.generated).icon as any}
          size={20}
          color={(SOURCE_META[item.source ?? ''] ?? SOURCE_META.generated).color}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title || t('contract.unknown')}</Text>
        <View style={styles.rowMeta}>
          {renderSource(item.source)}
          {renderStatus(item.status)}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </TouchableOpacity>
  );

  if (loading && list.length === 0) {
    return (
      <View style={styles.center}>
        <LoadingState label={t('contract.loadFail')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          error ? (
            <EmptyState icon="cloud-offline-outline" title={t('contract.loadFail')} actionLabel={t('pub.retry')} onAction={() => load()} />
          ) : (
            <EmptyState icon="document-text-outline" title={t('contract.empty')} sub={t('contract.myEmptyHint')} />
          )
        }
      />

      {/* 详情 */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.detailWrap}>
          <View style={styles.detailHead}>
            <TouchableOpacity style={styles.detailBack} onPress={() => setDetail(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={24} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.detailTitle} numberOfLines={1}>{detail?.title || t('contract.my')}</Text>
            <View style={{ width: 32 }} />
          </View>
          {detailLoading ? (
            <View style={styles.center}><LoadingState label={t('contract.loadFail')} /></View>
          ) : (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <View style={styles.detailStatusRow}>
                {renderSource(detail?.source)}
                {renderStatus(detail?.status)}
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t('contract.kind')}</Text>
                <Text style={styles.fieldValue}>{detail?.kind || '-'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t('contract.created_at')}</Text>
                <Text style={styles.fieldValue}>{fmtDate(detail?.created_at)}</Text>
              </View>

              <Text style={styles.sectionTitle}>{t('contract.parties')}</Text>
              {Array.isArray(detail?.parties) && detail.parties.length
                ? detail.parties.map((p: any, idx: number) => {
                    const isSelf =
                      String(p?.user_id ?? '') === String(user?.id ?? '') ||
                      String(p?.email ?? '').toLowerCase() === String(user?.email ?? '').toLowerCase();
                    const statusColor = p?.signed ? colors.success : p?.declined_at ? colors.error : colors.warning;
                    return (
                      <View key={p?.id ?? idx} style={styles.partyCard}>
                        <View style={styles.partyHead}>
                          <View style={styles.partyId}>
                            <Text style={styles.partyName}>{p?.name || t('contract.unknown')}</Text>
                            {p?.role ? <Text style={styles.partyRole}>{t(ROLE_META[p.role] ?? 'contract.roleOther')}</Text> : null}
                            {isSelf ? <Text style={styles.selfTag}>{t('contract.self')}</Text> : null}
                          </View>
                          <Text style={[styles.partyStatus, { color: statusColor }]}>
                            {p?.signed ? t('contract.signed') : p?.declined_at ? t('contract.declined') : t('contract.unsigned')}
                          </Text>
                        </View>
                        {!!p?.email && <Text style={styles.partyMeta}>{`${t('contract.email')}：${p.email}`}</Text>}
                        {!!p?.signed_at && <Text style={styles.partyMeta}>{`${t('contract.signedAt')}：${fmtDate(p.signed_at)}`}</Text>}
                        {!!p?.decline_reason && <Text style={[styles.partyMeta, styles.partyDecline]}>{`${t('contract.declineReason')}：${p.decline_reason}`}</Text>}
                      </View>
                    );
                  })
                : <Text style={styles.partyNone}>{t('contract.empty')}</Text>}

              {/* 我的签署区 */}
              <Text style={styles.sectionTitle}>{t('contract.signFields')}</Text>
              {myFields.length ? (
                <>
                  <Text style={styles.sectionSub}>{t('contract.myPendingSign')}</Text>
                  {myPendingFields.length ? (
                    myPendingFields.map((f: any, i: number) => renderSignField(f, false, i))
                  ) : (
                    <Text style={styles.partyNone}>{t('contract.noSignFields')}</Text>
                  )}
                  {!!mySignedFields.length && (
                    <>
                      <Text style={styles.sectionSub}>{t('contract.fieldDone')}</Text>
                      {mySignedFields.map((f: any, i: number) => renderSignField(f, true, i))}
                    </>
                  )}
                </>
              ) : (
                <Text style={styles.partyNone}>{t('contract.noSignFields')}</Text>
              )}

              {!!myPendingFields.length && (
                <View style={styles.doneBanner}>
                  <Ionicons name="thumbs-up-outline" size={16} color={colors.success} />
                  <Text style={styles.doneBannerText}>{t('contract.signYourFieldsHint')}</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* 签署弹窗（手写 / 公章 / 日期） */}
      <Modal visible={!!signField} animationType="slide" transparent onRequestClose={() => setSignField(null)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.signingTitle')}</Text>
              <TouchableOpacity onPress={() => { setSignField(null); setSignatureSvg(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            {needsRealName && (
              <View style={styles.realNameBanner}>
                <Ionicons name="person-circle-outline" size={16} color={colors.warning} />
                <Text style={styles.realNameBannerText}>{t('contract.realNameNotice')}</Text>
              </View>
            )}
            <ScrollView keyboardShouldPersistTaps="handled">
              {(signField?.field_type || 'signature') === 'signature' ? (
                <SignaturePad
                  key={remountPad}
                  title={myParty?.name || t('contract.unknown')}
                  onResult={setSignatureSvg}
                />
              ) : (signField?.field_type || 'signature') === 'seal' ? (
                <View style={styles.typeBox}>
                  <Ionicons name="business-outline" size={32} color={colors.primary} />
                  <Text style={styles.typeBoxText}>{t('contract.sealSign')}</Text>
                </View>
              ) : (
                <View style={styles.typeBox}>
                  <Ionicons name="calendar-outline" size={32} color={colors.primary} />
                  <Text style={styles.typeBoxText}>{t('contract.dateSign')}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.signBtn, signing && styles.btnDisabled]}
                activeOpacity={0.85}
                disabled={signing}
                onPress={handleSign}
              >
                {signing ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.signBtnText}>{t('contract.confirmSign')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: colors.spacing.md, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: colors.spacing.lg,
    marginBottom: 10,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  rowIcon: { width: 40, height: 40, borderRadius: colors.radius.sm, backgroundColor: colors.sidebarActive, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '700' },

  detailWrap: { flex: 1, backgroundColor: colors.background },
  detailHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
  detailBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { flex: 1, textAlign: 'center', fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  detailContent: { padding: colors.spacing.md, paddingBottom: 48 },
  detailStatusRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 14, color: colors.ink3 },
  fieldValue: { fontSize: 14, color: colors.ink, maxWidth: '65%', textAlign: 'right' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2, marginTop: 18, marginBottom: 10 },
  partyCard: { backgroundColor: colors.surface, borderRadius: colors.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14, marginBottom: 10 },
  partyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  partyId: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  partyName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  partyRole: { fontSize: 12, color: colors.primary, backgroundColor: colors.sidebarActive, paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full, overflow: 'hidden' },
  selfTag: { fontSize: 11, color: colors.success, backgroundColor: colors.alpha(colors.successRgb, 0.12), paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full, overflow: 'hidden' },
  partyStatus: { fontSize: 13, fontWeight: '700' },
  partyMeta: { fontSize: 13, color: colors.ink2, marginTop: 3 },
  partyDecline: { color: colors.error },
  partyNone: { fontSize: 13, color: colors.ink3 },
  signBtn: { marginTop: 20, height: 50, borderRadius: colors.radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...colors.shadow.primary },
  signBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
  btnDisabled: { opacity: 0.6 },

  /* 签署区 */
  sectionSub: { fontSize: 13, fontWeight: '700', color: colors.ink3, marginBottom: 8, marginTop: 4 },
  fieldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  fieldBody: { flex: 1, minWidth: 0 },
  fieldTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  fieldMeta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha(colors.successRgb, 0.1),
    marginTop: 4,
  },
  doneBannerText: { flex: 1, fontSize: 12, color: colors.success },

  /* 签署弹窗 */
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  realNameBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 12,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha(colors.warningRgb, 0.12),
    marginBottom: 14,
  },
  realNameBannerText: { flex: 1, fontSize: 13, color: colors.ink },
  typeBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 32,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  typeBoxText: { fontSize: 14, color: colors.ink2 },
});