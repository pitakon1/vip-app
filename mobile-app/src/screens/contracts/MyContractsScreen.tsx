/**
 * 租客 / 业主「我的合同」签署页（只读为主）。
 *
 * 列出当前用户可见的合同（contractsApi.list：本人作为签署方或挂在本人租约下）。
 * 详情页展示签署方；仅当「当前用户是签署方且尚未签署」时显示「签署」按钮。
 * 非本人或已签署只读展示。文本走 i18n 三语。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Image,
  TextInput,
  PanResponder,
  useWindowDimensions,
  type PanResponderInstance,
  type DimensionValue,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import SignaturePad from '@/components/SignaturePad';
import SignAssetPicker from '@/components/SignAssetPicker';
import { contractsApi, signAssetsApi, type SignAsset } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/i18n';

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '-');

// 签署意愿二次验证：验证码重发倒计时（秒）
const RESEND_SECONDS = 60;

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
  rejected: { color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
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
  // PDF 页图预览：页号 → 可被 <Image> 加载的 URL；padEpoch 用于「重签」时重挂载画布
  const [pdfUrls, setPdfUrls] = useState<Record<number, string>>({});
  const [padEpoch, setPadEpoch] = useState(0);

  // 自由拖签：托盘当前工具 + 正在放置/签署的草稿区 + 各页渲染尺寸
  const [tool, setTool] = useState<'signature' | 'seal' | 'date' | null>(null);
  const [draft, setDraft] = useState<any>(null); // {page,x,y,w,h,field_type}
  const [signingSel, setSigningSel] = useState(false);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const pageSizesRef = useRef<Record<number, { w: number; h: number }>>({});
  const draftRef = useRef<any>(draft);
  draftRef.current = draft;
  const pagePanCache = useRef<Record<number, PanResponderInstance>>({});

  // ===== 对齐开放签：签署意愿二次验证 / 拒签 / 签名库 =====
  const [intentVisible, setIntentVisible] = useState(false);
  const [intentToMasked, setIntentToMasked] = useState('');
  const [intentCode, setIntentCode] = useState('');
  const [intentCountdown, setIntentCountdown] = useState(0);
  const [intentBusy, setIntentBusy] = useState(false);
  const pendingSignRef = useRef<((code: string) => Promise<void>) | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 已通过验证的合同 id → 复用验证码（同一合同内多次签署不再重复发码）
  const verifiedForRef = useRef<{ contractId: string; code: string } | null>(null);

  const [showDecline, setShowDecline] = useState(false);
  const [declinePartyId, setDeclinePartyId] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declineBusy, setDeclineBusy] = useState(false);

  // 签名库选择弹窗
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryAssetType, setLibraryAssetType] = useState<'handwrite' | 'seal'>('handwrite');

  // ===== 开放签双栏「签署台」：左侧配置栏 + 右侧文档区 =====
  const [studioVisible, setStudioVisible] = useState(false);
  const [signMethod, setSignMethod] = useState<'position' | 'keyword'>('position');
  // 当前使用的印章/手写签名资产
  const [sealAsset, setSealAsset] = useState<SignAsset | null>(null);
  const [signAsset, setSignAsset] = useState<SignAsset | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  // 关键字模式
  const [kwKeyword, setKwKeyword] = useState('');
  const [kwHits, setKwHits] = useState<any[]>([]);
  const [kwCount, setKwCount] = useState(0);
  const [kwSearchBusy, setKwSearchBusy] = useState(false);
  const [kwBusyIdx, setKwBusyIdx] = useState<number | null>(null);
  // 手写签名临时画板
  const [showDrawPad, setShowDrawPad] = useState(false);

  const isWide = useWindowDimensions().width >= 720;

  // 打开签署台：沿用 detail + signField + draft 等既有签署状态
  const openStudio = useCallback((f?: any) => {
    setSignatureSvg('');
    setSignField(f ?? null);
    setDraft(null);
    setTool(null);
    setSignMethod('position');
    setKwKeyword('');
    setKwHits([]);
    setKwCount(0);
    setStudioVisible(true);
  }, []);

  const loadAssets = useCallback(async () => {
    if (!studioVisible) return;
    setAssetLoading(true);
    try {
      const [sealRes, signRes]: any = await Promise.all([
        signAssetsApi.list('seal'),
        signAssetsApi.list('handwrite'),
      ]);
      const toList = (d: any) => {
        const data = d?.data;
        return Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      };
      const seals: SignAsset[] = toList(sealRes);
      const signs: SignAsset[] = toList(signRes);
      setSealAsset(seals[0] ?? null);
      setSignAsset(signs[0] ?? null);
    } catch {
      // 资产加载失败不阻塞签署
    } finally {
      setAssetLoading(false);
    }
  }, [studioVisible]);

  useEffect(() => {
    if (studioVisible) void loadAssets();
  }, [studioVisible, loadAssets]);

  const closeStudio = () => {
    setStudioVisible(false);
    setSignField(null);
    setDraft(null);
    setSignatureSvg('');
    setTool(null);
    setKwHits([]);
    setKwCount(0);
  };

  // 关键字检索（签署方视角：用于「落区」定位）
  const doKeywordSearchMy = async () => {
    if (!detail?.id || !kwKeyword.trim()) {
      notify(t('contract.insert'));
      return;
    }
    setKwSearchBusy(true);
    try {
      const res: any = await contractsApi.keywordSearch(detail.id, kwKeyword.trim());
      const data = res?.data ?? {};
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      setKwHits(hits);
      setKwCount(Number(data?.count ?? hits.length));
    } catch (e) {
      notifyError(t('contract.keywordSign'), e);
    } finally {
      setKwSearchBusy(false);
    }
  };

  // 命中某项 → 在文档该页「落框」（用命中坐标 0-100%，不暴露给用户）
  const placeKeywordHit = (hit: any) => {
    const ft = tool ?? (sealAsset && !signAsset ? 'seal' : 'signature');
    const page = Number(hit?.page) || 1;
    const w = draftW(ft);
    const h = draftH(ft);
    setSignatureSvg(
      (ft === 'seal' && sealAsset?.data_url) || (ft === 'signature' && signAsset?.data_url) || '',
    );
    setDraft({
      page,
      x: Number(hit?.x ?? 50),
      y: Number(hit?.y ?? 40),
      w,
      h,
      field_type: ft,
    });
  };

  const useSealAsset = (a: SignAsset) => {
    setSealAsset(a);
    setTool('seal');
    setSignatureSvg(a.data_url);
  };
  const useSignAsset = (a: SignAsset) => {
    setSignAsset(a);
    setTool('signature');
    setSignatureSvg(a.data_url);
  };
  const clearSeal = () => {
    setSealAsset(null);
    setSignatureSvg('');
  };
  const clearSign = () => {
    setSignAsset(null);
    setSignatureSvg('');
  };

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

  // PDF 可签时：涉及「我」的签署框所在的页面列表（升序、去重）
  const myFieldPages: number[] = (() => {
    if (!detail?.pdf_available) return [];
    const pages = [...myPendingFields, ...mySignedFields]
      .map((f: any) => Number(f?.page) || 1)
      .filter((p: number) => p > 0);
    return [...new Set(pages)].sort((a: number, b: number) => a - b);
  })();

  // 页图展示范围：无「我的」签署框时也需整本 PDF 可拖签 → 回退到全部页
  const pagesToShow: number[] = (() => {
    if (myFieldPages.length) return myFieldPages;
    const cnt = Number(detail?.pdf_page_count) || 1;
    return Array.from({ length: Math.max(1, cnt) }, (_, i) => i + 1);
  })();

  // 取某一页上「我」的所有签署框（待签 + 已签），用于叠加定位
  const fieldsOnPage = useCallback(
    (page: number) =>
      [...myPendingFields, ...mySignedFields].filter(
        (f: any) => (Number(f?.page) || 1) === page,
      ),
    [myPendingFields, mySignedFields],
  );

  // 加载需要展示的页图 URL（站内合同带 ?token=）
  useEffect(() => {
    if (!detail?.pdf_available || !detail?.id) {
      setPdfUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const map: Record<number, string> = {};
      for (const p of pagesToShow) {
        try {
          const url = await contractsApi.pdfPageUrl(detail.id, p);
          if (cancelled) return;
          if (url) map[p] = url;
        } catch {
          // 单页加载失败跳过，不影响其它页
        }
      }
      if (!cancelled) setPdfUrls(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [detail?.id, detail?.pdf_available, pagesToShow.join(',')]);

  const handleSign = async (code?: string) => {
    if (!detail?.id || !signField || signing) return;
    const method = signField?.field_type || 'signature';
    setSigning(true);
    try {
      await contractsApi.sign(detail.id, {
        field_id: String(signField.id),
        method,
        ...(signatureSvg ? { signature_svg: signatureSvg } : {}),
        ...(code ? { code } : {}),
      });
      notify(t('contract.signSingleDone'));
      setSignField(null);
      setSignatureSvg('');
      verifiedForRef.current = null;
      await openDetail(detail.id);
      await load(true);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        notifyError(t('contract.realNameDenied'), e);
      } else if (e?.response?.status === 400) {
        notifyError(t('contract.intentCodeWrong'), e);
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
    if (detail?.pdf_available) {
      setStudioVisible(true);
      setDraft(null);
      setTool(null);
      setSignMethod('position');
      setKwKeyword('');
      setKwHits([]);
      setKwCount(0);
    }
  };

  // 页面百分比尺寸换算：x/y/w/h 均为 0-100 的百分比。缺失时按类型给默认框大小。
  const fieldBox = (f: any) => {
    const ft = f?.field_type || 'signature';
    const defaultW = ft === 'signature' ? 22 : 13;
    const defaultH = ft === 'signature' ? 8 : 6;
    return {
      left: `${Number(f?.x) || 0}%` as DimensionValue,
      top: `${Number(f?.y) || 0}%` as DimensionValue,
      width: `${f?.w != null ? Number(f.w) : defaultW}%` as DimensionValue,
      height: `${f?.h != null ? Number(f.h) : defaultH}%` as DimensionValue,
    };
  };

  // ===== 自由拖签（法大大式）：从顶部托盘选签名/公章/日期，拖到 PDF 任意位置落区并签 =====
  const draftW = (ft?: string | null) => (ft === 'seal' || ft === 'date' ? 13 : 22);
  const draftH = (ft?: string | null) => (ft === 'seal' || ft === 'date' ? 6 : 8);

  // 屏幕触点到「第 page 页容器」的相对 px → 换算为 %，写回 draft
  const placeDraftAt = useCallback((page: number, relXpx: number, relYpx: number, ft: string) => {
    const size = pageSizesRef.current[page];
    if (!size || !size.w || !size.h) return;
    const wPct = draftW(ft);
    const hPct = draftH(ft);
    const bw = (size.w * wPct) / 100;
    const bh = (size.h * hPct) / 100;
    let x = ((relXpx - bw / 2) / size.w) * 100;
    let y = (page === 1 ? (relYpx - bh / 2) / size.h : (relYpx - bh / 2) / size.h) * 100;
    // 翻转：触点在顶部时 y 小；RN locationY 从顶向下，PDF 落章也按顶部起算，直接映射即可
    x = Math.max(0, Math.min(100 - wPct, x));
    y = Math.max(0, Math.min(100 - hPct, y));
    setDraft({ page, x, y, w: Number(wPct.toFixed(1)), h: Number(hPct.toFixed(1)), field_type: ft });
  }, []);

  const panAnchorRef = useRef<{ page: number; sx: number; sy: number } | null>(null);

  // 某一页的拖拽响应：按该页容器内位置换算 %；每页独立闭包 page
  const getPagePan = useCallback(
    (page: number) => {
      if (pagePanCache.current[page]) return pagePanCache.current[page];
      const pan = PanResponder.create({
        onStartShouldSetPanResponder: () => toolRef.current != null,
        onMoveShouldSetPanResponder: () => toolRef.current != null,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          panAnchorRef.current = {
            page,
            sx: evt.nativeEvent.locationX,
            sy: evt.nativeEvent.locationY,
          };
          // 落一个即时预览框（跟随手指）
          const ft = toolRef.current || 'signature';
          placeDraftAt(page, evt.nativeEvent.locationX, evt.nativeEvent.locationY, ft);
        },
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          const a = panAnchorRef.current;
          const ft = toolRef.current;
          if (!a || a.page !== page || !ft) return;
          placeDraftAt(page, a.sx + g.dx, a.sy + g.dy, ft);
        },
        onPanResponderRelease: () => {
          const ft = toolRef.current;
          panAnchorRef.current = null;
          setTool(null); // 结束放置模式；draft 保留供签署
          if (ft) setSigningSel(true);
        },
        onPanResponderTerminate: () => {
          panAnchorRef.current = null;
          setTool(null);
        },
      });
      pagePanCache.current[page] = pan;
      return pan;
    },
    [placeDraftAt],
  );

  const onPageLayout = (page: number) => (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    pageSizesRef.current[page] = { w: width, h: height };
  };

  // 在页面上渲染的草稿签署框（拖放后待签署）
  const renderDraftOverlay = (page: number) => {
    if (!draft || Number(draft.page) !== page) return null;
    const ft = draft.field_type || 'signature';
    const meta = SIGN_TYPE_META[ft] ?? SIGN_TYPE_META.signature;
    return (
      <View style={[styles.fieldOverlay, styles.draftOverlay, fieldBox(draft)]}>
        {ft === 'signature' ? (
          <SignaturePad
            key={`draft-${padEpoch}`}
            fill
            showClear={false}
            title={myParty?.name}
            onResult={setSignatureSvg}
          />
        ) : (
          <View style={styles.overlayType}>
            <Ionicons name={meta.icon as any} size={16} color={colors.primary} />
            <Text style={styles.overlayTypeText}>{t(meta.labelKey)}</Text>
          </View>
        )}
      </View>
    );
  };

  // 确认签署草稿区（落区并签）
  const handleSignSelf = async (code?: string) => {
    if (!detail?.id || !myParty || !draft || signingSel) return;
    setSigningSel(true);
    try {
      const ft = draft.field_type || 'signature';
      await contractsApi.signSelf(detail.id, {
        party_id: String(myParty.id),
        page: Number(draft.page) || 1,
        x: Number(draft.x) || 0,
        y: Number(draft.y) || 0,
        w: Number(draft.w) || draftW(ft),
        h: Number(draft.h) || draftH(ft),
        method: ft,
        ...(signatureSvg ? { signature_svg: signatureSvg } : {}),
        ...(code ? { code } : {}),
      });
      notify(t('contract.signSingleDone'));
      setDraft(null);
      setTool(null);
      setSignatureSvg('');
      verifiedForRef.current = null;
      await openDetail(detail.id);
      await load(true);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        notifyError(t('contract.realNameDenied'), e);
      } else if (e?.response?.status === 400) {
        notifyError(t('contract.intentCodeWrong'), e);
      } else {
        notifyError(t('contract.signSelf'), e);
      }
    } finally {
      setSigningSel(false);
    }
  };

  // ===== 签署意愿验证：确认签署前先发码校验，同合同会话内复用已验证码 =====
  const startSignedFlow = useCallback(
    (doSign: (code: string) => Promise<void>) => {
      const cached = verifiedForRef.current;
      if (cached && cached.contractId === String(detail?.id)) {
        void doSign(cached.code);
        return;
      }
      pendingSignRef.current = doSign;
      setIntentToMasked('');
      setIntentCode('');
      setIntentCountdown(0);
      setIntentVisible(true);
    },
    [detail?.id],
  );

  const startResendCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setIntentCountdown(RESEND_SECONDS);
    countdownRef.current = setInterval(() => {
      setIntentCountdown((v) => {
        if (v <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  };

  // 卸载时清理倒计时定时器
  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const sendIntentCode = async () => {
    if (!detail?.id || !myParty || intentBusy) return;
    setIntentBusy(true);
    try {
      const res: any = await contractsApi.signCode(detail.id, String(myParty.id));
      setIntentToMasked(res?.data?.to_masked ?? '');
      notify(t('contract.codeSent'));
      startResendCountdown();
    } catch (e) {
      notifyError(t('contract.intentFailed'), e);
    } finally {
      setIntentBusy(false);
    }
  };

  const confirmIntent = async () => {
    if (!intentCode.trim()) {
      notify(t('contract.noCode'));
      return;
    }
    setIntentBusy(true);
    try {
      if (detail?.id) verifiedForRef.current = { contractId: String(detail.id), code: intentCode.trim() };
      const fn = pendingSignRef.current;
      pendingSignRef.current = null;
      setIntentVisible(false);
      if (fn) await fn(intentCode.trim());
    } finally {
      setIntentBusy(false);
    }
  };

  // ===== 站内拒签 =====
  const confirmDecline = async () => {
    if (!detail?.id || !declinePartyId) return;
    setDeclineBusy(true);
    try {
      await contractsApi.decline(detail.id, declinePartyId, declineReason.trim());
      notify(t('contract.declineDone'));
      setShowDecline(false);
      setDeclineReason('');
      await openDetail(detail.id);
      await load(true);
    } catch (e) {
      notifyError(t('contract.declineDone'), e);
    } finally {
      setDeclineBusy(false);
    }
  };

  // 从签名/印章库选一个用于本次签署
  const renderFieldOverlay = (f: any) => {
    const active = String(f?.id) === String(signField?.id);
    const ft = f?.field_type || 'signature';
    const signed = !!f?.signed;
    const meta = SIGN_TYPE_META[ft] ?? SIGN_TYPE_META.signature;
    let inner: React.ReactNode;
    if (signed) {
      inner = <Ionicons name="checkmark-circle" size={22} color={colors.success} />;
    } else if (active && ft === 'signature') {
      // 在该签署框内直接手写：画布铺满框体（fill），输出 SVG 仍跟随实际坐标
      inner = (
        <SignaturePad
          key={`${String(f?.id)}-${padEpoch}`}
          fill
          showClear={false}
          title={myParty?.name}
          onResult={setSignatureSvg}
        />
      );
    } else if (active) {
      inner = (
        <View style={styles.overlayType}>
          <Ionicons
            name={meta.icon as any}
            size={16}
            color={signed ? colors.success : colors.primary}
          />
          <Text style={styles.overlayTypeText}>
            {t(active && !signed ? 'contract.signHere' : meta.labelKey)}
          </Text>
        </View>
      );
    } else {
      // 非当前签署框：可点选以切换当前签署框
      inner = (
        <TouchableOpacity
          style={styles.overlayWait}
          activeOpacity={0.7}
          onPress={() => openSignField(f)}
        >
          <Text style={styles.overlayWaitText}>{t(meta.labelKey)}</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View
        key={f?.id ?? `${f?.page}-${f?.x}-${f?.y}`}
        pointerEvents={active ? 'auto' : 'box-only'}
        style={[
          styles.fieldOverlay,
          fieldBox(f),
          signed && styles.fieldOverlaySigned,
          active && !signed && styles.fieldOverlayActive,
        ]}
      >
        {inner}
      </View>
    );
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

  // ===== 双栏「签署台」：右栏文档区 =====
  const renderDocs = () => {
    if (!detail?.pdf_available) {
      return (
        <View style={styles.noPdfBox}>
          <Ionicons name="document-outline" size={30} color={colors.ink3} />
          <Text style={styles.noPdfText}>{t('contract.noPdfPreview')}</Text>
        </View>
      );
    }
    const palette =
      signMethod === 'position' ? (
        <View>
          <View style={styles.paletteRow}>
            {(['signature', 'seal', 'date'] as const).map((tt) => {
              const meta = SIGN_TYPE_META[tt] ?? SIGN_TYPE_META.signature;
              const on = tool === tt;
              return (
                <TouchableOpacity
                  key={tt}
                  style={[styles.paletteItem, on && styles.paletteItemOn]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setTool(on ? null : tt);
                    if (tt === 'seal' && sealAsset) setSignatureSvg(sealAsset.data_url);
                    if (tt === 'signature' && signAsset) setSignatureSvg(signAsset.data_url);
                  }}
                >
                  <Ionicons name={meta.icon as any} size={15} color={on ? colors.primaryForeground : colors.primary} />
                  <Text style={styles.paletteItemText}>{t(meta.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.libraryBtn}
            activeOpacity={0.8}
            onPress={() => {
              setLibraryAssetType((tool ?? signField?.field_type) === 'seal' ? 'seal' : 'handwrite');
              setShowLibrary(true);
            }}
          >
            <Ionicons name="albums-outline" size={15} color={colors.primary} />
            <Text style={styles.libraryBtnText}>{t('contract.fromLibrary')}</Text>
          </TouchableOpacity>
          <Text style={[styles.pdfTip, !!tool && styles.pdfTipActive]}>
            {tool ? t('contract.pdfDragHint') : t('contract.dragHintOnDoc')}
          </Text>
        </View>
      ) : null;

    return (
      <>
        {palette}
        {pagesToShow.map((page, pidx) => (
          <View
            key={pidx}
            style={styles.pdfPageWrap}
            onLayout={onPageLayout(page)}
            {...getPagePan(page).panHandlers}
          >
            {pdfUrls[page] ? (
              <>
                <Image source={{ uri: pdfUrls[page] }} style={styles.pdfPageImage} resizeMode="stretch" />
                {renderDraftOverlay(page)}
                <View style={styles.pdfPageOverlay}>{fieldsOnPage(page).map(renderFieldOverlay)}</View>
              </>
            ) : (
              <View style={styles.pdfLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          </View>
        ))}
      </>
    );
  };

  // ===== 双栏「签署台」：左栏签署配置 =====
  const renderCfg = () => {
    const canSign =
      !!detail?.id &&
      !needsRealName &&
      (!!draft ||
        (!!signField && (['seal', 'date'].includes(signField?.field_type) || !!signatureSvg)));
    const partyStatusColor = myParty?.signed
      ? colors.success
      : myParty?.declined_at
      ? colors.error
      : colors.warning;
    return (
      <View style={styles.cfg}>
        {/* 签署方 */
        }
        <Text style={styles.cfgSectionTitle}>{t('contract.parties')}</Text>
        {myParty ? (
          <View style={[styles.partyChip, styles.partyChipSelf]}>
            <View style={styles.partyChipBody}>
              <Text style={styles.partyChipName} numberOfLines={1}>{myParty.name || t('contract.unknown')}</Text>
              {myParty.role ? (
                <Text style={styles.partyChipRole}>{t(ROLE_META[myParty.role] ?? 'contract.roleOther')}</Text>
              ) : null}
            </View>
            <Text style={[styles.partyChipStatus, { color: partyStatusColor }]}>
              {myParty.signed ? t('contract.signed') : myParty.declined_at ? t('contract.declined') : t('contract.unsigned')}
            </Text>
          </View>
        ) : null}

        {/* 拒签入口 */
        }
        {!!myParty && !myParty?.signed && !myParty?.declined_at && (
          <TouchableOpacity
            style={styles.cfgDeclineBtn}
            activeOpacity={0.8}
            onPress={() => {
              setDeclinePartyId(String(myParty.id));
              setDeclineReason('');
              setShowDecline(true);
            }}
          >
            <Ionicons name="close-circle-outline" size={15} color={colors.error} />
            <Text style={styles.cfgDeclineText}>{t('contract.decline')}</Text>
          </TouchableOpacity>
        )}

        {/* 签署方式分段切换 */
        }
        <Text style={styles.cfgSectionTitle}>{t('contract.signMethod')}</Text>
        <View style={styles.segRow}>
          {(['position', 'keyword'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segItem, signMethod === m && styles.segItemOn]}
              activeOpacity={0.8}
              onPress={() => setSignMethod(m)}
            >
              <Text style={[styles.segText, signMethod === m && styles.segTextOn]}>
                {m === 'position' ? t('contract.signMethodPosition') : t('contract.signMethodKeyword')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 指定位置：印章 / 手写签名资产块 */
        }
        {signMethod === 'position' && (
          <>
            <Text style={styles.cfgSectionTitle}>{t('contract.mySeals')}</Text>
            <View style={styles.assetBox}>
              {sealAsset?.data_url ? (
                <>
                  <Image source={{ uri: sealAsset.data_url }} style={styles.assetThumb} resizeMode="contain" />
                  <View style={styles.assetInfo}>
                    <Text style={styles.assetName} numberOfLines={1}>{sealAsset.name || t('contract.mySeals')}</Text>
                    <Text style={styles.assetMeta}>{t('contract.assetPickedSeal')}</Text>
                  </View>
                  <TouchableOpacity style={styles.assetAct} activeOpacity={0.8} onPress={() => { setLibraryAssetType('seal'); setShowLibrary(true); }}>
                    <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.assetAct} activeOpacity={0.8} onPress={clearSeal}>
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.assetEmpty}>
                  <Ionicons name="business-outline" size={18} color={colors.ink3} />
                  <Text style={styles.assetEmptyText}>{t('contract.sealNotMade')}</Text>
                  <TouchableOpacity style={styles.assetMakeBtn} activeOpacity={0.8} onPress={() => { setLibraryAssetType('seal'); setShowLibrary(true); }}>
                    <Text style={styles.assetMakeText}>{t('contract.makeSeal')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={styles.cfgSectionTitle}>{t('contract.mySigns')}</Text>
            <View style={styles.assetBox}>
              {signAsset?.data_url ? (
                <>
                  <Image source={{ uri: signAsset.data_url }} style={styles.assetThumb} resizeMode="contain" />
                  <View style={styles.assetInfo}>
                    <Text style={styles.assetName} numberOfLines={1}>{signAsset.name || t('contract.mySigns')}</Text>
                    <Text style={styles.assetMeta}>{t('contract.assetPickedSign')}</Text>
                  </View>
                  <TouchableOpacity style={styles.assetAct} activeOpacity={0.8} onPress={() => { setLibraryAssetType('handwrite'); setShowLibrary(true); }}>
                    <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.assetAct} activeOpacity={0.8} onPress={clearSign}>
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.assetEmpty}>
                  <Ionicons name="create-outline" size={18} color={colors.ink3} />
                  <Text style={styles.assetEmptyText}>{t('contract.signNotMade')}</Text>
                  <View style={styles.assetEmptyActs}>
                    <TouchableOpacity style={styles.assetMakeBtn} activeOpacity={0.8} onPress={() => setShowDrawPad(true)}>
                      <Text style={styles.assetMakeText}>{t('contract.makeSign')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.assetPickBtn} activeOpacity={0.8} onPress={() => { setLibraryAssetType('handwrite'); setShowLibrary(true); }}>
                      <Text style={styles.assetPickText}>{t('contract.fromLibrary')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* 关键字模式：检索 + 命中列表（语义化第N页，不露坐标） */
        }
        {signMethod === 'keyword' && (
          <>
            <Text style={styles.cfgSectionTitle}>{t('contract.keywordSign')}</Text>
            <View style={styles.kwSearchRow}>
              <TextInput
                style={[styles.input, styles.kwInput]}
                placeholder={t('contract.keywordPh')}
                value={kwKeyword}
                onChangeText={setKwKeyword}
                placeholderTextColor={colors.ink3}
              />
              <TouchableOpacity
                style={[styles.kwSearchBtn, kwSearchBusy && styles.btnDisabled]}
                activeOpacity={0.8}
                disabled={kwSearchBusy}
                onPress={doKeywordSearchMy}
              >
                {kwSearchBusy ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.kwSearchText}>{t('contract.searchKeyword')}</Text>
                )}
              </TouchableOpacity>
            </View>
            {!!kwCount && <Text style={styles.kwCount}>{t('contract.keywordHits', { n: kwCount })}</Text>}
            {kwHits.map((hit, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.kwHitRow, kwBusyIdx === idx && styles.btnDisabled]}
                activeOpacity={0.8}
                onPress={() => {
                  setKwBusyIdx(idx);
                  placeKeywordHit(hit);
                  setTimeout(() => setKwBusyIdx(null), 400);
                }}
              >
                <Ionicons name="location-outline" size={15} color={colors.primary} />
                <Text style={styles.kwHitText}>
                  {t('contract.hitOnPage', { page: hit?.page ?? 1 })} · {hit?.text ?? ''}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* 底部主签署按钮：指定位置需落框 / 关键字落框后启用，提交前走意愿验证码 */
        }
        <TouchableOpacity
          style={[
            styles.studioSignBtn,
            !canSign && styles.studioSignBtnDisabled,
            (signing || signingSel) && styles.btnDisabled,
          ]}
          activeOpacity={0.85}
          disabled={!canSign || signing || signingSel}
          onPress={() => (draft ? startSignedFlow(handleSignSelf) : startSignedFlow(handleSign))}
        >
          {signing || signingSel ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.studioSignText}>{!canSign ? t('contract.signFirstPlaceBox') : t('contract.sign')}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

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

              {!!myParty && !myParty?.signed && !myParty?.declined_at && (
                <TouchableOpacity
                  style={styles.declineEntry}
                  activeOpacity={0.8}
                  onPress={() => {
                    setDeclinePartyId(String(myParty.id));
                    setDeclineReason('');
                    setShowDecline(true);
                  }}
                >
                  <Ionicons name="close-circle-outline" size={15} color={colors.error} />
                  <Text style={styles.declineEntryText}>{t('contract.decline')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* 签署弹窗（手写 / 公章 / 日期；非 PDF 合同无页图时的降级签署） */}
      <Modal visible={!!signField && !studioVisible} animationType="slide" transparent onRequestClose={() => setSignField(null)}>
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
              {detail?.pdf_available ? (
                <>
                  {/* 自由拖签托盘：选择签名/公章/日期后拖到 PDF 页图任意位置落区并签 */}
                  <View style={styles.paletteRow}>
                    {(['signature', 'seal', 'date'] as const).map((tt) => {
                      const meta = SIGN_TYPE_META[tt] ?? SIGN_TYPE_META.signature;
                      const on = tool === tt;
                      const activeToolDraft = draft && draft.field_type === tt;
                      return (
                        <TouchableOpacity
                          key={tt}
                          style={[styles.paletteItem, (on || activeToolDraft) && styles.paletteItemOn]}
                          activeOpacity={0.8}
                          onPress={() => {
                            setTool(on ? null : tt);
                            if (on) setSigningSel(false);
                          }}
                        >
                          <Ionicons name={meta.icon as any} size={15} color={on ? colors.primaryForeground : colors.primary} />
                          <Text style={styles.paletteItemText}>{t(meta.labelKey)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.pdfTip, !!tool && styles.pdfTipActive]}>
                    {tool ? t('contract.pdfDragHint') : t('contract.pdfSignTip')}
                  </Text>
                  <TouchableOpacity
                    style={styles.libraryBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      setLibraryAssetType((signField?.field_type || draft?.field_type) === 'seal' ? 'seal' : 'handwrite');
                      setShowLibrary(true);
                    }}
                  >
                    <Ionicons name="albums-outline" size={15} color={colors.primary} />
                    <Text style={styles.libraryBtnText}>{t('contract.fromLibrary')}</Text>
                  </TouchableOpacity>
                  {(() => {
                    const activeFT = signField?.field_type || 'signature';
                    const activeIsSig = activeFT === 'signature';
                    const pagesContent = pagesToShow.map((page, pidx) => (
                      <View
                        key={pidx}
                        style={styles.pdfPageWrap}
                        onLayout={onPageLayout(page)}
                        {...getPagePan(page).panHandlers}
                      >
                        {!!pdfUrls[page] ? (
                          <>
                            <Image
                              source={{ uri: pdfUrls[page] }}
                              style={styles.pdfPageImage}
                              resizeMode="stretch"
                            />
                            {renderDraftOverlay(page)}
                            <View style={styles.pdfPageOverlay}>
                              {fieldsOnPage(page).map(renderFieldOverlay)}
                            </View>
                          </>
                        ) : (
                          <View style={styles.pdfLoading}>
                            <ActivityIndicator color={colors.primary} />
                          </View>
                        )}
                      </View>
                    ));
                    const clearBtn = activeIsSig ? (
                      <TouchableOpacity
                        style={styles.clearBtnTxt}
                        activeOpacity={0.8}
                        onPress={() => {
                          setPadEpoch((v) => v + 1);
                          setSignatureSvg('');
                        }}
                      >
                        <Ionicons name="refresh-outline" size={15} color={colors.primary} />
                        <Text style={styles.clearBtnTxtText}>{t('contract.clear')}</Text>
                      </TouchableOpacity>
                    ) : null;
                    const draftMode = !!draft;
                    return (
                      <>
                        {pagesContent}
                        {clearBtn}
                        <TouchableOpacity
                          style={[styles.signBtn, (signing || signingSel) && styles.btnDisabled]}
                          activeOpacity={0.85}
                          disabled={signing || signingSel}
                          onPress={() =>
                            draftMode ? startSignedFlow(handleSignSelf) : startSignedFlow(handleSign)
                          }
                        >
                          {(signing || signingSel) ? (
                            <ActivityIndicator color={colors.primaryForeground} />
                          ) : (
                            <Text style={styles.signBtnText}>
                              {draftMode ? t('contract.confirmDraftSign') : t('contract.confirmSign')}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </>
                    );
                  })()}
                </>
              ) : (
                <>
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
                    onPress={() => startSignedFlow(handleSign)}
                  >
                    {signing ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <Text style={styles.signBtnText}>{t('contract.confirmSign')}</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 手写签名画板（制作手写签名：单次使用或存库） */}
      <Modal visible={showDrawPad} animationType="slide" transparent onRequestClose={() => { setShowDrawPad(false); setSignatureSvg(''); }}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.makeSign')}</Text>
              <TouchableOpacity onPress={() => { setShowDrawPad(false); setSignatureSvg(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <SignaturePad key={padEpoch} title={myParty?.name || t('contract.unknown')} onResult={setSignatureSvg} />
            <View style={styles.drawPadActions}>
              <TouchableOpacity
                style={styles.drawPadUseBtn}
                activeOpacity={0.85}
                onPress={() => {
                  const dataUrl = signatureSvg.startsWith('<svg')
                    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(signatureSvg)}`
                    : signatureSvg;
                  setSignAsset({ id: '', name: t('contract.oneTimeSign'), asset_type: 'handwrite', source: 'drew', data_url: dataUrl });
                  setTool('signature');
                  setShowDrawPad(false);
                }}
              >
                <Text style={styles.drawPadUseText}>{t('contract.useThisSign')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.drawPadSaveBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setShowDrawPad(false);
                  setLibraryAssetType('handwrite');
                  setShowLibrary(true);
                }}
              >
                <Text style={styles.drawPadSaveText}>{t('contract.addAsset')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 开放签双栏「签署台」：左=签署配置栏，右=文档区 ===== */}
      <Modal visible={studioVisible} animationType="slide" onRequestClose={closeStudio}>
        <View style={styles.studio}>
          <View style={styles.studioHead}>
            <TouchableOpacity onPress={closeStudio} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={24} color={colors.ink} />
            </TouchableOpacity>
            <View style={styles.studioHeadTitle}>
              <Text style={styles.studioTitle} numberOfLines={1}>{detail?.title || t('contract.my')}</Text>
            </View>
            {renderStatus(detail?.status)}
            <TouchableOpacity onPress={closeStudio} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          {needsRealName && (
            <View style={styles.realNameBanner}>
              <Ionicons name="person-circle-outline" size={16} color={colors.warning} />
              <Text style={styles.realNameBannerText}>{t('contract.realNameNotice')}</Text>
            </View>
          )}
          {isWide ? (
            <View style={styles.studioBodyRow}>
              <ScrollView style={styles.studioCfgCol} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.studioCfgContent}>
                {renderCfg()}
              </ScrollView>
              <ScrollView style={styles.studioDocCol} contentContainerStyle={styles.studioDocContent}>
                {renderDocs()}
              </ScrollView>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.studioStack}>
              {renderDocs()}
              {renderCfg()}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* 签署意愿验证弹窗 */}
      <Modal visible={intentVisible} animationType="fade" transparent onRequestClose={() => setIntentVisible(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.intentTitle')}</Text>
              <TouchableOpacity onPress={() => setIntentVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.intentDesc}>{t('contract.intentDesc')}</Text>
            {!!intentToMasked && (
              <Text style={styles.intentNotice}>{t('contract.intentNotice', { to: intentToMasked })}</Text>
            )}
            <View style={styles.intentCodeRow}>
              <TextInput
                style={[styles.codeInput, !intentToMasked && styles.codeInputDisabled]}
                placeholder={t('contract.verifyCodePh')}
                keyboardType="number-pad"
                value={intentCode}
                onChangeText={setIntentCode}
                placeholderTextColor={colors.ink3}
                editable={!!intentToMasked}
              />
              {intentCountdown > 0 ? (
                <View style={styles.resendWait}>
                  <Text style={styles.resendWaitText}>{t('contract.codeResendAfter', { n: intentCountdown })}</Text>
                </View>
              ) : (
                <TouchableOpacity style={[styles.resendBtn, intentBusy && styles.btnDisabled]} activeOpacity={0.8} disabled={intentBusy} onPress={sendIntentCode}>
                  <Ionicons name="refresh-outline" size={15} color={colors.primary} />
                  <Text style={styles.resendBtnText}>{t('contract.sendIntentCode')}</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.signBtn, intentBusy && styles.btnDisabled]}
              activeOpacity={0.85}
              disabled={intentBusy}
              onPress={confirmIntent}
            >
              {intentBusy ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.signBtnText}>{t('contract.confirmSign')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 拒签弹窗 */}
      <Modal visible={showDecline} animationType="fade" transparent onRequestClose={() => setShowDecline(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.declineTitle')}</Text>
              <TouchableOpacity onPress={() => setShowDecline(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.intentDesc}>{t('contract.declineHint')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('contract.declineReasonPh')}
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              placeholderTextColor={colors.ink3}
            />
            <TouchableOpacity
              style={[styles.signBtn, declineBusy && styles.btnDisabled, styles.declineBtn]}
              activeOpacity={0.85}
              disabled={declineBusy}
              onPress={confirmDecline}
            >
              {declineBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.signBtnText, { color: '#fff' }]}>{t('contract.decline')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 我的签名/印章库 */}
      <SignAssetPicker
        visible={showLibrary}
        onClose={() => setShowLibrary(false)}
        assetType={libraryAssetType}
        onSelect={(asset) => {
          if (libraryAssetType === 'seal') useSealAsset(asset);
          else useSignAsset(asset);
        }}
        pendingDrawnSvg={signatureSvg.startsWith('<svg') ? signatureSvg : undefined}
      />
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

  /* 拒签入口 */
  declineEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.surface,
  },
  declineEntryText: { fontSize: 14, fontWeight: '700', color: colors.error },

  /* 签名库入口（签署弹窗内） */
  libraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    marginBottom: 12,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  libraryBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  /* 签署意愿验证 */
  intentDesc: { fontSize: 14, color: colors.ink2, marginBottom: 14 },
  intentNotice: { fontSize: 13, color: colors.primary, marginBottom: 14 },
  intentCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  codeInput: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
  codeInputDisabled: { opacity: 0.6 },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 12,
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  resendBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  resendWait: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    justifyContent: 'center',
  },
  resendWaitText: { fontSize: 12, color: colors.ink3 },
  declineBtn: { backgroundColor: colors.error },

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

  /* PDF 页图预览 + 定位签署 */
  pdfTip: { fontSize: 12, color: colors.ink3, marginBottom: 10 },
  pdfTipActive: { color: colors.primary, fontWeight: '700' },
  paletteRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  paletteItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  paletteItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  paletteItemText: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  pdfPageWrap: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: colors.radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pdfPageImage: { width: '100%', aspectRatio: 210 / 297, backgroundColor: colors.surface2 },
  pdfPageOverlay: { ...StyleSheet.absoluteFillObject },
  pdfLoading: {
    width: '100%',
    aspectRatio: 210 / 297,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldOverlay: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.12),
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fieldOverlayActive: { borderColor: colors.warning, borderStyle: 'solid', backgroundColor: 'rgba(255,255,255,0.06)' },
  fieldOverlaySigned: { borderColor: colors.success, borderStyle: 'solid', backgroundColor: colors.alpha(colors.successRgb, 0.1) },
  draftOverlay: { borderColor: colors.warning, borderStyle: 'solid', backgroundColor: colors.alpha(colors.warningRgb, 0.14) },
  overlayWait: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  overlayWaitText: { fontSize: 10, color: colors.primary, fontWeight: '700' },
  overlayType: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  overlayTypeText: { fontSize: 10, color: colors.ink3, textAlign: 'center' },
  clearBtnTxt: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginTop: 4,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  clearBtnTxtText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  /* ===== 双栏签署台 ===== */
  studio: { flex: 1, backgroundColor: colors.background },
  studioHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    height: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  studioHeadTitle: { flex: 1, minWidth: 0 },
  studioTitle: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  studioBodyRow: { flex: 1, flexDirection: 'row' },
  studioCfgCol: { width: 340, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, backgroundColor: colors.background },
  studioCfgContent: { padding: colors.spacing.md, paddingBottom: 48 },
  studioDocCol: { flex: 1, backgroundColor: colors.surface2 },
  studioDocContent: { padding: colors.spacing.md, paddingBottom: 48 },
  studioStack: { padding: colors.spacing.md, paddingBottom: 48 },

  cfg: {},
  cfgSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.ink3, marginTop: 16, marginBottom: 8 },
  partyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 12,
    borderRadius: colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  partyChipSelf: { borderColor: colors.primary, borderWidth: 1 },
  partyChipBody: { flex: 1, minWidth: 0 },
  partyChipName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  partyChipRole: { fontSize: 12, color: colors.primary, backgroundColor: colors.sidebarActive, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, marginTop: 4, borderRadius: colors.radius.full, overflow: 'hidden' },
  partyChipStatus: { fontSize: 12, fontWeight: '700' },

  cfgDeclineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.surface,
  },
  cfgDeclineText: { fontSize: 13, fontWeight: '700', color: colors.error },

  segRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  segItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { fontSize: 13, color: colors.ink2, fontWeight: '600' },
  segTextOn: { color: colors.primaryForeground, fontWeight: '700' },

  /* 资产块 */
  assetBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  assetThumb: { width: 40, height: 40, borderRadius: colors.radius.sm, backgroundColor: colors.surface2 },
  assetInfo: { flex: 1, minWidth: 0 },
  assetName: { fontSize: 13, fontWeight: '700', color: colors.ink },
  assetMeta: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  assetAct: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  assetEmpty: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 6 },
  assetEmptyText: { fontSize: 12, color: colors.ink3, textAlign: 'center' },
  assetEmptyActs: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  assetMakeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: colors.radius.md, backgroundColor: colors.primary },
  assetMakeText: { fontSize: 12, fontWeight: '700', color: colors.primaryForeground },
  assetPickBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: colors.radius.md, borderWidth: 1, borderColor: colors.primary },
  assetPickText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  /* 关键字 */
  kwSearchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  kwInput: { flex: 1, marginBottom: 0 },
  kwSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
    paddingVertical: 12,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
  },
  kwSearchText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
  kwCount: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 8, marginBottom: 4 },
  kwHitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    marginBottom: 8,
  },
  kwHitText: { flex: 1, fontSize: 13, color: colors.ink2 },

  /* 底部主签署按钮 */
  studioSignBtn: {
    marginTop: 20,
    height: 50,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.primary,
  },
  studioSignBtnDisabled: { backgroundColor: colors.ink3 },
  studioSignText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },

  noPdfBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 60,
    borderRadius: colors.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noPdfText: { fontSize: 13, color: colors.ink3 },

  /* 手写签名画板操作 */
  drawPadActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  drawPadUseBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: colors.radius.md, backgroundColor: colors.primary },
  drawPadUseText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  drawPadSaveBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: colors.radius.md, borderWidth: 1, borderColor: colors.primary },
  drawPadSaveText: { fontSize: 15, fontWeight: '700', color: colors.primary },
});