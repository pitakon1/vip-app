import { useTranslation } from 'react-i18next'
import type { Lead, LeadStatus } from '@/types'
import { CURRENCY_SYMBOL, statusToColumn } from '../constants'
import { formatBudget, getAgentColor, getAgentInitial, sourceBadge } from '../utils'

interface KanbanCardProps {
  lead: Lead
  agent?: string
  onOpenStage: (lead: Lead) => void
  onCall: (lead: Lead) => void
  onChat: (lead: Lead) => void
  onEdit: (lead: Lead) => void
  onDelete: (lead: Lead) => void
}

export default function KanbanCard({ lead, agent, onOpenStage, onCall, onChat, onEdit, onDelete }: KanbanCardProps) {
  const { t } = useTranslation()
  const isClosed = statusToColumn[lead.stage as LeadStatus] === 'closed'
  const dealPrice = (lead as any).deal_price
  // 卡片上的「跟进」用最后更新时间（后端无 follow_up 字段），负责人展示员工姓名而非 UUID
  const lastFollow = String((lead as any).updated_at || (lead as any).created_at || '').slice(0, 10)

  return (
    <div className="rent-kanban__card" onClick={() => onOpenStage(lead)}>
      <div className="rent-flex rent-flex--between rent-gap-2 rent-mb-2" style={{ alignItems: 'center' }}>
        <span className="rent-text-bold rent-text-sm">{lead.name}</span>
        {lead.source ? <span className={`rent-badge ${sourceBadge(lead.source)}`}>{lead.source}</span> : null}
      </div>
      <div className="rent-flex rent-gap-2 rent-mb-3" style={{ alignItems: 'center' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        <span className="rent-caption rent-text-muted">{lead.phone || '-'}</span>
      </div>
      <div className="rent-flex rent-flex--between rent-mt-2">
        <span className="rent-caption rent-text-muted">{isClosed ? t('crm.labelDealPrice') : t('crm.labelBudget')}</span>
        {isClosed && dealPrice != null ? (
          <span className="rent-mono rent-text-bold" style={{ color: 'var(--state-success)' }}>
            {CURRENCY_SYMBOL[lead.budget_currency || 'THB'] || lead.budget_currency || 'THB'} {Number(dealPrice).toLocaleString()}
          </span>
        ) : (
          <span className="rent-mono rent-text-bold">{formatBudget(lead, t('crm.notSet'))}</span>
        )}
      </div>
      <hr className="rent-divider" style={{ margin: '10px 0' }} />
      <div className="rent-flex rent-flex--between" style={{ alignItems: 'center' }}>
        <span className="rent-caption rent-text-muted">{t('crm.followPrefix')}{lastFollow || t('crm.notFollowed')}</span>
        <div className="rent-avatar rent-avatar--sm" style={{ background: getAgentColor(agent) }} title={agent || t('crm.unassigned')}>
          {getAgentInitial(agent)}
        </div>
      </div>
      <hr className="rent-divider" style={{ margin: '10px 0' }} />
      {/* 卡片操作区：电话 / 发消息 / 编辑 / 删除（与列表行一致，stopPropagation 避免触发卡片弹窗） */}
      <div className="rent-flex rent-gap-2" onClick={(e) => e.stopPropagation()}>
        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onCall(lead)}>
          {t('crm.actCall')}
        </button>
        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onChat(lead)}>
          {t('crm.actMessage')}
        </button>
        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onEdit(lead)}>
          {t('common.edit')}
        </button>
        <button
          className="rent-btn rent-btn--ghost rent-btn--sm"
          style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
          onClick={() => onDelete(lead)}
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  )
}
