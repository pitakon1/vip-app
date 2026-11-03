/**
 * 业主「我的工单」：服务订单 + 报修工单混合列表与状态筛选。
 * 纯结构拆分自 pages/Tenant/Services.tsx，类名、筛选与评价入口保持不变。
 */
import { useTranslation } from 'react-i18next'
import { Empty, Tag } from 'antd'
import dayjs from 'dayjs'
import { TICKET_FILTERS, tagColorOf } from '../constants'
import type { Booking, TicketFilter, TicketRow } from '../types'

export default function OwnerTickets({
  rows,
  ticketFilter,
  onFilterChange,
  bookings,
  onOpenRepair,
  onReview,
}: {
  rows: TicketRow[]
  ticketFilter: TicketFilter
  onFilterChange: (value: TicketFilter) => void
  bookings: Booking[]
  onOpenRepair: () => void
  onReview: (item: Booking) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="svc-section">
      <div className="svc-section__head">
        <h3 className="svc-section__title">{t('ownerServices.tabTickets')}</h3>
        <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={onOpenRepair}>
          {t('ownerServices.submitRepair')}
        </button>
      </div>
      <div className="rent-chips" style={{ marginBottom: 16 }}>
        {TICKET_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className="rent-chip"
            data-active={ticketFilter === f.value}
            onClick={() => onFilterChange(f.value)}
          >
            {t(f.label)}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ownerServices.emptyTickets')} style={{ padding: '32px 0' }} />
      ) : (
        <div className="rent-sub-list">
          {rows.map((row) => (
            <div className="rent-sub-item" key={row.id}>
              <div className="rent-sub-item__main">
                <div className="rent-sub-item__name">
                  <span className={`rent-badge ${row.kind === 'service' ? 'rent-badge--primary' : 'rent-badge--info'}`}>
                    {row.kind === 'service' ? t('ownerServices.kindService') : t('ownerServices.kindRepair')}
                  </span>
                  {row.title}
                  {row.kind === 'repair' && row.priorityLabel && (
                    <span className="rent-badge rent-badge--warning" style={{ marginLeft: 8 }}>
                      {t(row.priorityLabel)}{t('ownerServices.prioritySuffix')}
                    </span>
                  )}
                </div>
                <div className="rent-sub-item__meta">
                  {row.property ? `${t('ownerServices.propertyLabel')} ${row.property}` : ''}
                  {row.date ? ` · ${dayjs(row.date).format('YYYY-MM-DD')}` : ''}
                </div>
              </div>
              <div className="rent-sub-item__right">
                <Tag color={tagColorOf(row.badgeTone)}>{row.badgeLabel}</Tag>
                {row.kind === 'service' && row.canReview && (
                  <button
                    type="button"
                    className="rent-btn rent-btn--secondary rent-btn--sm"
                    onClick={() => {
                      const o = bookings.find((x) => x.id === row.orderId)
                      if (o) onReview(o)
                    }}
                  >
                    {t('ownerServices.review')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
