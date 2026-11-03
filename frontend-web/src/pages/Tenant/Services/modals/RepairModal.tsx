/**
 * 提交报修弹窗（租客 / 业主均可）。
 * 纯结构拆分自 pages/Tenant/Services.tsx，表单项、校验规则与选项保持不变。
 */
import { useTranslation } from 'react-i18next'
import { Modal, Form, Select, Input } from 'antd'
import type { FormInstance } from 'antd'
import type { PropertyOption } from '../types'

export default function RepairModal({
  open,
  form,
  propertyOptions,
  submitting,
  onCancel,
  onOk,
}: {
  open: boolean
  form: FormInstance
  propertyOptions: PropertyOption[]
  submitting: boolean
  onCancel: () => void
  onOk: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      title={t('ownerServices.submitRepair')}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={submitting}
      okText={t('ownerServices.submitTicket')}
      cancelText={t('common.cancel')}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="property_id" label={t('ownerServices.labelRepairProperty')} rules={[{ required: true, message: t('ownerServices.msgSelectProperty') }]}>
          <Select
            placeholder={t('ownerServices.msgSelectProperty')}
            options={propertyOptions.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Form.Item>
        <Form.Item name="title" label={t('ownerServices.labelRepairTitle')} rules={[{ required: true, message: t('ownerServices.msgRepairTitle') }]}>
          <Input maxLength={60} placeholder={t('ownerServices.repairTitlePlaceholder')} />
        </Form.Item>
        <Form.Item name="description" label={t('ownerServices.labelProblemDesc')}>
          <Input.TextArea rows={3} maxLength={300} placeholder={t('ownerServices.problemDescPlaceholder')} />
        </Form.Item>
        <Form.Item name="priority" label={t('ownerServices.labelPriority')} rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'low', label: t('ownerServices.priorityLow') },
              { value: 'medium', label: t('ownerServices.priorityMedium') },
              { value: 'high', label: t('ownerServices.priorityHigh') },
              { value: 'urgent', label: t('ownerServices.priorityUrgent') },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
