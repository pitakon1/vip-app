/**
 * 业主首页 / 租客首页共用逻辑。
 *
 * 两个首页此前各自内联了完全相同的一份「通知分类 + 房源展示字段」辅助代码，
 * 收敛到此处避免双份维护（两份必须逐字一致，否则同一后端数据在两页显示会不一致）。
 */
import type { NotificationType } from '@/types'

/** 通知类型 → 展示文案 / 配色。 */
export const TYPE_MAP: Record<NotificationType, { text: string; color: string; bg: string }> = {
  payment: { text: '租金提醒', color: 'var(--error)', bg: 'rgba(var(--error-rgb), 0.1)' },
  lease: { text: '合同到期', color: 'var(--warning)', bg: 'rgba(var(--warning-rgb), 0.1)' },
  maintenance: { text: '维修通知', color: 'var(--primary)', bg: 'var(--sidebar-active)' },
  system: { text: '系统通知', color: 'var(--ink-3)', bg: 'var(--surface-2)' }
}

/** 通知行（后端返回 subject/content/status/related_entity_type，无 type 字段） */
export interface NotifRow {
  id: number | string
  subject?: string
  title?: string
  content?: string
  status?: string
  read?: boolean
  related_entity_type?: string
  template_key?: string
  created_at?: string
  createdAt?: string
  [key: string]: any
}

// 按关联实体推导通知分类（后端无 type 字段）
const RENT_KEYS = ['lease', 'payment', 'rent', 'invoice', 'deposit']
const SERVICE_KEYS = ['maintenance', 'service_order', 'service', 'repair', 'ticket']

export const notifCategory = (n: NotifRow): NotificationType => {
  const raw = `${n?.related_entity_type || ''} ${n?.template_key || ''}`.toLowerCase()
  if (SERVICE_KEYS.some((k) => raw.includes(k))) return 'maintenance'
  if (raw.includes('lease')) return 'lease'
  if (RENT_KEYS.some((k) => raw.includes(k))) return 'payment'
  return 'system'
}

export const notifTitle = (n: NotifRow) => n?.subject || n?.title || '通知'

export function pickList<T>(res: any): T[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export const formatDay = (x?: string) => (x ? String(x).slice(0, 10) : '')

export const propertyTitle = (item: any) =>
  item?.room_number ||
  item?.project_name ||
  item?.building ||
  item?.address ||
  `房源 #${String(item?.id ?? '').slice(0, 8)}`

export const propertyAddress = (item: any) =>
  [item?.city, item?.address || item?.project_name].filter(Boolean).join(' · ')

export const propertyTags = (item: any): string[] =>
  [item?.property_type, item?.furnished ? '拎包入住' : '', item?.bedrooms ? `${item.bedrooms}卧` : '']
    .filter(Boolean)
    .slice(0, 3) as string[]
