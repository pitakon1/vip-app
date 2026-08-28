import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
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

// ===== 设计稿静态演示数据（API 数据为空时兜底） =====
const FALLBACK_PROPERTIES: OwnerProperty[] = [
  { id: 'p1', name: '阳光花园 A座12-3', address: '曼谷 · 素坤逸', status: 'rented', monthly_rent: 38000, bedrooms: 2, bathrooms: 2, size_sqm: 56, tenant_name: '王租客' },
  { id: 'p2', name: '海景公寓 05-08', address: '曼谷 · 湄南河畔', status: 'rented', monthly_rent: 45000, bedrooms: 2, bathrooms: 2, size_sqm: 64, tenant_name: 'Lim Wei' },
  { id: 'p3', name: '城中别墅 21号', address: '清迈 · 古城', status: 'rented', monthly_rent: 68000, bedrooms: 4, bathrooms: 3, size_sqm: 220, tenant_name: 'Tan Mei' },
  { id: 'p4', name: '绿洲苑 B座7-1', address: '曼谷 · 拉差达', status: 'rented', monthly_rent: 28000, bedrooms: 1, bathrooms: 1, size_sqm: 38, tenant_name: '陈小明' },
  { id: 'p5', name: '中心广场 18-2', address: '芭提雅 · 海滨', status: 'for_sale', sale_price: 3500000, bedrooms: 2, bathrooms: 2, size_sqm: 60 },
  { id: 'p6', name: '山景华庭 03-15', address: '普吉 · 卡伦', status: 'vacant', monthly_rent: 0, bedrooms: 2, bathrooms: 2, size_sqm: 52 },
  { id: 'p7', name: '金辉花园 09-6', address: '曼谷 · 辉煌', status: 'rented', monthly_rent: 31000, bedrooms: 2, bathrooms: 1, size_sqm: 46, tenant_name: 'Wong Kit' },
  { id: 'p8', name: '滨海名邸 12-A', address: '芭提雅 · 中天', status: 'for_sale', sale_price: 4200000, bedrooms: 3, bathrooms: 2, size_sqm: 88 },
]

const FALLBACK_EXPIRING: OwnerLease[] = [
  { id: 'l1', property_name: '阳光花园 A座12-3', tenant_name: '王租客', end_date: '2026-09-15', monthly_rent: 38000, status: 'active' },
  { id: 'l2', property_name: '海景公寓 05-08', tenant_name: 'Lim Wei', end_date: '2026-09-28', monthly_rent: 45000, status: 'active' },
  { id: 'l3', property_name: '中心广场 18-2', tenant_name: 'Lee Chong', end_date: '2026-10-01', monthly_rent: 32000, status: 'active' },
]

interface ActivityItem {
  type: 'success' | 'info' | 'warning' | 'neutral'
  title: string
  desc: string
  date: string
}

const FALLBACK_ACTIVITIES: ActivityItem[] = [
  { type: 'success', title: '收到租金 ฿ 38,000', desc: '王租客 · 阳光花园 A座12-3', date: '2026-08-03' },
  { type: 'info', title: '新租客签约', desc: 'Lim Wei · 海景公寓 05-08（为期 12 个月）', date: '2026-08-01' },
  { type: 'success', title: '维修申请已处理', desc: '绿洲苑 B座7-1 水管维修完成', date: '2026-07-28' },
  { type: 'success', title: '收到租金 ฿ 42,000', desc: 'Goh Swee · 滨海名邸 12-A', date: '2026-07-25' },
  { type: 'warning', title: '合同到期提醒', desc: '阳光花园 A座12-3 合同将于 9 月到期', date: '2026-07-22' },
  { type: 'neutral', title: '房源挂牌出售', desc: '中心广场 18-2 已上架在售', date: '2026-07-18' },
]

const GRADIENTS = [
  'linear-gradient(135deg, #4263eb 0%, #3b51d4 100%)',
  'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
  'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
]

const gradientFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) {
    h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  }
  return GRADIENTS[h % GRADIENTS.length]
}

const fmtMoney = (v: number) => `฿ ${Number(v || 0).toLocaleString()}`

