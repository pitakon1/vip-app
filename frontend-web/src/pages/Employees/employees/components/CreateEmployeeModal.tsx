import { useTranslation } from 'react-i18next'
import { Modal } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import type { EmployeeFormValues } from '../types'

interface Props {
  open: boolean
  onCancel: () => void
  onOk: () => void
  confirmLoading: boolean
  values: EmployeeFormValues
  setValues: Dispatch<SetStateAction<EmployeeFormValues>>
}

/** 新增员工：开通 employee 账号并同步建档（POST /admin/users） */
export const CreateEmployeeModal = ({ open, onCancel, onOk, confirmLoading, values, setValues }: Props) => {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      title={t('employees.createTitle')}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText={t('employees.okCreate')}
      cancelText={t('common.cancel')}
      destroyOnHidden
    >
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelName')}</label>
        <input
          className="rent-form-input"
          value={values.fullName}
          onChange={(e) => setValues((f) => ({ ...f, fullName: e.target.value }))}
          placeholder={t('employees.placeholderName')}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelEmail')}</label>
        <input
          className="rent-form-input"
          type="email"
          value={values.email}
          onChange={(e) => setValues((f) => ({ ...f, email: e.target.value }))}
          placeholder={t('employees.placeholderEmail')}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelPassword')}</label>
        <input
          className="rent-form-input"
          value={values.password}
          onChange={(e) => setValues((f) => ({ ...f, password: e.target.value }))}
          placeholder={t('employees.placeholderPassword')}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelPhone')}</label>
        <input
          className="rent-form-input"
          value={values.phone}
          onChange={(e) => setValues((f) => ({ ...f, phone: e.target.value }))}
          placeholder={t('employees.placeholderOptional')}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelDept')}</label>
        <input
          className="rent-form-input"
          value={values.department}
          onChange={(e) => setValues((f) => ({ ...f, department: e.target.value }))}
          placeholder={t('employees.placeholderDept')}
        />
      </div>
      <div className="rent-form-group">
        <label className="rent-form-label">{t('employees.labelPosition')}</label>
        <input
          className="rent-form-input"
          value={values.position}
          onChange={(e) => setValues((f) => ({ ...f, position: e.target.value }))}
          placeholder={t('employees.placeholderPosition')}
        />
      </div>
    </Modal>
  )
}
