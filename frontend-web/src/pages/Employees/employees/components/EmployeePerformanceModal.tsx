import { useTranslation } from 'react-i18next'
import { Modal, Spin, Empty } from 'antd'
import type { DemoEmployee } from '../types'

interface Props {
  emp: DemoEmployee | null
  rows: any[]
  loading: boolean
  onClose: () => void
}

/** 绩效明细：系统按佣金结算自动核算（GET /employees/{id}/performance） */
export const EmployeePerformanceModal = ({ emp, rows, loading, onClose }: Props) => {
  const { t } = useTranslation()
  return (
    <Modal
      open={!!emp}
      title={t('employees.perfTitle', { name: emp?.full_name || '' })}
      onCancel={onClose}
      footer={
        <button className="rent-btn rent-btn--secondary" type="button" onClick={onClose}>
          {t('common.close')}
        </button>
      }
      width={720}
      destroyOnClose
    >
      {loading ? (
        <div className="rent-empty">
          <Spin size="small" style={{ marginRight: 8 }} />
          <span className="rent-text-muted">{t('common.loading')}</span>
        </div>
      ) : rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employees.perfEmpty')} />
      ) : (
        <table className="rent-table">
          <thead>
            <tr>
              <th>{t('employees.thDealType')}</th>
              <th>{t('employees.thCommissionBase')}</th>
              <th>{t('employees.thRate')}</th>
              <th>{t('employees.thCommissionAmount')}</th>
              <th>{t('employees.thSettleStatus')}</th>
              <th>{t('employees.thCreatedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id || idx}>
                <td>{row.deal_type || '-'}</td>
                <td className="rent-money">{Number(row.commission_base || 0).toLocaleString()}</td>
                <td>{row.commission_rate ?? '-'}</td>
                <td className="rent-money">
                  {row.currency || ''} {Number(row.commission_amount || 0).toLocaleString()}
                </td>
                <td>{row.status || '-'}</td>
                <td className="rent-table__mono">
                  {row.created_at ? String(row.created_at).slice(0, 10) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
