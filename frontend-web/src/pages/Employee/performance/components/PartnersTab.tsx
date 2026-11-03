import { useTranslation } from 'react-i18next'
import { Spin, Empty } from 'antd'
import type { PerfRow } from '../types'
import { fmtMoney } from '../utils'

interface Props {
  partners: PerfRow[]
  loading: boolean
}

/** 合作公司业绩 / 分佣汇总 */
export const PartnersTab = ({ partners, loading }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employeePerformance.partnersTitle')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('employeePerformance.partnersHint')}</span>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        {loading ? (
          <div className="rent-empty" style={{ padding: '32px 0' }}>
            <Spin size="small" style={{ marginRight: 8 }} />
            {t('common.loading')}
          </div>
        ) : partners.length === 0 ? (
          <div className="rent-empty" style={{ padding: '32px 0' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyPartners')} />
          </div>
        ) : (
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('employeePerformance.thPartner')}</th>
                  <th>{t('employeePerformance.agtCommission')}</th>
                  <th>{t('employeePerformance.agtRevenue')}</th>
                  <th>{t('employeePerformance.agtDeals')}</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.partner_id || p.partner_name}>
                    <td style={{ fontWeight: 600 }}>{p.partner_name || '—'}</td>
                    <td className="rent-table__mono rent-text-bold" style={{ color: 'var(--state-success)' }}>
                      {fmtMoney(Number(p.total_commission) || 0)}
                    </td>
                    <td className="rent-table__mono">{fmtMoney(Number(p.total_revenue) || 0)}</td>
                    <td>{p.deals ?? 0}</td>
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
