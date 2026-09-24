import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Modal, Spin } from 'antd'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { leasesApi, propertiesApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import type { Lease, LeaseStatus, Property } from '@/types'
import './leases.css'

type DisplayStatus = 'active' | 'expiring' | 'expired' | 'terminated'

const displayStatusMeta: Record<DisplayStatus, { label: string; badge: string; dot: string }> = {
  active: { label: 'leases.stActive', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  expiring: { label: 'leases.stExpiring', badge: 'rent-badge--warning', dot: 'var(--state-warning)' },
  expired: { label: 'leases.stExpired', badge: 'rent-badge--error', dot: 'var(--state-error)' },
  terminated: { label: 'leases.stTerminated', badge: 'rent-badge--neutral', dot: 'var(--rent-ink-3)' },
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
  propertyType?: string
  dateFrom?: string
  dateTo?: string
}

// 房源类型取值与后端 Property.property_type 对齐（apartment/house/condo/commercial）
const PROPERTY_TYPE_OPTIONS = [
  { value: 'apartment', label: 'leases.typeApartment' },
  { value: 'house', label: 'leases.typeHouse' },
  { value: 'condo', label: 'leases.typeCondo' },
  { value: 'commercial', label: 'leases.typeCommercial' },
]

// 押金状态取值（后端 deposit_status：held/refunded/forfeited）
const depositStatusLabel: Record<string, string> = {
  held: 'leases.depHeld',
  refunded: 'leases.depRefunded',
  forfeited: 'leases.depForfeited',
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
  const { t } = useTranslation()
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
  const [detailLease, setDetailLease] = useState<Lease | null>(null)
  const [exporting, setExporting] = useState(false)

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
        property_type: queryParams.propertyType,
        date_from: queryParams.dateFrom,
        date_to: queryParams.dateTo,
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('leases.errFetch'))
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

  // 顶部统计卡片数值（按真实数据口径展示）
  const statTotal = total
  const statActive = statusCounts.active
  const statExpiring = statusCounts.expiring
  const statTerminated = statusCounts.terminated

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

  // 房源 / 租客显示名：列表接口已返回 property_name / tenant_name，缺失时用已加载房源兜底
  const propertyNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of properties) {
      map[String(p.id)] = p.room_number || p.address || String(p.id)
    }
    return map
  }, [properties])

  const resolvePropertyName = (lease: Lease) =>
    (lease as any).property_name || propertyNameMap[String(lease.property_id)] || '-'
  const resolveTenantName = (lease: Lease) => (lease as any).tenant_name || '-'

  // 筛选：把「合同类型 / 起始日区间」草稿条件提交给服务端（状态下拉为即时筛选）
  const handleApplyFilters = () => {
    if (filterStart && filterEnd && filterStart > filterEnd) {
      message.warning(t('leases.warnDateRange'))
      return
    }
    setQueryParams((p) => ({
      ...p,
      propertyType: filterType || undefined,
      dateFrom: filterStart || undefined,
      dateTo: filterEnd || undefined,
      page: 1,
    }))
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      // 导出沿用当前筛选条件，避免「页面筛过、导出却是全量」
      await downloadReport(
        '/exports/leases',
        {
          status: queryParams.status,
          property_type: queryParams.propertyType,
          keyword: queryParams.keyword,
          date_from: queryParams.dateFrom,
          date_to: queryParams.dateTo,
        },
        `leases_${dayjs().format('YYYYMMDD')}.csv`,
      )
    } catch {
      message.error(t('leases.errExport'))
    } finally {
      setExporting(false)
    }
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
      message.error(t('leases.errSelectProperty'))
      return
    }
    if (!createForm.tenantName.trim()) {
      message.error(t('leases.errTenantName'))
      return
    }
    if (!createForm.tenantPhone.trim()) {
      message.error(t('leases.errTenantPhone'))
      return
    }
    if (!createForm.startDate || !createForm.endDate) {
      message.error(t('leases.errLeaseTerm'))
      return
    }
    if (!createForm.monthlyRent) {
      message.error(t('leases.errMonthlyRent'))
      return
    }
    if (!createForm.deposit) {
      message.error(t('leases.errDeposit'))
      return
    }
    try {
      setSubmitting(true)
      await leasesApi.create({
        property_id: createForm.propertyId,
        tenant_name: createForm.tenantName,
        tenant_phone: createForm.tenantPhone,
        start_date: createForm.startDate,
        end_date: createForm.endDate,
        monthly_rent: Number(createForm.monthlyRent),
        deposit_amount: Number(createForm.deposit),
      })
      message.success(t('leases.msgCreated'))
      setCreateOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('leases.errCreateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRenew = async () => {
    if (!currentLease) return
    if (!renewForm.startDate || !renewForm.endDate) {
      message.error(t('leases.errRenewTerm'))
      return
    }
    if (!renewForm.monthlyRent) {
      message.error(t('leases.errMonthlyRent'))
      return
    }
    try {
      setSubmitting(true)
      await leasesApi.renew(String(currentLease.id), {
        startDate: renewForm.startDate,
        endDate: renewForm.endDate,
        monthlyRent: Number(renewForm.monthlyRent),
      })
      message.success(t('leases.msgRenewed'))
      setRenewOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('leases.errRenewFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleTerminate = (record: Lease) => {
    Modal.confirm({
      title: t('leases.terminateTitle'),
      content: t('leases.terminateContent', { code: (record as any).code || record.id }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await leasesApi.terminate(String(record.id), {
            terminateDate: dayjs().format('YYYY-MM-DD'),
          })
          message.success(t('leases.msgTerminated'))
          fetchData()
        } catch (err: any) {
          message.error(err?.response?.data?.message || t('leases.errTerminateFailed'))
        }
      },
    })
  }

  // 详情弹窗的展示态：与列表徽章同一口径
  const detailMeta = detailLease
    ? displayStatusMeta[getDisplayStatus(detailLease)]
    : null

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('leases.title')}</h2>
          <p className="rent-page-header__subtitle">{t('leases.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button
            className="rent-btn rent-btn--secondary"
            type="button"
            onClick={handleExport}
            disabled={exporting}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? t('leases.exporting') : t('leases.btnExport')}
          </button>
          <button className="rent-btn rent-btn--primary" type="button" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('leases.btnNew')}
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
              <div className="rent-stat-card__label">{t('leases.statTotal')}</div>
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
              <div className="rent-stat-card__label">{t('leases.stActive')}</div>
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
              <div className="rent-stat-card__label">{t('leases.stExpiring')}</div>
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
              <div className="rent-stat-card__label">{t('leases.stTerminated')}</div>
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
              placeholder={t('leases.searchPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch((e.target as HTMLInputElement).value)
              }}
            />
          </div>
        </div>
        <select
          className="rent-form-select"
          style={{ width: 'auto' }}
          aria-label={t('leases.ariaStatus')}
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value)
            handleStatusChange(e.target.value || undefined)
          }}
        >
          <option value="">{t('leases.optAllStatus')}</option>
          <option value="active">{t('leases.stActive')}</option>
          <option value="expiring">{t('leases.stExpiring')}</option>
          <option value="expired">{t('leases.stExpired')}</option>
          <option value="terminated">{t('leases.stTerminated')}</option>
        </select>
        <select
          className="rent-form-select"
          style={{ width: 'auto' }}
          aria-label={t('leases.ariaType')}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">{t('leases.optAllTypes')}</option>
          {PROPERTY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
          ))}
        </select>
        <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label={t('leases.ariaStart')}
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
          />
          <span className="rent-text-muted rent-text-sm">{t('leases.to')}</span>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label={t('leases.ariaEnd')}
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
          />
        </div>
        <button
          className="rent-btn rent-btn--secondary rent-btn--sm"
          type="button"
          onClick={handleApplyFilters}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {t('leases.btnFilter')}
        </button>
        <button
          className="rent-btn rent-btn--ghost rent-btn--sm"
          type="button"
          onClick={() => {
            setFilterStatus('')
            setFilterType('')
            setFilterStart('')
            setFilterEnd('')
            handleStatusChange(undefined)
            handleSearch('')
            setQueryParams((p) => ({
              ...p,
              propertyType: undefined,
              dateFrom: undefined,
              dateTo: undefined,
              page: 1,
            }))
          }}
        >
          {t('common.reset')}
        </button>
      </div>

      {/* Leases Table */}
      <div className="rent-card">
        {loading ? (
          <div className="rent-empty">
            <Spin size="small" style={{ marginRight: 8 }} />
            <span className="rent-text-muted">{t('common.loading')}</span>
          </div>
        ) : (
          <>
            <div className="rent-table-wrap leases-table-wrap">
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('leases.thCode')}</th>
                    <th>{t('leases.thProperty')}</th>
                    <th>{t('leases.thTenant')}</th>
                    <th>{t('leases.thStart')}</th>
                    <th>{t('leases.thEnd')}</th>
                    <th className="rent-money">{t('leases.thMonthlyRent')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.map((lease) => {
                    const ds = getDisplayStatus(lease)
                    const meta = displayStatusMeta[ds]
                    const code = (lease as any).code || `LC-${lease.id}`
                    const propName = resolvePropertyName(lease)
                    const tenantName = resolveTenantName(lease)
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
                            {t(meta.label)}
                          </span>
                        </td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              type="button"
                              onClick={() => setDetailLease(lease)}
                            >
                              {t('leases.btnView')}
                            </button>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              type="button"
                              onClick={() => openRenew(lease)}
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              type="button"
                              style={{ color: 'var(--state-error)' }}
                              disabled={lease.status === 'terminated'}
                              onClick={() => handleTerminate(lease)}
                            >
                              {t('leases.btnTerminate')}
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
                <span className="rent-pagination__info">{t('leases.pageInfo', { count: statTotal })}</span>
                <button
                  className="rent-pagination__btn"
                  aria-label={t('leases.ariaPrev')}
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
                  aria-label={t('leases.ariaNext')}
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
              <h3 className="rent-card__title">{t('leases.modalCreateTitle')}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label={t('common.close')} onClick={() => setCreateOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelProperty')}</label>
                  <select
                    className="rent-form-select"
                    value={createForm.propertyId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, propertyId: e.target.value }))}
                  >
                    <option value="">{t('leases.optSelectProperty')}</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.room_number || `#${p.id}`}</option>
                    ))}
                  </select>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelTenantName')}</label>
                  <input
                    className="rent-form-input"
                    value={createForm.tenantName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, tenantName: e.target.value }))}
                    placeholder={t('leases.placeholderTenantName')}
                  />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelTenantPhone')}</label>
                  <input
                    className="rent-form-input"
                    value={createForm.tenantPhone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, tenantPhone: e.target.value }))}
                    placeholder={t('leases.placeholderTenantPhone')}
                  />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelTerm')}</label>
                  <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                    <input
                      type="date"
                      className="rent-form-input"
                      value={createForm.startDate}
                      onChange={(e) => setCreateForm((f) => ({ ...f, startDate: e.target.value }))}
                    />
                    <span className="rent-text-muted rent-text-sm">{t('leases.to')}</span>
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
                  <label className="rent-form-label">{t('leases.labelMonthlyRent')}</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min={0}
                    value={createForm.monthlyRent}
                    onChange={(e) => setCreateForm((f) => ({ ...f, monthlyRent: e.target.value }))}
                    placeholder={t('leases.placeholderMonthlyRent')}
                  />
                </div>
                <div className="rent-form-group" style={{ marginBottom: 0 }}>
                  <label className="rent-form-label">{t('leases.labelDeposit')}</label>
                  <input
                    className="rent-form-input"
                    type="number"
                    min={0}
                    value={createForm.deposit}
                    onChange={(e) => setCreateForm((f) => ({ ...f, deposit: e.target.value }))}
                    placeholder={t('leases.placeholderDeposit')}
                  />
                </div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? t('common.submitting') : t('common.confirm')}
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
              <h3 className="rent-card__title">{t('leases.modalRenewTitle')}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label={t('common.close')} onClick={() => setRenewOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-group">
                <label className="rent-form-label">{t('leases.labelNewTerm')}</label>
                <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                  <input
                    type="date"
                    className="rent-form-input"
                    value={renewForm.startDate}
                    onChange={(e) => setRenewForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                  <span className="rent-text-muted rent-text-sm">{t('leases.to')}</span>
                  <input
                    type="date"
                    className="rent-form-input"
                    value={renewForm.endDate}
                    onChange={(e) => setRenewForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">{t('leases.labelNewMonthlyRent')}</label>
                <input
                  className="rent-form-input"
                  type="number"
                  min={0}
                  value={renewForm.monthlyRent}
                  onChange={(e) => setRenewForm((f) => ({ ...f, monthlyRent: e.target.value }))}
                  placeholder={t('leases.placeholderMonthlyRent')}
                />
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setRenewOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleRenew} disabled={submitting}>
                {submitting ? t('common.submitting') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal：只读展示合同全量信息 */}
      {detailLease && detailMeta && (
        <div className="rent-modal-backdrop" onClick={() => setDetailLease(null)}>
          <div
            className="rent-modal leases-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 600 }}
          >
            <div className="rent-modal__header">
              <h3 className="rent-card__title">{t('leases.modalDetailTitle')}</h3>
              <button
                className="rent-btn rent-btn--ghost rent-btn--sm"
                type="button"
                aria-label={t('common.close')}
                onClick={() => setDetailLease(null)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelCode')}</label>
                  <div className="rent-mono">
                    {(detailLease as any).code || `LC-${detailLease.id}`}
                  </div>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelStatus')}</label>
                  <div>
                    <span className={`rent-badge ${detailMeta.badge}`}>
                      <span className="rent-badge--dot" style={{ background: detailMeta.dot }} />
                      {t(detailMeta.label)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelPropertyPlain')}</label>
                  <div>{resolvePropertyName(detailLease)}</div>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelTenantPlain')}</label>
                  <div>{resolveTenantName(detailLease)}</div>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelStartPlain')}</label>
                  <div>{dayjs(detailLease.start_date).format('YYYY-MM-DD')}</div>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelEndPlain')}</label>
                  <div>{dayjs(detailLease.end_date).format('YYYY-MM-DD')}</div>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelMonthlyRentPlain')}</label>
                  <div className="rent-num">
                    {detailLease.currency || '฿'} {Number(detailLease.monthly_rent || 0).toLocaleString()}
                  </div>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('leases.labelDepositPlain')}</label>
                  <div className="rent-num">
                    {detailLease.currency || '฿'} {Number(detailLease.deposit_amount || 0).toLocaleString()}
                    <span className="rent-text-muted rent-text-sm" style={{ marginLeft: 8 }}>
                      {depositStatusLabel[detailLease.deposit_status] ? t(depositStatusLabel[detailLease.deposit_status]) : detailLease.deposit_status || '-'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('leases.labelContractFile')}</label>
                <div>
                  {detailLease.contract_url ? (
                    <a href={detailLease.contract_url} target="_blank" rel="noreferrer">
                      {detailLease.contract_url}
                    </a>
                  ) : (
                    <span className="rent-text-muted">{t('leases.notUploaded')}</span>
                  )}
                </div>
              </div>
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">{t('leases.labelSpecialTerms')}</label>
                <div>{detailLease.special_terms || <span className="rent-text-muted">{t('leases.none')}</span>}</div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button
                className="rent-btn rent-btn--secondary"
                type="button"
                onClick={() => setDetailLease(null)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Leases
