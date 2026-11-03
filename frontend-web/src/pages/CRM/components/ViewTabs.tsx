import { useTranslation } from 'react-i18next'

interface ViewTabsProps {
  view: 'kanban' | 'list'
  onViewChange: (view: 'kanban' | 'list') => void
}

export default function ViewTabs({ view, onViewChange }: ViewTabsProps) {
  const { t } = useTranslation()
  return (
    <div className="rent-tabs">
      <div className="rent-tab" data-active={view === 'kanban'} onClick={() => onViewChange('kanban')}>
        <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="18" rx="1" />
            <rect x="14" y="3" width="7" height="11" rx="1" />
            <rect x="14" y="18" width="7" height="3" rx="1" />
          </svg>
          {t('crm.viewKanban')}
        </span>
      </div>
      <div className="rent-tab" data-active={view === 'list'} onClick={() => onViewChange('list')}>
        <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          {t('crm.viewList')}
        </span>
      </div>
    </div>
  )
}
