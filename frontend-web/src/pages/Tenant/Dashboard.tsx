import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { propertiesApi } from '@/services/api'
import { formatMoney } from '@/lib/money'

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
  '#14b8a6',
  '#0ea5e9',
  '#16a34a',
  '#7a5cd6',
  '#f59e0b',
  '#55606c',
  '#f43f5e',
  '#14b8a6',
]

const gradientFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) {
    h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  }
  return GRADIENTS[h % GRADIENTS.length]
}

const formatRent = (v: any, cur?: string) => formatMoney(Number(v || 0), cur)
const formatPrice = (v: any, cur?: string) => formatMoney(Number(v || 0), cur)

const TenantDashboard = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()

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
    return rentItems.slice(0, 6)
  }, [rentItems])

  const newItems = useMemo(() => {
    return rentItems.slice(0, 6)
  }, [rentItems])

  const commItems = useMemo(() => {
    return saleItems.slice(0, 3)
  }, [saleItems])

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

  const feedItems = useMemo(() => {
    return reminders.map((r) => ({
      tone: r.tone === 'warning' ? 'warning' : r.tone === 'info' ? 'info' : 'success',
      title: r.title,
      desc: r.desc,
      date: r.date,
    }))
  }, [reminders])

  // ===== 功能宫格 =====
  const funcItems = [
    { key: 'find', label: t('browse.findNow'), icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22', color: 'var(--rent-primary)', bg: 'rgba(20, 184, 166, 0.12)', go: () => navigate('/properties') },
    { key: 'map', label: t('browse.mapFind'), icon: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', color: 'var(--state-info)', bg: 'rgba(14,165,233,0.12)', go: () => navigate('/properties') },
    { key: 'video', label: t('browse.video'), icon: 'M22 8l-6 4 6 4V8Z M2 6h14v12H2z', color: '#14b8a6', bg: 'rgba(139,92,246,0.12)', go: () => navigate('/properties') },
    { key: 'loan', label: t('browse.loanCalc'), icon: 'M4 2h16v20H4z M8 6h8 M8 10h.01 M12 10h.01 M16 10h.01 M8 14h.01 M12 14h.01 M16 14h.01', color: 'var(--state-warning)', bg: 'rgba(217,119,6,0.12)', go: () => navigate('/properties') },
    { key: 'consign', label: t('browse.consignFind'), icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M8 2h8v4H8z M9 13h6 M9 17h4', color: 'var(--state-success)', bg: 'rgba(22,163,74,0.12)', go: () => navigate('/tenant/services') },
    { key: 'valu', label: t('browse.sellValuation'), icon: 'M23 6 13.5 15.5 8.5 10.5 1 18 M17 6h6v6', color: '#db2777', bg: 'rgba(236,72,153,0.12)', go: () => navigate('/properties') },
  ]

  // ===== 快捷入口金刚区 =====
  const quickCards = [
    {
      key: 'find',
      title: '找房源',
      desc: '搜索房源 · 预约看房',
      bg: 'rgba(20,184,166,0.12)',
      color: 'var(--rent-primary)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
      go: () => navigate('/properties'),
    },
    {
      key: 'pay',
      title: '上传付款',
      desc: '提交本月租金凭证',
      bg: 'rgba(22,163,74,0.12)',
      color: 'var(--state-success)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
      go: () => navigate('/tenant/payments'),
    },
    {
      key: 'svc',
      title: '预约服务',
      desc: '清洁、维修、代付',
      bg: 'rgba(14,165,233,0.12)',
      color: 'var(--state-info)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>,
      go: () => navigate('/tenant/services'),
    },
    {
      key: 'mt',
      title: '提交报修',
      desc: '在线提交维修申请',
      bg: 'rgba(217,119,6,0.12)',
      color: 'var(--state-warning)',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
      go: () => navigate('/tenant/maintenance'),
    },
  ]

  // ===== 房源卡片渲染 =====
  const renderPropCard = (item: PropertyItem, mode: 'rent' | 'buy') => {
    const projectName = item.project_name || item.project_id || ''
    const title = projectName ? `${projectName} · ${item.room_number}` : item.room_number || '—'
    const ptype = item.property_type || '公寓'
    const addr = item.address || item.city || '—'
    const tag = mode === 'buy' ? t('browse.resale') : ptype
    const price = mode === 'buy'
      ? <span className="rv17-prop__price">{formatPrice(item.sale_price, item.currency)}</span>
      : <span className="rv17-prop__price">{formatRent(item.monthly_rent, item.currency)}<span className="rv17-prop__price-unit">{t('browse.rentUnit')}</span></span>
    const meta = `${item.bedrooms ?? 0}卧${item.bathrooms ?? 0}浴 · ${item.size_sqm || 0}㎡`

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

  // ===== 买房推荐楼盘渲染 =====
  const renderCommCard = (item: PropertyItem) => {
    const projectName = item.project_name || item.project_id || ''
    const title = projectName || item.room_number || '在售楼盘'
    const addr = item.address || item.city || '—'
    const sub = `${item.bedrooms ?? 0}卧${item.bathrooms ?? 0}浴 · ${item.size_sqm || 0}㎡ · 精装交付`
    return (
      <a
        key={item.id}
        className="rv17-comm"
        onClick={() => navigate(`/properties/detail/${item.id}`)}
        style={{ cursor: 'pointer' }}
      >
        <div className="rv17-comm__img" style={{ background: gradientFor(String(item.id || item.room_number || '')) }}>
          <svg className="rv17-comm__img-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>
          <span className="rv17-comm__badge">在售</span>
        </div>
        <div className="rv17-comm__body">
          <h3 className="rv17-comm__name">{title}</h3>
          <p className="rv17-comm__addr">{addr}</p>
          <div className="rv17-comm__price">{formatPrice(item.sale_price, item.currency)}<span className="rv17-comm__price-unit">起</span></div>
          <div className="rv17-comm__sub">{sub}</div>
        </div>
      </a>
    )
  }

  const today = dayjs().format('YYYY年M月D日 · dddd')

  return (
    <>
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
        <button className="rv17-tab" data-active={biz === 'rent'} onClick={() => setBiz('rent')}>{t('browse.rent')}</button>
        <button className="rv17-tab" data-active={biz === 'buy'} onClick={() => setBiz('buy')}>{t('browse.buy')}</button>
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
            {searchResults.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
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

      {/* ===== 主题模块：精选房源（租房） ===== */}
      {!keyword.trim() && biz === 'rent' && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('browse.featured')}</h2>
            <a className="rv17-sec__more" onClick={() => navigate('/properties')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {featuredItems.map((it) => renderPropCard(it, 'rent'))}
            {featuredItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 主题模块：新上房源（租房） ===== */}
      {!keyword.trim() && biz === 'rent' && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('browse.newArrivals')}</h2>
            <a className="rv17-sec__more" onClick={() => navigate('/properties')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {newItems.map((it) => renderPropCard(it, 'rent'))}
            {newItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 主题模块：买房推荐楼盘（买房） ===== */}
      {!keyword.trim() && biz === 'buy' && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">买房推荐楼盘</h2>
            <a className="rv17-sec__more" onClick={() => navigate('/properties')}>在售楼盘<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {commItems.map((it) => renderCommCard(it))}
            {commItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 主题模块：热门二手房（买房） ===== */}
      {!keyword.trim() && biz === 'buy' && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">热门二手房</h2>
            <a className="rv17-sec__more" onClick={() => navigate('/properties')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {saleItems.slice(0, 3).map((it) => renderPropCard(it, 'buy'))}
            {saleItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {loading && <div className="rent-empty">{t('common.loading')}…</div>}

      {/* ===== 待办区（置顶）：本月租金 + 报修进度 ===== */}
      <section className="rent-section">
        <div className="rent-todo-strip">
          {/* 本月租金未付：醒目卡片 */}
          <div className="rent-card rent-todo-pay" style={{ padding: 24 }}>
            <div className="rent-todo-pay__head">
              <span className="rent-badge rent-badge--warning"><span className="rent-badge--dot" style={{ background: 'var(--state-warning)' }}></span>本月待办</span>
              <span className="rent-todo-pay__due">8月15日到期</span>
            </div>
            <div className="rent-todo-pay__label">本月租金</div>
            <div className="rent-todo-pay__amount">{monthlyRent}</div>
            <p className="rent-todo-pay__sub">账单日 8月1日 · 到期未付将影响信用记录</p>
            <button
              type="button"
              className="rent-btn rent-btn--primary rent-btn--lg rent-btn--block rent-todo-pay__cta"
              onClick={() => navigate('/tenant/payments')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              立即付款
            </button>
          </div>

          {/* 报修进行中：进度卡 */}
          <div className="rent-card rent-todo-maint" style={{ padding: 24 }}>
            <div className="rent-todo-maint__head">
              <span className="rent-badge rent-badge--info"><span className="rent-badge--dot" style={{ background: 'var(--state-info)' }}></span>报修进行中</span>
              <span className="rent-todo-maint__id">#MT-002</span>
            </div>
            <div className="rent-todo-maint__title">空调不制冷 · 维修处理中</div>
            <div className="rent-todo-maint__desc">师傅已上门排查，预计 8月7日 完成维修</div>
            <div className="rent-progress rent-todo-maint__bar"><div className="rent-progress__bar" style={{ width: '65%', background: 'var(--state-info)' }}></div></div>
            <div className="rent-todo-maint__foot">
              <span>已处理 3 天</span>
              <button type="button" className="rent-btn rent-btn--secondary rent-btn--sm" onClick={() => navigate('/tenant/maintenance')}>查看详情</button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 两栏：左 = 租约状态 + 快捷入口；右 = 最近动态 ===== */}
      <section className="rent-section">
        <div className="rent-todo-main-grid">
          <div className="rent-todo-left">
            {/* 租约状态卡 */}
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
                <div>
                  <div className="rent-lease__stat-label">{t('tenantRemind.expireIn')}</div>
                  <div className="rent-lease__stat-value rent-lease__stat-value--mono">{currentLease ? `${daysToExpiry} ${t('tenantRemind.days')}` : '—'}</div>
                </div>
              </div>
              <div className="rent-lease__progress-wrap">
                <div className="rent-lease__progress-head">
                  <span className="rent-lease__progress-label">{t('menu.myLeases')} · {today}</span>
                  <span className="rent-lease__progress-days">{t('tenantRemind.expireIn')} {daysToExpiry} {t('tenantRemind.days')}</span>
                </div>
                <div className="rent-lease__progress"><div className="rent-lease__progress-bar" style={{ width: `${leaseProgress}%` }}></div></div>
                <div className="rent-lease__progress-foot">已过 {leaseProgress}% · 到期 {currentLease?.end_date ? dayjs(currentLease.end_date).format('YYYY-MM-DD') : '—'}</div>
              </div>
            </div>

            {/* 快捷入口金刚区 */}
            <div className="rent-card">
              <div className="rent-card__header">
                <h3 className="rent-card__title">快捷入口</h3>
              </div>
              <div className="rent-card__body" style={{ padding: 24 }}>
                <div className="rent-quick-grid">
                  {quickCards.map((q) => (
                    <a key={q.key} className="rent-quick-card" onClick={q.go} style={{ cursor: 'pointer' }}>
                      <div className="rent-quick-card__icon" style={{ background: q.bg, color: q.color }}>
                        {q.icon}
                      </div>
                      <div className="rent-quick-card__body">
                        <div className="rent-quick-card__title">{q.title}</div>
                        <div className="rent-quick-card__desc">{q.desc}</div>
                      </div>
                      <svg className="rent-quick-card__arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 右栏：最近动态 */}
          <div className="rent-card rent-todo-feed">
            <div className="rent-card__header">
              <h3 className="rent-card__title">最近动态</h3>
              <a className="rent-section__link" onClick={() => navigate('/tenant/maintenance')}>全部记录
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </a>
            </div>
            <div className="rent-card__body">
              <div className="rent-timeline">
                {feedItems.map((f, idx) => (
                  <div key={idx} className="rent-timeline__item">
                    <span className={`rent-timeline__dot rent-timeline__dot--${f.tone}`}></span>
                    <div className="rent-todo-feed__title">{f.title}</div>
                    <div className="rent-todo-feed__sub">{f.desc}</div>
                    <div className="rent-todo-feed__date">{f.date}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default TenantDashboard
