import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { propertiesApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'

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

interface Notification {
  id: string
  title?: string
  content?: string
  type?: string
  read?: boolean
  created_at?: string
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

  // ===== 数据（缓存优先 + 后台刷新） =====
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'

  const homeQ = useCachedQuery<{ allItems: PropertyItem[]; notifications: Notification[] }>({
    queryKey: ['tenant-dashboard', 'home', uid],
    cacheKey: `tenant-dashboard:home:${uid}`,
    queryFn: async () => {
      const [propsRes, notifRes] = await Promise.all([
        propertiesApi.list({ page: 1, pageSize: 999 } as any).catch(() => ({ data: { items: [] } })),
        api.get('/notifications/me').catch(() => ({ data: { items: [] } })),
      ])
      const pPayload = propsRes.data?.data ?? propsRes.data
      const nPayload = notifRes.data?.data ?? notifRes.data
      return {
        allItems: pPayload?.items ?? [],
        notifications: nPayload?.items ?? [],
      }
    },
  })
  const allItems = homeQ.data?.allItems ?? []
  const notifications = homeQ.data?.notifications ?? []
  const loading = homeQ.isPending && !homeQ.data

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
    return [...rentItems]
      .sort((a, b) => Number(b.monthly_rent || 0) - Number(a.monthly_rent || 0))
      .slice(0, 6)
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

  const reminders = useMemo(() => {
    return notifications.slice(0, 3).map((n) => ({
      tone: n.read ? 'neutral' : 'warning',
      title: n.title || t('common.notifications'),
      desc: n.content || '',
      date: n.created_at ? dayjs(n.created_at).format(t('tenantDashboard.monthDayFormat')) : '—',
    }))
  }, [notifications, t])

  const feedItems = useMemo(() => {
    return reminders.map((r) => ({
      tone: r.tone === 'warning' ? 'warning' : r.tone === 'info' ? 'info' : 'success',
      title: r.title,
      desc: r.desc,
      date: r.date,
    }))
  }, [reminders])

  // ===== 房源卡片渲染 =====
  const renderPropCard = (item: PropertyItem, mode: 'rent' | 'buy') => {
    const projectName = item.project_name || item.project_id || ''
    const title = projectName ? `${projectName} · ${item.room_number}` : item.room_number || '—'
    const ptype = item.property_type || t('tenantDashboard.propTypeDefault')
    const addr = item.address || item.city || '—'
    const tag = mode === 'buy' ? t('browse.resale') : ptype
    const price = mode === 'buy'
      ? <span className="rv17-prop__price">{formatPrice(item.sale_price, item.currency)}</span>
      : <span className="rv17-prop__price">{formatRent(item.monthly_rent, item.currency)}<span className="rv17-prop__price-unit">{t('browse.rentUnit')}</span></span>
    const meta = t('tenantDashboard.bedroomBath', { bed: item.bedrooms ?? 0, bath: item.bathrooms ?? 0, size: item.size_sqm || 0 })

    return (
      <div
        key={item.id}
        className="rv17-prop"
        onClick={() => navigate(`/tenant/properties/${item.id}`)}
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
    const title = projectName || item.room_number || t('tenantDashboard.inSaleUnit')
    const addr = item.address || item.city || '—'
    const sub = `${t('tenantDashboard.bedroomBath', { bed: item.bedrooms ?? 0, bath: item.bathrooms ?? 0, size: item.size_sqm || 0 })} · ${t('tenantDashboard.furnishedDelivery')}`
    return (
      <a
        key={item.id}
        className="rv17-comm"
        onClick={() => navigate(`/tenant/properties/${item.id}`)}
        style={{ cursor: 'pointer' }}
      >
        <div className="rv17-comm__img" style={{ background: gradientFor(String(item.id || item.room_number || '')) }}>
          <svg className="rv17-comm__img-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>
          <span className="rv17-comm__badge">{t('tenantDashboard.forSale')}</span>
        </div>
        <div className="rv17-comm__body">
          <h3 className="rv17-comm__name">{title}</h3>
          <p className="rv17-comm__addr">{addr}</p>
          <div className="rv17-comm__price">{formatPrice(item.sale_price, item.currency)}<span className="rv17-comm__price-unit">{t('tenantDashboard.startUnit')}</span></div>
          <div className="rv17-comm__sub">{sub}</div>
        </div>
      </a>
    )
  }

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
            <a className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {searchResults.map((it) => renderPropCard(it, biz))}
            {searchResults.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 主题模块：精选房源（租房） ===== */}
      {!keyword.trim() && biz === 'rent' && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('browse.featured')}</h2>
            <a className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
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
            <a className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
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
            <h2 className="rv17-sec__title">{t('tenantDashboard.buyRecommend')}</h2>
            <a className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('tenantDashboard.inSaleUnit')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
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
            <h2 className="rv17-sec__title">{t('tenantDashboard.hotResaleOrders')}</h2>
            <a className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></a>
          </div>
          <div className="rv17-rail">
            {saleItems.slice(0, 3).map((it) => renderPropCard(it, 'buy'))}
            {saleItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {loading && <div className="rent-empty">{t('common.loading')}…</div>}

      {/* ===== 最近动态 ===== */}
      <section className="rent-section">
        <div className="rent-card rent-todo-feed">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('tenantRemind.recentNews')}</h3>
            <a className="rent-section__link" onClick={() => navigate('/tenant/maintenance')}>{t('tenantRemind.allRecords')}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
          </div>
          <div className="rent-card__body">
            {feedItems.length ? (
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
            ) : (
              <div className="rent-empty">{t('common.noData')}</div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

export default TenantDashboard
