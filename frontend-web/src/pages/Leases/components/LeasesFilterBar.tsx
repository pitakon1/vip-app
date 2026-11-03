import { useTranslation } from 'react-i18next'
import { PROPERTY_TYPE_OPTIONS } from '../constants'

interface Props {
  filterStatus: string
  setFilterStatus: (value: string) => void
  filterType: string
  setFilterType: (value: string) => void
  filterStart: string
  setFilterStart: (value: string) => void
  filterEnd: string
  setFilterEnd: (value: string) => void
  handleStatusChange: (value: string | undefined) => void
  handleSearch: (value: string) => void
  handleApplyFilters: () => void
  handleReset: () => void
}

/** 筛选栏：关键字 / 状态 / 房源类型 / 日期区间 + 筛选与重置 */
export default function LeasesFilterBar({
  filterStatus,
  setFilterStatus,
  filterType,
  setFilterType,
  filterStart,
  setFilterStart,
  filterEnd,
  setFilterEnd,
  handleStatusChange,
  handleSearch,
  handleApplyFilters,
  handleReset,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-filter-bar">
      <div className="rent-filter-bar__search">
        <div className="rent-search" style={{ width: '100%', maxWidth: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t('leases.searchPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch((e.target as HTMLInputElement).value)
            }}
          />
        </div>
      </div>
      <select
        className="rent-form-select"
        style={{ width: 'auto' }}
        aria-label={t('leases.ariaStatus')}
        value={filterStatus}
        onChange={(e) => {
          setFilterStatus(e.target.value)
          handleStatusChange(e.target.value || undefined)
        }}
      >
        <option value="">{t('leases.optAllStatus')}</option>
        <option value="active">{t('leases.stActive')}</option>
        <option value="expiring">{t('leases.stExpiring')}</option>
        <option value="expired">{t('leases.stExpired')}</option>
        <option value="terminated">{t('leases.stTerminated')}</option>
      </select>
      <select
        className="rent-form-select"
        style={{ width: 'auto' }}
        aria-label={t('leases.ariaType')}
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
      >
        <option value="">{t('leases.optAllTypes')}</option>
        {PROPERTY_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
        ))}
      </select>
      <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
        <input
          type="date"
          className="rent-form-input"
          style={{ width: 'auto' }}
          aria-label={t('leases.ariaStart')}
          value={filterStart}
          onChange={(e) => setFilterStart(e.target.value)}
        />
        <span className="rent-text-muted rent-text-sm">{t('leases.to')}</span>
        <input
          type="date"
          className="rent-form-input"
          style={{ width: 'auto' }}
          aria-label={t('leases.ariaEnd')}
          value={filterEnd}
          onChange={(e) => setFilterEnd(e.target.value)}
        />
      </div>
      <button
        className="rent-btn rent-btn--secondary rent-btn--sm"
        type="button"
        onClick={handleApplyFilters}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {t('leases.btnFilter')}
      </button>
      <button
        className="rent-btn rent-btn--ghost rent-btn--sm"
        type="button"
        onClick={handleReset}
      >
        {t('common.reset')}
      </button>
    </div>
  )
}
