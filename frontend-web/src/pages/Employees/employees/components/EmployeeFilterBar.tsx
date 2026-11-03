import { useTranslation } from 'react-i18next'
import type { EmployeeStatus } from '@/types'
import type { QueryParams } from '../types'

interface Props {
  keywordInput: string
  onKeywordChange: (value: string) => void
  queryParams: QueryParams
  departments: string[]
  sortBy: string
  onDepartmentChange: (value: string) => void
  onStatusChange: (value: EmployeeStatus | undefined) => void
  onSortChange: (value: string) => void
}

/** 搜索 / 部门 / 状态 / 排序筛选条 */
export const EmployeeFilterBar = ({
  keywordInput,
  onKeywordChange,
  queryParams,
  departments,
  sortBy,
  onDepartmentChange,
  onStatusChange,
  onSortChange,
}: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-filter-bar">
      <div className="rent-filter-bar__search">
        <div className="rent-search" style={{ width: '100%' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            placeholder={t('employees.searchPlaceholder')}
            value={keywordInput}
            onChange={(e) => onKeywordChange(e.target.value)}
          />
        </div>
      </div>
      <select
        className="rent-filter-select"
        aria-label={t('employees.ariaDept')}
        value={queryParams.department || ''}
        onChange={(e) => onDepartmentChange(e.target.value)}
      >
        <option value="">{t('employees.optAllDepts')}</option>
        {departments.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select
        className="rent-filter-select"
        aria-label={t('employees.ariaStatus')}
        value={queryParams.status || ''}
        onChange={(e) => onStatusChange((e.target.value || undefined) as EmployeeStatus | undefined)}
      >
        <option value="">{t('employees.optAllStatus')}</option>
        <option value="active">{t('employees.stActive')}</option>
        <option value="probation">{t('employees.stProbation')}</option>
        <option value="inactive">{t('employees.stInactive')}</option>
      </select>
      <select
        className="rent-filter-select"
        aria-label={t('employees.ariaSort')}
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
      >
        <option value="perf-desc">{t('employees.sortPerfDesc')}</option>
        <option value="perf-asc">{t('employees.sortPerfAsc')}</option>
        <option value="joined-desc">{t('employees.sortJoinedDesc')}</option>
        <option value="id-asc">{t('employees.sortIdAsc')}</option>
      </select>
    </div>
  )
}
