import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TreeSelect,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { departmentsApi } from '@/services/api'

interface DeptNode {
  id: string
  name: string
  code: string
  parent_id?: string | null
  leader_id?: string | null
  leader_name?: string | null
  sort?: number
  is_active?: boolean
  member_count?: number
  children?: DeptNode[]
}

interface UserOption {
  id: string
  full_name?: string
  email?: string
  role?: string
}

interface DeptForm {
  name: string
  code: string
  parent_id?: string | null
  leader_id?: string | null
  sort?: number
  is_active?: boolean
}

const Departments = () => {
  const { t } = useTranslation()
  const [tree, setTree] = useState<DeptNode[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<UserOption[]>([])
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DeptNode | null>(null)
  const [assignTarget, setAssignTarget] = useState<DeptNode | null>(null)
  const [assignUserId, setAssignUserId] = useState<string | undefined>(undefined)
  const [form] = Form.useForm<DeptForm>()

  const collectKeys = useCallback((nodes: DeptNode[]): string[] => {
    const keys: string[] = []
    const walk = (list: DeptNode[]) => {
      list.forEach((n) => {
        if (n.children && n.children.length) {
          keys.push(n.id)
          walk(n.children)
        }
      })
    }
    walk(nodes)
    return keys
  }, [])

  const fetchTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await departmentsApi.tree()
      const d = res.data?.data ?? res.data
      const nodes: DeptNode[] = d ?? []
      setTree(nodes)
      setExpandedKeys(collectKeys(nodes))
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemDepartments.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [collectKeys, t])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/admin/users', { params: { page_size: 200 } })
      const d = res.data?.data ?? res.data
      setUsers(d?.items ?? [])
    } catch {
      setUsers([])
    }
  }, [])

  useEffect(() => {
    fetchTree()
    fetchUsers()
  }, [fetchTree, fetchUsers])

  const treeSelectData = useMemo(() => {
    const toNode = (n: DeptNode): any => ({
      value: n.id,
      title: n.name,
      children: (n.children ?? []).map(toNode),
    })
    return tree.map(toNode)
  }, [tree])

  const leaderOptions = useMemo(
    () => users.map((u) => ({ value: u.id, label: u.full_name || u.email || u.id })),
    [users],
  )

  const openCreate = (parent?: DeptNode) => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ sort: 0, is_active: true, parent_id: parent?.id ?? undefined })
    setModalOpen(true)
  }

  const openEdit = (row: DeptNode) => {
    setEditing(row)
    form.setFieldsValue({
      name: row.name,
      code: row.code,
      parent_id: row.parent_id ?? undefined,
      leader_id: row.leader_id ?? undefined,
      sort: row.sort ?? 0,
      is_active: row.is_active ?? true,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload: DeptForm = {
        name: values.name,
        code: values.code,
        parent_id: values.parent_id ?? null,
        leader_id: values.leader_id ?? null,
        sort: values.sort ?? 0,
      }
      if (editing) {
        payload.is_active = values.is_active ?? true
        await departmentsApi.update(editing.id, payload)
        message.success(t('systemDepartments.updateOk'))
      } else {
        await departmentsApi.create(payload)
        message.success(t('systemDepartments.createOk'))
      }
      setModalOpen(false)
      fetchTree()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.detail || t('systemDepartments.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: DeptNode) => {
    try {
      await departmentsApi.remove(row.id)
      message.success(t('systemDepartments.deleteOk'))
      fetchTree()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemDepartments.removeFailed'))
    }
  }

  const handleAssign = async () => {
    if (!assignTarget || !assignUserId) {
      message.warning(t('systemDepartments.userRequired'))
      return
    }
    setSaving(true)
    try {
      await departmentsApi.assign(assignUserId, assignTarget.id)
      message.success(t('systemDepartments.assignOk'))
      setAssignTarget(null)
      setAssignUserId(undefined)
      fetchTree()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemDepartments.assignFailed'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { title: t('systemDepartments.colName'), dataIndex: 'name', key: 'name' },
    { title: t('systemDepartments.colCode'), dataIndex: 'code', key: 'code' },
    {
      title: t('systemDepartments.colLeader'),
      dataIndex: 'leader_name',
      key: 'leader_name',
      render: (v: string | null) => v || '—',
    },
    {
      title: t('systemDepartments.colMembers'),
      dataIndex: 'member_count',
      key: 'member_count',
      render: (v: number) => <Tag color="cyan">{v ?? 0}</Tag>,
    },
    { title: t('systemDepartments.colSort'), dataIndex: 'sort', key: 'sort', width: 80 },
    {
      title: t('systemDepartments.colActive'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 90,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>
          {v ? t('systemDepartments.active') : t('systemDepartments.inactive')}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 260,
      render: (_: unknown, row: DeptNode) => (
        <Space size="small">
          <Button size="small" onClick={() => openCreate(row)}>
            {t('systemDepartments.addChild')}
          </Button>
          <Button size="small" onClick={() => openEdit(row)}>
            {t('systemDepartments.edit')}
          </Button>
          <Button size="small" onClick={() => setAssignTarget(row)}>
            {t('systemDepartments.assignMember')}
          </Button>
          <Popconfirm
            title={t('systemDepartments.deleteConfirm')}
            onConfirm={() => handleDelete(row)}
            okText={t('systemDepartments.delete')}
          >
            <Button size="small" danger>
              {t('systemDepartments.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>
            {t('systemDepartments.title')}
          </h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            {t('systemDepartments.subtitle')}
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
            {t('systemDepartments.addRoot')}
          </Button>
        </div>
      </div>

      <Card loading={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={tree}
          pagination={false}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
          }}
          locale={{ emptyText: t('systemDepartments.empty') }}
        />
      </Card>

      <Modal
        title={editing ? t('systemDepartments.edit') : t('systemDepartments.addRoot')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ sort: 0, is_active: true }}>
          <Form.Item
            name="name"
            label={t('systemDepartments.formName')}
            rules={[{ required: true, message: t('systemDepartments.requiredName') }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="code"
            label={t('systemDepartments.formCode')}
            rules={[{ required: true, message: t('systemDepartments.requiredCode') }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="parent_id" label={t('systemDepartments.formParent')}>
            <TreeSelect
              allowClear
              treeDefaultExpandAll
              treeData={treeSelectData}
              placeholder={t('systemDepartments.formParent')}
            />
          </Form.Item>
          <Form.Item name="leader_id" label={t('systemDepartments.formLeader')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={leaderOptions}
              placeholder={t('systemDepartments.formLeader')}
            />
          </Form.Item>
          <Form.Item name="sort" label={t('systemDepartments.formSort')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {editing && (
            <Form.Item name="is_active" label={t('systemDepartments.formActive')} valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={t('systemDepartments.assignTitle', { name: assignTarget?.name ?? '' })}
        open={!!assignTarget}
        onCancel={() => setAssignTarget(null)}
        onOk={handleAssign}
        confirmLoading={saving}
        destroyOnClose
      >
        <Select
          style={{ width: '100%' }}
          showSearch
          allowClear
          optionFilterProp="label"
          value={assignUserId}
          onChange={setAssignUserId}
          options={leaderOptions}
          placeholder={t('systemDepartments.selectUser')}
        />
      </Modal>
    </div>
  )
}

export default Departments
