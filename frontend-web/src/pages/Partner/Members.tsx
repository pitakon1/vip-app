import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Form, Input, message, Popconfirm, Empty, Select, Tabs, Tag } from 'antd'
import DataState from '@/components/DataState'
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { errorText } from '@/lib/errorText'
import { useAuthStore } from '@/stores/auth'

interface Member {
  id: string
  email: string
  full_name: string
  role: string
  user_type: string
  partner_id?: string
  phone?: string
  is_active: boolean
  position?: string
  team_id?: string
}

interface PerfSummary {
  [key: string]: any
}

interface AgentPerf {
  user_id: string
  employee_name?: string
  total_commission: number
  total_revenue: number
  deals: number
}

interface PerfData {
  partner_id?: string
  summary?: PerfSummary
  monthly?: { year: number; month: number; revenue: number; commission: number; deals: number }[]
  agents?: AgentPerf[]
}

interface PropertyRow {
  id: string
  address?: string
  property_type?: string
  bedrooms?: number
  monthly_rent?: number
  status?: string
  created_by?: string
  created_at?: string
}

const fmtTime = (v?: string) => (v ? String(v).replace('T', ' ').slice(0, 16) : '—')

const Members = () => {
  const { t } = useTranslation()
  // 当前登录的合作管理员本人不应出现「移出本公司」入口（后端同样禁止移除自己）
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [perf, setPerf] = useState<PerfData | null>(null)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [propertiesError, setPropertiesError] = useState<string | null>(null)
  const [createForm] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pullForm] = Form.useForm()
  const [pullOpen, setPullOpen] = useState(false)
  const [pulling, setPulling] = useState(false)
  // 成员全生命周期（路线图 B1/B4）
  const [editForm] = Form.useForm()
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Member | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [inviteForm] = Form.useForm()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invites, setInvites] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [teamForm] = Form.useForm()
  const [teamOpen, setTeamOpen] = useState(false)
  const [teamTarget, setTeamTarget] = useState<Member | null>(null)
  const [teamSelect, setTeamSelect] = useState<string | undefined>()

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true)
    setMembersError(null)
    try {
      const res = await api.get('/partner/members')
      const payload = res.data?.data ?? res.data
      setMembers(Array.isArray(payload) ? payload : payload?.items ?? [])
    } catch (err: any) {
      setMembersError(errorText(err, t('common.loadFailed')))
    } finally {
      setMembersLoading(false)
    }
  }, [t])

  const fetchPerf = useCallback(async () => {
    try {
      const res = await api.get('/partner/performance')
      const payload = res.data?.data ?? res.data
      setPerf(payload)
    } catch {
      setPerf(null)
    }
  }, [])

  const fetchProperties = useCallback(async () => {
    setPropertiesError(null)
    try {
      const res = await api.get('/partner/properties')
      const payload = res.data?.data ?? res.data
      setProperties(Array.isArray(payload) ? payload : payload?.items ?? [])
    } catch {
      setProperties([])
      setPropertiesError(t('common.loadFailed'))
    }
  }, [t])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await api.get('/partner/teams')
      const payload = res.data?.data ?? res.data
      setTeams(Array.isArray(payload) ? payload : [])
    } catch {
      setTeams([])
    }
  }, [])

  const fetchInvites = useCallback(async () => {
    try {
      const res = await api.get('/partner/invitations')
      const payload = res.data?.data ?? res.data
      setInvites(Array.isArray(payload) ? payload : [])
    } catch {
      setInvites([])
    }
  }, [])

  useEffect(() => {
    fetchMembers()
    fetchPerf()
    fetchProperties()
    fetchTeams()
    fetchInvites()
  }, [fetchMembers, fetchPerf, fetchProperties, fetchTeams, fetchInvites])

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setSaving(true)
      await api.post('/partner/members', values)
      message.success(t('member.msgCreated'))
      setCreateOpen(false)
      createForm.resetFields()
      fetchMembers()
    } catch (err: any) {
      if (err?.errorFields) {
        createForm.scrollToField(err.errorFields[0].name)
        return
      }
      message.error(errorText(err, t('member.errCreate')))
    } finally {
      setSaving(false)
    }
  }

  const handlePullIn = async () => {
    try {
      const { user_id } = await pullForm.validateFields()
      setPulling(true)
      await api.post(`/partner/members/${user_id}/pull-in`)
      message.success(t('member.msgPullIn'))
      setPullOpen(false)
      pullForm.resetFields()
      fetchMembers()
    } catch (err: any) {
      if (err?.errorFields) {
        pullForm.scrollToField(err.errorFields[0].name)
        return
      }
      message.error(errorText(err, t('member.errPullIn')))
    } finally {
      setPulling(false)
    }
  }

  const handleRemove = async (m: Member) => {
    try {
      await api.delete(`/partner/members/${m.id}`)
      message.success(t('member.msgRemoved'))
      fetchMembers()
    } catch (err: any) {
      message.error(errorText(err, t('member.errRemove')))
    }
  }

  const openEdit = (m: Member) => {
    setEditTarget(m)
    editForm.setFieldsValue({ full_name: m.full_name, phone: m.phone, position: m.position })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editTarget) return
    try {
      const values = await editForm.validateFields()
      setSaving(true)
      await api.patch(`/partner/members/${editTarget.id}`, values)
      message.success('资料已更新')
      setEditOpen(false)
      fetchMembers()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(errorText(err, '更新失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (m: Member) => {
    try {
      await api.post(`/partner/members/${m.id}/${m.is_active ? 'deactivate' : 'activate'}`)
      message.success(m.is_active ? '已停用，该成员将无法登录' : '已启用')
      fetchMembers()
    } catch (err: any) {
      message.error(errorText(err, '操作失败'))
    }
  }

  const handleResetPwd = async (m: Member) => {
    try {
      const res = await api.post(`/partner/members/${m.id}/reset-password`, {})
      const pwd = (res.data?.data ?? res.data)?.password
      Modal.info({
        title: `已重置 ${m.full_name || m.email} 的密码`,
        content: `临时密码：${pwd}（仅显示一次，请转告成员后要求其尽快修改）`,
      })
    } catch (err: any) {
      message.error(errorText(err, '重置失败'))
    }
  }

  const handleImport = async () => {
    if (!importText.trim()) return
    setImporting(true)
    try {
      const res = await api.post('/partner/members/import', { csv: importText })
      const data = res.data?.data ?? res.data
      message.success(`导入完成：成功 ${data?.created?.length ?? 0} 行，失败 ${data?.errors?.length ?? 0} 行`)
      if ((data?.errors ?? []).length) {
        Modal.warning({
          title: '以下行未导入',
          content: (
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              {data.errors.map((e: any) => (
                <div key={`${e.line}-${e.email}`}>第 {e.line} 行 {e.email || ''}：{e.error}</div>
              ))}
            </div>
          ),
        })
      }
      setImportOpen(false)
      setImportText('')
      fetchMembers()
    } catch (err: any) {
      message.error(errorText(err, '导入失败'))
    } finally {
      setImporting(false)
    }
  }

  const handleInvite = async () => {
    try {
      const values = await inviteForm.validateFields()
      const res = await api.post('/partner/invitations', values)
      const data = res.data?.data ?? res.data
      Modal.info({
        title: '邀请已创建',
        content: `邀请 token：${data?.token}\n到期：${fmtTime(data?.expires_at)}\n已注册经纪人可在「接受邀请」处输入该 token 加入本公司。`,
      })
      setInviteOpen(false)
      inviteForm.resetFields()
      fetchInvites()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(errorText(err, '创建邀请失败'))
    }
  }

  const handleCreateTeam = async () => {
    try {
      const values = await teamForm.validateFields()
      await api.post('/partner/teams', { name: values.name })
      message.success('团队已创建')
      setTeamOpen(false)
      teamForm.resetFields()
      fetchTeams()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(errorText(err, '创建失败'))
    }
  }

  const handleAssignTeam = async () => {
    if (!teamTarget) return
    try {
      await api.patch(`/partner/members/${teamTarget.id}/team`, { team_id: teamSelect || null })
      message.success('团队归属已更新')
      setTeamTarget(null)
      fetchMembers()
      fetchTeams()
    } catch (err: any) {
      message.error(errorText(err, '设置失败'))
    }
  }

  const summary = perf?.summary ?? {}

  const stats = [
    { label: t('member.statRevenue'), value: formatMoney(summary.total_revenue), icon: 'M1 4h22v16H1z M1 10h23' },
    { label: t('member.statCommission'), value: formatMoney(summary.total_commission), icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    { label: t('member.statDeals'), value: summary.total_deals ?? summary.deals ?? 0, icon: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z' },
    { label: t('member.statMembers'), value: members.length, icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0' },
  ]

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('member.title')}</h2>
          <p className="rent-page-header__subtitle">{t('member.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <Button onClick={() => setImportOpen(true)}>批量导入</Button>
          <Button onClick={() => setInviteOpen(true)}>邀请加入</Button>
          <Button icon={<UserAddOutlined />} onClick={() => setPullOpen(true)}>
            {t('member.btnPullIn')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('member.btnCreate')}
          </Button>
        </div>
      </div>

      {/* Stat / Performance Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {stats.map((s) => (
          <div className="rent-stat-card" key={s.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{s.label}</div>
                <div className="rent-stat-card__value rent-num">{s.value}</div>
              </div>
              <div className="rent-stat-card__icon" style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--rent-primary)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={s.icon} />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Tabs
        defaultActiveKey="members"
        items={[
          {
            key: 'members',
            label: t('member.tabMembers'),
            children: (
              <div className="rent-card">
                <div className="rent-card__header">
                  <h3 className="rent-card__title">{t('member.listTitle')}</h3>
                </div>
                <div className="rent-card__body" style={{ padding: 0 }}>
                  <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                    <table className="rent-table">
                      <thead>
                        <tr>
                          <th>{t('member.thName')}</th>
                          <th>{t('member.thAccount')}</th>
                          <th>{t('member.thPosition')}</th>
                          <th>{t('common.status')}</th>
                          <th>{t('common.action')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {membersError && members.length === 0 ? (
                          <tr>
                            <td colSpan={5}>
                              <DataState error={membersError} retryText={t('common.retry')} onRetry={fetchMembers} />
                            </td>
                          </tr>
                        ) : membersLoading && members.length === 0 ? (
                          <tr>
                            <td colSpan={5}>
                              <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
                            </td>
                          </tr>
                        ) : members.length === 0 ? (
                          <tr>
                            <td colSpan={5}>
                              <DataState empty emptyTitle={t('member.emptyMembers')} />
                            </td>
                          </tr>
                        ) : (
                          members.map((m) => (
                            <tr key={m.id}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{m.full_name || '—'}</div>
                                {m.role && <div className="rent-text-sm rent-text-muted">{m.role}</div>}
                              </td>
                              <td>
                                <div className="rent-text-sm">{m.email}</div>
                                {m.phone && <div className="rent-text-sm rent-text-muted">{m.phone}</div>}
                              </td>
                              <td>{m.position || '—'}</td>
                              <td>
                                <span className={`rent-badge ${m.is_active ? 'rent-badge--success' : 'rent-badge--error'}`}>
                                  {m.is_active ? t('member.stEnabled') : t('member.stDisabled')}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  <Button size="small" type="text" onClick={() => openEdit(m)}>编辑</Button>
                                  <Button size="small" type="text" onClick={() => { setTeamTarget(m); setTeamSelect(m.team_id) }}>团队</Button>
                                  <Popconfirm title="确认重置该成员密码？" onConfirm={() => handleResetPwd(m)}>
                                    <Button size="small" type="text">重置密码</Button>
                                  </Popconfirm>
                                  {m.id !== currentUserId && (
                                    <>
                                      <Popconfirm
                                        title={m.is_active ? '停用后该成员将无法登录，确认？' : '确认启用该成员？'}
                                        onConfirm={() => handleToggleActive(m)}
                                      >
                                        <Button size="small" type="text">{m.is_active ? '停用' : '启用'}</Button>
                                      </Popconfirm>
                                      <Popconfirm
                                        title={t('member.confirmRemove')}
                                        okText={t('common.delete')}
                                        okButtonProps={{ danger: true }}
                                        onConfirm={() => handleRemove(m)}
                                      >
                                        <Button size="small" danger type="text">
                                          {t('common.delete')}
                                        </Button>
                                      </Popconfirm>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'perf',
            label: t('member.tabPerformance'),
            children: (
              <div className="rent-card">
                <div className="rent-card__header">
                  <h3 className="rent-card__title">{t('member.perfByAgent')}</h3>
                </div>
                <div className="rent-card__body" style={{ padding: 0 }}>
                  <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                    <table className="rent-table">
                      <thead>
                        <tr>
                          <th>{t('member.thName')}</th>
                          <th>{t('member.thRevenue')}</th>
                          <th>{t('member.thCommission')}</th>
                          <th>{t('member.thDeals')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!perf || (perf.agents ?? []).length === 0 ? (
                          <tr>
                            <td colSpan={4}>
                              <div className="rent-empty">
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('member.emptyPerformance')} />
                              </div>
                            </td>
                          </tr>
                        ) : (
                          (perf.agents ?? []).map((a) => (
                            <tr key={a.user_id}>
                              <td style={{ fontWeight: 600 }}>{a.employee_name || a.user_id}</td>
                              <td className="rent-table__mono">{formatMoney(a.total_revenue)}</td>
                              <td className="rent-table__mono">{formatMoney(a.total_commission)}</td>
                              <td>{a.deals ?? 0}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'properties',
            label: t('member.tabProperties'),
            children: (
              <div className="rent-card">
                <div className="rent-card__header">
                  <h3 className="rent-card__title">{t('member.propertiesTitle')}</h3>
                </div>
                <div className="rent-card__body" style={{ padding: 0 }}>
                  <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                    <table className="rent-table">
                      <thead>
                        <tr>
                          <th>{t('member.thAddress')}</th>
                          <th>{t('member.thType')}</th>
                          <th>{t('member.thBedrooms')}</th>
                          <th>{t('member.thMonthlyRent')}</th>
                          <th>{t('member.thStatus')}</th>
                          <th>{t('member.thCreated')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {propertiesError && properties.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <DataState error={propertiesError} retryText={t('common.retry')} onRetry={fetchProperties} />
                            </td>
                          </tr>
                        ) : properties.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <DataState empty emptyTitle={t('member.emptyProperties')} />
                            </td>
                          </tr>
                        ) : (
                          properties.map((p) => (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 600 }}>{p.address || '—'}</td>
                              <td>{p.property_type || '—'}</td>
                              <td>{p.bedrooms ?? '—'}</td>
                              <td className="rent-table__mono">{formatMoney(p.monthly_rent)}</td>
                              <td>
                                {p.status ? (
                                  <Tag>{p.status}</Tag>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="rent-table__mono">{fmtTime(p.created_at)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'teams',
            label: `团队（${teams.length}）`,
            children: (
              <div className="rent-card">
                <div className="rent-card__header">
                  <h3 className="rent-card__title">团队 / 组长</h3>
                  <Button type="primary" size="small" onClick={() => setTeamOpen(true)}>新建团队</Button>
                </div>
                <div className="rent-card__body" style={{ padding: 0 }}>
                  <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                    <table className="rent-table">
                      <thead>
                        <tr>
                          <th>团队名称</th>
                          <th>组长</th>
                          <th>成员数</th>
                          <th>说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.length === 0 ? (
                          <tr><td colSpan={4}><DataState empty emptyTitle="暂无团队，点击右上角创建" /></td></tr>
                        ) : teams.map((tm: any) => (
                          <tr key={tm.id}>
                            <td style={{ fontWeight: 600 }}>{tm.name}</td>
                            <td>{tm.leader_name || '—'}</td>
                            <td>{tm.member_count ?? 0}</td>
                            <td className="rent-text-sm rent-text-muted">
                              组长登录后仅可见本组数据（业绩 / 线索 / 带看）
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* Create member modal */}
      <Modal title={t('member.createTitle')} open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreate} confirmLoading={saving} forceRender>
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item name="full_name" label={t('member.labelName')} rules={[{ required: true, message: t('member.errNameRequired') }]}>
            <Input placeholder={t('member.placeholderName')} />
          </Form.Item>
          <Form.Item name="email" label={t('member.labelEmail')} rules={[{ required: true, type: 'email', message: t('member.errInvalidEmail') }]}>
            <Input placeholder="user@partner.com" />
          </Form.Item>
          <Form.Item name="password" label={t('member.labelPassword')} rules={[{ required: true, min: 6, message: t('member.errPwdMin') }]}>
            <Input.Password placeholder={t('member.placeholderPassword')} />
          </Form.Item>
          <Form.Item name="phone" label={t('member.labelPhone')}>
            <Input placeholder={t('member.placeholderPhone')} />
          </Form.Item>
          <Form.Item name="position" label={t('member.labelPosition')}>
            <Input placeholder={t('member.placeholderPosition')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Pull-in modal */}
      <Modal title={t('member.pullInTitle')} open={pullOpen} onCancel={() => setPullOpen(false)} onOk={handlePullIn} confirmLoading={pulling} forceRender>
        <Form form={pullForm} layout="vertical" preserve={false}>
          <Form.Item name="user_id" label={t('member.labelUserId')} rules={[{ required: true, message: t('member.errUserIdRequired') }]}>
            <Input placeholder={t('member.placeholderUserId')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑资料 */}
      <Modal title="编辑成员资料" open={editOpen} onCancel={() => setEditOpen(false)} onOk={handleEdit} confirmLoading={saving} forceRender>
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="full_name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          <Form.Item name="position" label="职位"><Input /></Form.Item>
        </Form>
      </Modal>

      {/* 批量导入 */}
      <Modal title="CSV 批量导入成员" open={importOpen} onCancel={() => setImportOpen(false)} onOk={handleImport} confirmLoading={importing} okText="导入" destroyOnHidden width={640}>
        <p className="rent-text-sm rent-text-muted">
          每行一个成员，列为：姓名,邮箱,手机,职位,初始密码（可选，默认 123456）。支持首行表头。重复邮箱只报错该行。
        </p>
        <Input.TextArea
          rows={10} value={importText} onChange={(e) => setImportText(e.target.value)}
          placeholder={'张三,zhangsan@partner.com,13800000000,经纪人,123456\n李四,lisi@partner.com,,经纪人,'}
        />
      </Modal>

      {/* 邀请加入 */}
      <Modal title="邀请加入本公司" open={inviteOpen} onCancel={() => setInviteOpen(false)} onOk={handleInvite} forceRender>
        <Form form={inviteForm} layout="vertical" preserve={false}>
          <Form.Item name="email" label="邮箱（可选）"><Input placeholder="仅用于备注，不限制 token 使用" /></Form.Item>
          <Form.Item name="position" label="职位（可选）"><Input /></Form.Item>
          <Form.Item name="expires_in_days" label="有效期（天）" initialValue={7}>
            <Input type="number" />
          </Form.Item>
        </Form>
        {invites.length > 0 && (
          <div className="rent-text-sm rent-text-muted">
            已有邀请：{invites.filter((i) => i.status === 'pending').length} 个待使用
          </div>
        )}
      </Modal>

      {/* 新建团队 */}
      <Modal title="新建团队" open={teamOpen} onCancel={() => setTeamOpen(false)} onOk={handleCreateTeam} forceRender>
        <Form form={teamForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="团队名称" rules={[{ required: true, message: '请输入团队名称' }]}>
            <Input placeholder="如：城东一组" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 设置成员团队 */}
      <Modal title="设置团队归属" open={!!teamTarget} onCancel={() => setTeamTarget(null)} onOk={handleAssignTeam} destroyOnHidden>
        <Select
          allowClear style={{ width: '100%' }} placeholder="选择团队（留空=不归属）"
          value={teamSelect} onChange={setTeamSelect}
          options={teams.map((tm: any) => ({ value: tm.id, label: tm.name }))}
        />
      </Modal>
    </div>
  )
}

export default Members