export type Phase = 'loading' | 'ready' | 'done'
export type FailType = 'expired' | 'signed' | 'generic' | null
export type TrayKind = 'seal' | 'sign'

export interface ContractDoc {
  contract_id?: string
  title?: string
  content_html?: string
  source?: string
  file_url?: string
  party_name_masked?: string
  party_role?: string
  real_name_verified?: boolean
  sign_method?: string
  pdf_available?: boolean
  pdf_page_count?: number
  party?: { id?: string; name?: string; sign_method?: string; real_name_verified?: boolean }
  /** 管理端（或关键字）预置的签署区，坐标同为页面百分比 */
  sign_fields?: SignField[]
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
