import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message, Spin } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { chatApi, employeesApi, leadsApi } from '@/services/api'
import type { Lead, LeadStatus } from '@/types'
import './crm.css'

/* ===== 设计稿常量 ===== */
type KanbanColumnKey = 'new' | 'contacted' | 'viewed' | 'negotiating' | 'closed'

const KANBAN_COLUMNS: { key: KanbanColumnKey; labelKey: string; color: string }[] = [
  { key: 'new', labelKey: 'crm.stageNew', color: 'var(--rent-primary)' },
  { key: 'contacted', labelKey: 'crm.stageContacted', color: 'var(--state-yellow)' },
  { key: 'viewed', labelKey: 'crm.stageViewed', color: 'var(--state-orange)' },
  { key: 'negotiating', labelKey: 'crm.stageNegotiating', color: 'var(--state-purple)' },
  { key: 'closed', labelKey: 'crm.stageClosed', color: 'var(--state-success)' },
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

/** 后端 LeadStage 枚举的真实取值；stageLabelMap 中的 new/following/converted/lost
 *  后端不认（提交即 422），故下拉选项只列这 5 个可写值 */
const LEAD_STAGE_VALUES: LeadStatus[] = [
  'inquiring',
  'viewing_scheduled',
  'negotiating',
  'pending_contract',
  'closed',
]

const STAGE_OPTIONS = LEAD_STAGE_VALUES.map((value) => ({ value, label: stageLabelMap[value] }))

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

/** 卡片右上角徽标配色：后端线索没有 property_type，这里按真实「来源」渠道着色 */
const sourceBadge = (source?: string): string => {
  if (!source) return 'rent-badge--info'
  const s = source.toLowerCase()
  if (source.includes('别墅') || s.includes('villa')) return 'rent-badge--primary'
  if (source.includes('商铺') || s.includes('shop')) return 'rent-badge--warning'
  return 'rent-badge--info'
}

interface QueryParams {
  page: number
  pageSize: number
  /** 后端筛选参数名为 stage（不是 status），此前传错字段导致筛选静默失效 */
  stage?: LeadStatus
  keyword?: string
}

/* ===== CSV 批量导入 ===== */
interface ImportRow {
  name: string
  nationality?: string
  phone?: string
  email?: string
  budget_max?: number
  source?: string
  notes?: string
}

/** 表头别名（中英文均可）→ 目标字段 */
const CSV_HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  name: ['name', '姓名', '客户姓名', '名称'],
  nationality: ['nationality', '国籍'],
  phone: ['phone', 'tel', '电话', '手机号', '手机'],
  email: ['email', '邮箱', '电子邮箱'],
  budget_max: ['budget_max', 'budget', '预算', '预算上限'],
  source: ['source', '来源', '渠道'],
  notes: ['notes', 'note', '备注', '说明'],
}

/** 无表头时的列顺序约定 */
const CSV_DEFAULT_ORDER: (keyof ImportRow)[] = ['name', 'nationality', 'phone', 'email', 'budget_max', 'source', 'notes']

