import type { LeadStatus } from '@/types'
import type { CreateFormValues, ImportRow, KanbanColumnKey } from './types'

export const KANBAN_COLUMNS: { key: KanbanColumnKey; labelKey: string; color: string }[] = [
  { key: 'new', labelKey: 'crm.stageNew', color: 'var(--rent-primary)' },
  { key: 'contacted', labelKey: 'crm.stageContacted', color: 'var(--state-yellow)' },
  { key: 'viewed', labelKey: 'crm.stageViewed', color: 'var(--state-orange)' },
  { key: 'negotiating', labelKey: 'crm.stageNegotiating', color: 'var(--state-purple)' },
  { key: 'closed', labelKey: 'crm.stageClosed', color: 'var(--state-success)' },
]

export const statusToColumn: Record<LeadStatus, KanbanColumnKey> = {
  new: 'new',
  inquiring: 'new',
  following: 'contacted',
  viewing_scheduled: 'viewed',
  negotiating: 'negotiating',
  pending_contract: 'negotiating',
  closed: 'closed',
  converted: 'closed',
  lost: 'new',
}

/** 阶段枚举 → i18n key（渲染时查表翻译，未知值回落为原始枚举值） */
export const STAGE_LABEL_KEYS: Record<LeadStatus, string> = {
  inquiring: 'crm.stInquiring',
  viewing_scheduled: 'crm.stViewingScheduled',
  negotiating: 'crm.stNegotiating',
  pending_contract: 'crm.stPendingContract',
  closed: 'crm.stageClosed',
  new: 'crm.stNew',
  following: 'crm.stFollowing',
  converted: 'crm.stConverted',
  lost: 'crm.stLost',
}

/** 后端 LeadStage 枚举的真实取值；STAGE_LABEL_KEYS 中的 new/following/converted/lost
 *  后端不认（提交即 422），故下拉选项只列这 5 个可写值 */
export const LEAD_STAGE_VALUES: LeadStatus[] = [
  'inquiring',
  'viewing_scheduled',
  'negotiating',
  'pending_contract',
  'closed',
]

export const CURRENCY_SYMBOL: Record<string, string> = {
  THB: '฿',
  USD: '$',
  CNY: '¥',
  SGD: 'S$',
  MYR: 'RM',
}

/** 表头别名（中英文均可）→ 目标字段 */
export const CSV_HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  name: ['name', '姓名', '客户姓名', '名称'],
  nationality: ['nationality', '国籍'],
  phone: ['phone', 'tel', '电话', '手机号', '手机'],
  email: ['email', '邮箱', '电子邮箱'],
  budget_max: ['budget_max', 'budget', '预算', '预算上限'],
  source: ['source', '来源', '渠道'],
  notes: ['notes', 'note', '备注', '说明'],
}

/** 无表头时的列顺序约定 */
export const CSV_DEFAULT_ORDER: (keyof ImportRow)[] = ['name', 'nationality', 'phone', 'email', 'budget_max', 'source', 'notes']

export const emptyCreateForm: CreateFormValues = {
  id: undefined,
  name: '',
  nationality: '',
  phone: '',
  email: '',
  budget_max: '',
  assigned_to: '',
  source: '',
  // 默认值必须落在 LEAD_STAGE_VALUES 内：'new' 后端 LeadStage 不认，提交必 422
  stage: 'inquiring',
  requirement: '',
  notes: '',
}
