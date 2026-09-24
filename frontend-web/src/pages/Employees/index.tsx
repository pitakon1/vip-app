import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Spin, Empty, Modal } from 'antd'
import api from '@/lib/api'
import { employeesApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import { formatMoney } from '@/lib/money'
import type { Employee, EmployeeStatus } from '@/types'
import './employees.css'

interface QueryParams {
  page: number
  pageSize: number
  status?: EmployeeStatus
  keyword?: string
  department?: string
}

interface DemoEmployee extends Employee {
  employee_no?: string
  performance?: number
  target?: number
  hire_date?: string
}

// 与设计稿一致：6 色循环（默认主色 → info → success → warning → 默认 → neutral）
const AVATAR_COLORS = ['', 'rent-avatar--info', 'rent-avatar--success', 'rent-avatar--warning', '', 'rent-avatar--neutral']

// 员工表单（新增 / 编辑共用）
interface EmployeeFormValues {
  fullName: string
  email: string
  phone: string
  department: string
  position: string
  password: string
  isActive: boolean
}

const emptyEmployeeForm: EmployeeFormValues = {
  fullName: '',
  email: '',
  phone: '',
  department: '',
  position: '',
  password: '',
  isActive: true,
}

// 将 API 状态映射到设计稿显示状态
const getStatusBadge = (status: string): { cls: string; text: string } => {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === '在职') return { cls: 'rent-badge--success', text: 'employees.stActive' }
  if (s === 'probation' || s === '试用期') return { cls: 'rent-badge--warning', text: 'employees.stProbation' }
  if (s === 'inactive' || s === 'resigned' || s === '离职') return { cls: 'rent-badge--neutral', text: 'employees.stInactive' }
  return { cls: 'rent-badge--neutral', text: status || '-' }
}

