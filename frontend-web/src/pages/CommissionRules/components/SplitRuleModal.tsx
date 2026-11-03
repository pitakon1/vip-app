import { Form, InputNumber, Modal, Select, Switch } from 'antd'
import type { FormInstance } from 'antd'
import { useTranslation } from 'react-i18next'
import { ROLE_LABELS } from '../constants'
import type { SplitForm } from '../types'

interface SplitRuleModalProps {
  open: boolean
  editId: string | null
  form: FormInstance<SplitForm>
  partners: { id: string; name: string }[]
  saving: boolean
  onSubmit: () => void
  onCancel: () => void
}

export default function SplitRuleModal({ open, editId, form, partners, saving, onSubmit, onCancel }: SplitRuleModalProps) {
  const { t } = useTranslation()
  return (
    <Modal
      title={editId ? t('commissionSplit.editTitle') : t('commissionSplit.createTitle')}
      open={open}
      onCancel={() => !saving && onCancel()}
      onOk={() => onSubmit()}
      confirmLoading={saving}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="deal_type" label={t('commissionSplit.labelDealType')} rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'new_rental', label: t('commissionRules.dealType.new_rental') },
              { value: 'renewal', label: t('commissionRules.dealType.renewal') },
              { value: 'management', label: t('commissionRules.dealType.management') },
            ]}
          />
        </Form.Item>
        <Form.Item name="role" label={t('commissionSplit.labelRole')} rules={[{ required: true }]}>
          <Select
            options={Object.entries(ROLE_LABELS).map(([k, v]) => ({ value: k, label: t(v) }))}
          />
        </Form.Item>
        <Form.Item name="percent" label={t('commissionSplit.labelPercent')} rules={[{ required: true, type: 'number' }]}>
          <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} addonAfter="%" />
        </Form.Item>
        <Form.Item name="scope" label={t('commissionSplit.labelScope')} rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'all', label: t('commissionSplit.scope.all') },
              { value: 'by_partner', label: t('commissionSplit.scope.byPartner') },
            ]}
          />
        </Form.Item>
        <Form.Item
          noStyle
          shouldUpdate={(prev, cur) => prev.scope !== cur.scope}
        >
          {() => (
            form.getFieldValue('scope') === 'by_partner' ? (
              <Form.Item name="partner_id" label={t('commissionSplit.labelPartner')} rules={[{ required: true, message: t('commissionSplit.errPartner') }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('commissionSplit.placeholderPartner')}
                  options={partners.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Form.Item>
            ) : null
          )}
        </Form.Item>
        <Form.Item name="is_active" label={t('commissionSplit.labelActive')} valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
