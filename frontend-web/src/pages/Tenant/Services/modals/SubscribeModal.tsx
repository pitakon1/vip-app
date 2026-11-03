/**
 * 业主订阅套餐弹窗。
 * 纯结构拆分自 pages/Tenant/Services.tsx，表单项、校验规则与选项保持不变。
 */
import { useTranslation } from 'react-i18next'
import { Modal, Form, Select, DatePicker, InputNumber } from 'antd'
import type { FormInstance } from 'antd'
import { fmtMoney } from '../constants'
import type { PropertyOption } from '../types'

export default function SubscribeModal({
  open,
  form,
  ownerProperties,
  submitting,
  onCancel,
  onOk,
}: {
  open: boolean
  form: FormInstance
  ownerProperties: PropertyOption[]
  submitting: boolean
  onCancel: () => void
  onOk: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      title={t('ownerServices.subscribeModalTitle')}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={submitting}
      okText={t('ownerServices.confirmSubscribe')}
      cancelText={t('common.cancel')}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="property_id" label={t('ownerServices.labelSelectProperty')} rules={[{ required: true, message: t('ownerServices.msgSelectProperty') }]}>
          <Select
            placeholder={t('ownerServices.msgSelectProperty')}
            options={ownerProperties.map((p) => ({
              value: p.id,
              label: `${p.label}${p.monthly_rent ? ` · ${fmtMoney(p.monthly_rent, p.currency)}${t('ownerServices.perMonthSuffix')}` : ''}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="type" label={t('ownerServices.labelPackageType')} rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'annual_management', label: t('ownerServices.packageTypeAnnual') },
              { value: 'full_service', label: t('ownerServices.packageTypeFull') },
            ]}
          />
        </Form.Item>
        <Form.Item name="start_date" label={t('ownerServices.labelStartDate')} rules={[{ required: true, message: t('ownerServices.msgSelectStartDate') }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <div className="rent-grid rent-grid--2">
          <Form.Item name="commission_rate" label={t('ownerServices.labelCommissionRate')} rules={[{ required: true }]}>
            <InputNumber min={0.5} max={3} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="management_fee_rate" label={t('ownerServices.labelManagementFeeRate')} rules={[{ required: true }]}>
            <InputNumber min={0} max={3} step={0.25} style={{ width: '100%' }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  )
}
