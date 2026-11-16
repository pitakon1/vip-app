import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { propertyBindingsApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import type { RootStackParamList } from '@/navigation/RootNavigator';

/**
 * C 端「添加我的房产」：填写房产信息 + 上传产权证明材料 → 提交绑定申请。
 * 产品模型：C 端只有一种用户，任何登录用户都能提交；
 * 只有后台审核通过后，才会建立用户与房源的关联（我的房产/收益/委托才有数据）。
 * 驳回后有明确状态回显，可修改材料重新提交。
 */
interface BindingAttachment {
  name: string;
  url: string;
  size?: number | null;
  content_type?: string | null;
}

interface PropertyBinding {
  id: string;
  kind?: 'claim' | 'new' | null;
  status: 'pending' | 'approved' | 'rejected';
  address: string;
  room_number: string;
  size_sqm?: number | null;
  property_type?: string | null;
  note?: string | null;
  attachments: BindingAttachment[];
  reject_reason?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  matched_property_id?: string | null;
  created_at?: string | null;
}

// 匹配到的系统内已有房源：选中即走「认领」，不选则按「新建房源」提交
interface MatchCandidate {
  property_id: string;
  address: string;
  room_number: string;
  size_sqm?: number | null;
  property_type?: string | null;
}

const PROPERTY_TYPES = ['apartment', 'house', 'condo', 'villa', 'office', 'shop'];

const STATUS_META: Record<string, { labelKey: string; color: string; bg: string }> = {
  pending: { labelKey: 'pb.stPending', color: colors.warning, bg: colors.warningLight },
  approved: { labelKey: 'pb.stApproved', color: colors.success, bg: colors.successLight },
  rejected: { labelKey: 'pb.stRejected', color: colors.error, bg: colors.errorLight },
};

const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
const MAX_SIZE = 20 * 1024 * 1024;

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

const typeLabelKey = (t?: string | null) =>
  PROPERTY_TYPES.includes(String(t)) ? `pb.type.${t}` : 'pb.type.apartment';

const fmtSize = (n?: number | null) => {
  if (!n) return '';
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export default function PropertyBindingScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [items, setItems] = useState<PropertyBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [address, setAddress] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [sizeSqm, setSizeSqm] = useState('');
  const [propertyType, setPropertyType] = useState('apartment');
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<BindingAttachment[]>([]);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [matching, setMatching] = useState(false);
  const [matchSearched, setMatchSearched] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchMine = useCallback(async () => {
    setLoadError(false);
    try {
      const res: any = await propertyBindingsApi.mine();
      const payload = res?.data?.data ?? res?.data;
      setItems(Array.isArray(payload) ? payload : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMine();
  }, [fetchMine]);

  const pending = items.find((i) => i.status === 'pending');
  const approved = items.find((i) => i.status === 'approved');

  const resetMatch = () => {
    setMatches([]);
    setMatchSearched(false);
    setSelectedPropertyId(null);
  };

  const resetForm = () => {
    setAddress('');
    setRoomNumber('');
    setSizeSqm('');
    setPropertyType('apartment');
    setNote('');
    setAttachments([]);
    resetMatch();
  };

  const prefillFrom = (b: PropertyBinding) => {
    setAddress(b.address || '');
    setRoomNumber(b.room_number || '');
    setSizeSqm(b.size_sqm != null ? String(b.size_sqm) : '');
    setPropertyType(b.property_type || 'apartment');
    setNote(b.note || '');
    setAttachments(b.attachments || []);
    // 认领类申请保留原目标；新建类重新匹配
    setMatches([]);
    setMatchSearched(b.kind === 'claim');
    setSelectedPropertyId(b.kind === 'claim' ? b.matched_property_id || null : null);
  };

  const runMatch = async () => {
    if (!address.trim() || !roomNumber.trim()) {
      notify(t('pb.warnMatchFields'));
      return;
    }
    setMatching(true);
    try {
      const res: any = await propertyBindingsApi.match({
        address: address.trim(),
        room_number: roomNumber.trim(),
      });
      const payload = res?.data?.data ?? res?.data;
      const list: MatchCandidate[] = Array.isArray(payload?.items) ? payload.items : [];
      setMatches(list);
      setMatchSearched(true);
      // 命中多个时不替用户决定
      setSelectedPropertyId(null);
    } catch (e) {
      notifyError(t('pb.errMatch'), e);
    } finally {
      setMatching(false);
    }
  };

  // 地址 / 房号变化后旧匹配结果失效
  const changeAddress = (v: string) => {
    setAddress(v);
    resetMatch();
  };

  const changeRoom = (v: string) => {
    setRoomNumber(v);
    resetMatch();
  };

  const handlePickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const assets = result.assets.slice(0, 5);
      for (const a of assets) {
        const name = a.name || `proof${extOf(a.uri || '') || '.jpg'}`;
        if (!ALLOWED_EXT.includes(extOf(name))) {
          notify(t('pb.errUpload'));
          return;
        }
        if ((a.size ?? 0) > MAX_SIZE) {
          notify(t('pb.errUpload'));
          return;
        }
      }
      setUploading(true);
      const uploaded: BindingAttachment[] = [];
      for (const a of assets) {
        const name = a.name || `proof${extOf(a.uri || '') || '.jpg'}`;
        const file = {
          uri: a.uri,
          name,
          type: a.mimeType || 'application/octet-stream',
        } as any;
        const res: any = await propertyBindingsApi.uploadAttachment(file);
        const payload = res?.data?.data ?? res?.data;
        if (!payload?.url) throw new Error('upload failed');
        uploaded.push({
          name: payload.name || name,
          url: payload.url,
          size: payload.size ?? a.size ?? null,
          content_type: payload.content_type || a.mimeType || null,
        });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (e) {
      notifyError(t('pb.errUpload'), e);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!address.trim()) {
      notify(t('pb.warnAddress'));
      return;
    }
    if (!roomNumber.trim()) {
      notify(t('pb.warnRoom'));
      return;
    }
    if (!attachments.length) {
      notify(t('pb.warnAttachments'));
      return;
    }
    setSubmitting(true);
    try {
      await propertyBindingsApi.create({
        // 选中匹配房源 → 认领；未选中 → 新建待审房源
        kind: selectedPropertyId ? 'claim' : 'new',
        property_id: selectedPropertyId || undefined,
        address: address.trim(),
        room_number: roomNumber.trim(),
        size_sqm: sizeSqm.trim() ? Number(sizeSqm) : undefined,
        property_type: propertyType,
        note: note.trim() || undefined,
        attachments,
      });
      notify(t('pb.submitOk'));
      resetForm();
      await fetchMine();
    } catch (e) {
      notifyError(t('pb.errSubmit'), e);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRemove = (url: string) => {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>{t('pb.subtitle')}</Text>

      {approved && (
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.approvedText}>
              {t('pb.approvedHint', { address: `${approved.address} ${approved.room_number}` })}
            </Text>
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => navigation.navigate('OwnerProperties')}
              activeOpacity={0.8}
            >
              <Text style={styles.smallBtnText}>{t('pb.view')}</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}

      <Text style={styles.sectionTitle}>{t('pb.formTitle')}</Text>
      <Card>
        {pending ? (
          <EmptyState
            icon="hourglass-outline"
            title={t('pb.pendingTitle')}
            sub={t('pb.pendingSub')}
          />
        ) : (
          <>
            <Text style={styles.hint}>{t('pb.reviewNotice')}</Text>
            <Text style={styles.label}>{t('pb.fieldAddress')} *</Text>
            <TextInput
              style={styles.input}
              placeholder={t('pb.phAddress')}
              placeholderTextColor={colors.ink3}
              value={address}
              onChangeText={changeAddress}
            />

            <Text style={styles.label}>{t('pb.fieldRoom')} *</Text>
            <TextInput
              style={styles.input}
              placeholder={t('pb.phRoom')}
              placeholderTextColor={colors.ink3}
              value={roomNumber}
              onChangeText={changeRoom}
            />

            {/* 审核准入：先匹配系统内已有房源，命中即认领，未命中才新建 */}
            <View style={styles.matchHeader}>
              <TouchableOpacity
                style={[styles.matchBtn, matching && styles.disabled]}
                onPress={() => void runMatch()}
                disabled={matching}
                activeOpacity={0.8}
              >
                {matching ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.matchBtnText}>{t('pb.matchBtn')}</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.hint}>{t('pb.matchHint')}</Text>
            </View>

            {matchSearched && matches.length === 0 && (
              <Text style={styles.hint}>{t('pb.matchNone')}</Text>
            )}

            {matches.length > 0 && (
              <View style={styles.matchList}>
                <Text style={styles.hint}>{t('pb.matchFound', { n: matches.length })}</Text>
                {matches.map((m) => {
                  const active = selectedPropertyId === m.property_id;
                  return (
                    <TouchableOpacity
                      key={m.property_id}
                      style={[styles.matchItem, active && styles.matchItemActive]}
                      onPress={() => setSelectedPropertyId(m.property_id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={active ? colors.primary : colors.ink3}
                      />
                      <View style={styles.matchItemBody}>
                        <Text style={styles.matchItemTitle} numberOfLines={1}>
                          {m.address} · {m.room_number}
                        </Text>
                        <Text style={styles.matchItemMeta}>
                          {m.size_sqm ? `${m.size_sqm} m² · ` : ''}
                          {t(`pb.type.${m.property_type || 'apartment'}`)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <Text style={styles.hint}>
                  {selectedPropertyId ? t('pb.claimSelected') : t('pb.claimPickHint')}
                </Text>
              </View>
            )}

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Text style={styles.label}>{t('pb.fieldSize')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('pb.phSize')}
                  placeholderTextColor={colors.ink3}
                  value={sizeSqm}
                  onChangeText={setSizeSqm}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.label}>{t('pb.fieldType')}</Text>
            <View style={styles.chipRow}>
              {PROPERTY_TYPES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, propertyType === p && styles.chipActive]}
                  onPress={() => setPropertyType(p)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, propertyType === p && styles.chipTextActive]}>
                    {t(`pb.type.${p}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{t('pb.fieldNote')}</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder={t('pb.phNote')}
              placeholderTextColor={colors.ink3}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={styles.label}>{t('pb.fieldAttachments')} *</Text>
            <Text style={styles.hint}>{t('pb.hintAttachments')}</Text>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => void handlePickFiles()}
              disabled={uploading}
              activeOpacity={0.8}
            >
              {uploading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                  <Text style={styles.uploadText}>{t('pb.upload')}</Text>
                </>
              )}
            </TouchableOpacity>

            {attachments.map((a) => (
              <View key={a.url} style={styles.fileRow}>
                <Ionicons name="document-text-outline" size={16} color={colors.ink2} />
                <Text style={styles.fileName} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={styles.fileSize}>{fmtSize(a.size)}</Text>
                <TouchableOpacity onPress={() => confirmRemove(a.url)} activeOpacity={0.7}>
                  <Text style={styles.removeText}>{t('pb.remove')}</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.submitBtn, (submitting || uploading) && styles.disabled]}
              onPress={() => void handleSubmit()}
              disabled={submitting || uploading}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.submitText}>{t('pb.submit')}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </Card>

      <Text style={styles.sectionTitle}>{t('pb.myApps')}</Text>
      <Card>
        {loading ? (
          <LoadingState label={t('common.loading')} />
        ) : loadError ? (
          <EmptyState
            tone="error"
            title={t('pb.loadFailed')}
            actionLabel={t('common.retry')}
            onAction={() => void fetchMine()}
          />
        ) : items.length === 0 ? (
          <EmptyState icon="document-text-outline" title={t('pb.empty')} sub={t('pb.emptySub')} />
        ) : (
          items.map((b, idx) => {
            const meta = STATUS_META[b.status] ?? STATUS_META.pending;
            return (
              <View key={b.id} style={[styles.appRow, idx < items.length - 1 && styles.rowBorder]}>
                <View style={styles.appTop}>
                  <Text style={styles.appAddress} numberOfLines={1}>
                    {b.address} · {b.room_number}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.badgeText, { color: meta.color }]}>{t(meta.labelKey)}</Text>
                  </View>
                </View>
                <Text style={styles.appMeta}>
                  {t(b.kind === 'claim' ? 'pb.kindClaim' : 'pb.kindNew')}
                  {' · '}
                  {t(typeLabelKey(b.property_type))}
                  {b.size_sqm ? ` · ${b.size_sqm} m²` : ''}
                  {b.created_at ? ` · ${b.created_at.slice(0, 10)}` : ''}
                </Text>
                {b.status === 'rejected' && b.reject_reason ? (
                  <Text style={styles.rejectText}>{b.reject_reason}</Text>
                ) : null}
                {b.status === 'rejected' && (
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => prefillFrom(b)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.smallBtnText}>{t('pb.resubmit')}</Text>
                  </TouchableOpacity>
                )}
                {b.status === 'approved' && (
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => navigation.navigate('OwnerProperties')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.smallBtnText}>{t('pb.view')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingVertical: 8, paddingBottom: 32 },
  subtitle: {
    fontSize: 13,
    color: colors.ink3,
    lineHeight: 20,
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  label: { fontSize: 14, color: colors.text, fontWeight: '500', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  textarea: { minHeight: 80 },
  twoCol: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.sidebarActive },
  chipText: { fontSize: 13, color: colors.ink2 },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.ink3, lineHeight: 18 },
  matchHeader: { marginTop: 12, gap: 6 },
  matchBtn: {
    minHeight: 40,
    borderRadius: colors.radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  matchBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  matchList: { marginTop: 10, gap: 6 },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: colors.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  matchItemActive: { borderColor: colors.primary, backgroundColor: colors.muted },
  matchItemBody: { flex: 1 },
  matchItemTitle: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  matchItemMeta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  uploadBtn: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: colors.radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  uploadText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fileName: { flex: 1, fontSize: 13, color: colors.text },
  fileSize: { fontSize: 12, color: colors.ink3 },
  removeText: { fontSize: 12, color: colors.error },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  disabled: { opacity: 0.6 },
  submitText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  approvedText: { flex: 1, fontSize: 13, color: colors.ink2, lineHeight: 18 },
  smallBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.sidebarActive,
  },
  smallBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  appRow: { paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  appTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appAddress: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
  appMeta: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  rejectText: { fontSize: 12, color: colors.error, marginTop: 4, lineHeight: 18 },
});
