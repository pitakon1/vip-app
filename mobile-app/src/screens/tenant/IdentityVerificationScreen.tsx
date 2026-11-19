/**
 * 实名认证（证件上传 + 人工审核）。
 *
 * 过渡方案：不接人脸识别、不做第三方自动核验；用户上传证件照片 →
 * 运营在后台人工审核 → 本页回显「审核中 / 已通过 / 已驳回（含原因）」。
 * PDPA 同意是提交前置条件，前后端都强校验。
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { identityApi, type IdentityStatus } from '@/services/identityApi';

const DOC_TYPES = ['passport', 'national_id', 'driver_license'] as const;

export default function IdentityVerificationScreen() {
  const { t } = useI18n();
  const [state, setState] = useState<IdentityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<string>('passport');
  const [realName, setRealName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [front, setFront] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [back, setBack] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await identityApi.me());
    } catch {
      setError(t('identity.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pick = async (side: 'front' | 'back') => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (res.canceled || !res.assets.length) return;
    if (side === 'front') setFront(res.assets[0]);
    else setBack(res.assets[0]);
  };

  const submit = async () => {
    if (!consent) {
      setError(t('identity.consentRequired'));
      return;
    }
    if (!realName.trim()) {
      setError(t('identity.realNameRequired'));
      return;
    }
    if (!front) {
      setError(t('identity.fileRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('doc_type', docType);
      form.append('real_name', realName.trim());
      if (idNumber.trim()) form.append('id_number', idNumber.trim());
      form.append('consent', 'true');
      form.append('policy_version', '2026-11');
      form.append('front', {
        uri: front.uri,
        name: front.fileName || 'front.jpg',
        type: front.mimeType || 'image/jpeg',
      } as unknown as Blob);
      if (back) {
        form.append('back', {
          uri: back.uri,
          name: back.fileName || 'back.jpg',
          type: back.mimeType || 'image/jpeg',
        } as unknown as Blob);
      }
      setState(await identityApi.submit(form));
      setFront(null);
      setBack(null);
      setConsent(false);
      setRealName('');
      setIdNumber('');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : t('identity.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const status = state?.status || 'none';
  const canSubmit = status === 'none' || status === 'rejected';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={styles.statusRow}>
        <Text style={styles.title}>{t('identity.title')}</Text>
        <StatusBadge status={status} label={t(`identity.status_${status}`)} />
      </View>
      <Text style={styles.hint}>{t('identity.sub')}</Text>

      {status === 'pending' ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t('identity.pendingTitle')}</Text>
          <Text style={styles.noticeText}>{t('identity.pendingDesc')}</Text>
        </View>
      ) : null}

      {status === 'approved' ? (
        <View style={[styles.notice, styles.noticeOk]}>
          <Text style={styles.noticeTitle}>{t('identity.approvedTitle')}</Text>
          <Text style={styles.noticeText}>
            {t('identity.approvedDesc')
              .replace('{{name}}', state?.real_name || '-')
              .replace('{{masked}}', state?.id_number_masked || '-')}
          </Text>
        </View>
      ) : null}

      {status === 'rejected' ? (
        <View style={[styles.notice, styles.noticeErr]}>
          <Text style={styles.noticeTitle}>{t('identity.rejectedTitle')}</Text>
          <Text style={styles.noticeText}>
            {state?.rejection_reason || t('identity.rejectedNoReason')}
          </Text>
          <Text style={styles.noticeText}>{t('identity.reuploadHint')}</Text>
        </View>
      ) : null}

      {canSubmit ? (
        <>
          <Text style={styles.label}>{t('identity.docType')}</Text>
          <View style={styles.chips}>
            {DOC_TYPES.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, docType === d && styles.chipActive]}
                onPress={() => setDocType(d)}
              >
                <Text style={[styles.chipText, docType === d && styles.chipTextActive]}>
                  {t(`identity.doc_${d}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('identity.realName')}</Text>
          <TextInput
            style={styles.input}
            value={realName}
            onChangeText={setRealName}
            maxLength={100}
            placeholderTextColor={colors.ink3}
          />

          <Text style={styles.label}>{t('identity.idNumber')}</Text>
          <TextInput
            style={styles.input}
            value={idNumber}
            onChangeText={setIdNumber}
            maxLength={64}
            autoCapitalize="characters"
            placeholderTextColor={colors.ink3}
          />

          <Text style={styles.label}>{t('identity.front')}</Text>
          <UploadTile
            asset={front}
            label={t('identity.pickImage')}
            onPress={() => void pick('front')}
          />

          <Text style={styles.label}>{t('identity.backOptional')}</Text>
          <UploadTile
            asset={back}
            label={t('identity.pickImage')}
            onPress={() => void pick('back')}
          />
          <Text style={styles.imageHint}>{t('identity.imageHint')}</Text>

          <TouchableOpacity style={styles.consentRow} onPress={() => setConsent((v) => !v)}>
            <Ionicons
              name={consent ? 'checkbox' : 'square-outline'}
              size={20}
              color={consent ? colors.primary : colors.ink3}
            />
            <Text style={styles.consentText}>{t('identity.consent')}</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
            onPress={() => void submit()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryBtnText}>{t('identity.submit')}</Text>
            )}
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'approved'
      ? colors.success
      : status === 'rejected'
        ? colors.error
        : status === 'pending'
          ? colors.warning
          : colors.ink3;
  return (
    <View style={[styles.badge, { backgroundColor: `${tone}1A` }]}>
      <Text style={[styles.badgeText, { color: tone }]}>{label}</Text>
    </View>
  );
}

function UploadTile({
  asset,
  label,
  onPress,
}: {
  asset: ImagePicker.ImagePickerAsset | null;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.upload} onPress={onPress}>
      {asset ? (
        <Image source={{ uri: asset.uri }} style={styles.thumb} />
      ) : (
        <Ionicons name="add" size={26} color={colors.ink3} />
      )}
      <Text style={styles.uploadText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 13, color: colors.ink2, marginTop: 8, marginBottom: 16, lineHeight: 20 },
  notice: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  noticeOk: { backgroundColor: 'rgba(22,163,74,0.08)' },
  noticeErr: { backgroundColor: 'rgba(220,38,38,0.08)' },
  noticeTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  noticeText: { fontSize: 13, color: colors.ink2, lineHeight: 19 },
  label: { fontSize: 13, color: colors.ink2, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: colors.fieldFill,
    borderWidth: 1,
    borderColor: colors.fieldFillBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  upload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  thumb: { width: 56, height: 40, borderRadius: 6 },
  uploadText: { fontSize: 13, color: colors.ink2 },
  imageHint: { fontSize: 12, color: colors.ink3, marginTop: 8, lineHeight: 18 },
  consentRow: { flexDirection: 'row', gap: 8, marginTop: 18, alignItems: 'flex-start' },
  consentText: { flex: 1, fontSize: 13, color: colors.ink2, lineHeight: 19 },
  error: { color: colors.error, marginTop: 12 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
});