/** 解析单行 CSV（支持双引号包裹字段，含逗号与转义引号） */
const parseCsvLine = (line: string): string[] => {
  const cells: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

/** CSV 文本 → 线索创建入参（无姓名的行跳过） */
const buildImportPayloads = (text: string): ImportRow[] => {
  const rows = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(parseCsvLine)
  if (rows.length === 0) return []

  const aliasLookup: Record<string, keyof ImportRow> = {}
  ;(Object.keys(CSV_HEADER_ALIASES) as (keyof ImportRow)[]).forEach((field) => {
    CSV_HEADER_ALIASES[field].forEach((alias) => {
      aliasLookup[alias.toLowerCase()] = field
    })
  })

  const head = rows[0].map((c) => c.toLowerCase())
  const hasHeader = head.some((c) => !!aliasLookup[c])
  const body = hasHeader ? rows.slice(1) : rows
  const order: (keyof ImportRow | undefined)[] = hasHeader ? head.map((c) => aliasLookup[c]) : CSV_DEFAULT_ORDER

  const payloads: ImportRow[] = []
  for (const cells of body) {
    const record: Partial<Record<keyof ImportRow, string | number>> = {}
    order.forEach((field, idx) => {
      if (!field) return
      const value = (cells[idx] ?? '').trim()
      if (!value) return
      record[field] = field === 'budget_max' ? Number(value.replace(/[^\d.]/g, '')) || undefined : value
    })
    const name = String(record.name ?? '').trim()
    if (!name) continue
    payloads.push({ ...record, name } as ImportRow)
  }
  return payloads
}

interface CreateFormValues {
  id?: string
  name: string
  nationality: string
  phone: string
  email: string
  budget_max: string
  assigned_to: string
  source: string
  stage: LeadStatus | ''
  requirement: string
  notes: string
}

const emptyCreateForm: CreateFormValues = {
  id: undefined,
  name: '',
  nationality: '',
  phone: '',
  email: '',
  budget_max: '',
  assigned_to: '',
  source: '',
  stage: 'new',
  requirement: '',
  notes: '',
}

const CRM = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
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
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  // 员工目录：assigned_to 存的是 employees.id，表单与列表都需要展示真实姓名
  const [employeeOptions, setEmployeeOptions] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    employeesApi
      .directory()
      .then((res) => {
        const payload = res.data?.data ?? res.data
        const items: any[] = payload?.items ?? []
        setEmployeeOptions(
          items.map((e) => ({
            id: String(e.id),
            name: e.full_name || e.employee_no || String(e.id),
          })),
        )
      })
      .catch(() => {
        // 目录不可用时保持空列表，表单退化为「未分配」
      })
  }, [])

  const employeeNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    employeeOptions.forEach((e) => {
      map[e.id] = e.name
    })
    return map
  }, [employeeOptions])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await leadsApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        stage: queryParams.stage,
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
    setQueryParams((p) => ({ ...p, stage: value, page: 1 }))
  }

  const openCreate = () => {
    setCreateForm(emptyCreateForm)
    setModalOpen(true)
  }

  const openEdit = (lead: Lead) => {
    setCreateForm({
      id: String(lead.id),
      name: lead.name,
      nationality: lead.nationality || '',
      phone: lead.phone || '',
      email: lead.email || '',
      budget_max: lead.budget_max != null ? String(lead.budget_max) : '',
      assigned_to: lead.assigned_to || '',
      source: lead.source || '',
      stage: (lead.stage as LeadStatus) || 'new',
      requirement: lead.requirement || '',
      notes: lead.notes || '',
    })
    setModalOpen(true)
  }

  const openEditStage = (record: Lead) => {
    setCurrentLead(record)
    setStageValue(record.stage as LeadStatus)
    setStageModalOpen(true)
  }

  const handleSubmit = async () => {
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
      const payload = {
        name: createForm.name,
        nationality: createForm.nationality,
        phone: createForm.phone,
        email: createForm.email,
        budget_max: createForm.budget_max ? Number(createForm.budget_max) : undefined,
        // assigned_to 是 employees.id（UUID），空值必须省略，否则空串会被 422 拒绝
        assigned_to: createForm.assigned_to || undefined,
        source: createForm.source,
        stage: createForm.stage || undefined,
        requirement: createForm.requirement,
        notes: createForm.notes,
      } as any
      if (createForm.id) {
        await leadsApi.update(createForm.id, payload)
        message.success('更新成功')
      } else {
        await leadsApi.create(payload)
        message.success('创建成功')
      }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (lead: Lead) => {
    if (!window.confirm(`确定删除客户「${lead.name}」？该操作不可恢复。`)) return
    try {
      await leadsApi.delete(String(lead.id))
      message.success('已删除')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败')
    }
  }

  // 联系客户：直接拨打
  const handleCall = (lead: Lead) => {
    if (!lead.phone) {
      message.warning('该客户未留电话')
      return
    }
    window.location.href = `tel:${lead.phone.replace(/\s/g, '')}`
  }

  // 联系客户：Web 内发消息（按手机号/邮箱解析客户账号并创建会话）
  const handleChat = async (lead: Lead) => {
    const phone = (lead.phone || '').trim()
    const email = (lead.email || '').trim()
    if (!phone && !email) {
      message.warning('该客户未留电话/邮箱，无法发消息')
      return
    }
    try {
      const res = await chatApi.createConversation({
        title: lead.name || '客户咨询',
        ...(phone ? { participant_phones: [phone] } : {}),
        ...(email ? { participant_emails: [email] } : {}),
      })
      const conv = res.data?.data ?? res.data
      if (!conv?.id) throw new Error('会话创建失败')
      navigate(`/chat?id=${conv.id}`)
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.response?.data?.detail || '客户未注册账号，请先通过电话/邮箱联系')
    }
  }

  // 批量导入客户线索：解析 CSV 后逐条调用 POST /leads，统计成功/失败
  const handleImportFile = async (file?: File | null) => {
    if (!file) return
    setImporting(true)
    try {
      const payloads = buildImportPayloads(await file.text())
      if (payloads.length === 0) {
        message.warning('未解析到有效数据行，请确认 CSV 含「姓名」列')
        return
      }
      const results = await Promise.allSettled(payloads.map((row) => leadsApi.create(row)))
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.length - ok
      if (ok === 0) {
        const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        const reason = first?.reason?.response?.data?.detail || first?.reason?.response?.data?.message
        message.error(reason ? `导入失败：${reason}` : '导入失败，请检查文件内容')
        return
      }
      message.success(`导入成功 ${ok} 条${failed > 0 ? `，失败 ${failed} 条` : ''}`)
      fetchData()
    } catch {
      message.error('CSV 读取失败，请确认文件为 UTF-8 编码的 .csv')
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
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
    const isClosed = statusToColumn[lead.stage as LeadStatus] === 'closed'
    const dealPrice = (lead as any).deal_price
    // 卡片上的「跟进」用最后更新时间（后端无 follow_up 字段），负责人展示员工姓名而非 UUID
    const lastFollow = String((lead as any).updated_at || (lead as any).created_at || '').slice(0, 10)
    const agent = lead.assigned_to ? employeeNameMap[String(lead.assigned_to)] : undefined
    return (
      <div className="rent-kanban__card" key={lead.id} onClick={() => openEditStage(lead)}>
        <div className="rent-flex rent-flex--between rent-gap-2 rent-mb-2" style={{ alignItems: 'center' }}>
          <span className="rent-text-bold rent-text-sm">{lead.name}</span>
          {lead.source ? <span className={`rent-badge ${sourceBadge(lead.source)}`}>{lead.source}</span> : null}
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
          <span className="rent-caption rent-text-muted">跟进: {lastFollow || '未跟进'}</span>
          <div className="rent-avatar rent-avatar--sm" style={{ background: getAgentColor(agent) }} title={agent || '未分配'}>
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
          <input
            ref={importRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => handleImportFile(e.target.files?.[0])}
          />
          <button
            className="rent-btn rent-btn--secondary"
            disabled={importing}
            onClick={() => importRef.current?.click()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {importing ? '导入中...' : '导入'}
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
                      {t(col.labelKey)}
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
                  <div className={`rent-stat-card__delta${hasLeads ? ' rent-stat-card__delta--up' : ''}`} style={hasLeads ? undefined : { color: 'var(--rent-ink-3)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {hasLeads ? (
                        <>
                          <line x1="12" y1="19" x2="12" y2="5" />
                          <polyline points="5 12 12 5 19 12" />
                        </>
                      ) : (
                        <line x1="5" y1="12" x2="19" y2="12" />
                      )}
                    </svg>
                    转化率 = 已成交 / 线索总数
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
              value={queryParams.stage || ''}
              onChange={(e) => handleStageChange((e.target.value || undefined) as LeadStatus | undefined)}
            >
              <option value="">全部阶段</option>
              {STAGE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
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
                {displayData.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="rent-empty">{t('crm.emptyLeads')}</div>
                    </td>
                  </tr>
                ) : displayData.map((lead) => (
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
                    <td>{lead.assigned_to ? (employeeNameMap[String(lead.assigned_to)] || '—') : '-'}</td>
                    <td>
                      <div className="rent-flex rent-gap-2">
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleCall(lead)}>
                          电话
                        </button>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleChat(lead)}>
                          发消息
                        </button>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openEdit(lead)}>
                          编辑
                        </button>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openEditStage(lead)}>
                          阶段
                        </button>
                        <button
                          className="rent-btn rent-btn--ghost rent-btn--sm"
                          style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                          onClick={() => handleDelete(lead)}
                        >
                          删除
                        </button>
                      </div>
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
              aria-label="上一页"
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
              aria-label="下一页"
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
              <h3 className="rent-card__title">{createForm.id ? '编辑线索' : '新增线索'}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label="关闭" onClick={() => setModalOpen(false)}>
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
                  <select
                    className="rent-form-select"
                    value={createForm.assigned_to}
                    onChange={(e) => setCreateForm((f) => ({ ...f, assigned_to: e.target.value }))}
                  >
                    <option value="">未分配</option>
                    {employeeOptions.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
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
              <div className="rent-form-group">
                <label className="rent-form-label">阶段</label>
                <select
                  className="rent-form-select"
                  value={createForm.stage}
                  onChange={(e) => setCreateForm((f) => ({ ...f, stage: e.target.value as LeadStatus }))}
                >
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
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
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">备注</label>
                <textarea
                  className="rent-form-textarea"
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="跟进备注 / 补充信息"
                />
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setModalOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '提交中...' : createForm.id ? '保存' : '确定'}
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
              <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label="关闭" onClick={() => setStageModalOpen(false)}>
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
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
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
