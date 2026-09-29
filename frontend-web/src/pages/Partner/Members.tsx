import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Form, Input, message, Popconfirm, Empty, Spin, Tabs, Tag } from 'antd'
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'

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
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [perf, setPerf] = useState<PerfData | null>(null)
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [createForm] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pullForm] = Form.useForm()
  const [pullOpen, setPullOpen] = useState(false)
  const [pulling, setPulling] = useState(false)

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const res = await api.get('/partner/members')
      const payload = res.data?.data ?? res.data
      setMembers(Array.isArray(payload) ? payload : payload?.items ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('member.errFetchMembers'))
    } finally {
      setMembersLoading(false)
    }
  }, [])

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
    try {
      const res = await api.get('/partner/properties')
      const payload = res.data?.data ?? res.data
      setProperties(Array.isArray(payload) ? payload : payload?.items ?? [])
    } catch {
      setProperties([])
    }
  }, [])

  useEffect(() => {
    fetchMembers()
    fetchPerf()
    fetchProperties()
  }, [fetchMembers, fetchPerf, fetchProperties])

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
      message.error(err?.response?.data?.detail || t('member.errCreate'))
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
      message.error(err?.response?.data?.detail || t('member.errPullIn'))
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
      message.error(err?.response?.data?.detail || t('member.errRemove'))
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
                        {membersLoading ? (
                          <tr>
                            <td colSpan={5} className="rent-loading-row">
                              <Spin size="small" style={{ marginRight: 8 }} />
                              {t('common.loading')}
                            </td>
                          </tr>
                        ) : members.length === 0 ? (
                          <tr>
                            <td colSpan={5}>
                              <div className="rent-empty">
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('member.emptyMembers')} />
                              </div>
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
                        {properties.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="rent-empty">
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('member.emptyProperties')} />
                              </div>
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
        ]}
      />

      {/* Create member modal */}
      <Modal title={t('member.createTitle')} open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreate} confirmLoading={saving} destroyOnClose>
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
      <Modal title={t('member.pullInTitle')} open={pullOpen} onCancel={() => setPullOpen(false)} onOk={handlePullIn} confirmLoading={pulling} destroyOnClose>
        <Form form={pullForm} layout="vertical" preserve={false}>
          <Form.Item name="user_id" label={t('member.labelUserId')} rules={[{ required: true, message: t('member.errUserIdRequired') }]}>
            <Input placeholder={t('member.placeholderUserId')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Members