/** 电子合同屏幕私有常量（仅本屏使用）。 */
import type Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';

type IoniconName = keyof typeof Ionicons.glyphMap;

export const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'th', label: 'ไทย' },
];

// 上传合同允许的扩展名 → MIME（与后端 ALLOWED_DOCUMENT_TYPES / save_upload 白名单一致）
export const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** 合同类型枚举 → i18n key（详情里此前直接打印后端枚举 lease/purchase/broker） */
export const KIND_LABEL_KEYS: Record<string, string> = {
  lease: 'contract.tmpl.lease',
  purchase: 'contract.tmpl.purchase',
  broker: 'contract.tmpl.broker',
};

export const SOURCE_META: Record<string, { labelKey: string; color: string; bg: string; icon: IoniconName }> = {
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

export const STATUS_META: Record<string, { color: string; bg: string }> = {
  draft: { color: colors.ink2, bg: colors.surface2 },
  pending_approval: { color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  sent: { color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  partially_signed: { color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  signed: { color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
  rejected: { color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
  revoked: { color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) },
  voided: { color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
  expired: { color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1) },
  completed: { color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) },
};

export const ROLE_META: Record<string, string> = {
  landlord: 'contract.roleLandlord',
  owner: 'contract.roleLandlord',
  tenant: 'contract.roleTenant',
  witness: 'contract.roleWitness',
  agent: 'contract.roleAgent',
};

// 签署区类型（field_type）元数据：与后端 sign_method / 签署区枚举一致
export const SIGN_TYPE_META: Record<string, { labelKey: string; icon: IoniconName }> = {
  signature: { labelKey: 'contract.signType.signature', icon: 'create-outline' },
  seal: { labelKey: 'contract.signType.seal', icon: 'business-outline' },
  date: { labelKey: 'contract.signType.date', icon: 'calendar-outline' },
};

export const SIGN_TYPES: string[] = ['signature', 'seal', 'date'];

// 验签报告中的签署方式（SignatureRecord.method）→ i18n key
export const VERIFY_METHOD_LABEL: Record<string, string> = {
  personal_handwrite: 'contract.methodPersonalHandwrite',
  personal_seal: 'contract.methodPersonalSeal',
  company_seal: 'contract.methodCompanySeal',
  date: 'contract.methodDate',
};

// 字段展示元数据：labelKey 为 i18n key，numeric 表示数字键盘。
// 字段名与后端模板渲染函数 render_contract_html / render_purchase_html /
// render_broker_protocol_html 的 counters 取参保持一致。
export const FIELD_META: Record<string, { labelKey: string; numeric?: boolean }> = {
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
export const KIND_FIELDS: Record<string, string[]> = {
  lease: ['landlord_name', 'tenant_name', 'property_address', 'room_number', 'monthly_rent', 'deposit', 'term_months', 'start_date'],
  purchase: ['seller_name', 'seller_id_number', 'buyer_name', 'buyer_id_number', 'property_name', 'room_number', 'property_area', 'total_price', 'price_per_sqm', 'down_payment', 'delivery_date'],
  broker: ['broker_name', 'broker_company', 'broker_phone', 'broker_channel', 'broker_id_number'],
};

export const KIND_ORDER: string[] = ['lease', 'purchase', 'broker'];

export const FALLBACK_TEMPLATES: { kind: string; title: string; content_html?: string }[] = KIND_ORDER.map((kind) => ({
  kind,
  title: `contract.tmpl.${kind}`,
}));
