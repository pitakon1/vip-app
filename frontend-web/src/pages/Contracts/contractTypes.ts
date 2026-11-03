/**
 * 合同页共享类型、常量与纯函数。
 * 纯结构拆分自 pages/Contracts/index.tsx，取值与文案 key 保持不变。
 */

export interface TemplateOption {
  kind: string
  title: string
  content_html?: string
}

export interface FieldDef {
  key: string
  label: string
  type?: 'number' | 'date'
}

// 合同模板 → 需填写的 counters 字段（key 与后端 esign_service 渲染函数保持一致）
export const templateKindFields: Record<string, FieldDef[]> = {
  lease: [
    { key: 'landlord_name', label: 'contracts.fLandlord' },
    { key: 'tenant_name', label: 'contracts.fTenant' },
    { key: 'property_address', label: 'contracts.fProperty' },
    { key: 'monthly_rent', label: 'contracts.fRent', type: 'number' },
    { key: 'term_months', label: 'contracts.fMonths', type: 'number' },
  ],
  purchase: [
    { key: 'seller_name', label: 'contracts.fpSeller' },
    { key: 'buyer_name', label: 'contracts.fpBuyer' },
    { key: 'property_address', label: 'contracts.fpProperty' },
    { key: 'room_number', label: 'contracts.fpRoom' },
    { key: 'property_area', label: 'contracts.fpArea', type: 'number' },
    { key: 'total_price', label: 'contracts.fpTotal', type: 'number' },
    { key: 'down_payment', label: 'contracts.fpDown', type: 'number' },
    { key: 'delivery_date', label: 'contracts.fpDelivery', type: 'date' },
  ],
  broker: [
    { key: 'broker_name', label: 'contracts.fbName' },
    { key: 'broker_company', label: 'contracts.fbCompany' },
    { key: 'broker_phone', label: 'contracts.fbPhone' },
    { key: 'broker_channel', label: 'contracts.fbChannel' },
    { key: 'broker_id_number', label: 'contracts.fbId' },
  ],
}

export interface Contract {
  id: string
  title: string
  status: string
  language?: string
  document_hash?: string
  content_html?: string
  created_at?: string
  source?: string
  file_path?: string
  can_edit?: boolean
  pdf_available?: boolean
  pdf_page_count?: number
}

export interface Party {
  id: string
  name: string
  role: string
  signed?: boolean
  signature?: string
  email?: string
  phone?: string
  declined_at?: string
  decline_reason?: string
  sign_url?: string
  sign_method?: string
  real_name_verified?: boolean
}

// 签署区字段（与后端 SignFieldType / GET /contracts/{id} sign_fields 一致）
export interface SignField {
  id?: string
  party_id: string | null
  field_type: string // signature | seal | date
  page: number
  x: number
  y: number
  w: number
  h: number
  required: boolean
  signed: boolean
  signed_at?: string | null
}

// 关键字签署命中项（与 POST /keyword-search 返回的 hit 一致；坐标一律语义化展示）
export interface KeywordHit {
  page: number
  x: number
  y: number
  w: number
  h: number
  text?: string
}

// 签名/印章资产（与 signAssetsApi 返回一致）
export interface SignAsset {
  id: string
  name: string
  asset_type: string // handwrite | seal
  source: string // drew | upload | imprint
  data_url: string
  created_at?: string
}

// 放置签署框时可选的 field_type（手写签名 / 公章 / 日期）
// label 必须带 `contracts.` 命名空间：渲染处直接 t(o.label)，
// 只用裸 key（fieldSig）会查不到词条、界面上暴露原始 key。
export const FIELD_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'signature', label: 'contracts.fieldSig' },
  { value: 'seal', label: 'contracts.fieldSeal' },
  { value: 'date', label: 'contracts.fieldDate' },
]

// 可选 field_type → 签署 method（后端 SignMethod）；seal 走公司章
export const FIELD_METHOD: Record<string, string> = {
  signature: 'personal_handwrite',
  seal: 'company_seal',
  date: 'date',
}

export const statusLabel: Record<string, string> = {
  draft: 'contracts.stDraft',
  sent: 'contracts.stPendingSign',
  partially_signed: 'contracts.stPendingSign',
  signed: 'contracts.stSigned',
  completed: 'contracts.stCompleted',
  voided: 'contracts.stVoided',
  expired: 'contracts.stExpired',
  rejected: 'contracts.stRejected',
}

export const sourceLabel: Record<string, string> = {
  generated: 'contracts.sourceGenerated',
  uploaded: 'contracts.sourceUploaded',
}

// 上传白名单（与后端一致）：pdf / word / 常见图片
export const UPLOAD_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif'

/* 把后端返回的签署链接补成绝对地址。
   后端 `_sign_url` 在未配置 PUBLIC_WEB_BASE_URL 时只返回相对路径 `/sign/:token`，
   这种链接一旦离开当前浏览器会话（复制粘贴、转发、短信/邮件通知）客户就打不开。
   因此凡是把签署链接展示或复制出去的地方，都必须先经这里补上站点 origin。 */
export const absSignUrl = (url?: string | null) =>
  url ? (/^https?:\/\//.test(url) ? url : `${window.location.origin}${url}`) : ''

// 关键字签署默认词：回填对应签署方式的关键字占位（须与合同正文文字一致，故固定字面量而非按 UI 语言翻译）
export const DEFAULT_KEYWORD_BY_TYPE: Record<string, string> = {
  seal: '电子印章盖章处',
  signature: '个人手写签名处',
  date: '签署日期',
}
