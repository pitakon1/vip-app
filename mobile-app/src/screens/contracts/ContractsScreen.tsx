/**
 * 员工/管理端「电子合同」管理页。
 *
 * 共用后端 contractsApi（员工可见全量，可生成 / 追加签署方 / 复制签署链接 /
 * 推送签署通知 / 编辑 / 作废 / 上传电子合同文件）。
 *
 * 只读字段由后端返回，`can_edit` 为 false 时仅展示、隐藏全部写操作。
 * 功能图标一律 SVG（Ionicons），长列表用 FlatList；文本全部走 i18n 三语。
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
  TextInput,
  Modal,
  ScrollView,
  Clipboard,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { contractsApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';

type IoniconName = keyof typeof Ionicons.glyphMap;

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'th', label: 'ไทย' },
];

const stripHtml = (html?: string) =>
  (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

// 上传合同允许的扩展名 → MIME（与后端 ALLOWED_DOCUMENT_TYPES / save_upload 白名单一致）
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

// 由选中文档构造上传文件对象 { uri, name, type }：name 需带正确扩展名
const resolveUploadFile = (asset: any) => {
  const rawName = asset?.name || '';
  const extMatch = /\.([A-Za-z0-9]+)$/.exec(rawName);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  let mime = asset?.mimeType || '';
  if (!mime) {
    const uriExt = /\.([A-Za-z0-9]+)$/.exec(asset?.uri || '')?.[1]?.toLowerCase() || '';
    mime = EXT_MIME[uriExt] || EXT_MIME[ext] || '';
  }
  const resolvedExt = ext || Object.keys(EXT_MIME).find((k) => EXT_MIME[k] === mime) || '';
  const name = rawName || (resolvedExt ? `contract.${resolvedExt}` : 'contract');
  const finalName = /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.${resolvedExt || ''}`.replace(/\.$/, '');
  return {
    uri: asset?.uri,
    name: finalName,
    type: mime || 'application/octet-stream',
  } as any;
};

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '-');

const SOURCE_META: Record<string, { labelKey: string; color: string; bg: string; icon: IoniconName }> = {
  generated: {
    labelKey: 'contract.sourceGenerated',
    color: colors.primary,
    bg: colors.alpha(colors.primaryRgb, 0.1),
    icon: 'document-text-outline',
  },
  uploaded: {
    labelKey: 'contract.sourceUploaded',
    color: colors.info,
    bg: colors.alpha(colors.infoRgb, 0.1),
    icon: 'cloud-upload-outline',
  },
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

// 签署区类型（field_type）元数据：与后端 sign_method / 签署区枚举一致
const SIGN_TYPE_META: Record<string, { labelKey: string; icon: IoniconName }> = {
  signature: { labelKey: 'contract.signType.signature', icon: 'create-outline' },
  seal: { labelKey: 'contract.signType.seal', icon: 'business-outline' },
  date: { labelKey: 'contract.signType.date', icon: 'calendar-outline' },
};

const SIGN_TYPES: string[] = ['signature', 'seal', 'date'];

// 字段展示元数据：labelKey 为 i18n key，numeric 表示数字键盘。
// 字段名与后端模板渲染函数 render_contract_html / render_purchase_html /
// render_broker_protocol_html 的 counters 取参保持一致。
const FIELD_META: Record<string, { labelKey: string; numeric?: boolean }> = {
  // lease（租赁合同）
  landlord_name: { labelKey: 'contract.landlord' },
  tenant_name: { labelKey: 'contract.tenant' },
  property_address: { labelKey: 'contract.property' },
  room_number: { labelKey: 'contract.room' },
  monthly_rent: { labelKey: 'contract.rent', numeric: true },
  deposit: { labelKey: 'contract.deposit', numeric: true },
  term_months: { labelKey: 'contract.term', numeric: true },
  start_date: { labelKey: 'contract.startDate' },
  // purchase（房屋买卖合同）
  seller_name: { labelKey: 'contract.sellerName' },
  seller_id_number: { labelKey: 'contract.sellerId' },
  buyer_name: { labelKey: 'contract.buyerName' },
  buyer_id_number: { labelKey: 'contract.buyerId' },
  property_name: { labelKey: 'contract.propertyName' },
  property_area: { labelKey: 'contract.area', numeric: true },
  total_price: { labelKey: 'contract.totalPrice', numeric: true },
  price_per_sqm: { labelKey: 'contract.pricePerSqm', numeric: true },
  down_payment: { labelKey: 'contract.downPayment', numeric: true },
  delivery_date: { labelKey: 'contract.deliveryDate' },
  // broker（经纪人协议）
  broker_name: { labelKey: 'contract.brokerName' },
  broker_company: { labelKey: 'contract.brokerCompany' },
  broker_phone: { labelKey: 'contract.brokerPhone' },
  broker_channel: { labelKey: 'contract.brokerChannel' },
  broker_id_number: { labelKey: 'contract.brokerId' },
};

// 各模板(kind)应填写的字段组，与 FIELD_META / 后端渲染参数一致。
const KIND_FIELDS: Record<string, string[]> = {
  lease: ['landlord_name', 'tenant_name', 'property_address', 'room_number', 'monthly_rent', 'deposit', 'term_months', 'start_date'],
  purchase: ['seller_name', 'seller_id_number', 'buyer_name', 'buyer_id_number', 'property_name', 'room_number', 'property_area', 'total_price', 'price_per_sqm', 'down_payment', 'delivery_date'],
  broker: ['broker_name', 'broker_company', 'broker_phone', 'broker_channel', 'broker_id_number'],
};

const KIND_ORDER: string[] = ['lease', 'purchase', 'broker'];

const FALLBACK_TEMPLATES: { kind: string; title: string; content_html?: string }[] = KIND_ORDER.map((kind) => ({
  kind,
  title: `contract.tmpl.${kind}`,
}));

interface ContractItem {
  id: string;
  title?: string;
  kind?: string;
  source?: string;
  status?: string;
  language?: string;
  created_at?: string;
}

export default function ContractsScreen() {
  const { t } = useI18n();
  const [list, setList] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // 详情
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 生成表单
  const [showGenerate, setShowGenerate] = useState(false);
  const [templates, setTemplates] = useState<{ kind: string; title: string; content_html?: string }[]>([]);
  const [genKind, setGenKind] = useState('lease');
  const [genLang, setGenLang] = useState('zh');
  const [genForm, setGenForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(FIELD_META).map((f) => [f, '' as string]))
  );
  const [generating, setGenerating] = useState(false);

  // 追加签署方
  const [showParty, setShowParty] = useState(false);
  const [partyForm, setPartyForm] = useState({ name: '', email: '', role: 'tenant' });
  const [partyBusy, setPartyBusy] = useState(false);

  // 添加签署区（法大大风格）
  const [showAddFields, setShowAddFields] = useState(false);
  const [fieldForm, setFieldForm] = useState({
    party_id: '',
    type: 'signature',
    page: '1',
    x: '50',
    y: '40',
  });
  const [fieldsBusy, setFieldsBusy] = useState<string | boolean>(false);

  // 验签
  const [verifyData, setVerifyData] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // 编辑
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', content_html: '' });
  const [editBusy, setEditBusy] = useState(false);

  // 作废
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);

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

  // 加载合同模板类型（后端 /contracts/templates）；失败时回退内置三模板
  useEffect(() => {
    (async () => {
      try {
        const res: any = await contractsApi.listTemplates();
        const data = Array.isArray(res?.data) ? res.data : null;
        if (data && data.length) {
          setTemplates(data);
          if (!data.some((item: any) => item.kind === genKind) && data[0]) {
            setGenKind(data[0].kind);
          }
        } else {
          setTemplates(FALLBACK_TEMPLATES);
        }
      } catch {
        setTemplates(FALLBACK_TEMPLATES);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const closeDetail = useCallback(() => setDetail(null), []);

  const copyText = (text: string) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-console
      navigator.clipboard?.writeText(text).catch(() => {});
    } else {
      Clipboard.setString(text);
    }
  };

  /* ===== 生成合同 ===== */
  const submitGenerate = async () => {
    setGenerating(true);
    const kind = genKind;
    const counters: any = {};
    (KIND_FIELDS[kind] ?? []).forEach((f) => {
      if (genForm[f]) counters[f] = genForm[f];
    });
    try {
      await contractsApi.generate({ counters, language: genLang, kind });
      notify(t('contract.generateDone'));
      setShowGenerate(false);
      await load(true);
    } catch (e) {
      notifyError(t('contract.generateTitle'), e);
    } finally {
      setGenerating(false);
    }
  };

  /* ===== 复制签署链接 ===== */
  const handleShareLink = async (partyId: string) => {
    if (!detail?.id) return;
    setBusyAction(`link-${partyId}`);
    try {
      const res: any = await contractsApi.createShareLink(detail.id, partyId);
      const url = res?.data?.url ?? res?.data?.token ?? '';
      if (!url) {
        notifyError(t('contract.linkCopied'), new Error(t('contract.unknown')));
        return;
      }
      const full = /^https?:/.test(url) ? url : `${url}`;
      copyText(full);
      notify(t('contract.linkCopied'), full);
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.copyLink'), e);
    } finally {
      setBusyAction(null);
    }
  };

  /* ===== 发送签署通知 ===== */
  const handleSend = async () => {
    if (!detail?.id) return;
    setBusyAction('send');
    try {
      await contractsApi.sendContract(detail.id, {});
      notify(t('contract.sendDone'));
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.sendNotice'), e);
    } finally {
      setBusyAction(null);
    }
  };

  /* ===== 追加签署方 ===== */
  const submitParty = async () => {
    if (!detail?.id || !partyForm.name.trim()) {
      notify(t('contract.insert'));
      return;
    }
    setPartyBusy(true);
    try {
      await contractsApi.addParty(detail.id, {
        name: partyForm.name.trim(),
        email: partyForm.email.trim() || undefined,
        role: partyForm.role || 'tenant',
      });
      notify(t('contract.addParty'));
      setShowParty(false);
      setPartyForm({ name: '', email: '', role: 'tenant' });
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.addParty'), e);
    } finally {
      setPartyBusy(false);
    }
  };

  /* ===== 添加签署区（法大大风格）===== */
  const openAddFields = () => {
    // 默认选中第一个未签署方
    const target = parties.find((p: any) => !p?.signed && !!p?.id) ?? parties[0];
    setFieldForm({
      party_id: String(target?.id ?? ''),
      type: 'signature',
      page: '1',
      x: '50',
      y: '40',
    });
    setShowAddFields(true);
  };

  const commitFields = async (fields: any[]) => {
    if (!detail?.id || !fields.length) return;
    setFieldsBusy(true);
    try {
      await contractsApi.saveSignFields(detail.id, fields);
      notify(t('contract.createFieldsDone'));
      setShowAddFields(false);
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.createFieldsDone'), e);
    } finally {
      setFieldsBusy(false);
    }
  };

  // 表单式添加单个签署区
  const submitField = async () => {
    if (!fieldForm.party_id) {
      notify(t('contract.insert'));
      return;
    }
    await commitFields([
      {
        party_id: fieldForm.party_id,
        field_type: fieldForm.type,
        page: Number(fieldForm.page) || 1,
        // 签署区坐标统一为页面百分比(0-100)
        x: Number(fieldForm.x) || 0,
        y: Number(fieldForm.y) || 0,
      },
    ]);
  };

  // 默认布局：按文档位置错开摆放未签署方的签名位（百分比 0-100）
  const applyDefaultLayout = async () => {
    const targets = parties.filter((p: any) => !p?.signed && !!p?.id);
    if (!targets.length) {
      notify(t('contract.insert'));
      return;
    }
    const fields = targets.map((p: any, i: number) => ({
      party_id: String(p.id),
      field_type: 'signature',
      page: 1,
      x: i % 2 === 0 ? 25 : 65,
      y: 55 + (i % 2) * 25 + Math.floor(i / 2) * 12,
    }));
    await commitFields(fields);
  };

  const removeField = async (fieldId: string) => {
    if (!detail?.id) return;
    setFieldsBusy(`ff-${fieldId}`);
    try {
      await contractsApi.deleteSignField(detail.id, fieldId);
      notify(t('contract.deleteFieldsDone'));
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.deleteFieldsDone'), e);
    } finally {
      setFieldsBusy(false);
    }
  };

  /* ===== 验签 ===== */
  const doVerify = async () => {
    if (!detail?.id) return;
    setVerifyLoading(true);
    try {
      const res: any = await contractsApi.verify(detail.id);
      setVerifyData(res?.data ?? {});
    } catch (e) {
      notifyError(t('contract.verifyError'), e);
    } finally {
      setVerifyLoading(false);
    }
  };

  /* ===== 编辑 ===== */
  const openEditor = () => {
    setEditForm({ title: detail?.title ?? '', content_html: detail?.content_html ?? '' });
    setShowEdit(true);
  };
  const submitEdit = async () => {
    if (!detail?.id) return;
    setEditBusy(true);
    try {
      await contractsApi.updateContract(detail.id, {
        title: editForm.title.trim(),
        content_html: editForm.content_html,
      });
      notify(t('contract.save'));
      setShowEdit(false);
      await openDetail(detail.id);
      await load(true);
    } catch (e) {
      notifyError(t('contract.editContent'), e);
    } finally {
      setEditBusy(false);
    }
  };

  /* ===== 作废 ===== */
  const doVoid = async () => {
    if (!detail?.id) return;
    setVoidBusy(true);
    try {
      await contractsApi.voidContract(detail.id, voidReason.trim() || undefined);
      notify(t('contract.void'));
      setShowVoid(false);
      setVoidReason('');
      closeDetail();
      await load(true);
    } catch (e) {
      notifyError(t('contract.void'), e);
    } finally {
      setVoidBusy(false);
    }
  };

  /* ===== 上传电子合同 ===== */
  const handleUpload = async () => {
    if (!detail?.id) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = resolveUploadFile(result.assets[0]);
      setBusyAction('upload');
      await contractsApi.uploadFile(detail.id, file);
      notify(t('contract.uploadDone'));
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.upload'), e);
    } finally {
      setBusyAction(null);
    }
  };

  const canEdit = !!detail?.can_edit;
  const parties: any[] = Array.isArray(detail?.parties) ? detail.parties : [];
  const signFields: any[] = Array.isArray(detail?.sign_fields) ? detail.sign_fields : [];
  // 当前选中模板的范本正文（后端用空字段渲染出的标准样张），无 content_html 时展示内置字段表样例
  const genPreviewHtml =
    (templates.length ? templates : FALLBACK_TEMPLATES).find((item) => item.kind === genKind)?.content_html || '';
  const genPreviewText = genPreviewHtml
    ? stripHtml(genPreviewHtml)
    : (KIND_FIELDS[genKind] ?? []).map((f) => `· ${t(FIELD_META[f].labelKey)}: ____`).join('\n');

  const renderSource = (source?: string) => {
    const meta = SOURCE_META[source ?? ''] ?? SOURCE_META.generated;
    return (
      <View style={[styles.badge, { backgroundColor: meta.bg }]}>
        <Ionicons
          name={meta.icon}
          size={11}
          color={meta.color}
          style={{ marginRight: 3 }}
        />
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

  const field = (label: string, value?: string) => (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} selectable>{value || '-'}</Text>
    </View>
  );

  const renderParty = (p: any, idx: number) => {
    const statusMeta = p?.signed
      ? { labelKey: 'contract.signed', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) }
      : p?.declined_at
      ? { labelKey: 'contract.declined', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) }
      : { labelKey: 'contract.unsigned', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) };
    return (
      <View key={p?.id ?? idx} style={styles.partyCard}>
        <View style={styles.partyHead}>
          <View style={styles.partyId}>
            <Text style={styles.partyName}>{p?.name || t('contract.unknown')}</Text>
            {p?.role ? <Text style={styles.partyRole}>{t(ROLE_META[p.role] ?? 'contract.roleOther')}</Text> : null}
          </View>
          <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
            <Text style={[styles.badgeText, { color: statusMeta.color }]}>{t(statusMeta.labelKey)}</Text>
          </View>
        </View>
        {!!p?.email && <Text style={styles.partyMeta}>{`${t('contract.email')}：${p.email}`}</Text>}
        {!!p?.phone && <Text style={styles.partyMeta}>{`${t('contract.phone')}：${p.phone}`}</Text>}
        {!!p?.signed_at && <Text style={styles.partyMeta}>{`${t('contract.signedAt')}：${fmtDate(p.signed_at)}`}</Text>}
        {!!p?.decline_reason && <Text style={[styles.partyMeta, styles.partyDecline]}>{`${t('contract.declineReason')}：${p.decline_reason}`}</Text>}
        {canEdit && !p?.signed && !!p?.id ? (
          <View style={styles.partyActions}>
            <TouchableOpacity
              style={styles.miniBtn}
              activeOpacity={0.8}
              disabled={busyAction === `link-${p.id}`}
              onPress={() => handleShareLink(String(p.id))}
            >
              {busyAction === `link-${p.id}` ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="link-outline" size={14} color={colors.primary} />
                  <Text style={styles.miniBtnText}>{t('contract.copyLink')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  const renderSignField = (f: any, idx: number) => {
    const meta = SIGN_TYPE_META[f?.field_type ?? 'signature'] ?? SIGN_TYPE_META.signature;
    const party = parties.find((p: any) => String(p?.id) === String(f?.party_id));
    const signed = !!f?.signed;
    const statusColor = signed ? colors.success : colors.warning;
    const statusBg = signed
      ? colors.alpha(colors.successRgb, 0.12)
      : colors.alpha(colors.warningRgb, 0.12);
    return (
      <View key={f?.id ?? idx} style={styles.fieldCard}>
        <Ionicons name={meta.icon} size={18} color={colors.primary} />
        <View style={styles.fieldBody}>
          <Text style={styles.fieldName} numberOfLines={1}>
            {t(meta.labelKey)} · {party?.name || t('contract.unknown')}
          </Text>
          <Text style={styles.fieldMeta}>
            {t('contract.page')} {f?.page ?? 1} · {t('contract.coordX')} {Math.round((f?.x ?? 0) as number)} · {t('contract.coordY')} {Math.round((f?.y ?? 0) as number)}
          </Text>
          {!!f?.signed_at && (
            <Text style={styles.fieldMeta}>
              {t('contract.signedAt')}：{fmtDate(f.signed_at)}
            </Text>
          )}
        </View>
        <View style={styles.fieldRight}>
          <View style={[styles.badge, { backgroundColor: statusBg }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {t(signed ? 'contract.fieldDone' : 'contract.fieldPending')}
            </Text>
          </View>
          {canEdit && !signed && !!f?.id && (
            <TouchableOpacity
              style={styles.miniDelBtn}
              activeOpacity={0.8}
              disabled={fieldsBusy === `ff-${f.id}`}
              onPress={() => removeField(String(f.id))}
            >
              {fieldsBusy === `ff-${f.id}` ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Ionicons name="trash-outline" size={15} color={colors.error} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderRow = ({ item }: { item: ContractItem }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      onPress={() => openDetail(item.id)}
    >
      <View style={styles.rowIcon}>
        <Ionicons
          name={(SOURCE_META[item.source ?? ''] ?? SOURCE_META.generated).icon}
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
        <LoadingState label={t('pub.loading') ?? '加载中…'} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
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
        ListHeaderComponent={
          <View>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.85}
              onPress={() => setShowGenerate(true)}
            >
              <Ionicons name="add" size={18} color={colors.primaryForeground} />
              <Text style={styles.primaryBtnText}>{t('contract.generateTitle')}</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>{t('contract.manage')}</Text>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title={t('contract.loadFail')}
              actionLabel={t('pub.retry')}
              onAction={() => load()}
            />
          ) : (
            <EmptyState icon="document-text-outline" title={t('contract.empty')} sub={t('contract.emptyHint')} />
          )
        }
      />

      {/* ===== 生成合同 ===== */}
      <Modal visible={showGenerate} animationType="slide" transparent onRequestClose={() => setShowGenerate(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.generateTitle')}</Text>
              <TouchableOpacity onPress={() => setShowGenerate(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldSectionTitle}>{t('contract.formTemplate')}</Text>
              <View style={styles.langRow}>
                {(templates.length ? templates : FALLBACK_TEMPLATES).map((item) => {
                  const active = genKind === item.kind;
                  return (
                    <TouchableOpacity
                      key={item.kind}
                      style={[styles.chip, active && styles.chipActive]}
                      activeOpacity={0.8}
                      onPress={() => setGenKind(item.kind)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t(`contract.tmpl.${item.kind}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.genPreviewBox}>
                <Text style={styles.genPreviewTitle}>{t('contract.templatePreview')}</Text>
                <ScrollView style={styles.genPreviewScroll} nestedScrollEnabled>
                  <Text style={styles.genPreviewText} selectable>{genPreviewText}</Text>
                </ScrollView>
              </View>
              {(KIND_FIELDS[genKind] ?? []).map((f) => {
                const meta = FIELD_META[f];
                return (
                  <TextInput
                    key={f}
                    style={styles.input}
                    placeholder={t(meta.labelKey)}
                    keyboardType={meta.numeric ? 'numeric' : 'default'}
                    value={genForm[f]}
                    onChangeText={(v) => setGenForm({ ...genForm, [f]: v })}
                    placeholderTextColor={colors.ink3}
                  />
                );
              })}
              <View style={styles.langRow}>
                {LANG_OPTIONS.map((opt) => {
                  const active = genLang === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setGenLang(opt.value)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, generating && styles.btnDisabled]}
                activeOpacity={0.85}
                disabled={generating}
                onPress={submitGenerate}
              >
                {generating ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('contract.generateSubmit')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== 详情 ===== */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.detailWrap}>
          <View style={styles.detailHead}>
            <TouchableOpacity style={styles.detailBack} onPress={closeDetail} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={24} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.detailTitle} numberOfLines={1}>{detail?.title || t('contract.manage')}</Text>
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
              {field(t('contract.titleLabel'), detail?.title)}
              {field(t('contract.kind'), detail?.kind)}
              {field(t('contract.created_at'), fmtDate(detail?.created_at))}
              {!!detail?.file_path && field(t('contract.upload'), detail.file_path)}

              <Text style={styles.sectionTitle}>{t('contract.parties')}</Text>
              {detail?.parties?.length ? detail.parties.map(renderParty) : (
                <Text style={styles.partyNone}>{t('contract.empty')}</Text>
              )}

              <Text style={styles.sectionTitle}>{t('contract.signFields')}</Text>
              {signFields.length ? (
                <>
                  <Text style={styles.fieldsTip}>{t('contract.fieldsTip')}</Text>
                  <View style={styles.fieldsList}>{signFields.map(renderSignField)}</View>
                </>
              ) : (
                <Text style={styles.partyNone}>{t('contract.noSignFields')}</Text>
              )}

              {canEdit ? (
                <>
                  <View style={styles.actionWrap}>
                    <TouchableOpacity style={[styles.actionBtn, busyAction === 'send' && styles.btnDisabled]} onPress={handleSend} disabled={busyAction === 'send'}>
                      <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />
                      <Text style={styles.actionBtnText}>{t('contract.sendNotice')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={openAddFields}>
                      <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                      <Text style={styles.actionBtnText}>{t('contract.addSignField')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={doVerify}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
                      <Text style={styles.actionBtnText}>{t('contract.verify')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setShowParty(true)}>
                      <Ionicons name="person-add-outline" size={16} color={colors.primary} />
                      <Text style={styles.actionBtnText}>{t('contract.addParty')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={openEditor}>
                      <Ionicons name="create-outline" size={16} color={colors.primary} />
                      <Text style={styles.actionBtnText}>{t('contract.edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleUpload} disabled={busyAction === 'upload'}>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                      <Text style={styles.actionBtnText}>{t('contract.upload')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => setShowVoid(true)}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={[styles.actionBtnText, { color: colors.error }]}>{t('contract.void')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={styles.readOnlyHint}>{t('contract.onlyEditable')}</Text>
              )}

              {!!detail?.content_html && (
                <>
                  <Text style={styles.sectionTitle}>{t('contract.content')}</Text>
                  <View style={styles.contentBox}>
                    <Text style={styles.contentText} selectable>{stripHtml(detail.content_html)}</Text>
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ===== 追加签署方 ===== */}
      <Modal visible={showParty} animationType="fade" transparent onRequestClose={() => setShowParty(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.addParty')}</Text>
              <TouchableOpacity onPress={() => setShowParty(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder={t('contract.name')} value={partyForm.name} onChangeText={(v) => setPartyForm({ ...partyForm, name: v })} placeholderTextColor={colors.ink3} />
            <TextInput style={styles.input} placeholder={t('contract.email')} keyboardType="email-address" value={partyForm.email} onChangeText={(v) => setPartyForm({ ...partyForm, email: v })} placeholderTextColor={colors.ink3} />
            <View style={styles.langRow}>
              {(['tenant', 'landlord', 'witness'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, partyForm.role === r && styles.chipActive]}
                  onPress={() => setPartyForm({ ...partyForm, role: r })}
                >
                  <Text style={[styles.chipText, partyForm.role === r && styles.chipTextActive]}>
                    {t(ROLE_META[r] ?? 'contract.roleOther')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.primaryBtn, partyBusy && styles.btnDisabled]} activeOpacity={0.85} disabled={partyBusy} onPress={submitParty}>
              {partyBusy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>{t('contract.confirm')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== 编辑 ===== */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => setShowEdit(false)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, styles.modalCardTall]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.editContent')}</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder={t('contract.titleLabel')} value={editForm.title} onChangeText={(v) => setEditForm({ ...editForm, title: v })} placeholderTextColor={colors.ink3} />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('contract.contentLabel')}
              value={editForm.content_html}
              onChangeText={(v) => setEditForm({ ...editForm, content_html: v })}
              placeholderTextColor={colors.ink3}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity style={[styles.primaryBtn, editBusy && styles.btnDisabled]} activeOpacity={0.85} disabled={editBusy} onPress={submitEdit}>
              {editBusy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>{t('contract.save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== 作废 ===== */}
      <Modal visible={showVoid} animationType="fade" transparent onRequestClose={() => setShowVoid(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.voidTitle')}</Text>
              <TouchableOpacity onPress={() => setShowVoid(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.voidHint}>{t('contract.voidConfirm')}</Text>
            <TextInput style={styles.input} placeholder={t('contract.voidReason')} value={voidReason} onChangeText={setVoidReason} placeholderTextColor={colors.ink3} />
            <TouchableOpacity style={[styles.primaryBtn, styles.dangerBtn, voidBusy && styles.btnDisabled]} activeOpacity={0.85} disabled={voidBusy} onPress={doVoid}>
              {voidBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerBtnText}>{t('contract.void')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== 添加签署区 ===== */}
      <Modal visible={showAddFields} animationType="slide" transparent onRequestClose={() => setShowAddFields(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.addSignField')}</Text>
              <TouchableOpacity onPress={() => setShowAddFields(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldSectionTitle}>{t('contract.fieldSelectParty')}</Text>
              <View style={styles.langRow}>
                {parties.filter((p: any) => !!p?.id).map((p: any) => {
                  const active = fieldForm.party_id === String(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, active && styles.chipActive]}
                      activeOpacity={0.8}
                      onPress={() => setFieldForm({ ...fieldForm, party_id: String(p.id) })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                        {p?.name || t('contract.unknown')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.fieldSectionTitle}>{t('contract.signFieldType')}</Text>
              <View style={styles.langRow}>
                {SIGN_TYPES.map((type) => {
                  const active = fieldForm.type === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chip, active && styles.chipActive]}
                      activeOpacity={0.8}
                      onPress={() => setFieldForm({ ...fieldForm, type })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t(SIGN_TYPE_META[type].labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.fieldSectionTitle}>{t('contract.fieldPosTitle')}</Text>
              <View style={styles.coordRow}>
                <TextInput
                  style={[styles.input, styles.coordInput]}
                  placeholder={t('contract.page')}
                  keyboardType="numeric"
                  value={fieldForm.page}
                  onChangeText={(v) => setFieldForm({ ...fieldForm, page: v })}
                  placeholderTextColor={colors.ink3}
                />
                <TextInput
                  style={[styles.input, styles.coordInput]}
                  placeholder={t('contract.coordX')}
                  keyboardType="numeric"
                  value={fieldForm.x}
                  onChangeText={(v) => setFieldForm({ ...fieldForm, x: v })}
                  placeholderTextColor={colors.ink3}
                />
                <TextInput
                  style={[styles.input, styles.coordInput]}
                  placeholder={t('contract.coordY')}
                  keyboardType="numeric"
                  value={fieldForm.y}
                  onChangeText={(v) => setFieldForm({ ...fieldForm, y: v })}
                  placeholderTextColor={colors.ink3}
                />
              </View>
              <TouchableOpacity style={styles.defaultBtn} activeOpacity={0.8} onPress={applyDefaultLayout}>
                <Ionicons name="grid-outline" size={15} color={colors.primary} />
                <Text style={styles.defaultBtnText}>{t('contract.defaultLayout')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, !!fieldsBusy && styles.btnDisabled]}
                activeOpacity={0.85}
                disabled={!!fieldsBusy}
                onPress={submitField}
              >
                {!!fieldsBusy ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('contract.confirm')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== 验签报告 ===== */}
      <Modal visible={!!verifyData} animationType="slide" transparent onRequestClose={() => setVerifyData(null)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, styles.modalCardTall]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('contract.verifyTitle')}</Text>
              <TouchableOpacity onPress={() => setVerifyData(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            {verifyLoading ? (
              <View style={styles.center}><LoadingState label={t('contract.verify')} /></View>
            ) : (
              <ScrollView>
                {verifyData?.tampered != null && (
                  <View style={[styles.badge, { alignSelf: 'flex-start', marginBottom: 12, backgroundColor: verifyData.tampered ? colors.alpha(colors.errorRgb, 0.12) : colors.alpha(colors.successRgb, 0.12) }]}>
                    <Text style={[styles.badgeText, { color: verifyData.tampered ? colors.error : colors.success }]}>
                      {t(verifyData.tampered ? 'contract.verifyTampered' : 'contract.verifyIntact')}
                    </Text>
                  </View>
                )}
                {verifyData?.document_hash != null && field(t('contract.verifyDocumentHash'), String(verifyData.document_hash))}
                {!!verifyData?.sign_types_summary && field(t('contract.verifySignTypes'), String(verifyData.sign_types_summary))}
                <Text style={styles.sectionTitle}>{t('contract.verifySignatures')}</Text>
                {Array.isArray(verifyData?.signatures) && verifyData.signatures.length ? (
                  verifyData.signatures.map((sig: any, idx: number) => (
                    <View key={idx} style={styles.partyCard}>
                      {field(t('contract.verifyMethod'), String(sig?.method ?? '-'))}
                      {field(t('contract.verifySignedAt'), fmtDate(sig?.signed_at))}
                      {field(t('contract.verifyIp'), String(sig?.ip ?? '-'))}
                      {field(t('contract.verifyHash'), String(sig?.signature_hash ?? '-'))}
                      {field(t('contract.verifySigResultId'), t(sig?.signature_success ? 'contract.verifyOk' : 'contract.verifyFail'))}
                    </View>
                  ))
                ) : (
                  <Text style={styles.partyNone}>{t('contract.noSignFields')}</Text>
                )}
              </ScrollView>
            )}
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
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: colors.radius.md,
    marginTop: 14,
    minHeight: 46,
  },
  primaryBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2, marginTop: 18, marginBottom: 10 },
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
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.radius.full,
  },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '700' },

  /* 模态 */
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  modalCardTall: { height: '80%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 12,
  },
  textArea: { minHeight: 160 },
  fieldSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.ink3, marginBottom: 8 },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },
  /* 生成合同：范本预览 */
  genPreviewBox: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  genPreviewTitle: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink3,
  },
  genPreviewScroll: { maxHeight: 300, paddingHorizontal: 12 },
  genPreviewText: { fontSize: 13, color: colors.ink2, lineHeight: 20, paddingVertical: 10 },

  /* 详情 */
  detailWrap: { flex: 1, backgroundColor: colors.background },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  detailBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { flex: 1, textAlign: 'center', fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  detailContent: { padding: colors.spacing.md, paddingBottom: 48 },
  detailStatusRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 14, color: colors.ink3 },
  fieldValue: { fontSize: 14, color: colors.ink, maxWidth: '65%', textAlign: 'right' },
  partyCard: { backgroundColor: colors.surface, borderRadius: colors.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14, marginBottom: 10 },
  partyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  partyId: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partyName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  partyRole: { fontSize: 12, color: colors.primary, backgroundColor: colors.sidebarActive, paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full, overflow: 'hidden' },
  partyMeta: { fontSize: 13, color: colors.ink2, marginTop: 3 },
  partyDecline: { color: colors.error },
  partyActions: { marginTop: 10 },
  partyNone: { fontSize: 13, color: colors.ink3 },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  miniBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  actionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  actionDanger: { borderColor: colors.error },
  readOnlyHint: { fontSize: 13, color: colors.ink3, marginTop: 12 },
  contentBox: { backgroundColor: colors.surface, borderRadius: colors.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14 },
  contentText: { fontSize: 13, color: colors.ink2, lineHeight: 20 },
  voidHint: { fontSize: 14, color: colors.ink2, marginBottom: 12 },
  dangerBtn: { backgroundColor: colors.error },
  dangerBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  /* 签署区 */
  fieldsTip: { fontSize: 12, color: colors.ink3, marginBottom: 8 },
  fieldsList: { gap: 8, marginBottom: 4 },
  fieldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
  },
  fieldBody: { flex: 1, minWidth: 0 },
  fieldName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  fieldMeta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  fieldRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniDelBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  coordRow: { flexDirection: 'row', gap: 8 },
  coordInput: { flex: 1 },
  defaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  defaultBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});