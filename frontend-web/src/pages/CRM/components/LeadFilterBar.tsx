import { useTranslation } from 'react-i18next'
import type { LeadStatus } from '@/types'

interface LeadFilterBarProps {
  stage?: LeadStatus
  stageOptions: { value: LeadStatus; label: string }[]
  onStageChange: (value: LeadStatus | undefined) => void
  onSearch: (value: string) => void
}

export default function LeadFilterBar({ stage, stageOptions, onStageChange, onSearch }: LeadFilterBarProps) {
  const { t } = useTranslation()
  return (
    <div className="rent-filter-bar">
      <select
        className="rent-form-select"
        style={{ width: 'auto', minWidth: 140 }}
        value={stage || ''}
        onChange={(e) => onStageChange((e.target.value || undefined) as LeadStatus | undefined)}
      >
        <option value="">{t('crm.optAllStages')}</option>
        {stageOptions.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <div className="rent-filter-bar__search">
        <div className="rent-search" style={{ width: '100%', maxWidth: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t('crm.searchPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch((e.target as HTMLInputElement).value)
            }}
          />
        </div>
      </div>
    </div>
  )
}
