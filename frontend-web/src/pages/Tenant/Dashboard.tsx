import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { message } from 'antd'
import api from '@/lib/api'
import DataState from '@/components/DataState'
import { errorKind, errorText } from '@/lib/errorText'
import LocationPicker from '@/components/LocationPicker'
import { useLocationStore } from '@/stores/location'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { formatRoomFacts, joinFacts, roomFacts } from '@/lib/displayValue'
import { makePropertyTypeLabel, toItems } from './tenantPropertyDetail/utils'

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

// 缺封面暖灰占位上的低对比户型剪影（与首页/公开列表同一套路径）
const typeIconPath = (pt: string): string => {
  switch (pt) {
    case 'villa':
    case 'house':
      return 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
    case 'shop':
    case 'commercial':
      return 'M3 9l1-5h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M9 21v-6h6v6'
    case 'office':
      return 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20'
    default: // apartment / condo
      return 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4'
  }
}

const formatRent = (v: any, cur?: string) => formatMoney(Number(v || 0), cur)
const formatPrice = (v: any, cur?: string) => formatMoney(Number(v || 0), cur)

/* ===== 业主独有数据块：名下房源数 + 本月收益摘要 ===== */

interface OwnerProperty {
  id: string
  room_number?: string
  project_name?: string
  status: string
  monthly_rent?: number
  sale_price?: number
  [key: string]: any
}

interface OwnerIncomeSummary {
  total_income: number
  monthly_income: number
  pending_amount: number
}

// 业主端金额一律泰铢（后端 base currency = THB）
const fmtThb = (v: number) => `฿ ${Math.round(Number(v || 0)).toLocaleString()}`

const OwnerAssetCard = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const isOwner = user?.role === 'owner'

  // 仅业主拉取；租客无业主档案时该接口返回空态，也不必发起请求
  const q = useCachedQuery<{ properties: OwnerProperty[]; income: OwnerIncomeSummary }>({
    queryKey: ['owner-dashboard', 'me', uid],
    cacheKey: `owner-dashboard:me:${uid}`,
    enabled: isOwner,
    queryFn: async () => {
      const [propertiesRes, incomeRes] = await Promise.all([
        api.get('/owners/me/properties'),
        api.get('/owners/me/income'),
      ])
      const pPayload = propertiesRes.data?.data ?? propertiesRes.data
      const iPayload = incomeRes.data?.data ?? incomeRes.data
      // `/owners/me/properties` 返回裸数组（不是 {items}），两种形态都要兼容
      const properties: OwnerProperty[] = Array.isArray(pPayload) ? pPayload : (pPayload?.items ?? [])
      // `/owners/me/income` 的真实口径是 total_income / records。页面要展示
      // 「本月应收 / 本月已收 / 本月待收」，按 records 的 month + status 就地归集。
      const thisMonth = dayjs().format('YYYY-MM')
      const records: any[] = Array.isArray(iPayload?.records) ? iPayload.records : []
      const monthRecords = records.filter((r) => r?.month === thisMonth)
      const received = monthRecords
        .filter((r) => r?.status === 'received')
        .reduce((s, r) => s + Number(r?.amount || 0), 0)
      const pending = monthRecords
        .filter((r) => r?.status !== 'received')
        .reduce((s, r) => s + Number(r?.amount || 0), 0)
      return {
        properties,
        income: {
          total_income: Number(iPayload?.total_income ?? 0),
          monthly_income: received + pending,
          pending_amount: pending,
        },
      }
    },
  })

  if (!isOwner) return null

  // INT-07/FE-03：接口失败不再吞成「0 套房产」，显式错误态 + 重试
  if (q.isError && !q.data) {
    return (
      <section className="rent-section">
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('ownerDashboard.assetOverview')}</h3>
          </div>
          <div className="rent-card__body">
            <DataState
              error={errorText(q.error, t('common.loadFailed'))}
              errorKind={errorKind(q.error)}
              onRetry={() => q.refetch()}
            />
          </div>
        </div>
      </section>
    )
  }

  const properties = q.data?.properties ?? []
  const income = q.data?.income ?? { total_income: 0, monthly_income: 0, pending_amount: 0 }

  const statusCount = { vacant: 0, rented: 0, for_sale: 0 }
  properties.forEach((p) => {
    const s = String(p.status || '').toLowerCase()
    if (s === 'vacant' || s === 'available') statusCount.vacant += 1
    else if (s === 'for_sale' || s === 'on_sale' || s === 'sale') statusCount.for_sale += 1
    else if (s === 'rented' || s === 'active') statusCount.rented += 1
  })
  const totalProps = properties.length
  const occupancyPct = totalProps > 0 ? Math.round((statusCount.rented / totalProps) * 100) : 0

  const monthlyIncome = Number(income.monthly_income || 0)
  const pendingAmount = Number(income.pending_amount || 0)
  const collectedIncome = Math.max(monthlyIncome - pendingAmount, 0)
  const collectedRate = monthlyIncome > 0 ? Math.round((collectedIncome / monthlyIncome) * 100) : 0

  return (
    <section className="rent-section">
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('ownerDashboard.assetOverview')}</h3>
          <div className="rent-flex rent-gap-2">
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/tenant/income')}>
              {t('ownerDashboard.viewDetail')}
            </button>
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/tenant/my-properties')}>
              {t('ownerDashboard.viewAll')}
            </button>
          </div>
        </div>
        <div className="rent-card__body">
          {/* 房源数 */}
          <div className="rent-grid rent-grid--3" style={{ gap: 12 }}>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('ownerDashboard.myProperties')}</div>
              <div className="rent-stat-card__value">
                {totalProps} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('ownerDashboard.unitSuffix')}</span>
              </div>
              <div className="rent-stat-card__delta">{t('ownerDashboard.forSaleCount', { n: statusCount.for_sale })}</div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('ownerDashboard.rentedProperties')}</div>
              <div className="rent-stat-card__value">
                {statusCount.rented} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('ownerDashboard.unitSuffix')}</span>
              </div>
              <div className="rent-stat-card__delta rent-stat-card__delta--up">{t('ownerDashboard.occupancyPct', { pct: occupancyPct })}</div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('ownerDashboard.vacantProperties')}</div>
              <div className="rent-stat-card__value">
                {statusCount.vacant} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('ownerDashboard.unitSuffix')}</span>
              </div>
              <div className="rent-stat-card__delta">{t('ownerDashboard.awaitingListing')}</div>
            </div>
          </div>

          <hr className="rent-divider" />

          {/* 本月收益摘要 */}
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
    </section>
  )
}

