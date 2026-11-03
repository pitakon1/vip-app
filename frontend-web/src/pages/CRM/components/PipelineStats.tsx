import { useTranslation } from 'react-i18next'

interface PipelineStatsProps {
  stats: { totalLeads: number; closedCount: number; conversionRate: number }
  hasLeads: boolean
}

export default function PipelineStats({ stats, hasLeads }: PipelineStatsProps) {
  const { t } = useTranslation()
  return (
    <div className="rent-grid rent-grid--3 rent-mt-5">
      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="rent-stat-card__label">{t('crm.statTotalLeads')}</div>
            <div className="rent-stat-card__value">{stats.totalLeads}</div>
            <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-2)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('crm.closedCount', { count: stats.closedCount })}
            </div>
          </div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
        </div>
      </div>
      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="rent-stat-card__label">{t('crm.statConversion')}</div>
            <div className="rent-stat-card__value">
              {stats.conversionRate}
              <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>%</span>
            </div>
            <div className={`rent-stat-card__delta${hasLeads ? ' rent-stat-card__delta--up' : ''}`} style={hasLeads ? undefined : { color: 'var(--rent-ink-2)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {hasLeads ? (
                  <>
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </>
                ) : (
                  <line x1="5" y1="12" x2="19" y2="12" />
                )}
              </svg>
              {t('crm.conversionFormula')}
            </div>
          </div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>
      </div>
      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="rent-stat-card__label">{t('crm.statInProgress')}</div>
            <div className="rent-stat-card__value">
              {Math.max(0, stats.totalLeads - stats.closedCount)}
            </div>
            <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-2)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('crm.inProgressHint')}
            </div>
          </div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
