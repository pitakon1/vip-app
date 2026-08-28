import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { propertiesApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import './dashboard.css'

interface PropertyItem {
  id: string
  room_number: string
  project_id?: string
  project_name?: string
  owner_id?: string
  status: string
  monthly_rent: number
  currency?: string
  sale_price?: number
  size_sqm: number
  bedrooms?: number
  bathrooms?: number
  floor?: number
  building?: string
  address?: string
  city?: string
  property_type?: string
  furnished?: boolean
  description?: string
  created_at?: string
  published_at?: string
  [key: string]: any
}

interface Lease {
  id: string
  property_id: string
  property?: { room_number?: string; address?: string; building?: string }
  start_date: string
  end_date: string
  monthly_rent: number
  currency: string
  status: string
  [key: string]: any
}

interface Notification {
  id: string
  title: string
  content: string
  type: string
  read: boolean
  created_at: string
  [key: string]: any
}

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

const formatRent = (v: any) => `฿ ${Number(v || 0).toLocaleString()}`
const formatPrice = (v: any) => `฿ ${Number(v || 0).toLocaleString()}`

const TenantDashboard = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  // ===== 双业务状态 =====
  const [biz, setBiz] = useState<'rent' | 'buy'>('rent')
  const [keyword, setKeyword] = useState('')

  // ===== 数据 =====
  const [loading, setLoading] = useState(false)
  const [allItems, setAllItems] = useState<PropertyItem[]>([])
  const [leases, setLeases] = useState<Lease[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [propsRes, leasesRes, notifRes] = await Promise.all([
        propertiesApi.list({ page: 1, pageSize: 999 } as any).catch(() => ({ data: { items: [] } })),
        api.get('/leases').catch(() => ({ data: { items: [] } })),
        api.get('/notifications/me').catch(() => ({ data: { items: [] } })),
      ])

      const pPayload = propsRes.data?.data ?? propsRes.data
      setAllItems(pPayload?.items ?? [])

      const lPayload = leasesRes.data?.data ?? leasesRes.data
      setLeases(lPayload?.items ?? [])

      const nPayload = notifRes.data?.data ?? notifRes.data
      setNotifications(nPayload?.items ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('property.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ===== 主题模块数据 =====
  const rentItems = useMemo(() => {
    return allItems
      .filter((it) => !it.sale_price || it.monthly_rent)
      .sort((a, b) => dayjs(b.created_at || b.published_at || 0).valueOf() - dayjs(a.created_at || a.published_at || 0).valueOf())
  }, [allItems])

  const saleItems = useMemo(() => {
    return allItems
      .filter((it) => Number(it.sale_price) > 0)
      .sort((a, b) => Number(b.sale_price || 0) - Number(a.sale_price || 0))
  }, [allItems])

  const featuredItems = useMemo(() => {
    const list = biz === 'rent' ? rentItems : saleItems
    return list.slice(0, 6)
  }, [biz, rentItems, saleItems])

  const newItems = useMemo(() => {
    return rentItems.slice(0, 6)
  }, [rentItems])

  const searchResults = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return []
    const pool = biz === 'rent' ? rentItems : saleItems
    return pool
      .filter((it) =>
        [it.room_number, it.address, it.project_id, it.project_name, it.building, it.city]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw)),
      )
      .slice(0, 9)
  }, [keyword, biz, rentItems, saleItems])

  // ===== 我的租约/待办 =====
  const currentLease = useMemo(
    () => leases.find((l) => l.status === 'active') || leases[0],
    [leases],
  )
  const daysToExpiry = useMemo(() => {
    if (!currentLease?.end_date) return 43
    return dayjs(currentLease.end_date).diff(dayjs(), 'day')
  }, [currentLease])
  const leaseProgress = useMemo(() => {
    if (!currentLease?.start_date || !currentLease?.end_date) return 88
    const total = dayjs(currentLease.end_date).diff(dayjs(currentLease.start_date), 'day')
    const passed = dayjs().diff(dayjs(currentLease.start_date), 'day')
    if (total <= 0) return 0
    return Math.min(100, Math.max(0, Math.round((passed / total) * 100)))
  }, [currentLease])
  const monthlyRent = useMemo(() => {
    const rent = Number(currentLease?.monthly_rent ?? 3800)
    return `฿ ${rent.toLocaleString()}`
  }, [currentLease])

  const reminders = useMemo(() => {
    if (notifications.length) {
      return notifications.slice(0, 3).map((n) => ({
        tone: n.read ? 'neutral' : 'warning',
        title: n.title || t('common.notifications'),
        desc: n.content || '',
        date: n.created_at ? dayjs(n.created_at).format('M月D日') : '—',
      }))
    }
    return [
      { tone: 'warning', title: t('tenantRemind.rentDue'), desc: `${t('tenantRemind.monthlyRent')} ${monthlyRent} ${t('tenantRemind.toPay')}`, date: '8月15日' },
      { tone: 'info', title: t('tenantRemind.leaseExpire'), desc: `${t('tenantRemind.expireIn')} ${daysToExpiry} ${t('tenantRemind.days')}`, date: '9月15日' },
      { tone: 'neutral', title: t('tenantRemind.maintenanceReply'), desc: '#MT-002', date: '—' },
    ]
  }, [notifications, monthlyRent, daysToExpiry, t])

  // ===== 功能宫格 =====
  const funcItems = [
    { key: 'find', label: t('browse.findNow'), icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22', color: 'var(--rent-primary)', bg: 'rgba(66,99,235,0.12)', go: () => navigate('/properties') },
    { key: 'map', label: t('browse.mapFind'), icon: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', color: 'var(--state-info)', bg: 'rgba(14,165,233,0.12)', go: () => navigate('/properties') },
    { key: 'video', label: t('browse.video'), icon: 'M22 8l-6 4 6 4V8Z M2 6h14v12H2z', color: '#7c3aed', bg: 'rgba(139,92,246,0.12)', go: () => navigate('/properties') },
    { key: 'loan', label: t('browse.loanCalc'), icon: 'M4 2h16v20H4z M8 6h8 M8 10h.01 M12 10h.01 M16 10h.01 M8 14h.01 M12 14h.01 M16 14h.01', color: 'var(--state-warning)', bg: 'rgba(217,119,6,0.12)', go: () => navigate('/properties') },
    { key: 'consign', label: t('browse.consignFind'), icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M8 2h8v4H8z M9 13h6 M9 17h4', color: 'var(--state-success)', bg: 'rgba(22,163,74,0.12)', go: () => navigate('/tenant/services') },
    { key: 'valu', label: t('browse.sellValuation'), icon: 'M23 6 13.5 15.5 8.5 10.5 1 18 M17 6h6v6', color: '#db2777', bg: 'rgba(236,72,153,0.12)', go: () => navigate('/properties') },
  ]

  // ===== 房源卡片渲染 =====
  const renderPropCard = (item: PropertyItem, mode: 'rent' | 'buy') => {
    const projectName = item.project_name || item.project_id || ''
    const title = projectName ? `${projectName} · ${item.room_number}` : item.room_number || '—'
    const ptype = item.property_type || '公寓'
    const addr = item.address || item.city || '—'
    const tag = mode === 'buy' ? t('browse.resale') : ptype
    const price = mode === 'buy'
      ? <span className="rv17-prop__price">{formatPrice(item.sale_price)}</span>
      : <span className="rv17-prop__price">{formatRent(item.monthly_rent)}<span className="rv17-prop__price-unit">{t('browse.rentUnit')}</span></span>
    const meta = mode === 'buy'
      ? `${item.bedrooms ?? 0}卧${item.bathrooms ?? 0}浴 · ${item.size_sqm || 0}㎡`
      : `${item.bedrooms ?? 0}卧${item.bathrooms ?? 0}浴 · ${item.size_sqm || 0}㎡`

    return (
      <div
        key={item.id}
        className="rv17-prop"
        onClick={() => navigate(`/properties/detail/${item.id}`)}
        style={{ cursor: 'pointer' }}
      >
        <div className="rv17-prop__img" style={{ background: gradientFor(String(item.id || item.room_number || '')) }}>
          <span className="rv17-prop__badge">{tag}</span>
          <button
            className="rv17-prop__fav"
            aria-label={t('browse.more')}
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </button>
        </div>
        <div className="rv17-prop__body">
          <h3 className="rv17-prop__name">{title}</h3>
          <p className="rv17-prop__addr">{addr} · {meta}</p>
          <div className="rv17-prop__tags">
            <span className="rent-badge rent-badge--primary">{t('browse.nearMetro')}</span>
            <span className="rent-badge rent-badge--neutral">{t('browse.furnished')}</span>
            <span className="rent-badge rent-badge--neutral">{t('browse.moveIn')}</span>
          </div>
          <div className="rv17-prop__bottom">
            {price}
            <span className="rv17-prop__meta">{t('browse.hotToday')}</span>
          </div>
        </div>
      </div>
    )
  }

  const userName = user?.full_name || t('welcome')
  const today = dayjs().format('YYYY年M月D日 · dddd')

  return (
    <div className="rent-main rent-tenant-home">
      {/* ===== 城市定位 + 搜索 ===== */}
      <div className="rv17-hero">
        <div className="rv17-hero__loc">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
          <span>{t('browse.city')}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
        <div className="rv17-hero__search">
          <svg className="rv17-hero__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            type="search"
            placeholder={t('browse.searchPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button className="rv17-hero__search-btn" aria-label={t('common.search')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>
      </div>

      {/* ===== 双业务 Tab：租房 / 买房 ===== */}
      <div className="rv17-tabs">
        <button className={`rv17-tab ${biz === 'rent' ? 'is-active' : ''}`} data-active={biz === 'rent'} onClick={() => setBiz('rent')}>{t('browse.rent')}</button>
        <button className={`rv17-tab ${biz === 'buy' ? 'is-active' : ''}`} data-active={biz === 'buy'} onClick={() => setBiz('buy')}>{t('browse.buy')}</button>
      </div>

      {/* ===== 搜索结果显示 ===== */}
      {keyword.trim() && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('common.search')}（{searchResults.length}）</h2>
            <a className="rv17-sec__more" onClick={() => navigate('/properties')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {searchResults.map((it) => renderPropCard(it, biz))}
            {searchResults.length === 0 && <div className="rv17-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 功能宫格 ===== */}
      <div className="rv17-func-grid">
        {funcItems.map((f) => (
          <a className="rv17-func-item" key={f.key} onClick={f.go} style={{ cursor: 'pointer' }}>
            <div className="rv17-func-icon" style={{ background: f.bg, color: f.color }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
            </div>
            <span className="rv17-func-label">{f.label}</span>
          </a>
        ))}
      </div>

      {/* ===== 主题模块：精选房源 ===== */}
      {!keyword.trim() && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{biz === 'rent' ? t('browse.featured') : t('browse.hotResale')}</h2>
            <span className="rv17-sec__desc">{biz === 'rent' ? t('browse.featuredDesc') : t('browse.resaleDesc')}</span>
            <a className="rv17-sec__more" onClick={() => navigate('/properties')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {featuredItems.map((it) => renderPropCard(it, biz))}
            {featuredItems.length === 0 && <div className="rv17-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 主题模块：新上房源（仅租房） ===== */}
      {biz === 'rent' && !keyword.trim() && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('browse.newArrivals')}</h2>
            <span className="rv17-sec__desc">{t('browse.newDesc')}</span>
            <a className="rv17-sec__more" onClick={() => navigate('/properties')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {newItems.map((it) => renderPropCard(it, 'rent'))}
            {newItems.length === 0 && <div className="rv17-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {loading && <div className="rv17-empty">{t('common.loading')}…</div>}

      {/* ===== 我的租约 + 待办 ===== */}
      <section className="rent-section">
        <div className="rent-section__head">
          <h3 className="rent-section__title">{t('browse.featured')} · {userName}</h3>
        </div>
        <div className="rent-row-2">
          <div className="rent-card rent-lease">
            <div className="rent-lease__top">
              <h3 className="rent-lease__heading">{t('menu.myLeases')}</h3>
              <span className="rent-badge rent-badge--success"><span className="rent-badge--dot" style={{ background: 'var(--state-success)' }}></span>{t('propertyStatus.rented')}</span>
            </div>
            <div className="rent-lease__stats">
              <div>
                <div className="rent-lease__stat-label">{t('browse.assets')}</div>
                <div className="rent-lease__stat-value">{currentLease?.property?.room_number || currentLease?.property?.address || '—'}</div>
              </div>
              <div>
                <div className="rent-lease__stat-label">{t('property.monthlyRent')}</div>
                <div className="rent-lease__stat-value rent-lease__stat-value--mono">{monthlyRent}</div>
              </div>
            </div>
            <div className="rent-lease__progress-wrap">
              <div className="rent-lease__progress-head">
                <span className="rent-lease__progress-label">{t('menu.myLeases')}</span>
                <span className="rent-lease__progress-days">{t('tenantRemind.expireIn')} {daysToExpiry} {t('tenantRemind.days')}</span>
              </div>
              <div className="rent-lease__progress"><div className="rent-lease__progress-bar" style={{ width: `${leaseProgress}%` }}></div></div>
              <div className="rent-lease__progress-foot">{today}</div>
            </div>
            <button type="button" className="rent-hero__cta" style={{ marginTop: 16 }} onClick={() => navigate('/tenant/payments')}>
              {t('browse.viewAll')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </button>
          </div>

          <div className="rent-card">
            <div className="rent-lease__top" style={{ padding: '24px 24px 0' }}>
              <h3 className="rent-lease__heading">{t('tenantRemind.todoTitle')}</h3>
              <span className="rent-badge rent-badge--warning">{t('tenantRemind.recent')}</span>
            </div>
            <div className="rent-reminders">
              {reminders.map((r, idx) => (
                <div key={idx} className={`rent-reminder rent-reminder--${r.tone}`}>
                  <div className="rent-reminder__icon">
                    {r.tone === 'warning' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="6" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
                    {r.tone === 'info' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                    {r.tone === 'neutral' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                  </div>
                  <div className="rent-reminder__body">
                    <div className="rent-reminder__title">{r.title}</div>
                    <div className="rent-reminder__desc">{r.desc}</div>
                  </div>
                  <div className="rent-reminder__date">{r.date}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default TenantDashboard
