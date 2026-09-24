import { useMemo } from 'react'
import { Spin, Empty } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
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

// 业主端金额一律泰铢（后端 base currency = THB，且同页 sale_price 已用 ฿）。
// 此前租金/收益走 `fmtRM`（把泰铢按汇率折成马币），售价走 `fmtThb`，
// 同一页两个币种——淘汰 `fmtRM` 统一成泰铢。
const fmtThb = (v: number) => `฿ ${Math.round(Number(v || 0)).toLocaleString()}`

const Dashboard = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'

  const q = useCachedQuery<{ properties: OwnerProperty[]; income: IncomeSummary }>({
    queryKey: ['owner-dashboard', 'me', uid],
    cacheKey: `owner-dashboard:me:${uid}`,
    queryFn: async () => {
      const [propertiesRes, incomeRes] = await Promise.all([
        api.get('/owners/me/properties').catch(() => ({ data: { items: [] } })),
        api.get('/owners/me/income').catch(() => ({ data: {} })),
      ])
      const pPayload = propertiesRes.data?.data ?? propertiesRes.data
      const iPayload = incomeRes.data?.data ?? incomeRes.data
      let income: IncomeSummary = { total_income: 0, monthly_income: 0, pending_amount: 0 }
      if (Array.isArray(iPayload?.items)) {
        income = iPayload.items.reduce(
          (acc: IncomeSummary, it: any) => {
            acc.total_income = Number(acc.total_income || 0) + Number(it.amount || 0)
            return acc
          },
          { total_income: 0, monthly_income: 0, pending_amount: 0 },
        )
      } else {
        income = {
          total_income: Number(iPayload?.total_income ?? 0),
          monthly_income: Number(iPayload?.monthly_income ?? 0),
          pending_amount: Number(iPayload?.pending_amount ?? 0),
        }
      }
      return { properties: pPayload?.items ?? [], income }
    },
  })
  const properties = q.data?.properties ?? []
  const income = q.data?.income ?? { total_income: 0, monthly_income: 0, pending_amount: 0 }
  const loading = q.isPending && !q.data

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

  const totalProps = properties.length
  const rentedCount = statusCount.rented
  const vacantCount = statusCount.vacant
  const occupancyPct = totalProps > 0 ? Math.round((rentedCount / totalProps) * 100) : 0

  // 收益总览：本月应收 / 已收 / 待收
  const monthlyIncome = Number(income.monthly_income || 0)
  const pendingAmount = Number(income.pending_amount || 0)
  const collectedIncome = Math.max(monthlyIncome - pendingAmount, 0)
  const collectedRate = monthlyIncome > 0 ? Math.round((collectedIncome / monthlyIncome) * 100) : 0

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
    const dims = t('ownerDashboard.dims', { bed: p.bedrooms ?? 0, bath: p.bathrooms ?? 0, size: p.size_sqm || 0 })
    const s = String(p.status || '').toLowerCase()
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale') return t('ownerDashboard.metaForSale', { dims })
    return `${dims} · ${p.tenant_name || '-'}`
  }

  return (
    <div className="rent-main">
      {loading && (
        <div className="owner-loading-bar">
          <Spin size="small" style={{ marginRight: 8 }} />
          {t('ownerDashboard.loadingData')}
        </div>
      )}

      {/* ===== Page Header（对齐其他端：rent-page-header 页头） ===== */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('ownerDashboard.title')}</h2>
          <p className="rent-page-header__subtitle">
            {dayjs().format(t('ownerDashboard.dateFormat'))} · {t('ownerDashboard.subtitle')}
          </p>
        </div>
      </div>

      {/* ===== 收益总览 + 房源管理 ===== */}
      <div className="rent-grid rent-grid--2">
        {/* 收益总览 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('ownerDashboard.incomeOverview')}</h3>
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/owner/income')}>
              {t('ownerDashboard.viewDetail')}
            </button>
          </div>
          <div className="rent-card__body">
            <div className="rent-text-sm rent-text-muted rent-mb-4">{t('ownerDashboard.monthlyTotal')}</div>
            <div className="rent-grid rent-grid--3" style={{ gap: 12 }}>
              <div>
                <div className="rent-text-sm rent-text-muted">{t('ownerDashboard.monthlyReceivable')}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--rent-ink)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {fmtThb(monthlyIncome)}
                </div>
              </div>
              <div>
                <div className="rent-text-sm rent-text-muted">{t('ownerDashboard.collected')}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--state-success)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {fmtThb(collectedIncome)}
                </div>
              </div>
              <div>
                <div className="rent-text-sm rent-text-muted">{t('ownerDashboard.pending')}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--state-warning)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {fmtThb(pendingAmount)}
                </div>
              </div>
            </div>
            <div className="rent-progress rent-mt-4">
              <div className="rent-progress__bar" style={{ width: `${collectedRate}%` }} />
            </div>
            <div className="rent-flex rent-flex--between rent-mt-2">
              <span className="rent-text-sm rent-text-muted">{t('ownerDashboard.collectionProgress')}</span>
              <span className="rent-text-sm rent-text-bold" style={{ color: 'var(--rent-primary)' }}>{t('ownerDashboard.collectedPct', { pct: collectedRate })}</span>
            </div>
          </div>
        </div>

        {/* 资产概览 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('ownerDashboard.assetOverview')}</h3>
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/owner/properties')}>
              {t('ownerDashboard.viewAll')}
            </button>
          </div>
          <div className="rent-card__body" style={{ padding: 12 }}>
            <div className="rent-grid rent-grid--3" style={{ gap: 12 }}>
              <div className="rent-stat-card">
                <div className="rent-stat-card__label">{t('ownerDashboard.myProperties')}</div>
                <div className="rent-stat-card__value">
                  {totalProps} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('ownerDashboard.unitSuffix')}</span>
                </div>
                <div className="rent-stat-card__delta">{t('ownerDashboard.forSaleCount', { n: statusCount.for_sale })}</div>
              </div>
              <div className="rent-stat-card">
                <div className="rent-stat-card__label">{t('ownerDashboard.rentedProperties')}</div>
                <div className="rent-stat-card__value">
                  {rentedCount} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('ownerDashboard.unitSuffix')}</span>
                </div>
                <div className="rent-stat-card__delta rent-stat-card__delta--up">{t('ownerDashboard.occupancyPct', { pct: occupancyPct })}</div>
              </div>
              <div className="rent-stat-card">
                <div className="rent-stat-card__label">{t('ownerDashboard.vacantProperties')}</div>
                <div className="rent-stat-card__value">
                  {vacantCount} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('ownerDashboard.unitSuffix')}</span>
                </div>
                <div className="rent-stat-card__delta">{t('ownerDashboard.awaitingListing')}</div>
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
                      <span className="rent-badge rent-badge--success" style={{ flexShrink: 0 }}>{t('ownerDashboard.badgeRented')}</span>
                    </div>
                    <div className="rent-v17-prop__meta">{propMeta(rentedProp)}</div>
                    <div className="rent-v17-prop__price">
                      {fmtThb(rentedProp.monthly_rent || 0)}
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
                      <span className="rent-badge rent-badge--warning" style={{ flexShrink: 0 }}>{t('ownerDashboard.badgeForSale')}</span>
                    </div>
                    <div className="rent-v17-prop__meta">{propMeta(saleProp)}</div>
                    <div className="rent-v17-prop__price">{fmtThb(saleProp.sale_price || 0)}</div>
                  </div>
                </div>
              )}
            </div>
            {!rentedProp && !saleProp && (
              <div className="rent-empty" style={{ padding: '20px 0' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ownerDashboard.noProperties')} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard