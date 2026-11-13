import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import DataState from '@/components/DataState'
import type { Lease } from '@/types'
import { displayStatusMeta } from '../constants'
import { getDisplayStatus } from '../utils'

/** 后端返回 ISO 时间串，表格只展示日期；空值给占位符而不是 "Invalid Date" */
const fmtDate = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '—')

interface Props {
  items: Lease[]
  filtered: boolean
  resolvePropertyName: (lease: Lease) => string
  resolveTenantName: (lease: Lease) => string
  onView: (lease: Lease) => void
  onRenew: (lease: Lease) => void
  onTerminate: (lease: Lease) => void
}

/** 租约流水表格 */
export default function LeasesTable({
  items,
  filtered,
  resolvePropertyName,
  resolveTenantName,
  onView,
  onRenew,
  onTerminate,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-table-wrap leases-table-wrap">
      <table className="rent-table">
        <thead>
          <tr>
            <th>{t('leases.thCode')}</th>
            <th>{t('leases.thProperty')}</th>
            <th>{t('leases.thTenant')}</th>
            <th>{t('leases.thStart')}</th>
            <th>{t('leases.thEnd')}</th>
            <th className="rent-money">{t('leases.thMonthlyRent')}</th>
            <th>{t('common.status')}</th>
            <th>{t('common.action')}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <DataState
                  empty
                  emptyTitle={t('leases.leaseEmpty')}
                  filtered={filtered}
                />
              </td>
            </tr>
          ) : items.map((lease) => {
            const ds = getDisplayStatus(lease)
            const meta = displayStatusMeta[ds]
            const code = lease.contract_no || '—'
            const propName = resolvePropertyName(lease)
            const tenantName = resolveTenantName(lease)
            return (
              <tr key={lease.id}>
                <td><span className="rent-mono">{code}</span></td>
                <td>{propName}</td>
                <td>{tenantName}</td>
                <td className="rent-table__mono">{fmtDate(lease.start_date)}</td>
                <td className="rent-table__mono">{fmtDate(lease.end_date)}</td>
                <td className="rent-money"><span className="rent-num">{lease.currency || '฿'} {Number(lease.monthly_rent || 0).toLocaleString()}</span></td>
                <td>
                  <span className={`rent-badge ${meta.badge}`}>
                    <span className="rent-badge--dot" style={{ background: meta.dot }} />
                    {t(meta.label)}
                  </span>
                </td>
                <td>
                  <div className="rent-flex rent-gap-2">
                    <button
                      className="rent-btn rent-btn--ghost rent-btn--sm"
                      type="button"
                      onClick={() => onView(lease)}
                    >
                      {t('leases.btnView')}
                    </button>
                    <button
                      className="rent-btn rent-btn--ghost rent-btn--sm"
                      type="button"
                      onClick={() => onRenew(lease)}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      className="rent-btn rent-btn--ghost rent-btn--sm"
                      type="button"
                      style={{ color: 'var(--state-error)' }}
                      disabled={lease.status === 'terminated'}
                      onClick={() => onTerminate(lease)}
                    >
                      {t('leases.btnTerminate')}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
