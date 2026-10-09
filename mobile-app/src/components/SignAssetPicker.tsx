/**
 * 「我的签名/印章」库选择弹窗（对齐开放签）。
 *
 * 展示当前用户的签名资产库（手写签名 handwrite / 印章 seal），可从中选取一个
 * 直接用于签署（onSelect 回传该资产），也支持：
 *  - 把当前已绘制的手写签名存入库（source=drew，接收 SVG 转 data URL）；
 *  - 上传印章扫描图走印模接口（source=imprint，后端自动透明抠图）；
 *  - 删除某个资产。
 * 文本走 i18n 三语；图标一律 Ionicons（不用 emoji）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import colors from '@/theme/colors';
import { signAssetsApi, type SignAsset } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  assetType: 'handwrite' | 'seal';
  /** 选择某个已有资产后回调（父级用其 data_url 签署） */
  onSelect: (asset: SignAsset) => void;
  /** 允许保存当前手写签名（svg）到库；仅 assetType=handwrite 时展示 */
  pendingDrawnSvg?: string;
  /** 保存手写签名后的提示动作（父级可刷新其签名来源） */
  onSaved?: () => void;
}

const svgToDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export default function SignAssetPicker({
  visible,
  onClose,
  assetType,
  onSelect,
  pendingDrawnSvg,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const [assets, setAssets] = useState<SignAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const res: any = await signAssetsApi.list(assetType);
      const data = res?.data;
      setAssets(Array.isArray(data) ? data : data?.items ?? data?.data ?? []);
    } catch (e) {
      notifyError(t('contract.loadFail'), e);
    } finally {
      setLoading(false);
    }
  }, [visible, assetType, t]);

  useEffect(() => {
    if (visible) {
      setName('');
      void load();
    } else {
      setAssets([]);
    }
  }, [visible, load]);

  const pickSealScan = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const b64 = result.assets[0]?.base64;
      if (!b64) {
        notify(t('contract.intentFailed'));
        return;
      }
      const nm = name.trim() || t('contract.mySeals');
      setBusy(true);
      await signAssetsApi.imprint({ name: nm, image_base64: b64 });
      notify(t('contract.assetSaved'));
      setName('');
      await load();
    } catch (e) {
      notifyError(t('contract.uploadSealScan'), e);
    } finally {
      setBusy(false);
    }
  };

  const saveDrawn = async () => {
    if (!pendingDrawnSvg) return;
    try {
      setBusy(true);
      const nm = name.trim() || t('contract.mySigns');
      await signAssetsApi.create({
        name: nm,
        asset_type: 'handwrite',
        source: 'drew',
        data_url: svgToDataUrl(pendingDrawnSvg),
      });
      notify(t('contract.assetSaved'));
      setName('');
      onSaved?.();
      await load();
    } catch (e) {
      notifyError(t('contract.addAsset'), e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      setBusy(true);
      await signAssetsApi.remove(id);
      notify(t('contract.assetDeleted'));
      setAssets((prev) => prev.filter((a) => String(a.id) !== String(id)));
    } catch (e) {
      notifyError(t('contract.assetDeleted'), e);
    } finally {
      setBusy(false);
    }
  };

  const title =
    assetType === 'seal' ? t('contract.pickSeal') : assetType === 'handwrite' ? t('contract.pickSignature') : t('contract.signAssets');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.mask}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              placeholder={t('contract.assetNamePh')}
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.ink3}
            />

            {assetType === 'seal' && (
              <TouchableOpacity
                style={[styles.addBtn, busy && styles.btnDisabled]}
                activeOpacity={0.8}
                disabled={busy}
                onPress={pickSealScan}
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={15} color={colors.primary} />
                    <Text style={styles.addBtnText}>{t('contract.uploadSealScan')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {assetType === 'handwrite' && !!pendingDrawnSvg && (
              <TouchableOpacity
                style={[styles.addBtn, busy && styles.btnDisabled]}
                activeOpacity={0.8}
                disabled={busy}
                onPress={saveDrawn}
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={15} color={colors.primary} />
                    <Text style={styles.addBtnText}>{t('contract.saveDrawnSign')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <Text style={styles.sectionLabel}>
              {assetType === 'seal' ? t('contract.mySeals') : t('contract.mySigns')}
            </Text>
            {loading ? (
              <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : assets.length ? (
              assets.map((a) => (
                <View key={String(a.id)} style={styles.assetRow}>
                  <TouchableOpacity
                    style={styles.assetMain}
                    activeOpacity={0.8}
                    onPress={() => {
                      onSelect(a);
                      onClose();
                    }}
                  >
                    {a.data_url ? (
                      <Image source={{ uri: a.data_url }} style={styles.thumb} resizeMode="contain" />
                    ) : (
                      <Ionicons
                        name={a.asset_type === 'seal' ? 'business-outline' : 'create-outline'}
                        size={20}
                        color={colors.primary}
                      />
                    )}
                    <View style={styles.assetBody}>
                      <Text style={styles.assetName} numberOfLines={1}>{a.name || t('contract.unknown')}</Text>
                      {!!a.created_at && (
                        <Text style={styles.assetMeta}>{new Date(a.created_at).toLocaleDateString()}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.delBtn}
                    activeOpacity={0.7}
                    disabled={busy}
                    onPress={() => remove(String(a.id))}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>{t('contract.emptyAssets')}</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '82%',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 12,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  btnDisabled: { opacity: 0.6 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.ink3, marginBottom: 8 },
  center: { paddingVertical: 24, alignItems: 'center' },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  assetMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    padding: 10,
  },
  thumb: { width: 40, height: 40, borderRadius: colors.radius.sm, backgroundColor: colors.surface },
  assetBody: { flex: 1, minWidth: 0 },
  assetName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  assetMeta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  delBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 13, color: colors.ink3, textAlign: 'center', paddingVertical: 24 },
});