const Employees = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<Employee[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [leaderboard, setLeaderboard] = useState<Employee[]>([])
  const [, setLeaderLoading] = useState(false)
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: 10,
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await employeesApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        status: queryParams.status,
        keyword: queryParams.keyword,
        department: queryParams.department,
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('employees.errFetch'))
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  const fetchLeaderboard = useCallback(async () => {
    setLeaderLoading(true)
    try {
      const res = await employeesApi.leaderboard()
      const payload = res.data?.data ?? res.data
      setLeaderboard(payload?.items ?? payload ?? [])
    } catch (err: any) {
      // 排行榜加载失败不弹错误，避免干扰主列表
      setLeaderboard([])
    } finally {
      setLeaderLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const handleStatusChange = (value: EmployeeStatus | undefined) => {
    setQueryParams((p) => ({ ...p, status: value, page: 1 }))
  }

  const handleDepartmentChange = (value: string) => {
    // 部门清单来自真实数据（见 departments），过滤下推到服务端
    setQueryParams((p) => ({ ...p, department: value || undefined, page: 1 }))
  }

  const handleSortChange = (value: string) => {
    setSortBy(value)
  }

  const [keywordInput, setKeywordInput] = useState('')
  const [sortBy, setSortBy] = useState('perf-desc')
  const [departments, setDepartments] = useState<string[]>([])
  const [detailEmp, setDetailEmp] = useState<DemoEmployee | null>(null)
  const [editEmp, setEditEmp] = useState<DemoEmployee | null>(null)
  const [editForm, setEditForm] = useState<EmployeeFormValues>(emptyEmployeeForm)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<EmployeeFormValues>(emptyEmployeeForm)
  const [perfEmp, setPerfEmp] = useState<DemoEmployee | null>(null)
  const [perfRows, setPerfRows] = useState<any[]>([])
  const [perfLoading, setPerfLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 搜索框防抖：此前每次按键都会发一次请求
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQueryParams((p) => {
        const next = keywordInput.trim() || undefined
        if (p.keyword === next) return p
        return { ...p, keyword: next, page: 1 }
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [keywordInput])

  // 部门下拉用真实部门值（此前用「sales→销售部」的硬编码映射，与后端存的英文值对不上，永远筛不出数据）
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await employeesApi.directory()
      const payload = res.data?.data ?? res.data
      setDepartments(payload?.departments ?? [])
    } catch {
      setDepartments([])
    }
  }, [])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  const handleExport = async () => {
    try {
      setExporting(true)
      await downloadReport(
        '/exports/employees',
        { department: queryParams.department },
        'employees.csv',
      )
    } catch {
      message.error(t('employees.errExport'))
    } finally {
      setExporting(false)
    }
  }

  const openCreate = () => {
    setCreateForm(emptyEmployeeForm)
    setCreateOpen(true)
  }

  const openEdit = (emp: DemoEmployee) => {
    setEditForm({
      fullName: emp.full_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department: emp.department || '',
      position: emp.position || '',
      password: '',
      isActive: (emp.status || 'active') === 'active',
    })
    setEditEmp(emp)
  }

  // 查看 / 编辑共用「员工档案 + 账号」两表数据，缺少 user_id 时只能只读
  const handleCreate = async () => {
    if (!createForm.fullName.trim()) {
      message.error(t('employees.errNameRequired'))
      return
    }
    if (!createForm.email.trim()) {
      message.error(t('employees.errEmailRequired'))
      return
    }
    if (!createForm.password || createForm.password.length < 6) {
      message.error(t('employees.errPasswordMin'))
      return
    }
    try {
      setSubmitting(true)
      await api.post('/admin/users', {
        email: createForm.email.trim(),
        full_name: createForm.fullName.trim(),
        password: createForm.password,
        role: 'employee',
        phone: createForm.phone || undefined,
        department: createForm.department || undefined,
        position: createForm.position || undefined,
      })
      message.success(t('employees.msgCreated'))
      setCreateOpen(false)
      fetchData()
      fetchDepartments()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('employees.errCreateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editEmp?.user_id) {
      message.error(t('employees.errNoAccount'))
      return
    }
    if (!editForm.fullName.trim() || !editForm.email.trim()) {
      message.error(t('employees.errNameEmailRequired'))
      return
    }
    try {
      setSubmitting(true)
      await api.patch(`/admin/users/${editEmp.user_id}`, {
        full_name: editForm.fullName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone || undefined,
        department: editForm.department || undefined,
        position: editForm.position || undefined,
        is_active: editForm.isActive,
      })
      message.success(t('employees.msgSaved'))
      setEditEmp(null)
      fetchData()
      fetchDepartments()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('employees.errSaveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const openPerf = async (emp: DemoEmployee) => {
    setPerfEmp(emp)
    setPerfRows([])
    if (!emp.id) return
    try {
      setPerfLoading(true)
      const res = await api.get(`/employees/${emp.id}/performance`)
      const payload = res.data?.data ?? res.data
      setPerfRows(Array.isArray(payload) ? payload : [])
    } catch {
      message.error(t('employees.errPerfFetch'))
    } finally {
      setPerfLoading(false)
    }
  }

  // 业绩按员工 id 合并（系统自动核算的佣金数据）
  const perfMap = useMemo(() => {
    const m: Record<string, { performance: number; deals: number }> = {}
    ;(leaderboard || []).forEach((item: any) => {
      if (item?.id) {
        m[String(item.id)] = {
          performance: Number(item.performance || 0),
          deals: Number(item.deals || 0),
        }
      }
    })
    return m
  }, [leaderboard])

  const listData = useMemo<DemoEmployee[]>(() => {
    const source: DemoEmployee[] = (data || []).map((e: any) => {
      const perf = perfMap[String(e.id)]
      return {
        ...e,
        performance: perf?.performance ?? 0,
        deals: perf?.deals ?? 0,
      }
    })
    const sorted = [...source]
    switch (sortBy) {
      case 'perf-desc':
        sorted.sort((a, b) => Number(b.performance || 0) - Number(a.performance || 0))
        break
      case 'perf-asc':
        sorted.sort((a, b) => Number(a.performance || 0) - Number(b.performance || 0))
        break
      case 'joined-desc':
        sorted.sort((a, b) => (b.hire_date || '').localeCompare(a.hire_date || ''))
        break
      case 'id-asc':
        sorted.sort((a, b) => (a.employee_no || '').localeCompare(b.employee_no || ''))
        break
      default:
        break
    }
    return sorted
  }, [data, sortBy, perfMap])

  const totalDisplay = total

  // 统计指标
  const stats = useMemo(() => {
    const source = listData
    const totalEmp = totalDisplay
    const top = [...source].sort(
      (a, b) => Number(b.performance || 0) - Number(a.performance || 0),
    )[0]
    const avg =
      source.reduce((sum, e) => sum + Number(e.performance || 0), 0) /
      (source.length || 1)
    const totalTarget = source.reduce(
      (sum, e) => sum + Number(e.target || 100000),
      0,
    )
    const totalPerf = source.reduce(
      (sum, e) => sum + Number(e.performance || 0),
      0,
    )
    const completion = totalTarget > 0 ? Math.round((totalPerf / totalTarget) * 100) : 0
    return {
      totalEmp,
      topName: top?.full_name || '-',
      topPerf: Number(top?.performance || 0),
      avg: Math.round(avg),
      completion: Math.min(completion, 100),
    }
  }, [listData, totalDisplay])

  const totalPages = Math.max(1, Math.ceil(totalDisplay / queryParams.pageSize))

  // 分页页码（对齐原型 rent-pagination 结构，窗口式页码）
  const pageNumbers: (number | string)[] = useMemo(() => {
    const nums: (number | string)[] = []
    const page = queryParams.page
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i)
    } else {
      nums.push(1)
      if (page > 4) nums.push('prev-ellipsis')
      const start = Math.max(2, page - 1)
      const end = Math.min(totalPages - 1, page + 1)
      for (let i = start; i <= end; i++) nums.push(i)
      if (page < totalPages - 3) nums.push('next-ellipsis')
      nums.push(totalPages)
    }
    return nums
  }, [queryParams.page, totalPages])

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('employees.title')}</h2>
          <p className="rent-page-header__subtitle">{t('employees.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button
            className="rent-btn rent-btn--secondary"
            type="button"
            onClick={handleExport}
            disabled={exporting}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {exporting ? t('employees.exporting') : t('employees.btnExport')}
          </button>
          <button className="rent-btn rent-btn--primary" type="button" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {t('employees.btnAdd')}
          </button>
        </div>
      </div>

      {/* Performance Overview Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-stat-card__head">
            <div>
              <div className="rent-stat-card__label">{t('employees.statTotal')}</div>
              <div className="rent-stat-card__value rent-num">{stats.totalEmp}</div>
              <div className="rent-stat-card__delta rent-stat-card__delta--up">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                {t('employees.statDeltaNew')}
              </div>
            </div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </div>
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-stat-card__head">
            <div>
              <div className="rent-stat-card__label">{t('employees.statTop')}</div>
              <div className="rent-stat-card__value rent-num" style={{ fontSize: 22 }}>{stats.topName}</div>
              <div className="rent-stat-card__delta" style={{ color: 'var(--state-warning)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                {formatMoney(stats.topPerf)}
              </div>
            </div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
            </div>
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-stat-card__head">
            <div>
              <div className="rent-stat-card__label">{t('employees.statAvg')}</div>
              <div className="rent-stat-card__value rent-num">{formatMoney(stats.avg)}</div>
              <div className="rent-stat-card__delta rent-stat-card__delta--up">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                +9.4%
              </div>
            </div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
            </div>
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-stat-card__head">
            <div>
              <div className="rent-stat-card__label">{t('employees.statCompletion')}</div>
              <div className="rent-stat-card__value rent-num">{stats.completion}%</div>
              <div className="rent-progress rent-mt-3"><div className="rent-progress__bar" style={{ width: `${stats.completion}%` }}></div></div>
              <div className="rent-stat-card__delta rent-text-muted">{t('employees.statTarget')}</div>
            </div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rent-filter-bar">
        <div className="rent-filter-bar__search">
          <div className="rent-search" style={{ width: '100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              type="text"
              placeholder={t('employees.searchPlaceholder')}
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
            />
          </div>
        </div>
        <select
          className="rent-filter-select"
          aria-label={t('employees.ariaDept')}
          value={queryParams.department || ''}
          onChange={(e) => handleDepartmentChange(e.target.value)}
        >
          <option value="">{t('employees.optAllDepts')}</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          className="rent-filter-select"
          aria-label={t('employees.ariaStatus')}
          value={queryParams.status || ''}
          onChange={(e) => handleStatusChange((e.target.value || undefined) as EmployeeStatus | undefined)}
        >
          <option value="">{t('employees.optAllStatus')}</option>
          <option value="active">{t('employees.stActive')}</option>
          <option value="probation">{t('employees.stProbation')}</option>
          <option value="inactive">{t('employees.stInactive')}</option>
        </select>
        <select
          className="rent-filter-select"
          aria-label={t('employees.ariaSort')}
          value={sortBy}
          onChange={(e) => handleSortChange(e.target.value)}
        >
          <option value="perf-desc">{t('employees.sortPerfDesc')}</option>
          <option value="perf-asc">{t('employees.sortPerfAsc')}</option>
          <option value="joined-desc">{t('employees.sortJoinedDesc')}</option>
          <option value="id-asc">{t('employees.sortIdAsc')}</option>
        </select>
      </div>

      {/* Employees Table */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('employees.listTitle')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('employees.syncedAt', { date: todayStr })}</span>
        </div>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('employees.thEmpNo')}</th>
                <th>{t('employees.thName')}</th>
                <th>{t('employees.thDept')}</th>
                <th>{t('employees.thPosition')}</th>
                <th>{t('employees.thContact')}</th>
                <th>{t('employees.thHireDate')}</th>
                <th>{t('employees.thPerformance')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="rent-loading-row"><Spin size="small" style={{ marginRight: 8 }} />{t('common.loading')}</td>
                </tr>
              ) : listData.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employees.empty')} />
                  </td>
                </tr>
              ) : (
                listData.map((emp, idx) => {
                  const perf = Number(emp.performance || 0)
                  const target = Number(emp.target || 100000)
                  const pct = target > 0 ? Math.min(Math.round((perf / target) * 100), 100) : 0
                  const perfCls = pct >= 100 ? 'rent-progress__bar--success' : pct >= 60 ? '' : 'rent-progress__bar--warning'
                  const pctCls = pct >= 100 ? 'rent-perf__pct--up' : pct >= 60 ? '' : 'rent-perf__pct--warn'
                  const status = getStatusBadge(emp.status)
                  const avatarCls = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                  const initial = (emp.full_name || '?').charAt(0).toUpperCase()
                  return (
                    <tr key={emp.id || emp.employee_no || idx}>
                      <td className="rent-table__mono">{emp.employee_no || '-'}</td>
                      <td>
                        <div className="rent-emp">
                          <div className={`rent-avatar rent-avatar--sm${avatarCls ? ' ' + avatarCls : ''}`}>{initial}</div>
                          <div className="rent-emp__name">{emp.full_name || '-'}</div>
                        </div>
                      </td>
                      <td>{emp.department || '-'}</td>
                      <td>{emp.position || '-'}</td>
                      <td>
                        <div className="rent-contact">
                          <span className="rent-contact__phone">{emp.phone || '-'}</span>
                          <span className="rent-contact__email">{emp.email || '-'}</span>
                        </div>
                      </td>
                      <td className="rent-table__mono">{emp.hire_date || '-'}</td>
                      <td>
                        <div className="rent-perf">
                          <div className="rent-perf__value">{formatMoney(perf)}</div>
                          <div className="rent-progress"><div className={`rent-progress__bar ${perfCls}`} style={{ width: `${pct}%` }}></div></div>
                          <div className="rent-perf__meta"><span>{t('employees.targetDone')}</span><span className={`rent-perf__pct ${pctCls}`}>{pct}%</span></div>
                        </div>
                      </td>
                      <td><span className={`rent-badge ${status.cls}`}>{t(status.text)}</span></td>
                      <td>
                        <div className="rent-actions">
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => setDetailEmp(emp)}>{t('employees.btnView')}</button>
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => openEdit(emp)}>{t('common.edit')}</button>
                          <button className="rent-btn rent-btn--primary-ghost rent-btn--sm" type="button" onClick={() => openPerf(emp)}>{t('employees.btnPerf')}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="rent-card__footer">
          <div className="rent-pagination rent-pagination--split">
            <span className="rent-pagination__info">{t('employees.pageInfo', { count: totalDisplay })}</span>
            <div className="rent-flex rent-gap-2">
              <button
                className="rent-pagination__btn"
                type="button"
                aria-label={t('employees.ariaPrev')}
                disabled={queryParams.page <= 1}
                onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              {pageNumbers.map((n, idx) =>
                n === 'prev-ellipsis' || n === 'next-ellipsis' ? (
                  <span className="rent-pagination__info" key={idx} style={{ margin: '0 4px' }}>...</span>
                ) : (
                  <button
                    key={idx}
                    className="rent-pagination__btn"
                    data-active={queryParams.page === n ? 'true' : 'false'}
                    type="button"
                    onClick={() => setQueryParams((p) => ({ ...p, page: Number(n) }))}
                  >
                    {n}
                  </button>
                )
              )}
              <button
                className="rent-pagination__btn"
                type="button"
                aria-label={t('employees.ariaNext')}
                disabled={queryParams.page >= totalPages}
                onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 新增员工：开通 employee 账号并同步建档（POST /admin/users） */}
      <Modal
        open={createOpen}
        title={t('employees.createTitle')}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={submitting}
        okText={t('employees.okCreate')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelName')}</label>
          <input
            className="rent-form-input"
            value={createForm.fullName}
            onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
            placeholder={t('employees.placeholderName')}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelEmail')}</label>
          <input
            className="rent-form-input"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
            placeholder={t('employees.placeholderEmail')}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelPassword')}</label>
          <input
            className="rent-form-input"
            value={createForm.password}
            onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={t('employees.placeholderPassword')}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelPhone')}</label>
          <input
            className="rent-form-input"
            value={createForm.phone}
            onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder={t('employees.placeholderOptional')}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelDept')}</label>
          <input
            className="rent-form-input"
            value={createForm.department}
            onChange={(e) => setCreateForm((f) => ({ ...f, department: e.target.value }))}
            placeholder={t('employees.placeholderDept')}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelPosition')}</label>
          <input
            className="rent-form-input"
            value={createForm.position}
            onChange={(e) => setCreateForm((f) => ({ ...f, position: e.target.value }))}
            placeholder={t('employees.placeholderPosition')}
          />
        </div>
      </Modal>

      {/* 编辑员工：账号资料 + 员工档案（PATCH /admin/users/{user_id}） */}
      <Modal
        open={!!editEmp}
        title={t('employees.editTitle')}
        onCancel={() => setEditEmp(null)}
        onOk={handleUpdate}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelEmpNo')}</label>
          <input className="rent-form-input" value={editEmp?.employee_no || '-'} readOnly />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelName')}</label>
          <input
            className="rent-form-input"
            value={editForm.fullName}
            onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelEmailEdit')}</label>
          <input
            className="rent-form-input"
            value={editForm.email}
            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelPhone')}</label>
          <input
            className="rent-form-input"
            value={editForm.phone}
            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelDept')}</label>
          <input
            className="rent-form-input"
            value={editForm.department}
            onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
          />
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label">{t('employees.labelPosition')}</label>
          <input
            className="rent-form-input"
            value={editForm.position}
            onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))}
          />
        </div>
        <div className="rent-form-group" style={{ marginBottom: 0 }}>
          <label className="rent-form-label">{t('employees.labelActiveStatus')}</label>
          <select
            className="rent-form-select"
            value={editForm.isActive ? 'active' : 'inactive'}
            onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.value === 'active' }))}
          >
            <option value="active">{t('employees.stActive')}</option>
            <option value="inactive">{t('employees.stInactive')}</option>
          </select>
        </div>
      </Modal>

      {/* 查看员工：只读档案 */}
      <Modal
        open={!!detailEmp}
        title={t('employees.detailTitle')}
        onCancel={() => setDetailEmp(null)}
        footer={
          <button className="rent-btn rent-btn--secondary" type="button" onClick={() => setDetailEmp(null)}>
            {t('common.close')}
          </button>
        }
        destroyOnClose
      >
        {detailEmp && (
          <>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('employees.labelEmpNo')}</label>
              <div className="rent-table__mono">{detailEmp.employee_no || '-'}</div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('employees.labelNamePlain')}</label>
              <div>{detailEmp.full_name || '-'}</div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('employees.labelDeptPosition')}</label>
              <div>
                {detailEmp.department || '-'} · {detailEmp.position || '-'}
              </div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('employees.labelContact')}</label>
              <div>
                {detailEmp.phone || '-'}
                <span className="rent-text-muted" style={{ marginLeft: 8 }}>
                  {detailEmp.email || '-'}
                </span>
              </div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('employees.labelHireDate')}</label>
              <div>{detailEmp.hire_date || '-'}</div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('employees.labelPerformance')}</label>
              <div className="rent-num">{formatMoney(Number(detailEmp.performance || 0))}</div>
            </div>
            <div className="rent-form-group" style={{ marginBottom: 0 }}>
              <label className="rent-form-label">{t('common.status')}</label>
              <div>
                <span className={`rent-badge ${getStatusBadge(detailEmp.status || '').cls}`}>
                  {t(getStatusBadge(detailEmp.status || '').text)}
                </span>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* 绩效明细：系统按佣金结算自动核算（GET /employees/{id}/performance） */}
      <Modal
        open={!!perfEmp}
        title={t('employees.perfTitle', { name: perfEmp?.full_name || '' })}
        onCancel={() => setPerfEmp(null)}
        footer={
          <button className="rent-btn rent-btn--secondary" type="button" onClick={() => setPerfEmp(null)}>
            {t('common.close')}
          </button>
        }
        width={720}
        destroyOnClose
      >
        {perfLoading ? (
          <div className="rent-empty">
            <Spin size="small" style={{ marginRight: 8 }} />
            <span className="rent-text-muted">{t('common.loading')}</span>
          </div>
        ) : perfRows.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employees.perfEmpty')} />
        ) : (
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('employees.thDealType')}</th>
                <th>{t('employees.thCommissionBase')}</th>
                <th>{t('employees.thRate')}</th>
                <th>{t('employees.thCommissionAmount')}</th>
                <th>{t('employees.thSettleStatus')}</th>
                <th>{t('employees.thCreatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {perfRows.map((row, idx) => (
                <tr key={row.id || idx}>
                  <td>{row.deal_type || '-'}</td>
                  <td className="rent-money">{Number(row.commission_base || 0).toLocaleString()}</td>
                  <td>{row.commission_rate ?? '-'}</td>
                  <td className="rent-money">
                    {row.currency || ''} {Number(row.commission_amount || 0).toLocaleString()}
                  </td>
                  <td>{row.status || '-'}</td>
                  <td className="rent-table__mono">
                    {row.created_at ? String(row.created_at).slice(0, 10) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  )
}

export default Employees
