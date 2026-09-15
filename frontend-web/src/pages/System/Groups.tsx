import { useCallback, useEffect, useState } from 'react'
import { Card, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Empty, Tag, Drawer, Avatar } from 'antd'
import { PlusOutlined, TeamOutlined, DeleteOutlined, UserAddOutlined } from '@ant-design/icons'
import api from '@/lib/api'

interface GroupMember {
  user_id: string
  full_name?: string
  email?: string
}
interface UserGroup {
  id: string
  name: string
  description?: string
  is_active: boolean
  member_count: number
  members: GroupMember[]
  created_at?: string
}
interface AccountOption {
  id: string
  full_name: string
  email: string
}

const Groups = () => {
  const [groups, setGroups] = useState<UserGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drawerGroup, setDrawerGroup] = useState<UserGroup | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [memberForm] = Form.useForm()

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/user-groups')
      const payload = res.data?.data ?? res.data
      setGroups(payload?.items ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '加载分组失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const loadAccounts = async () => {
    try {
      const res = await api.get('/admin/users', { params: { page_size: 100 } })
      const payload = res.data?.data ?? res.data
      setAccounts((payload?.items ?? []).map((u: any) => ({ id: u.id, full_name: u.full_name, email: u.email })))
    } catch {
      setAccounts([])
    }
  }

  const handleCreate = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await api.post('/user-groups', values)
      message.success('分组已创建')
      setModalOpen(false)
      form.resetFields()
      fetchGroups()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (g: UserGroup) => {
    try {
      await api.delete(`/user-groups/${g.id}`)
      message.success('分组已删除')
      fetchGroups()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '删除失败')
    }
  }

  const openDrawer = async (g: UserGroup) => {
    setDrawerGroup(g)
    setMembers(g.members ?? [])
    await loadAccounts()
  }

  const addMember = async () => {
    const { user_id } = await memberForm.validateFields()
    try {
      const res = await api.post(`/user-groups/${drawerGroup!.id}/members`, { user_id })
      const payload = res.data?.data ?? res.data
      setMembers(payload.members ?? [])
      memberForm.resetFields()
      message.success('已加入分组')
      fetchGroups()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '添加失败')
    }
  }

  const removeMember = async (userId: string) => {
    try {
      await api.delete(`/user-groups/${drawerGroup!.id}/members/${userId}`)
      setMembers((m) => m.filter((x) => x.user_id !== userId))
      message.success('已移除成员')
      fetchGroups()
    } catch (err: any) {
      message.error('移除失败')
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>用户分组</h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>按运营团队组织账号，便于管理与协作</p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新建分组
          </Button>
        </div>
      </div>

      {groups.length === 0 && !loading ? (
        <div className="rent-empty">
          <Empty description="暂无分组，点击右上角新建" />
        </div>
      ) : (
        <div className="rent-grid rent-grid--3">
          {groups.map((g) => (
            <Card
              key={g.id}
              loading={loading}
              title={
                <Space>
                  <TeamOutlined style={{ color: 'var(--rent-primary)' }} />
                  {g.name}
                  {!g.is_active && <Tag>已停用</Tag>}
                </Space>
              }
              extra={
                <Popconfirm title="确认删除该分组？" onConfirm={() => handleDelete(g)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              }
            >
              <p style={{ color: 'var(--rent-ink-3)', minHeight: 20, marginBottom: 16 }}>{g.description || '暂无描述'}</p>
              <Space wrap>
                {(g.members ?? []).slice(0, 8).map((m) => (
                  <Avatar key={m.user_id} size="small" style={{ background: 'var(--rent-primary)' }}>
                    {(m.full_name || '?').charAt(0).toUpperCase()}
                  </Avatar>
                ))}
                {g.member_count === 0 && <span style={{ color: 'var(--rent-ink-3)', fontSize: 13 }}>暂无成员</span>}
              </Space>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--rent-ink-3)', fontSize: 13 }}>{g.member_count} 名成员</span>
                <Button size="small" icon={<UserAddOutlined />} onClick={() => openDrawer(g)}>
                  管理成员
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal title="新建分组" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleCreate} confirmLoading={saving} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input placeholder="如：运营一组" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="用途说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`分组成员 · ${drawerGroup?.name || ''}`}
        open={!!drawerGroup}
        onClose={() => setDrawerGroup(null)}
        width={420}
      >
        <Form form={memberForm} layout="inline" style={{ marginBottom: 20 }}>
          <Form.Item name="user_id" style={{ flex: 1 }}>
            <Select
              showSearch
              placeholder="选择账号加入分组"
              optionFilterProp="label"
              options={accounts
                .filter((a) => !members.some((m) => m.user_id === a.id))
                .map((a) => ({ value: a.id, label: `${a.full_name}（${a.email}）` }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<UserAddOutlined />} onClick={addMember}>
              添加
            </Button>
          </Form.Item>
        </Form>

        {members.length === 0 ? (
          <Empty description="暂无成员" />
        ) : (
          members.map((m) => (
            <div
              key={m.user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid var(--rent-line)',
              }}
            >
              <Space>
                <Avatar size="small" style={{ background: 'var(--rent-primary)' }}>
                  {(m.full_name || '?').charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <div style={{ fontWeight: 600 }}>{m.full_name || '未命名'}</div>
                  <div style={{ fontSize: 12, color: 'var(--rent-ink-3)' }}>{m.email}</div>
                </div>
              </Space>
              <Popconfirm title="移除该成员？" onConfirm={() => removeMember(m.user_id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </div>
          ))
        )}
      </Drawer>
    </div>
  )
}

export default Groups