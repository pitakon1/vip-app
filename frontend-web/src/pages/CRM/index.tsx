import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin } from 'antd'
import { leadsApi } from '@/services/api'
import type { Lead, LeadStatus } from '@/types'
import './crm.css'

/* ===== 设计稿常量 ===== */
type KanbanColumnKey = 'new' | 'contacted' | 'viewed' | 'negotiating' | 'closed'

const KANBAN_COLUMNS: { key: KanbanColumnKey; label: string; color: string }[] = [
  { key: 'new', label: '新线索', color: '#14b8a6' },
  { key: 'contacted', label: '已联系', color: '#eab308' },
  { key: 'viewed', label: '已看房', color: '#f97316' },
  { key: 'negotiating', label: '谈判中', color: '#7c3aed' },
  { key: 'closed', label: '已成交', color: '#16a34a' },
]

const statusToColumn: Record<LeadStatus, KanbanColumnKey> = {
  new: 'new',
  inquiring: 'new',
  following: 'contacted',
  viewing_scheduled: 'viewed',
  negotiating: 'negotiating',
  pending_contract: 'negotiating',
  closed: 'closed',
  converted: 'closed',
  lost: 'new',
}

const stageLabelMap: Record<LeadStatus, string> = {
  inquiring: '咨询中',
  viewing_scheduled: '已约看',
  negotiating: '谈判中',
  pending_contract: '待签约',
  closed: '已成交',
  new: '新客户',
  following: '跟进中',
  converted: '已转化',
  lost: '已流失',
}

const AGENT_COLORS = ['#14b8a6', '#16a34a', '#d97706', '#14b8a6', '#0ea5e9']

const getAgentColor = (name?: string) => {
  if (!name) return AGENT_COLORS[0]
  return AGENT_COLORS[name.charCodeAt(0) % AGENT_COLORS.length]
}

const getAgentInitial = (name?: string) => (name ? name.charAt(0) : '?')

const CURRENCY_SYMBOL: Record<string, string> = {
  THB: '฿',
  USD: '$',
  CNY: '¥',
  SGD: 'S$',
  MYR: 'RM',
}

const formatBudget = (lead: Lead): string => {
  const symbol = CURRENCY_SYMBOL[lead.budget_currency || 'THB'] || lead.budget_currency || 'THB'
  const min = lead.budget_min
  const max = lead.budget_max
  if (min != null && max != null) {
    return `${symbol} ${Number(min).toLocaleString()}-${Number(max).toLocaleString()}`
  }
  if (max != null) return `${symbol} ${Number(max).toLocaleString()}`
  if (min != null) return `${symbol} ${Number(min).toLocaleString()}`
  return '未设定'
}

const propertyTypeBadge = (type?: string): string => {
  if (!type) return 'rent-badge--info'
  const t = type.toLowerCase()
  if (type.includes('别墅') || t.includes('villa')) return 'rent-badge--primary'
  if (type.includes('商铺') || t.includes('shop')) return 'rent-badge--warning'
  return 'rent-badge--info'
}

interface QueryParams {
  page: number
  pageSize: number
  status?: LeadStatus
  keyword?: string
}

interface CreateFormValues {
  name: string
  nationality: string
  phone: string
  email: string
  budget_max: string
  assigned_to: string
  source: string
  requirement: string
}

const emptyCreateForm: CreateFormValues = {
  name: '',
  nationality: '',
  phone: '',
  email: '',
  budget_max: '',
  assigned_to: '',
  source: '',
  requirement: '',
}

