import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { convertCurrency } from '@/lib/money'
import './dashboard.css'

interface OwnerProperty {
  id: string
  room_number?: string
  project_id?: string
  project_name?: string
  name?: string
  status: string
  monthly_rent?: number
  sale_price?: number
  currency?: string
  address?: string
  city?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  tenant_name?: string
  [key: string]: any
}

interface IncomeSummary {
  total_income?: number
  monthly_income?: number
  pending_amount?: number
  [key: string]: any
}

interface OwnerPayment {
  id: string
  amount: number
  currency: string
  status: string
  paid_at?: string
  due_date?: string
  tenant_name?: string
  property_name?: string
  [key: string]: any
}

interface OwnerLease {
  id: string
  property_id?: string
  property_name?: string
  tenant_id?: string
  tenant_name?: string
  end_date?: string
  monthly_rent?: number
  currency?: string
  status?: string
  [key: string]: any
}

interface RecentIncome {
  name: string
  date: string
  tenant: string
  amount: number
}

const fmtRM = (v: number) => `RM ${Math.round(convertCurrency(v, 'RM')).toLocaleString()}`
const fmtThb = (v: number) => `฿ ${Math.round(Number(v || 0)).toLocaleString()}`

const Dashboard = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<OwnerProperty[]>([])
  const [income, setIncome] = useState<IncomeSummary>({
    total_income: 0,
    monthly_income: 0,
    pending_amount: 0,
  })
  const [payments, setPayments] = useState<OwnerPayment[]>([])
  const [leases, setLeases] = useState<OwnerLease[]>([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [propertiesRes, incomeRes, paymentsRes, leasesRes] =
        await Promise.all([
          api.get('/owners/me/properties').catch(() => ({ data: { items: [] } })),
          api.get('/owners/me/income').catch(() => ({ data: {} })),
          api.get('/payments/me').catch(() => ({ data: { items: [] } })),
          api.get('/leases').catch(() => ({ data: { items: [] } })),
        ])

      const pPayload = propertiesRes.data?.data ?? propertiesRes.data
      setProperties(pPayload?.items ?? [])

      const iPayload = incomeRes.data?.data ?? incomeRes.data
      if (Array.isArray(iPayload?.items)) {
        const sum = iPayload.items.reduce(
          (acc: IncomeSummary, it: any) => {
            acc.total_income = Number(acc.total_income || 0) + Number(it.amount || 0)
            return acc
          },
          { total_income: 0, monthly_income: 0, pending_amount: 0 },
        )
        setIncome(sum)
      } else {
        setIncome({
          total_income: Number(iPayload?.total_income ?? 0),
          monthly_income: Number(iPayload?.monthly_income ?? 0),
          pending_amount: Number(iPayload?.pending_amount ?? 0),
        })
      }

      const payPayload = paymentsRes.data?.data ?? paymentsRes.data
      setPayments(payPayload?.items ?? [])

      const lPayload = leasesRes.data?.data ?? leasesRes.data
      setLeases(lPayload?.items ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取业主面板数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const statusCount = useMemo(() => {
    const count = { vacant: 0, rented: 0, for_sale: 0 }
    properties.forEach((p) => {
      const s = String(p.status || '').toLowerCase()
      if (s === 'vacant' || s === 'available') count.vacant += 1
      else if (s === 'for_sale' || s === 'on_sale' || s === 'sale') count.for_sale += 1
      else if (s === 'rented' || s === 'active') count.rented += 1
    })
    return count
  }, [properties])

  // 即将到期租约（60 天内）
  const expiringLeases = useMemo(() => {
    return leases
      .filter((l) => l.end_date)
      .filter((l) => {
        const days = dayjs(l.end_date).diff(dayjs(), 'day')
        return days >= 0 && days <= 60
      })
      .sort((a, b) => dayjs(a.end_date).valueOf() - dayjs(b.end_date).valueOf())
  }, [leases])

  // 待收租金（预警卡）
  const pendingPayments = useMemo(
    () => payments.filter((p) => ['pending', 'overdue'].includes(String(p.status || '').toLowerCase())),
    [payments],
  )

  // 最近入账
  const recentIncomes: RecentIncome[] = useMemo(
    () =>
      payments.slice(0, 4).map((p) => ({
        name: p.property_name || p.property_id || '—',
        date: p.paid_at || p.due_date ? dayjs(p.paid_at || p.due_date).format('YYYY-MM-DD') : '-',
        tenant: p.tenant_name || '-',
        amount: Number(p.amount || 0),
      })),
    [payments],
  )

  const totalProps = properties.length
  const rentedCount = statusCount.rented
  const vacantCount = statusCount.vacant
  const occupancyPct = totalProps > 0 ? Math.round((rentedCount / totalProps) * 100) : 0

  // 收益总览：本月应收 / 已收 / 待收
  const monthlyIncome = Number(income.monthly_income || 0)
  const pendingAmount = Number(income.pending_amount || 0)
  const collectedIncome = Math.max(monthlyIncome - pendingAmount, 0)
  const collectedRate = monthlyIncome > 0 ? Math.round((collectedIncome / monthlyIncome) * 100) : 0

  // 预警卡文案
  const pendingCount = pendingPayments.length
  const pendingDetail = `${pendingPayments
    .map((p) => `${p.property_name || p.property_id || '—'} ${fmtRM(Number(p.amount || 0))}`)
    .join(' · ')}，合计 ${fmtRM(pendingPayments.reduce((s, p) => s + Number(p.amount || 0), 0))}`

  // 资产概览：在租 / 在售 房源卡
  const rentedProp = properties.find((p) => {
    const s = String(p.status || '').toLowerCase()
    return s === 'rented' || s === 'active'
  })
  const saleProp = properties.find((p) => {
    const s = String(p.status || '').toLowerCase()
    return s === 'for_sale' || s === 'on_sale' || s === 'sale'
  })

  const propTitle = (p: OwnerProperty) =>
    p.name || (p.project_name ? `${p.project_name} · ${p.room_number}` : p.room_number || p.address || '—')

  const propMeta = (p: OwnerProperty) => {
    const dims = `${p.bedrooms ?? 0}室${p.bathrooms ?? 0}厅 ${p.size_sqm || 0}㎡`
    const s = String(p.status || '').toLowerCase()
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale') return `${dims} · 在售`
    return `${dims} · ${p.tenant_name || '-'}`
  }

  // 待处理事项：卖房委托待确认估价
  const saleTodoDesc = saleProp
    ? `${propTitle(saleProp)} 预估价 ${fmtThb(Number(saleProp.sale_price || 0) * 0.97)} - ${fmtThb(
        Number(saleProp.sale_price || 0) * 1.03,
      )}`
    : null

  const expiring = expiringLeases[0]
  const expiringDays = expiring?.end_date ? Math.max(dayjs(expiring.end_date).diff(dayjs(), 'day'), 0) : 0
  const expiringEnd = expiring?.end_date ? dayjs(expiring.end_date).format('YYYY-MM-DD') : '-'

  const todoCount = (saleProp ? 1 : 0) + (expiringLeases.length ? 1 : 0)

  return (
    <div className="rent-main">
      {loading && (
        <div className="owner-loading-bar">
          <Spin size="small" style={{ marginRight: 8 }} />
          数据加载中…
        </div>
      )}

      {/* ===== Page Header（对齐其他端：rent-page-header 页头） ===== */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">业主工作台</h2>
          <p className="rent-page-header__subtitle">
            {dayjs().format('YYYY年M月D日')} · 轻松管理名下房源与租金收益
          </p>
        </div>
      </div>

      {/* ===== 双业务入口：委托出租 / 委托出售 ===== */}
      <div className="rent-v17-dual rent-mb-5">
        <button type="button" className="rent-v17-entry rent-v17-entry--rent" onClick={() => navigate('/owner/services')}>
          <div className="rent-v17-entry__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rent-v17-entry__title">委托出租</div>
            <div className="rent-v17-entry__sub">托管出租 · 省心收租</div>
          </div>
          <span className="rent-v17-entry__arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </span>
        </button>
        <button type="button" className="rent-v17-entry rent-v17-entry--sale" onClick={() => navigate('/owner/services')}>
          <div className="rent-v17-entry__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rent-v17-entry__title">委托出售</div>
            <div className="rent-v17-entry__sub">在线估价 · 挂牌成交</div>
          </div>
          <span className="rent-v17-entry__arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </span>
        </button>
      </div>

      {/* ===== 预警卡：待收租金（置顶，有数据才展示） ===== */}
      {pendingCount > 0 && (
        <div className="rent-card rent-warn-banner rent-mb-5">
          <div className="rent-card__body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="rent-warn-banner__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
              </div>
              <div>
                <div className="rent-warn-banner__title">{pendingCount} 笔租金待确认</div>
                <div className="rent-warn-banner__desc">{pendingDetail}</div>
              </div>
            </div>
            <button type="button" className="rent-btn rent-btn--primary" onClick={() => navigate('/owner/income')}>
              去确认
            </button>
          </div>
        </div>
      )}

      {/* ===== 收益总览 + 待处理事项 ===== */}
      <div className="rent-grid rent-grid--2 rent-mb-5">
        {/* 收益总览 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">收益总览</h3>
            <span className="rent-badge rent-badge--success">本月</span>
          </div>
          <div className="rent-card__body">
            <div className="rent-text-sm rent-text-muted rent-mb-4">本月合计（租金 + 售房款）</div>
            <div className="rent-grid rent-grid--3" style={{ gap: 12 }}>
              <div>
                <div className="rent-text-sm rent-text-muted">本月应收</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--rent-ink)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {fmtRM(monthlyIncome)}
                </div>
              </div>
              <div>
                <div className="rent-text-sm rent-text-muted">已收</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--state-success)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {fmtRM(collectedIncome)}
                </div>
              </div>
              <div>
                <div className="rent-text-sm rent-text-muted">待收</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--state-warning)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {fmtRM(pendingAmount)}
                </div>
              </div>
            </div>
            <div className="rent-progress rent-mt-4">
              <div className="rent-progress__bar" style={{ width: `${collectedRate}%` }} />
            </div>
            <div className="rent-flex rent-flex--between rent-mt-2">
              <span className="rent-text-sm rent-text-muted">本月收款进度</span>
              <span className="rent-text-sm rent-text-bold" style={{ color: 'var(--rent-primary)' }}>已收 {collectedRate}%</span>
            </div>
          </div>
        </div>

        {/* 待处理事项 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">待处理事项</h3>
            <span className="rent-badge rent-badge--warning">{todoCount} 项</span>
          </div>
          <div className="rent-card__body rent-flex rent-flex--col rent-gap-4">
            {todoCount === 0 && (
              <div className="rent-empty" style={{ padding: '28px 0' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待处理事项" />
              </div>
            )}

            {/* 卖房委托：估价待确认 */}
            {saleTodoDesc && (
              <div className="rent-v17-todo-sale">
                <div className="rent-v17-todo-sale__icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rent-text-bold">卖房委托 · 估价待确认</div>
                  <div className="rent-text-sm rent-text-muted">{saleTodoDesc}</div>
                </div>
                <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => navigate('/owner/services')}>
                  去确认
                </button>
              </div>
            )}

            {/* 合同即将到期高亮提醒 */}
            {expiring && (
              <div className="rent-todo-lease">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--state-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rent-text-bold">{expiring.property_name || expiring.property_id} 租约 {expiringDays} 天后到期</div>
                  <div className="rent-text-sm rent-text-muted">租客：{expiring.tenant_name || '-'} · 到期日期 {expiringEnd}</div>
                </div>
                <button type="button" className="rent-btn rent-btn--secondary rent-btn--sm">{t('ownerHome.renew')}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== 资产概览 + 最近入账 ===== */}
      <div className="rent-grid rent-grid--2">
        {/* 资产概览 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">资产概览</h3>
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/owner/properties')}>
              查看全部
            </button>
          </div>
          <div className="rent-card__body" style={{ padding: 12 }}>
            <div className="rent-grid rent-grid--3" style={{ gap: 12 }}>
              <div className="rent-stat-card">
                <div className="rent-stat-card__label">名下房源</div>
                <div className="rent-stat-card__value">
                  {totalProps} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>套</span>
                </div>
                <div className="rent-stat-card__delta">{statusCount.for_sale} 套在售</div>
              </div>
              <div className="rent-stat-card">
                <div className="rent-stat-card__label">在租房源</div>
                <div className="rent-stat-card__value">
                  {rentedCount} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>套</span>
                </div>
                <div className="rent-stat-card__delta rent-stat-card__delta--up">占比 {occupancyPct}%</div>
              </div>
              <div className="rent-stat-card">
                <div className="rent-stat-card__label">空置房源</div>
                <div className="rent-stat-card__value">
                  {vacantCount} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>套</span>
                </div>
                <div className="rent-stat-card__delta">待挂牌出租</div>
              </div>
            </div>
            <hr className="rent-divider" />
            {/* 我的房源卡片：在租 / 在售 双状态 */}
            <div className="rent-v17-dual" style={{ marginTop: 12 }}>
              {rentedProp && (
                <div className="rent-v17-prop rent-v17-prop--rent" style={{ cursor: 'pointer', textDecoration: 'none' }} onClick={() => navigate(`/properties/detail/${rentedProp.id}`)}>
                  <div className="rent-v17-prop__thumb">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>
                  </div>
                  <div className="rent-v17-prop__body">
                    <div className="rent-flex rent-flex--between" style={{ gap: 8 }}>
                      <div className="rent-v17-prop__name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{propTitle(rentedProp)}</div>
                      <span className="rent-badge rent-badge--success" style={{ flexShrink: 0 }}>在租</span>
                    </div>
                    <div className="rent-v17-prop__meta">{propMeta(rentedProp)}</div>
                    <div className="rent-v17-prop__price">
                      {fmtRM(rentedProp.monthly_rent || 0)}
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--rent-ink-3)' }}>{t('browse.rentUnit')}</span>
                    </div>
                  </div>
                </div>
              )}
              {saleProp && (
                <div className="rent-v17-prop rent-v17-prop--sale" style={{ cursor: 'pointer', textDecoration: 'none' }} onClick={() => navigate('/owner/services')}>
                  <div className="rent-v17-prop__thumb">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                  </div>
                  <div className="rent-v17-prop__body">
                    <div className="rent-flex rent-flex--between" style={{ gap: 8 }}>
                      <div className="rent-v17-prop__name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{propTitle(saleProp)}</div>
                      <span className="rent-badge rent-badge--warning" style={{ flexShrink: 0 }}>在售</span>
                    </div>
                    <div className="rent-v17-prop__meta">{propMeta(saleProp)}</div>
                    <div className="rent-v17-prop__price">{fmtThb(saleProp.sale_price || 0)}</div>
                  </div>
                </div>
              )}
            </div>
            {!rentedProp && !saleProp && (
              <div className="rent-empty" style={{ padding: '20px 0' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无房源数据" />
              </div>
            )}
          </div>
        </div>

        {/* 最近入账 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('browse.recentIncome')}</h3>
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/owner/income')}>
              查看全部记录
            </button>
          </div>
          <div className="rent-card__body" style={{ padding: '0 20px' }}>
            {recentIncomes.length === 0 ? (
              <div className="rent-empty" style={{ padding: '28px 0' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无入账记录" />
              </div>
            ) : (
              recentIncomes.map((r, i) => (
                <div className="rent-income-row" key={`${r.name}-${i}`}>
                  <div>
                    <div className="rent-text-bold">{r.name}</div>
                    <div className="rent-text-sm rent-text-muted">{r.date} · {r.tenant}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="rent-text-bold" style={{ color: 'var(--state-success)', fontVariantNumeric: 'tabular-nums' }}>+{fmtRM(r.amount)}</div>
                    <span className="rent-badge rent-badge--success" style={{ marginTop: 4 }}>已到账</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard