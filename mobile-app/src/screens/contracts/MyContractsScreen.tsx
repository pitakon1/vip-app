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
  PanResponder,
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
  const handleSignSelf = async () => {
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
        ...(ft === 'signature' && signatureSvg ? { signature_svg: signatureSvg } : {}),
      });
      notify(t('contract.signSingleDone'));
      setDraft(null);
      setTool(null);
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
      setSigningSel(false);
    }
  };

  // 在 PDF 页图上叠加单个签署框（定位用 %，与后端落库一致）
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
                          onPress={draftMode ? handleSignSelf : handleSign}
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
                    onPress={handleSign}
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
});