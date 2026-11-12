export type Phase = 'loading' | 'ready' | 'done'
export type FailType = 'expired' | 'closed' | 'signed' | 'generic' | null
export type TrayKind = 'seal' | 'sign'

export interface ContractDoc {
  contract_id?: string
  title?: string
  content_html?: string
  source?: string
  file_url?: string
  party_name_masked?: string
  party_role?: string
  /** 发起方姓名（后端 C-03B 上线后返回；缺失时前端降级为「复制合同链接」） */
  initiator_name?: string | null
  /** 发起方脱敏手机号，如 138****1234；不提供完整号码 */
  initiator_phone_masked?: string | null
  real_name_verified?: boolean
  sign_method?: string
  pdf_available?: boolean
  pdf_page_count?: number
  party?: { id?: string; name?: string; sign_method?: string; real_name_verified?: boolean }
  /** 管理端（或关键字）预置的签署区，坐标同为页面百分比 */
  sign_fields?: SignField[]
  /** 串行签署：parallel | sequential */
  sign_order_type?: string
  /** 本签署方的顺序号（0=不限） */
  sign_order?: number
  /** 此刻是否轮到本签署方（false → 页面提示等待前序签署方） */
  can_sign_now?: boolean
  /** 合同本身的签署截止时间（与链接有效期分开） */
  sign_deadline?: string
  [k: string]: unknown
}

/** 预置签署区（由发起方在「放置签署框」里落好，签署页直接点它即签） */
export interface SignField {
  id?: string
  field_type?: string
  page?: number
  x: number
  y: number
  w: number
  h: number
  /** 后端标记已签（公开页只返回未签字段，此处兼容其它入口） */
  signed?: boolean
}

/** 已落框成品（本地坐标 + 成品图；签署时一次性原子提交给 sign-batch） */
export interface Placed {
  key: number
  page: number
  x: number
  y: number
  w: number
  h: number
  method: 'company_seal' | 'personal_handwrite' | 'date'
  /** date 类不需要图片，由后端渲染当天日期 */
  imageDataUrl?: string
  signatureSvg?: string
}

/** 指针交互（鼠标/触屏/触控笔统一）进行中的拖拽态 */
export interface DragState {
  kind: TrayKind | null
  key: number | null
  startX: number
  startY: number
  moved: boolean
}
