/**
 * 「我的工单」行数据（服务订单 + 报修工单混合、状态过滤、按时间倒序）。
 * 纯结构拆分自 pages/Tenant/Services.tsx，过滤与排序逻辑保持不变。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { ORDER_STATUS_META, PRIORITY_LABEL, TICKET_STATUS_META } from '../constants'
import type { Booking, PropertyOption, TicketFilter, TicketItem, TicketRow } from '../types'

export function useTicketRows({
  bookings,
  tickets,
  propertyOptions,
  statusLabelMap,
}: {
  bookings: Booking[]
  tickets: TicketItem[]
  propertyOptions: PropertyOption[]
  statusLabelMap: Record<Booking['status'], string>
}) {
  const { t } = useTranslation()
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('all')

  // 「我的工单」= 服务订单 + 报修工单，按 created_at 倒序混合；仅业主展示（租客在「我的订单」看服务单）
  const mergedTickets = useMemo<TicketRow[]>(() => {
    const rows: TicketRow[] = []
    bookings.forEach((o) => {
      const meta = ORDER_STATUS_META[String(o.status)] || { label: '', tone: 'neutral' }
      rows.push({
        id: `svc-${o.id}`,
        orderId: o.id,
        kind: 'service',
        title: o.serviceName,
        status: o.status,
        badgeLabel: statusLabelMap[o.status],
        badgeTone: meta.tone,
        date: o.createdAt || o.preferredDate || '',
        property: '',
        priorityLabel: '',
        canReview: o.status === 'completed' && !o.rating,
      })
    })
    tickets.forEach((tk) => {
      const meta = TICKET_STATUS_META[tk.status] || { label: tk.status, tone: 'neutral' }
      rows.push({
        id: `repair-${tk.id}`,
        kind: 'repair',
        title: tk.title,
        status: tk.status,
        badgeLabel: t(meta.label),
        badgeTone: meta.tone,
        date: tk.created_at || '',
        property: propertyOptions.find((p) => p.id === tk.property_id)?.label || '',
        priorityLabel: PRIORITY_LABEL[tk.priority] || '',
        canReview: false,
      })
    })
    const inStatus = (r: TicketRow, list: string[]) => list.includes(r.status)
    let filtered = rows
    if (ticketFilter === 'processing') filtered = rows.filter((r) => inStatus(r, ['assigned', 'in_progress']))
    else if (ticketFilter === 'completed') filtered = rows.filter((r) => inStatus(r, ['completed', 'resolved', 'closed']))
    else if (ticketFilter === 'pending') filtered = rows.filter((r) => inStatus(r, ['pending', 'open']))
    const ts = (d: string) => (d ? dayjs(d).valueOf() : 0)
    return filtered.sort((a, b) => ts(b.date) - ts(a.date))
  }, [bookings, tickets, propertyOptions, ticketFilter, statusLabelMap, t])

  return { ticketFilter, setTicketFilter, mergedTickets }
}