const Dashboard = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
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

  // 渲染时使用的数据（空则用兜底）
  const displayProperties = properties.length ? properties : FALLBACK_PROPERTIES
  const displayExpiring = expiringLeases.length ? expiringLeases : FALLBACK_EXPIRING
  const totalProps = properties.length || FALLBACK_PROPERTIES.length
  const rentedCount = statusCount.rented || FALLBACK_PROPERTIES.filter((p) => p.status === 'rented').length
  const saleCount = statusCount.for_sale || FALLBACK_PROPERTIES.filter((p) => String(p.status).includes('sale')).length
  const monthlyIncome = income.monthly_income || 284000
  const totalIncome = income.total_income || 3128000
  const pendingAmount = income.pending_amount || 86000

  const activityList: ActivityItem[] = payments.length
    ? payments.slice(0, 6).map((p) => ({
        type: p.status === 'paid' || p.status === 'succeeded' ? 'success' : 'warning',
        title: `收到租金 ${fmtMoney(p.amount)}`,
        desc: `${p.tenant_name || '-'} · ${p.property_name || '-'}`,
        date: p.paid_at || p.due_date ? dayjs(p.paid_at || p.due_date).format('YYYY-MM-DD') : '-',
      }))
    : FALLBACK_ACTIVITIES

  const statusBadge = (p: OwnerProperty) => {
    const s = String(p.status || '').toLowerCase()
    if (s === 'rented' || s === 'active') {
      return <span className="ow17-badge ow17-badge--rent">{t('ownerHome.rentOut')}</span>
    }
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale') {
      return <span className="ow17-badge ow17-badge--sale">{t('ownerHome.forSale')}</span>
    }
    return <span className="ow17-badge ow17-badge--vacant">{t('ownerHome.vacant')}</span>
  }

  const propTitle = (p: OwnerProperty) =>
    p.name || (p.project_name ? `${p.project_name} · ${p.room_number}` : p.room_number || p.address || '—')

  const propPrice = (p: OwnerProperty) => {
    const s = String(p.status || '').toLowerCase()
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale') {
      return <span className="ow17-prop__price">{fmtMoney(p.sale_price || 0)}</span>
    }
    return (
      <span className="ow17-prop__price">
        {fmtMoney(p.monthly_rent || 0)}<span className="ow17-prop__unit">{t('browse.rentUnit')}</span>
      </span>
    )
  }

  const userName = user?.full_name || t('ownerHome.welcomeBack')

  return (
    <div className="rent-main ow17-main">
      {loading && <div className="owner-loading-bar">数据加载中…</div>}

      {/* ===== 欢迎横幅 + 双业务入口 ===== */}
      <div className="ow17-welcome">
        <div className="ow17-welcome__body">
          <div>
            <h2 className="ow17-welcome__title">{t('ownerHome.welcomeBack')}，{userName}</h2>
            <p className="ow17-welcome__sub">
              {t('ownerHome.welcomeSub', { count: totalProps, rented: rentedCount, sale: saleCount })}
            </p>
          </div>
          <div className="ow17-actions">
            <button type="button" className="ow17-action ow17-action--rent" onClick={() => navigate('/owner/services')}>
              <span className="ow17-action__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22" />
                </svg>
              </span>
              <span className="ow17-action__text">
                <span className="ow17-action__title">{t('browse.entrustRent')}</span>
                <span className="ow17-action__desc">{t('browse.entrustRentDesc')}</span>
              </span>
            </button>
            <button type="button" className="ow17-action ow17-action--sale" onClick={() => navigate('/owner/services')}>
              <span className="ow17-action__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 6 13.5 15.5 8.5 10.5 1 18" />
                  <path d="M17 6h6v6" />
                </svg>
              </span>
              <span className="ow17-action__text">
                <span className="ow17-action__title">{t('browse.entrustSale')}</span>
                <span className="ow17-action__desc">{t('browse.entrustSaleDesc')}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== KPI：资产 / 在租 / 预估月收入 / 待收款 ===== */}
      <div className="ow17-kpis">
        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('ownerHome.totalProps')}</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(66,99,235,0.1)', color: 'var(--rent-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">{totalProps}<span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}> {t('ownerHome.unit')}</span></div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 15 12 9 18 15" /></svg>
            {saleCount} {t('ownerHome.forSale')}
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('ownerHome.rentOut')}</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
          </div>
          <div className="rent-stat-card__value">{rentedCount}<span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}> {t('ownerHome.unit')}</span></div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">{t('ownerHome.monthActual')} {fmtMoney(monthlyIncome)}</div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('ownerHome.estIncome')}</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
          </div>
          <div className="rent-stat-card__value">{fmtMoney(totalIncome)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">{t('ownerHome.monthExpected')}</div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('browse.pendingReceive')}</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            </div>
          </div>
          <div className="rent-stat-card__value" style={{ color: 'var(--state-warning)' }}>{fmtMoney(pendingAmount)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--down" style={{ color: 'var(--state-warning)' }}>{t('ownerHome.withinDays')}</div>
        </div>
      </div>

      {/* ===== 我的房源 + 右侧（到期合同 / 到账动态） ===== */}
      <div className="ow17-grid">
        {/* 我的房源 卡片流 */}
        <div className="rent-card ow17-assets">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('ownerHome.myProperties')}</h3>
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/owner/properties')}>
              {t('browse.viewAll')}
            </button>
          </div>
          <div className="ow17-assets__body">
            {displayProperties.slice(0, 6).map((p) => (
              <div key={p.id} className="ow17-prop" onClick={() => navigate(`/properties/detail/${p.id}`)}>
                <div className="ow17-prop__img" style={{ background: gradientFor(String(p.id || p.room_number || '')) }}>
                  <span className="ow17-prop__badge">{statusBadge(p)}</span>
                </div>
                <div className="ow17-prop__body">
                  <div className="ow17-prop__name">{propTitle(p)}</div>
                  <div className="ow17-prop__addr">{p.address || p.city || '—'}</div>
                  <div className="ow17-prop__bottom">
                    {propPrice(p)}
                    <span className="ow17-prop__meta">{p.bedrooms ?? 0}卧 {p.bathrooms ?? 0}浴 · {p.size_sqm || 0}㎡</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧列 */}
        <div className="ow17-col">
          {/* 即将到期合同 */}
          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('ownerHome.expiringLeases')}</h3>
              <span className="rent-badge rent-badge--warning">{t('ownerHome.withinDays')}</span>
            </div>
            <div className="rent-card__body rent-flex rent-flex--col rent-gap-4">
              {displayExpiring.slice(0, 3).map((l) => {
                const end = l.end_date ? dayjs(l.end_date) : null
                const days = end ? end.diff(dayjs(), 'day') : 0
                return (
                  <div className="owner-expiring-card" key={l.id}>
                    <div className="rent-flex rent-flex--between rent-mb-2">
                      <span className="rent-text-bold">{l.property_name || l.property_id || '-'}</span>
                      <span className="rent-badge rent-badge--warning">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {days} {t('ownerHome.daysLeft')}
                      </span>
                    </div>
                    <div className="rent-text-sm rent-text-muted rent-mb-2">租客：{l.tenant_name || l.tenant_id || '-'}</div>
                    <div className="rent-flex rent-flex--between rent-text-sm">
                      <span className="rent-text-muted">{end ? end.format('YYYY-MM-DD') : '-'}</span>
                      <button type="button" className="rent-btn rent-btn--secondary rent-btn--sm">{t('ownerHome.renew')}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 到账动态 */}
          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('ownerHome.recentActivity')}</h3>
              <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/owner/income')}>
                {t('browse.viewAll')}
              </button>
            </div>
            <div className="rent-card__body">
              <div className="rent-timeline">
                {activityList.map((a, i) => (
                  <div className="rent-timeline__item" key={i}>
                    <div className={`rent-timeline__dot rent-timeline__dot--${a.type}`} />
                    <div className="rent-flex rent-flex--between">
                      <div>
                        <span className="rent-text-bold">{a.title}</span>
                        <span className="rent-text-sm rent-text-muted"> — {a.desc}</span>
                      </div>
                      <span className="rent-text-sm rent-text-muted">{a.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
