import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { dataScopeApi } from '@/services/api'

interface RoleScope {
  role: string
  scope: string
  configured: boolean
}

interface UserScope {
  user_id: string
  full_name?: string
  email?: string
  role?: string
  scope: string
  configured: boolean
}

interface ScopeView {
  roles: RoleScope[]
  users: UserScope[]
  values: string[]
}

interface UserOption {
  id: string
  full_name?: string
  email?: string
  role?: string
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'systemPermissions.roleAdmin',
  agent: 'systemPermissions.roleAgent',
  employee: 'systemPermissions.roleEmployee',
  owner: 'systemPermissions.roleOwner',
  tenant: 'systemPermissions.roleTenant',
  partner_admin: 'systemDataScopes.rolePartnerAdmin',
}

const SCOPE_LABEL: Record<string, string> = {
  self: 'systemDataScopes.scopeSelf',
  department: 'systemDataScopes.scopeDepartment',
  department_and_below: 'systemDataScopes.scopeDepartmentAndBelow',
  all: 'systemDataScopes.scopeAll',
}

const DataScopes = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<ScopeView | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<UserOption[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [newUserId, setNewUserId] = useState<string | undefined>(undefined)
  const [newScope, setNewScope] = useState<string>('self')

  const scopeLabel = useCallback(
    (v: string) => (SCOPE_LABEL[v] ? t(SCOPE_LABEL[v]) : v),
    [t],
  )

  const scopeOptions = useMemo(
    () => (data?.values ?? ['self', 'department', 'department_and_below', 'all']).map((v) => ({
      value: v,
      label: scopeLabel(v),
    })),
    [data, scopeLabel],
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dataScopeApi.get()
      setData(res.data?.data ?? res.data)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemDataScopes.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

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
    fetchData()
    fetchUsers()
  }, [fetchData, fetchUsers])

  const handleRoleChange = async (role: string, scope: string) => {
    setSaving(true)
    try {
      await dataScopeApi.setRole(role, scope)
      message.success(t('systemDataScopes.saved'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemDataScopes.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleUserChange = async (userId: string, scope: string) => {
    setSaving(true)
    try {
      await dataScopeApi.setUser(userId, scope)
      message.success(t('systemDataScopes.saved'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemDataScopes.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleClearUser = async (userId: string) => {
    try {
      await dataScopeApi.clearUser(userId)
      message.success(t('systemDataScopes.cleared'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemDataScopes.clearFailed'))
    }
  }

  const handleAddUser = async () => {
    if (!newUserId) {
      message.warning(t('systemDataScopes.userRequired'))
      return
    }
    await handleUserChange(newUserId, newScope)
    setModalOpen(false)
    setNewUserId(undefined)
    setNewScope('self')
  }

  const userOptions = useMemo(
    () => users.map((u) => ({ value: u.id, label: u.full_name || u.email || u.id })),
    [users],
  )

  const roleColumns = [
    {
      title: t('systemDataScopes.colRole'),
      dataIndex: 'role',
      key: 'role',
      render: (v: string) => (
        <Tag color="geekblue">{ROLE_LABEL[v] ? t(ROLE_LABEL[v]) : v}</Tag>
      ),
    },
    {
      title: t('systemDataScopes.colScope'),
      dataIndex: 'scope',
      key: 'scope',
      render: (v: string, row: RoleScope) => (
        <Select
          value={v}
          style={{ width: 220 }}
          options={scopeOptions}
          disabled={saving}
          onChange={(val) => handleRoleChange(row.role, val)}
        />
      ),
    },
    {
      title: t('systemDataScopes.colConfigured'),
      dataIndex: 'configured',
      key: 'configured',
      width: 140,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>
          {v ? t('systemDataScopes.configured') : t('systemDataScopes.builtinDefault')}
        </Tag>
      ),
    },
  ]

  const userColumns = [
    {
      title: t('systemDataScopes.colUser'),
      key: 'user',
      render: (_: unknown, row: UserScope) => row.full_name || row.email || row.user_id,
    },
    {
      title: t('systemDataScopes.colRole'),
      dataIndex: 'role',
      key: 'role',
      render: (v: string) => (v && ROLE_LABEL[v] ? t(ROLE_LABEL[v]) : v || '—'),
    },
    {
      title: t('systemDataScopes.colScope'),
      dataIndex: 'scope',
      key: 'scope',
      render: (v: string, row: UserScope) => (
        <Select
          value={v}
          style={{ width: 220 }}
          options={scopeOptions}
          disabled={saving}
          onChange={(val) => handleUserChange(row.user_id, val)}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_: unknown, row: UserScope) => (
        <Popconfirm
          title={t('systemDataScopes.clearConfirm')}
          onConfirm={() => handleClearUser(row.user_id)}
        >
          <Button size="small" danger>
            {t('systemDataScopes.remove')}
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>
            {t('systemDataScopes.title')}
          </h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            {t('systemDataScopes.subtitle')}
          </p>
        </div>
      </div>

      <Card loading={loading || !data} title={t('systemDataScopes.roleSection')} style={{ marginBottom: 16 }}>
        <Table
          rowKey="role"
          columns={roleColumns}
          dataSource={data?.roles ?? []}
          pagination={false}
        />
      </Card>

      <Card
        title={t('systemDataScopes.userSection')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            {t('systemDataScopes.addUser')}
          </Button>
        }
      >
        <Table
          rowKey="user_id"
          columns={userColumns}
          dataSource={data?.users ?? []}
          pagination={false}
          locale={{ emptyText: t('systemDataScopes.userEmpty') }}
        />
      </Card>

      <Modal
        title={t('systemDataScopes.addUser')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleAddUser}
        confirmLoading={saving}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            style={{ width: '100%' }}
            showSearch
            allowClear
            optionFilterProp="label"
            value={newUserId}
            onChange={setNewUserId}
            options={userOptions}
            placeholder={t('systemDataScopes.colUser')}
          />
          <Select
            style={{ width: '100%' }}
            value={newScope}
            onChange={setNewScope}
            options={scopeOptions}
          />
        </Space>
      </Modal>
    </div>
  )
}

export default DataScopes
