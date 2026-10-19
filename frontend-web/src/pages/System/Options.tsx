import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AutoComplete,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { optionsApi } from '@/services/api'

interface OptionItem {
  id: string
  type: string
  value: string
  label?: string
  label_i18n?: Record<string, string>
  sort?: number
  is_active?: boolean
  is_system?: boolean
}

interface OptionForm {
  type: string
  value: string
  label?: string
  label_i18n?: { zh?: string; en?: string; th?: string }
  sort?: number
  is_active?: boolean
}

const Options = () => {
  const { t } = useTranslation()
  const [items, setItems] = useState<OptionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeType, setActiveType] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<OptionItem | null>(null)
  const [form] = Form.useForm<OptionForm>()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await optionsApi.list({ active_only: false })
      const d = res.data?.data ?? res.data
      setItems(d ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemOptions.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const types = useMemo(() => {
    const set = new Set<string>()
    items.forEach((it) => set.add(it.type))
    return Array.from(set).sort()
  }, [items])

  const typeOptions = useMemo(() => types.map((v) => ({ value: v })), [types])

  const filtered = useMemo(
    () => (activeType === 'all' ? items : items.filter((it) => it.type === activeType)),
    [items, activeType],
  )

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ type: activeType !== 'all' ? activeType : undefined, sort: 0, is_active: true })
    setModalOpen(true)
  }

  const openEdit = (row: OptionItem) => {
    setEditing(row)
    form.setFieldsValue({
      type: row.type,
      value: row.value,
      label: row.label,
      label_i18n: {
        zh: row.label_i18n?.zh ?? '',
        en: row.label_i18n?.en ?? '',
        th: row.label_i18n?.th ?? '',
      },
      sort: row.sort ?? 0,
      is_active: row.is_active ?? true,
    })
    setModalOpen(true)
  }

  const cleanLabelI18n = (v?: { zh?: string; en?: string; th?: string }) => {
    const out: Record<string, string> = {}
    if (v?.zh) out.zh = v.zh
    if (v?.en) out.en = v.en
    if (v?.th) out.th = v.th
    return out
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const labelI18n = cleanLabelI18n(values.label_i18n)
      if (editing) {
        await optionsApi.update(editing.id, {
          label: values.label ?? '',
          label_i18n: labelI18n,
          sort: values.sort ?? 0,
          is_active: values.is_active ?? true,
        })
        message.success(t('systemOptions.updateOk'))
      } else {
        await optionsApi.create({
          type: values.type,
          value: values.value,
          label: values.label ?? '',
          label_i18n: labelI18n,
          sort: values.sort ?? 0,
          is_active: values.is_active ?? true,
        })
        message.success(t('systemOptions.createOk'))
      }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.detail || t('systemOptions.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: OptionItem, is_active: boolean) => {
    try {
      await optionsApi.update(row.id, { is_active })
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemOptions.saveFailed'))
    }
  }

  const handleDelete = async (row: OptionItem) => {
    try {
      await optionsApi.remove(row.id)
      message.success(t('systemOptions.deleteOk'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemOptions.removeFailed'))
    }
  }

  const columns = [
    { title: t('systemOptions.colValue'), dataIndex: 'value', key: 'value' },
    {
      title: t('systemOptions.colLabel'),
      dataIndex: 'label',
      key: 'label',
      render: (v: string, row: OptionItem) => v || row.label_i18n?.zh || '—',
    },
    {
      title: t('systemOptions.colI18n'),
      key: 'i18n',
      render: (_: unknown, row: OptionItem) => (
        <Space size={4} wrap>
          {row.label_i18n?.zh && <Tag>zh: {row.label_i18n.zh}</Tag>}
          {row.label_i18n?.en && <Tag color="blue">en: {row.label_i18n.en}</Tag>}
          {row.label_i18n?.th && <Tag color="purple">th: {row.label_i18n.th}</Tag>}
        </Space>
      ),
    },
    { title: t('systemOptions.colSort'), dataIndex: 'sort', key: 'sort', width: 80 },
    {
      title: t('systemOptions.colActive'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (v: boolean, row: OptionItem) => (
        <Switch checked={!!v} onChange={(checked) => toggleActive(row, checked)} />
      ),
    },
    {
      title: t('systemOptions.colSystem'),
      dataIndex: 'is_system',
      key: 'is_system',
      width: 100,
      render: (v: boolean) =>
        v ? <Tag color="gold">{t('systemOptions.system')}</Tag> : <Tag>{t('systemOptions.custom')}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_: unknown, row: OptionItem) => (
        <Space size="small">
          <Button size="small" onClick={() => openEdit(row)}>
            {t('systemOptions.edit')}
          </Button>
          <Popconfirm
            title={t('systemOptions.deleteConfirm')}
            onConfirm={() => handleDelete(row)}
            okText={t('systemOptions.delete')}
            disabled={!!row.is_system}
          >
            <Button size="small" danger disabled={!!row.is_system}>
              {t('systemOptions.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const tabItems = [
    { key: 'all', label: `${t('systemOptions.all')} (${items.length})` },
    ...types.map((v) => ({
      key: v,
      label: `${v} (${items.filter((it) => it.type === v).length})`,
    })),
  ]

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>
            {t('systemOptions.title')}
          </h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            {t('systemOptions.subtitle')}
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t('systemOptions.add')}
          </Button>
        </div>
      </div>

      <Card loading={loading}>
        <Tabs activeKey={activeType} onChange={setActiveType} items={tabItems} />
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: t('systemOptions.empty') }}
        />
      </Card>

      <Modal
        title={editing ? t('systemOptions.edit') : t('systemOptions.add')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ sort: 0, is_active: true }}>
          <Form.Item
            name="type"
            label={t('systemOptions.formType')}
            rules={[{ required: true, message: t('systemOptions.requiredType') }]}
          >
            <AutoComplete
              options={typeOptions}
              placeholder={t('systemOptions.formType')}
              disabled={!!editing}
            />
          </Form.Item>
          <Form.Item
            name="value"
            label={t('systemOptions.formValue')}
            rules={[{ required: true, message: t('systemOptions.requiredValue') }]}
          >
            <Input maxLength={64} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="label" label={t('systemOptions.formLabel')}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name={['label_i18n', 'zh']} label="zh">
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name={['label_i18n', 'en']} label="en">
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name={['label_i18n', 'th']} label="th">
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="sort" label={t('systemOptions.formSort')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label={t('systemOptions.formActive')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Options
