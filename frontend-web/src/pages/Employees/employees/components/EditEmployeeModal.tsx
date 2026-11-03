import { useTranslation } from 'react-i18next'
import { Modal } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import type { DemoEmployee, EmployeeFormValues } from '../types'

interface Props {
  open: boolean
  emp: DemoEmployee | null
  values: EmployeeFormValues
  setValues: Dispatch<SetStateAction<EmployeeFormValues>>
  onCancel: () => void
  onOk: () => void
  confirmLoading: boolean
}

/** 编辑员工：账号资料 + 员工档案（PATCH /admin/users/{user_id}） */
export const EditEmployeeModal = ({ open, emp, values, setValues, onCancel, onOk, confirmLoading }: Props) => {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      title={t('employees.editTitle')}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      destroyOnClose
    >
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelEmpNo')}</label>
        <input className="rent-form-input" value={emp?.employee_no || '-'} readOnly />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelName')}</label>
        <input
          className="rent-form-input"
          value={values.fullName}
          onChange={(e) => setValues((f) => ({ ...f, fullName: e.target.value }))}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelEmailEdit')}</label>
        <input
          className="rent-form-input"
          value={values.email}
          onChange={(e) => setValues((f) => ({ ...f, email: e.target.value }))}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelPhone')}</label>
        <input
          className="rent-form-input"
          value={values.phone}
          onChange={(e) => setValues((f) => ({ ...f, phone: e.target.value }))}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelDept')}</label>
        <input
          className="rent-form-input"
          value={values.department}
          onChange={(e) => setValues((f) => ({ ...f, department: e.target.value }))}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelPosition')}</label>
        <input
          className="rent-form-input"
          value={values.position}
          onChange={(e) => setValues((f) => ({ ...f, position: e.target.value }))}
        />
      </div>
      <div className="rent-form-group" style={{ marginBottom: 0 }}>
        <label className="rent-form-label">{t('employees.labelActiveStatus')}</label>
        <select
          className="rent-form-select"
          value={values.isActive ? 'active' : 'inactive'}
          onChange={(e) => setValues((f) => ({ ...f, isActive: e.target.value === 'active' }))}
        >
          <option value="active">{t('employees.stActive')}</option>
          <option value="inactive">{t('employees.stInactive')}</option>
        </select>
      </div>
    </Modal>
  )
}
