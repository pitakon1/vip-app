import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Alert, Button } from 'antd'
import { commissionRulesApi, employeesApi } from '@/services/api'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import './commission-rules.css'

type DealType = 'new_rental' | 'renewal' | 'management'
type Scope = 'all_employees' | 'by_department' | 'by_employee' | 'by_broker'

interface CommissionRule {
  id: string
  name: string
  deal_type: DealType
  rate: number
  scope: Scope
  department?: string
  employee_id?: string
  employee_name?: string
  broker_id?: string
  broker_name?: string
  cap_amount?: number
  minimum_amount?: number
  description?: string
  is_active: boolean
}

interface FormState {
  name: string
  deal_type: DealType
  rate: string
  scope: Scope | 'broker_employee'
  department: string
  employee_id: string
  broker_id: string
  broker_employee_id: string
  cap_amount: string
  minimum_amount: string
  description: string
  is_active: boolean
}

// 适用对象层级：管理员可配置全部；分销商管理员仅本渠道及本渠道员工
const emptyForm = (): FormState => ({
  name: '',
  deal_type: 'new_rental',
  rate: '',
  scope: 'all_employees',
  department: '',
  employee_id: '',
  broker_id: '',
  broker_employee_id: '',
  cap_amount: '',
  minimum_amount: '',
  description: '',
  is_active: true,
})

interface Employee {
  id: string
  full_name: string
  department: string
  broker_id?: string
}

interface Broker {
  id: string
  partner_name: string
}

interface DropOpt {
  value: string
  label: string
}

