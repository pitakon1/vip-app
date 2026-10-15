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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  PanResponder,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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
  /** 可选：传入后弹窗顶部出现「印章 / 手写签名」类型切换（通用「签名资产」入口用） */
  onAssetTypeChange?: (type: 'seal' | 'handwrite') => void;
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
  onAssetTypeChange,
}: Props) {
  const { t } = useI18n();
  const [assets, setAssets] = useState<SignAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  // —— 印模上传裁剪：选图后先打开裁剪 Modal 再提交 ——
  const [cropUri, setCropUri] = useState<string | null>(null);
  // —— 印章制作方式：template(系统模板生成公章) | imprint(上传实章/印模) ——
  const [makeMode, setMakeMode] = useState<'template' | 'imprint'>('imprint');
  const [companyName, setCompanyName] = useState('');
  const [middleText, setMiddleText] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [generating, setGenerating] = useState(false);

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

  const middleTextDefault = () => t('contract.middleTextDefault');

  useEffect(() => {
    if (visible) {
      setName('');
      // 重置模板制作表单（默认中心文字取「测试印章」占位文案）
      setCompanyName('');
      setMiddleText(middleTextDefault());
      setGeneratedUrl('');
      void load();
    } else {
      setAssets([]);
    }
  }, [visible, load, t]);

  // 模板制作：调开放签对齐的生成公章接口，出透明底 PNG data URL 并本地预览
  const generateTemplateSeal = async () => {
    const cn = companyName.trim();
    if (!cn) {
      notify(t('contract.companyNameRequired'));
      return;
    }
    setGenerating(true);
    try {
      const res: any = await signAssetsApi.generateSeal({
        name: cn,
        company_name: cn,
        middle_text: middleText.trim() || middleTextDefault(),
        size: 260,
      });
      const url = res?.data?.data_url;
      if (!url) {
        notify(t('contract.generateSealFail'));
        return;
      }
      setGeneratedUrl(url);
      notify(t('contract.generateSealDone'));
    } catch (e) {
      notifyError(t('contract.generateSealFail'), e);
    } finally {
      setGenerating(false);
    }
  };

  // 「使用此印章」：把生成的公章 data_url 作为当前印章回传父级用于签署
  const useGeneratedSeal = () => {
    if (!generatedUrl) return;
    onSelect({
      id: '',
      name: companyName.trim() || t('contract.mySeals'),
      asset_type: 'seal',
      source: 'imprint',
      data_url: generatedUrl,
    });
    onClose();
  };

  const pickSealScan = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      // 拿到本地 uri 后先打开裁剪 Modal，确认后才转 base64 上传
      setCropUri(result.assets[0].uri);
    } catch (e) {
      notifyError(t('contract.uploadSealScan'), e);
    }
  };

  // 裁剪确认：expo-image-manipulator 裁剪 → 转 raw base64 → 交给印模接口
  const applyCropAndUpload = async (rawBase64: string) => {
    const b64 = rawBase64.replace(/^data:[^;]+;base64,/, '');
    if (!b64) {
      notify(t('contract.intentFailed'));
      setCropUri(null);
      return;
    }
    const nm = name.trim() || t('contract.mySeals');
    setBusy(true);
    try {
      await signAssetsApi.imprint({ name: nm, image_base64: b64 });
      notify(t('contract.assetSaved'));
      setName('');
      await load();
    } catch (e) {
      notifyError(t('contract.uploadSealScan'), e);
    } finally {
      setBusy(false);
      setCropUri(null);
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

          {!!onAssetTypeChange && (
            <View style={styles.modeTabs}>
              {(['seal', 'handwrite'] as const).map((tp) => (
                <TouchableOpacity
                  key={tp}
                  style={[styles.modeTab, assetType === tp && styles.modeTabActive]}
                  activeOpacity={0.8}
                  onPress={() => onAssetTypeChange(tp)}
                >
                  <Text style={[styles.modeTabText, assetType === tp && styles.modeTabTextActive]}>
                    {tp === 'seal' ? t('contract.mySeals') : t('contract.mySigns')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              placeholder={t('contract.assetNamePh')}
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.ink3}
            />

            {assetType === 'seal' && (
              <>
                {/* 制作印章：模板制作 / 印模上传 并列切换 */}
                <View style={styles.modeTabs}>
                  <TouchableOpacity
                    style={[styles.modeTab, makeMode === 'template' && styles.modeTabActive]}
                    activeOpacity={0.8}
                    onPress={() => setMakeMode('template')}
                  >
                    <Text style={[styles.modeTabText, makeMode === 'template' && styles.modeTabTextActive]}>
                      {t('contract.templateMode')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeTab, makeMode === 'imprint' && styles.modeTabActive]}
                    activeOpacity={0.8}
                    onPress={() => setMakeMode('imprint')}
                  >
                    <Text style={[styles.modeTabText, makeMode === 'imprint' && styles.modeTabTextActive]}>
                      {t('contract.imprintMode')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {makeMode === 'template' ? (
                  <View>
                    <Text style={styles.fieldLabel}>{t('contract.companyName')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('contract.companyNamePh')}
                      value={companyName}
                      onChangeText={setCompanyName}
                      placeholderTextColor={colors.ink3}
                    />
                    <Text style={styles.fieldLabel}>{t('contract.middleText')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('contract.middleTextPh')}
                      value={middleText}
                      onChangeText={setMiddleText}
                      placeholderTextColor={colors.ink3}
                    />
                    <Text style={styles.fieldLabel}>{t('contract.sealStyle')}</Text>
                    <View style={styles.styleChip}>
                      <Text style={styles.styleChipText}>{t('contract.sealStyleGongzhang')}</Text>
                    </View>

                    {!!generatedUrl && (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: generatedUrl }} style={styles.previewImg} resizeMode="contain" />
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.addBtn, (generating || busy) && styles.btnDisabled]}
                      activeOpacity={0.8}
                      disabled={generating || busy}
                      onPress={generateTemplateSeal}
                    >
                      {generating ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="color-wand-outline" size={15} color={colors.primary} />
                          <Text style={styles.addBtnText}>{t('contract.generatePreview')}</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {!!generatedUrl && (
                      <TouchableOpacity
                        style={[styles.useBtn, busy && styles.btnDisabled]}
                        activeOpacity={0.8}
                        disabled={busy}
                        onPress={useGeneratedSeal}
                      >
                        <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                        <Text style={styles.useBtnText}>{t('contract.useThisSeal')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
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
              </>
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
      {!!cropUri && (
        <CropModal
          uri={cropUri}
          busy={busy}
          onCancel={() => setCropUri(null)}
          onConfirm={applyCropAndUpload}
        />
      )}
    </Modal>
  );
}

/**
 * 印模上传的裁剪/旋转/缩放编辑器。
 * 在 1:1 容器内展示原图，叠加可拖拽的方形选区；内部完成屏幕坐标 -> 原图像素的换算，
 * 确认后用 expo-image-manipulator 依次 crop -> rotate -> resize(400x400) 输出 raw base64。
 * 所有坐标仅在内部计算，界面不显示裸数字。
 */
function CropModal({
  uri,
  busy,
  onCancel,
  onConfirm,
}: {
  uri: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (rawBase64: string) => void;
}) {
  const { t } = useI18n();
  const BOX = Math.min(Dimensions.get('window').width - 48, 340);
  const [rotation, setRotation] = useState(0);
  const [natW, setNatW] = useState(0);
  const [natH, setNatH] = useState(0);
  const [box, setBox] = useState({ x: 0, y: 0 });
  const [cropSize, setCropSize] = useState(0);
  const [preparing, setPreparing] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const startBoxRef = useRef({ x: 0, y: 0 });

  // 读取原图固有尺寸（像素）
  useEffect(() => {
    let alive = true;
    setPreparing(true);
    setNatW(0);
    setNatH(0);
    setRotation(0);
    Image.getSize(
      uri,
      (w, h) => {
        if (alive) {
          setNatW(w);
          setNatH(h);
        }
      },
      () => {
        if (alive) setPreparing(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  const rot90 = rotation % 180 !== 0;
  const effW = rot90 ? natH : natW;
  const effH = rot90 ? natW : natH;

  const layout = useMemo(() => {
    if (!natW || !natH) return null;
    const scale = Math.min(BOX / effW, BOX / effH);
    const dispW = effW * scale;
    const dispH = effH * scale;
    const dispX = (BOX - dispW) / 2;
    const dispY = (BOX - dispH) / 2;
    const minDim = Math.min(dispW, dispH);
    return { scale, dispW, dispH, dispX, dispY, minDim };
  }, [natW, natH, rotation, BOX, effW, effH]);

  // 就绪/旋转后：把选区重置为居中的最大内接正方形
  useEffect(() => {
    if (!layout) return;
    const cs = layout.minDim;
    setCropSize(cs);
    setBox({ x: layout.dispX + (layout.dispW - cs) / 2, y: layout.dispY + (layout.dispH - cs) / 2 });
    setPreparing(false);
  }, [layout]);

  const clampBox = useCallback(
    (nx: number, ny: number, cs: number) => {
      if (!layout) return { x: nx, y: ny };
      const maxX = layout.dispX + layout.dispW - cs;
      const maxY = layout.dispY + layout.dispH - cs;
      return {
        x: Math.max(layout.dispX, Math.min(nx, maxX)),
        y: Math.max(layout.dispY, Math.min(ny, maxY)),
      };
    },
    [layout],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startBoxRef.current = box;
        },
        onPanResponderMove: (_e, g) => {
          const s = startBoxRef.current;
          setBox(clampBox(s.x + g.dx, s.y + g.dy, cropSize));
        },
      }),
    [box, cropSize, clampBox],
  );

  const rotateRight = () => setRotation((r) => (r + 90) % 360);
  const rotateLeft = () => setRotation((r) => (r + 270) % 360);

  const zoomIn = () => {
    if (!layout) return;
    const cs = Math.max(layout.minDim * 0.2, cropSize * 0.8);
    const nx = box.x + (cropSize - cs) / 2;
    const ny = box.y + (cropSize - cs) / 2;
    setCropSize(cs);
    setBox(clampBox(nx, ny, cs));
  };
  const zoomOut = () => {
    if (!layout) return;
    const cs = Math.min(layout.minDim, cropSize * 1.25);
    const nx = box.x + (cropSize - cs) / 2;
    const ny = box.y + (cropSize - cs) / 2;
    setCropSize(cs);
    setBox(clampBox(nx, ny, cs));
  };

  const doConfirm = async () => {
    if (!layout) return;
    setConfirming(true);
    try {
      const effX = (box.x - layout.dispX) / layout.scale;
      const effY = (box.y - layout.dispY) / layout.scale;
      const dim = cropSize / layout.scale;
      // 旋转后的有效坐标 -> 原图坐标（旋转动作在原图之上进行）
      let originX = effX;
      let originY = effY;
      if (rotation === 90) {
        originX = effY;
        originY = natH - effX - dim;
      } else if (rotation === 180) {
        originX = natW - effX - dim;
        originY = natH - effY - dim;
      } else if (rotation === 270) {
        originX = natW - effY - dim;
        originY = effX;
      }
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop: { originX: Math.round(originX), originY: Math.round(originY), width: Math.round(dim), height: Math.round(dim) } },
          { rotate: rotation },
          { resize: { width: 400, height: 400 } },
        ],
        { base64: true, compress: 0.9 },
      );
      if (result.base64) onConfirm(result.base64);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.cropMask}>
        <View style={styles.cropCard}>
          <Text style={styles.cropTitle}>{t('contract.cropSeal')}</Text>
          <Text style={styles.cropHint}>{t('contract.cropHint')}</Text>

          {preparing || !layout ? (
            <View style={[styles.cropBox, styles.cropBoxCenter]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={[styles.cropBox, { width: BOX, height: BOX }]}>
              <Image
                source={{ uri }}
                style={{
                  position: 'absolute',
                  left: layout.dispX,
                  top: layout.dispY,
                  width: layout.dispW,
                  height: layout.dispH,
                  transform: [{ rotate: `${rotation}deg` }],
                }}
                resizeMode="stretch"
              />
              {/* 选区外的遮罩（四块） */}
              <View style={[styles.cropShadeC, { left: 0, right: 0, top: 0, bottom: 0 }]}>
                <View style={[styles.cropShade, { height: box.y }]} />
                <View style={[styles.cropShade, { top: box.y + cropSize, bottom: 0, left: 0, right: 0 }]} />
                <View style={[styles.cropShade, { top: box.y, height: cropSize, width: box.x }]} />
                <View style={[styles.cropShade, { top: box.y, height: cropSize, left: box.x + cropSize, right: 0 }]} />
              </View>
              <View
                style={[styles.cropSel, { left: box.x, top: box.y, width: cropSize, height: cropSize }]}
                {...pan.panHandlers}
              >
                <View style={[styles.cropCorner, styles.cropCornerTL]} />
                <View style={[styles.cropCorner, styles.cropCornerTR]} />
                <View style={[styles.cropCorner, styles.cropCornerBL]} />
                <View style={[styles.cropCorner, styles.cropCornerBR]} />
                <Ionicons name="move-outline" size={20} color="#fff" style={styles.cropMoveIcon} />
              </View>
            </View>
          )}

          <View style={styles.cropControls}>
            <TouchableOpacity style={styles.cropControlBtn} activeOpacity={0.8} onPress={rotateLeft}>
              <Ionicons name="refresh-outline" size={18} color={colors.ink} />
              <Text style={styles.cropControlText}>{t('contract.rotateSeal')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cropControlBtn} activeOpacity={0.8} onPress={zoomOut} disabled={!layout}>
              <Ionicons name="remove-outline" size={18} color={colors.ink} />
              <Text style={styles.cropControlText}>{t('contract.zoomOut')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cropControlBtn} activeOpacity={0.8} onPress={zoomIn} disabled={!layout}>
              <Ionicons name="add-outline" size={18} color={colors.ink} />
              <Text style={styles.cropControlText}>{t('contract.zoomIn')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cropActions}>
            <TouchableOpacity style={styles.cropCancelBtn} activeOpacity={0.8} onPress={onCancel} disabled={confirming || busy}>
              <Text style={styles.cropCancelText}>{t('contract.cancelCrop')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cropApplyBtn, (confirming || busy) && styles.btnDisabled]}
              activeOpacity={0.8}
              onPress={doConfirm}
              disabled={confirming || busy || !layout}
            >
              {confirming || busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={16} color="#fff" />
                  <Text style={styles.cropApplyText}>{t('contract.applyCrop')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
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
  modeTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeTabActive: { borderColor: colors.primary, backgroundColor: colors.surface },
  modeTabText: { fontSize: 14, fontWeight: '600', color: colors.ink3 },
  modeTabTextActive: { color: colors.primary },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.ink3, marginBottom: 6, marginTop: 2 },
  styleChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    marginBottom: 14,
  },
  styleChipText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  previewWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    paddingVertical: 18,
    marginBottom: 14,
  },
  previewImg: { width: 132, height: 132 },
  useBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    marginBottom: 14,
  },
  useBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
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

  // —— 印模上传裁剪 Modal ——
  cropMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  cropCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 20,
  },
  cropTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 4 },
  cropHint: { fontSize: 12, color: colors.ink3, textAlign: 'center', marginBottom: 16 },
  cropBox: {
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: colors.radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  cropBoxCenter: { alignItems: 'center', justifyContent: 'center' },
  cropShadeC: { position: 'absolute' },
  cropShade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)' },
  cropSel: { position: 'absolute', borderWidth: 1.5, borderColor: '#ffffff' },
  cropCorner: { position: 'absolute', width: 18, height: 18, borderColor: '#ffffff' },
  cropCornerTL: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
  cropCornerTR: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
  cropCornerBL: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
  cropCornerBR: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
  cropMoveIcon: { alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto', opacity: 0.9 },
  cropControls: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16 },
  cropControlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  cropControlText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  cropActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cropCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cropCancelText: { fontSize: 14, fontWeight: '700', color: colors.ink2 },
  cropApplyBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
  },
  cropApplyText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});