import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import type { Lead, LeadStatus } from '@/types'
import { formatBudget } from '../utils'

interface LeadTableProps {
  items: Lead[]
  stageLabels: Record<LeadStatus, string>
  employeeNameMap: Record<string, string>
  filtered: boolean
  onCall: (lead: Lead) => void
  onChat: (lead: Lead) => void
  onEdit: (lead: Lead) => void
  onOpenStage: (lead: Lead) => void
  onDelete: (lead: Lead) => void
}

export default function LeadTable({
  items,
  stageLabels,
  employeeNameMap,
  filtered,
  onCall,
  onChat,
  onEdit,
  onOpenStage,
  onDelete,
}: LeadTableProps) {
  const { t } = useTranslation()
  return (
    <div className="rent-table-wrap">
      <table className="rent-table">
        <thead>
          <tr>
            <th>{t('crm.thName')}</th>
            <th>{t('crm.thNationality')}</th>
            <th>{t('crm.thContact')}</th>
            <th>{t('crm.labelBudget')}</th>
            <th>{t('crm.thStage')}</th>
            <th>{t('crm.thAssigned')}</th>
            <th>{t('common.action')}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <DataState
                  empty
                  emptyTitle={t('crm.emptyLeads')}
                  filtered={filtered}
                />
              </td>
            </tr>
          ) : items.map((lead) => (
            <tr key={lead.id}>
              <td className="rent-text-bold">{lead.name}</td>
              <td>{lead.nationality || '-'}</td>
              <td>
                <div>{lead.phone || '-'}</div>
                {lead.email && <div className="rent-text-muted rent-text-sm">{lead.email}</div>}
              </td>
              <td className="rent-num">{formatBudget(lead, t('crm.notSet'))}</td>
              <td>
                <span className="rent-badge rent-badge--info">
                  {stageLabels[lead.stage as LeadStatus] || lead.stage}
                </span>
              </td>
              <td>{lead.assigned_to ? (employeeNameMap[String(lead.assigned_to)] || '—') : '-'}</td>
              <td>
                <div className="rent-flex rent-gap-2">
                  <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onCall(lead)}>
                    {t('crm.actCall')}
                  </button>
                  <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onChat(lead)}>
                    {t('crm.actMessage')}
                  </button>
                  <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onEdit(lead)}>
                    {t('common.edit')}
                  </button>
                  <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onOpenStage(lead)}>
                    {t('crm.thStage')}
                  </button>
                  <button
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                    onClick={() => onDelete(lead)}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
