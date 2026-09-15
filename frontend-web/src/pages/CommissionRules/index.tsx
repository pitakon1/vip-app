import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
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

const DEAL_TYPE_TEXT: Record<DealType, string> = {
  new_rental: '新签约',
  renewal: '续约',
  management: '代运营',
}

const SCOPE_TEXT: Record<Scope, string> = {
  all_employees: '全体员工',
  by_department: '按部门',
  by_employee: '按员工',
  by_broker: '按分销商（差异化定价）',
}

// 适用对象层级：管理员可配置全部；分销商管理员仅本渠道及本渠道员工
const SCOPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all_employees', label: '全体员工' },
  { value: 'by_department', label: '部门' },
  { value: 'by_employee', label: '员工' },
  { value: 'by_broker', label: '分销商' },
  { value: 'broker_employee', label: '分销商员工' },
]
const BROKER_SCOPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'by_broker', label: '本渠道（差异化定价）' },
  { value: 'by_employee', label: '本渠道员工' },
]

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
            placeholder="搜索..."
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          {filtered.length === 0 && <div className="rent-search-select__empty">无匹配选项</div>}
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
  // 角色：平台管理员可选全部层级；分销商管理员（agent/employee 绑定渠道）仅本渠道 + 本渠道员工（后端已按角色鉴权）
  const isAdmin = user?.role === 'admin'
  const [items, setItems] = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [brokers, setBrokers] = useState<{ id: string; partner_name: string }[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await commissionRulesApi.list()
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? payload ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取佣金设置失败')
    } finally {
      setLoading(false)
    }
  }, [])

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
      setBrokers((payload?.items ?? []).map((b: any) => ({ id: b.id, partner_name: b.partner_name })))
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
      message.error('请输入规则名称')
      return
    }
    if (!form.rate || Number(form.rate) < 0) {
      message.error('请输入有效佣金比例')
      return
    }
    if (form.scope === 'by_department' && !form.department.trim()) {
      message.error('请输入部门名称')
      return
    }
    if ((form.scope === 'by_employee' || form.scope === 'broker_employee') && form.scope === 'by_employee' && !form.employee_id) {
      message.error('请选择员工')
      return
    }
    if (form.scope === 'broker_employee') {
      if (!form.broker_id) {
        message.error('请先选择分销商')
        return
      }
      if (!form.broker_employee_id) {
        message.error('请选择该分销商的员工')
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
        message.error('请选择分销商')
        return
      }
      if (form.scope === 'by_broker' && isAdmin) payload.broker_id = form.broker_id
      if (form.cap_amount !== '') payload.cap_amount = Number(form.cap_amount)
      if (form.minimum_amount !== '') payload.minimum_amount = Number(form.minimum_amount)

      if (editingId) {
        await commissionRulesApi.update(editingId, payload)
        message.success('佣金设置已更新')
      } else {
        await commissionRulesApi.create(payload)
        message.success('佣金设置已创建')
      }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (rule: CommissionRule) => {
    try {
      await commissionRulesApi.update(rule.id, { is_active: !rule.is_active })
      message.success(rule.is_active ? '规则已停用' : '规则已启用')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '操作失败')
    }
  }

  const handleDelete = async (rule: CommissionRule) => {
    if (!window.confirm(`确定删除佣金设置「${rule.name}」吗？`)) return
    try {
      await commissionRulesApi.delete(rule.id)
      message.success('佣金设置已删除')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败')
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
          <h2 className="rent-page-header__title">佣金设置</h2>
          <p className="rent-page-header__subtitle">按交易类型与适用对象配置员工佣金比例（支持分销商差异化定价）</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--primary" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新增规则
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rent-empty"><div className="rent-text-muted">加载中...</div></div>
      ) : (
        <div className="rent-card">
          <div className="rent-card__body" style={{ padding: 0 }}>
            {items.length === 0 ? (
              <div className="rent-empty rent-text-muted">暂无佣金设置，点击右上角「新增设置」开始配置</div>
            ) : (
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>规则名称</th>
                      <th>交易类型</th>
                      <th>比例</th>
                      <th>适用对象</th>
                      <th>金额上下限</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const scopeDetail =
                        r.scope === 'by_department'
                          ? r.department || '—'
                          : r.scope === 'by_employee'
                            ? r.employee_name || r.employee_id || '—'
                            : r.scope === 'by_broker'
                              ? brokers.find((b) => b.id === r.broker_id)?.partner_name || r.broker_id || '—'
                              : '全体'
                      const limits =
                        r.minimum_amount != null || r.cap_amount != null
                          ? `¥${Number(r.minimum_amount ?? 0)} ~ ${r.cap_amount != null ? `¥${Number(r.cap_amount)}` : '无上限'}`
                          : '无'
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
                          <td>{DEAL_TYPE_TEXT[r.deal_type] || r.deal_type}</td>
                          <td className="cr-rate">{rateAsPercent(r.rate)}</td>
                          <td>
                            <div>{SCOPE_TEXT[r.scope] || r.scope}</div>
                            <div className="rent-text-sm rent-text-muted">{scopeDetail}</div>
                          </td>
                          <td><span className="rent-table__mono">{limits}</span></td>
                          <td>
                            <span className={`rent-badge ${r.is_active ? 'rent-badge--success' : 'rent-badge--neutral'}`}>
                              {r.is_active ? '启用' : '停用'}
                            </span>
                          </td>
                          <td>
                            <div className="rent-flex rent-gap-2">
                              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openEdit(r)}>编辑</button>
                              <button
                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                onClick={() => toggleActive(r)}
                              >
                                {r.is_active ? '停用' : '启用'}
                              </button>
                              <button
                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                                onClick={() => handleDelete(r)}
                              >
                                删除
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
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="rent-modal-backdrop" onClick={() => !submitting && setModalOpen(false)}>
          <div className="rent-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">{editingId ? '编辑佣金设置' : '新增佣金设置'}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setModalOpen(false)} disabled={submitting}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-group">
                <label className="rent-form-label">规则名称 *</label>
                <input
                  className="rent-form-input"
                  type="text"
                  placeholder="例如：新签约佣金"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">交易类型 *</label>
                  <select
                    className="rent-form-select"
                    value={form.deal_type}
                    onChange={(e) => set('deal_type', e.target.value)}
                  >
                    {Object.entries(DEAL_TYPE_TEXT).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">佣金比例 (%) *</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="例如 5"
                    value={form.rate}
                    onChange={(e) => set('rate', e.target.value)}
                  />
                </div>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">适用对象 *</label>
                <select
                  className="rent-form-select"
                  value={form.scope}
                  onChange={(e) => {
                    set('scope', e.target.value)
                    setForm((p) => ({ ...p, broker_employee_id: '' }))
                  }}
                >
                  {(isAdmin ? SCOPE_OPTIONS : BROKER_SCOPE_OPTIONS).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {!isAdmin && (
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                    分销商管理员仅可为本渠道及本渠道员工配置差异化费率
                  </div>
                )}
              </div>
              {form.scope === 'by_department' && isAdmin && (
                <div className="rent-form-group">
                  <label className="rent-form-label">部门 *</label>
                  <input
                    className="rent-form-input"
                    type="text"
                    placeholder="例如：租赁部"
                    value={form.department}
                    onChange={(e) => set('department', e.target.value)}
                  />
                </div>
              )}
              {form.scope === 'by_employee' && (
                <div className="rent-form-group">
                  <label className="rent-form-label">员工 *</label>
                  <SearchSelect
                    placeholder={isAdmin ? '请选择员工（可搜索）' : '请选择本渠道员工（可搜索）'}
                    value={form.employee_id}
                    options={employees.map((emp) => ({
                      value: emp.id,
                      label: emp.full_name + (emp.department ? ` · ${emp.department}` : ''),
                    }))}
                    onChange={(v) => set('employee_id', v)}
                  />
                  {!isAdmin && (
                    <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                      仅可选择本渠道下属员工（跨渠道员工将被拒绝）
                    </div>
                  )}
                </div>
              )}
              {form.scope === 'by_broker' && isAdmin && (
                <div className="rent-form-group">
                  <label className="rent-form-label">分销商 *</label>
                  <SearchSelect
                    placeholder="请选择分销商（可搜索）"
                    value={form.broker_id}
                    options={brokers.map((b) => ({ value: b.id, label: b.partner_name }))}
                    onChange={(v) => set('broker_id', v)}
                  />
                </div>
              )}
              {form.scope === 'broker_employee' && isAdmin && (
                <>
                  <div className="rent-form-group">
                    <label className="rent-form-label">分销商 *</label>
                    <SearchSelect
                      placeholder="请选择分销商（可搜索）"
                      value={form.broker_id}
                      options={brokers.map((b) => ({ value: b.id, label: b.partner_name }))}
                      onChange={(v) => {
                        set('broker_id', v)
                        setForm((p) => ({ ...p, broker_employee_id: '' }))
                      }}
                    />
                  </div>
                  <div className="rent-form-group">
                    <label className="rent-form-label">该分销商员工 *</label>
                    <SearchSelect
                      placeholder="请选择该分销商员工（可搜索）"
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
                  <label className="rent-form-label">最低佣金 (¥)</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min="0"
                    placeholder="可选"
                    value={form.minimum_amount}
                    onChange={(e) => set('minimum_amount', e.target.value)}
                  />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">佣金上限 (¥)</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min="0"
                    placeholder="可选"
                    value={form.cap_amount}
                    onChange={(e) => set('cap_amount', e.target.value)}
                  />
                </div>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">描述</label>
                <textarea
                  className="rent-form-textarea"
                  rows={2}
                  placeholder="规则说明（可选）"
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
                <span className="rent-text-sm">启用该规则</span>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setModalOpen(false)} disabled={submitting}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CommissionRules