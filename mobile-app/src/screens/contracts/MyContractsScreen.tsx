/**
 * 租客 / 业主「我的合同」签署页（只读为主）。
 *
 * 列出当前用户可见的合同（contractsApi.list：本人作为签署方或挂在本人租约下）。
 * 详情页展示签署方；仅当「当前用户是签署方且尚未签署」时显示「签署」按钮。
 * 非本人或已签署只读展示。文本走 i18n 三语。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import SignaturePad from '@/components/SignaturePad';
import SignAssetPicker from '@/components/SignAssetPicker';
import { SvgXml } from 'react-native-svg';
import { contractsApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/i18n';

/* 后端时间戳统一为 naive UTC（无时区后缀）。此前直接 replace('T',' ') 会把 UTC 当本地
   时间展示，东八区下比 Web 端早 8 小时；这里先补 'Z' 归一为 UTC，再按用户本地时区格式化。 */
const fmtDate = (x?: string) => {
  if (!x) return '-';
  const raw = String(x);
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw.replace('T', ' ').slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 合同类型枚举 → i18n key（详情里此前直接打印后端枚举 lease/purchase/broker） */
const KIND_LABEL_KEYS: Record<string, string> = {
  lease: 'contract.tmpl.lease',
  purchase: 'contract.tmpl.purchase',
  broker: 'contract.tmpl.broker',
};

// 合同正文纯文本（无 PDF 页图时作为降级背景）
const stripHtml = (html?: string) =>
  (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

// 签署台落框：一枚印章/签名/日期章（页面百分比坐标）
interface Stamp {
  id: string;
  kind: 'seal' | 'handwrite' | 'date';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  imgUri?: string;
  svg?: string;
}

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

  // PDF 页图预览：页号 → 可被 <Image> 加载的 URL
  const [pdfUrls, setPdfUrls] = useState<Record<number, string>>({});

  // ===== 开放签式单屏签署台：左栏签署方 + 签章托盘，右栏文档区 =====
  const [studioVisible, setStudioVisible] = useState(false);
  // 已制作的签章（托盘两项）：印章为 PNG data URL；手写签名为 SVG（+尽力而为的 PNG）
  const [sealMade, setSealMade] = useState<{ dataUrl: string } | null>(null);
  const [signMade, setSignMade] = useState<{ svg: string; ar: number; pngUrl?: string } | null>(null);
  // 制作弹窗（印章复用 SignAssetPicker；手写复用 SignaturePad）
  const [makeSealVisible, setMakeSealVisible] = useState(false);
  const [makeSignVisible, setMakeSignVisible] = useState(false);
  const [signDraftSvg, setSignDraftSvg] = useState('');
  const signSvgRef = useRef<any>(null);
  // 点击预置签署区后落在该区的签章（页面百分比坐标）
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const stampsRef = useRef(stamps);
  stampsRef.current = stamps;
  const sealMadeRef = useRef(sealMade);
  sealMadeRef.current = sealMade;
  const signMadeRef = useRef(signMade);
  signMadeRef.current = signMade;
  const pageSizesRef = useRef<Record<number, { w: number; h: number }>>({});

  const [showDecline, setShowDecline] = useState(false);
  const [declinePartyId, setDeclinePartyId] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declineBusy, setDeclineBusy] = useState(false);

  const isWide = useWindowDimensions().width >= 720;

  // 打开签署台（每次进入重置本次制作/落章内容）
  const openStudio = useCallback(() => {
    setSealMade(null);
    setSignMade(null);
    setStamps([]);
    setStudioVisible(true);
  }, []);

  const closeStudio = () => {
    setStudioVisible(false);
    setStamps([]);
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

  // 当前用户对应的签署方：一级按账号归属（user_id 命中或邮箱命中）。
  // 发起方在 App 里「追加签署方」时常常只填姓名、不给邮箱也不绑账号，严格匹配会把
  // 本人当成旁观者 —— myParty 为空 → myFields 为空 → 本人一条签署区都看不到。
  // 故补两级兜底：姓名一致；以及全合同只有一个签署方（本人可见的合同必属本人）。
  const myParty = useMemo(() => {
    const ps: any[] = Array.isArray(detail?.parties) ? detail.parties : [];
    const uid = String(user?.id ?? '');
    const mail = String(user?.email ?? '').trim().toLowerCase();
    const uname = String(user?.name ?? '').trim().toLowerCase();
    const direct = ps.find(
      (p: any) =>
        (!!p?.user_id && String(p.user_id) === uid) ||
        (!!mail && String(p?.email ?? '').trim().toLowerCase() === mail),
    );
    if (direct) return direct;
    if (uname) {
      const byName = ps.find(
        (p: any) => String(p?.name ?? '').trim().toLowerCase() === uname,
      );
      if (byName) return byName;
    }
    return ps.length === 1 ? ps[0] : null;
  }, [detail, user?.id, user?.email, user?.name]);

  const signFields: any[] = Array.isArray(detail?.sign_fields) ? detail.sign_fields : [];
  const myFields = signFields.filter(
    (f: any) =>
      !!myParty &&
      (String(f?.party_id) === String(myParty?.id) || f?.party_id == null),
  );
  const myPendingFields = myFields.filter((f: any) => !f?.signed);
  const mySignedFields = myFields.filter((f: any) => !!f?.signed);
  // 实名口径：后端签名接口返回的字段是 real_name_verified_at（此前误读成
  // real_name_verified 恒为 undefined，导致任何签署方的「签署」按钮都被永久禁掉）。
  // 前端不再按实名预先禁用按钮 —— 归属本账号的签署方由后端按登录态内部认证；
  // 真正未绑定的签署方（无 user_id 且邮箱对不上）会在提交时被后端以
  // 403 REAL_NAME_REQUIRED 拦截，前端只需把该错误提示出来。
  const needsRealName = false;
  // 签署台展示/可拖放的页：有 PDF 时整本；无 PDF 时降级为单页「正文」背景
  const studioPages: number[] = (() => {
    if (!detail?.pdf_available) return [1];
    const cnt = Number(detail?.pdf_page_count) || 1;
    return Array.from({ length: Math.max(1, cnt) }, (_, i) => i + 1);
  })();

  // 加载签署台需要展示的页图 URL（站内合同带 ?token=）
  useEffect(() => {
    if (!studioVisible || !detail?.pdf_available || !detail?.id) {
      setPdfUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const map: Record<number, string> = {};
      for (const p of studioPages) {
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
  }, [studioVisible, detail?.id, detail?.pdf_available, studioPages.join(',')]);

  // 页面百分比尺寸记录（无 PDF 时正文降级背景同样按页面比例渲染落章）
  const onPageLayout = (page: number) => (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    pageSizesRef.current[page] = { w: width, h: height };
  };

  // 打开手写签名板（托盘未就绪时点按、或点击预置签名区缺签名时）
  const openSignMaker = useCallback(() => {
    setSignDraftSvg('');
    setMakeSignVisible(true);
  }, []);

  // 点按发起方预置的签署区即签：落章坐标与尺寸严格取该签署区自身的值。
  // 签署方不能自行添加签署区、也不能自由拖框改位（对齐 e签宝、法大大）。
  const signOnField = (f: any) => {
    if (!myParty || f?.signed) return;
    const type: string = f?.field_type ?? 'signature';
    const page = Number(f?.page) || 1;
    const x = Number(f?.x) || 0;
    const y = Number(f?.y) || 0;
    const w = Number(f?.w) > 0 ? Number(f.w) : type === 'seal' ? 13 : 22;
    const h = Number(f?.h) > 0 ? Number(f.h) : type === 'seal' ? 6 : 8;
    const id = `st-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (type === 'date') {
      // 日期章由后端按签署当日渲染，前端只占位
      setStamps((prev) => [...prev, { id, kind: 'date', page, x, y, w, h }]);
      return;
    }
    if (type === 'seal') {
      const dataUrl = sealMadeRef.current?.dataUrl;
      if (!dataUrl) {
        notify(t('contract.makeAssetFirstSeal'));
        setMakeSealVisible(true);
        return;
      }
      setStamps((prev) => [...prev, { id, kind: 'seal', page, x, y, w, h, imgUri: dataUrl }]);
      return;
    }
    const svg = signMadeRef.current?.svg;
    if (!svg) {
      notify(t('contract.makeAssetFirstSign'));
      openSignMaker();
      return;
    }
    setStamps((prev) => [...prev, { id, kind: 'handwrite', page, x, y, w, h, svg }]);
  };

  const removeStamp = (id: string) => setStamps((prev) => prev.filter((s) => s.id !== id));

  // 手写签名制作完成：回填托盘（尽力导出 PNG，失败则仅提交 SVG）
  const useSignDraft = () => {
    const svg = signDraftSvg;
    if (!svg || !svg.startsWith('<svg')) {
      notify(t('contract.signNotMade'));
      return;
    }
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    const ar = m && parseFloat(m[2]) > 0 ? parseFloat(m[1]) / parseFloat(m[2]) : 2.5;
    setSignMade({ svg, ar });
    try {
      const ref: any = signSvgRef.current;
      if (ref && typeof ref.toDataURL === 'function') {
        ref.toDataURL((b64: string) => {
          if (b64) {
            setSignMade((prev) =>
              prev && prev.svg === svg ? { ...prev, pngUrl: `data:image/png;base64,${b64}` } : prev,
            );
          }
        });
      }
    } catch {
      // 导出 PNG 不可用时仅提交 SVG
    }
    setMakeSignVisible(false);
  };

  // 底部【签署】：一次性原子提交全部落框（无意愿验证码步骤）
  const submitBatch = async () => {
    if (!detail?.id || !myParty || submitting) return;
    const placed = stampsRef.current;
    if (!placed.length) {
      notify(t('contract.needStampFirst'));
      return;
    }
    setSubmitting(true);
    try {
      const items = placed.map((s) => {
        if (s.kind === 'date') {
          // 日期章不带图，后端按签署当日渲染
          return { page: s.page, x: s.x, y: s.y, w: s.w, h: s.h, method: 'date' };
        }
        if (s.kind === 'seal') {
          return {
            page: s.page,
            x: s.x,
            y: s.y,
            w: s.w,
            h: s.h,
            method: 'company_seal',
            ...(s.imgUri ? { image_data_url: s.imgUri } : {}),
          };
        }
        const png =
          signMadeRef.current && signMadeRef.current.svg === s.svg ? signMadeRef.current.pngUrl : undefined;
        return {
          page: s.page,
          x: s.x,
          y: s.y,
          w: s.w,
          h: s.h,
          method: 'personal_handwrite',
          ...(s.svg ? { signature_svg: s.svg } : {}),
          ...(png ? { image_data_url: png } : {}),
        };
      });
      await contractsApi.signBatch(detail.id, { party_id: String(myParty.id), items });
      notify(t('contract.signSingleDone'));
      setStamps([]);
      await openDetail(detail.id);
      await load(true);
      closeStudio();
    } catch (e: any) {
      if (e?.response?.status === 403) notifyError(t('contract.realNameDenied'), e);
      else notifyError(t('contract.signSelf'), e);
    } finally {
      setSubmitting(false);
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

  // 渲染待签署 / 已签署的字段行
  const renderSignField = (f: any, signed: boolean, idx: number) => {
    const meta = SIGN_TYPE_META[f?.field_type ?? 'signature'] ?? SIGN_TYPE_META.signature;
    // 归属姓名：发起方放置签署区时指定的签署方（此前条目只显示类型与页码，
    // 用户看不到「这个签署区是谁的」，故补上归属姓名）
    const owner = (detail?.parties ?? []).find(
      (p: any) => String(p?.id) === String(f?.party_id),
    );
    return (
      <TouchableOpacity
        key={f?.id ?? idx}
        style={styles.fieldCard}
        activeOpacity={0.8}
        disabled={signed}
        onPress={() => openStudio()}
      >
        <Ionicons name={meta.icon as any} size={18} color={signed ? colors.success : colors.primary} />
        <View style={styles.fieldBody}>
          <Text style={styles.fieldTitle}>
            {t(meta.labelKey)}
            {owner?.name ? ` · ${owner.name}` : ''}
          </Text>
          {!!f?.page && (
            <Text style={styles.fieldMeta}>
              {t('contract.page')} {f.page}
            </Text>
          )}
          {!signed && <Text style={styles.fieldMeta}>{t('contract.tapFieldToSign')}</Text>}
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

  // ===== 签署台右栏：文档区（PDF 页图 / 正文降级 + 预置签署区 + 已落签章）=====
  const renderDocs = () => (
    <>
      <Text style={[styles.pdfTip, styles.pdfTipActive]}>{t('contract.dragStampHint')}</Text>
      {studioPages.map((page) => (
        <View key={page} style={styles.pdfPageWrap} onLayout={onPageLayout(page)}>
          {detail?.pdf_available ? (
            pdfUrls[page] ? (
              <Image source={{ uri: pdfUrls[page] }} style={styles.pdfPageImage} resizeMode="stretch" />
            ) : (
              <View style={styles.pdfLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )
          ) : (
            <View style={styles.bodyPage}>
              <Text style={styles.bodyPageText} selectable>
                {stripHtml(detail?.content_html)}
              </Text>
            </View>
          )}
          <View style={styles.pdfPageOverlay} pointerEvents="box-none">
            {/* 发起方预置、归属本人的签署区：虚线框 + 类型，点一下即签在该区
                （签署方不能自行添加签署区，只能点预置框完成签署） */}
            {myFields
              .filter((f: any) => (Number(f?.page) || 1) === page)
              .map((f: any, i: number) => {
                const signed = !!f?.signed;
                const covered = stamps.some(
                  (s) =>
                    s.page === page &&
                    Math.abs(s.x - (Number(f?.x) || 0)) < 1 &&
                    Math.abs(s.y - (Number(f?.y) || 0)) < 1,
                );
                if (covered) return null;
                const meta = SIGN_TYPE_META[f?.field_type ?? 'signature'] ?? SIGN_TYPE_META.signature;
                const w = Number(f?.w) > 0 ? Number(f.w) : 22;
                const h = Number(f?.h) > 0 ? Number(f.h) : 8;
                return (
                  <TouchableOpacity
                    key={f?.id ?? `mf-${page}-${i}`}
                    activeOpacity={0.8}
                    disabled={signed || !myParty}
                    onPress={() => signOnField(f)}
                    style={[
                      styles.fieldOverlay,
                      { left: `${Number(f?.x) || 0}%`, top: `${Number(f?.y) || 0}%`, width: `${w}%`, height: `${h}%` },
                      signed && styles.fieldOverlaySigned,
                    ]}
                  >
                    {signed ? (
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    ) : (
                      <>
                        <Ionicons name={meta.icon as any} size={13} color={colors.primary} />
                        <Text style={styles.overlayWaitText} numberOfLines={1}>
                          {t('contract.tapFieldToSign')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            {stamps
              .filter((s) => s.page === page)
              .map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.stampBox,
                    { left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` },
                  ]}
                >
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {s.kind === 'date' ? (
                      <Text style={styles.stampDate}>{new Date().toISOString().slice(0, 10)}</Text>
                    ) : s.kind === 'seal' ? (
                      s.imgUri ? (
                        <Image source={{ uri: s.imgUri }} style={styles.stampImg} resizeMode="contain" />
                      ) : null
                    ) : s.svg ? (
                      <SvgXml xml={s.svg} width="100%" height="100%" />
                    ) : null}
                  </View>
                  <TouchableOpacity style={styles.stampDel} activeOpacity={0.8} onPress={() => removeStamp(s.id)}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
          </View>
        </View>
      ))}
    </>
  );

  // 托盘条目（签署元素）：
  //   未制作 → 整行可点，点一下直接弹出手写签名板 / 印章制作；
  //   已制作 → 只作「签署元素已就绪」的展示（带更换入口）——落章位置一律来自
  //            发起方预置的签署区，签署方不能自由拖框/自行添加签署区。
  const renderTrayItem = (kind: 'seal' | 'handwrite', compact = false) => {
    const ready = kind === 'seal' ? !!sealMade : !!signMade;
    const openMaker = () => {
      if (kind === 'seal') setMakeSealVisible(true);
      else openSignMaker();
    };
    const thumb =
      kind === 'seal' ? (
        ready && sealMade?.dataUrl ? (
          <Image source={{ uri: sealMade.dataUrl }} style={styles.trayThumbImg} resizeMode="contain" />
        ) : (
          <Ionicons name="business-outline" size={compact ? 18 : 20} color={colors.ink3} />
        )
      ) : ready && signMade?.svg ? (
        <SvgXml xml={signMade.svg} width="100%" height="100%" />
      ) : (
        <Ionicons name="create-outline" size={compact ? 18 : 20} color={colors.ink3} />
      );
    const label = kind === 'seal' ? t('contract.traySeal') : t('contract.traySign');
    const hintText = ready
      ? t('contract.readyToDrag')
      : kind === 'seal'
      ? t('contract.traySealEmpty')
      : t('contract.traySignEmpty');

    if (!ready) {
      return (
        <TouchableOpacity
          style={[styles.trayItem, styles.trayItemEmpty, compact && styles.trayItemCompact]}
          activeOpacity={0.85}
          onPress={openMaker}
        >
          <View style={[styles.trayThumb, compact && styles.trayThumbCompact]}>{thumb}</View>
          <View style={styles.trayBody}>
            <Text style={styles.trayName} numberOfLines={1}>{label}</Text>
            {!compact && <Text style={styles.trayStatus} numberOfLines={1}>{hintText}</Text>}
          </View>
          <Ionicons name="add-circle-outline" size={compact ? 18 : 20} color={colors.primary} />
        </TouchableOpacity>
      );
    }
    return (
      <View style={[styles.trayItem, styles.trayItemReady, compact && styles.trayItemCompact]}>
        <View style={styles.trayDragZone}>
          <View style={[styles.trayThumb, compact && styles.trayThumbCompact]}>{thumb}</View>
          <View style={styles.trayBody}>
            <Text style={styles.trayName} numberOfLines={1}>{label}</Text>
            {!compact && <Text style={styles.trayStatus} numberOfLines={1}>{hintText}</Text>}
          </View>
          <Ionicons name="checkmark-circle-outline" size={compact ? 16 : 18} color={colors.primary} />
        </View>
        <TouchableOpacity
          style={styles.trayRedo}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={openMaker}
        >
          <Ionicons name="refresh-outline" size={compact ? 15 : 17} color={colors.ink3} />
        </TouchableOpacity>
      </View>
    );
  };

  // ===== 单屏「签署台」：左栏签署配置（签署方 + 签章托盘 + 底部签署） =====
  const renderCfg = () => {
    const canSign = !!detail?.id && !needsRealName && stamps.length > 0;
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

        <Text style={styles.cfgSectionTitle}>{t('contract.traySection')}</Text>
        {renderTrayItem('seal')}
        {renderTrayItem('handwrite')}
        <Text style={styles.trayHint}>{t('contract.dragStampHint')}</Text>

        {/* 底部主签署按钮：一次性原子提交全部落框（无意愿验证码） */
        }
        <TouchableOpacity
          style={[
            styles.studioSignBtn,
            (!canSign || submitting) && styles.studioSignBtnDisabled,
            submitting && styles.btnDisabled,
          ]}
          activeOpacity={0.85}
          disabled={!canSign || submitting}
          onPress={submitBatch}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.studioSignText}>{t('contract.sign')}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ===== 窄屏底部固定栏：文档在上、托盘与签署按钮固定在底部（与文档同屏，边拖边看） =====
  const renderDock = () => {
    const canSign = !!detail?.id && !needsRealName && stamps.length > 0;
    const partyStatusColor = myParty?.signed
      ? colors.success
      : myParty?.declined_at
      ? colors.error
      : colors.warning;
    return (
      <View style={styles.studioDock}>
        <View style={styles.dockTop}>
          <Text style={styles.dockParty} numberOfLines={1}>
            {myParty?.name || t('contract.unknown')}
            <Text style={[styles.dockPartyStatus, { color: partyStatusColor }]}>
              {` · ${
                myParty?.signed
                  ? t('contract.signed')
                  : myParty?.declined_at
                  ? t('contract.declined')
                  : t('contract.unsigned')
              }`}
            </Text>
          </Text>
          {!!myParty && !myParty?.signed && !myParty?.declined_at && (
            <TouchableOpacity
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => {
                setDeclinePartyId(String(myParty.id));
                setDeclineReason('');
                setShowDecline(true);
              }}
            >
              <Text style={styles.dockDecline}>{t('contract.decline')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.dockTrayRow}>
          {renderTrayItem('seal', true)}
          {renderTrayItem('handwrite', true)}
        </View>
        <TouchableOpacity
          style={[
            styles.studioSignBtn,
            styles.dockSignBtn,
            (!canSign || submitting) && styles.studioSignBtnDisabled,
            submitting && styles.btnDisabled,
          ]}
          activeOpacity={0.85}
          disabled={!canSign || submitting}
          onPress={submitBatch}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.studioSignText}>{t('contract.sign')}</Text>
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
                <Text style={styles.fieldValue}>
                  {detail?.kind
                    ? KIND_LABEL_KEYS[detail.kind]
                      ? t(KIND_LABEL_KEYS[detail.kind])
                      : detail.kind
                    : '-'}
                </Text>
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
                <>
                  <Text style={styles.partyNone}>{t('contract.noSignFields')}</Text>
                  <Text style={styles.fieldsTip}>{t('contract.fieldPresetTip')}</Text>
                </>
              )}

              {!!myPendingFields.length && (
                <View style={styles.doneBanner}>
                  <Ionicons name="thumbs-up-outline" size={16} color={colors.success} />
                  <Text style={styles.doneBannerText}>{t('contract.signYourFieldsHint')}</Text>
                </View>
              )}

              {!!myParty && !myParty?.signed && !myParty?.declined_at && (
                <TouchableOpacity style={styles.detailSignBtn} activeOpacity={0.85} onPress={openStudio}>
                  <Ionicons name="create-outline" size={18} color={colors.primaryForeground} />
                  <Text style={styles.detailSignBtnText}>{t('contract.sign')}</Text>
                </TouchableOpacity>
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

      {/* 手写签名制作弹窗（产出 SVG，尽力导出 PNG；完成后回填托盘使其可拖拽） */}
      <Modal visible={makeSignVisible} animationType="slide" transparent onRequestClose={() => setMakeSignVisible(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.makeSign')}</Text>
              <TouchableOpacity onPress={() => setMakeSignVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <SignaturePad
              key={String(makeSignVisible)}
              title={myParty?.name || t('contract.unknown')}
              onResult={setSignDraftSvg}
              svgRef={signSvgRef}
            />
            <View style={styles.drawPadActions}>
              <TouchableOpacity style={styles.drawPadUseBtn} activeOpacity={0.85} onPress={useSignDraft}>
                <Text style={styles.drawPadUseText}>{t('contract.useThisSign')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 电子印章制作/选择（复用签名资产库，产出 PNG data_url） */}
      <SignAssetPicker
        visible={makeSealVisible}
        onClose={() => setMakeSealVisible(false)}
        assetType="seal"
        onSelect={(asset) => {
          if (asset?.data_url) setSealMade({ dataUrl: asset.data_url });
        }}
      />

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
            <Text style={styles.studioVer}>v2</Text>
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
            <>
              <ScrollView
                style={styles.studioDocScroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.studioDocContent}
              >
                {renderDocs()}
              </ScrollView>
              {renderDock()}
            </>
          )}
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
  fieldsTip: { fontSize: 12, lineHeight: 18, color: colors.ink3, marginTop: 6 },
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

  /* 详情页「签署」入口 */
  detailSignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    height: 48,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  detailSignBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },

  /* 签章托盘 */
  trayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    marginBottom: 8,
    borderRadius: colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  trayItemEmpty: { backgroundColor: colors.surface2, borderStyle: 'dashed' },
  trayThumb: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trayThumbImg: { width: 40, height: 40 },
  trayBody: { flex: 1, minWidth: 0 },
  trayName: { fontSize: 13, fontWeight: '700', color: colors.ink },
  trayStatus: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  trayItemReady: { borderColor: colors.primary },
  trayItemCompact: { flex: 1, marginBottom: 0, padding: 8, gap: 8 },
  trayThumbCompact: { width: 34, height: 34 },
  trayDragZone: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  trayRedo: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  trayHint: { fontSize: 11, color: colors.ink3, lineHeight: 16, marginBottom: 4 },

  /* 窄屏底部固定栏 + 版本角标（角标仅用于自证设备已加载新 bundle） */
  studioDocScroll: { flex: 1 },
  studioVer: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.ink3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  studioDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
  },
  dockTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  dockParty: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '700', color: colors.ink },
  dockPartyStatus: { fontSize: 12, fontWeight: '700' },
  dockDecline: { fontSize: 12, fontWeight: '700', color: colors.error },
  dockTrayRow: { flexDirection: 'row', gap: 8 },
  dockSignBtn: { marginTop: 10, height: 46 },

  /* 已落签章（成品图，含删除角标） */
  stampBox: { position: 'absolute' },
  stampImg: { width: '100%', height: '100%' },
  stampDate: { width: '100%', height: '100%', textAlign: 'center', textAlignVertical: 'center', fontSize: 11, color: colors.ink },
  stampDel: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* 无 PDF 时的正文降级背景 */
  bodyPage: {
    padding: 14,
    minHeight: 400,
    backgroundColor: colors.surface,
  },
  bodyPageText: { fontSize: 12, lineHeight: 20, color: colors.ink2 },

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