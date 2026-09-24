import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Form, Input, Select, message, Popconfirm, Empty, Spin } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import api from '@/lib/api'

interface Account {
  id: string
  email: string
  phone?: string
  full_name: string
  role: string
  is_active: boolean
  is_verified: boolean
  last_login_at?: string
  created_at?: string
  groups: string[]
  employee?: { employee_code?: string; department?: string; position?: string }
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'rent-badge--primary',
  agent: 'rent-badge--info',
  employee: 'rent-badge--neutral',
  owner: 'rent-badge--warning',
  tenant: 'rent-badge--success',
}
const ROLE_LABEL: Record<string, string> = {
  admin: 'systemUsers.roleAdmin',
  agent: 'systemUsers.roleAgent',
  employee: 'systemUsers.roleEmployee',
  owner: 'systemUsers.roleOwner',
  tenant: 'systemUsers.roleTenant',
}

const fmtTime = (v?: string) => (v ? String(v).replace('T', ' ').slice(0, 16) : '—')

const Users = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<Account[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<{ page: number; page_size: number; role?: string; keyword?: string }>({
    page: 1,
    page_size: 20,
  })
  const [keywordDraft, setKeywordDraft] = useState('')
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
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('systemUsers.errFetch'))
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
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await api.patch(`/admin/users/${editing.id}`, values)
        message.success(t('systemUsers.msgUpdated'))
      } else {
        await api.post('/admin/users', values)
        message.success(t('systemUsers.msgCreated'))
      }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      if (err?.errorFields) {
        form.scrollToField(err.errorFields[0].name)
        return
      }
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('systemUsers.errSave'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: Account, active: boolean) => {
    try {
      await api.post(`/admin/users/${row.id}/${active ? 'activate' : 'deactivate'}`)
      message.success(active ? t('systemUsers.msgActivated') : t('systemUsers.msgDeactivated'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemUsers.errOperation'))
    }
  }

  const handleDelete = async (row: Account) => {
    try {
      await api.delete(`/admin/users/${row.id}`)
      message.success(t('systemUsers.msgDeleted'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemUsers.errDelete'))
    }
  }

  const handleResetPwd = async () => {
    const { new_password } = await pwdForm.validateFields()
    try {
      await api.post(`/admin/users/${pwdTarget!.id}/reset-password`, { new_password })
      message.success(t('systemUsers.msgPwdReset'))
      setPwdTarget(null)
      pwdForm.resetFields()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemUsers.errPwdReset'))
    }
  }

  const applyKeyword = (value: string) => {
    setKeywordDraft(value)
    setQuery((q) => ({ ...q, page: 1, keyword: value || undefined }))
  }

  // 统计卡：数值全部来自接口返回的账号数据（未加载全量时标注当前页口径）
  const loadedAll = data.length >= total
  const scopeNote = loadedAll ? t('systemUsers.scopeAll') : t('systemUsers.scopePage', { count: data.length })
  const stats = [
    {
      label: t('systemUsers.statTotal'),
      value: total,
      note: t('systemUsers.statAllAccounts'),
      icon: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
      style: { background: 'rgba(20,184,166,0.1)', color: 'var(--rent-primary)' },
    },
    {
      label: t('systemUsers.statActive'),
      value: data.filter((u) => u.is_active).length,
      note: scopeNote,
      icon: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
      style: { background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' },
    },
    {
      label: t('systemUsers.roleAdmin'),
      value: data.filter((u) => u.role === 'admin').length,
      note: scopeNote,
      icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
      style: { background: 'rgba(217,119,6,0.12)', color: 'var(--state-warning)' },
    },
    {
      label: t('systemUsers.statPending'),
      value: data.filter((u) => !u.is_verified).length,
      note: scopeNote,
      icon: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 8v4', 'M12 16h.01'],
      style: { background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' },
    },
  ]

  const totalPages = Math.max(1, Math.ceil(total / query.page_size))

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('systemUsers.title')}</h2>
          <p className="rent-page-header__subtitle">{t('systemUsers.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t('systemUsers.btnCreate')}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {stats.map((s) => (
          <div className="rent-stat-card" key={s.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{s.label}</div>
                <div className="rent-stat-card__value rent-num">{s.value}</div>
                <div className="rent-stat-card__delta rent-text-muted">{s.note}</div>
              </div>
              <div className="rent-stat-card__icon" style={s.style}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {s.icon.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </div>
            </div>
          </div>
        ))}
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
              placeholder={t('systemUsers.searchPlaceholder')}
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyKeyword((e.target as HTMLInputElement).value)
              }}
            />
          </div>
        </div>
        <select
          className="rent-filter-select rent-form-select"
          style={{ width: 'auto' }}
          aria-label={t('systemUsers.ariaRole')}
          value={query.role || ''}
          onChange={(e) => setQuery((q) => ({ ...q, page: 1, role: e.target.value || undefined }))}
        >
          <option value="">{t('systemUsers.optAllRoles')}</option>
          {Object.entries(ROLE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {t(l)}
            </option>
          ))}
        </select>
        <button className="rent-btn rent-btn--secondary rent-btn--sm" type="button" onClick={fetchData}>
          {t('systemUsers.btnRefresh')}
        </button>
      </div>

      {/* Account Table */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('systemUsers.listTitle')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('systemUsers.thName')}</th>
                  <th>{t('systemUsers.thAccount')}</th>
                  <th>{t('systemUsers.thRole')}</th>
                  <th>{t('systemUsers.thGroups')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('systemUsers.thLastLogin')}</th>
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
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('systemUsers.empty')} />
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.full_name || '—'}</div>
                        {row.employee && (
                          <div className="rent-text-sm rent-text-muted">
                            {row.employee.employee_code || '—'} · {row.employee.department || '—'} · {row.employee.position || '—'}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="rent-text-sm">{row.email}</div>
                        {row.phone && <div className="rent-text-sm rent-text-muted">{row.phone}</div>}
                      </td>
                      <td>
                        <span className={`rent-badge ${ROLE_BADGE[row.role] || 'rent-badge--neutral'}`}>
                          {ROLE_LABEL[row.role] ? t(ROLE_LABEL[row.role]) : row.role}
                        </span>
                      </td>
                      <td>
                        {(row.groups ?? []).length > 0 ? (
                          <span className="rent-flex rent-gap-2" style={{ flexWrap: 'wrap' }}>
                            {(row.groups ?? []).map((g) => (
                              <span className="rent-badge rent-badge--neutral" key={g}>
                                {g}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="rent-text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`rent-badge ${row.is_active ? 'rent-badge--success' : 'rent-badge--error'}`}>
                          {row.is_active ? t('systemUsers.stEnabled') : t('systemUsers.stDisabled')}
                        </span>
                      </td>
                      <td className="rent-table__mono">{fmtTime(row.last_login_at)}</td>
                      <td>
                        <div className="rent-flex rent-gap-2" style={{ flexWrap: 'wrap' }}>
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => openEdit(row)}>
                            {t('common.edit')}
                          </button>
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => setPwdTarget(row)}>
                            {t('systemUsers.btnResetPwd')}
                          </button>
                          <Popconfirm
                            title={row.is_active ? t('systemUsers.confirmDeactivate') : t('systemUsers.confirmActivate')}
                            onConfirm={() => toggleActive(row, !row.is_active)}
                          >
                            <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button">
                              {row.is_active ? t('systemUsers.stDisabled') : t('systemUsers.stEnabled')}
                            </button>
                          </Popconfirm>
                          <Popconfirm
                            title={t('systemUsers.confirmDelete')}
                            okText={t('common.delete')}
                            okButtonProps={{ danger: true }}
                            onConfirm={() => handleDelete(row)}
                          >
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              type="button"
                              style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                            >
                              {t('common.delete')}
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
            <span className="rent-pagination__info">
              {t('systemUsers.pageInfo', { total, size: query.page_size })}
            </span>
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label={t('systemUsers.ariaPrev')}
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
              aria-label={t('systemUsers.ariaNext')}
              disabled={query.page >= totalPages}
              onClick={() => setQuery((q) => ({ ...q, page: Math.min(totalPages, q.page + 1) }))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>

      <Modal
        title={editing ? t('systemUsers.editTitle') : t('systemUsers.createTitle')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="full_name" label={t('systemUsers.labelName')} rules={[{ required: true, message: t('systemUsers.errNameRequired') }]}>
            <Input placeholder={t('systemUsers.placeholderName')} />
          </Form.Item>
          <Form.Item name="email" label={t('systemUsers.labelEmail')} rules={[{ required: true, type: 'email', message: t('systemUsers.errInvalidEmail') }]}>
            <Input disabled={!!editing} placeholder="user@viprental.com" />
          </Form.Item>
          {!editing && (
            <Form.Item name="password" label={t('systemUsers.labelPassword')} rules={[{ required: true, min: 6, message: t('systemUsers.errPwdMin') }]}>
              <Input.Password placeholder={t('systemUsers.placeholderDefaultPwd')} />
            </Form.Item>
          )}
          <Form.Item name="role" label={t('systemUsers.labelRole')} rules={[{ required: true }]}>
            <Select options={Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: t(l) }))} />
          </Form.Item>
          <Form.Item name="department" label={t('systemUsers.labelDept')}>
            <Input placeholder={t('systemUsers.placeholderDept')} />
          </Form.Item>
          <Form.Item name="position" label={t('systemUsers.labelPosition')}>
            <Input placeholder={t('systemUsers.placeholderPosition')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('systemUsers.resetPwdTitle', { name: pwdTarget?.full_name || '' })}
        open={!!pwdTarget}
        onCancel={() => setPwdTarget(null)}
        onOk={handleResetPwd}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="new_password" label={t('systemUsers.labelNewPassword')} rules={[{ required: true, min: 6, message: t('systemUsers.errPwdMin') }]}>
            <Input.Password placeholder={t('systemUsers.placeholderNewPassword')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Users