import type { LeadStatus } from '@/types'

/* ===== 设计稿常量（类型部分） ===== */
export type KanbanColumnKey = 'new' | 'contacted' | 'viewed' | 'negotiating' | 'closed'

export interface QueryParams {
  page: number
  pageSize: number
  /** 后端筛选参数名为 stage（不是 status），此前传错字段导致筛选静默失效 */
  stage?: LeadStatus
  keyword?: string
}

/* ===== CSV 批量导入 ===== */
export interface ImportRow {
  name: string
  nationality?: string
  phone?: string
  email?: string
  budget_max?: number
  source?: string
  notes?: string
}

export interface CreateFormValues {
  id?: string
  name: string
  nationality: string
  phone: string
  email: string
  budget_max: string
  assigned_to: string
  source: string
  stage: LeadStatus | ''
  requirement: string
  notes: string
}
