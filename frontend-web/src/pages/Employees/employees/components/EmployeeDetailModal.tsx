import { useTranslation } from 'react-i18next'
import { Modal } from 'antd'
import { formatMoney } from '@/lib/money'
import type { DemoEmployee } from '../types'
import { getStatusBadge } from '../utils'

interface Props {
  emp: DemoEmployee | null
  onClose: () => void
}

/** 查看员工：只读档案 */
export const EmployeeDetailModal = ({ emp, onClose }: Props) => {
  const { t } = useTranslation()
  return (
    <Modal
      open={!!emp}
      title={t('employees.detailTitle')}
      onCancel={onClose}
      footer={
        <button className="rent-btn rent-btn--secondary" type="button" onClick={onClose}>
          {t('common.close')}
        </button>
      }
      destroyOnHidden
    >
      {emp && (
        <>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('employees.labelEmpNo')}</label>
            <div className="rent-table__mono">{emp.employee_no || '-'}</div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('employees.labelNamePlain')}</label>
            <div>{emp.full_name || '-'}</div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('employees.labelDeptPosition')}</label>
            <div>
              {emp.department || '-'} · {emp.position || '-'}
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('employees.labelContact')}</label>
            <div>
              {emp.phone || '-'}
              <span className="rent-text-muted" style={{ marginLeft: 8 }}>
                {emp.email || '-'}
              </span>
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('employees.labelHireDate')}</label>
            <div>{emp.hire_date || '-'}</div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('employees.labelPerformance')}</label>
            <div className="rent-num">{formatMoney(Number(emp.performance || 0))}</div>
          </div>
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('common.status')}</label>
            <div>
              <span className={`rent-badge ${getStatusBadge(emp.status || '').cls}`}>
                {t(getStatusBadge(emp.status || '').text)}
              </span>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
