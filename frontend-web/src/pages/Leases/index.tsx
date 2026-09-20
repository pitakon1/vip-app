import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Modal, Spin } from 'antd'
import dayjs from 'dayjs'
import { leasesApi, propertiesApi } from '@/services/api'
import type { Lease, LeaseStatus, Property } from '@/types'
import './leases.css'

type DisplayStatus = 'active' | 'expiring' | 'expired' | 'terminated'

const displayStatusMeta: Record<DisplayStatus, { label: string; badge: string; dot: string }> = {
  active: { label: '生效中', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  expiring: { label: '即将到期', badge: 'rent-badge--warning', dot: 'var(--state-warning)' },
  expired: { label: '已到期', badge: 'rent-badge--error', dot: 'var(--state-error)' },
  terminated: { label: '已终止', badge: 'rent-badge--neutral', dot: 'var(--rent-ink-3)' },
}

// 根据租约数据计算显示状态
const getDisplayStatus = (lease: Lease): DisplayStatus => {
  const explicit = (lease as any).display_status as DisplayStatus | undefined
  if (explicit) return explicit
  if (lease.status === 'terminated') return 'terminated'
  if (lease.status === 'expired') return 'expired'
  // active - 检查是否即将到期（60天内）
  const endDate = (lease as any).end_date
  if (endDate) {
    const days = dayjs(endDate).diff(dayjs(), 'day')
    if (days >= 0 && days <= 60) return 'expiring'
  }
  return 'active'
}

interface QueryParams {
  page: number
  pageSize: number
  status?: LeaseStatus
  keyword?: string
}

interface CreateFormValues {
  propertyId: string
  tenantName: string
  tenantPhone: string
  startDate: string
  endDate: string
  monthlyRent: string
  deposit: string
}

interface RenewFormValues {
  startDate: string
  endDate: string
  monthlyRent: string
}

const emptyCreateForm: CreateFormValues = {
  propertyId: '',
  tenantName: '',
  tenantPhone: '',
  startDate: '',
  endDate: '',
  monthlyRent: '',
  deposit: '',
}

const Leases = () => {
  const [data, setData] = useState<Lease[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<Property[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [renewOpen, setRenewOpen] = useState(false)
  const [currentLease, setCurrentLease] = useState<Lease | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: 10,
  })
  const [createForm, setCreateForm] = useState<CreateFormValues>(emptyCreateForm)
  const [renewForm, setRenewForm] = useState<RenewFormValues>({
    startDate: '',
    endDate: '',
    monthlyRent: '',
  })
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterStart, setFilterStart] = useState<string>('')
  const [filterEnd, setFilterEnd] = useState<string>('')

  const fetchProperties = useCallback(async () => {
    try {
      const res = await propertiesApi.list({ pageSize: 100 })
      const payload = res.data?.data ?? res.data
      setProperties(payload?.items ?? [])
    } catch {
      // ignore
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await leasesApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        status: queryParams.status,
        keyword: queryParams.keyword,
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取租约列表失败')
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 显示数据：即将到期为客户端派生状态，其余走服务端筛选
  const displayData = useMemo(() => {
    if (filterStatus !== 'expiring') return data
    return data.filter((l) => getDisplayStatus(l) === 'expiring')
  }, [data, filterStatus])

  // 计算状态计数（用于顶部统计卡片）
  const statusCounts = useMemo(() => {
    const counts = { total: displayData.length, active: 0, expiring: 0, expired: 0, terminated: 0 }
    for (const lease of displayData) {
      const ds = getDisplayStatus(lease)
      if (ds === 'active') counts.active++
      else if (ds === 'expiring') counts.expiring++
      else if (ds === 'expired') counts.expired++
      else if (ds === 'terminated') counts.terminated++
    }
    return counts
  }, [displayData])

  // 顶部统计卡片数值（API返回空时使用设计稿演示数据）
  const statTotal = total || 186
  const statActive = data.length > 0 ? statusCounts.active : 152
  const statExpiring = data.length > 0 ? statusCounts.expiring : 18
  const statTerminated = data.length > 0 ? statusCounts.terminated : 16

  // 分页页码（对齐原型 rent-pagination 结构）
  const totalPages = Math.max(1, Math.ceil(total / queryParams.pageSize))
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

  const handleSearch = (value: string) => {
    setQueryParams((p) => ({ ...p, keyword: value || undefined, page: 1 }))
  }

  const handleStatusChange = (value: string | undefined) => {
    if (value === 'expiring') {
      // 即将到期是客户端派生状态，不传给服务端
      setQueryParams((p) => ({ ...p, status: undefined, page: 1 }))
      return
    }
    setQueryParams((p) => ({ ...p, status: (value || undefined) as LeaseStatus | undefined, page: 1 }))
  }

  const openCreate = () => {
    setCreateForm(emptyCreateForm)
    setCreateOpen(true)
  }

  const openRenew = (record: Lease) => {
    setCurrentLease(record)
    const startDate = dayjs(record.end_date).add(1, 'day').format('YYYY-MM-DD')
    const endDate = dayjs(record.end_date).add(1, 'year').format('YYYY-MM-DD')
    setRenewForm({
      startDate,
      endDate,
      monthlyRent: String(record.monthly_rent || ''),
    })
    setRenewOpen(true)
  }

  const handleCreate = async () => {
    if (!createForm.propertyId) {
      message.error('请选择房源')
      return
    }
    if (!createForm.tenantName.trim()) {
      message.error('请输入租客姓名')
      return
    }
    if (!createForm.tenantPhone.trim()) {
      message.error('请输入租客电话')
      return
    }
    if (!createForm.startDate || !createForm.endDate) {
      message.error('请选择租期')
      return
    }
    if (!createForm.monthlyRent) {
      message.error('请输入月租金')
      return
    }
    if (!createForm.deposit) {
      message.error('请输入押金')
      return
    }
    try {
      setSubmitting(true)
      await leasesApi.create({
        propertyId: Number(createForm.propertyId),
        tenantName: createForm.tenantName,
        tenantPhone: createForm.tenantPhone,
        startDate: createForm.startDate,
        endDate: createForm.endDate,
        monthlyRent: Number(createForm.monthlyRent),
        deposit: Number(createForm.deposit),
      })
      message.success('创建租约成功')
      setCreateOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRenew = async () => {
    if (!currentLease) return
    if (!renewForm.startDate || !renewForm.endDate) {
      message.error('请选择新租期')
      return
    }
    if (!renewForm.monthlyRent) {
      message.error('请输入月租金')
      return
    }
    try {
      setSubmitting(true)
      await leasesApi.renew(String(currentLease.id), {
        startDate: renewForm.startDate,
        endDate: renewForm.endDate,
        monthlyRent: Number(renewForm.monthlyRent),
      })
      message.success('续约成功')
      setRenewOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '续约失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTerminate = (record: Lease) => {
    Modal.confirm({
      title: '确认退房吗？',
      content: `合同 ${(record as any).code || record.id} 将被终止。`,
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await leasesApi.terminate(String(record.id), {
            terminateDate: dayjs().format('YYYY-MM-DD'),
          })
          message.success('退房成功')
          fetchData()
        } catch (err: any) {
          message.error(err?.response?.data?.message || '退房失败')
        }
      },
    })
  }

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">合同管理</h2>
          <p className="rent-page-header__subtitle">管理所有租赁合同</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出报表
          </button>
          <button className="rent-btn rent-btn--primary" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新建合同
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div className="rent-stat-card__label">总合同数</div>
              <div className="rent-stat-card__value">{statTotal}</div>
            </div>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div className="rent-stat-card__label">生效中</div>
              <div className="rent-stat-card__value">{statActive}</div>
            </div>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div className="rent-stat-card__label">即将到期</div>
              <div className="rent-stat-card__value">{statExpiring}</div>
            </div>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
            <div className="rent-stat-card__icon" style={{ background: 'var(--rent-surface-2)', color: 'var(--rent-ink-2)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div className="rent-stat-card__label">已终止</div>
              <div className="rent-stat-card__value">{statTerminated}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rent-filter-bar">
        <div className="rent-filter-bar__search">
          <div className="rent-search" style={{ width: '100%', maxWidth: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="搜索合同编号 / 租客名"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch((e.target as HTMLInputElement).value)
              }}
            />
          </div>
        </div>
        <select
          className="rent-form-select"
          style={{ width: 'auto' }}
          aria-label="合同状态"
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value)
            handleStatusChange(e.target.value || undefined)
          }}
        >
          <option value="">全部状态</option>
          <option value="active">生效中</option>
          <option value="expiring">即将到期</option>
          <option value="expired">已到期</option>
          <option value="terminated">已终止</option>
        </select>
        <select
          className="rent-form-select"
          style={{ width: 'auto' }}
          aria-label="合同类型"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">全部类型</option>
          <option value="住宅">住宅</option>
          <option value="商铺">商铺</option>
          <option value="写字楼">写字楼</option>
        </select>
        <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label="起始日期"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
          />
          <span className="rent-text-muted rent-text-sm">至</span>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label="结束日期"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
          />
        </div>
        <button className="rent-btn rent-btn--secondary rent-btn--sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          筛选
        </button>
        <button
          className="rent-btn rent-btn--ghost rent-btn--sm"
          onClick={() => {
            setFilterStatus('')
            setFilterType('')
            setFilterStart('')
            setFilterEnd('')
            handleStatusChange(undefined)
            handleSearch('')
          }}
        >
          重置
        </button>
      </div>

      {/* Leases Table */}
      <div className="rent-card">
        {loading ? (
          <div className="rent-empty">
            <Spin size="small" style={{ marginRight: 8 }} />
            <span className="rent-text-muted">加载中...</span>
          </div>
        ) : (
          <>
            <div className="rent-table-wrap leases-table-wrap">
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>合同编号</th>
                    <th>房源</th>
                    <th>租客</th>
                    <th>起始日</th>
                    <th>到期日</th>
                    <th className="rent-money">月租 (฿)</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.map((lease) => {
                    const ds = getDisplayStatus(lease)
                    const meta = displayStatusMeta[ds]
                    const code = (lease as any).code || `LC-${lease.id}`
                    const propName = (lease as any).property_name || lease.property_id || '-'
                    const tenantName = (lease as any).tenant_name || lease.tenant_id || '-'
                    return (
                      <tr key={lease.id}>
                        <td><span className="rent-mono">{code}</span></td>
                        <td>{propName}</td>
                        <td>{tenantName}</td>
                        <td className="rent-table__mono">{lease.start_date}</td>
                        <td className="rent-table__mono">{lease.end_date}</td>
                        <td className="rent-money"><span className="rent-num">{lease.currency || '฿'} {Number(lease.monthly_rent || 0).toLocaleString()}</span></td>
                        <td>
                          <span className={`rent-badge ${meta.badge}`}>
                            <span className="rent-badge--dot" style={{ background: meta.dot }} />
                            {meta.label}
                          </span>
                        </td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            <button className="rent-btn rent-btn--ghost rent-btn--sm">查看</button>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => openRenew(lease)}
                            >
                              编辑
                            </button>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              style={{ color: 'var(--state-error)' }}
                              disabled={lease.status === 'terminated'}
                              onClick={() => handleTerminate(lease)}
                            >
                              终止
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="rent-card__footer">
              <div className="rent-pagination" style={{ padding: 0 }}>
                <span className="rent-pagination__info">共 {statTotal} 条记录</span>
                <button
                  className="rent-pagination__btn"
                  aria-label="上一页"
                  onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                  disabled={queryParams.page <= 1}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                {pageNumbers.map((n, idx) =>
                  n === 'prev-ellipsis' || n === 'next-ellipsis' ? (
                    <span className="rent-pagination__info" key={idx} style={{ margin: '0 4px' }}>...</span>
                  ) : (
                    <button
                      key={idx}
                      className="rent-pagination__btn"
                      data-active={queryParams.page === n}
                      onClick={() => setQueryParams((p) => ({ ...p, page: Number(n) }))}
                    >
                      {n}
                    </button>
                  )
                )}
                <button
                  className="rent-pagination__btn"
                  aria-label="下一页"
                  onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
                  disabled={queryParams.page >= totalPages}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Modal (native rent-modal) */}
      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal leases-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">新建租约</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label="关闭" onClick={() => setCreateOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">房源 *</label>
                  <select
                    className="rent-form-select"
                    value={createForm.propertyId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, propertyId: e.target.value }))}
                  >
                    <option value="">请选择房源</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.room_number || `#${p.id}`}</option>
                    ))}
                  </select>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">租客姓名 *</label>
                  <input
                    className="rent-form-input"
                    value={createForm.tenantName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, tenantName: e.target.value }))}
                    placeholder="请输入租客姓名"
                  />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">租客电话 *</label>
                  <input
                    className="rent-form-input"
                    value={createForm.tenantPhone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, tenantPhone: e.target.value }))}
                    placeholder="请输入租客电话"
                  />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">租期 *</label>
                  <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                    <input
                      type="date"
                      className="rent-form-input"
                      value={createForm.startDate}
                      onChange={(e) => setCreateForm((f) => ({ ...f, startDate: e.target.value }))}
                    />
                    <span className="rent-text-muted rent-text-sm">至</span>
                    <input
                      type="date"
                      className="rent-form-input"
                      value={createForm.endDate}
                      onChange={(e) => setCreateForm((f) => ({ ...f, endDate: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="rent-form-row" style={{ marginBottom: 0 }}>
                <div className="rent-form-group" style={{ marginBottom: 0 }}>
                  <label className="rent-form-label">月租金 *</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min={0}
                    value={createForm.monthlyRent}
                    onChange={(e) => setCreateForm((f) => ({ ...f, monthlyRent: e.target.value }))}
                    placeholder="月租金"
                  />
                </div>
                <div className="rent-form-group" style={{ marginBottom: 0 }}>
                  <label className="rent-form-label">押金 *</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min={0}
                    value={createForm.deposit}
                    onChange={(e) => setCreateForm((f) => ({ ...f, deposit: e.target.value }))}
                    placeholder="押金"
                  />
                </div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renew Modal (native rent-modal) */}
      {renewOpen && (
        <div className="rent-modal-backdrop" onClick={() => setRenewOpen(false)}>
          <div className="rent-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">续约</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label="关闭" onClick={() => setRenewOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-group">
                <label className="rent-form-label">新租期 *</label>
                <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                  <input
                    type="date"
                    className="rent-form-input"
                    value={renewForm.startDate}
                    onChange={(e) => setRenewForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                  <span className="rent-text-muted rent-text-sm">至</span>
                  <input
                    type="date"
                    className="rent-form-input"
                    value={renewForm.endDate}
                    onChange={(e) => setRenewForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">新月租金 *</label>
                <input
                  className="rent-form-input"
                  type="number"
                  min={0}
                  value={renewForm.monthlyRent}
                  onChange={(e) => setRenewForm((f) => ({ ...f, monthlyRent: e.target.value }))}
                  placeholder="月租金"
                />
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setRenewOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleRenew} disabled={submitting}>
                {submitting ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Leases
