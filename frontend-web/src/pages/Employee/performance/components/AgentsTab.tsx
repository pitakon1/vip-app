import { useTranslation } from 'react-i18next'
import { Spin, Empty } from 'antd'
import type { PerfRow } from '../types'
import { fmtMoney } from '../utils'

interface Props {
  agents: PerfRow[]
  loading: boolean
  sort: string
  order: 'asc' | 'desc'
  onSort: (key: string) => void
}

/** 员工业绩追踪（全员），点击表头排序 */
export const AgentsTab = ({ agents, loading, sort, order, onSort }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employeePerformance.agentsTitle')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('employeePerformance.agentsHint')}</span>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        {loading ? (
          <div className="rent-empty" style={{ padding: '32px 0' }}>
            <Spin size="small" style={{ marginRight: 8 }} />
            {t('common.loading')}
          </div>
        ) : agents.length === 0 ? (
          <div className="rent-empty" style={{ padding: '32px 0' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyAgents')} />
          </div>
        ) : (
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>
                    <button className="perf-sort-btn" onClick={() => onSort('employee_name')}>
                      {t('employeePerformance.thAgent')}
                      {sort === 'employee_name' && <span>{order === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                  <th>
                    <button className="perf-sort-btn" onClick={() => onSort('total_commission')}>
                      {t('employeePerformance.agtCommission')}
                      {sort === 'total_commission' && <span>{order === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                  <th>
                    <button className="perf-sort-btn" onClick={() => onSort('total_revenue')}>
                      {t('employeePerformance.agtRevenue')}
                      {sort === 'total_revenue' && <span>{order === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                  <th>
                    <button className="perf-sort-btn" onClick={() => onSort('deals')}>
                      {t('employeePerformance.agtDeals')}
                      {sort === 'deals' && <span>{order === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.employee_id || a.employee_name}>
                    <td style={{ fontWeight: 600 }}>{a.employee_name || '—'}</td>
                    <td className="rent-table__mono rent-text-bold" style={{ color: 'var(--state-success)' }}>
                      {fmtMoney(Number(a.total_commission) || 0)}
                    </td>
                    <td className="rent-table__mono">{fmtMoney(Number(a.total_revenue) || 0)}</td>
                    <td>{a.deals ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
