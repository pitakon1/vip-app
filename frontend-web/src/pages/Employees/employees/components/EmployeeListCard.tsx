import { useTranslation } from 'react-i18next'
import { Spin, Empty } from 'antd'
import { formatMoney } from '@/lib/money'
import type { Dispatch, SetStateAction } from 'react'
import { AVATAR_COLORS } from '../constants'
import type { DemoEmployee, QueryParams } from '../types'
import { getStatusBadge } from '../utils'

interface Props {
  listData: DemoEmployee[]
  loading: boolean
  queryParams: QueryParams
  setQueryParams: Dispatch<SetStateAction<QueryParams>>
  totalDisplay: number
  totalPages: number
  pageNumbers: (number | string)[]
  todayStr: string
  onView: (emp: DemoEmployee) => void
  onEdit: (emp: DemoEmployee) => void
  onPerf: (emp: DemoEmployee) => void
}

/** 员工列表卡片（表格 + 分页） */
export const EmployeeListCard = ({
  listData,
  loading,
  queryParams,
  setQueryParams,
  totalDisplay,
  totalPages,
  pageNumbers,
  todayStr,
  onView,
  onEdit,
  onPerf,
}: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employees.listTitle')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('employees.syncedAt', { date: todayStr })}</span>
      </div>
      <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
        <table className="rent-table">
          <thead>
            <tr>
              <th>{t('employees.thEmpNo')}</th>
              <th>{t('employees.thName')}</th>
              <th>{t('employees.thDept')}</th>
              <th>{t('employees.thPosition')}</th>
              <th>{t('employees.thContact')}</th>
              <th>{t('employees.thHireDate')}</th>
              <th>{t('employees.thPerformance')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="rent-loading-row"><Spin size="small" style={{ marginRight: 8 }} />{t('common.loading')}</td>
              </tr>
            ) : listData.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employees.empty')} />
                </td>
              </tr>
            ) : (
              listData.map((emp, idx) => {
                const perf = Number(emp.performance || 0)
                const target = Number(emp.target || 100000)
                const pct = target > 0 ? Math.min(Math.round((perf / target) * 100), 100) : 0
                const perfCls = pct >= 100 ? 'rent-progress__bar--success' : pct >= 60 ? '' : 'rent-progress__bar--warning'
                const pctCls = pct >= 100 ? 'rent-perf__pct--up' : pct >= 60 ? '' : 'rent-perf__pct--warn'
                const status = getStatusBadge(emp.status)
                const avatarCls = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                const initial = (emp.full_name || '?').charAt(0).toUpperCase()
                return (
                  <tr key={emp.id || emp.employee_no || idx}>
                    <td className="rent-table__mono">{emp.employee_no || '-'}</td>
                    <td>
                      <div className="rent-emp">
                        <div className={`rent-avatar rent-avatar--sm${avatarCls ? ' ' + avatarCls : ''}`}>{initial}</div>
                        <div className="rent-emp__name">{emp.full_name || '-'}</div>
                      </div>
                    </td>
                    <td>{emp.department || '-'}</td>
                    <td>{emp.position || '-'}</td>
                    <td>
                      <div className="rent-contact">
                        <span className="rent-contact__phone">{emp.phone || '-'}</span>
                        <span className="rent-contact__email">{emp.email || '-'}</span>
                      </div>
                    </td>
                    <td className="rent-table__mono">{emp.hire_date || '-'}</td>
                    <td>
                      <div className="rent-perf">
                        <div className="rent-perf__value">{formatMoney(perf)}</div>
                        <div className="rent-progress"><div className={`rent-progress__bar ${perfCls}`} style={{ width: `${pct}%` }}></div></div>
                        <div className="rent-perf__meta"><span>{t('employees.targetDone')}</span><span className={`rent-perf__pct ${pctCls}`}>{pct}%</span></div>
                      </div>
                    </td>
                    <td><span className={`rent-badge ${status.cls}`}>{t(status.text)}</span></td>
                    <td>
                      <div className="rent-actions">
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => onView(emp)}>{t('employees.btnView')}</button>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => onEdit(emp)}>{t('common.edit')}</button>
                        <button className="rent-btn rent-btn--primary-ghost rent-btn--sm" type="button" onClick={() => onPerf(emp)}>{t('employees.btnPerf')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="rent-card__footer">
        <div className="rent-pagination rent-pagination--split">
          <span className="rent-pagination__info">{t('employees.pageInfo', { count: totalDisplay })}</span>
          <div className="rent-flex rent-gap-2">
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label={t('employees.ariaPrev')}
              disabled={queryParams.page <= 1}
              onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            {pageNumbers.map((n, idx) =>
              n === 'prev-ellipsis' || n === 'next-ellipsis' ? (
                <span className="rent-pagination__info" key={idx} style={{ margin: '0 4px' }}>...</span>
              ) : (
                <button
                  key={idx}
                  className="rent-pagination__btn"
                  data-active={queryParams.page === n ? 'true' : 'false'}
                  type="button"
                  onClick={() => setQueryParams((p) => ({ ...p, page: Number(n) }))}
                >
                  {n}
                </button>
              )
            )}
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label={t('employees.ariaNext')}
              disabled={queryParams.page >= totalPages}
              onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
