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
  /** 是否可撤回（员工 + 未完成签署的流转中合同；后端计算态） */
  can_revoke?: boolean
  pdf_available?: boolean
  pdf_page_count?: number
  /** 已签 PDF 签名域健康度（后端计算态，不落库）：invalid → 提示建议重签 */
  signature_health?: 'ok' | 'invalid' | null
  /** 最近一次签章失败（仅员工列表返回）：列表直接标记，无需进详情 */
  sign_error?: boolean
  sign_error_message?: string | null
  /** 是否已产出已签 PDF 存档（决定详情页是否显示「下载已签合同」） */
  signed_pdf_available?: boolean
  /** 签署截止时间（ISO，发送时按有效期写入；为空表示不限） */
  expires_at?: string | null
  /** 是否已过签署有效期（后端计算态） */
  expired?: boolean
  /** 多人签署编排：parallel=可并行，sequential=按序号依次签署 */
  sign_order_type?: 'parallel' | 'sequential'
  /** 签署完成回调地址（仅员工可见） */
  callback_url?: string | null
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
  /** 催办留痕：累计催办次数与最近一次时间（同一方 24 小时内不重复发送） */
  reminded_count?: number
  last_reminded_at?: string
  sign_url?: string
  /** 当前免登录链接的过期时间（仅员工可见；用于「重新生成链接」的可用性判断） */
  sign_token_expires_at?: string
  sign_method?: string
  real_name_verified?: boolean
  /** 签署顺序（0=不限；sequential 下按升序依次签署） */
  sign_order?: number
  /** 此刻是否轮到该方签署（后端计算态） */
  can_sign_now?: boolean
}

// 合同报表统计（GET /contracts/stats；terminated 为新增聚合，不改变 by_status 原值）
export interface ContractStats {
  total: number
  by_status: Record<string, number>
  terminated: {
    count: number
    rate: number
    components: { voided: number; rejected: number; revoked: number }
  }
  period?: { basis: string; start_at: string | null; end_at: string | null }
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
  /** 资产归属：personal=个人，company=企业印章（仅员工可见可用） */
  scope?: 'personal' | 'company'
  /** 企业印章类别：company=公章 / contract=合同章 / legal_rep=法人章（个人资产为空） */
  seal_type?: string | null
  created_at?: string
}

// 签署完成回调投递记录（GET /contracts/{id}/callbacks）
export interface CallbackEvent {
  id: string
  event: string
  url?: string
  status: string // pending | delivered | failed
  attempts: number
  last_error?: string | null
  last_attempt_at?: string | null
  delivered_at?: string | null
  /** 下一次计划重投时间（后台按 30s/2m/10m 补投；成功或耗尽后为空） */
  next_attempt_at?: string | null
  idempotency_key?: string
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
  revoked: 'contracts.stRevoked',
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