const TenantDashboard = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // ===== 双业务状态 =====
  const [biz, setBiz] = useState<'rent' | 'buy'>('rent')
  const [keyword, setKeyword] = useState('')
  // 首页搜索：输入即实时筛选，箭头按钮负责「跳转到结果区 / 聚焦输入框」
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchResultRef = useRef<HTMLDivElement>(null)

  const handleHeroSearch = () => {
    if (keyword.trim()) {
      searchResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      searchInputRef.current?.focus()
    }
  }

  // 左上角定位：读取全局 Store 的真实城市，点击打开定位选择器
  const cityLabel = useLocationStore((s) => s.selection.cityLabel)
  const [locOpen, setLocOpen] = useState(false)

  // ===== 数据（缓存优先 + 后台刷新） =====
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const isOwner = user?.role === 'owner'

  // 首页推荐流只读 C 端公开接口：B 端 /properties 是内部台账（100 条封顶、
  // 含业主/内部字段），不能拿来当门户推荐数据。
  const homeQ = useCachedQuery<{
    featured: PropertyItem[]
    latestRent: PropertyItem[]
    latestSale: PropertyItem[]
    notifications: Notification[]
  }>({
    queryKey: ['tenant-dashboard', 'home', uid],
    cacheKey: `tenant-dashboard:home:${uid}`,
    queryFn: async () => {
      // 推荐流失败不吞成空数组：否则 401/403/500 会统一显示为「暂无数据」。
      // 通知属于非关键区块，失败时降级为空列表，不拖垮整块推荐。
      const [featuredRes, rentRes, saleRes, notifRes] = await Promise.all([
        api.get('/public/listings', { params: { listing_type: 'rent', is_featured: true, sort: 'latest', page_size: 6 } }),
        api.get('/public/listings', { params: { listing_type: 'rent', sort: 'latest', page_size: 6 } }),
        api.get('/public/listings', { params: { listing_type: 'sell', sort: 'latest', page_size: 6 } }),
        api.get('/notifications/me').catch(() => ({ data: { items: [] } })),
      ])
      const toProps = (res: any): PropertyItem[] =>
        toItems(res)
          .map((p: any) => ({
            ...p,
            // 公开卡把租/售统一成 price；这里还原成页面既有的租/售字段
            monthly_rent: Number(p.monthly_rent ?? (p.listing_type === 'rent' ? p.price : 0) ?? 0),
            sale_price: Number(p.sale_price ?? p.asking_price ?? (p.listing_type === 'sell' ? p.price : 0) ?? 0),
            room_number: p.room_number || '',
            address: p.address || p.city || '',
            project_name: p.project_name || '',
            currency: p.currency || 'THB',
          }))
          .filter((p: PropertyItem) => p.id)
      const nPayload = notifRes.data?.data ?? notifRes.data
      return {
        featured: toProps(featuredRes),
        latestRent: toProps(rentRes),
        latestSale: toProps(saleRes),
        notifications: nPayload?.items ?? [],
      }
    },
  })
  const featuredItems = homeQ.data?.featured ?? []
  const newItems = homeQ.data?.latestRent ?? []
  const saleItems = homeQ.data?.latestSale ?? []
  const commItems = useMemo(() => saleItems.slice(0, 3), [saleItems])
  const notifications = homeQ.data?.notifications ?? []
  const loading = homeQ.isPending && !homeQ.data
  // 首屏推荐流尚未就绪（加载中 / 失败）时，不再逐个区块渲染「暂无数据」，
  // 由下方统一状态块给出明确的加载/失败/重试语义。
  const homeBlocked = loading || (homeQ.isError && !homeQ.data)

  // 搜索走服务端：关键词只匹配公开接口的全量数据，而不是本地某一页
  const [searchKw, setSearchKw] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearchKw(keyword.trim()), 300)
    return () => clearTimeout(timer)
  }, [keyword])
  const searchQ = useQuery({
    queryKey: ['tenant-home-search', biz, searchKw],
    enabled: !!searchKw,
    queryFn: async () => {
      const res = await api.get('/public/listings', {
        params: {
          q: searchKw,
          listing_type: biz === 'rent' ? 'rent' : 'sell',
          sort: 'relevance',
          page_size: 9,
        },
      })
      return toItems(res).map((p: any) => ({
        ...p,
        monthly_rent: Number(p.monthly_rent ?? (p.listing_type === 'rent' ? p.price : 0) ?? 0),
        sale_price: Number(p.sale_price ?? p.asking_price ?? (p.listing_type === 'sell' ? p.price : 0) ?? 0),
        room_number: p.room_number || '',
        address: p.address || p.city || '',
        project_name: p.project_name || '',
        currency: p.currency || 'THB',
      })) as PropertyItem[]
    },
  })
  const searchResults = searchQ.data ?? []

  // ===== 收藏（真实接口，按 property_id 落库） =====
  const token = useAuthStore((s) => s.token)
  const [favOverride, setFavOverride] = useState<Record<string, boolean>>({})
  const favPropIds = useMemo(
    () =>
      Array.from(
        new Set(
          [...featuredItems, ...newItems, ...saleItems, ...searchResults]
            .map((it) => it.property_id || '')
            .filter(Boolean),
        ),
      ).slice(0, 100),
    [featuredItems, newItems, saleItems, searchResults],
  )
  const favQ = useQuery({
    queryKey: ['tenant-home-fav', uid, favPropIds.join(',')],
    enabled: !!token && favPropIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await api.get('/favorites/status', { params: { property_ids: favPropIds.join(',') } })
      const payload = res.data?.data ?? res.data
      return new Set<string>(
        (payload?.items ?? []).filter((x: any) => x.favorited).map((x: any) => String(x.property_id)),
      )
    },
  })
  const favSet = favQ.data ?? new Set<string>()
  const isFav = (it: PropertyItem) =>
    favOverride[it.property_id || ''] ?? favSet.has(String(it.property_id || ''))

  const toggleFavorite = async (it: PropertyItem) => {
    if (!it.property_id) return
    if (!token) {
      message.info(t('browse.loginRequired'))
      navigate('/login')
      return
    }
    const next = !isFav(it)
    setFavOverride((prev) => ({ ...prev, [it.property_id!]: next }))
    try {
      if (next) await api.post('/favorites', { property_id: it.property_id })
      else await api.delete(`/favorites/${it.property_id}`)
    } catch {
      setFavOverride((prev) => ({ ...prev, [it.property_id!]: !next }))
      message.error(t('browse.favFailed'))
    }
  }

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
    // 缺失字段不补 0：只渲染真实存在的户型段，全部缺失时整段省略
    const facts = roomFacts(item)
    const meta = formatRoomFacts(facts, {
      bed: (n) => t('common.roomBed', { n }),
      bath: (n) => t('common.roomBath', { n }),
      size: (n) => t('common.roomSize', { n }),
    })
    // 标签只展示后端真实字段，不再写死「近地铁/带家具/拎包入住」这类无数据支撑的文案
    const typeLabel = makePropertyTypeLabel(t)[String(item.property_type || '')]
    const tags = [
      item.is_featured ? { label: t('browse.featured'), cls: 'rent-badge--neutral' } : null,
      item.owner_direct ? { label: t('browse.ownerDirect'), cls: 'rent-badge--neutral' } : null,
      item.furnished ? { label: t('tenantPropertyDetail.furnitureFull'), cls: 'rent-badge--neutral' } : null,
      typeLabel ? { label: typeLabel, cls: 'rent-badge--neutral' } : null,
    ].filter(Boolean) as Array<{ label: string; cls: string }>

    return (
      <div
        key={item.id}
        className="rv17-prop"
        onClick={() => navigate(`/tenant/properties/${item.id}`)}
        style={{ cursor: 'pointer' }}
      >
        <div className="rv17-prop__img" data-photo="false">
          <svg className="rv17-prop__img-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={typeIconPath(String(item.property_type || ''))} />
          </svg>
          <span className="rent-pill rv17-prop__badge">{tag}</span>
          <button
            className="rv17-prop__fav"
            aria-label={t('tenantPropertyDetail.ariaFavorite')}
            data-active={isFav(item)}
            style={{ color: isFav(item) ? 'var(--rent-primary)' : undefined }}
            onClick={(e) => {
              e.stopPropagation()
              void toggleFavorite(item)
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav(item) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </button>
        </div>
        <div className="rv17-prop__body">
          <h3 className="rv17-prop__name">{title}</h3>
          <p className="rv17-prop__addr">{joinFacts([addr, meta])}</p>
          {tags.length > 0 && (
            <div className="rv17-prop__tags">
              {tags.map((tg) => (
                <span key={tg.label} className={`rent-badge ${tg.cls}`}>{tg.label}</span>
              ))}
            </div>
          )}
          <div className="rv17-prop__bottom">
            {price}
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
    // 缺失字段不补 0：户型段仅在有数据时出现
    const commMeta = formatRoomFacts(roomFacts(item), {
      bed: (n) => t('common.roomBed', { n }),
      bath: (n) => t('common.roomBath', { n }),
      size: (n) => t('common.roomSize', { n }),
    })
    const sub = joinFacts([commMeta, t('tenantDashboard.furnishedDelivery')])
    return (
      <button
        type="button"
        key={item.id}
        className="rv17-comm"
        onClick={() => navigate(`/tenant/properties/${item.id}`)}
        style={{ cursor: 'pointer' }}
      >
        <div className="rv17-comm__img" data-photo="false">
          <svg className="rv17-comm__img-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>
          <span className="rent-pill rv17-comm__badge">{t('tenantDashboard.forSale')}</span>
        </div>
        <div className="rv17-comm__body">
          <h3 className="rv17-comm__name">{title}</h3>
          <p className="rv17-comm__addr">{addr}</p>
          <div className="rv17-comm__price">{formatPrice(item.sale_price, item.currency)}<span className="rv17-comm__price-unit">{t('tenantDashboard.startUnit')}</span></div>
          <div className="rv17-comm__sub">{sub}</div>
        </div>
      </button>
    )
  }

  return (
    <>
      {/* ===== 城市定位 + 搜索 ===== */}
      <div className="rv17-hero">
        <div className="rv17-hero__loc" onClick={() => setLocOpen(true)} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
          <span>{cityLabel || t('browse.city')}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
        <div className="rv17-hero__search">
          <svg className="rv17-hero__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder={t('browse.searchPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleHeroSearch()
            }}
          />
          <button
            className="rv17-hero__search-btn"
            aria-label={t('common.search')}
            onClick={handleHeroSearch}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>
      </div>

      {/* ===== 双业务 Tab：租房 / 买房 ===== */}
      <div className="rv17-tabs">
        <button className="rv17-tab" data-active={biz === 'rent'} onClick={() => setBiz('rent')}>{t('browse.rent')}</button>
        <button className="rv17-tab" data-active={biz === 'buy'} onClick={() => setBiz('buy')}>{t('browse.buy')}</button>
      </div>

      {/* ===== 业主资产概览（业主独有数据块） ===== */}
      {isOwner && <OwnerAssetCard />}

      {/* ===== 搜索结果显示 ===== */}
      {keyword.trim() && (
        <div className="rv17-sec" ref={searchResultRef}>
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('common.search')}（{searchResults.length}）</h2>
            <button type="button" className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
          </div>
          <div className="rv17-rail">
            {searchQ.isError && !searchQ.data ? (
              <DataState
                error={errorText(searchQ.error, t('common.loadFailed'))}
                errorKind={errorKind(searchQ.error)}
                retryText={t('common.retry')}
                onRetry={() => searchQ.refetch()}
              />
            ) : (
              <>
                {searchResults.map((it) => renderPropCard(it, biz))}
                {searchResults.length === 0 && !searchQ.isPending && <div className="rent-empty">{t('common.noData')}</div>}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== 主题模块：精选房源（租房） ===== */}
      {!keyword.trim() && biz === 'rent' && !homeBlocked && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('browse.featured')}</h2>
            <button type="button" className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
          </div>
          <div className="rv17-rail">
            {featuredItems.map((it) => renderPropCard(it, 'rent'))}
            {featuredItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 主题模块：新上房源（租房） ===== */}
      {!keyword.trim() && biz === 'rent' && !homeBlocked && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('browse.newArrivals')}</h2>
            <button type="button" className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
          </div>
          <div className="rv17-rail">
            {newItems.map((it) => renderPropCard(it, 'rent'))}
            {newItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 主题模块：买房推荐楼盘（买房） ===== */}
      {!keyword.trim() && biz === 'buy' && !homeBlocked && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('tenantDashboard.buyRecommend')}</h2>
            <button type="button" className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('tenantDashboard.inSaleUnit')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
          </div>
          <div className="rv17-rail">
            {commItems.map((it) => renderCommCard(it))}
            {commItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* ===== 主题模块：热门二手房（买房） ===== */}
      {!keyword.trim() && biz === 'buy' && !homeBlocked && (
        <div className="rv17-sec">
          <div className="rv17-sec__head">
            <h2 className="rv17-sec__title">{t('tenantDashboard.hotResaleOrders')}</h2>
            <button type="button" className="rv17-sec__more" onClick={() => navigate('/tenant/listings')}>{t('browse.more')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
          </div>
          <div className="rv17-rail">
            {saleItems.slice(0, 3).map((it) => renderPropCard(it, 'buy'))}
            {saleItems.length === 0 && <div className="rent-empty">{t('common.noData')}</div>}
          </div>
        </div>
      )}

      {/* 推荐流统一五态：加载 / 失败（含无权限、服务异常）/ 空，失败时可重试 */}
      {homeQ.isError && !homeQ.data ? (
        <DataState
          error={errorText(homeQ.error, t('common.loadFailed'))}
          errorKind={errorKind(homeQ.error)}
          retryText={t('common.retry')}
          onRetry={() => homeQ.refetch()}
        />
      ) : loading ? (
        <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
      ) : null}

      {/* ===== 最近动态 ===== */}
      <section className="rent-section">
        <div className="rent-card rent-todo-feed">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('tenantRemind.recentNews')}</h3>
            <button type="button" className="rent-section__link" onClick={() => navigate('/tenant/maintenance')}>{t('tenantRemind.allRecords')}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
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

      <LocationPicker visible={locOpen} onClose={() => setLocOpen(false)} />
    </>
  )
}

export default TenantDashboard