// 可搜索下拉选择器（员工 / 分销商）
function SearchSelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string
  value: string
  options: DropOpt[]
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const current = options.find((o) => o.value === value)
  const filtered = kw.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(kw.trim().toLowerCase()))
    : options
  return (
    <div className="rent-search-select">
      <button type="button" className="rent-search-select__trigger" onClick={() => setOpen(!open)}>
        <span className={current ? '' : 'rent-text-muted'}>{current ? current.label : placeholder}</span>
        <span className="rent-search-select__arrow">▾</span>
      </button>
      {open && (
        <div className="rent-search-select__menu">
          <input
            autoFocus
            className="rent-search-select__search"
            placeholder={t('commissionRules.search')}
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          {filtered.length === 0 && <div className="rent-search-select__empty">{t('commissionRules.noMatch')}</div>}
          {filtered.map((o) => (
            <div
              key={o.value}
              className={`rent-search-select__option ${value === o.value ? 'is-active' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
                setKw('')
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const CommissionRules = () => {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  // 角色：平台管理员可选全部层级；分销商管理员（agent/employee 绑定渠道）仅本渠道 + 本渠道员工（后端已按角色鉴权）
  const isAdmin = user?.role === 'admin'
  const dealTypeText: Record<DealType, string> = {
    new_rental: t('commissionRules.dealType.new_rental'),
    renewal: t('commissionRules.dealType.renewal'),
    management: t('commissionRules.dealType.management'),
  }
  const scopeText: Record<Scope, string> = {
    all_employees: t('commissionRules.scope.all_employees'),
    by_department: t('commissionRules.scope.by_department'),
    by_employee: t('commissionRules.scope.by_employee'),
    by_broker: t('commissionRules.scope.by_broker'),
  }
  const scopeOptions: { value: string; label: string }[] = [
    { value: 'all_employees', label: t('commissionRules.scopeOption.all_employees') },
    { value: 'by_department', label: t('commissionRules.scopeOption.by_department') },
    { value: 'by_employee', label: t('commissionRules.scopeOption.by_employee') },
    { value: 'by_broker', label: t('commissionRules.scopeOption.by_broker') },
    { value: 'broker_employee', label: t('commissionRules.scopeOption.broker_employee') },
  ]
  const brokerScopeOptions: { value: string; label: string }[] = [
    { value: 'by_broker', label: t('commissionRules.brokerScopeOption.by_broker') },
    { value: 'by_employee', label: t('commissionRules.brokerScopeOption.by_employee') },
  ]
  const [items, setItems] = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [page, setPage] = useState(1)
  // 前端本地分页（规则量小，保持现有接口不变）
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const pagedItems = items.slice((page - 1) * pageSize, page * pageSize)

  // 删除/禁用后当前页可能超出范围，自动回退到可用的最后一页
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await commissionRulesApi.list()
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? payload ?? [])
      setLoadFailed(false)
    } catch (err: any) {
      setLoadFailed(true)
      message.error(err?.response?.data?.message || t('commissionRules.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await employeesApi.list({ page: 1, page_size: 100 })
      const payload = res.data?.data ?? res.data
      setEmployees(payload?.items ?? payload ?? [])
    } catch {
      /* 员工列表非关键，失败静默 */
    }
  }, [])

  const fetchBrokers = useCallback(async () => {
    try {
      const res = await api.get('/brokers', { params: { page_size: 100 } })
      const payload = res.data?.data ?? res.data
      setBrokers((payload?.items ?? []).map((b: Broker) => ({ id: b.id, partner_name: b.partner_name })))
    } catch {
      setBrokers([])
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchEmployees()
    fetchBrokers()
  }, [fetchData, fetchEmployees, fetchBrokers])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (rule: CommissionRule) => {
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      deal_type: rule.deal_type,
      rate: String(rule.rate ?? ''),
      scope: rule.scope,
      department: rule.department || '',
      employee_id: rule.employee_id || '',
      broker_id: rule.broker_id || '',
      broker_employee_id: rule.employee_id || '',
      cap_amount: rule.cap_amount != null ? String(rule.cap_amount) : '',
      minimum_amount: rule.minimum_amount != null ? String(rule.minimum_amount) : '',
      description: rule.description || '',
      is_active: rule.is_active,
    })
    setModalOpen(true)
  }

  const rateAsPercent = (rate: number) => `${Number(rate ?? 0)}%`

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      message.error(t('commissionRules.errName'))
      return
    }
    if (!form.rate || Number(form.rate) < 0) {
      message.error(t('commissionRules.errRate'))
      return
    }
    if (form.scope === 'by_department' && !form.department.trim()) {
      message.error(t('commissionRules.errDept'))
      return
    }
    if ((form.scope === 'by_employee' || form.scope === 'broker_employee') && form.scope === 'by_employee' && !form.employee_id) {
      message.error(t('commissionRules.errEmployee'))
      return
    }
    if (form.scope === 'broker_employee') {
      if (!form.broker_id) {
        message.error(t('commissionRules.errBrokerRequired'))
        return
      }
      if (!form.broker_employee_id) {
        message.error(t('commissionRules.errBrokerEmployee'))
        return
      }
    }
    try {
      setSubmitting(true)
      const payload: any = {
        name: form.name,
        deal_type: form.deal_type,
        rate: Number(form.rate),
        scope: form.scope === 'broker_employee' ? 'by_employee' : form.scope,
        description: form.description || undefined,
        is_active: form.is_active,
      }
      if (form.scope === 'by_department') payload.department = form.department
      if (form.scope === 'by_employee' || form.scope === 'broker_employee') {
        payload.employee_id = form.scope === 'broker_employee' ? form.broker_employee_id : form.employee_id
      }
      if (form.scope === 'broker_employee') payload.broker_id = form.broker_id
      if (form.scope === 'by_broker' && isAdmin && !form.broker_id) {
        message.error(t('commissionRules.errBrokerRequired'))
        return
      }
      if (form.scope === 'by_broker' && isAdmin) payload.broker_id = form.broker_id
      if (form.cap_amount !== '') payload.cap_amount = Number(form.cap_amount)
      if (form.minimum_amount !== '') payload.minimum_amount = Number(form.minimum_amount)

      if (editingId) {
        await commissionRulesApi.update(editingId, payload)
        message.success(t('commissionRules.updated'))
      } else {
        await commissionRulesApi.create(payload)
        message.success(t('commissionRules.created'))
      }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('commissionRules.saveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (rule: CommissionRule) => {
    try {
      await commissionRulesApi.update(rule.id, { is_active: !rule.is_active })
      message.success(rule.is_active ? t('commissionRules.ruleDisabled') : t('commissionRules.ruleEnabled'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('commissionRules.opFailed'))
    }
  }

  const handleDelete = async (rule: CommissionRule) => {
    if (!window.confirm(t('commissionRules.deleteConfirm', { name: rule.name }))) return
    try {
      await commissionRulesApi.delete(rule.id)
      message.success(t('commissionRules.deleted'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('commissionRules.deleteFailed'))
    }
  }

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm((p) => ({ ...p, [field]: value }))

  // 分销商员工：二级选择时的候选员工（按所选分销商过滤）
  const brokerEmployeeOptions = form.scope === 'broker_employee' && form.broker_id
    ? employees.filter((e) => e.broker_id === form.broker_id)
    : employees

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('commissionRules.title')}</h2>
          <p className="rent-page-header__subtitle">{t('commissionRules.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--primary" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('commissionRules.addRule')}
          </button>
        </div>
      </div>

      {loadFailed && !loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('commissionRules.fetchFailed')}
          action={<Button size="small" onClick={() => fetchData()}>{t('common.retry')}</Button>}
        />
      )}

      {loading ? (
        <div className="rent-empty"><div className="rent-text-muted">{t('common.loading')}</div></div>
      ) : (
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('commissionRules.listTitle')}</h3>
            <span className="rent-badge rent-badge--neutral">{t('commissionRules.countItem', { count: items.length })}</span>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            {items.length === 0 ? (
              <div className="rent-empty rent-text-muted">{t('commissionRules.empty')}</div>
            ) : (
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>{t('commissionRules.colName')}</th>
                      <th>{t('commissionRules.colDealType')}</th>
                      <th>{t('commissionRules.colRate')}</th>
                      <th>{t('commissionRules.colScope')}</th>
                      <th>{t('commissionRules.colLimits')}</th>
                      <th>{t('commissionRules.colStatus')}</th>
                      <th>{t('commissionRules.colAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedItems.map((r) => {
                      const scopeDetail =
                        r.scope === 'by_department'
                          ? r.department || '—'
                          : r.scope === 'by_employee'
                            ? r.employee_name || r.employee_id || '—'
                            : r.scope === 'by_broker'
                              ? brokers.find((b) => b.id === r.broker_id)?.partner_name || r.broker_id || '—'
                              : t('commissionRules.allScope')
                      const limits =
                        r.minimum_amount != null || r.cap_amount != null
                          ? `฿${Number(r.minimum_amount ?? 0)} ~ ${r.cap_amount != null ? `฿${Number(r.cap_amount)}` : t('commissionRules.noCap')}`
                          : t('commissionRules.noLimit')
                      return (
                        <tr key={r.id}>
                          <td>
                            <div>{r.name}</div>
                            {r.description && (
                              <div className="rent-text-sm rent-text-muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.description}
                              </div>
                            )}
                          </td>
                          <td>{dealTypeText[r.deal_type] || r.deal_type}</td>
                          <td className="cr-rate">{rateAsPercent(r.rate)}</td>
                          <td>
                            <div>{scopeText[r.scope] || r.scope}</div>
                            <div className="rent-text-sm rent-text-muted">{scopeDetail}</div>
                          </td>
                          <td><span className="rent-table__mono">{limits}</span></td>
                          <td>
                            <span className={`rent-badge ${r.is_active ? 'rent-badge--success' : 'rent-badge--neutral'}`}>
                              {r.is_active ? t('commissionRules.active') : t('commissionRules.inactive')}
                            </span>
                          </td>
                          <td>
                            <div className="rent-flex rent-gap-2">
                              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openEdit(r)}>{t('common.edit')}</button>
                              <button
                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                onClick={() => toggleActive(r)}
                              >
                                {r.is_active ? t('commissionRules.inactive') : t('commissionRules.active')}
                              </button>
                              <button
                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                                onClick={() => handleDelete(r)}
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {items.length > 0 && (
              <div className="rent-pagination" style={{ marginTop: 14, padding: '0 22px 16px' }}>
                <span className="rent-pagination__info">共 {items.length} 条 · 每页 {pageSize} 条</span>
                <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>上一页</button>
                <span className="rent-pagination__info">{page} / {pageCount}</span>
                <button className="rent-pagination__btn" onClick={() => setPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>下一页</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="rent-form-hint" style={{ marginTop: 12 }}>
        {t('commissionRules.rulesHint')}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="rent-modal-backdrop" onClick={() => !submitting && setModalOpen(false)}>
          <div className="rent-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">{editingId ? t('commissionRules.editTitle') : t('commissionRules.createTitle')}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label="关闭" onClick={() => setModalOpen(false)} disabled={submitting}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-group">
                <label className="rent-form-label">{t('commissionRules.labelRuleName')}</label>
                <input
                  className="rent-form-input"
                  type="text"
                  placeholder={t('commissionRules.placeholderRuleName')}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('commissionRules.labelDealType')}</label>
                  <select
                    className="rent-form-select"
                    value={form.deal_type}
                    onChange={(e) => set('deal_type', e.target.value)}
                  >
                    {Object.entries(dealTypeText).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('commissionRules.labelRate')}</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder={t('commissionRules.placeholderRate')}
                    value={form.rate}
                    onChange={(e) => set('rate', e.target.value)}
                  />
                </div>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('commissionRules.labelScope')}</label>
                <select
                  className="rent-form-select"
                  value={form.scope}
                  onChange={(e) => {
                    set('scope', e.target.value)
                    setForm((p) => ({ ...p, broker_employee_id: '' }))
                  }}
                >
                  {(isAdmin ? scopeOptions : brokerScopeOptions).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {!isAdmin && (
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                    {t('commissionRules.brokerRestrict')}
                  </div>
                )}
              </div>
              {form.scope === 'by_department' && isAdmin && (
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('commissionRules.labelDepartment')}</label>
                  <input
                    className="rent-form-input"
                    type="text"
                    placeholder={t('commissionRules.placeholderDepartment')}
                    value={form.department}
                    onChange={(e) => set('department', e.target.value)}
                  />
                </div>
              )}
              {form.scope === 'by_employee' && (
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('commissionRules.labelEmployee')}</label>
                  <SearchSelect
                    placeholder={isAdmin ? t('commissionRules.placeholderEmployeeAdmin') : t('commissionRules.placeholderEmployeeBroker')}
                    value={form.employee_id}
                    options={employees.map((emp) => ({
                      value: emp.id,
                      label: emp.full_name + (emp.department ? ` · ${emp.department}` : ''),
                    }))}
                    onChange={(v) => set('employee_id', v)}
                  />
                  {!isAdmin && (
                    <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                      {t('commissionRules.empRestrict')}
                    </div>
                  )}
                </div>
              )}
              {form.scope === 'by_broker' && isAdmin && (
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('commissionRules.labelBroker')}</label>
                  <SearchSelect
                    placeholder={t('commissionRules.placeholderBroker')}
                    value={form.broker_id}
                    options={brokers.map((b) => ({ value: b.id, label: b.partner_name }))}
                    onChange={(v) => set('broker_id', v)}
                  />
                </div>
              )}
              {form.scope === 'broker_employee' && isAdmin && (
                <>
                  <div className="rent-form-group">
                    <label className="rent-form-label">{t('commissionRules.labelBroker')}</label>
                    <SearchSelect
                      placeholder={t('commissionRules.placeholderBroker')}
                      value={form.broker_id}
                      options={brokers.map((b) => ({ value: b.id, label: b.partner_name }))}
                      onChange={(v) => {
                        set('broker_id', v)
                        setForm((p) => ({ ...p, broker_employee_id: '' }))
                      }}
                    />
                  </div>
                  <div className="rent-form-group">
                    <label className="rent-form-label">{t('commissionRules.labelBrokerEmployee')}</label>
                    <SearchSelect
                      placeholder={t('commissionRules.placeholderBrokerEmployee')}
                      value={form.broker_employee_id}
                      options={brokerEmployeeOptions.map((emp) => ({
                        value: emp.id,
                        label: emp.full_name + (emp.department ? ` · ${emp.department}` : ''),
                      }))}
                      onChange={(v) => set('broker_employee_id', v)}
                    />
                  </div>
                </>
              )}
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('commissionRules.labelMinAmount')}</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min="0"
                    placeholder={t('commissionRules.placeholderOptional')}
                    value={form.minimum_amount}
                    onChange={(e) => set('minimum_amount', e.target.value)}
                  />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('commissionRules.labelCapAmount')}</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min="0"
                    placeholder={t('commissionRules.placeholderOptional')}
                    value={form.cap_amount}
                    onChange={(e) => set('cap_amount', e.target.value)}
                  />
                </div>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('common.detail')}</label>
                <textarea
                  className="rent-form-textarea"
                  rows={2}
                  placeholder={t('commissionRules.placeholderDescription')}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
              <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                <label className="rent-switch">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => set('is_active', e.target.checked)}
                  />
                  <span className="rent-switch__track" />
                  <span className="rent-switch__thumb" />
                </label>
                <span className="rent-text-sm">{t('commissionRules.enableRule')}</span>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setModalOpen(false)} disabled={submitting}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? t('commissionRules.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CommissionRules