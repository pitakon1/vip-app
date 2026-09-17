import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty } from 'antd'
import { employeesApi } from '@/services/api'
import { formatMoney } from '@/lib/money'
import type { Employee, EmployeeStatus } from '@/types'
import './employees.css'

interface QueryParams {
  page: number
  pageSize: number
  status?: EmployeeStatus
  keyword?: string
}

interface DemoEmployee extends Employee {
  employee_no?: string
  performance?: number
  target?: number
  hire_date?: string
}

// 与设计稿一致：6 色循环（默认主色 → info → success → warning → 默认 → neutral）
const AVATAR_COLORS = ['', 'rent-avatar--info', 'rent-avatar--success', 'rent-avatar--warning', '', 'rent-avatar--neutral']

// 将 API 状态映射到设计稿显示状态
const getStatusBadge = (status: string): { cls: string; text: string } => {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === '在职') return { cls: 'rent-badge--success', text: '在职' }
  if (s === 'probation' || s === '试用期') return { cls: 'rent-badge--warning', text: '试用期' }
  if (s === 'inactive' || s === 'resigned' || s === '离职') return { cls: 'rent-badge--neutral', text: '离职' }
  return { cls: 'rent-badge--neutral', text: status || '-' }
}

const Employees = () => {
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
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取员工列表失败')
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

  const handleSearch = (value: string) => {
    setQueryParams((p) => ({ ...p, keyword: value || undefined, page: 1 }))
  }

  const handleStatusChange = (value: EmployeeStatus | undefined) => {
    setQueryParams((p) => ({ ...p, status: value, page: 1 }))
  }

  const handleDepartmentChange = (value: string) => {
    // 部门筛选仅本地过滤（API 未支持），同时清空对应状态由 select 自身维护
    setDeptFilter(value)
  }

  const handleSortChange = (value: string) => {
    setSortBy(value)
  }

  const [deptFilter, setDeptFilter] = useState('')
  const [sortBy, setSortBy] = useState('perf-desc')

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
    let source: DemoEmployee[] = (data || []).map((e: any) => {
      const perf = perfMap[String(e.id)]
      return {
        ...e,
        performance: perf?.performance ?? 0,
        deals: perf?.deals ?? 0,
      }
    })
    if (deptFilter) {
      const deptMap: Record<string, string> = {
        sales: '销售部',
        ops: '运营部',
        finance: '财务部',
        cs: '客服部',
      }
      const target = deptMap[deptFilter] || deptFilter
      source = source.filter((e) => e.department === target)
    }
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
  }, [data, deptFilter, sortBy, perfMap])

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
          <h2 className="rent-page-header__title">员工管理</h2>
          <p className="rent-page-header__subtitle">管理员工信息与绩效</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            导出
          </button>
          <button className="rent-btn rent-btn--primary" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            新增员工
          </button>
        </div>
      </div>

      {/* Performance Overview Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-stat-card__head">
            <div>
              <div className="rent-stat-card__label">总员工数</div>
              <div className="rent-stat-card__value rent-num">{stats.totalEmp}</div>
              <div className="rent-stat-card__delta rent-stat-card__delta--up">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                +2 本月
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
              <div className="rent-stat-card__label">本月销冠</div>
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
              <div className="rent-stat-card__label">平均业绩</div>
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
              <div className="rent-stat-card__label">团队目标完成率</div>
              <div className="rent-stat-card__value rent-num">{stats.completion}%</div>
              <div className="rent-progress rent-mt-3"><div className="rent-progress__bar" style={{ width: `${stats.completion}%` }}></div></div>
              <div className="rent-stat-card__delta rent-text-muted">本月团队目标</div>
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
              placeholder="搜索姓名 / 工号"
              value={queryParams.keyword || ''}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>
        <select
          className="rent-filter-select"
          aria-label="部门筛选"
          value={deptFilter}
          onChange={(e) => handleDepartmentChange(e.target.value)}
        >
          <option value="">全部部门</option>
          <option value="sales">销售部</option>
          <option value="ops">运营部</option>
          <option value="finance">财务部</option>
          <option value="cs">客服部</option>
        </select>
        <select
          className="rent-filter-select"
          aria-label="状态筛选"
          value={queryParams.status || ''}
          onChange={(e) => handleStatusChange((e.target.value || undefined) as EmployeeStatus | undefined)}
        >
          <option value="">全部状态</option>
          <option value="active">在职</option>
          <option value="probation">试用期</option>
          <option value="inactive">离职</option>
        </select>
        <select
          className="rent-filter-select"
          aria-label="排序"
          value={sortBy}
          onChange={(e) => handleSortChange(e.target.value)}
        >
          <option value="perf-desc">业绩从高到低</option>
          <option value="perf-asc">业绩从低到高</option>
          <option value="joined-desc">入职时间最近</option>
          <option value="id-asc">工号升序</option>
        </select>
      </div>

      {/* Employees Table */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">员工列表</h3>
          <span className="rent-text-sm rent-text-muted">实时同步 · 截至 {todayStr}</span>
        </div>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="rent-table">
            <thead>
              <tr>
                <th>工号</th>
                <th>姓名</th>
                <th>部门</th>
                <th>职位</th>
                <th>联系方式</th>
                <th>入职日期</th>
                <th>本月业绩 (฿)</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="rent-loading-row"><Spin size="small" style={{ marginRight: 8 }} />加载中...</td>
                </tr>
              ) : listData.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无员工数据" />
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
                          <div className="rent-perf__meta"><span>目标完成</span><span className={`rent-perf__pct ${pctCls}`}>{pct}%</span></div>
                        </div>
                      </td>
                      <td><span className={`rent-badge ${status.cls}`}>{status.text}</span></td>
                      <td>
                        <div className="rent-actions">
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button">查看</button>
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button">编辑</button>
                          <button className="rent-btn rent-btn--primary-ghost rent-btn--sm" type="button">绩效</button>
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
            <span className="rent-pagination__info">共 {totalDisplay} 条记录</span>
            <div className="rent-flex rent-gap-2">
              <button
                className="rent-pagination__btn"
                type="button"
                aria-label="上一页"
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
                aria-label="下一页"
                disabled={queryParams.page >= totalPages}
                onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Employees
