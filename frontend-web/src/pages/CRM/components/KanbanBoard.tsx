import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import type { Lead } from '@/types'
import { KANBAN_COLUMNS } from '../constants'
import type { KanbanColumnKey } from '../types'
import KanbanCard from './KanbanCard'

interface KanbanBoardProps {
  groups: Record<KanbanColumnKey, Lead[]>
  employeeNameMap: Record<string, string>
  hasLeads: boolean
  filtered: boolean
  onOpenStage: (lead: Lead) => void
  onCall: (lead: Lead) => void
  onChat: (lead: Lead) => void
  onEdit: (lead: Lead) => void
  onDelete: (lead: Lead) => void
}

export default function KanbanBoard({
  groups,
  employeeNameMap,
  hasLeads,
  filtered,
  onOpenStage,
  onCall,
  onChat,
  onEdit,
  onDelete,
}: KanbanBoardProps) {
  const { t } = useTranslation()
  return (
    <>
      {!hasLeads && (
        <DataState
          empty
          emptyTitle={t('crm.emptyLeads')}
          filtered={filtered}
        />
      )}
      {/* Kanban Board */}
      <div className="rent-kanban">
        {KANBAN_COLUMNS.map((col) => {
          const items = groups[col.key]
          return (
            <div className="rent-kanban__column" key={col.key}>
              <div className="rent-kanban__column-header">
                <span className="rent-kanban__column-title rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                  <span className="rent-badge--dot" style={{ background: col.color }} />
                  {t(col.labelKey)}
                </span>
                <span className="rent-kanban__column-count">{items.length}</span>
              </div>
              {items.map((lead) => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
                  agent={lead.assigned_to ? employeeNameMap[String(lead.assigned_to)] : undefined}
                  onOpenStage={onOpenStage}
                  onCall={onCall}
                  onChat={onChat}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )
        })}
      </div>
    </>
  )
}
