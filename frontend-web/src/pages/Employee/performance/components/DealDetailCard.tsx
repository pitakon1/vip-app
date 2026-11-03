import { useTranslation } from 'react-i18next'
import { Spin, Empty } from 'antd'
import type { DealRow } from '../types'
import { fmtMoney } from '../utils'

interface Props {
  rows: DealRow[]
  loading: boolean
}

/** 成交明细（我的佣金结算） */
export const DealDetailCard = ({ rows, loading }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employeePerformance.dealDetail')}</h3>
        <span className="rent-badge rent-badge--primary">{t('employeePerformance.monthDealsBadge', { n: rows.length })}</span>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('employeePerformance.thSettlementNo')}</th>
                <th>{t('employeePerformance.thType')}</th>
                <th>{t('employeePerformance.thAmount')}</th>
                <th>{t('employeePerformance.thCommission')}</th>
                <th>{t('common.status')}</th>
                <th>{t('employeePerformance.thSettlementDate')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="rent-empty">
                      <Spin size="small" style={{ marginRight: 8 }} />
                      {t('common.loading')}
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="rent-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyDeals')} />
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="rent-table__mono">{r.id}</td>
                    <td>
                      <div className="rent-text-bold">{r.type}</div>
                    </td>
                    <td className="rent-table__mono">
                      {r.base != null ? fmtMoney(Number(r.base)) : '-'}
                    </td>
                    <td className="rent-table__mono rent-text-bold" style={{ color: 'var(--state-success)' }}>
                      {r.amount != null ? fmtMoney(Number(r.amount)) : '-'}
                    </td>
                    <td>
                      <span className={`rent-badge rent-badge--${r.status.tone}`}>{r.status.text}</span>
                    </td>
                    <td className="rent-text-sm rent-text-muted">{r.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
