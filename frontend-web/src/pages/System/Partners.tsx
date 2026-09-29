import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Form, Input, Select, message, Popconfirm, Empty, Spin } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import api from '@/lib/api'

interface Partner {
  id: string
  name: string
  contact_name?: string
  contact_phone?: string
  license_no?: string
  admin_user_id?: string
  admin_name?: string
  status?: string
  is_active: boolean
  member_count: number
  created_at?: string
}

interface AgentOption {
  id: string
  full_name: string
  email: string
}

const fmtTime = (v?: string) => (v ? String(v).replace('T', ' ').slice(0, 16) : '—')

const Partners = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<Partner[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<{ page: number; page_size: number; keyword?: string }>({ page: 1, page_size: 20 })
  const [keywordDraft, setKeywordDraft] = useState('')
  const [form] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partner | null>(null)
  const [saving, setSaving] = useState(false)
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [agentLoading, setAgentLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/partners', {
        params: { page: query.page, page_size: query.page_size, keyword: query.keyword },
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('partners.errFetch'))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 未归属经纪人为候选管理员（role=agent & user_type=platform）
  const loadAgents = async () => {
    setAgentLoading(true)
    try {
      const res = await api.get('/admin/users', { params: { role: 'agent', user_type: 'platform', page_size: 100 } })
      const payload = res.data?.data ?? res.data
      setAgentOptions((payload?.items ?? []).map((u: any) => ({ id: u.id, full_name: u.full_name, email: u.email })))
    } catch {
      setAgentOptions([])
    } finally {
      setAgentLoading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    loadAgents()
    setModalOpen(true)
  }

  const openEdit = (row: Partner) => {
    setEditing(row)
    form.setFieldsValue({
      name: row.name,
      contact_name: row.contact_name,
      contact_phone: row.contact_phone,
      license_no: row.license_no,
      admin_user_id: row.admin_user_id,
    })
    loadAgents()
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await api.patch(`/admin/partners/${editing.id}`, values)
        message.success(t('partners.msgUpdated'))
      } else {
        await api.post('/admin/partners', values)
        message.success(t('partners.msgCreated'))
      }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      if (err?.errorFields) {
        form.scrollToField(err.errorFields[0].name)
        return
      }
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('partners.errSave'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: Partner, active: boolean) => {
    try {
      await api.post(`/admin/partners/${row.id}/${active ? 'activate' : 'deactivate'}`)
      message.success(active ? t('partners.msgActivated') : t('partners.msgDeactivated'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('partners.errOperation'))
    }
  }

  const applyKeyword = (value: string) => {
    setKeywordDraft(value)
    setQuery((q) => ({ ...q, page: 1, keyword: value || undefined }))
  }

  const totalPages = Math.max(1, Math.ceil(total / query.page_size))

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('partners.title')}</h2>
          <p className="rent-page-header__subtitle">{t('partners.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t('partners.btnCreate')}
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rent-filter-bar">
        <div className="rent-filter-bar__search">
          <div className="rent-search" style={{ width: '100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t('partners.searchPlaceholder')}
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyKeyword((e.target as HTMLInputElement).value)
              }}
            />
          </div>
        </div>
        <button className="rent-btn rent-btn--secondary rent-btn--sm" type="button" onClick={fetchData}>
          {t('partners.btnRefresh')}
        </button>
      </div>

      {/* Partner Table */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('partners.listTitle')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('partners.thName')}</th>
                  <th>{t('partners.thContact')}</th>
                  <th>{t('partners.thPhone')}</th>
                  <th>{t('partners.thAdmin')}</th>
                  <th>{t('partners.thMembers')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="rent-loading-row">
                      <Spin size="small" style={{ marginRight: 8 }} />
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="rent-empty">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('partners.empty')} />
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.name || '—'}</div>
                        {row.license_no && <div className="rent-text-sm rent-text-muted">{t('partners.licenseLabel', { no: row.license_no })}</div>}
                      </td>
                      <td>{row.contact_name || '—'}</td>
                      <td className="rent-table__mono">{row.contact_phone || '—'}</td>
                      <td>{row.admin_name || '—'}</td>
                      <td>{row.member_count ?? 0}</td>
                      <td>
                        <span className={`rent-badge ${row.is_active ? 'rent-badge--success' : 'rent-badge--error'}`}>
                          {row.is_active ? t('partners.stEnabled') : t('partners.stDisabled')}
                        </span>
                      </td>
                      <td>
                        <div className="rent-flex rent-gap-2" style={{ flexWrap: 'wrap' }}>
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => openEdit(row)}>
                            {t('common.edit')}
                          </button>
                          <Popconfirm
                            title={row.is_active ? t('partners.confirmDeactivate') : t('partners.confirmActivate')}
                            onConfirm={() => toggleActive(row, !row.is_active)}
                          >
                            <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button">
                              {row.is_active ? t('partners.stDisabled') : t('partners.stEnabled')}
                            </button>
                          </Popconfirm>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="rent-pagination" style={{ padding: '12px 20px' }}>
            <span className="rent-pagination__info">{t('partners.pageInfo', { total, size: query.page_size })}</span>
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label={t('partners.ariaPrev')}
              disabled={query.page <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: Math.max(1, q.page - 1) }))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="rent-pagination__info">
              {query.page} / {totalPages}
            </span>
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label={t('partners.ariaNext')}
              disabled={query.page >= totalPages}
              onClick={() => setQuery((q) => ({ ...q, page: Math.min(totalPages, q.page + 1) }))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>

      <Modal
        title={editing ? t('partners.editTitle') : t('partners.createTitle')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label={t('partners.labelName')} rules={[{ required: true, message: t('partners.errNameRequired') }]}>
            <Input placeholder={t('partners.placeholderName')} />
          </Form.Item>
          <Form.Item name="contact_name" label={t('partners.labelContact')}>
            <Input placeholder={t('partners.placeholderContact')} />
          </Form.Item>
          <Form.Item name="contact_phone" label={t('partners.labelPhone')}>
            <Input placeholder={t('partners.placeholderPhone')} />
          </Form.Item>
          <Form.Item name="license_no" label={t('partners.labelLicense')}>
            <Input placeholder={t('partners.placeholderLicense')} />
          </Form.Item>
          <Form.Item name="admin_user_id" label={t('partners.labelAdmin')}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={agentLoading}
              placeholder={t('partners.placeholderAdmin')}
              allowClear
              options={agentOptions.map((a) => ({ value: a.id, label: `${a.full_name}（${a.email}）` }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Partners