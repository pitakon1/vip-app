import { useCallback, useEffect, useState } from 'react'
import { Card, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Empty, Tag, Drawer, Avatar } from 'antd'
import { PlusOutlined, TeamOutlined, DeleteOutlined, UserAddOutlined } from '@ant-design/icons'
import api from '@/lib/api'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
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
      message.error(err?.response?.data?.detail || t('systemGroups.errLoad'))
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
    try {
      const values = await form.validateFields()
      setSaving(true)
      await api.post('/user-groups', values)
      message.success(t('systemGroups.msgCreated'))
      setModalOpen(false)
      form.resetFields()
      fetchGroups()
    } catch (err: any) {
      if (err?.errorFields) {
        form.scrollToField(err.errorFields[0].name)
        return
      }
      message.error(err?.response?.data?.detail || t('systemGroups.errCreate'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (g: UserGroup) => {
    try {
      await api.delete(`/user-groups/${g.id}`)
      message.success(t('systemGroups.msgDeleted'))
      fetchGroups()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemGroups.errDelete'))
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
      message.success(t('systemGroups.msgAdded'))
      fetchGroups()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemGroups.errAdd'))
    }
  }

  const removeMember = async (userId: string) => {
    try {
      await api.delete(`/user-groups/${drawerGroup!.id}/members/${userId}`)
      setMembers((m) => m.filter((x) => x.user_id !== userId))
      message.success(t('systemGroups.msgRemoved'))
      fetchGroups()
    } catch (err: any) {
      message.error(t('systemGroups.errRemove'))
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>{t('systemGroups.title')}</h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>{t('systemGroups.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            {t('systemGroups.newGroup')}
          </Button>
        </div>
      </div>

      {groups.length === 0 && !loading ? (
        <div className="rent-empty">
          <Empty description={t('systemGroups.emptyGroups')} />
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
                  {!g.is_active && <Tag>{t('systemGroups.inactive')}</Tag>}
                </Space>
              }
              extra={
                <Popconfirm title={t('systemGroups.confirmDelete')} onConfirm={() => handleDelete(g)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              }
            >
              <p style={{ color: 'var(--rent-ink-3)', minHeight: 20, marginBottom: 16 }}>{g.description || t('systemGroups.noDescription')}</p>
              <Space wrap>
                {(g.members ?? []).slice(0, 8).map((m) => (
                  <Avatar key={m.user_id} size="small" style={{ background: 'var(--rent-primary)' }}>
                    {(m.full_name || '?').charAt(0).toUpperCase()}
                  </Avatar>
                ))}
                {g.member_count === 0 && <span style={{ color: 'var(--rent-ink-3)', fontSize: 13 }}>{t('systemGroups.noMembers')}</span>}
              </Space>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--rent-ink-3)', fontSize: 13 }}>{t('systemGroups.membersCount', { count: g.member_count })}</span>
                <Button size="small" icon={<UserAddOutlined />} onClick={() => openDrawer(g)}>
                  {t('systemGroups.manageMembers')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal title={t('systemGroups.newGroup')} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleCreate} confirmLoading={saving} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('systemGroups.labelName')} rules={[{ required: true, message: t('systemGroups.errNameRequired') }]}>
            <Input placeholder={t('systemGroups.phGroupName')} />
          </Form.Item>
          <Form.Item name="description" label={t('systemGroups.labelDescription')}>
            <Input.TextArea rows={2} placeholder={t('systemGroups.phPurpose')} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={t('systemGroups.drawerTitle', { name: drawerGroup?.name || '' })}
        open={!!drawerGroup}
        onClose={() => setDrawerGroup(null)}
        width={420}
      >
        <Form form={memberForm} layout="inline" style={{ marginBottom: 20 }}>
          <Form.Item name="user_id" style={{ flex: 1 }}>
            <Select
              showSearch
              placeholder={t('systemGroups.phSelectAccount')}
              optionFilterProp="label"
              options={accounts
                .filter((a) => !members.some((m) => m.user_id === a.id))
                .map((a) => ({ value: a.id, label: `${a.full_name}（${a.email}）` }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<UserAddOutlined />} onClick={addMember}>
              {t('systemGroups.add')}
            </Button>
          </Form.Item>
        </Form>

        {members.length === 0 ? (
          <Empty description={t('systemGroups.noMembers')} />
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
                  <div style={{ fontWeight: 600 }}>{m.full_name || t('systemGroups.unnamed')}</div>
                  <div style={{ fontSize: 12, color: 'var(--rent-ink-3)' }}>{m.email}</div>
                </div>
              </Space>
              <Popconfirm title={t('systemGroups.confirmRemove')} onConfirm={() => removeMember(m.user_id)}>
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