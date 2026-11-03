import { useTranslation } from 'react-i18next'

interface Props {
  statTotal: number
  statActive: number
  statExpiring: number
  statTerminated: number
}

/** 顶部统计卡片 */
export default function LeasesSummaryCards({
  statTotal,
  statActive,
  statExpiring,
  statTerminated,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-grid rent-grid--4 rent-mb-5">
      <div className="rent-stat-card">
        <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div className="rent-stat-card__label">{t('leases.statTotal')}</div>
            <div className="rent-stat-card__value">{statTotal}</div>
          </div>
        </div>
      </div>
      <div className="rent-stat-card">
        <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div className="rent-stat-card__label">{t('leases.stActive')}</div>
            <div className="rent-stat-card__value">{statActive}</div>
          </div>
        </div>
      </div>
      <div className="rent-stat-card">
        <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div className="rent-stat-card__label">{t('leases.stExpiring')}</div>
            <div className="rent-stat-card__value">{statExpiring}</div>
          </div>
        </div>
      </div>
      <div className="rent-stat-card">
        <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
          <div className="rent-stat-card__icon" style={{ background: 'var(--rent-surface-2)', color: 'var(--rent-ink-2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div className="rent-stat-card__label">{t('leases.stTerminated')}</div>
            <div className="rent-stat-card__value">{statTerminated}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