const CRM = () => {
  const [data, setData] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [stageModalOpen, setStageModalOpen] = useState(false)
  const [currentLead, setCurrentLead] = useState<Lead | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: 10,
  })
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [createForm, setCreateForm] = useState<CreateFormValues>(emptyCreateForm)
  const [stageValue, setStageValue] = useState<LeadStatus | ''>('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await leadsApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        status: queryParams.status,
        keyword: queryParams.keyword,
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取客户列表失败')
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const displayData = data

  // 按看板列分组
  const kanbanGroups = useMemo(() => {
    const groups: Record<KanbanColumnKey, Lead[]> = {
      new: [],
      contacted: [],
      viewed: [],
      negotiating: [],
      closed: [],
    }
    for (const lead of displayData) {
      const col = statusToColumn[lead.stage as LeadStatus] || 'new'
      groups[col].push(lead)
    }
    return groups
  }, [displayData])

  // 统计指标（基于真实数据计算，无数据时展示空态）
  const pipelineStats = useMemo(() => {
    const totalLeads = displayData.length
    const closedCount = kanbanGroups.closed.length
    const conversionRate = totalLeads > 0 ? Math.round((closedCount / totalLeads) * 1000) / 10 : 0
    return { totalLeads, closedCount, conversionRate }
  }, [displayData, kanbanGroups])

  const hasLeads = displayData.length > 0

  const handleSearch = (value: string) => {
    setQueryParams((p) => ({ ...p, keyword: value || undefined, page: 1 }))
  }

  const handleStageChange = (value: LeadStatus | undefined) => {
    setQueryParams((p) => ({ ...p, status: value, page: 1 }))
  }

  const openCreate = () => {
    setCreateForm(emptyCreateForm)
    setModalOpen(true)
  }

  const openEditStage = (record: Lead) => {
    setCurrentLead(record)
    setStageValue(record.stage as LeadStatus)
    setStageModalOpen(true)
  }

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      message.error('请输入姓名')
      return
    }
    if (!createForm.phone.trim()) {
      message.error('请输入电话')
      return
    }
    try {
      setSubmitting(true)
      await leadsApi.create({
        name: createForm.name,
        nationality: createForm.nationality,
        phone: createForm.phone,
        email: createForm.email,
        budget_max: createForm.budget_max ? Number(createForm.budget_max) : undefined,
        assigned_to: createForm.assigned_to,
        source: createForm.source,
        requirement: createForm.requirement,
      } as any)
      message.success('创建成功')
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateStage = async () => {
    if (!currentLead) return
    if (!stageValue) {
      message.error('请选择阶段')
      return
    }
    try {
      setSubmitting(true)
      await leadsApi.update(String(currentLead.id), { stage: stageValue })
      message.success('阶段已更新')
      setStageModalOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const renderKanbanCard = (lead: Lead) => {
    const pType = (lead as any).property_type || '公寓'
    const isClosed = statusToColumn[lead.stage as LeadStatus] === 'closed'
    const dealPrice = (lead as any).deal_price
    const followUp = (lead as any).follow_up || ''
    const agent = lead.assigned_to
    return (
      <div className="rent-kanban__card" key={lead.id} onClick={() => openEditStage(lead)}>
        <div className="rent-flex rent-flex--between rent-gap-2 rent-mb-2" style={{ alignItems: 'center' }}>
          <span className="rent-text-bold rent-text-sm">{lead.name}</span>
          <span className={`rent-badge ${propertyTypeBadge(pType)}`}>{pType}</span>
        </div>
        <div className="rent-flex rent-gap-2 rent-mb-3" style={{ alignItems: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span className="rent-caption rent-text-muted">{lead.phone || '-'}</span>
        </div>
        <div className="rent-flex rent-flex--between rent-mt-2">
          <span className="rent-caption rent-text-muted">{isClosed ? '成交价' : '预算'}</span>
          {isClosed && dealPrice != null ? (
            <span className="rent-mono rent-text-bold" style={{ color: 'var(--state-success)' }}>
              {CURRENCY_SYMBOL[lead.budget_currency || 'THB'] || lead.budget_currency || 'THB'} {Number(dealPrice).toLocaleString()}
            </span>
          ) : (
            <span className="rent-mono rent-text-bold">{formatBudget(lead)}</span>
          )}
        </div>
        <hr className="rent-divider" style={{ margin: '10px 0' }} />
        <div className="rent-flex rent-flex--between" style={{ alignItems: 'center' }}>
          <span className="rent-caption rent-text-muted">跟进: {followUp}</span>
          <div className="rent-avatar rent-avatar--sm" style={{ background: getAgentColor(agent) }}>
            {getAgentInitial(agent)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">客户管理</h2>
          <p className="rent-page-header__subtitle">管理客户线索与跟进状态</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            导入
          </button>
          <button className="rent-btn rent-btn--primary" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新增客户
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="rent-tabs">
        <div className="rent-tab" data-active={view === 'kanban'} onClick={() => setView('kanban')}>
          <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="14" y="3" width="7" height="11" rx="1" />
              <rect x="14" y="18" width="7" height="3" rx="1" />
            </svg>
            看板视图
          </span>
        </div>
        <div className="rent-tab" data-active={view === 'list'} onClick={() => setView('list')}>
          <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            列表视图
          </span>
        </div>
      </div>

      {loading && (
        <div className="rent-empty">
          <Spin size="small" style={{ marginRight: 8 }} />
          <span className="rent-text-muted">加载中...</span>
        </div>
      )}

      {!loading && view === 'kanban' && (
        <>
          {!hasLeads && (
            <div className="rent-empty" style={{ marginBottom: 16 }}>
              暂无客户线索，点击右上角「新增客户」添加
            </div>
          )}
          {/* Kanban Board */}
          <div className="rent-kanban">
            {KANBAN_COLUMNS.map((col) => {
              const items = kanbanGroups[col.key]
              return (
                <div className="rent-kanban__column" key={col.key}>
                  <div className="rent-kanban__column-header">
                    <span className="rent-kanban__column-title rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                      <span className="rent-badge--dot" style={{ background: col.color }} />
                      {col.label}
                    </span>
                    <span className="rent-kanban__column-count">{items.length}</span>
                  </div>
                  {items.map(renderKanbanCard)}
                </div>
              )
            })}
          </div>

          {/* Pipeline Summary Stats（数据驱动） */}
          <div className="rent-grid rent-grid--3 rent-mt-5">
            <div className="rent-stat-card">
              <div className="rent-flex rent-flex--between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="rent-stat-card__label">线索总数</div>
                  <div className="rent-stat-card__value">{pipelineStats.totalLeads}</div>
                  <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-3)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    已成交 {pipelineStats.closedCount} 条
                  </div>
                </div>
                <div className="rent-stat-card__icon" style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-flex rent-flex--between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="rent-stat-card__label">转化率</div>
                  <div className="rent-stat-card__value">
                    {pipelineStats.conversionRate}
                    <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>%</span>
                  </div>
                  <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-3)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    由真实线索数据计算
                  </div>
                </div>
                <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-flex rent-flex--between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="rent-stat-card__label">当前进行中</div>
                  <div className="rent-stat-card__value">
                    {Math.max(0, pipelineStats.totalLeads - pipelineStats.closedCount)}
                  </div>
                  <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-3)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    含跟进与谈判中
                  </div>
                </div>
                <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && view === 'list' && (
        <>
          {/* Filter Bar */}
          <div className="rent-filter-bar">
            <select
              className="rent-form-select"
              style={{ width: 'auto', minWidth: 140 }}
              value={queryParams.status || ''}
              onChange={(e) => handleStageChange((e.target.value || undefined) as LeadStatus | undefined)}
            >
              <option value="">全部阶段</option>
              {Object.entries(stageLabelMap).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="rent-filter-bar__search">
              <div className="rent-search" style={{ width: '100%', maxWidth: 'none' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="搜索姓名/电话/邮箱"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch((e.target as HTMLInputElement).value)
                  }}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rent-table-wrap">
            <table className="rent-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>国籍</th>
                  <th>联系方式</th>
                  <th>预算</th>
                  <th>阶段</th>
                  <th>分配</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((lead) => (
                  <tr key={lead.id}>
                    <td className="rent-text-bold">{lead.name}</td>
                    <td>{lead.nationality || '-'}</td>
                    <td>
                      <div>{lead.phone || '-'}</div>
                      {lead.email && <div className="rent-text-muted rent-text-sm">{lead.email}</div>}
                    </td>
                    <td className="rent-num">{formatBudget(lead)}</td>
                    <td>
                      <span className="rent-badge rent-badge--info">
                        {stageLabelMap[lead.stage as LeadStatus] || lead.stage}
                      </span>
                    </td>
                    <td>{lead.assigned_to || '-'}</td>
                    <td>
                      <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openEditStage(lead)}>
                        编辑阶段
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="rent-pagination">
            <span className="rent-pagination__info">共 {total} 条</span>
            <button
              className="rent-pagination__btn"
              onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              disabled={queryParams.page <= 1}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button className="rent-pagination__btn" data-active={true}>{queryParams.page}</button>
            <button
              className="rent-pagination__btn"
              onClick={() => setQueryParams((p) => ({ ...p, page: p.page + 1 }))}
              disabled={displayData.length < queryParams.pageSize}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Create Modal (native rent-modal) */}
      {modalOpen && (
        <div className="rent-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="rent-modal crm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">新增线索</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setModalOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">姓名 *</label>
                  <input
                    className="rent-form-input"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="请输入姓名"
                  />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">国籍</label>
                  <input
                    className="rent-form-input"
                    value={createForm.nationality}
                    onChange={(e) => setCreateForm((f) => ({ ...f, nationality: e.target.value }))}
                    placeholder="请输入国籍"
                  />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">电话 *</label>
                  <input
                    className="rent-form-input"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="请输入电话"
                  />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">邮箱</label>
                  <input
                    className="rent-form-input"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="请输入邮箱"
                  />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">预算</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min={0}
                    value={createForm.budget_max}
                    onChange={(e) => setCreateForm((f) => ({ ...f, budget_max: e.target.value }))}
                    placeholder="预算"
                  />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">分配给</label>
                  <input
                    className="rent-form-input"
                    value={createForm.assigned_to}
                    onChange={(e) => setCreateForm((f) => ({ ...f, assigned_to: e.target.value }))}
                    placeholder="请输入负责人"
                  />
                </div>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">来源</label>
                <input
                  className="rent-form-input"
                  value={createForm.source}
                  onChange={(e) => setCreateForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="请输入来源"
                />
              </div>
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">需求</label>
                <textarea
                  className="rent-form-textarea"
                  rows={2}
                  value={createForm.requirement}
                  onChange={(e) => setCreateForm((f) => ({ ...f, requirement: e.target.value }))}
                  placeholder="请输入客户需求"
                />
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setModalOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage Edit Modal (native rent-modal) */}
      {stageModalOpen && (
        <div className="rent-modal-backdrop" onClick={() => setStageModalOpen(false)}>
          <div className="rent-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">编辑阶段</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setStageModalOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">阶段 *</label>
                <select
                  className="rent-form-select"
                  value={stageValue}
                  onChange={(e) => setStageValue(e.target.value as LeadStatus)}
                >
                  <option value="">请选择阶段</option>
                  {Object.entries(stageLabelMap).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setStageModalOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleUpdateStage} disabled={submitting}>
                {submitting ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM
