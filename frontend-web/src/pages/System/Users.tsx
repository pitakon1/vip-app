import { useCallback, useEffect, useState } from 'react'
import { Table, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Tooltip, Switch } from 'antd'
import { PlusOutlined, KeyOutlined } from '@ant-design/icons'
import api from '@/lib/api'

interface Account {
  id: string
  email: string
  phone?: string
  full_name: string
  role: string
  is_active: boolean
  is_verified: boolean
  created_at?: string
  groups: string[]
  employee?: { employee_code?: string; department?: string; position?: string }
}

const ROLE_COLOR: Record<string, string> = {
  admin: 'magenta',
  agent: 'geekblue',
  employee: 'cyan',
  owner: 'gold',
  tenant: 'green',
}
const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  agent: '经纪人',
  employee: '员工',
  owner: '业主',
  tenant: '租客',
}

const Users = () => {
  const [data, setData] = useState<Account[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<{ page: number; page_size: number; role?: string; keyword?: string }>({
    page: 1,
    page_size: 20,
  })
  const [form] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [pwdTarget, setPwdTarget] = useState<Account | null>(null)
  const [pwdForm] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/users', {
        params: { page: query.page, page_size: query.page_size, role: query.role, keyword: query.keyword },
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || '获取账号失败')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ role: 'employee', password: '123456' })
    setModalOpen(true)
  }

  const openEdit = (row: Account) => {
    setEditing(row)
    form.setFieldsValue({
      email: row.email,
      full_name: row.full_name,
      phone: row.phone,
      role: row.role,
      department: row.employee?.department,
      position: row.employee?.position,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/admin/users/${editing.id}`, values)
        message.success('账号已更新')
      } else {
        await api.post('/admin/users', values)
        message.success('账号已创建')
      }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: Account, active: boolean) => {
    try {
      await api.post(`/admin/users/${row.id}/${active ? 'activate' : 'deactivate'}`)
      message.success(active ? '账号已启用' : '账号已停用')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  const handleResetPwd = async () => {
    const { new_password } = await pwdForm.validateFields()
    try {
      await api.post(`/admin/users/${pwdTarget!.id}/reset-password`, { new_password })
      message.success('密码已重置')
      setPwdTarget(null)
      pwdForm.resetFields()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '重置失败')
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>账号管理</h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            管理员开通/编辑/启停账号与角色分配
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建账号
          </Button>
        </div>
      </div>

      <div className="rent-card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="姓名 / 邮箱 / 手机号"
            style={{ maxWidth: 320 }}
            onSearch={(v) => setQuery((q) => ({ ...q, page: 1, keyword: v || undefined }))}
          />
          <Select
            allowClear
            placeholder="角色筛选"
            style={{ width: 160 }}
            options={Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
            value={query.role}
            onChange={(v) => setQuery((q) => ({ ...q, page: 1, role: v || undefined }))}
          />
          <Button onClick={fetchData}>刷新</Button>
        </div>

        <Table<Account>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={{
            current: query.page,
            pageSize: query.page_size,
            total,
            showSizeChanger: true,
            onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, page_size: pageSize })),
          }}
          columns={[
            {
              title: '姓名',
              dataIndex: 'full_name',
              render: (v, r) => (
                <Space direction="vertical" size={0}>
                  <span style={{ fontWeight: 600 }}>{v || '-'}</span>
                  <span style={{ fontSize: 12, color: 'var(--rent-ink-3)' }}>{r.email}</span>
                </Space>
              ),
            },
            { title: '角色', dataIndex: 'role', width: 90, render: (v: string) => <Tag color={ROLE_COLOR[v]}>{ROLE_LABEL[v] || v}</Tag> },
            {
              title: '员工档案',
              width: 180,
              render: (_, r) =>
                r.employee ? (
                  <Space direction="vertical" size={0}>
                    <span style={{ fontSize: 12 }}>{r.employee.employee_code}</span>
                    <span style={{ fontSize: 12, color: 'var(--rent-ink-3)' }}>
                      {r.employee.department || '-'} · {r.employee.position || '-'}
                    </span>
                  </Space>
                ) : (
                  <span style={{ color: 'var(--rent-ink-3)', fontSize: 12 }}>—</span>
                ),
            },
            { title: '分组', dataIndex: 'groups', width: 140, render: (g: string[]) => (g?.length ? g.map((n) => <Tag key={n}>{n}</Tag>) : '—') },
            {
              title: '状态',
              dataIndex: 'is_active',
              width: 90,
              render: (active: boolean, r) => (
                <Tooltip title={active ? '点击停用' : '点击启用'}>
                  <Switch checked={active} onChange={(v) => toggleActive(r, v)} size="small" />
                </Tooltip>
              ),
            },
            { title: '创建时间', dataIndex: 'created_at', width: 100, render: (v) => (v ? String(v).slice(0, 10) : '-') },
            {
              title: '操作',
              width: 150,
              render: (_, r) => (
                <Space>
                  <Button size="small" onClick={() => openEdit(r)}>
                    编辑
                  </Button>
                  <Button size="small" icon={<KeyOutlined />} onClick={() => setPwdTarget(r)}>
                    重置密码
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </div>

      <Modal
        title={editing ? '编辑账号' : '新建账号'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="full_name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="如：张运营" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input disabled={!!editing} placeholder="user@viprental.com" />
          </Form.Item>
          {!editing && (
            <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '至少 6 位' }]}>
              <Input.Password placeholder="默认 123456" />
            </Form.Item>
          )}
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input placeholder="如：运营部（agent/employee 生效）" />
          </Form.Item>
          <Form.Item name="position" label="职位">
            <Input placeholder="如：运营专员" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`重置密码 · ${pwdTarget?.full_name || ''}`}
        open={!!pwdTarget}
        onCancel={() => setPwdTarget(null)}
        onOk={handleResetPwd}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6, message: '至少 6 位' }]}>
            <Input.Password placeholder="输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Users